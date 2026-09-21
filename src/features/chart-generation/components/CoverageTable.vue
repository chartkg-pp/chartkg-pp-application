<script setup lang="ts">
import { computed } from 'vue'
import type { ExtractionReport } from '../types/chartkg'

const props = defineProps<{ report: ExtractionReport | null }>()

const rows = computed(() => {
  if (!props.report) return []
  return Object.entries(props.report.group_coverage).flatMap(([groupId, group]) =>
    group.expected_encoded_variables.map((variable) => {
      const observed = group.observed_value_counts[variable] || 0
      const missing = group.missing_value_counts[variable] || 0
      return { groupId, variable, total: group.mark_count, observed, missing, ratio: group.mark_count ? observed / group.mark_count : 0 }
    }),
  )
})
</script>

<template>
  <div v-if="!report" class="empty-inline">Run KG inspection to view evaluation metrics.</div>
  <div v-else class="coverage-wrap">
    <div class="coverage-summary">
      <div><span>Mark</span><strong>{{ report.mark_count }}</strong></div>
      <div><span>Ternary Coordinates</span><strong>{{ report.derived_ternary_record_count }}</strong></div>
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>Mark Group</th><th>Variable</th><th>Coverage</th><th>Missing</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="`${row.groupId}-${row.variable}`">
            <td class="muted">{{ row.groupId }}</td>
            <td>{{ row.variable }}</td>
            <td>
              <div class="coverage-cell"><span class="mini-bar"><i :style="{ width: `${row.ratio * 100}%` }"></i></span><span>{{ Math.round(row.ratio * 100) }}%</span></div>
            </td>
            <td><span :class="['missing-value', { good: row.missing === 0 }]">{{ row.missing }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
