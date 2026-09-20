<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{
  option: Record<string, unknown> | null
  imageUrl?: string | null
  imageSize?: { width: number; height: number } | null
}>()

const chartElement = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

// Agentic results are several thousand pixels tall (Gapminder is 4004 × 6704). The container
// scrolls instead of squeezing them to the panel height, and starts the image at the top edge
// so the first rows stay reachable.
const isLong = computed(() => Boolean(props.imageSize && props.imageSize.height >= 2400))

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

onBeforeUnmount(() => {
  disposeChart()
})
</script>

<template>
  <div v-if="imageUrl" class="chart-image-wrap" :class="{ tall: isLong }">
    <img :src="imageUrl" alt="Generated chart" class="chart-image" />
  </div>
  <div v-else-if="!option" class="chart-empty">
    <div class="chart-empty-mark">◌</div>
    <strong>Waiting for chart generation</strong>
    <span>Upload or select a KG, then run inspection to start generation.</span>
  </div>
  <div v-else ref="chartElement" class="chart-canvas"></div>
</template>
