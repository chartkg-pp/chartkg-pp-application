<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { nextTick, reactive, ref, watch } from 'vue'
import type { ConversationTurn, QAMode, QAAnswer } from '../types'

const props = defineProps<{
  turns: ConversationTurn[]
  loading: boolean
  selectedCitationId: string | null
  graphReady: boolean
  visionReady: boolean
  focusedTurnId: string | null
  suggestions: string[]
  staticDemo?: boolean
}>()
const emit = defineEmits<{
  ask: [question: string]
  cite: [id: string]
  'answer-mode': [turnId: string, mode: QAMode]
}>()

const question = ref('')
const chatScroll = ref<HTMLElement | null>(null)
const collapsedProcesses = reactive(new Set<string>())
const selectedModes = reactive<Record<string, QAMode>>({})
const ready = () => props.graphReady && (props.staticDemo || props.visionReady)

function selectedMode(turn: ConversationTurn): QAMode {
  return selectedModes[turn.id] ?? 'graphrag'
}

function answerFor(turn: ConversationTurn): QAAnswer {
  return turn.answers[selectedMode(turn)]
}

function selectAnswer(turn: ConversationTurn, mode: QAMode) {
  selectedModes[turn.id] = mode
  emit('answer-mode', turn.id, mode)
}

function submit() {
  if (props.staticDemo) return
  const value = question.value.trim()
  if (!value || !ready() || props.loading) return
  emit('ask', value)
  question.value = ''
}

function askExample(value: string) {
  if (!value || !ready() || props.loading) return
  emit('ask', value)
}

function toggleProcess(turnId: string, mode: QAMode) {
  const key = `${turnId}:${mode}`
  if (collapsedProcesses.has(key)) collapsedProcesses.delete(key)
  else collapsedProcesses.add(key)
}

function renderMarkdown(answer: QAAnswer, mode: QAMode) {
  const source = mode === 'graphrag'
    ? answer.answer.replace(/\[(G\d+)\]/g, '[$1](#citation-$1)')
    : answer.answer
  const rendered = marked.parse(source, { gfm: true, breaks: true, async: false }) as string
  const clean = DOMPurify.sanitize(rendered)
  return clean.replace(/<a href="#citation-(G\d+)">([^<]*)<\/a>/g, (_match, id: string, label: string) => {
    const active = id === props.selectedCitationId ? ' active' : ''
    return `<a href="#citation-${id}" class="citation markdown-citation${active}" data-citation="${id}">${label}</a>`
  })
}

function onMarkdownClick(event: MouseEvent) {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-citation]')
  const citationId = link?.dataset.citation
  if (!citationId) return
  event.preventDefault()
  emit('cite', citationId)
}

function statusLabel(answer: QAAnswer, mode: QAMode) {
  if (answer.status === 'streaming') return 'Generating'
  if (answer.status === 'abstained') return 'No grounded answer'
  if (answer.status === 'answered' && mode === 'vision') return 'Ready'
  if (answer.status === 'verified') return 'Grounded'
  if (answer.status === 'failed') return 'Failed'
  return 'Waiting'
}

function retrievalLabel(answer: QAAnswer) {
  const trace = answer.retrieval
  if (!trace) return 'KG grounded'
  return trace.strategy === 'graph-global'
    ? `Global search · ${trace.communityIds.length} communities · ${trace.expandedEntityIds.length} nodes`
    : `Local search · ${trace.paths.length} paths · ${trace.expandedEntityIds.length} nodes`
}

