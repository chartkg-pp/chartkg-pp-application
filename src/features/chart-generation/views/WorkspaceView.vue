<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useWorkspaceStore } from '../stores/workspace'
import { chartApi } from '../data/snapshotRepository'
import SourcePanel from '../components/SourcePanel.vue'
import HistoryPanel from '../components/HistoryPanel.vue'
import ChartPreview from '../components/ChartPreview.vue'
import CoverageTable from '../components/CoverageTable.vue'
import OptionEditor from '../components/OptionEditor.vue'

type Splitter = 'outer-left' | 'outer-right' | 'left-inner'

const store = useWorkspaceStore()
const workspaceRef = ref<HTMLElement | null>(null)
const context = computed(() => store.inspectResult?.context)
const report = computed(() => store.inspectResult?.extraction || null)
const evaluation = computed(() => store.generation?.evaluation || null)
const imageSize = computed(() => store.imageSize)
const workspaceRatios = ref(loadRatios())
const leftStackRatio = ref(loadNumber('chartkg.left-stack-ratio', 52))
const dragging = ref<Splitter | null>(null)
const dragStart = ref({ x: 0, y: 0, left: 24, center: 46, right: 30, leftStack: 52 })

function loadRatios() {
  try {
    const saved = JSON.parse(localStorage.getItem('chartkg.workspace-ratios-v3') || '')
    if (saved && saved.left && saved.center && saved.right) return saved
  } catch {
    // Use the balanced default layout when local storage is unavailable.
  }
  return { left: 24, center: 46, right: 30 }
}

function loadNumber(key: string, fallback: number) {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) && value >= 20 && value <= 80 ? value : fallback
}

const workspaceStyle = computed(() => ({
  gridTemplateColumns: `minmax(260px, ${workspaceRatios.value.left}fr) 9px minmax(500px, ${workspaceRatios.value.center}fr) 9px minmax(340px, ${workspaceRatios.value.right}fr)`,
}))
const leftColumnStyle = computed(() => ({ gridTemplateRows: `${leftStackRatio.value}% 9px 1fr` }))

