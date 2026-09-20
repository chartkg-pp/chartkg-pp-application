<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { GraphData, KGNode, LayerId } from '../types'
import { semanticLayers, semanticLayerOrder } from '../semanticLayers'

const props = defineProps<{
  graph: GraphData
  activeLayers: LayerId[]
  selectedNodeId: string | null
  selectedClaimIds: string[]
}>()
const emit = defineEmits<{ node: [node: KGNode | null] }>()

const WORLD_W = 1200
const WORLD_H = 760
const DISPLAY_ORDER: LayerId[] = semanticLayerOrder
const BAND_YS = [125, 300, 475, 640]
const LAYER_Y: Record<LayerId, number> = { S1: BAND_YS[0], S2: BAND_YS[1], S3: BAND_YS[2], S4: BAND_YS[3] }
const BAND_HALF = 88
const NODE_R = 30
const LABEL_ARC_R = NODE_R + 5
const LABEL_ARC_MAX_HALF = 1.55
const LABEL_FS_DEFAULT = 13.5
const LABEL_FS_MIN = 8

const layerMeta = semanticLayers
const displayLayers = DISPLAY_ORDER.map((id) => layerMeta[id])

interface ViewNode extends KGNode {
  x: number
  y: number
}

const nodes = ref<ViewNode[]>([])
const svgRef = ref<SVGSVGElement | null>(null)
const view = ref({ x: 0, y: 0, k: 1 })
const hoverId = ref<string | null>(null)
const MIN_K = 0.3
const MAX_K = 3

function layerColor(id: LayerId) {
  return layerMeta[id].color
}

function runLayout() {
  const next = props.graph.nodes.map((node) => ({ ...node, x: WORLD_W / 2, y: LAYER_Y[node.layer] }))
  const groups = new Map<LayerId, ViewNode[]>(DISPLAY_ORDER.map((layer) => [layer, []]))
  next.forEach((node) => groups.get(node.layer)?.push(node))
  const originalRank = new Map(next.map((node, index) => [node.id, index]))
  const neighbors = new Map<string, string[]>()
  props.graph.edges.forEach((edge) => {
    const sourceNeighbors = neighbors.get(edge.source) ?? []
    const targetNeighbors = neighbors.get(edge.target) ?? []
    sourceNeighbors.push(edge.target)
    targetNeighbors.push(edge.source)
    neighbors.set(edge.source, sourceNeighbors)
    neighbors.set(edge.target, targetNeighbors)
  })

  const assign = () => {
    DISPLAY_ORDER.forEach((layer) => {
      const group = groups.get(layer) ?? []
      group.forEach((node, index) => {
        node.x = group.length === 1 ? WORLD_W / 2 : 75 + index * ((WORLD_W - 150) / (group.length - 1))
        node.y = LAYER_Y[layer]
      })
    })
  }

  assign()
  for (let pass = 0; pass < 12; pass += 1) {
    const order = pass % 2 === 0 ? DISPLAY_ORDER : [...DISPLAY_ORDER].reverse()
    order.forEach((layer) => {
      const group = groups.get(layer) ?? []
      group.sort((left, right) => {
        const barycenter = (node: ViewNode) => {
          const linked = (neighbors.get(node.id) ?? []).map((id) => next.find((candidate) => candidate.id === id)).filter((item): item is ViewNode => !!item)
          return linked.length ? linked.reduce((sum, item) => sum + item.x, 0) / linked.length : node.x
        }
        return barycenter(left) - barycenter(right) || (originalRank.get(left.id) ?? 0) - (originalRank.get(right.id) ?? 0)
      })
      assign()
    })
  }
  nodes.value = next
}

