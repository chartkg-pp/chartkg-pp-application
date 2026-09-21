/**
 * Validate every asset published under public/demo-data before a build.
 *
 * The site has no backend, so this script is the only gate that can prove the bundled
 * snapshots are complete, internally consistent, and free of secrets or machine-specific
 * paths. It fails the build (npm run build runs it first) when anything is off.
 */
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve('public/demo-data')
const errors = []

function check(condition, message) {
  if (!condition) errors.push(message)
}

async function exists(path) {
  try {
    return (await stat(resolve(root, path))).isFile()
  } catch {
    return false
  }
}

async function text(path) {
  try {
    return await readFile(resolve(root, path), 'utf8')
  } catch (error) {
    errors.push(`${path}: ${error.message}`)
    return ''
  }
}

async function json(path) {
  const raw = await text(path)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    errors.push(`${path}: ${error.message}`)
    return null
  }
}

async function pngSize(path) {
  const buffer = await readFile(resolve(root, path))
  const isPng = buffer.slice(1, 4).toString('latin1') === 'PNG'
  if (!isPng) return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), sha256: createHash('sha256').update(buffer).digest('hex') }
}

const manifest = await json('manifest.json')
if (!manifest) {
  console.error('- manifest.json is missing or unparsable')
  process.exit(1)
}

/* ---------------------------------------------------------------- GraphRAG */

check(Array.isArray(manifest.graphrag) && manifest.graphrag.length > 0, 'manifest.graphrag must describe at least one bundled case')
check(new Set((manifest.graphrag ?? []).map((chart) => chart.id)).size === (manifest.graphrag ?? []).length, 'manifest.graphrag contains duplicate case IDs')
if (manifest.evidenceRegions) check(await exists(manifest.evidenceRegions), `Missing evidence region catalog: ${manifest.evidenceRegions}`)

for (const chart of manifest.graphrag) {
  for (const path of [chart.image, chart.graph, chart.summary, chart.citations, chart.evidence, chart.qa].filter(Boolean)) {
    if (!await exists(path)) errors.push(`Missing GraphRAG asset: ${path}`)
  }

  const size = await pngSize(chart.image)
  check(Boolean(size), `${chart.image}: expected a PNG image`)
  if (size) {
    check(
      size.width === chart.width && size.height === chart.height,
      `${chart.image}: manifest says ${chart.width}×${chart.height} but the file is ${size.width}×${size.height}`,
    )
    check(size.sha256 === chart.sha256, `${chart.image}: SHA-256 mismatch`)
  }

  const graph = await json(chart.graph)
  check(Boolean(graph?.nodes?.length), `${chart.graph}: graph must contain nodes`)
  check(Boolean(graph?.edges?.length), `${chart.graph}: graph must contain edges`)
  const nodeIds = new Set((graph?.nodes ?? []).map((node) => String(node.id)))
  for (const edge of graph?.edges ?? []) {
    check(nodeIds.has(String(edge.source)), `${chart.graph}: edge source ${edge.source} is not a visible node`)
    check(nodeIds.has(String(edge.target)), `${chart.graph}: edge target ${edge.target} is not a visible node`)
  }

  const summary = await json(chart.summary)
  const citations = await json(chart.citations)
  const evidence = await json(chart.evidence)
  check(summary?.revisionId === graph?.revisionId, `${chart.summary}: revisionId does not match the graph`)
  check(typeof summary?.coverage === 'number', `${chart.summary}: coverage is missing`)
  check(Array.isArray(summary?.sentences) && summary.sentences.length > 0, `${chart.summary}: summary sentences are missing`)
  check(Object.keys(citations ?? {}).length > 0, `${chart.citations}: citations are missing`)
  check(Object.keys(evidence ?? {}).length > 0, `${chart.evidence}: evidence is missing`)

  const qa = chart.qa ? await json(chart.qa) : null
  const examples = qa?.examples ?? []
  const shown = examples.filter((example) => example.suggested !== false)
  if (chart.qa) {
    check(shown.length > 0, `${chart.qa}: at least one example question must be offered`)
    check(qa?.revisionId === graph?.revisionId, `${chart.qa}: revisionId does not match the graph`)
  }

  for (const example of examples) {
    const label = `${chart.qa ?? chart.id} · ${example.question}`
    const turn = example.turn
    const vision = example.visionTurn
    if (!example.question || (!turn?.answer && !vision?.answer)) errors.push(`${label}: missing question or answer`)
    if (!example.origin) errors.push(`${label}: missing provenance for the question`)
    if (turn?.status === 'verified') {
      check(turn.citationIds?.length > 0, `${label}: a grounded answer must cite the knowledge graph`)
      for (const citationId of turn.citationIds ?? []) {
        check(/^G\d+$/.test(citationId), `${label}: citation ${citationId} is not a graph citation`)
      }
    }
    if (turn?.status === 'abstained') {
      check(turn.citationIds?.length === 0, `${label}: a refusal must not cite evidence`)
    }
    const retrieval = turn?.retrieval
    if (retrieval) {
      check(['graph-local', 'graph-global'].includes(retrieval.strategy), `${label}: unknown retrieval strategy`)
      check(retrieval.maxHops >= 1, `${label}: retrieval must record at least one hop`)
    }

    if (vision) {
      check(vision.status === 'answered', `${label}: the model-direct answer must be an answered turn`)
      check(vision.generationMode === 'vision', `${label}: the model-direct answer must record its mode`)
      check(Boolean(vision.model), `${label}: the model-direct answer must record the model that produced it`)
      check(vision.citationIds?.length === 0, `${label}: a model-direct answer must not carry graph citations`)
    }
  }
}

