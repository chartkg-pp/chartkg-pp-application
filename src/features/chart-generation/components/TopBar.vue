<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceStore } from '../stores/workspace'
import SystemSwitcher from '../../../components/SystemSwitcher.vue'

const store = useWorkspaceStore()
const sourceName = computed(() => store.sourceFile?.name || 'Select readable-KG / CSV')
const modeName = computed(() => {
  return store.settings.pipeline === 'native' ? 'STATIC NATIVE SNAPSHOT' : 'STATIC AGENTIC SNAPSHOT'
})

async function generate() {
  if (!store.inspectResult) await store.inspectSource()
  if (store.inspectResult) await store.startGeneration(store.settings)
}
</script>

<template>
  <header class="topbar">
    <div class="brand-title">ChartKG++</div>
    <SystemSwitcher />
    <div class="topbar-actions">
      <div class="field-group source-control">
        <span class="field-label">KG</span>
        <span class="field-select"><span>{{ sourceName }}</span><span>◆</span></span>
      </div>
      <div class="field-group compact-control">
        <span class="field-label">Mode</span>
        <span class="model-select field-select">{{ modeName }}</span>
      </div>
      <div class="field-group compact-control">
        <span class="field-label">Canvas</span>
        <span class="canvas-size">{{ store.settings.width }} × {{ store.settings.height }}</span>
      </div>
      <label class="render-toggle"><input v-model="store.settings.renderPng" type="checkbox" /> PNG</label>
      <button class="topbar-button btn-start" :disabled="store.isGenerating || !store.sourceFile" @click="generate">✦ View result</button>
      <button class="topbar-button btn-redo" @click="store.resetWorkspace">Reset</button>
    </div>
  </header>
</template>
