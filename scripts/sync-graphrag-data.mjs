/**
 * Publish the raw GraphRAG snapshots in data/charts/ as browser-readable static assets.
 *
 * The QA session index is the source of truth for visible questions. This is
 * intentional: a turn file can remain on disk after its GraphRAG answer has
 * been removed from the session index and must not reappear in the demo.
 */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const dataRoot = resolve('data')
const sourceRoot = resolve(dataRoot, 'charts')
const publicRoot = resolve('public/demo-data')
const outputRoot = resolve(publicRoot, 'graphrag')
const datasetSource = resolve('dataset.zip')

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function imageInfo(buffer) {
  if (buffer.slice(1, 4).toString('latin1') !== 'PNG') throw new Error('GraphRAG source image must be a PNG')
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    sha256: createHash('sha256').update(buffer).digest('hex'),
  }
}

function dateValue(value) {
  if (typeof value === 'number') return value
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : Date.now()
}

async function findRevisionDirectory(chartRoot, currentRevisionId) {
  const revisionsIndex = await readJson(resolve(chartRoot, 'revisions/index.json'))
  const revision = revisionsIndex.revisions?.find((item) => item.id === currentRevisionId) ?? revisionsIndex.revisions?.[0]
  if (!revision?.path) throw new Error(`${chartRoot} has no revision entry`)
  return resolve(chartRoot, 'revisions', dirname(revision.path))
}

async function readVisibleExamples(chartRoot, currentRevisionId) {
  try {
    const qaIndex = await readJson(resolve(chartRoot, 'qa/index.json'))
    const session = qaIndex.sessions?.find((item) => item.revisionId === currentRevisionId) ?? qaIndex.sessions?.[0]
    if (!session) return null
    const turnsIndex = await readJson(resolve(chartRoot, 'qa/sessions', session.id, 'turns.json'))
    const examples = []
    for (const listedTurn of turnsIndex.turns ?? []) {
      const turn = await readJson(resolve(chartRoot, 'qa/sessions', session.id, listedTurn.detailPath))
      const answers = turn.answers ?? {}
      const example = {
        id: turn.id,
        question: turn.question,
        origin: 'qa-session',
        suggested: true,
        createdAt: dateValue(turn.createdAt ?? listedTurn.createdAt),
      }
      if (answers.graphrag) example.turn = answers.graphrag
      if (answers.vision) example.visionTurn = answers.vision
      if (example.turn || example.visionTurn) examples.push(example)
    }
    return {
      caseId: qaIndex.chartId,
      sourceProject: 'ChartKG++GraphRAG',
      revisionId: session.revisionId,
      examples,
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

const titles = {
  'countries_health_wealth_2025.png': 'Countries · Health and Wealth',
  'waffe chart.png': 'Waffe Chart',
  'donutchart.png': 'Donut Chart',
  'case2_final.png': 'Case2 · OpinionSeer',
  'bar4.png': 'Bar4',
  'group4037.png': 'Group4037',
  'global_app_market.png': 'Global App Market',
}

const dataManifest = await readJson(resolve(dataRoot, 'manifest.json'))
const chartsIndex = await readJson(resolve(dataRoot, dataManifest.chartsIndex ?? 'charts/index.json'))
const chartEntries = [...(chartsIndex.charts ?? [])].sort((left, right) => String(left.id).localeCompare(String(right.id)))

if (!chartEntries.length) {
  console.log('No data/charts entries found; keeping existing public GraphRAG assets.')
  process.exit(0)
}

await copyFile(datasetSource, resolve('public/dataset.zip'))

const currentManifest = await readJson(resolve(publicRoot, 'manifest.json'))
const graphrag = []

for (const chartEntry of chartEntries) {
  const id = chartEntry.id
  const chartRoot = resolve(sourceRoot, id)
  const chart = await readJson(resolve(chartRoot, 'chart.json'))
  const currentRevisionId = chart.currentRevisionId ?? chartEntry.currentRevisionId
  const revisionRoot = await findRevisionDirectory(chartRoot, currentRevisionId)
  const image = await readFile(resolve(chartRoot, 'assets/source.png'))
  const dimensions = imageInfo(image)
  const destination = resolve(outputRoot, id)
  await mkdir(destination, { recursive: true })
  await writeFile(resolve(destination, 'image.png'), image)

  for (const name of ['graph', 'summary', 'citations', 'evidence']) {
    await copyFile(resolve(revisionRoot, `${name}.json`), resolve(destination, `${name}.json`))
  }

  const qa = await readVisibleExamples(chartRoot, currentRevisionId)
  let qaPath
  if (qa?.examples?.length) {
    qaPath = `graphrag/${id}/qa.json`
    await writeJson(resolve(publicRoot, qaPath), qa)
  }

  graphrag.push({
    id,
    title: titles[chart.name] ?? chart.name.replace(/\.[^.]+$/, ''),
    filename: chart.name,
    image: `graphrag/${id}/image.png`,
    graph: `graphrag/${id}/graph.json`,
    summary: `graphrag/${id}/summary.json`,
    citations: `graphrag/${id}/citations.json`,
    evidence: `graphrag/${id}/evidence.json`,
    ...(qaPath ? { qa: qaPath } : {}),
    width: dimensions.width,
    height: dimensions.height,
    sha256: dimensions.sha256,
  })
}

await writeJson(resolve(publicRoot, 'manifest.json'), {
  ...currentManifest,
  graphrag,
})

console.log(`Published ${graphrag.length} GraphRAG snapshots from data/charts/.`)
