<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { askStoredQuestion, loadStaticAnalysis, matchBundledImage, unsupportedImageMessage } from '../graphRepository'
import type { QAStreamPhase } from '../graphRepository'
import type { ConversationTurn, Evidence, GraphData, KGNode, QAMode, QAAnswer, QATurn, RunState, SummaryData } from '../types'
import { isTestCaseId, type TestCaseId } from '../testData'
import { defaultCaseId, loadGraphRagCases, type GraphRagStaticCase } from '../staticCases'
import { storedExampleQuestions } from '../qaExamples'
import TopBar from '../components/TopBar.vue'
import EvidenceViewer from '../components/EvidenceViewer.vue'
import SummaryPanel from '../components/SummaryPanel.vue'
import QAChat from '../components/QAChat.vue'
import KGPanel from '../components/KGPanel.vue'
import ConversationHistory from '../components/ConversationHistory.vue'

const chartId = ref<TestCaseId | 'chart_pending'>(defaultCaseId)
const fileName = ref('')
const selectedFile = ref<File | null>(null)
const imageUrl = ref('')
const evidence = ref<Evidence[]>([])
const graph = ref<GraphData | null>(null)
const summary = ref<SummaryData | null>(null)
const turns = ref<ConversationTurn[]>([])
const selectedCitationId = ref<string | null>(null)
const selectedEvidenceId = ref<string | null>(null)
const selectedNode = ref<KGNode | null>(null)
const qaLoading = ref(false)
const focusedTurnId = ref<string | null>(null)
const questionSuggestions = ref<string[]>([])
const run = ref<RunState>({ status: 'idle', progress: 0, message: 'Ready' })
let cases: Record<TestCaseId, GraphRagStaticCase> | null = null
const sampleList = ref<GraphRagStaticCase[]>([])
let workspaceEpoch = 0
let analysisController: AbortController | null = null
let qaController: AbortController | null = null

type ResizeState =
  | { kind: 'left-center'; startX: number; widths: { left: number; center: number; right: number } }
  | { kind: 'center-right'; startX: number; widths: { left: number; center: number; right: number } }
  | { kind: 'left-stack'; startY: number; heights: { evidence: number; summary: number } }
  | { kind: 'center-stack'; startY: number; heights: { graph: number; summary: number } }
  | null

const workspaceRef = ref<HTMLElement | null>(null)
const splitterActive = ref<'left-center' | 'center-right' | 'left-stack' | 'center-stack' | null>(null)
const workspaceRatios = ref(loadWorkspaceRatios())
const leftStackRatio = ref(loadLeftStackRatio())
const centerStackRatio = ref(loadCenterStackRatio())
let resizeState: ResizeState = null

function cancelActiveOperations() {
  workspaceEpoch += 1
  analysisController?.abort()
  qaController?.abort()
  analysisController = null
  qaController = null
  qaLoading.value = false
}

function releasePreviewUrl() {
  if (imageUrl.value.startsWith('blob:')) URL.revokeObjectURL(imageUrl.value)
}

function loadWorkspaceRatios() {
  const fallback = { left: 24, center: 46, right: 30 }
  if (typeof window === 'undefined') return fallback
  try {
    const saved = window.localStorage.getItem('chartkg-workspace-ratios-v2')
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<typeof fallback>
      const left = Number(parsed.left); const center = Number(parsed.center); const right = Number(parsed.right)
      if ([left, center, right].every((value) => Number.isFinite(value) && value > 0)) return { left, center, right }
    }

    // Carry the former two-column width into the new three-column workspace.
    const legacySaved = window.localStorage.getItem('chartkg-panel-ratios')
    if (legacySaved) {
      const legacy = JSON.parse(legacySaved) as { left?: number; middle?: number; right?: number }
      const legacyLeft = Number(legacy.left)
      const legacyCenter = Number(legacy.middle)
      const legacyRight = Number(legacy.right)
      if ([legacyLeft, legacyCenter, legacyRight].every((value) => Number.isFinite(value) && value > 0)) return { left: legacyLeft, center: legacyCenter, right: legacyRight }
    }
  } catch { /* use defaults */ }
  return fallback
}

