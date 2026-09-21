import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { chartApi } from '../data/snapshotRepository'
import type { GenerationListItem, GenerationResponse, InspectResponse, JobSnapshot, SampleInfo } from '../types/chartkg'

export const useWorkspaceStore = defineStore('workspace', () => {
  const sourceFile = ref<File | null>(null)
  const inspectResult = ref<InspectResponse | null>(null)
  const generation = ref<GenerationResponse | null>(null)
  const job = ref<JobSnapshot | null>(null)
  const history = ref<GenerationListItem[]>([])
  const datasets = ref<SampleInfo[]>([])
  const optionText = ref('')
  const settings = ref({
    width: 1600,
    height: 1000,
    renderPng: true,
    pipeline: 'agentic' as 'agentic' | 'native',
    instruction: '',
    maxIterations: 3,
    qualityThreshold: 0.9,
  })
  const activePanel = ref<'overview' | 'coverage' | 'option' | 'report'>('overview')
  const isInspecting = ref(false)
  const isGenerating = ref(false)
  const error = ref('')
  let pollTimer: number | undefined

  const option = computed(() => generation.value?.option || null)
  const imageUrl = computed(() => {
    if (generation.value?.pipeline === 'native' && generation.value.option) return null
    const path = generation.value?.artifacts.png
    return path ? chartApi.artifactUrl(path) : null
  })
  const imageSize = computed(() => {
    const item = generation.value
    return item?.width && item.height ? { width: item.width, height: item.height } : null
  })
  const isReady = computed(() => Boolean(inspectResult.value?.valid))
  /** Dataset id of the loaded source, without the static- prefix used by the snapshot reader. */
  const activeDatasetId = computed(() => inspectResult.value?.datasetId?.replace(/^static-/, '') ?? '')

  function selectFile(file: File) {
    sourceFile.value = file
    inspectResult.value = null
    generation.value = null
    job.value = null
    optionText.value = ''
    settings.value = {
      width: 1600,
      height: 1000,
      renderPng: true,
      pipeline: 'agentic',
      instruction: '',
      maxIterations: 3,
      qualityThreshold: 0.9,
    }
    error.value = ''
  }

  async function loadSample(sampleId: string) {
    try {
      const file = await chartApi.getSample(sampleId)
      selectFile(file)
      await inspectSource()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to load sample'
    }
  }

  async function inspectSource() {
    if (!sourceFile.value) {
      error.value = 'Select a readable-KG JSON or CSV file, or load a sample first.'
      return
    }
    isInspecting.value = true
    error.value = ''
    try {
      inspectResult.value = await chartApi.inspect(sourceFile.value)
      activePanel.value = 'overview'
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'KG inspection failed'
    } finally {
      isInspecting.value = false
    }
  }

  function handleCompleted(jobId: string) {
    void chartApi.getGeneration(jobId).then((result) => {
      generation.value = result
      // Report the stored result size, not the default canvas, once a snapshot is loaded.
      if (result.width && result.height) {
        settings.value.width = result.width
        settings.value.height = result.height
      }
      optionText.value = result.code || JSON.stringify(result.option || {}, null, 2)
      isGenerating.value = false
      clearJobListeners()
      void refreshHistory()
    }).catch((cause) => {
      error.value = cause instanceof Error ? cause.message : 'Failed to load generation result'
      isGenerating.value = false
      clearJobListeners()
    })
  }

  function handleJobUpdate(snapshot: JobSnapshot, jobId: string) {
    job.value = snapshot
    if (snapshot.status === 'completed') handleCompleted(jobId)
    if (snapshot.status === 'failed') {
      error.value = snapshot.error || snapshot.message
      isGenerating.value = false
      clearJobListeners()
    }
  }

  function startPolling(jobId: string) {
    clearJobListeners()
    pollTimer = window.setInterval(async () => {
      try {
        const snapshot = await chartApi.getJob(jobId)
        handleJobUpdate(snapshot, jobId)
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : 'Failed to load job status'
        isGenerating.value = false
        clearJobListeners()
      }
    }, 700)
  }

  async function startGeneration(nextSettings = settings.value) {
    if (!inspectResult.value) await inspectSource()
    if (!inspectResult.value) return
    isGenerating.value = true
    error.value = ''
    generation.value = null
    try {
      const { jobId } = await chartApi.createGeneration({
        datasetId: inspectResult.value.datasetId,
        ...nextSettings,
      })
      job.value = await chartApi.getJob(jobId)
      startPolling(jobId)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to create generation job'
      isGenerating.value = false
    }
  }

  /** Load the default Gapminder snapshot directly when the workspace opens. */
  async function loadDefaultSnapshot() {
    if (generation.value || isGenerating.value) return
    try {
      const item = (await chartApi.listGenerations()).find((entry) => entry.datasetId === 'static-gapminder' && entry.pipeline === 'agentic')
      if (item) await selectSnapshot(item.id, 'agentic')
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to load the default snapshot'
      isGenerating.value = false
    }
  }

  async function selectSnapshot(jobId: string, pipeline: 'agentic' | 'native' = 'agentic') {
    clearJobListeners()
    error.value = ''
    isGenerating.value = true
    try {
      const snapshot = await chartApi.getJob(jobId)
      const sourceId = snapshot.datasetId?.replace(/^static-/, '') || 'gapminder'
      const file = await chartApi.getSample(sourceId)
      selectFile(file)
      settings.value.pipeline = pipeline
      await inspectSource()
      job.value = snapshot
      await new Promise((resolve) => window.setTimeout(resolve, 260))
      await handleCompleted(jobId)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to load the static snapshot'
      isGenerating.value = false
    }
  }

  async function saveRevision(settings: { width: number; height: number; renderPng: boolean }) {
    if (!generation.value) return
    try {
      const nextOption = JSON.parse(optionText.value) as Record<string, unknown>
      const { jobId } = await chartApi.createRevision(generation.value.id, nextOption, settings)
      isGenerating.value = true
      job.value = await chartApi.getJob(jobId)
      startPolling(jobId)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to create revision job'
    }
  }

  function applyOption() {
    try {
      const nextOption = JSON.parse(optionText.value) as Record<string, unknown>
      if (!Array.isArray(nextOption.series) || nextOption.series.length === 0) throw new Error('Option must contain at least one series.')
      if (generation.value) generation.value = { ...generation.value, option: nextOption }
      error.value = ''
    } catch (cause) {
      error.value = cause instanceof Error ? `Option validation failed: ${cause.message}` : 'Option validation failed'
    }
  }

  function formatOption() {
    try {
      optionText.value = JSON.stringify(JSON.parse(optionText.value), null, 2)
      error.value = ''
    } catch (cause) {
      error.value = cause instanceof Error ? `Invalid JSON: ${cause.message}` : 'Invalid JSON'
    }
  }

  async function refreshHistory() {
    try {
      history.value = await chartApi.listGenerations()
    } catch {
      // History is supplementary; a failed refresh should not interrupt generation.
    }
  }

  async function refreshDatasets() {
    try {
      datasets.value = await chartApi.listSamples()
    } catch {
      // The dataset picker is supplementary; keep whatever list is already loaded.
    }
  }

  /** Switch datasets from the workspace header while keeping the current generation mode. */
  async function selectDataset(datasetId: string) {
    if (datasetId === activeDatasetId.value) return
    await loadSample(datasetId)
    if (inspectResult.value) await startGeneration(settings.value)
  }

  /** Switch between the Agentic and Native snapshot of the loaded dataset. */
  async function selectPipeline(pipeline: 'agentic' | 'native') {
    settings.value.pipeline = pipeline
    if (!inspectResult.value) await inspectSource()
    if (inspectResult.value) await startGeneration(settings.value)
  }

  function clearJobListeners() {
    if (pollTimer !== undefined) window.clearInterval(pollTimer)
    pollTimer = undefined
  }

  function resetWorkspace() {
    clearJobListeners()
    sourceFile.value = null
    inspectResult.value = null
    generation.value = null
    job.value = null
    optionText.value = ''
    activePanel.value = 'overview'
    isInspecting.value = false
    isGenerating.value = false
    error.value = ''
  }

  return {
    sourceFile,
    inspectResult,
    generation,
    job,
    history,
    datasets,
    optionText,
    settings,
    activePanel,
    isInspecting,
    isGenerating,
    error,
    option,
    imageUrl,
    imageSize,
    isReady,
    activeDatasetId,
    selectFile,
    loadSample,
    inspectSource,
    startGeneration,
    loadDefaultSnapshot,
    selectSnapshot,
    refreshDatasets,
    selectDataset,
    selectPipeline,
    saveRevision,
    applyOption,
    formatOption,
    refreshHistory,
    clearJobListeners,
    resetWorkspace,
  }
})
