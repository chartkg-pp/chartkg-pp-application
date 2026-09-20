<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import InteractiveKGGraph from './InteractiveKGGraph.vue'
import type { GraphData, KGNode, LayerId } from '../types'
import { semanticLayers, semanticLayerOrder } from '../semanticLayers'

const props = defineProps<{
  graph: GraphData | null
  selectedCitationId: string | null
  selectedClaimIds: string[]
  selectedNodeId: string | null
}>()
const emit = defineEmits<{
  node: [node: KGNode | null]
}>()

const graphRef = ref<InstanceType<typeof InteractiveKGGraph> | null>(null)
const activeLayers = ref<LayerId[]>(['S1', 'S2', 'S3', 'S4'])

const layerMeta = semanticLayers
const displayLayers = semanticLayerOrder.map((id) => layerMeta[id])

const selectedNode = computed(() => props.graph?.nodes.find((node) => node.id === props.selectedNodeId) ?? null)
const selectedNodeEdges = computed(() => {
  if (!selectedNode.value || !props.graph) return []
  return props.graph.edges.filter((edge) => edge.source === selectedNode.value?.id || edge.target === selectedNode.value?.id)
})
const countByLayer = computed(() => {
  const counts = new Map<LayerId, number>(displayLayers.map((layer) => [layer.id, 0]))
  props.graph?.nodes.forEach((node) => counts.set(node.layer, (counts.get(node.layer) ?? 0) + 1))
  return counts
})
const visibleNodeCount = computed(() => props.graph?.nodes.filter((node) => activeLayers.value.includes(node.layer)).length ?? 0)
const visibleEdgeCount = computed(() => {
  if (!props.graph) return 0
  const visibleIds = new Set(props.graph.nodes.filter((node) => activeLayers.value.includes(node.layer)).map((node) => node.id))
  return props.graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)).length
})

const resolvedClaimIds = computed(() => {
  if (!props.selectedCitationId || !props.graph) return []
  return props.selectedClaimIds
})

function layerActive(layer: LayerId) {
  return activeLayers.value.includes(layer)
}

function toggleLayer(layer: LayerId) {
  activeLayers.value = layerActive(layer)
    ? activeLayers.value.filter((item) => item !== layer)
    : [...activeLayers.value, layer]
}

function selectNode(node: KGNode | null) {
  emit('node', node)
}

watch(() => props.graph?.revisionId, () => {
  activeLayers.value = ['S1', 'S2', 'S3', 'S4']
  emit('node', null)
})
</script>

<template>
  <section class="panel kgc-panel">
    <div class="kgc-header">
      <span class="kgc-title">Knowledge Graph Connection</span>
      <div class="kgc-header-actions">
        <div class="kgc-toolbar" aria-label="Graph view controls">
          <button class="kgc-tool" title="Reset layout" aria-label="Reset graph layout" :disabled="!graph" @click="graphRef?.resetLayout()">
            <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
          </button>
          <button class="kgc-tool" title="Zoom out" aria-label="Zoom out" :disabled="!graph" @click="graphRef?.zoomOut()">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M8 11h6" /><path d="M16.5 16.5L20 20" /></svg>
          </button>
          <button class="kgc-tool" title="Zoom in" aria-label="Zoom in" :disabled="!graph" @click="graphRef?.zoomIn()">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M11 8v6M8 11h6" /><path d="M16.5 16.5L20 20" /></svg>
          </button>
          <button class="kgc-tool" title="Fit to view" aria-label="Fit graph to view" :disabled="!graph" @click="graphRef?.fitToView()">
            <svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
          </button>
        </div>
      </div>
    </div>

    <div class="kgc-legend" aria-label="Knowledge graph layers">
      <button
        v-for="layer in displayLayers"
        :key="layer.id"
        class="kgc-chip"
        :class="{ 'is-off': !layerActive(layer.id) }"
        :aria-pressed="layerActive(layer.id)"
        :disabled="!graph"
        @click="toggleLayer(layer.id)"
      >
        <span class="kgc-chip-dot" :style="{ background: layer.color }"></span>
        {{ layer.label }}
        <span class="kgc-chip-count">{{ countByLayer.get(layer.id) }}</span>
      </button>
      <span v-if="selectedNode" class="kgc-focused">
        Focused on {{ selectedNode.label }}
        <button class="kgc-focused-x" aria-label="Clear selected node" @click="selectNode(null)">×</button>
      </span>
    </div>

    <div class="kgc-body">
      <div v-if="!graph" class="kg-empty">
        <div class="kg-empty-icon">◇</div>
        <strong>Knowledge graph is waiting</strong>
        <span>Upload a chart and start analysis to materialize the layered instance graph.</span>
      </div>
      <InteractiveKGGraph
        v-else
        ref="graphRef"
        :graph="graph"
        :active-layers="activeLayers"
        :selected-node-id="selectedNodeId"
        :selected-claim-ids="resolvedClaimIds"
        @node="selectNode"
      />

      <div v-if="selectedNode" class="kgc-editor">
        <div class="kgc-editor-head">
          <span class="kgc-editor-title">Entity</span>
          <code class="kgc-editor-id">{{ selectedNode.id }}</code>
          <button class="kgc-editor-close" title="Close" @click="selectNode(null)">×</button>
        </div>
        <div class="kgc-field">
          <span class="kgc-field-k">Label</span>
          <div class="kgc-field-value">{{ selectedNode.label }}</div>
        </div>
        <div class="kgc-field">
          <span class="kgc-field-k">Layer</span>
          <div class="kgc-field-value"><i :style="{ background: layerMeta[selectedNode.layer].color }"></i>{{ layerMeta[selectedNode.layer].label }}</div>
        </div>
        <div class="kgc-field">
          <span class="kgc-field-k">Type</span>
          <div class="kgc-field-value">{{ selectedNode.type }}</div>
        </div>
        <div v-if="Object.keys(selectedNode.details).length" class="kgc-details">
          <div v-for="(value, key) in selectedNode.details" :key="key" class="kgc-detail-row">
            <span>{{ key }}</span><strong>{{ value }}</strong>
          </div>
        </div>
        <div class="kgc-editor-foot">{{ selectedNodeEdges.length }} connected relations</div>
      </div>
    </div>

    <div class="kgc-footer">
      <span>Nodes <b>{{ visibleNodeCount }}</b></span>
      <span>Edges <b>{{ visibleEdgeCount }}</b></span>
      <span class="kgc-footer-hint">Drag nodes to rearrange · scroll to zoom · drag background to pan</span>
    </div>
  </section>
