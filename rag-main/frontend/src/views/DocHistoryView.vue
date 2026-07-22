<template>
  <div class="flex h-full overflow-hidden">
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Header -->
      <div class="flex-shrink-0 flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-white">
        <div class="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
          <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
          </svg>
        </div>
        <div>
          <h1 class="text-sm font-semibold text-gray-800">已生成长文档</h1>
          <p class="text-xs text-gray-500">查看、下载和管理已生成的长文档</p>
        </div>
        <button class="ml-auto text-xs text-gray-400 hover:text-primary-600 transition flex items-center gap-1"
          @click="loadHistory">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          刷新
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto px-6 py-5">
        <!-- Running task indicator -->
        <div v-if="runningTask" class="mb-4 bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <svg class="w-5 h-5 text-primary-500 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <div class="flex-1">
            <p class="text-sm font-medium text-primary-700">「{{ runningTask.project_name }}」正在生成中...</p>
            <p class="text-xs text-primary-500 mt-0.5">生成完成后将自动显示在此列表</p>
          </div>
        </div>

        <div v-if="loading" class="flex flex-col items-center justify-center h-full text-sm text-gray-400">
          <svg class="w-6 h-6 animate-spin mb-2" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          加载中...
        </div>
        <div v-else-if="!list.length" class="flex flex-col items-center justify-center h-full text-center">
          <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-5">
            <svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
            </svg>
          </div>
          <p class="text-sm text-gray-400">暂无已生成的长文档</p>
          <router-link to="/docgen" class="mt-3 text-xs text-primary-600 hover:text-primary-700">
            去生成一篇 →
          </router-link>
        </div>
        <div v-else class="space-y-2">
          <div v-for="doc in list" :key="doc.filename"
            class="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-primary-200 hover:bg-primary-50/30 transition-all group">
            <div class="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
              <svg class="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-800 truncate" :title="doc.title">{{ doc.title }}</p>
              <div class="flex items-center gap-3 mt-0.5">
                <span class="text-xs text-gray-400">{{ formatDate(doc.created_at) }}</span>
                <span class="text-xs text-gray-400">{{ formatSize(doc.size) }}</span>
              </div>
            </div>
            <!-- KB selector for this doc -->
            <div v-if="addingKb === doc.filename" class="flex items-center gap-1.5">
              <select v-model="selectedKbId"
                class="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-primary-400 max-w-[160px]">
                <option value="" disabled>选择知识库</option>
                <option v-for="kb in kbList" :key="kb.id" :value="kb.id">{{ kb.name }}</option>
              </select>
              <button class="p-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition"
                :disabled="!selectedKbId || kbAdding" title="确认加入"
                @click="confirmAddToKb(doc.filename)">
                <svg v-if="!kbAdding" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
                <svg v-else class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </button>
              <button class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition" title="取消"
                @click="addingKb = ''; selectedKbId = ''">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div v-else class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button class="p-1.5 rounded-lg hover:bg-green-50 text-green-500 hover:text-green-600 transition" title="加入知识库"
                @click="startAddToKb(doc.filename)">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
              </button>
              <button class="p-1.5 rounded-lg hover:bg-primary-100 text-primary-600 transition" title="下载"
                @click="downloadDoc(doc.filename)">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
              </button>
              <button class="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition" title="删除"
                @click="deleteDoc(doc)">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { docgenApi, kbApi } from '@/api'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const list = ref([])
const loading = ref(false)
const runningTask = ref(null)
let _pollTimer = null

// 加入知识库相关状态
const kbList = ref([])
const addingKb = ref('')
const selectedKbId = ref('')
const kbAdding = ref(false)

const formatSize = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1024).toFixed(1) + ' KB'
const formatDate = (d) => {
  const dt = new Date(d)
  return dt.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function loadHistory() {
  loading.value = true
  try {
    const res = await docgenApi.history()
    list.value = res.data || []
  } catch {}
  loading.value = false
}

async function loadKbList() {
  try {
    const res = await kbApi.list({ page_size: 100 })
    kbList.value = res.data.items || []
  } catch {}
}

function downloadDoc(filename) {
  window.open(docgenApi.download(filename), '_blank')
}

async function deleteDoc(doc) {
  if (!confirm(`确认删除文档「${doc.title}」？删除后无法恢复。`)) return
  try {
    await docgenApi.deleteFile(doc.filename)
    appStore.showToast('删除成功', 'success')
    await loadHistory()
  } catch (e) {
    appStore.showToast(e.message || '删除失败', 'error')
  }
}

function startAddToKb(filename) {
  addingKb.value = filename
  selectedKbId.value = ''
}

async function confirmAddToKb(filename) {
  if (!selectedKbId.value || kbAdding.value) return
  kbAdding.value = true
  try {
    const res = await docgenApi.addToKb(filename, { kb_id: selectedKbId.value })
    appStore.showToast(res.message || '已加入知识库', 'success')
    addingKb.value = ''
    selectedKbId.value = ''
  } catch (e) {
    appStore.showToast(e.message || '加入知识库失败', 'error')
  } finally {
    kbAdding.value = false
  }
}

async function checkRunning() {
  try {
    const res = await docgenApi.simpleStatus()
    const s = res.data
    if (s.status === 'running') {
      runningTask.value = s
      _pollTimer = setTimeout(checkRunning, 5000)
    } else {
      if (runningTask.value) {
        runningTask.value = null
        await loadHistory()
      }
      if (s.status === 'error' || s.status === 'done') {
        await loadHistory()
      }
      if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null }
    }
  } catch {}
}

onMounted(() => {
  loadHistory()
  loadKbList()
  checkRunning()
})

onBeforeUnmount(() => {
  if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null }
})
</script>
