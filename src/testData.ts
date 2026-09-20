import type { Citation, Evidence, GraphData, KGEdge, KGNode, LayerId, QATurn, SummaryData } from './types'
import { buildVisualProvenance, type EvidenceRegionCatalog } from './provenance'
import { demoAsset } from './shared/assetUrl'
import { loadManifest, type GraphRagManifestEntry } from './shared/manifest'

export type TestCaseId = 'case2-opinionseer' | 'countries-health-wealth'

interface RawEntity {
  id: string
  type: string
  properties?: Record<string, unknown>
}

interface RawRelation {
  type: string
  source: string
  target: string
  properties?: Record<string, unknown>
}

interface ReadableKG {
  metadata: {
    ontology_ref: string
    verification_status: string
    run_status: string
    source_sha256: string
    revision_ref: string
  }
  entities: RawEntity[]
  relations: RawRelation[]
}

interface FixtureDefinition {
  id: TestCaseId
  sourceHash: string
  fileNames: string[]
}

interface KnowledgeRecord {
  id: string
  kind: string
  label: string
  text: string
  answerText: string
  entityIds: string[]
  claimIds: string[]
  graphPath: string[]
}

interface CachedAnalysis {
  result: TestAnalysisResult
  records: KnowledgeRecord[]
  citationByRecord: Map<string, string>
}

export interface TestAnalysisResult {
  graph: GraphData
  summary: SummaryData
  evidence: Evidence[]
  suggestedQuestions: string[]
}

const definitions: FixtureDefinition[] = [
  {
    id: 'case2-opinionseer',
    sourceHash: '1c7aeb55a145759648e2bf3edf29f3995f9eb7479548596f5111c57c0cd191ef',
    fileNames: ['case2_final.png'],
  },
  {
    id: 'countries-health-wealth',
    sourceHash: '7f79d2b5e877f8d79ff6b171f1cbc6699fc760dafad81c6dc933ce6a5c0d6bc9',
    fileNames: ['countries_health_wealth_2025.png'],
  },
]

const definitionById = new Map(definitions.map((item) => [item.id, item]))
const readableKgCache = new Map<TestCaseId, Promise<ReadableKG>>()
const evidenceCatalogCache: { current?: Promise<EvidenceRegionCatalog> } = {}
const analysisCache = new Map<TestCaseId, Promise<CachedAnalysis>>()

const layerByType: Record<string, LayerId> = {
  Complex_Chart: 'S1',
  View: 'S1',
  Graphical_Mark_Group: 'S1',
  Graphical_Mark: 'S1',
  Visual_Attribute: 'S1',
  Visual_Attribute_Value: 'S1',
  Data_Variable: 'S2',
  Variable_Value: 'S2',
  Data_Item: 'S2',
  Basic_Analytical_Scope: 'S3',
  Basic_Pattern: 'S3',
  Relational_Pattern: 'S3',
  Insight: 'S4',
}

const layerLimits: Record<LayerId, number> = { S1: 12, S2: 12, S3: 14, S4: 9 }
const typePriority: Record<string, number> = {
  Complex_Chart: 90,
  View: 88,
  Graphical_Mark_Group: 86,
  Data_Variable: 84,
  Relational_Pattern: 82,
  Basic_Pattern: 80,
  Basic_Analytical_Scope: 78,
  Insight: 76,
  Visual_Attribute: 70,
  Visual_Attribute_Value: 68,
  Variable_Value: 65,
  Graphical_Mark: 60,
}

const recordPriority: Record<string, number> = {
  Insight: 100,
  Relational_Pattern: 90,
  Basic_Pattern: 80,
  Data_Variable: 60,
  Variable_Value: 55,
  View: 50,
  Basic_Analytical_Scope: 45,
  Graphical_Mark_Group: 40,
  Visual_Attribute: 35,
  Visual_Attribute_Value: 30,
  Complex_Chart: 25,
}

const stopWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'chart', 'does', 'for', 'from', 'graph', 'how',
  'in', 'is', 'it', 'of', 'on', 'show', 'the', 'to', 'what', 'which', 'with', '中', '什么', '图', '图表',
  '如何', '是', '的',
])

const queryAliases: Record<string, string> = {
  收入: 'income', 寿命: 'lifespan', 人口: 'population', 地区: 'region', 国家: 'country',
  相关: 'correlation relationship', 关系: 'relationship correlation', 最高: 'highest maximum',
  最大: 'maximum highest', 最低: 'lowest minimum', 最小: 'minimum lowest', 分布: 'distribution',
  趋势: 'trend correlation', 女性: 'female', 男性: 'male', 观点: 'opinion', 不确定: 'uncertainty',
  负面: 'negative', 正面: 'positive', 视图: 'view', 编码: 'encode visual attribute',
  related: 'relationship correlation association', relationship: 'correlation association',
  highest: 'maximum', lowest: 'minimum',
}

function entityClaim(id: string) {
  return `entity:${id}`
}

function edgeClaim(relation: RawRelation) {
  return `relation:${relation.type}:${relation.source}:${relation.target}`
}

function compactValue(value: unknown, limit = 260): string {
  if (typeof value === 'string') return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value)
  const serialized = JSON.stringify(value) ?? String(value)
  return serialized.length <= limit ? serialized : `${serialized.slice(0, limit - 1)}…`
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

function entityLabel(entity: RawEntity): string {
  const props = entity.properties ?? {}
  if (typeof props.name === 'string') return props.name
  if (entity.type === 'Variable_Value' && props.value != null) return humanize(String(props.value))
  if (entity.type === 'View' && typeof props.chartType === 'string') return humanize(props.chartType)
  if ((entity.type === 'Basic_Pattern' || entity.type === 'Relational_Pattern') && typeof props.patternType === 'string') {
    return typeof props.subtype === 'string' ? `${humanize(props.patternType)}: ${humanize(props.subtype)}` : humanize(props.patternType)
  }
  if (entity.type === 'Insight') return humanize(entity.id.replace(/^insight_/, ''))
  return humanize(entity.id)
}

