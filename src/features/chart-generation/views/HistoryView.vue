<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '../stores/workspace'
import type { GenerationListItem } from '../types/chartkg'

const store = useWorkspaceStore()
const router = useRouter()
onMounted(() => store.refreshHistory())

async function open(item: GenerationListItem) {
  await store.selectSnapshot(item.id, item.pipeline ?? 'agentic')
  await router.push('/generation')
}
</script>

<template>
  <div class="history-page">
    <div class="page-heading">
      <span class="eyebrow">RUN HISTORY</span>
      <h1>Generation History</h1>
      <p>Four pre-generated Agentic and Native snapshots bundled with this static site. Selecting one loads its stored result.</p>
    </div>
    <section class="panel history-card">
      <div v-if="!store.history.length" class="empty-inline">Loading the bundled snapshots…</div>
      <div v-else v-for="item in store.history" :key="item.id" class="history-row" :class="{ current: item.id === store.generation?.id }">
        <div><span :class="['history-status', item.status === 'completed' ? 'complete' : item.status === 'failed' ? 'failed' : 'running']"></span><strong>{{ item.filename }}</strong></div>
        <span>
          {{ item.message }}<template v-if="item.qualityScore"> · quality score {{ item.qualityScore }}</template>
        </span>
        <button class="ghost-button" @click="open(item)">View Generated Result</button>
      </div>
    </section>
  </div>
</template>
