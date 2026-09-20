import type { Evidence } from './types'

interface RawEntity {
  id: string
  type: string
  properties?: Record<string, unknown>
}

interface RawRelation {
  type: string
  source: string
  target: string
}

interface ReadableGraph {
  metadata: { source_sha256: string }
  entities: RawEntity[]
  relations: RawRelation[]
}

interface StoredRegion {
  x: number
  y: number
  width: number
  height: number
  method?: string
}

interface RegionFixture {
  markRegions: Record<string, StoredRegion>
  viewRegions: Record<string, StoredRegion | null>
}

export interface EvidenceRegionCatalog {
  fixtures: Record<string, RegionFixture>
}

interface VisualRecord {
  id: string
  kind: string
  label: string
  answerText: string
}

const semanticRelations = new Set(['DERIVED_FROM', 'COMPOSED_OF', 'INFERRED_FROM', 'COMPOSED_WITH'])

function unionRegions(regions: StoredRegion[]): StoredRegion | null {
  if (!regions.length) return null
  const left = Math.min(...regions.map((region) => region.x))
  const top = Math.min(...regions.map((region) => region.y))
  const right = Math.max(...regions.map((region) => region.x + region.width))
  const bottom = Math.max(...regions.map((region) => region.y + region.height))
  const paddedLeft = Math.max(0, left - 0.45)
  const paddedTop = Math.max(0, top - 0.65)
  const paddedRight = Math.min(100, right + 0.45)
  const paddedBottom = Math.min(100, bottom + 0.65)
  return { x: paddedLeft, y: paddedTop, width: paddedRight - paddedLeft, height: paddedBottom - paddedTop }
}