function persistLayout() {
  localStorage.setItem('chartkg.workspace-ratios-v3', JSON.stringify(workspaceRatios.value))
  localStorage.setItem('chartkg.left-stack-ratio', String(leftStackRatio.value))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function startResize(kind: Splitter, event: PointerEvent) {
  if (event.button !== 0) return
  dragging.value = kind
  dragStart.value = {
    x: event.clientX,
    y: event.clientY,
    left: workspaceRatios.value.left,
    center: workspaceRatios.value.center,
    right: workspaceRatios.value.right,
    leftStack: leftStackRatio.value,
  }
  window.addEventListener('pointermove', resize)
  window.addEventListener('pointerup', stopResize, { once: true })
}

function resize(event: PointerEvent) {
  if (!dragging.value || !workspaceRef.value) return
  const bounds = workspaceRef.value.getBoundingClientRect()
  if (dragging.value === 'left-inner') {
    leftStackRatio.value = clamp(dragStart.value.leftStack + ((event.clientY - dragStart.value.y) / bounds.height) * 100, 24, 76)
  } else {
    const delta = ((event.clientX - dragStart.value.x) / bounds.width) * 100
    if (dragging.value === 'outer-left') {
      const left = clamp(dragStart.value.left + delta, 18, 38)
      const center = clamp(dragStart.value.center - (left - dragStart.value.left), 32, 58)
      workspaceRatios.value = { left, center, right: 100 - left - center }
    } else {
      const center = clamp(dragStart.value.center + delta, 32, 58)
      const right = clamp(dragStart.value.right - (center - dragStart.value.center), 22, 42)
      workspaceRatios.value = { left: 100 - center - right, center, right }
    }
  }
}

function stopResize() {
  if (!dragging.value) return
  dragging.value = null
  window.removeEventListener('pointermove', resize)
  persistLayout()
}

function downloadText(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function downloadOption() {
  if (store.generation?.option) downloadText('option.json', JSON.stringify(store.generation.option, null, 2))
}

function downloadContext() {
  if (context.value) downloadText('context.json', JSON.stringify(context.value, null, 2))
}

function downloadCode() {
  const code = store.generation?.code
  if (code) downloadText('generated_code.py', code, 'text/plain')
}

function downloadArtifact(kind: 'png' | 'code' | 'option' | 'context' | 'visual_assessment' | 'report', filename: string) {
  const path = store.generation?.artifacts[kind]
  if (!path) return
  const link = document.createElement('a')
  link.href = chartApi.artifactUrl(path)
  link.download = filename
  link.click()
}

async function copyOutputPath() {
  const path = store.generation?.outputDir || store.generation?.outputRelativeDir
  if (!path) return
  try {
    await navigator.clipboard.writeText(path)
  } catch {
    // Clipboard access is optional; the visible path remains available for manual copying.
  }
}

onMounted(() => {
  void store.refreshDatasets()
  void store.loadDefaultSnapshot()
})
onBeforeUnmount(() => {
  stopResize()
  store.clearJobListeners()
})
</script>

<template>
  <div ref="workspaceRef" class="workspace" :style="workspaceStyle">
    <aside class="left-column" :style="leftColumnStyle">
      <SourcePanel />
      <div class="resize-handle vertical" aria-label="Resize left panels vertically" @pointerdown="startResize('left-inner', $event)"></div>
      <HistoryPanel />
    </aside>

    <div class="resize-handle horizontal" aria-label="Resize left panel width" @pointerdown="startResize('outer-left', $event)"></div>

    <main class="center-column">
      <section class="panel chart-panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">CHARTKG++ / GENERATION STUDIO</span>
            <h2>Chart Preview</h2>
          </div>
          <div class="preview-header-actions">
            <span class="status-text"><span class="status-pulse"></span>{{ store.isGenerating ? 'Loading snapshot' : store.generation ? 'Result loaded' : 'Ready' }}</span>
            <button v-if="store.generation?.option" class="ghost-button" @click="downloadOption">Download Option</button>
            <button v-if="store.generation?.code" class="ghost-button" @click="downloadCode">Download Code</button>
            <button v-if="context" class="ghost-button" @click="downloadContext">Download Context</button>
            <button v-if="store.generation?.artifacts.png" class="ghost-button" @click="downloadArtifact('png', store.generation?.pipeline === 'native' ? 'chart.png' : 'result.png')">Download PNG</button>
            <button v-if="store.generation?.artifacts.visual_assessment" class="ghost-button" @click="downloadArtifact('visual_assessment', 'visual-assessment.json')">Download Assessment</button>
            <button v-if="store.generation?.artifacts.report" class="ghost-button" @click="downloadArtifact('report', 'report.json')">Download Report</button>
          </div>
        </div>
        <ChartPreview
          :option="store.option"
          :image-url="store.imageUrl"
          :image-size="imageSize"
        />
      </section>

    </main>

    <div class="resize-handle horizontal" aria-label="Resize right panel width" @pointerdown="startResize('outer-right', $event)"></div>

    <aside class="right-column">
      <section class="panel inspector-panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">INSPECTOR</span>
            <h2>Inspector</h2>
          </div>
          <span v-if="store.isReady" class="valid-badge">VALID</span>
        </div>
        <div v-if="store.error" class="error-box inspector-error">{{ store.error }}</div>
        <div v-if="!store.inspectResult" class="empty-inline">Run KG inspection to view structure, variables, and generated artifacts.</div>
        <template v-else>
          <div class="tab-row">
            <button :class="{ active: store.activePanel === 'overview' }" @click="store.activePanel = 'overview'">Overview</button>
            <button :class="{ active: store.activePanel === 'coverage' }" @click="store.activePanel = 'coverage'">Evaluation</button>
            <button :class="{ active: store.activePanel === 'option' }" @click="store.activePanel = 'option'">{{ store.generation?.pipeline === 'agentic' ? 'Code' : 'Option' }}</button>
            <button :class="{ active: store.activePanel === 'report' }" @click="store.activePanel = 'report'">Report</button>
          </div>
          <div v-if="store.activePanel === 'overview'" class="overview-panel">
            <div class="overview-title">Views</div>
            <div v-for="view in context?.views" :key="view.id" class="view-card">
              <div><strong>{{ view.id }}</strong><span>{{ view.properties.chartType as string }}</span></div>
              <small>{{ view.mark_groups.length }} mark group</small>
            </div>
            <div class="overview-title">Variables</div>
            <div class="tag-cloud"><span v-for="variable in context?.variables" :key="variable.id" class="data-tag">{{ variable.id }}</span></div>
          </div>
          <div v-else-if="store.activePanel === 'coverage'" class="inspector-coverage-panel">
            <div v-if="evaluation" class="evaluation-stats">
              <div><span>Entities</span><strong>{{ evaluation.entityCount }}</strong></div>
              <div><span>Relations</span><strong>{{ evaluation.relationCount }}</strong><small>relation types</small></div>
              <div><span>Triples</span><strong>{{ evaluation.tripleCount }}</strong></div>
            </div>
            <div class="summary-meta">
              <div><span>File</span><strong>{{ store.inspectResult.filename }}</strong></div>
              <div><span>Schema</span><strong>{{ context?.schema }}</strong></div>
              <div><span>Views</span><strong>{{ context?.views.length || 0 }}</strong></div>
              <div><span>Variables</span><strong>{{ context?.variables.length || 0 }}</strong></div>
            </div>
            <CoverageTable :report="report" />
          </div>
          <OptionEditor v-else-if="store.activePanel === 'option'" />
          <div v-else class="report-panel">
            <div v-if="store.generation?.outputDir" class="output-location">
              <div class="output-location-heading">
                <span>Output folder</span>
                <button class="small-primary-button" type="button" @click="copyOutputPath">Copy path</button>
              </div>
              <code>{{ store.generation.outputDir }}</code>
              <small>Generated data, code, image, and evaluation artifacts are stored here.</small>
            </div>
            <pre class="report-json">{{ JSON.stringify(store.generation?.report || store.inspectResult.extraction, null, 2) }}</pre>
          </div>
        </template>
      </section>
    </aside>
  </div>
</template>
