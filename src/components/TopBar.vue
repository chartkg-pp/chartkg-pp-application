<script setup lang="ts">
import type { RunState } from '../types'
import SystemSwitcher from './SystemSwitcher.vue'

defineProps<{ run: RunState; fileName: string }>()
const emit = defineEmits<{
  file: [file: File]
  start: []
  sample: [id: 'countries-health-wealth' | 'case2-opinionseer']
  reset: []
}>()

function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('file', file)
  ;(event.target as HTMLInputElement).value = ''
}
</script>

<template>
  <header class="topbar">
    <div class="brand-title">ChartKG++</div>
    <SystemSwitcher />
    <div class="topbar-actions">
      <div class="field-group file-field">
        <span class="field-label">File</span>
        <span class="field-select" :title="fileName || 'No chart selected'">
          <span>{{ fileName || 'chart image name.jpg' }}</span>
          <svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5" /></svg>
        </span>
        <label class="field-upload-btn" title="Upload chart image">
          <svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" @change="onFile" />
        </label>
      </div>
      <div class="field-group model-field">
        <span class="field-label">Model</span>
        <span class="field-select model-select"><span>Static GraphRAG</span><svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5" /></svg></span>
      </div>
      <button class="topbar-button btn-start" :disabled="run.status === 'extracting' || run.status === 'validating'" @click="emit('start')">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="m10 8 6 4-6 4z" /></svg>
        {{ run.status === 'extracting' || run.status === 'validating' ? 'Running…' : 'Start' }}
      </button>
      <button class="topbar-button btn-sample" @click="emit('sample', 'countries-health-wealth')">
        <svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 14h8" /></svg>
        Countries
      </button>
      <button class="topbar-button btn-sample" @click="emit('sample', 'case2-opinionseer')">
        <svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 14h8" /></svg>
        Case2
      </button>
      <button class="topbar-button btn-redo" @click="emit('reset')">
        <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2-5.3M4 4v6h6" /></svg>
        Redo
      </button>
    </div>
  </header>
</template>
