import { storedExampleAnswer, storedExampleVisionAnswer } from './qaExamples'
import { detectTestCase, isTestCaseId, loadTestAnalysis } from './testData'
import type { Evidence, GraphData, QATurn, SummaryData } from './types'

export interface QAStreamPhase {
  id: string
  label: string
  status: 'active' | 'done'
}

export interface QAStreamHandlers {
  onPhase: (phase: QAStreamPhase) => void
  onDelta: (text: string) => void
}

export const unsupportedImageMessage = 'This static demo supports the bundled ChartKG++ test images only.'

export interface StaticAnalysisResult {
  runId: string
  graph: GraphData
  summary: SummaryData
  evidence: Evidence[]
  suggestedQuestions: string[]
}

function abortError() {
  return new DOMException('The request was cancelled', 'AbortError')
}

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError()
}

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(abortError()); return }
  const timer = window.setTimeout(() => {
    signal?.removeEventListener('abort', onAbort)
    resolve()
  }, ms)
  const onAbort = () => {
    window.clearTimeout(timer)
    reject(abortError())
  }
  signal?.addEventListener('abort', onAbort, { once: true })
})

/**
 * Match an uploaded image against the bundled fixtures by SHA-256. The static site never
 * extracts a knowledge graph from an arbitrary image, so an unknown image is rejected here.
 */
export async function matchBundledImage(file: File, signal?: AbortSignal): Promise<{ chartId: string; imageUrl: string; name: string }> {
  const testCaseId = await detectTestCase(file)
  await wait(420, signal)
  if (!testCaseId) throw new Error(unsupportedImageMessage)
  return { chartId: testCaseId, imageUrl: '', name: file.name }
}

/** Load the knowledge graph, summary, and evidence regions bundled for a fixed case. */
export async function loadStaticAnalysis(chartId: string, signal?: AbortSignal): Promise<StaticAnalysisResult> {
  if (!isTestCaseId(chartId)) throw new Error(unsupportedImageMessage)
  await wait(700, signal)
  const result = await loadTestAnalysis(chartId)
  return { runId: `static_run_${chartId}`, ...result }
}

/** Both answers the original project produced for one question. */
export interface StaticAnswerPair {
  /** Graph-grounded answer with citations and a retrieval trace. */
  graphrag: QATurn | null
  /** Direct model answer from the image alone; absent when the project has no snapshot. */
  vision: QATurn | null
}

/**
 * Replay a stored answer pair. Questions the original project already answered are served from
 * the exported snapshot. No model provider is contacted and no answer is synthesized for a
 * question that is absent from the snapshot.
 */
export async function askStoredQuestion(
  question: string,
  chartId: string,
  handlers: QAStreamHandlers,
  signal?: AbortSignal,
): Promise<StaticAnswerPair> {
  if (!isTestCaseId(chartId)) throw new Error(unsupportedImageMessage)
  const phases: Array<{ id: string; active: string; done: string }> = [
    { id: 'linking-entities', active: 'Linking entities', done: 'Linked entities to graph nodes' },
    { id: 'retrieving-paths', active: 'Retrieving graph paths', done: 'Retrieved graph paths' },
    { id: 'grounding-citations', active: 'Grounding citations', done: 'Grounded citations in the knowledge graph' },
    { id: 'composing-answer', active: 'Composing answer', done: 'Composed the grounded answer' },
  ]
  const [stored, vision] = await Promise.all([
    storedExampleAnswer(chartId, question),
    storedExampleVisionAnswer(chartId, question),
  ])
  const graphrag = stored
  ensureNotAborted(signal)

  if (graphrag) {
    for (const phase of phases.slice(0, 3)) {
      handlers.onPhase({ id: phase.id, label: phase.active, status: 'active' })
      await wait(240, signal)
      ensureNotAborted(signal)
      handlers.onPhase({ id: phase.id, label: phase.done, status: 'done' })
    }
  }

  const composing = phases[3]
  if (graphrag) handlers.onPhase({ id: composing.id, label: composing.active, status: 'active' })
  if (graphrag?.answer) {
    for (let offset = 0; offset < graphrag.answer.length; offset += 12) {
      ensureNotAborted(signal)
      handlers.onDelta(graphrag.answer.slice(offset, offset + 12))
      await wait(24, signal)
    }
  }
  if (graphrag) handlers.onPhase({ id: composing.id, label: composing.done, status: 'done' })
  return { graphrag, vision }
}
