<script setup lang="ts">
import type { RunState } from '../types'
import type { GraphRagStaticCase } from '../staticCases'
import { isTestCaseId, type TestCaseId } from '../testData'
import SystemSwitcher from './SystemSwitcher.vue'

const datasetDownloadUrl = `${import.meta.env.BASE_URL}dataset.zip`

defineProps<{
  run: RunState
  fileName: string
  selectedSampleId: string
  samples: GraphRagStaticCase[]
}>()
const emit = defineEmits<{
  file: [file: File]
  start: []
  selectSample: [id: TestCaseId]
  reset: []
}>()

function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('file', file)
  ;(event.target as HTMLInputElement).value = ''
}

function onSampleSelect(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  if (isTestCaseId(id)) emit('selectSample', id)
}
</script>

<template>
  <header class="topbar">
    <div class="brand-title">ChartKG++</div>
    <SystemSwitcher />
    <div class="topbar-actions">
      <div class="field-group file-field">
        <span class="field-label">File</span>
        <select
          class="field-select file-select"
          :value="selectedSampleId"
          :title="fileName || 'No chart selected'"
          aria-label="Select a bundled chart image"
          @change="onSampleSelect"
        >
          <option value="" disabled>{{ fileName || 'Select a chart image' }}</option>
          <option v-for="sample in samples" :key="sample.id" :value="sample.id">{{ sample.label }}</option>
        </select>
        <label class="field-upload-btn" title="Upload chart image">
          <svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" @change="onFile" />
        </label>
      </div>
      <div class="field-group model-field">
        <span class="field-label">Model</span>
        <span class="field-select model-select"><span>Static GraphRAG</span><svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5" /></svg></span>
      </div>
      <button class="topbar-button btn-start" :disabled="!fileName || run.status === 'extracting' || run.status === 'validating'" @click="emit('start')">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="m10 8 6 4-6 4z" /></svg>
        {{ run.status === 'extracting' || run.status === 'validating' ? 'Running…' : 'Start' }}
      </button>
      <a class="topbar-button btn-download" :href="datasetDownloadUrl" download="dataset.zip" title="Download dataset">
        <svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        Download
      </a>
      <button class="topbar-button btn-redo" @click="emit('reset')">
        <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2-5.3M4 4v6h6" /></svg>
        Redo
      </button>
    </div>
  </header>
</template>
