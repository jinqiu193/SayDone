<template>
  <teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/40" @click="visible = false"></div>

      <!-- Modal -->
      <div class="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-base font-semibold text-gray-900">系统设置</h2>
          <button class="p-1 rounded-lg hover:bg-gray-100 transition-colors" @click="visible = false">
            <svg class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          <!-- LLM Backend -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">LLM 后端</label>
            <div class="flex gap-3">
              <label v-for="b in backends" :key="b.value"
                class="flex-1 flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all"
                :class="form.llm_backend === b.value
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'">
                <input type="radio" :value="b.value" v-model="form.llm_backend" class="sr-only" />
                <div class="w-8 h-8 rounded-lg flex items-center justify-center"
                  :class="form.llm_backend === b.value ? 'bg-primary-100' : 'bg-gray-100'">
                  <span v-html="b.icon" class="text-base"></span>
                </div>
                <div>
                  <p class="text-sm font-medium text-gray-800">{{ b.label }}</p>
                  <p class="text-xs text-gray-500">{{ b.desc }}</p>
                </div>
              </label>
            </div>
          </div>

          <!-- Ollama Config -->
          <div v-if="form.llm_backend === 'ollama'" class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Ollama 地址</label>
              <input v-model="form.ollama_url" type="text"
                class="input w-full text-sm" placeholder="http://localhost:11434" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">对话模型</label>
              <input v-model="form.ollama_model" type="text"
                class="input w-full text-sm" placeholder="qwen3.5:9b" />
              <p class="text-xs text-gray-400 mt-1">切换模型后需重启后端生效</p>
            </div>
          </div>

          <!-- External API Config -->
          <div v-if="form.llm_backend === 'external'" class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">API 地址</label>
              <input v-model="form.ext_api_base" type="text"
                class="input w-full text-sm" placeholder="https://api.minimaxi.com/anthropic/v1" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">API 密钥</label>
              <input v-model="form.ext_api_key" type="password"
                class="input w-full text-sm" placeholder="输入密钥，仅本地存储" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">模型名称</label>
              <input v-model="form.ext_model" type="text"
                class="input w-full text-sm" placeholder="如 MiniMax-Text-01" />
            </div>
            <div class="flex gap-3">
              <div class="flex-1">
                <label class="block text-xs font-medium text-gray-500 mb-1">最大 Token</label>
                <input v-model.number="form.ext_max_tokens" type="number"
                  class="input w-full text-sm" placeholder="2048" />
              </div>
              <div class="flex-1">
                <label class="block text-xs font-medium text-gray-500 mb-1">Temperature</label>
                <input v-model.number="form.ext_temperature" type="number" step="0.1" min="0" max="2"
                  class="input w-full text-sm" placeholder="0.3" />
              </div>
            </div>
          </div>

          <!-- Embedding Model (shared) -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Embedding 模型</label>
            <input v-model="form.embedding_model" type="text"
              class="input w-full text-sm" placeholder="nomic-embed-text:latest" />
            <p class="text-xs text-gray-400 mt-1">切换模型后需重启后端生效</p>
          </div>

          <!-- Current status -->
          <div class="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-2">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full" :class="health?.ollama ? 'bg-green-400' : 'bg-gray-300'"></span>
              <span class="text-sm text-gray-600">{{ health?.ollama ? 'Ollama 已连接' : 'Ollama 未连接' }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500 w-20">当前后端：</span>
              <span class="text-sm text-gray-700">{{ form.llm_backend }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500 w-20">对话模型：</span>
              <span class="text-sm text-gray-700">{{ health?.llm_model || '-' }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500 w-20">Embedding：</span>
              <span class="text-sm text-gray-700">{{ health?.embedding_model || '-' }}</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button class="btn-ghost px-4 py-2 text-sm" @click="visible = false">取消</button>
          <button class="btn-primary px-5 py-2 text-sm" @click="save" :disabled="saving">
            <svg v-if="saving" class="w-4 h-4 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {{ saving ? '保存中…' : '保存设置' }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { sysApi } from '@/api'
import { useAppStore } from '@/stores/app'

const props = defineProps({ health: Object })
const emit = defineEmits(['updated'])

const appStore = useAppStore()
const visible = ref(false)
const saving = ref(false)

const backends = [
  {
    value: 'ollama',
    label: 'Ollama',
    desc: '本地模型',
    icon: '&#x1F4BB;',
  },
  {
    value: 'external',
    label: '外部 API',
    desc: 'Minimax / OpenAI 等',
    icon: '&#x1F310;',
  },
]

const form = ref({
  llm_backend: 'ollama',
  ollama_url: 'http://localhost:11434',
  ollama_model: '',
  ext_api_base: '',
  ext_api_key: '',
  ext_model: '',
  ext_max_tokens: 2048,
  ext_temperature: 0.3,
  embedding_model: 'nomic-embed-text:latest',
})

async function loadSettings() {
  try {
    const d = await sysApi.settings()
    form.value = {
      llm_backend:      d.llm_backend    || 'ollama',
      ollama_url:        d.ollama_url     || 'http://localhost:11434',
      ollama_model:      d.ollama_model   || '',
      ext_api_base:      d.ext_api_base    || '',
      ext_api_key:       '',               // never read back
      ext_model:         d.ext_model       || '',
      ext_max_tokens:    d.ext_max_tokens || 2048,
      ext_temperature:   d.ext_temperature || 0.3,
      embedding_model:   d.embedding_model || 'nomic-embed-text:latest',
    }
  } catch (e) {
    appStore.showToast('加载设置失败: ' + e.message, 'error')
  }
}

async function save() {
  saving.value = true
  try {
    await sysApi.updateSettings({
      llm_backend:     form.value.llm_backend,
      ollama_url:      form.value.ollama_url,
      ollama_model:    form.value.ollama_model,
      ext_api_key:     form.value.ext_api_key,
      ext_api_base:    form.value.ext_api_base,
      ext_model:       form.value.ext_model,
      ext_max_tokens:  form.value.ext_max_tokens,
      ext_temperature:  form.value.ext_temperature,
    })
    appStore.showToast('设置已保存', 'success')
    visible.value = false
    emit('updated')
  } catch (e) {
    appStore.showToast('保存失败: ' + e.message, 'error')
  } finally {
    saving.value = false
  }
}

watch(visible, (v) => { if (v) loadSettings() })

defineExpose({ open: () => { visible.value = true } })
</script>
