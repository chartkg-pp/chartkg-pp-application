<script setup lang="ts">
import type { ConversationTurn, QAMode } from '../types'

const props = defineProps<{
  turns: ConversationTurn[]
  focusedTurnId: string | null
}>()
const emit = defineEmits<{ select: [id: string] }>()

function modeLabel(mode: QAMode) {
  return mode === 'graphrag' ? 'GraphRAG' : 'Vision'
}

function answerStatus(turn: ConversationTurn, mode: QAMode) {
  return turn.answers[mode].status
}

function answerPreview(turn: ConversationTurn) {
  const answer = turn.answers.graphrag.answer || turn.answers.vision.answer
  return answer.replace(/\s+/g, ' ').trim()
}
</script>

<template>
  <section class="panel history-panel">
    <div class="panel-heading history-heading">
      <h2>Conversation History</h2>
      <span class="tiny-badge">{{ props.turns.length }}</span>
    </div>
    <div v-if="!props.turns.length" class="panel-empty history-empty">Questions asked for this chart will appear here.</div>
    <div v-else class="conversation-history-list">
      <button v-for="turn in props.turns" :key="turn.id" class="conversation-history-row" :class="{ focused: turn.id === props.focusedTurnId }" @click="emit('select', turn.id)">
        <span class="history-row-top">
          <span class="history-status-pair" aria-label="Answer status">
            <i v-for="mode in (['graphrag', 'vision'] as QAMode[])" :key="mode" :class="[mode, answerStatus(turn, mode)]" :title="`${modeLabel(mode)}: ${answerStatus(turn, mode)}`"></i>
          </span>
          <small>{{ new Date(turn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</small>
        </span>
        <strong>{{ turn.question }}</strong>
        <span v-if="answerPreview(turn)" class="history-preview">{{ answerPreview(turn) }}</span>
        <span class="history-modes"><span>GraphRAG</span><span>Vision</span></span>
      </button>
    </div>
  </section>
</template>
