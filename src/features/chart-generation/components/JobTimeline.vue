<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceStore } from '../stores/workspace'

const store = useWorkspaceStore()
const stages = [
  ['queued', 'Job queued'],
  ['ingesting', 'Reading JSON'],
  ['context_built', 'Building context'],
  ['understanding', 'Understanding'],
  ['planning', 'Planning visualization'],
  ['generation', 'Generating code'],
  ['requirement_analyzing', 'Analyzing requirements'],
  ['mapping', 'Mapping data'],
  ['designing', 'Planning layout'],
  ['option_generating', 'Generating option'],
  ['model_generating', 'Model generation'],
  ['debugging', 'Debugging code'],
  ['validating', 'Validating option'],
  ['option_generated', 'Option ready'],
  ['rendering', 'Rendering chart'],
  ['visual_evaluating', 'Evaluating image'],
  ['refining', 'Refining chart'],
  ['completed', 'Completed'],
] as const

const activeIndex = computed(() => {
  const status = store.job?.status
  const index = stages.findIndex(([key]) => key === status)
  return index
})
</script>

<template>
  <section class="panel timeline-panel">
    <div class="panel-heading compact">
      <div>
        <span class="eyebrow">PIPELINE</span>
        <h2>Snapshot Loading</h2>
      </div>
      <span v-if="store.job" class="progress-number">{{ store.job.progress }}%</span>
    </div>
    <div v-if="!store.job" class="empty-inline">Choose a dataset and mode to load its pre-generated result.</div>
    <template v-else>
      <div class="timeline-note">PRE-GENERATED RESULT · stored pipeline stages, no model is called</div>
      <div class="progress-track"><span :style="{ width: `${store.job.progress}%` }"></span></div>
      <div class="job-message">{{ store.job.message }}</div>
      <div class="timeline-list">
        <div v-for="([key, label], index) in stages" :key="key" class="timeline-item" :class="{ done: index < activeIndex, active: index === activeIndex }">
          <span class="timeline-dot">{{ index < activeIndex ? '✓' : index + 1 }}</span>
          <span>{{ label }}</span>
        </div>
      </div>
    </template>
  </section>
</template>
