<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceStore } from '../stores/workspace'
import SystemSwitcher from '../../../components/SystemSwitcher.vue'

const store = useWorkspaceStore()
const sourceName = computed(() => store.sourceFile?.name || 'Select readable-KG / CSV')
const datasetOptions = computed(() => store.datasets.map((item) => ({ id: item.id, label: item.filename || item.name })))

async function generate() {
  if (!store.inspectResult) await store.inspectSource()
  if (store.inspectResult) await store.startGeneration(store.settings)
}

function onDataset(event: Event) {
  void store.selectDataset((event.target as HTMLSelectElement).value)
}

function onPipeline(event: Event) {
  void store.selectPipeline((event.target as HTMLSelectElement).value as 'agentic' | 'native')
}
</script>

<template>
  <header class="topbar">
    <div class="brand-title">ChartKG++</div>
    <SystemSwitcher />
    <div class="topbar-actions">
      <div class="field-group source-control">
        <span class="field-label">KG</span>
        <select
          class="field-select topbar-select"
          aria-label="Select input dataset"
          :value="store.activeDatasetId"
          @change="onDataset"
        >
          <option v-for="item in datasetOptions" :key="item.id" :value="item.id">{{ item.label }}</option>
        </select>
      </div>
      <div class="field-group compact-control">
        <span class="field-label">Mode</span>
        <select
          class="field-select topbar-select mode-select"
          aria-label="Select generation mode"
          :value="store.settings.pipeline"
          @change="onPipeline"
        >
          <option value="agentic">Agentic / CoDA</option>
          <option value="native">Native / ECharts</option>
        </select>
      </div>
      <div class="field-group compact-control">
        <span class="field-label">Canvas</span>
        <span class="canvas-size">{{ store.settings.width }} × {{ store.settings.height }}</span>
      </div>
      <span class="topbar-source" :title="sourceName">{{ sourceName }}</span>
      <button class="topbar-button btn-start" :disabled="store.isGenerating || !store.sourceFile" @click="generate">✦ View result</button>
      <button class="topbar-button btn-redo" @click="store.resetWorkspace">Reset</button>
    </div>
  </header>
</template>