const activeLayerSet = computed(() => new Set(props.activeLayers))
const visibleNodes = computed(() => nodes.value.filter((node) => activeLayerSet.value.has(node.layer)))
const nodeById = computed(() => new Map(nodes.value.map((node) => [node.id, node])))
const visibleNodeById = computed(() => new Map(visibleNodes.value.map((node) => [node.id, node])))
const focusId = computed(() => props.selectedNodeId ?? hoverId.value)
const citationClaims = computed(() => new Set(props.selectedClaimIds))

function intersects(values: string[], candidates: Set<string>) {
  return values.some((value) => candidates.has(value))
}

const neighborIds = computed(() => {
  if (!focusId.value) return null
  const connected = new Set<string>([focusId.value])
  props.graph.edges.forEach((edge) => {
    if (edge.source === focusId.value) connected.add(edge.target)
    if (edge.target === focusId.value) connected.add(edge.source)
  })
  return connected
})

function nodeState(node: ViewNode) {
  const selected = props.selectedNodeId === node.id
  const citationActive = citationClaims.value.size > 0 && intersects(node.claimIds, citationClaims.value)
  const active = neighborIds.value ? neighborIds.value.has(node.id) : citationActive
  const dimmed = neighborIds.value !== null ? !active : citationClaims.value.size > 0 && !citationActive
  return { selected, active, dimmed, 'is-citation': citationActive }
}

interface EdgeGeometry {
  id: string
  path: string
  relation: string
  mx: number
  my: number
  labelW: number
  active: boolean
  dimmed: boolean
}

const visibleEdges = computed<EdgeGeometry[]>(() => {
  const records = props.graph.edges
    .map((edge, index) => ({ edge, index, source: visibleNodeById.value.get(edge.source), target: visibleNodeById.value.get(edge.target) }))
    .filter((record): record is typeof record & { source: ViewNode; target: ViewNode } => !!record.source && !!record.target)
  const pairKey = (left: string, right: string) => left < right ? `${left}|${right}` : `${right}|${left}`
  const grouped = new Map<string, number[]>()
  records.forEach((record) => {
    const key = pairKey(record.edge.source, record.edge.target)
    grouped.set(key, [...(grouped.get(key) ?? []), record.index])
  })
  const parallel = new Map<number, { index: number; count: number }>()
  grouped.forEach((indices) => indices.forEach((edgeIndex, index) => parallel.set(edgeIndex, { index, count: indices.length })))

  return records.map(({ edge, index, source, target }) => {
    const group = parallel.get(index) ?? { index: 0, count: 1 }
    const connectedToFocus = !!focusId.value && (edge.source === focusId.value || edge.target === focusId.value)
    const connectedToCitation = citationClaims.value.size > 0 && intersects(edge.claimIds, citationClaims.value)
    const active = focusId.value ? connectedToFocus : connectedToCitation
    const hasFilter = !!focusId.value || citationClaims.value.size > 0
    let path = `M ${source.x} ${source.y} L ${target.x} ${target.y}`
    let mx = (source.x + target.x) / 2
    let my = (source.y + target.y) / 2
    if (group.count > 1) {
      const dx = target.x - source.x
      const dy = target.y - source.y
      const length = Math.hypot(dx, dy) || 1
      const px = -dy / length
      const py = dx / length
      const bend = (group.index - (group.count - 1) / 2) * 46
      const cx = (source.x + target.x) / 2
      const cy = (source.y + target.y) / 2
      path = `M ${source.x} ${source.y} Q ${cx + px * bend * 2} ${cy + py * bend * 2} ${target.x} ${target.y}`
      mx = cx + px * bend
      my = cy + py * bend
    }
    const relation = edge.relation.replace(/_/g, ' ')
    return { id: edge.id, path, relation, mx, my, labelW: relation.length * 7.4 + 16, active, dimmed: hasFilter && !active }
  })
})

