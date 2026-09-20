<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <KeepAlive>
      <component :is="Component" :key="route.matched[0]?.path" />
    </KeepAlive>
  </RouterView>
</template>