</template>

<style scoped>
.kgc-panel { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; width: 100%; }
.kgc-header { display: flex; flex-shrink: 0; align-items: center; justify-content: space-between; gap: 16px; min-height: 56px; padding: 8px 16px; }
.kgc-title { padding-bottom: 2px; border-bottom: 2px solid var(--primary); color: #000; font-size: 20px; font-weight: 700; white-space: nowrap; }
.kgc-header-actions { display: flex; align-items: center; gap: 12px; }
.kgc-toolbar { display: inline-flex; align-items: center; gap: 2px; }
.kgc-tool { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 6px; color: var(--primary); background: transparent; cursor: pointer; transition: background .15s, color .15s; }
.kgc-tool:hover:not(:disabled) { background: var(--primary-light); }
.kgc-tool:disabled { cursor: not-allowed; opacity: .35; }
.kgc-tool svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.kgc-legend { display: flex; flex-shrink: 0; flex-wrap: wrap; align-items: center; gap: 8px; padding: 0 16px 8px; }
.kgc-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border: 1.5px solid #c8d0d8; border-radius: 18px; color: #2a2a2a; background: #fff; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
.kgc-chip:hover:not(:disabled) { border-color: var(--primary); }
.kgc-chip:disabled { cursor: not-allowed; opacity: .55; }
.kgc-chip.is-off { background: #f2f4f6; opacity: .4; }
.kgc-chip-dot { width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 0 1.5px rgba(0,0,0,.12); }
.kgc-chip-count { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 18px; padding: 0 5px; border-radius: 9px; color: #5a6a78; background: #eef1f4; font-size: 12px; }
.kgc-focused { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; padding: 4px 10px; border-radius: 16px; color: var(--primary-active); background: var(--primary-light); font-size: 13px; font-weight: 600; }
.kgc-focused-x { padding: 0 2px; border: 0; color: inherit; background: transparent; font-size: 15px; line-height: 1; cursor: pointer; }
.kgc-body { position: relative; min-height: 0; flex: 1; overflow: hidden; }
.kgc-body > :deep(.kgc-graph) { width: 100%; height: 100%; }
.kg-empty { height: 100%; gap: 8px; padding: 30px; }
.kg-empty-icon { color: var(--primary); font-size: 46px; font-weight: 300; }
.kg-empty strong { color: #27323a; font-size: 13px; }
.kg-empty span { max-width: 380px; line-height: 1.5; }
.kgc-footer { display: flex; flex-shrink: 0; align-items: center; gap: 16px; padding: 4px 16px; border-top: 1px solid #e5e7eb; color: #595959; font-size: 12px; }
.kgc-footer b { color: var(--primary); }
.kgc-footer-hint { margin-left: auto; color: #8c8c8c; }
.kgc-editor { position: absolute; top: 12px; right: 12px; z-index: 20; width: 264px; max-height: calc(100% - 24px); padding: 12px; overflow-y: auto; border: 1px solid #d5dde5; border-radius: 10px; background: rgba(255,255,255,.97); box-shadow: 0 6px 20px rgba(31,41,55,.16); }
.kgc-editor-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.kgc-editor-title { color: #1f2937; font-size: 14px; font-weight: 700; }
.kgc-editor-id { min-width: 0; flex: 1; padding: 1px 6px; overflow: hidden; border-radius: 4px; color: var(--primary-active); background: var(--primary-light); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.kgc-editor-close { padding: 0 2px; border: 0; color: #8a97a5; background: transparent; font-size: 18px; line-height: 1; cursor: pointer; }
.kgc-field { display: block; margin-bottom: 10px; }
.kgc-field-k { display: block; margin-bottom: 4px; color: #64748b; font-size: 12px; font-weight: 700; letter-spacing: .2px; }
.kgc-field-value { display: flex; align-items: center; gap: 6px; min-height: 30px; padding: 5px 8px; border: 1px solid #cdd6df; border-radius: 6px; color: #1f2937; background: #fff; font-size: 13px; word-break: break-word; }
.kgc-field-value i { width: 10px; height: 10px; border-radius: 50%; }
.kgc-details { padding-top: 3px; border-top: 1px solid #e5e9ed; }
.kgc-detail-row { display: grid; grid-template-columns: minmax(64px, .7fr) minmax(0, 1.3fr); gap: 8px; padding: 5px 0; border-bottom: 1px solid #eef1f3; font-size: 11px; }
.kgc-detail-row span { color: #7a8792; word-break: break-word; }
.kgc-detail-row strong { color: #334155; font-weight: 600; word-break: break-word; }
.kgc-editor-foot { margin-top: 9px; color: #8c98a3; font-size: 11px; }
@media (max-width: 1200px) {
  .kgc-header-actions { gap: 6px; }
  .kgc-chip { padding-inline: 8px; }
}
</style>
