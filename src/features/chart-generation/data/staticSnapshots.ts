import { demoAsset } from '../../../shared/assetUrl'
import type {
  ChartContext,
  ExtractionReport,
  GenerationListItem,
  GenerationRequest,
  GenerationResponse,
  InspectResponse,
  JobSnapshot,
  SampleInfo,
} from '../types/chartkg'

type StaticSourceId = 'gapminder' | 'case2'
type StaticPipeline = 'agentic' | 'native'

interface StaticMode {
  generationId: string
  image: string
  context: string
  code?: string
  option?: string
  assessment?: string
  report: string
  width: number
  height: number
  qualityScore?: number
}

interface StaticSource {
  id: StaticSourceId
  title: string
  shortTitle?: string
  filename: string
  source: string
  modes: Record<StaticPipeline, StaticMode>
}

interface StaticManifest { pa: StaticSource[] }
interface StaticJob { sourceId: StaticSourceId; pipeline: StaticPipeline; startedAt: number }

let manifestPromise: Promise<StaticManifest> | null = null
const jobs = new Map<string, StaticJob>()

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(demoAsset(path))
  if (!response.ok) throw new Error(`Static asset could not be loaded: ${path}`)
  return response.json() as Promise<T>
}

async function fetchText(path: string): Promise<string> {
  const response = await fetch(demoAsset(path))
  if (!response.ok) throw new Error(`Static asset could not be loaded: ${path}`)
  return response.text()
}

async function manifest(): Promise<StaticManifest> {
  manifestPromise ??= fetchJson<StaticManifest>('manifest.json')
  return manifestPromise
}

async function sourceById(id: string): Promise<StaticSource> {
  const source = (await manifest()).pa.find((item) => item.id === id)
  if (!source) throw new Error(`Unknown static source: ${id}`)
  return source
}

function sourceIdFromFilename(filename: string): StaticSourceId {
  return filename.toLowerCase().endsWith('.json') || filename.toLowerCase().includes('case2') ? 'case2' : 'gapminder'
}

function datasetId(sourceId: StaticSourceId): string {
  return `static-${sourceId}`
}

function sourceIdFromDataset(value?: string): StaticSourceId {
  return value?.includes('case2') ? 'case2' : 'gapminder'
}

export async function mockInspect(fileName: string): Promise<InspectResponse> {
  const sourceId = sourceIdFromFilename(fileName)
  const source = await sourceById(sourceId)
  const mode = source.modes.native
  const [context, report] = await Promise.all([
    fetchJson<ChartContext>(mode.context),
    fetchJson<{ extraction?: ExtractionReport }>(mode.report),
  ])
  const markCount = context.views.reduce((total, view) => total + view.mark_groups.reduce((sum, group) => sum + group.records.length, 0), 0)
  const fallback: ExtractionReport = {
    contract_ref: 'static-snapshot',
    source_run_id: mode.generationId,
    entity_count: context.variables.length + context.views.length + 1,
    relation_count: 0,
    mark_count: markCount,
    assigned_mark_count: markCount,
    unassigned_marks: [],
    unresolved_variable_value_refs: [],
    group_coverage: {},
    derived_ternary_record_count: 0,
  }
  return {
    datasetId: datasetId(sourceId),
    filename: source.filename,
    valid: true,
    context,
    extraction: report.extraction ?? fallback,
    warnings: ['Static snapshot: generation settings are read-only.'],
  }
}

export async function mockCreateGeneration(request: GenerationRequest): Promise<{ jobId: string }> {
  const sourceId = sourceIdFromDataset(request.datasetId)
  const pipeline = request.pipeline ?? 'agentic'
  const source = await sourceById(sourceId)
  const jobId = source.modes[pipeline].generationId
  jobs.set(jobId, { sourceId, pipeline, startedAt: Date.now() })
  return { jobId }
}