function labelArc(node: ViewNode) {
  const text = node.label || ''
  const radius = LABEL_ARC_R
  const maxArc = 2 * radius * LABEL_ARC_MAX_HALF
  let fontSize = LABEL_FS_DEFAULT
  let arcLength = text.length * .58 * fontSize
  if (arcLength > maxArc) fontSize = Math.max(LABEL_FS_MIN, fontSize * (maxArc / arcLength))
  arcLength = text.length * .58 * fontSize
  const half = Math.min(LABEL_ARC_MAX_HALF, arcLength / (2 * radius))
  const sx = node.x - radius * Math.sin(half)
  const sy = node.y - radius * Math.cos(half)
  const ex = node.x + radius * Math.sin(half)
  const ey = node.y - radius * Math.cos(half)
  return {
    d: `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${radius} ${radius} 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`,
    fontSize: +fontSize.toFixed(1),
  }
}

function arcId(node: ViewNode) {
  let hash = 0
  for (let index = 0; index < node.id.length; index += 1) hash = ((hash << 5) - hash + node.id.charCodeAt(index)) | 0
  return `kg-arc-${Math.abs(hash)}-${node.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function zoomAt(vx: number, vy: number, factor: number) {
  const current = view.value
  const scale = Math.min(MAX_K, Math.max(MIN_K, current.k * factor))
  const ratio = scale / current.k
  view.value = { x: vx - (vx - current.x) * ratio, y: vy - (vy - current.y) * ratio, k: scale }
}

function zoomIn() {
  zoomAt(WORLD_W / 2, WORLD_H / 2, 1.2)
}

function zoomOut() {
  zoomAt(WORLD_W / 2, WORLD_H / 2, 1 / 1.2)
}

function fitToView() {
  view.value = { x: 0, y: 0, k: 1 }
}

function resetLayout() {
  runLayout()
  fitToView()
}

function clientToViewBox(clientX: number, clientY: number) {
  const matrix = svgRef.value?.getScreenCTM()
  if (!matrix) return { x: 0, y: 0 }
  return new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
}

function clientToWorld(clientX: number, clientY: number) {
  const point = clientToViewBox(clientX, clientY)
  return { x: (point.x - view.value.x) / view.value.k, y: (point.y - view.value.y) / view.value.k }
}

type DragState =
  | { mode: 'node'; id: string; startX: number; startY: number; originX: number; originY: number; moved: boolean }
  | { mode: 'pan'; startX: number; startY: number; originX: number; originY: number; moved: boolean }
  | null
let drag: DragState = null

function onNodePointerDown(event: PointerEvent, node: ViewNode) {
  event.preventDefault()
  event.stopPropagation()
  const point = clientToWorld(event.clientX, event.clientY)
  drag = { mode: 'node', id: node.id, startX: point.x, startY: point.y, originX: node.x, originY: node.y, moved: false }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
}

function onBackgroundPointerDown(event: PointerEvent) {
  const point = clientToViewBox(event.clientX, event.clientY)
  drag = { mode: 'pan', startX: point.x, startY: point.y, originX: view.value.x, originY: view.value.y, moved: false }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
}

function onPointerMove(event: PointerEvent) {
  if (!drag) return
  if (drag.mode === 'node') {
    const point = clientToWorld(event.clientX, event.clientY)
    const dx = point.x - drag.startX
    const dy = point.y - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    drag.moved = true
    const node = nodeById.value.get(drag.id)
    if (node) {
      node.x = Math.max(10, Math.min(WORLD_W - 10, drag.originX + dx))
      node.y = Math.max(10, Math.min(WORLD_H - 10, drag.originY + dy))
    }
  } else {
    const point = clientToViewBox(event.clientX, event.clientY)
    const dx = point.x - drag.startX
    const dy = point.y - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    drag.moved = true
    view.value = { x: drag.originX + dx, y: drag.originY + dy, k: view.value.k }
  }
}

function onPointerUp() {
  const finished = drag
  drag = null
  window.removeEventListener('pointermove', onPointerMove)
  if (!finished || finished.moved) return
  if (finished.mode === 'pan') emit('node', null)
  else {
    const node = nodeById.value.get(finished.id) ?? null
    emit('node', props.selectedNodeId === finished.id ? null : node)
  }
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  const point = clientToViewBox(event.clientX, event.clientY)
  zoomAt(point.x, point.y, event.deltaY < 0 ? 1.12 : 1 / 1.12)
}

interface HoverState {
  node: ViewNode
  x: number
  y: number
}
const hovered = ref<HoverState | null>(null)

function onEnter(event: MouseEvent, node: ViewNode) {
  if (drag) return
  hoverId.value = node.id
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  hovered.value = { node, x: rect.left + rect.width / 2, y: rect.top - 6 }
}

function onLeave() {
  hoverId.value = null
  hovered.value = null
}

watch(() => props.graph, resetLayout, { immediate: true })
onMounted(() => svgRef.value?.addEventListener('wheel', onWheel, { passive: false }))
onBeforeUnmount(() => {
  svgRef.value?.removeEventListener('wheel', onWheel)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})

defineExpose({ fitToView, zoomIn, zoomOut, resetLayout })
</script>

<template>
  <div class="kgc-graph">
    <svg
      ref="svgRef"
      class="kgc-svg"
      :viewBox="`0 0 ${WORLD_W} ${WORLD_H}`"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Interactive four-layer knowledge graph"
      @pointerdown="onBackgroundPointerDown"
    >
      <g :transform="`translate(${view.x},${view.y}) scale(${view.k})`">
        <g class="kgc-bands">
          <rect
            v-for="layer in displayLayers"
            :key="`band-${layer.id}`"
            x="0"
            :y="LAYER_Y[layer.id] - BAND_HALF"
            :width="WORLD_W"
            :height="BAND_HALF * 2"
            :fill="layer.color"
            class="kgc-band"
          />
          <text
            v-for="layer in displayLayers"
            :key="`band-label-${layer.id}`"
            class="kgc-band-label"
            x="16"
            :y="LAYER_Y[layer.id] - BAND_HALF + 22"
            :fill="layer.color"
          >{{ layer.label }}</text>
        </g>

        <g class="kgc-edges">
          <path
            v-for="edge in visibleEdges"
            :key="edge.id"
            class="kgc-edge"
            :class="{ 'is-active': edge.active, 'is-dimmed': edge.dimmed }"
            :d="edge.path"
            fill="none"
          />
        </g>

        <g v-if="focusId || citationClaims.size" class="kgc-edge-labels">
          <g
            v-for="edge in visibleEdges.filter((item) => item.active && item.relation)"
            :key="`label-${edge.id}`"
            class="kgc-edge-label is-active"
            :transform="`translate(${edge.mx},${edge.my})`"
          >
            <rect :x="-edge.labelW / 2" y="-10" :width="edge.labelW" height="20" rx="5" />
            <text y="1" text-anchor="middle" dominant-baseline="middle">{{ edge.relation }}</text>
          </g>
        </g>

        <g class="kgc-nodes">
          <g
            v-for="node in visibleNodes"
            :key="node.id"
            class="kgc-node"
            :class="nodeState(node)"
            :transform="`translate(${node.x},${node.y})`"
            role="button"
            tabindex="0"
            :aria-label="`${node.label}, ${layerMeta[node.layer].label}`"
            @pointerdown="onNodePointerDown($event, node)"
            @mouseenter="onEnter($event, node)"
            @mouseleave="onLeave"
            @keydown.enter.prevent="emit('node', selectedNodeId === node.id ? null : node)"
            @keydown.space.prevent="emit('node', selectedNodeId === node.id ? null : node)"
          >
            <circle class="kgc-halo" :r="NODE_R + 8" />
            <circle class="kgc-node-circle" :r="NODE_R" :fill="layerColor(node.layer)" />
          </g>
        </g>

        <defs>
          <path v-for="node in visibleNodes" :id="arcId(node)" :key="arcId(node)" :d="labelArc(node).d" fill="none" />
        </defs>

        <g class="kgc-labels">
          <g v-for="node in visibleNodes" :key="`text-${node.id}`" class="kgc-label-wrap" :class="nodeState(node)">
            <text class="kgc-node-label" :fill="layerColor(node.layer)" :font-size="labelArc(node).fontSize">
              <textPath :href="`#${arcId(node)}`" startOffset="50%" text-anchor="middle">{{ node.label }}</textPath>
            </text>
          </g>
        </g>
      </g>
    </svg>

    <div v-if="hovered" class="kgc-tip" :style="{ left: `${hovered.x}px`, top: `${hovered.y}px` }">
      <div class="kgc-tip-title">{{ hovered.node.label }}</div>
      <div class="kgc-tip-row"><span class="kgc-tip-k">Type:</span><span>{{ hovered.node.type }}</span></div>
      <div v-for="(value, key) in hovered.node.details" :key="key" class="kgc-tip-row">
        <span class="kgc-tip-k">{{ key }}:</span><span>{{ value }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kgc-graph { position: relative; width: 100%; height: 100%; overflow: hidden; background: #fff; }
.kgc-svg { display: block; width: 100%; height: 100%; touch-action: none; cursor: default; }
.kgc-band { opacity: .055; }
.kgc-band-label { font-size: 15px; font-weight: 700; letter-spacing: .3px; opacity: .55; }
.kgc-edge { stroke: #9aa7b3; stroke-width: 1.4; opacity: .6; transition: opacity .2s; }
.kgc-edge.is-active { stroke: var(--primary-active); stroke-width: 2.6; opacity: .95; }
.kgc-edge.is-dimmed { opacity: .07; }
.kgc-edge-label rect { fill: rgba(255,255,255,.92); stroke: #c5ced6; stroke-width: 1; }
.kgc-edge-label text { fill: #5a6a78; font-size: 12px; font-weight: 600; }
.kgc-edge-label.is-active rect { fill: #fff; stroke: var(--primary-active); }
.kgc-edge-label.is-active text { fill: var(--primary-active); }
.kgc-node { cursor: grab; transition: opacity .2s; outline: none; }
.kgc-node:active { cursor: grabbing; }
.kgc-halo { fill: none; stroke: transparent; stroke-width: 4; transition: stroke .15s; }
.kgc-node.active .kgc-halo, .kgc-node.selected .kgc-halo, .kgc-node.is-citation .kgc-halo { stroke: var(--primary-active); opacity: .55; }
.kgc-node.selected .kgc-halo { stroke-width: 5; opacity: .8; }
.kgc-node-circle { stroke: #fff; stroke-width: 2.6; filter: drop-shadow(0 1px 2px rgba(0,0,0,.18)); }
.kgc-node.dimmed { opacity: .2; }
.kgc-labels { pointer-events: none; }
.kgc-label-wrap { transition: opacity .2s; }
.kgc-label-wrap.dimmed { opacity: .18; }
.kgc-node-label { font-weight: 700; paint-order: stroke; stroke: rgba(255,255,255,.92); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; user-select: none; }
.kgc-tip { position: fixed; z-index: 1000; max-width: 280px; padding: 6px 10px; border-radius: 6px; color: #fff; background: rgba(0,0,0,.75); box-shadow: 0 4px 12px rgba(0,0,0,.2); font-size: 12px; line-height: 1.5; pointer-events: none; transform: translate(-50%, -100%); }
.kgc-tip::after { position: absolute; bottom: -5px; left: 50%; border: 5px solid transparent; border-top-color: rgba(0,0,0,.75); content: ''; transform: translateX(-50%); }
.kgc-tip-title { margin-bottom: 2px; font-weight: 700; }
.kgc-tip-row { display: flex; gap: 6px; white-space: normal; word-break: break-word; }
.kgc-tip-k { opacity: .8; }
</style>
