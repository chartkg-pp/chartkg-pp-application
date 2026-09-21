import type { Citation, Evidence, GraphData, QATurn, SummaryData } from './types'
import { demoAsset } from './shared/assetUrl'
import { loadManifest, type GraphRagManifestEntry } from './shared/manifest'

export type TestCaseId = `chart_${string}`

export interface TestAnalysisResult {
  graph: GraphData
  summary: SummaryData
  evidence: Evidence[]
  suggestedQuestions: string[]
}

async function manifestEntry(id: TestCaseId): Promise<GraphRagManifestEntry> {
  const entry = (await loadManifest()).graphrag.find((item) => item.id === id)
  if (!entry) throw new Error(`Unknown test case: ${id}`)
  return entry
}

async function loadAsset<T>(path: string): Promise<T> {
  const url = demoAsset(path)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load ${url}`)
  return response.json() as Promise<T>
}

async function loadSuggestedQuestions(entry: GraphRagManifestEntry): Promise<string[]> {
  if (!entry.qa) return []
  const payload = await loadAsset<{ examples?: Array<{ question?: string; suggested?: boolean }> }>(entry.qa)
  return (payload.examples ?? [])
    .filter((example) => example.suggested !== false && typeof example.question === 'string')
    .map((example) => example.question!)
}

export async function detectTestCase(file: File): Promise<TestCaseId | null> {
  const manifest = await loadManifest()
  const fileNameMatch = manifest.graphrag.find((item) => item.filename.toLowerCase() === file.name.toLowerCase())
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const hashMatch = manifest.graphrag.find((item) => item.sha256 === hash)
    return (hashMatch?.id ?? fileNameMatch?.id ?? null) as TestCaseId | null
  } catch {
    return (fileNameMatch?.id ?? null) as TestCaseId | null
  }
}

export async function loadTestAnalysis(id: TestCaseId): Promise<TestAnalysisResult> {
  const entry = await manifestEntry(id)
  const [graph, rawSummary, citations, rawEvidence, suggestedQuestions] = await Promise.all([
    loadAsset<GraphData>(entry.graph),
    loadAsset<Omit<SummaryData, 'citations'>>(entry.summary),
    loadAsset<Record<string, Citation>>(entry.citations),
    loadAsset<Record<string, Evidence> | Evidence[]>(entry.evidence),
    loadSuggestedQuestions(entry),
  ])
  const evidence = Array.isArray(rawEvidence) ? rawEvidence : Object.values(rawEvidence)
  return {
    graph,
    summary: { ...rawSummary, citations },
    evidence,
    suggestedQuestions,
  }
}

export async function answerTestQuestion(id: TestCaseId, question: string): Promise<QATurn> {
  // The static demo deliberately replays only captured QA turns. Keep a safe
  // abstention here for callers that submit a question outside that snapshot.
  return {
    id: `turn_${Date.now()}`,
    question,
    answer: 'This chart only includes the bundled question-and-answer examples.',
    citationIds: [],
    createdAt: Date.now(),
    status: 'abstained',
  }
}

export function isTestCaseId(value: string): value is TestCaseId {
  return /^chart_[a-z0-9]+$/i.test(value)
}
