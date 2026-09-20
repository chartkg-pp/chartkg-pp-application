<script setup lang="ts">
import { onMounted } from 'vue'
import { useWorkspaceStore } from '../stores/workspace'

const store = useWorkspaceStore()

onMounted(() => { void store.refreshHistory() })

function statusClass(status: string) {
  return status === 'completed' ? 'complete' : status === 'failed' ? 'failed' : 'running'
}

function load(item: { id: string; pipeline?: 'agentic' | 'native' }) {
  void store.selectSnapshot(item.id, item.pipeline ?? 'agentic')
}
</script>

<template>
  <section class="panel history-panel">
    <div class="panel-heading history-heading">
      <h2>Generation history</h2>
      <button class="tool-button" title="Refresh" @click="store.refreshHistory">↻</button>
    </div>
    <div v-if="!store.history.length" class="panel-empty">Loading the bundled snapshots…</div>
    <div v-else class="history-list">
      <button
        v-for="item in store.history"
        :key="item.id"
        class="history-row"
        :class="{ current: item.id === store.generation?.id }"
        @click="load(item)"
      >
        <span :class="['history-status', statusClass(item.status)]"></span>
        <span class="history-copy">
          <strong>{{ item.filename }}</strong>
          <small>
            {{ item.message }}<template v-if="item.qualityScore"> · score {{ item.qualityScore }}</template>
          </small>
        </span>
        <small>{{ item.pipeline === 'agentic' ? 'Agentic' : 'Native' }}</small>
      </button>
    </div>
  </section>
</template>
