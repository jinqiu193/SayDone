<template>
  <div class="flex h-full overflow-hidden">
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Header -->
      <div class="page-header">
        <div class="page-header-icon">
          <svg class="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
        </div>
        <div>
          <h1 class="page-header-title">统计仪表盘</h1>
          <p class="page-header-desc">知识库系统运行数据概览</p>
        </div>
        <button class="ml-auto text-xs text-gray-400 hover:text-primary-600 transition-all duration-200 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-primary-50" @click="loadData">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          刷新
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto px-6 py-5">
        <div v-if="loading" class="flex flex-col items-center justify-center h-full text-sm text-gray-400">
          <svg class="w-8 h-8 animate-spin mb-3 text-primary-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          加载中...
        </div>

        <template v-else-if="data">
          <!-- 核心指标卡片 -->
          <div class="grid grid-cols-4 gap-4 mb-6">
            <div class="group bg-white rounded-xl border border-gray-100/80 px-5 py-4 hover:shadow-lg hover:shadow-primary-500/5 hover:border-primary-100/60 transition-all duration-300">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-medium text-gray-400">知识库</span>
                <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-sm shadow-primary-500/20 group-hover:scale-110 transition-transform duration-300">
                  <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                  </svg>
                </div>
              </div>
              <div class="text-2xl font-bold text-gray-900 tracking-tight">{{ data.kb.total }}</div>
              <div class="text-xs text-gray-400 mt-1">个知识库</div>
            </div>

            <div class="group bg-white rounded-xl border border-gray-100/80 px-5 py-4 hover:shadow-lg hover:shadow-emerald-500/5 hover:border-emerald-100/60 transition-all duration-300">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-medium text-gray-400">文档</span>
                <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm shadow-emerald-500/20 group-hover:scale-110 transition-transform duration-300">
                  <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                  </svg>
                </div>
              </div>
              <div class="text-2xl font-bold text-gray-900 tracking-tight">{{ data.documents.total }}</div>
              <div class="text-xs text-gray-400 mt-1">{{ formatSize(data.documents.total_file_size) }} · {{ data.documents.total_chunks }} 分块</div>
            </div>

            <div class="group bg-white rounded-xl border border-gray-100/80 px-5 py-4 hover:shadow-lg hover:shadow-sky-500/5 hover:border-sky-100/60 transition-all duration-300">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-medium text-gray-400">向量</span>
                <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-sm shadow-sky-500/20 group-hover:scale-110 transition-transform duration-300">
                  <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
                  </svg>
                </div>
              </div>
              <div class="text-2xl font-bold text-gray-900 tracking-tight">{{ data.vectors.total }}</div>
              <div class="text-xs text-gray-400 mt-1">条向量记录</div>
            </div>

            <div class="group bg-white rounded-xl border border-gray-100/80 px-5 py-4 hover:shadow-lg hover:shadow-amber-500/5 hover:border-amber-100/60 transition-all duration-300">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-medium text-gray-400">对话</span>
                <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm shadow-amber-500/20 group-hover:scale-110 transition-transform duration-300">
                  <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                  </svg>
                </div>
              </div>
              <div class="text-2xl font-bold text-gray-900 tracking-tight">{{ data.conversations.total }}</div>
              <div class="text-xs text-gray-400 mt-1">{{ data.conversations.user_message_total }} 次提问</div>
            </div>
          </div>

          <!-- 图表区域：趋势 + 分布 -->
          <div class="grid grid-cols-2 gap-4 mb-6">
            <!-- 7天对话趋势 -->
            <div class="bg-white rounded-xl border border-gray-100 p-5">
              <h3 class="text-sm font-semibold text-gray-800 mb-4">近 7 天对话趋势</h3>
              <div class="flex items-end gap-2 h-32">
                <div v-for="item in data.daily_chats" :key="item.date" class="flex-1 flex flex-col items-center gap-1">
                  <div class="w-full rounded-t-md transition-all" 
                    :class="item.count > 0 ? 'bg-primary-400' : 'bg-gray-100'"
                    :style="{ height: barHeight(item.count, maxDailyChat) + 'px' }">
                  </div>
                  <span class="text-[10px] text-gray-400">{{ item.date.slice(5) }}</span>
                </div>
              </div>
              <div class="flex items-center justify-between mt-3 text-xs text-gray-400">
                <span>日均 {{ avgDailyChat }} 次对话</span>
                <span>共 {{ weeklyChatTotal }} 次</span>
              </div>
            </div>

            <!-- 7天提问趋势 -->
            <div class="bg-white rounded-xl border border-gray-100 p-5">
              <h3 class="text-sm font-semibold text-gray-800 mb-4">近 7 天提问趋势</h3>
              <div class="flex items-end gap-2 h-32">
                <div v-for="item in data.daily_questions" :key="item.date" class="flex-1 flex flex-col items-center gap-1">
                  <div class="w-full rounded-t-md transition-all"
                    :class="item.count > 0 ? 'bg-primary-300' : 'bg-gray-100'"
                    :style="{ height: barHeight(item.count, maxDailyQuestion) + 'px' }">
                  </div>
                  <span class="text-[10px] text-gray-400">{{ item.date.slice(5) }}</span>
                </div>
              </div>
              <div class="flex items-center justify-between mt-3 text-xs text-gray-400">
                <span>日均 {{ avgDailyQuestion }} 次提问</span>
                <span>共 {{ weeklyQuestionTotal }} 次</span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 mb-6">
            <!-- 文件类型分布 -->
            <div class="bg-white rounded-xl border border-gray-100 p-5">
              <h3 class="text-sm font-semibold text-gray-800 mb-4">文件类型分布</h3>
              <div v-if="!Object.keys(data.documents.by_type).length" class="text-sm text-gray-400 py-6 text-center">暂无数据</div>
              <div v-else class="space-y-3">
                <div v-for="(count, type) in data.documents.by_type" :key="type">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs text-gray-600 flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: typeColor(type) }"></span>
                      {{ type.toUpperCase() }}
                    </span>
                    <span class="text-xs text-gray-400">{{ count }} 个</span>
                  </div>
                  <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all" :style="{ width: (count / data.documents.total * 100) + '%', backgroundColor: typeColor(type) }"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 知识库文档分布 -->
            <div class="bg-white rounded-xl border border-gray-100 p-5">
              <h3 class="text-sm font-semibold text-gray-800 mb-4">知识库文档分布</h3>
              <div v-if="!data.kb_doc_distribution.length" class="text-sm text-gray-400 py-6 text-center">暂无数据</div>
              <div v-else class="space-y-3">
                <div v-for="item in data.kb_doc_distribution" :key="item.name">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs text-gray-600 truncate max-w-[180px]" :title="item.name">{{ item.name }}</span>
                    <span class="text-xs text-gray-400">{{ item.doc_count }} 篇</span>
                  </div>
                  <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-full bg-primary-400 rounded-full transition-all" :style="{ width: (item.doc_count / maxKbDoc * 100) + '%' }"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <!-- 热门问题 -->
            <div class="bg-white rounded-xl border border-gray-100 p-5">
              <h3 class="text-sm font-semibold text-gray-800 mb-4">热门问题</h3>
              <div v-if="!data.hot_questions.length" class="text-sm text-gray-400 py-6 text-center">暂无数据</div>
              <div v-else class="space-y-2">
                <div v-for="(item, idx) in data.hot_questions" :key="idx"
                  class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition">
                  <span class="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                    :class="idx < 3 ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-400'">
                    {{ idx + 1 }}
                  </span>
                  <span class="text-sm text-gray-700 truncate flex-1" :title="item.question">{{ item.question }}</span>
                  <span class="text-xs text-gray-400 flex-shrink-0">{{ item.count }}次</span>
                </div>
              </div>
            </div>

            <!-- 引用排行 -->
            <div class="bg-white rounded-xl border border-gray-100 p-5">
              <h3 class="text-sm font-semibold text-gray-800 mb-4">文档引用排行</h3>
              <div v-if="!data.cited_docs.length" class="text-sm text-gray-400 py-6 text-center">暂无数据</div>
              <div v-else class="space-y-2">
                <div v-for="(item, idx) in data.cited_docs" :key="idx"
                  class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition">
                  <span class="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                    :class="idx < 3 ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-400'">
                    {{ idx + 1 }}
                  </span>
                  <span class="text-sm text-gray-700 truncate flex-1" :title="item.filename">{{ item.filename }}</span>
                  <span class="text-xs text-gray-400 flex-shrink-0">{{ item.count }}次</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { sysApi } from '@/api'