export async function mockGetJob(jobId: string): Promise<JobSnapshot> {
  const existing = jobs.get(jobId)
  if (!existing) {
    const source = (await manifest()).pa.find((item) => Object.values(item.modes).some((mode) => mode.generationId === jobId))
    if (!source) throw new Error('Static generation snapshot not found')
    const pipeline = source.modes.agentic.generationId === jobId ? 'agentic' : 'native'
    jobs.set(jobId, { sourceId: source.id, pipeline, startedAt: Date.now() - 2_000 })
  }
  const active = jobs.get(jobId)!
  const elapsed = Date.now() - active.startedAt
  const completed = elapsed >= 900
  return {
    id: jobId,
    status: completed ? 'completed' : elapsed >= 450 ? 'rendering' : 'context_built',
    progress: completed ? 100 : elapsed >= 450 ? 82 : 40,
    message: completed ? 'Pre-generated result loaded' : 'Loading static generation snapshot',
    createdAt: new Date(active.startedAt).toISOString(),
    updatedAt: new Date().toISOString(),
    datasetId: datasetId(active.sourceId),
    pipeline: active.pipeline,
  }
}

export async function mockGetGeneration(jobId: string): Promise<GenerationResponse> {
  const source = (await manifest()).pa.find((item) => Object.values(item.modes).some((mode) => mode.generationId === jobId))
  if (!source) throw new Error('Static generation snapshot not found')
  const pipeline: StaticPipeline = source.modes.agentic.generationId === jobId ? 'agentic' : 'native'
  const mode = source.modes[pipeline]
  const [report, option, code] = await Promise.all([
    fetchJson<Record<string, unknown>>(mode.report),
    mode.option ? fetchJson<Record<string, unknown>>(mode.option) : Promise.resolve(null),
    mode.code ? fetchText(mode.code) : Promise.resolve(undefined),
  ])
  return {
    id: jobId,
    datasetId: datasetId(source.id),
    status: 'completed',
    pipeline,
    option,
    code,
    width: mode.width,
    height: mode.height,
    qualityScore: mode.qualityScore ?? null,
    outputRelativeDir: `demo-data/pa/${source.id}/${pipeline}`,
    artifacts: {
      png: demoAsset(mode.image),
      context: demoAsset(mode.context),
      code: mode.code ? demoAsset(mode.code) : undefined,
      option: mode.option ? demoAsset(mode.option) : undefined,
      visual_assessment: mode.assessment ? demoAsset(mode.assessment) : undefined,
      report: demoAsset(mode.report),
    },
    report,
  }
}

export async function mockListSamples(): Promise<SampleInfo[]> {
  return (await manifest()).pa.map((source) => ({
    id: source.id,
    name: source.title,
    filename: source.filename,
    available: true,
  }))
}

export async function mockGetSample(sampleId: string): Promise<File> {
  const source = await sourceById(sampleId)
  const response = await fetch(demoAsset(source.source))
  if (!response.ok) throw new Error('Static source could not be loaded')
  return new File([await response.blob()], source.filename, {
    type: source.filename.endsWith('.csv') ? 'text/csv' : 'application/json',
  })
}

export async function mockListGenerations(): Promise<GenerationListItem[]> {
  const items: GenerationListItem[] = []
  for (const source of (await manifest()).pa) {
    for (const pipeline of ['agentic', 'native'] as const) {
      const mode = source.modes[pipeline]
      items.push({
        id: mode.generationId,
        datasetId: datasetId(source.id),
        filename: `${source.shortTitle ?? source.title} · ${pipeline === 'agentic' ? 'Agentic' : 'Native'}`,
        status: 'completed',
        progress: 100,
        message: 'Pre-generated static result',
        createdAt: '2026-09-19T08:00:00.000Z',
        updatedAt: '2026-09-19T08:00:00.000Z',
        pipeline,
        qualityScore: mode.qualityScore ?? null,
      })
    }
  }
  return items
}
