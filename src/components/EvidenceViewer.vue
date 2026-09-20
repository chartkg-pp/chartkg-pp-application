<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Evidence } from '../types'

const props = defineProps<{ imageSrc: string; evidence: Evidence[]; selectedEvidenceId: string | null; activeEvidenceIds: string[] }>()
const emit = defineEmits<{ select: [id: string] }>()
const scale = ref(1)
const stageRef = ref<HTMLElement | null>(null)
const naturalSize = ref({ width: 0, height: 0 })
const stageSize = ref({ width: 0, height: 0 })
let resizeObserver: ResizeObserver | null = null

const visibleEvidence = computed(() => {
  if (!props.activeEvidenceIds.length) return props.evidence.filter((item) => item.region)
  const active = new Set(props.activeEvidenceIds)
  return props.evidence.filter((item) => item.region && active.has(item.id))
})
const imageLayerStyle = computed(() => {
  const natural = naturalSize.value
  const stage = stageSize.value
  if (!natural.width || !natural.height || !stage.width || !stage.height) return { transform: `scale(${scale.value})` }
  const fit = Math.min(stage.width / natural.width, stage.height / natural.height)
  return {
    width: `${Math.max(1, natural.width * fit)}px`,
    height: `${Math.max(1, natural.height * fit)}px`,
    transform: `scale(${scale.value})`,
  }
})

function zoomIn() { scale.value = Math.min(2.5, scale.value + 0.2) }
function zoomOut() { scale.value = Math.max(0.5, scale.value - 0.2) }
function resetZoom() { scale.value = 1 }
function onImageLoad(event: Event) {
  const image = event.currentTarget as HTMLImageElement
  naturalSize.value = { width: image.naturalWidth, height: image.naturalHeight }
}
watch(() => props.imageSrc, () => {
  resetZoom()
  naturalSize.value = { width: 0, height: 0 }
})
onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    if (entry) stageSize.value = { width: entry.contentRect.width, height: entry.contentRect.height }
  })
  if (stageRef.value) resizeObserver.observe(stageRef.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <section class="panel evidence-panel">
    <div class="panel-heading">
      <h2>Data Visualization</h2>
      <div class="panel-tools">
        <button class="tool-button is-active" title="Select evidence"><svg viewBox="0 0 24 24"><path d="m5 3 6 16 2-6 6-2z" /></svg></button>
        <button class="tool-button" :disabled="!imageSrc" title="Zoom out" @click="zoomOut"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" /><path d="M7 10h6m2 5 5 5" /></svg></button>
        <button class="tool-button" :disabled="!imageSrc" title="Zoom in" @click="zoomIn"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" /><path d="M7 10h6m-3-3v6m5 2 5 5" /></svg></button>
        <button class="tool-button" :disabled="!imageSrc" title="Reset zoom" @click="resetZoom"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2-5.3M4 4v6h6" /></svg></button>
        <span class="tiny-badge" :title="`${evidence.length} visual provenance regions available`">{{ activeEvidenceIds.length ? visibleEvidence.length : evidence.length }}</span>
      </div>
    </div>
    <div ref="stageRef" class="image-stage" :class="{ 'has-image': imageSrc }">
      <div v-if="!imageSrc" class="empty-state">
        <svg class="empty-illustration" viewBox="0 0 80 80" aria-hidden="true"><path d="M21 30h38v29H21z" fill="#e9edf1"/><path d="M27 20h26v31H27z" fill="#f5f7f9" stroke="#d5dce2"/><path d="M31 28h18M31 35h15M31 42h11" stroke="#c3ccd4" stroke-width="2"/><path d="m21 43 10 8h18l10-8v16H21z" fill="#d7dee5"/></svg>
        <span>Upload a chart image</span>
      </div>
      <template v-else>
        <div class="image-layer" :style="imageLayerStyle">
          <img :src="imageSrc" alt="Uploaded chart" @load="onImageLoad" />
          <button
            v-for="item in visibleEvidence"
            :key="item.id"
            class="evidence-box"
            :class="{ selected: item.id === selectedEvidenceId }"
            :style="{ left: `${item.region!.x}%`, top: `${item.region!.y}%`, width: `${item.region!.width}%`, height: `${item.region!.height}%` }"
            :title="item.detail"
            @click="emit('select', item.id)"
          ><span>{{ item.id.replace('ev_', '') }}</span></button>
        </div>
      </template>
    </div>
  </section>
</template>
