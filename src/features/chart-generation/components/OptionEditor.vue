<script setup lang="ts">
import { useWorkspaceStore } from '../stores/workspace'

const store = useWorkspaceStore()
</script>

<template>
  <div class="option-editor">
    <div class="editor-actions">
      <span class="editor-hint">{{ store.generation?.pipeline === 'agentic' ? 'Python / Matplotlib code' : 'JSON / ECharts option' }}</span>
      <div>
        <button v-if="store.generation?.pipeline !== 'agentic'" class="ghost-button" :disabled="!store.generation" @click="store.formatOption">Format</button>
        <button v-if="store.generation?.pipeline !== 'agentic'" class="small-primary-button" :disabled="!store.generation" @click="store.applyOption">Apply Preview</button>
      </div>
    </div>
    <textarea v-model="store.optionText" spellcheck="false" :disabled="!store.generation || store.generation?.pipeline === 'agentic'" :class="{ 'code-editor': store.generation?.pipeline === 'agentic' }" :placeholder="store.generation?.pipeline === 'agentic' ? 'Generated Python code will appear here' : 'Generated option will appear here'"></textarea>
  </div>
</template>
