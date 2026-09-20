<script setup lang="ts">
import { RouterView } from 'vue-router'
import TopBar from '../components/TopBar.vue'
import '../styles.css'
</script>

<template>
  <main class="app-shell module-generation">
    <TopBar />
    <RouterView />
  </main>
</template>