function propertyText(properties: Record<string, unknown>) {
  return Object.entries(properties)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${humanize(key)}: ${compactValue(value)}`)
    .join('; ')
}

function tokens(value: string) {
  let expanded = value.toLowerCase().replace(/_/g, ' ')
  Object.entries(queryAliases).forEach(([source, target]) => {
    if (expanded.includes(source)) expanded += ` ${target}`
  })
  return (expanded.match(/[a-z0-9_.%+-]+|[\u4e00-\u9fff]/gi) ?? [])
    .filter((token) => token.length > 1 && !stopWords.has(token))
    .map((token) => token.endsWith('s') && token.length > 4 && !token.endsWith('ss') ? token.slice(0, -1) : token)
}

function buildKnowledgeRecords(raw: ReadableKG): KnowledgeRecord[] {
  const byId = new Map(raw.entities.map((entity) => [entity.id, entity]))
  const labels = new Map(raw.entities.map((entity) => [entity.id, entityLabel(entity)]))
  const connected = new Map<string, RawRelation[]>()
  raw.relations.forEach((relation) => {
    connected.set(relation.source, [...(connected.get(relation.source) ?? []), relation])
    connected.set(relation.target, [...(connected.get(relation.target) ?? []), relation])
  })

  return raw.entities
    .filter((entity) => entity.type !== 'Graphical_Mark' || Object.keys(entity.properties ?? {}).length > 0)
    .map((entity) => {
      const props = entity.properties ?? {}
      const label = labels.get(entity.id) ?? humanize(entity.id)
      const relations = (connected.get(entity.id) ?? []).slice(0, 20)
      const entityIds = [entity.id]
      const claimIds = [entityClaim(entity.id)]
      let graphPath = [label]
      const relationText = relations.map((relation, index) => {
        const otherId = relation.source === entity.id ? relation.target : relation.source
        const otherLabel = labels.get(otherId) ?? humanize(otherId)
        const direction = relation.source === entity.id ? 'to' : 'from'
        entityIds.push(otherId)
        claimIds.push(edgeClaim(relation))
        if (index === 0) graphPath = [labels.get(relation.source) ?? humanize(relation.source), relation.type, labels.get(relation.target) ?? humanize(relation.target)]
        return `${relation.type} ${direction} ${otherLabel}${relation.properties ? ` (${propertyText(relation.properties)})` : ''}`
      })
      const propsText = propertyText(props)
      let answerText = typeof props.statement === 'string' ? props.statement : typeof props.description === 'string' ? props.description : ''
      if (!answerText) answerText = `${label} (${humanize(entity.type)})${propsText ? `: ${propsText}.` : relationText[0] ? ` is connected by ${relationText[0]}.` : '.'}`
      return {
        id: `entity:${entity.id}`,
        kind: entity.type,
        label,
        text: [`${label} [${entity.type}]`, propsText, relationText.length ? `Relations: ${relationText.join('; ')}` : ''].filter(Boolean).join('. '),
        answerText,
        entityIds: [...new Set(entityIds)],
        claimIds: [...new Set(claimIds)],
        graphPath,
      }
    })
    .sort((left, right) => (recordPriority[right.kind] ?? 0) - (recordPriority[left.kind] ?? 0) || left.id.localeCompare(right.id))
}

function retrieveRecords(records: KnowledgeRecord[], question: string, limit = 12) {
  const queryTokens = tokens(question)
  if (!queryTokens.length) return []
  return records
    .map((record) => {
      const labelTokens = tokens(record.label)
      const textTokens = tokens(record.text)
      let score = 0
      queryTokens.forEach((token) => {
        score += labelTokens.filter((value) => value === token).length * 5
        score += textTokens.filter((value) => value === token).length * 1.5
        if (record.id.toLowerCase().includes(token)) score += 3
      })
      const matchedTokens = queryTokens.filter((token) => labelTokens.includes(token) || textTokens.includes(token)).length
      score += matchedTokens / Math.max(1, queryTokens.length) * 8
      score *= 1 + (recordPriority[record.kind] ?? 0) / 100
      return { record, score }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || (recordPriority[right.record.kind] ?? 0) - (recordPriority[left.record.kind] ?? 0))
    .slice(0, limit)
    .map((item) => item.record)
}

function selectSummaryRecords(records: KnowledgeRecord[]) {
  return (['S1', 'S2', 'S3', 'S4'] as LayerId[]).map((layer) => {
    const candidates = records.filter((record) => layerByType[record.kind] === layer && record.answerText.length >= 12).slice(0, 40)
    const selectedTokens = new Set<string>()
    let selected: KnowledgeRecord | null = null
    let bestScore = -Infinity
    for (const candidate of candidates) {
      const candidateTokens = new Set(tokens(candidate.answerText))
      const novelCount = [...candidateTokens].filter((token) => !selectedTokens.has(token)).length
      const score = novelCount / Math.max(1, candidateTokens.size) * 4 + Math.min(candidate.answerText.length, 500) / 500 + (recordPriority[candidate.kind] ?? 0) / 1000
      if (score > bestScore) { bestScore = score; selected = candidate }
    }
    return { layer, record: selected }
  })
}

function entityDetails(entity: RawEntity): Record<string, string> {
  const details: Record<string, string> = { sourceType: entity.type }
  Object.entries(entity.properties ?? {}).slice(0, 7).forEach(([key, value]) => {
    details[key] = compactValue(value, 180)
  })
  return details
}

function projectGraph(raw: ReadableKG, focusIds: Set<string>): GraphData {
  const selected = new Set<string>()
  const byLayer = new Map<LayerId, RawEntity[]>()
  raw.entities.forEach((entity) => {
    const layer = layerByType[entity.type]
    if (!layer) return
    byLayer.set(layer, [...(byLayer.get(layer) ?? []), entity])
  })
  ;(['S1', 'S2', 'S3', 'S4'] as LayerId[]).forEach((layer) => {
    const entries = byLayer.get(layer) ?? []
    entries.sort((left, right) => {
      const leftScore = (focusIds.has(left.id) ? 1000 : 0) + (typePriority[left.type] ?? 0)
      const rightScore = (focusIds.has(right.id) ? 1000 : 0) + (typePriority[right.type] ?? 0)
      return rightScore - leftScore || left.id.localeCompare(right.id, 'en', { numeric: true })
    })
    entries.slice(0, layerLimits[layer]).forEach((entity) => selected.add(entity.id))
  })

  const nodes: KGNode[] = raw.entities.filter((entity) => selected.has(entity.id)).map((entity) => ({
    id: entity.id,
    label: entityLabel(entity),
    type: entity.type,
    layer: layerByType[entity.type],
    details: entityDetails(entity),
    claimIds: [entityClaim(entity.id)],
  }))
  const edges: KGEdge[] = raw.relations.filter((relation) => selected.has(relation.source) && selected.has(relation.target)).map((relation, index) => ({
    id: `edge_${index}_${relation.type}`,
    source: relation.source,
    target: relation.target,
    relation: relation.type,
    claimIds: [edgeClaim(relation), entityClaim(relation.source), entityClaim(relation.target)],
  }))
  return {
    revisionId: raw.metadata.revision_ref,
    ontologyRef: raw.metadata.ontology_ref,
    nodes,
    edges,
    stats: {
      sourceNodeCount: raw.entities.length,
      sourceEdgeCount: raw.relations.length,
      visibleNodeCount: nodes.length,
      visibleEdgeCount: edges.length,
      verificationStatus: raw.metadata.verification_status,
      runStatus: raw.metadata.run_status,
    },
  }
}

async function manifestEntry(id: TestCaseId): Promise<GraphRagManifestEntry> {
  const entry = (await loadManifest()).graphrag.find((item) => item.id === id)
  if (!entry) throw new Error(`Unknown test case: ${id}`)
  return entry
}

async function loadReadableKg(definition: FixtureDefinition): Promise<ReadableKG> {
  let pending = readableKgCache.get(definition.id)
  if (!pending) {
    pending = manifestEntry(definition.id).then(async (entry) => {
      const url = demoAsset(entry.kg)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Could not load ${url}`)
      return response.json() as Promise<ReadableKG>
    })
    readableKgCache.set(definition.id, pending)
  }
  return pending
}

