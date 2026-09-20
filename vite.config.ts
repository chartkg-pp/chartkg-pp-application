import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(() => {
  const repository = process.env.GITHUB_REPOSITORY?.split('/')[1]
  return {
    base: process.env.GITHUB_ACTIONS && repository ? `/${repository}/` : '/',
    plugins: [vue()],
    server: {
      port: 5173,
    },
  }
})
