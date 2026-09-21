<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceStore } from '../stores/workspace'

const store = useWorkspaceStore()
const sourceName = computed(() => store.sourceFile?.name || 'No file selected')

async function chooseSample(sampleId: string) {
  await store.loadSample(sampleId)
}

async function inspect() {
  await store.inspectSource()
}

async function generate() {
  await store.startGeneration(store.settings)
}
</script>

<template>
  <section class="panel source-panel">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">SOURCE</span>
        <h2>Input Data</h2>
      </div>
      <span class="step-badge">01</span>
    </div>

    <div class="upload-box static-source-box">
      <span class="upload-icon">◇</span>
      <strong>Pre-generated static snapshots</strong>
      <span>Select the bundled source dataset below.</span>
    </div>

    <div class="sample-block">
      <div class="section-label">Quick Samples</div>
      <div class="sample-buttons">
        <button class="sample-button" @click="chooseSample('gapminder')">Gapminder</button>
      </div>
    </div>

    <div class="selected-file">
      <span class="file-dot"></span>
      <span class="truncate">{{ sourceName }}</span>
      <span v-if="store.inspectResult" class="success-mark">✓</span>
    </div>

    <button class="primary-button full-width" :disabled="store.isInspecting || !store.sourceFile" @click="inspect">
      {{ store.isInspecting ? 'Inspecting…' : 'Inspect KG' }}
    </button>

    <div class="divider"></div>

    <div class="panel-heading compact">
      <div>
        <span class="eyebrow">RENDER</span>
        <h2>Generation Settings</h2>
      </div>
    </div>
    <div class="field-grid">
      <label>
        <span>Width</span>
        <input v-model.number="store.settings.width" type="number" disabled />
      </label>
      <label>
        <span>Height</span>
        <input v-model.number="store.settings.height" type="number" disabled />
      </label>
    </div>
    <label class="text-field">
      <span>Additional instructions (optional)</span>
      <input value="Stored with the original generation" type="text" disabled />
    </label>
    <label class="text-field">
      <span>Generation mode</span>
      <select v-model="store.settings.pipeline">
        <option value="agentic">Agentic Generation</option>
        <option value="native">Direct Model Output</option>
      </select>
    </label>
    <label class="checkbox-row">
      <input :checked="true" type="checkbox" disabled />
      <span>Original PNG included</span>
    </label>
    <div class="generation-mode">
      <span>Pipeline</span>
      <strong>{{ store.settings.pipeline === 'native' ? 'Direct Model Output' : 'CoDA Agentic Generation' }}</strong>
      <small>
        {{ store.settings.pipeline === 'native'
          ? 'Load the saved ECharts option and render it locally in this browser.'
          : 'Load the saved CoDA image, generated code, and evaluation report.' }}
      </small>
    </div>
    <button class="generate-button full-width" :disabled="store.isGenerating || !store.sourceFile" @click="generate">
      <span class="button-spark">✦</span>
      {{ store.isGenerating ? 'Loading…' : 'View Generated Result' }}
    </button>
  </section>
</template>
