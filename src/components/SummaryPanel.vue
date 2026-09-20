<script setup lang="ts">
import type { SummaryData } from '../types'
import { semanticLayers, semanticLayerOrder } from '../semanticLayers'

defineProps<{ summary: SummaryData | null; selectedCitationId: string | null }>()
const emit = defineEmits<{ cite: [id: string] }>()

function displayText(text: string) {
  return text.replace(/\s*\[G\d+\]/g, '').trim()
}

function traceSentence(sentence: SummaryData['sentences'][number]) {
  const citationId = sentence.citations[0]
  if (citationId) emit('cite', citationId)
}
</script>

<template>
  <section class="panel summary-panel">
    <div class="panel-heading">
      <h2>Summary</h2>
      <span v-if="summary" class="coverage-badge">{{ Math.round(summary.coverage * 100) }}% cited</span>
    </div>
    <div v-if="!summary" class="panel-empty">Run an analysis to generate a summary grounded in the supplied graph.</div>
    <div v-else class="summary-content">
      <div class="semantic-legend" aria-label="Summary semantic layers">
        <span v-for="layer in semanticLayerOrder" :key="layer" class="semantic-legend-item" :style="{ '--layer-color': semanticLayers[layer].color, '--layer-text': semanticLayers[layer].textColor }">
          <i></i>{{ semanticLayers[layer].label }}
        </span>
      </div>
      <p class="layered-summary">
        <template v-for="(sentence, index) in summary.sentences" :key="sentence.id">
          <span
            class="semantic-sentence"
            :class="{ unavailable: sentence.status === 'unavailable', selected: sentence.citations.includes(selectedCitationId ?? '') }"
            :style="{ '--layer-color': semanticLayers[sentence.layer].color, '--layer-text': semanticLayers[sentence.layer].textColor }"
            :title="sentence.citations.length ? `Click to trace ${semanticLayers[sentence.layer].label} in the source image` : `${semanticLayers[sentence.layer].label} is unavailable`"
            :role="sentence.citations.length ? 'button' : undefined"
            :tabindex="sentence.citations.length ? 0 : -1"
            @click="traceSentence(sentence)"
            @keydown.enter.prevent="traceSentence(sentence)"
            @keydown.space.prevent="traceSentence(sentence)"
          >
            <span class="semantic-sentence-label">{{ sentence.layer }}</span>
            <span>{{ displayText(sentence.text) }}</span>
          </span><span v-if="index < summary.sentences.length - 1" class="summary-space"> </span>
        </template>
      </p>
      <div class="revision-line"><span class="verified-icon">✓</span> <span v-if="summary.coverage === 1">Every sentence is bound to KG claims</span><span v-else>Grounded sentences are bound to KG claims; unavailable layers are marked</span> in <code>{{ summary.revisionId }}</code></div>
    </div>
  </section>
</template>