const loading = ref(false)
const data = ref(null)

async function loadData() {
  loading.value = true
  try {
    const res = await sysApi.dashboard()
    data.value = res.data
  } catch {}
  loading.value = false
}

const formatSize = (b) => {
  if (!b) return '0 B'
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB'
  return (b / 1024).toFixed(1) + ' KB'
}

const typeColor = (type) => {
  const map = { pdf: '#EF4444', doc: '#3B82F6', docx: '#3B82F6', word: '#3B82F6', xlsx: '#10B981', xls: '#10B981', txt: '#8B5CF6', md: '#8B5CF6', csv: '#F59E0B', jpg: '#EC4899', png: '#EC4899' }
  return map[type] || '#6B7280'
}

const barHeight = (count, max) => {
  if (!max) return 4
  return Math.max(4, (count / max) * 120)
}

const maxDailyChat = computed(() => {
  if (!data.value?.daily_chats) return 0
  return Math.max(...data.value.daily_chats.map(d => d.count), 1)
})

const maxDailyQuestion = computed(() => {
  if (!data.value?.daily_questions) return 0
  return Math.max(...data.value.daily_questions.map(d => d.count), 1)
})

const maxKbDoc = computed(() => {
  if (!data.value?.kb_doc_distribution?.length) return 1
  return Math.max(...data.value.kb_doc_distribution.map(d => d.doc_count), 1)
})

const weeklyChatTotal = computed(() => data.value?.daily_chats?.reduce((s, d) => s + d.count, 0) || 0)
const weeklyQuestionTotal = computed(() => data.value?.daily_questions?.reduce((s, d) => s + d.count, 0) || 0)
const avgDailyChat = computed(() => (weeklyChatTotal.value / 7).toFixed(1))
const avgDailyQuestion = computed(() => (weeklyQuestionTotal.value / 7).toFixed(1))

onMounted(() => loadData())
</script>
