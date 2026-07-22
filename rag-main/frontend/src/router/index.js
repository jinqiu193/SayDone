import { createRouter, createWebHistory } from 'vue-router'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '统计仪表盘' } },
    { path: '/kb', component: () => import('@/views/KbList.vue'), meta: { title: '知识库' } },
    { path: '/kb/:id', component: () => import('@/views/KbDetail.vue'), meta: { title: '知识库详情' } },
    { path: '/chat', component: () => import('@/views/ChatView.vue'), meta: { title: '发起对话' } },
    { path: '/docgen', component: () => import('@/views/DocGenView.vue'), meta: { title: '长文档生成' } },
    { path: '/dochistory', component: () => import('@/views/DocHistoryView.vue'), meta: { title: '已生成长文档' } },
    { path: '/settings', component: () => import('@/views/SettingsView.vue'), meta: { title: '系统设置' } },
    { path: '/kb/:id/chat', component: () => import('@/views/ChatView.vue'), meta: { title: '对话' } },
    { path: '/kb/:id/docs', component: () => import('@/views/DocList.vue'), meta: { title: '文档管理' } },
  ]
})
