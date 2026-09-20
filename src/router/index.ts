import { createRouter, createWebHashHistory } from 'vue-router'

const GraphRAGView = () => import('../views/GraphRAGView.vue')
const GenerationLayout = () => import('../features/chart-generation/views/GenerationLayout.vue')
const GenerationWorkspaceView = () => import('../features/chart-generation/views/WorkspaceView.vue')
const GenerationHistoryView = () => import('../features/chart-generation/views/HistoryView.vue')

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/graphrag' },
    { path: '/graphrag', name: 'graphrag', component: GraphRAGView },
    {
      path: '/generation',
      component: GenerationLayout,
      children: [
        { path: '', name: 'generation', component: GenerationWorkspaceView },
        { path: 'history', name: 'generation-history', component: GenerationHistoryView },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/graphrag' },
  ],
})

export default router