export function buildVisualProvenance(
  raw: ReadableGraph,
  records: VisualRecord[],
  citationByRecord: Map<string, string>,
  catalog: EvidenceRegionCatalog,
): { evidence: Evidence[]; evidenceIdsByCitation: Map<string, string[]> } {
  const entities = new Map(raw.entities.map((entity) => [entity.id, entity]))
  const outgoing = new Map<string, RawRelation[]>()
  const incoming = new Map<string, RawRelation[]>()
  const markValueRefs = new Map<string, Set<string>>()
  for (const relation of raw.relations) {
    const relations = outgoing.get(relation.source) ?? []
    relations.push(relation)
    outgoing.set(relation.source, relations)
    const incomingRelations = incoming.get(relation.target) ?? []
    incomingRelations.push(relation)
    incoming.set(relation.target, incomingRelations)
    if (relation.type === 'VALUE_OF') {
      const values = markValueRefs.get(relation.source) ?? new Set<string>()
      values.add(relation.target)
      markValueRefs.set(relation.source, values)
    }
  }
  const fixture = catalog.fixtures[raw.metadata.source_sha256]
  const markRegions = fixture?.markRegions ?? {}
  const viewRegions = fixture?.viewRegions ?? {}
  const evidence: Evidence[] = []
  const evidenceIdsByCitation = new Map<string, string[]>()

  function semanticEntities(entityId: string) {
    const visited = new Set([entityId])
    const queue: Array<[string, number]> = [[entityId, 0]]
    while (queue.length) {
      const [current, depth] = queue.shift()!
      if (depth >= 5) continue
      const properties = entities.get(current)?.properties ?? {}
      const refs = properties.winnerPatternRefs
      if (Array.isArray(refs)) {
        for (const value of refs) {
          const target = String(value)
          if (entities.has(target) && !visited.has(target)) { visited.add(target); queue.push([target, depth + 1]) }
        }
      }
      for (const relation of outgoing.get(current) ?? []) {
        if (!semanticRelations.has(relation.type) || !entities.has(relation.target) || visited.has(relation.target)) continue
        visited.add(relation.target)
        queue.push([relation.target, depth + 1])
      }
    }
    return visited
  }

  function categoryRefs(entityId: string) {
    const categories = entities.get(entityId)?.properties?.category
    if (!Array.isArray(categories)) return new Set<string>()
    const countryRefs = new Set(categories
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && String(item.variable ?? '').toLowerCase() === 'country')
      .map((item) => String(item.valueRef ?? ''))
      .filter(Boolean))
    if (countryRefs.size) return countryRefs
    return new Set(categories
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => String(item.valueRef ?? ''))
      .filter(Boolean))
  }

  function regionsFor(record: VisualRecord): Array<{ region: StoredRegion; label: string; confidence: number }> {
    const entityId = record.id.replace(/^entity:/, '')
    const entity = entities.get(entityId)
    if (!entity) return []
    if (entity.type === 'View' && viewRegions[entityId]) return [{ region: viewRegions[entityId]!, label: 'view', confidence: 0.78 }]
    const semantic = semanticEntities(entityId)
    const supportMarks: string[] = entity.type === 'Graphical_Mark' ? [entityId] : []
    const scopes: string[] = []
    for (const semanticId of semantic) {
      const item = entities.get(semanticId)
      const refs = item?.properties?.supportMemberRefs
      if (Array.isArray(refs)) for (const value of refs) if (entities.has(String(value)) && !supportMarks.includes(String(value))) supportMarks.push(String(value))
      if (item?.type === 'Basic_Analytical_Scope' && !scopes.includes(semanticId)) scopes.push(semanticId)
      for (const relation of outgoing.get(semanticId) ?? []) {
        if (relation.type === 'HAS_SCOPE' && entities.has(relation.target) && !scopes.includes(relation.target)) scopes.push(relation.target)
      }
    }
    const upstream = [entityId]
    const visitedUpstream = new Set([entityId])
    while (upstream.length) {
      const current = upstream.shift()!
      for (const relation of incoming.get(current) ?? []) {
        const source = relation.source
        if (visitedUpstream.has(source) || !entities.has(source)) continue
        visitedUpstream.add(source)
        const sourceType = entities.get(source)?.type
        if (sourceType === 'Graphical_Mark') {
          if (!supportMarks.includes(source)) supportMarks.push(source)
        } else if (sourceType === 'Graphical_Mark_Group') {
          for (const child of outgoing.get(source) ?? []) {
            if (child.type !== 'HAS_MEMBER' || entities.get(child.target)?.type !== 'Graphical_Mark') continue
            if (!supportMarks.includes(child.target)) supportMarks.push(child.target)
          }
        } else if (['Graphical_Mark_Group', 'Visual_Attribute', 'Visual_Attribute_Value', 'Data_Variable', 'Variable_Value', 'Data_Item'].includes(sourceType ?? '')) {
          upstream.push(source)
        }
      }
    }
    const categories = categoryRefs(entityId)
    const scopeMarks: string[] = []
    for (const scopeId of scopes) {
      for (const relation of outgoing.get(scopeId) ?? []) {
        if (relation.type !== 'CONTAINS' || entities.get(relation.target)?.type !== 'Graphical_Mark') continue
        if (categories.size && ![...(markValueRefs.get(relation.target) ?? [])].some((value) => categories.has(value))) continue
        if (!scopeMarks.includes(relation.target)) scopeMarks.push(relation.target)
      }
    }
    const marks = supportMarks.length ? supportMarks : scopeMarks
    const resolved = marks.filter((markId) => markRegions[markId]).map((markId) => ({ markId, region: markRegions[markId] }))
    if (resolved.length && resolved.length <= 4) return resolved.map(({ markId, region }) => ({ region, label: markId, confidence: region.method === 'mask_bbox' ? 0.96 : 0.88 }))
    if (resolved.length) {
      const groups = new Map<string, StoredRegion[]>()
      for (const { markId, region } of resolved) {
        const group = markId.startsWith('bar_') ? 'bar scope' : 'point scope'
        groups.set(group, [...(groups.get(group) ?? []), region])
      }
      return [...groups.entries()].flatMap(([label, regions]) => { const region = unionRegions(regions); return region ? [{ region, label, confidence: 0.84 }] : [] })
    }
    const upstreamViews = new Set<string>()
    const viewQueue = [entityId]
    const visitedViews = new Set([entityId])
    while (viewQueue.length) {
      const current = viewQueue.shift()!
      for (const relation of incoming.get(current) ?? []) {
        if (visitedViews.has(relation.source) || !entities.has(relation.source)) continue
        visitedViews.add(relation.source)
        const sourceEntity = entities.get(relation.source)!
        if (sourceEntity.type === 'View') upstreamViews.add(relation.source)
        else if (['Graphical_Mark_Group', 'Visual_Attribute', 'Visual_Attribute_Value', 'Data_Variable', 'Variable_Value', 'Data_Item'].includes(sourceEntity.type)) viewQueue.push(relation.source)
      }
    }
    return [...new Set([...semanticEntities(entityId), ...upstreamViews])].flatMap((semanticId) => {
      const viewRef = entities.get(semanticId)?.properties?.viewRef
      const region = viewRef ? viewRegions[String(viewRef)] : null
      return region ? [{ region, label: String(viewRef), confidence: 0.72 }] : []
    })
  }

  for (const record of records) {
    if (!entities.has(record.id.replace(/^entity:/, ''))) continue
    const citationId = citationByRecord.get(record.id)
    if (!citationId) continue
    const ids: string[] = []
    regionsFor(record).forEach(({ region, label, confidence }, index) => {
      const evidenceId = `ev_${citationId.toLowerCase()}_${index + 1}`
      ids.push(evidenceId)
      evidence.push({ id: evidenceId, label: `${record.label} · ${label}`, kind: 'image-region', confidence, detail: `${record.answerText} Visual support resolved through KG provenance to ${label}.`, region })
    })
    evidenceIdsByCitation.set(citationId, ids)
  }
  return { evidence, evidenceIdsByCitation }
}