function scrollToTurn(turnId: string) {
  nextTick(() => {
    const node = chatScroll.value?.querySelector<HTMLElement>(`[data-turn-id="${turnId}"]`)
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

watch(
  () => props.turns.map((turn) => `${turn.id}:${turn.answers.graphrag.answer.length}:${turn.answers.vision.answer.length}:${turn.answers.graphrag.process?.length ?? 0}:${turn.answers.vision.process?.length ?? 0}`).join('|'),
  async () => {
    const latestTurn = props.turns[props.turns.length - 1]
    if (props.focusedTurnId && latestTurn && props.focusedTurnId !== latestTurn.id) return
    await nextTick()
    if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight
  },
)

watch(() => props.focusedTurnId, (id) => { if (id) scrollToTurn(id) })
</script>

<template>
  <section class="panel qa-panel">
    <div class="panel-heading qa-heading">
      <h2>Chart QA</h2>
      <span class="qa-dual-badge"><i></i> {{ staticDemo ? 'STATIC DEMO · KG grounded' : 'GraphRAG default · Vision available' }}</span>
    </div>

    <div class="qa-readiness" aria-label="Dual answer readiness">
      <span :class="{ ready: graphReady }"><i></i> GraphRAG {{ graphReady ? 'ready' : 'run analysis' }}</span>
      <span :class="{ ready: visionReady }"><i></i> Vision {{ visionReady ? 'ready' : 'select image' }}</span>
    </div>

    <div class="chat-view">
      <div ref="chatScroll" class="chat-scroll" :aria-busy="loading">
        <div v-if="!props.turns.length" class="chat-empty">
          <div class="chat-orbit">◎</div>
          <h3>{{ staticDemo ? 'Explore previous GraphRAG examples' : 'Ask both engines at once' }}</h3>
          <p>{{ staticDemo ? 'Select a question used by the original ChartKG++GraphRAG project to replay its graph-grounded answer.' : 'Every question is answered by GraphRAG and Vision LLM. GraphRAG is shown first; switch at the bottom of a response to compare.' }}</p>
          <div v-if="!staticDemo" class="suggestions"><button v-for="item in suggestions" :key="item" :disabled="!ready()" @click="question = item, submit()">{{ item }}</button></div>
        </div>
        <div v-for="turn in props.turns" :key="turn.id" class="turn" :class="{ focused: turn.id === focusedTurnId }" :data-turn-id="turn.id">
          <div class="question-bubble">{{ turn.question }}</div>
          <div class="answer-block" :class="{ streaming: answerFor(turn).status === 'streaming', abstained: answerFor(turn).status === 'abstained', vision: selectedMode(turn) === 'vision' }">
            <div class="answer-label">
              <span class="answer-dot" :class="{ streaming: answerFor(turn).status === 'streaming', vision: selectedMode(turn) === 'vision' }"></span>
              {{ selectedMode(turn) === 'vision' ? 'Direct visual answer' : 'Graph-grounded answer' }} · {{ statusLabel(answerFor(turn), selectedMode(turn)) }}
            </div>
            <div v-if="answerFor(turn).process?.length" class="answer-process" aria-label="Visible answer process">
              <div class="process-heading">
                <span>{{ selectedMode(turn) === 'vision' ? 'Vision process' : 'GraphRAG process' }}</span>
                <button type="button" :aria-expanded="!collapsedProcesses.has(`${turn.id}:${selectedMode(turn)}`)" @click="toggleProcess(turn.id, selectedMode(turn))">
                  {{ collapsedProcesses.has(`${turn.id}:${selectedMode(turn)}`) ? 'Show' : 'Hide' }}
                  <svg viewBox="0 0 16 16" :class="{ collapsed: collapsedProcesses.has(`${turn.id}:${selectedMode(turn)}`) }"><path d="m4 6 4 4 4-4" /></svg>
                </button>
              </div>
              <div v-if="!collapsedProcesses.has(`${turn.id}:${selectedMode(turn)}`)" class="process-steps">
                <div v-for="step in answerFor(turn).process" :key="step.id" class="process-step" :class="step.status">
                  <span class="process-marker">{{ step.status === 'done' ? '✓' : step.status === 'error' ? '!' : '' }}</span>
                  <span>{{ step.label }}</span>
                </div>
              </div>
            </div>
            <div v-if="answerFor(turn).answer" class="answer-markdown" @click="selectedMode(turn) === 'graphrag' ? onMarkdownClick($event) : undefined" v-html="renderMarkdown(answerFor(turn), selectedMode(turn))"></div>
            <div v-else-if="answerFor(turn).status === 'streaming'" class="answer-waiting">Waiting for the first response token…</div>
            <span v-if="answerFor(turn).status === 'streaming' && answerFor(turn).answer" class="stream-cursor" aria-hidden="true"></span>
            <div v-if="answerFor(turn).status === 'verified'" class="answer-foot"><span>{{ retrievalLabel(answerFor(turn)) }}</span></div>
            <div v-else-if="answerFor(turn).status === 'answered'" class="answer-foot vision-foot"><span>Image-grounded response</span><code>{{ answerFor(turn).model || 'vision model' }}</code><span>No KG citations</span></div>
            <div v-else-if="answerFor(turn).error" class="answer-error">{{ answerFor(turn).error }}</div>
            <div class="answer-switcher" aria-label="Choose answer engine">
              <button v-for="mode in (['graphrag', 'vision'] as QAMode[])" :key="mode" :class="{ active: selectedMode(turn) === mode, failed: turn.answers[mode].status === 'failed' }" @click="selectAnswer(turn, mode)">
                <i :class="mode"></i><span>{{ mode === 'graphrag' ? 'GraphRAG' : 'Vision LLM' }}</span><small>{{ statusLabel(turn.answers[mode], mode) }}</small>
              </button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="staticDemo" class="static-question-picker">
        <span class="picker-label">Example questions from the original project</span>
        <div class="suggestions">
          <button v-for="item in suggestions" :key="item" :disabled="!ready() || loading" @click="askExample(item)">{{ item }}</button>
        </div>
      </div>
      <form class="question-form" @submit.prevent="submit">
        <input v-model="question" :disabled="staticDemo || !ready() || loading" :placeholder="staticDemo ? 'Live question input is unavailable in this static demo.' : 'Ask one question to both engines…'" aria-label="Ask a question about the chart" />
        <button class="send-button" type="submit" :disabled="staticDemo || !ready() || loading || !question.trim()">↑</button>
      </form>
      <div v-if="staticDemo" class="qa-note static-backend-note">
        <strong>Cloud backend status</strong>
        <span>The cloud backend is currently being provisioned. This static site provides previously generated GraphRAG question-answer examples from the original ChartKG++GraphRAG project.</span>
        <span>Select an example question above to inspect its grounded answer, knowledge-graph citations, retrieval paths, and visual evidence.</span>
      </div>
      <div v-else class="qa-note">Each question runs GraphRAG retrieval and direct visual understanding in parallel.</div>
    </div>
  </section>
</template>