function loadLeftStackRatio() {
  if (typeof window === 'undefined') return 50
  const value = Number(window.localStorage.getItem('chartkg-left-stack-ratio'))
  return Number.isFinite(value) && value >= 20 && value <= 80 ? value : 50
}

function loadCenterStackRatio() {
  if (typeof window === 'undefined') return 68
  const value = Number(window.localStorage.getItem('chartkg-center-stack-ratio'))
  return Number.isFinite(value) && value >= 35 && value <= 85 ? value : 68
}

const workspaceStyle = computed(() => ({
  gridTemplateColumns: `minmax(0, ${workspaceRatios.value.left}fr) 9px minmax(0, ${workspaceRatios.value.center}fr) 9px minmax(0, ${workspaceRatios.value.right}fr)`,
}))
const leftColumnStyle = computed(() => ({ gridTemplateRows: `minmax(0, ${leftStackRatio.value}fr) 9px minmax(0, ${100 - leftStackRatio.value}fr)` }))
const centerColumnStyle = computed(() => ({ gridTemplateRows: `minmax(0, ${centerStackRatio.value}fr) 9px minmax(0, ${100 - centerStackRatio.value}fr)` }))

function persistWorkspaceRatios() {
  try {
    window.localStorage.setItem('chartkg-workspace-ratios-v2', JSON.stringify(workspaceRatios.value))
    window.localStorage.setItem('chartkg-left-stack-ratio', String(leftStackRatio.value))
    window.localStorage.setItem('chartkg-center-stack-ratio', String(centerStackRatio.value))
  } catch { /* private browsing or disabled storage */ }
}

function panelWidths() {
  const workspace = workspaceRef.value
  if (!workspace) return null
  const left = workspace.querySelector<HTMLElement>('.left-column')?.getBoundingClientRect()
  const center = workspace.querySelector<HTMLElement>('.center-column')?.getBoundingClientRect()
  const right = workspace.querySelector<HTMLElement>('.right-column')?.getBoundingClientRect()
  if (!left || !center || !right) return null
  return { left: left.width, center: center.width, right: right.width }
}

function leftStackHeights() {
  const column = workspaceRef.value?.querySelector<HTMLElement>('.left-column')
  const evidencePanel = column?.querySelector<HTMLElement>('.evidence-panel')
  const summaryPanel = column?.querySelector<HTMLElement>('.summary-panel')
  if (!evidencePanel || !summaryPanel) return null
  return { evidence: evidencePanel.getBoundingClientRect().height, summary: summaryPanel.getBoundingClientRect().height }
}

function centerStackHeights() {
  const column = workspaceRef.value?.querySelector<HTMLElement>('.center-column')
  const graphPanel = column?.querySelector<HTMLElement>('.kgc-panel')
  const summaryPanel = column?.querySelector<HTMLElement>('.summary-panel')
  if (!graphPanel || !summaryPanel) return null
  return { graph: graphPanel.getBoundingClientRect().height, summary: summaryPanel.getBoundingClientRect().height }
}

function setColumnWidths(widths: { left: number; center: number; right: number }) {
  const minLeft = 260; const minCenter = 500; const minRight = 340
  const safeLeft = Math.max(minLeft, widths.left)
  const safeCenter = Math.max(minCenter, widths.center)
  const safeRight = Math.max(minRight, widths.right)
  const total = safeLeft + safeCenter + safeRight
  workspaceRatios.value = { left: safeLeft / total * 100, center: safeCenter / total * 100, right: safeRight / total * 100 }
  persistWorkspaceRatios()
}

