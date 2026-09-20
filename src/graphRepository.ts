import { storedExampleAnswer } from './qaExamples'
import { answerTestQuestion, detectTestCase, isTestCaseId, loadTestAnalysis } from './testData'
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

export const unsupportedImageMessage = 'This static demo supports the two bundled ChartKG++ test images only.'

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

/**
 * Replay a stored GraphRAG answer. Questions the original project already answered are served
 * from the exported snapshot; any other question falls back to the project's deterministic
 * extractive answerer over the same knowledge graph. No model provider is contacted.
 */
export async function askStoredQuestion(
  question: string,
  chartId: string,
  handlers: QAStreamHandlers,
  signal?: AbortSignal,
): Promise<QATurn> {
  if (!isTestCaseId(chartId)) throw new Error(unsupportedImageMessage)
  const phases: Array<{ id: string; active: string; done: string }> = [
    { id: 'linking-entities', active: 'Linking entities', done: 'Linked entities to graph nodes' },
    { id: 'retrieving-paths', active: 'Retrieving graph paths', done: 'Retrieved graph paths' },
    { id: 'grounding-citations', active: 'Grounding citations', done: 'Grounded citations in the knowledge graph' },
    { id: 'composing-answer', active: 'Composing answer', done: 'Composed the grounded answer' },
  ]
  for (const phase of phases.slice(0, 3)) {
    handlers.onPhase({ id: phase.id, label: phase.active, status: 'active' })
    await wait(240, signal)
    ensureNotAborted(signal)
    handlers.onPhase({ id: phase.id, label: phase.done, status: 'done' })
  }

  const stored = await storedExampleAnswer(chartId, question)
  const turn = stored ?? await answerTestQuestion(chartId, question)
  ensureNotAborted(signal)

  const composing = phases[3]
  handlers.onPhase({ id: composing.id, label: composing.active, status: 'active' })
  if (turn.answer) {
    for (let offset = 0; offset < turn.answer.length; offset += 12) {
      ensureNotAborted(signal)
      handlers.onDelta(turn.answer.slice(offset, offset + 12))
      await wait(24, signal)
    }
  }
  handlers.onPhase({ id: composing.id, label: composing.done, status: 'done' })
  return turn
}