async function loadEvidenceCatalog(): Promise<EvidenceRegionCatalog> {
  if (!evidenceCatalogCache.current) {
    evidenceCatalogCache.current = loadManifest().then(async (manifest) => {
      const url = demoAsset(manifest.evidenceRegions)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Could not load ${url}`)
      return response.json() as Promise<EvidenceRegionCatalog>
    })
  }
  return evidenceCatalogCache.current
}

/**
 * Citation ids used by the example questions the site offers. Their entities are kept inside the
 * visible subgraph so that following a [G#] citation always highlights a node, not just a
 * summary sentence and an image region.
 */
async function loadExampleCitationIds(id: TestCaseId): Promise<string[]> {
  const entry = await manifestEntry(id)
  const response = await fetch(demoAsset(entry.qa))
  if (!response.ok) return []
  const payload = await response.json() as { examples?: Array<{ suggested?: boolean; turn?: { citationIds?: string[] } }> }
  return (payload.examples ?? [])
    .filter((example) => example.suggested !== false)
    .flatMap((example) => example.turn?.citationIds ?? [])
}

async function buildAnalysis(definition: FixtureDefinition): Promise<CachedAnalysis> {
  const [raw, evidenceCatalog] = await Promise.all([loadReadableKg(definition), loadEvidenceCatalog()])
  if (raw.metadata.source_sha256 !== definition.sourceHash) throw new Error(`Test data hash mismatch for ${definition.id}`)
  const records = buildKnowledgeRecords(raw)
  const citationByRecord = new Map(records.map((record, index) => [record.id, `G${index + 1}`]))
  const citations: Record<string, Citation> = {}
  records.forEach((record) => {
    const citationId = citationByRecord.get(record.id)!
    citations[citationId] = { id: citationId, claimIds: record.claimIds, entityIds: record.entityIds, evidenceIds: [], graphPath: record.graphPath }
  })
  const summaryRecords = selectSummaryRecords(records)
  const focusIds = new Set(summaryRecords.flatMap((item) => item.record?.entityIds ?? []))
  const exampleCitationIds = await loadExampleCitationIds(definition.id)
  exampleCitationIds.forEach((citationId) => {
    (citations[citationId]?.entityIds ?? []).forEach((entityId) => focusIds.add(entityId))
  })
  const provenance = buildVisualProvenance(raw, records, citationByRecord, evidenceCatalog)
  for (const [citationId, evidenceIds] of provenance.evidenceIdsByCitation) {
    citations[citationId].evidenceIds = evidenceIds
  }
  const evidence = provenance.evidence
  const graph = projectGraph(raw, focusIds)
  const summary: SummaryData = {
    id: `summary_${definition.id}`,
    revisionId: graph.revisionId,
    coverage: summaryRecords.filter((item) => item.record).length / 4,
    sentences: summaryRecords.map((item, index) => {
      const record = item.record
      if (!record) return { id: `ss${index + 1}`, layer: item.layer, text: `No grounded ${item.layer} statement is available for this chart.`, citations: [], status: 'unavailable' as const }
      const citationId = citationByRecord.get(record.id)!
      return { id: `ss${index + 1}`, layer: item.layer, text: record.answerText.replace(/\s*\[G\d+\]/g, ''), citations: [citationId], status: 'grounded' as const }
    }),
    citations,
  }
  const suggestedQuestions = summaryRecords.filter((item) => item.record).slice(0, 3).map((item) => `What does the knowledge graph show about ${item.record!.label}?`)
  return { result: { graph, summary, evidence, suggestedQuestions }, records, citationByRecord }
}

async function getAnalysis(id: TestCaseId) {
  let pending = analysisCache.get(id)
  if (!pending) {
    const definition = definitionById.get(id)
    if (!definition) throw new Error(`Unknown test case: ${id}`)
    pending = buildAnalysis(definition)
    analysisCache.set(id, pending)
  }
  return pending
}

export async function detectTestCase(file: File): Promise<TestCaseId | null> {
  const fileNameMatch = definitions.find((item) => item.fileNames.some((name) => name.toLowerCase() === file.name.toLowerCase()))
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    return definitions.find((item) => item.sourceHash === hash)?.id ?? null
  } catch {
    return fileNameMatch?.id ?? null
  }
}

export async function loadTestAnalysis(id: TestCaseId): Promise<TestAnalysisResult> {
  return (await getAnalysis(id)).result
}

export async function answerTestQuestion(id: TestCaseId, question: string): Promise<QATurn> {
  const analysis = await getAnalysis(id)
  const retrieved = retrieveRecords(analysis.records, question)
  if (!retrieved.length) {
    return { id: `turn_${Date.now()}`, question, answer: 'The supplied knowledge graph does not contain enough matching evidence to answer this question.', citationIds: [], createdAt: Date.now(), status: 'abstained' }
  }
  let chosen = retrieved.filter((record) => record.kind === 'Insight').slice(0, 2)
  if (!chosen.length) chosen = retrieved.filter((record) => record.kind === 'Relational_Pattern' || record.kind === 'Basic_Pattern').slice(0, 2)
  if (!chosen.length) chosen = retrieved.slice(0, 2)
  const citationIds = chosen.map((record) => analysis.citationByRecord.get(record.id)!)
  const answer = `${chosen.map((record) => record.answerText).join(' ')} ${citationIds.map((citationId) => `[${citationId}]`).join(' ')}`
  return { id: `turn_${Date.now()}`, question, answer, citationIds, createdAt: Date.now(), status: 'verified' }
}

export function isTestCaseId(value: string): value is TestCaseId {
  return definitionById.has(value as TestCaseId)
}
