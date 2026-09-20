<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const isGeneration = computed(() => route.path.startsWith('/generation'))

function switchSystem() {
  void router.push(isGeneration.value ? '/graphrag' : '/generation')
}
</script>

<template>
  <button
    class="system-switcher"
    type="button"
    :aria-label="isGeneration ? 'Switch to GraphRAG workspace' : 'Switch to chart generation workspace'"
    @click="switchSystem"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3" />
    </svg>
    {{ isGeneration ? 'GraphRAG QA' : 'Chart Generation' }}
  </button>
</template>
