<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{
  option: Record<string, unknown> | null
  imageUrl?: string | null
  previewUrl?: string | null
  imageSize?: { width: number; height: number } | null
}>()

const chartElement = ref<HTMLDivElement | null>(null)
const zoom = ref(1)
const fullResolution = ref(false)
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

// The Agentic results are several thousand pixels tall (Gapminder is 4004 × 6704). Rendering
// one at full height in a scrolling column would decode tens of millions of pixels on first
// paint, so tall images start from a generated preview and load the untouched original only
// when the reader asks for it.
const isTall = computed(() => Boolean(props.imageSize && props.imageSize.height >= 2400))
const displayUrl = computed(() => (isTall.value && !fullResolution.value && props.previewUrl ? props.previewUrl : props.imageUrl))
const usingPreview = computed(() => isTall.value && !fullResolution.value && Boolean(props.previewUrl) && displayUrl.value === props.previewUrl)
const imageStyle = computed(() => (isTall.value ? { width: `${Math.round(zoom.value * 100)}%`, maxWidth: 'none' } : {}))

function zoomBy(factor: number) {
  zoom.value = Math.min(3, Math.max(0.2, Number((zoom.value * factor).toFixed(2))))
}

function disposeChart() {
  resizeObserver?.disconnect()
  resizeObserver = null
  chart?.dispose()
  chart = null
}

async function render() {
  if (!props.option || props.imageUrl) {
    disposeChart()
    return
  }

  await nextTick()
  if (!chartElement.value) return
  if (!chart) {
    chart = echarts.init(chartElement.value, undefined, { renderer: 'canvas' })
    resizeObserver = new ResizeObserver(() => chart?.resize())
    resizeObserver.observe(chartElement.value)
  }
  chart.clear()
  chart.setOption(props.option, { notMerge: true })
}

onMounted(() => { void render() })

watch(() => [props.option, props.imageUrl], () => { void render() }, { deep: true })

watch(() => props.imageUrl, () => {
  zoom.value = 1
  fullResolution.value = false
})

onBeforeUnmount(() => {
  disposeChart()
})
</script>

<template>
  <div v-if="imageUrl" class="chart-image-wrap" :class="{ tall: isTall }">
    <div v-if="isTall" class="chart-image-toolbar">
      <span class="chart-image-note">
        {{ usingPreview ? 'Scaled preview for first paint' : 'Original resolution' }}
        <template v-if="imageSize"> · {{ imageSize.width }} × {{ imageSize.height }}</template>
      </span>
      <button class="ghost-button" type="button" :disabled="zoom <= 0.2" @click="zoomBy(0.8)">−</button>
      <span class="chart-zoom-value">{{ Math.round(zoom * 100) }}%</span>
      <button class="ghost-button" type="button" :disabled="zoom >= 3" @click="zoomBy(1.25)">+</button>
      <button class="ghost-button" type="button" @click="zoom = 1">Fit width</button>
      <button v-if="previewUrl" class="ghost-button" type="button" @click="fullResolution = !fullResolution">
        {{ usingPreview ? 'Load original PNG' : 'Back to preview' }}
      </button>
    </div>
    <div class="chart-image-scroll">
      <img :src="displayUrl || ''" alt="Generated chart" class="chart-image" :class="{ scaled: isTall }" :style="imageStyle" />
    </div>
  </div>
  <div v-else-if="!option" class="chart-empty">
    <div class="chart-empty-mark">◌</div>
    <strong>Waiting for chart generation</strong>
    <span>Upload or select a KG, then run inspection to start generation.</span>
  </div>
  <div v-else ref="chartElement" class="chart-canvas"></div>
</template>