/* ---------------------------------------------------------------------- PA */

const expectedIds = new Set([
  '971e482de71b45b69bbb33046b890962',
  '58528121e7d1427cbb7e697970e87213',
])

for (const source of manifest.pa) {
  if (!await exists(source.source)) errors.push(`Missing PA source: ${source.source}`)
  for (const pipeline of ['agentic', 'native']) {
    const mode = source.modes?.[pipeline]
    if (!mode) {
      errors.push(`${source.id}: manifest is missing the ${pipeline} snapshot`)
      continue
    }
    expectedIds.delete(mode.generationId)
    const optional = [mode.preview, mode.code, mode.option, mode.assessment].filter(Boolean)
    for (const path of [mode.image, mode.context, mode.report, ...optional]) {
      if (!await exists(path)) errors.push(`Missing PA ${pipeline} asset: ${path}`)
    }

    if (mode.evaluation) {
      for (const path of [mode.evaluation.kg, mode.evaluation.nodes, mode.evaluation.relations]) {
        if (!await exists(path)) errors.push(`Missing PA ${pipeline} evaluation asset: ${path}`)
      }
      const evaluationKg = await json(mode.evaluation.kg)
      check(Array.isArray(evaluationKg?.entities) && evaluationKg.entities.length > 0, `${mode.evaluation.kg}: evaluation KG entities are missing`)
      check(Array.isArray(evaluationKg?.relations) && evaluationKg.relations.length > 0, `${mode.evaluation.kg}: evaluation KG triples are missing`)
      const nodesCsv = await text(mode.evaluation.nodes)
      const relationsCsv = await text(mode.evaluation.relations)
      check(/^node_type,.*all_models_sum/m.test(nodesCsv), `${mode.evaluation.nodes}: node statistics header is missing`)
      check(/^layer,.*all_models_sum/m.test(relationsCsv), `${mode.evaluation.relations}: relation statistics header is missing`)
      check(/^TOTAL,.*\d+/m.test(nodesCsv), `${mode.evaluation.nodes}: node TOTAL is missing`)
      check(/^TOTAL,.*\d+/m.test(relationsCsv), `${mode.evaluation.relations}: relation TOTAL is missing`)
    }

    const size = await pngSize(mode.image)
    check(Boolean(size), `${mode.image}: expected a PNG image`)
    if (size) {
      check(size.sha256 === mode.sha256, `${mode.image}: SHA-256 mismatch`)
      check(
        size.width === mode.width && size.height === mode.height,
        `${mode.image}: manifest says ${mode.width}×${mode.height} but the file is ${size.width}×${size.height}`,
      )
    }

    if (pipeline === 'native') {
      const option = await json(mode.option)
      check(Array.isArray(option?.series) && option.series.length > 0, `${mode.option}: ECharts option must contain series`)
    } else {
      const code = await text(mode.code)
      check(code.trim().length > 0, `${mode.code}: Agentic snapshots must publish the generated code`)
      check(typeof mode.qualityScore === 'number', `${source.id}: Agentic snapshot must record its quality score`)
    }
  }
}

if (expectedIds.size) errors.push(`Manifest is missing generation IDs: ${[...expectedIds].join(', ')}`)

/* ------------------------------------------------------- secrets and paths */

const published = ['manifest.json', manifest.evidenceRegions].filter(Boolean)
for (const chart of manifest.graphrag) published.push(...[chart.graph, chart.summary, chart.citations, chart.evidence, chart.qa].filter(Boolean))
for (const source of manifest.pa) {
  published.push(source.source)
  for (const mode of Object.values(source.modes ?? {})) {
    published.push(...[mode.context, mode.report, mode.option, mode.code, mode.assessment].filter(Boolean))
    if (mode.evaluation) published.push(mode.evaluation.kg, mode.evaluation.nodes, mode.evaluation.relations)
  }
}

/** Patterns that must never reach a public artifact: local paths, credentials, run leftovers. */
const forbidden = [
  // A drive letter must stand alone: "chartkg://..." is a URN scheme, not a Windows path.
  { pattern: /(?<![A-Za-z0-9_-])[A-Za-z]:[\\/]/, label: 'a Windows absolute path' },
  { pattern: /(?:^|[\\/])Users[\\/][^\\/\s]+/, label: 'a user home directory' },
  { pattern: /\b(?:api[_-]?key|apikey|authorization|bearer|access[_-]?token|secret[_-]?key)\b\s*[:=]/i, label: 'a credential' },
  { pattern: /\bsk-[A-Za-z0-9]{16,}/, label: 'an API key' },
  { pattern: /output_dir|output_relative_dir/, label: 'a server output directory' },
  { pattern: /\.runtime|\.sqlite3?/, label: 'a runtime database reference' },
  { pattern: /model[_-]?response|search-results\.json|execution\.iteration/, label: 'a raw model response or iteration file' },
  { pattern: /\b(?:https?:\/\/|localhost|127\.0\.0\.1|::1)\b/, label: 'a network endpoint' },
  { pattern: /\.env\b/, label: 'an environment file reference' },
]

for (const path of published) {
  const body = await text(path)
  for (const { pattern, label } of forbidden) {
    if (pattern.test(body)) errors.push(`${path}: contains ${label}`)
  }
}

/* ------------------------------------------------------------------- result */

if (errors.length) {
  errors.forEach((error) => console.error(`- ${error}`))
  console.error(`\nStatic data validation failed with ${errors.length} problem(s).`)
  process.exit(1)
}

console.log(
  `Static data validated: ${manifest.graphrag.length} GraphRAG cases with QA snapshots and ${manifest.pa.length * 2} PA snapshots.`,
)
