<template>
  <div class="flex h-screen overflow-hidden bg-gray-50/80">
    <!-- Sidebar -->
    <aside class="w-[232px] flex-shrink-0 flex flex-col bg-white border-r border-gray-100/80">
      <!-- Logo -->
      <div class="h-16 flex items-center px-5 border-b border-gray-100/60">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm shadow-primary-500/30">
            <svg class="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div>
            <span class="font-bold text-gray-900 text-sm tracking-tight">ModelX RAG</span>
            <p class="text-[10px] text-gray-400 -mt-0.5">智能知识库平台</p>
          </div>
        </div>
      </div>

      <!-- Nav -->
      <nav class="flex-1 px-3 py-4 space-y-1">
        <div class="px-3 mb-2">
          <span class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">导航</span>
        </div>
        <router-link to="/dashboard" class="nav-item" :class="{'nav-active': $route.path === '/dashboard'}">
          <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
          <span>仪表盘</span>
        </router-link>
        <router-link to="/kb" class="nav-item" :class="{'nav-active': $route.path.startsWith('/kb') && !$route.path.includes('/chat')}">
          <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span>知识库</span>
        </router-link>
        <router-link to="/chat" class="nav-item" :class="{'nav-active': $route.path === '/chat'}">
          <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span>发起对话</span>
        </router-link>

        <div class="px-3 mt-5 mb-2">
          <span class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">工具</span>
        </div>
        <router-link to="/docgen" class="nav-item" :class="{'nav-active': $route.path === '/docgen'}">
          <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <span>文档生成</span>
        </router-link>
        <router-link to="/dochistory" class="nav-item" :class="{'nav-active': $route.path === '/dochistory'}">
          <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>
          </svg>
          <span>历史文档</span>
        </router-link>

        <div class="px-3 mt-5 mb-2">
          <span class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">系统</span>
        </div>
        <router-link to="/settings" class="nav-item" :class="{'nav-active': $route.path === '/settings'}">
          <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>系统设置</span>
        </router-link>
      </nav>

      <!-- System status -->
      <div class="px-3 pb-3 pt-2 border-t border-gray-100/60">
        <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors"
          :class="health?.ollama ? 'bg-primary-50/60 text-primary-700' : 'bg-gray-50 text-gray-500'">
          <span class="w-2 h-2 rounded-full flex-shrink-0"
            :class="health?.ollama ? 'bg-primary-400 pulse-glow' : 'bg-gray-300'"></span>
          <span class="font-medium">{{ health?.ollama ? 'Ollama 已连接' : 'Ollama 未连接' }}</span>
        </div>
        <div class="px-3 py-1 text-[11px] text-gray-400 truncate" v-if="health?.llm_model">
          {{ health.llm_model }}
        </div>
      </div>
    </aside>

    <!-- Settings Modal -->
    <SettingsModal ref="settingsModal" :health="health" @updated="reloadHealth" />

    <!-- Main content -->
    <main class="flex-1 overflow-hidden flex flex-col min-w-0">
      <router-view />
    </main>

    <!-- toast -->
    <transition name="fade">
      <div v-if="appStore.toast" class="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl backdrop-blur-sm text-sm font-medium"
        :class="{
          'bg-gray-900/90 text-white': appStore.toast.type === 'info',
          'bg-emerald-600/90 text-white': appStore.toast.type === 'success',
          'bg-red-600/90 text-white':   appStore.toast.type === 'error',
        }">
        <svg v-if="appStore.toast.type === 'success'" class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
        <svg v-else-if="appStore.toast.type === 'error'" class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        <svg v-else class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <span>{{ appStore.toast.msg }}</span>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { sysApi } from '@/api'

const appStore = useAppStore()
const health = ref(null)

async function reloadHealth() {
  try { health.value = await sysApi.health() } catch {}
}

onMounted(async () => {
  await reloadHealth()
  setInterval(reloadHealth, 30000)
})
</script>

<style>
.nav-item {
  @apply flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] text-gray-500
         hover:bg-gray-50 hover:text-gray-800 transition-all duration-200 cursor-pointer;
}
.nav-active {
  @apply bg-primary-50/80 text-primary-700 font-semibold
         shadow-sm shadow-primary-500/5;
}
.nav-active svg {
  @apply text-primary-500;
}
</style>