function beginColumnResize(side: 'left-center' | 'center-right', event: PointerEvent) {
  const widths = panelWidths()
  if (!widths) return
  event.preventDefault()
  resizeState = { kind: side, startX: event.clientX, widths }
  splitterActive.value = side
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', endResize, { once: true })
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function beginLeftStackResize(event: PointerEvent) {
  const heights = leftStackHeights()
  if (!heights) return
  event.preventDefault()
  resizeState = { kind: 'left-stack', startY: event.clientY, heights }
  splitterActive.value = 'left-stack'
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', endResize, { once: true })
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
}

function beginCenterStackResize(event: PointerEvent) {
  const heights = centerStackHeights()
  if (!heights) return
  event.preventDefault()
  resizeState = { kind: 'center-stack', startY: event.clientY, heights }
  splitterActive.value = 'center-stack'
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', endResize, { once: true })
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
}

function applyColumnDelta(side: 'left-center' | 'center-right', delta: number, initial: { left: number; center: number; right: number }) {
  if (side === 'left-center') {
    const left = Math.max(260, Math.min(initial.left + delta, initial.left + initial.center - 500))
    setColumnWidths({ left, center: initial.center - (left - initial.left), right: initial.right })
  } else {
    const center = Math.max(500, Math.min(initial.center + delta, initial.center + initial.right - 340))
    setColumnWidths({ left: initial.left, center, right: initial.right - (center - initial.center) })
  }
}

function onResizeMove(event: PointerEvent) {
  if (!resizeState) return
  if (resizeState.kind === 'left-center' || resizeState.kind === 'center-right') applyColumnDelta(resizeState.kind, event.clientX - resizeState.startX, resizeState.widths)
  else if (resizeState.kind === 'left-stack') {
    const total = resizeState.heights.evidence + resizeState.heights.summary
    const evidence = Math.max(180, Math.min(resizeState.heights.evidence + event.clientY - resizeState.startY, total - 180))
    leftStackRatio.value = evidence / total * 100
    persistWorkspaceRatios()
  } else {
    const total = resizeState.heights.graph + resizeState.heights.summary
    const graph = Math.max(240, Math.min(resizeState.heights.graph + event.clientY - resizeState.startY, total - 160))
    centerStackRatio.value = graph / total * 100
    persistWorkspaceRatios()
  }
}

function endResize() {
  resizeState = null
  splitterActive.value = null
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', endResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function nudgeColumn(side: 'left-center' | 'center-right', amount: number) {
  const widths = panelWidths()
  if (widths) applyColumnDelta(side, amount, widths)
}

function nudgeLeftStack(amount: number) {
  const heights = leftStackHeights()
  if (!heights) return
  const total = heights.evidence + heights.summary
  leftStackRatio.value = Math.max(20, Math.min(80, (heights.evidence + amount) / total * 100))
  persistWorkspaceRatios()
}

function nudgeCenterStack(amount: number) {
  const heights = centerStackHeights()
  if (!heights) return
  const total = heights.graph + heights.summary
  centerStackRatio.value = Math.max(35, Math.min(85, (heights.graph + amount) / total * 100))
  persistWorkspaceRatios()
}

function onSplitterKey(side: 'left-center' | 'center-right' | 'left-stack' | 'center-stack', event: KeyboardEvent) {
  const amount = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -24 : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 24 : 0
  if (!amount) return
  event.preventDefault()
  if (side === 'left-stack') nudgeLeftStack(amount)
  else if (side === 'center-stack') nudgeCenterStack(amount)
  else nudgeColumn(side, amount)
}

onBeforeUnmount(() => {
  endResize()
  cancelActiveOperations()
  releasePreviewUrl()
})

const selectedCitation = computed(() => summary.value?.citations[selectedCitationId.value ?? ''] ?? null)
const selectedSampleId = computed<TestCaseId | ''>(() => (
  imageUrl.value && !selectedFile.value && isTestCaseId(chartId.value) ? chartId.value : ''
))

function setEvidence(id: string) {
  selectedEvidenceId.value = id
  const item = evidence.value.find((candidate) => candidate.id === id)
  if (item) selectedCitationId.value = Object.values(summary.value?.citations ?? {}).find((citation) => citation.evidenceIds.includes(item.id))?.id ?? null
}
function selectCitation(id: string) {
  selectedCitationId.value = id
  selectedEvidenceId.value = summary.value?.citations[id]?.evidenceIds[0] ?? null
}
function selectAnswerMode(_turnId: string, mode: QAMode) {
  if (mode === 'vision') {
    selectedCitationId.value = null
    selectedEvidenceId.value = null
  }
}
function focusTurn(id: string) {
  focusedTurnId.value = id
}
function selectNode(node: KGNode | null) {
  selectedNode.value = node
  if (!node) return
  const citations = Object.values(summary.value?.citations ?? {})
  const citation = citations.find((item) => item.entityIds[0] === node.id)
    ?? citations.find((item) => item.entityIds.includes(node.id) && item.evidenceIds.length)
  if (citation) selectCitation(citation.id)
  else {
    selectedCitationId.value = null
    selectedEvidenceId.value = null
  }
}

async function ensureCases() {
  cases ??= await loadGraphRagCases()
  sampleList.value = Object.values(cases)
  return cases
}

onMounted(() => { void ensureCases() })

function chooseFile(file: File) {
  if (!file.type.startsWith('image/')) { run.value = { status: 'failed', progress: 0, message: 'Please select an image' }; return }
  if (file.size > 20 * 1024 * 1024) { run.value = { status: 'failed', progress: 0, message: 'Image exceeds 20 MB' }; return }
  cancelActiveOperations()
  releasePreviewUrl()
  imageUrl.value = URL.createObjectURL(file)
  selectedFile.value = file
  chartId.value = 'chart_pending'
  fileName.value = file.name
  evidence.value = []
  graph.value = null
  summary.value = null
  turns.value = []
  focusedTurnId.value = null
  selectedCitationId.value = null
  selectedEvidenceId.value = null
  selectedNode.value = null
  questionSuggestions.value = []
  run.value = { status: 'queued', progress: 12, message: 'Image selected' }
}

async function loadSample(id: TestCaseId = defaultCaseId) {
  const available = await ensureCases()
  const sample = available[id]
  if (!sample) return
  cancelActiveOperations()
  releasePreviewUrl()
  chartId.value = id
  imageUrl.value = sample.imageUrl
  selectedFile.value = null
  fileName.value = sample.filename
  evidence.value = []
  graph.value = null
  summary.value = null
  turns.value = []
  focusedTurnId.value = null
  selectedCitationId.value = null
  selectedEvidenceId.value = null
  selectedNode.value = null
  questionSuggestions.value = []
  run.value = { status: 'queued', progress: 12, message: 'Bundled case ready' }
}

async function startAnalysis() {
  if (!imageUrl.value) {
    run.value = { status: 'failed', progress: 0, message: 'Please select an image first' }
    return
  }
  cancelActiveOperations()
  turns.value = []
  focusedTurnId.value = null
  graph.value = null
  summary.value = null
  evidence.value = []
  questionSuggestions.value = []
  selectedCitationId.value = null
  selectedEvidenceId.value = null
  selectedNode.value = null
  const controller = new AbortController()
  analysisController = controller
  const operationEpoch = workspaceEpoch
  const fileToUpload = chartId.value === 'chart_pending' ? selectedFile.value : null
  const isStale = () => controller.signal.aborted || operationEpoch !== workspaceEpoch
  run.value = { status: 'extracting', progress: 35, message: 'Extracting chart facts' }
  try {
    let targetId = chartId.value
    if (fileToUpload) {
      const matched = await matchBundledImage(fileToUpload, controller.signal)
      if (isStale()) return
      if (!isTestCaseId(matched.chartId)) throw new Error(unsupportedImageMessage)
      targetId = matched.chartId
      chartId.value = targetId
    }
    if (!isTestCaseId(targetId)) throw new Error(unsupportedImageMessage)
    const available = await ensureCases()
    if (isStale()) return
    if (!imageUrl.value.startsWith('blob:')) imageUrl.value = available[targetId].imageUrl
    fileName.value = fileName.value || available[targetId].filename
    run.value = { status: 'validating', progress: 72, message: 'Validating candidate patches' }
    const result = await loadStaticAnalysis(targetId, controller.signal)
    if (isStale()) return
    graph.value = result.graph
    summary.value = result.summary
    evidence.value = result.evidence ?? []
    const staticQuestions = await storedExampleQuestions(targetId)
    questionSuggestions.value = staticQuestions.length ? staticQuestions : (result.suggestedQuestions ?? [])
    const sourceCount = result.graph.stats?.sourceNodeCount
    const isUnverifiedTestData = result.graph.stats?.verificationStatus === 'unverified'
    run.value = {
      status: 'ready',
      progress: 100,
      message: isUnverifiedTestData && sourceCount ? `Test KG loaded · ${sourceCount} entities` : 'Verified KG ready',
    }
  } catch (error) {
    if (isStale()) return
    run.value = { status: 'failed', progress: 0, message: error instanceof Error ? error.message : 'Analysis failed' }
  } finally {
    if (analysisController === controller) analysisController = null
  }
}

function emptyAnswer(): QAAnswer {
  return { answer: '', citationIds: [], status: 'streaming', process: [] }
}

function answerFromResult(result: QATurn, process: QAAnswer['process']): QAAnswer {
  return {
    answer: result.answer,
    citationIds: result.citationIds,
    status: result.status,
    generationMode: result.generationMode,
    model: result.model,
    process,
    retrieval: result.retrieval,
  }
}

/** The model-direct answer has no retrieval trace, so its process is a single factual step. */
function answerFromVision(result: QATurn): QAAnswer {
  return {
    answer: result.answer,
    citationIds: [],
    status: result.status,
    generationMode: result.generationMode ?? 'vision',
    model: result.model,
    process: [{ id: 'direct-image-answer', label: 'Answered directly from the image without knowledge-graph retrieval', status: 'done' }],
  }
}

function unavailableAnswer(message: string): QAAnswer {
  return { ...emptyAnswer(), status: 'failed', error: message }
}

async function submitQuestion(question: string) {
  if (!graph.value || !imageUrl.value) return
  qaController?.abort()
  const controller = new AbortController()
  qaController = controller
  const operationEpoch = workspaceEpoch
  const isStale = () => controller.signal.aborted || operationEpoch !== workspaceEpoch
  qaLoading.value = true
  const pendingId = `turn_pending_${Date.now()}`
  turns.value.push({
    id: pendingId,
    question,
    createdAt: Date.now(),
    status: 'streaming',
    answers: { graphrag: emptyAnswer(), vision: emptyAnswer() },
  })
  focusedTurnId.value = pendingId

  const updatePending = (update: (turn: ConversationTurn) => ConversationTurn) => {
    const index = turns.value.findIndex((turn) => turn.id === pendingId)
    if (index >= 0) turns.value[index] = update(turns.value[index])
  }

  const updateAnswer = (mode: QAMode, update: (answer: QAAnswer) => QAAnswer) => updatePending((turn) => ({
    ...turn,
    answers: { ...turn.answers, [mode]: update(turn.answers[mode]) },
  }))

  const onPhase = (phase: QAStreamPhase) => updateAnswer('graphrag', (answer) => {
    const process = [...(answer.process ?? [])]
    const index = process.findIndex((step) => step.id === phase.id)
    const nextStep = { ...phase }
    if (index >= 0) process[index] = nextStep
    else process.push(nextStep)
    return { ...answer, process }
  })
  const onDelta = (text: string) => updateAnswer('graphrag', (answer) => ({ ...answer, answer: answer.answer + text }))

  try {
    const pair = await askStoredQuestion(question, chartId.value, { onPhase, onDelta }, controller.signal)
    if (isStale()) return
    updatePending((pending) => ({
      ...pending,
      status: 'complete',
      answers: {
        graphrag: pair.graphrag
          ? answerFromResult(pair.graphrag, pending.answers.graphrag.process)
          : unavailableAnswer('No GraphRAG answer is bundled for this question.'),
        vision: pair.vision
          ? answerFromVision(pair.vision)
          : unavailableAnswer('No LLM answer is bundled for this question.'),
      },
      availableModes: [
        ...(pair.graphrag ? ['graphrag' as const] : []),
        ...(pair.vision ? ['vision' as const] : []),
      ],
    }))
  } catch (error) {
    if (isStale()) return
    const message = error instanceof Error ? error.message : 'The answer could not be completed. Please retry.'
    updateAnswer('graphrag', (answer) => ({
      ...answer,
      status: 'failed',
      error: message,
      process: answer.process?.map((step) => step.status === 'active' ? { ...step, status: 'error' as const } : step),
    }))
    updatePending((pending) => ({ ...pending, status: 'failed' }))
  } finally {
    if (qaController === controller) {
      qaController = null
      qaLoading.value = false
    }
  }
}

async function resetWorkspace() {
  cancelActiveOperations()
  releasePreviewUrl()
  chartId.value = defaultCaseId; graph.value = null; summary.value = null; turns.value = []; focusedTurnId.value = null; evidence.value = []; questionSuggestions.value = []; selectedCitationId.value = null; selectedEvidenceId.value = null; selectedNode.value = null; imageUrl.value = ''; selectedFile.value = null; fileName.value = ''; run.value = { status: 'idle', progress: 0, message: 'Ready' }
}

</script>

<template>
  <main class="app-shell module-graphrag">
    <TopBar
      :run="run"
      :file-name="fileName"
      :selected-sample-id="selectedSampleId"
      :samples="sampleList"
      @file="chooseFile"
      @select-sample="loadSample"
      @start="startAnalysis"
      @reset="resetWorkspace"
    />
    <div ref="workspaceRef" class="workspace" :style="workspaceStyle">
      <aside class="left-column" :style="leftColumnStyle">
        <EvidenceViewer :image-src="imageUrl" :evidence="evidence" :selected-evidence-id="selectedEvidenceId" :active-evidence-ids="selectedCitation?.evidenceIds ?? []" @select="setEvidence" />
        <div class="resize-handle resize-handle-vertical" :class="{ active: splitterActive === 'left-stack' }" role="separator" aria-label="Resize image and summary panels" aria-orientation="horizontal" tabindex="0" @pointerdown="beginLeftStackResize" @keydown="onSplitterKey('left-stack', $event)"><span></span></div>
        <ConversationHistory :turns="turns" :focused-turn-id="focusedTurnId" @select="focusTurn" />
      </aside>
      <div class="resize-handle resize-handle-horizontal" :class="{ active: splitterActive === 'left-center' }" role="separator" aria-label="Resize image and graph columns" aria-orientation="vertical" tabindex="0" @pointerdown="beginColumnResize('left-center', $event)" @keydown="onSplitterKey('left-center', $event)"><span></span></div>
      <section class="center-column" :style="centerColumnStyle">
        <KGPanel
          :graph="graph"
          :selected-citation-id="selectedCitationId"
          :selected-claim-ids="selectedCitation?.claimIds ?? []"
          :selected-node-id="selectedNode?.id ?? null"
          @node="selectNode"
        />
        <div class="resize-handle resize-handle-vertical" :class="{ active: splitterActive === 'center-stack' }" role="separator" aria-label="Resize graph and summary panels" aria-orientation="horizontal" tabindex="0" @pointerdown="beginCenterStackResize" @keydown="onSplitterKey('center-stack', $event)"><span></span></div>
        <SummaryPanel :summary="summary" :selected-citation-id="selectedCitationId" @cite="selectCitation" />
      </section>
      <div class="resize-handle resize-handle-horizontal" :class="{ active: splitterActive === 'center-right' }" role="separator" aria-label="Resize graph and question columns" aria-orientation="vertical" tabindex="0" @pointerdown="beginColumnResize('center-right', $event)" @keydown="onSplitterKey('center-right', $event)"><span></span></div>
      <section class="right-column">
        <QAChat :turns="turns" :loading="qaLoading" :selected-citation-id="selectedCitationId" :graph-ready="run.status === 'ready'" :vision-ready="run.status === 'ready' && questionSuggestions.length > 0" :qa-available="questionSuggestions.length > 0" :focused-turn-id="focusedTurnId" :suggestions="questionSuggestions" static-demo @ask="submitQuestion" @cite="selectCitation" @answer-mode="selectAnswerMode" />
      </section>
    </div>
    <div v-if="selectedCitation" class="provenance-toast"><span class="provenance-dot"></span><span><b>{{ selectedCitationId }}</b> selected · {{ selectedCitation.claimIds.length }} KG claims · {{ selectedCitation.evidenceIds.length }} evidence artifacts</span><button @click="selectedCitationId = null; selectedEvidenceId = null">×</button></div>
  </main>
</template>
