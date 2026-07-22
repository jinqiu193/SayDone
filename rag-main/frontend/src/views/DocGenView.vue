<template>
  <div class="flex h-full overflow-hidden">
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Header -->
      <div class="flex-shrink-0 flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-white">
        <div class="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
          <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <div>
          <h1 class="text-sm font-semibold text-gray-800">长文档生成</h1>
          <p class="text-xs text-gray-500">多Agent协作 · 并行撰写 · 精美排版</p>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <span class="text-xs px-2 py-1 rounded-full" :class="phaseBadgeClass">{{ phaseLabel }}</span>
          <button v-if="phase !== 'idle'" class="text-xs text-gray-400 hover:text-gray-600" @click="resetDoc">新建项目</button>
        </div>
      </div>

      <!-- Messages -->
      <div ref="msgContainer" class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        <!-- Background generation banner -->
        <div v-if="phase === 'writing'" class="bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <svg class="w-5 h-5 text-primary-500 animate-pulse flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="flex-1">
            <p class="text-sm text-primary-700">文档正在后台生成中，您可以离开此页面</p>
            <p class="text-xs text-primary-500 mt-0.5">完成后可在 <router-link to="/dochistory" class="underline font-medium">历史文档</router-link> 中查看下载</p>
          </div>
        </div>

        <!-- Welcome -->
        <div v-if="!messages.length" class="flex flex-col items-center justify-center h-full text-center">
          <div class="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mb-5">
            <svg class="w-8 h-8 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <h2 class="text-base font-semibold text-gray-800 mb-2">智能长文档生成</h2>
          <p class="text-sm text-gray-500 max-w-md mb-1">多Agent并行撰写精美长文档，支持可研报告/解决方案/白皮书等。</p>

          <!-- Single input card -->
          <div class="w-full max-w-2xl mt-4 card border border-gray-200 p-6 text-left">
            <h3 class="text-sm font-semibold text-gray-700 mb-4">📝 一次性填写所有信息</h3>

            <!-- Document name -->
            <div class="mb-4">
              <label class="block text-xs font-medium text-gray-500 mb-1.5">文档名称 / 主题 <span class="text-red-400">*</span></label>
              <input v-model="form.name" type="text" class="input w-full" placeholder="例如：医院智慧导航系统建设项目可行性研究报告" />
            </div>

            <!-- KB selection -->
            <div class="mb-4">
              <label class="block text-xs font-medium text-gray-500 mb-1.5">关联知识库（提供参考资料）</label>
              <div class="space-y-1.5 max-h-36 overflow-y-auto">
                <button v-if="kbLoading" class="w-full text-left px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-400">
                  加载中...
                </button>
                <button v-for="kb in kbList" :key="kb.id"
                  class="w-full text-left px-3 py-2 rounded-lg border text-sm transition-all flex items-center gap-2"
                  :class="form.kbId === kb.id ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 hover:border-primary-300 text-gray-700'"
                  @click="form.kbId = form.kbId === kb.id ? null : kb.id">
                  <svg class="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                  </svg>
                  <span class="truncate">{{ kb.name }}</span>
                  <span v-if="form.kbId === kb.id" class="ml-auto text-primary-600 font-medium">✓</span>
                </button>
                <div v-if="!kbLoading && !kbList.length" class="text-xs text-gray-400 py-2">暂无可用知识库（可在知识库页面创建）</div>
              </div>
            </div>

            <!-- Background -->
            <div class="mb-4">
              <label class="block text-xs font-medium text-gray-500 mb-1.5">项目背景与建设目标</label>
              <textarea v-model="form.background" rows="4" class="input w-full resize-none" placeholder="例如：某三甲医院存在患者找路难、排队久等问题，计划建设智慧导航系统，包括室内定位、智能导诊等功能模块，提升患者就医体验..."></textarea>
            </div>

            <!-- Style -->
            <div class="mb-5">
              <label class="block text-xs font-medium text-gray-500 mb-1.5">文档风格</label>
              <div class="flex flex-wrap gap-2">
                <button v-for="s in styleOptions" :key="s.value"
                  class="px-3 py-1.5 rounded-full border text-xs transition-all"
                  :class="form.style === s.value ? 'border-primary-400 bg-primary-50 text-primary-700 font-medium' : 'border-gray-200 text-gray-500 hover:border-primary-300'"
                  @click="form.style = s.value">
                  {{ s.label }}
                </button>
              </div>
            </div>

            <!-- Submit -->
            <button class="w-full btn-primary py-2.5 text-sm font-medium" :disabled="!form.name.trim() || thinking" @click="startGeneration">
              <span v-if="thinking">正在生成大纲...</span>
              <span v-else>🚀 开始生成文档大纲</span>
            </button>
          </div>
        </div>

        <!-- Message list -->
        <template v-for="(msg, idx) in messages" :key="idx">
          <div v-if="msg.role === 'user'" class="flex justify-end">
            <div class="max-w-[70%] px-4 py-3 rounded-2xl rounded-tr-sm bg-primary-600 text-white text-sm leading-relaxed">
              {{ msg.content }}
            </div>
          </div>
          <div v-else class="flex gap-3">
            <div class="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg class="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="card px-4 py-3 rounded-tl-sm">
                <!-- Outline (editable) -->
                <div v-if="msg._type === 'outline'" class="space-y-3">
                  <div class="text-sm font-semibold text-gray-800 mb-2">📋 《{{ projectName }}》大纲</div>
                  <div class="text-xs text-gray-400 mb-2">可直接编辑标题、删除章节/小节，或添加新章节</div>

                  <div v-for="(chapter, ci) in editableChapters" :key="chapter.id"
                    class="border border-gray-200 rounded-lg overflow-hidden">
                    <!-- Chapter header -->
                    <div class="flex items-center gap-2 px-3 py-2 bg-gray-50">
                      <span class="text-xs font-medium text-primary-600 flex-shrink-0 w-7">{{ chapter.id }}</span>
                      <input v-model="chapter.title"
                        class="flex-1 text-sm font-medium text-gray-800 bg-transparent border-0 outline-none focus:ring-1 focus:ring-primary-300 rounded px-1"
                        @change="onOutlineChange" />
                      <button class="text-xs text-red-400 hover:text-red-600 flex-shrink-0 p-1" title="删除章节"
                        @click="removeChapter(ci)">✕</button>
                    </div>
                    <!-- Sections -->
                    <div v-if="chapter.sections && chapter.sections.length" class="px-3 py-1 space-y-1">
                      <div v-for="(sec, si) in chapter.sections" :key="si"
                        class="flex items-center gap-2 py-1 border-b border-gray-50 last:border-0">
                        <span class="text-gray-300 text-xs">—</span>
                        <input v-model="sec.title"
                          class="flex-1 text-sm text-gray-600 bg-transparent border-0 outline-none focus:ring-1 focus:ring-primary-300 rounded px-1"
                          @change="onOutlineChange" />
                        <button class="text-xs text-red-400 hover:text-red-600 flex-shrink-0 p-0.5" title="删除小节"
                          @click="removeSection(ci, si)">✕</button>
                      </div>
                      <button class="text-xs text-primary-500 hover:text-primary-700 py-1" @click="addSection(ci)">+ 添加小节</button>
                    </div>
                    <div v-else class="px-3 py-1">
                      <button class="text-xs text-primary-500 hover:text-primary-700 py-1" @click="addSection(ci)">+ 添加小节</button>
                    </div>
                  </div>

                  <button class="w-full text-xs text-primary-500 hover:text-primary-700 border border-dashed border-primary-300 rounded-lg py-2 hover:bg-primary-50 transition"
                    @click="addChapter">+ 添加章节</button>

                  <div class="flex gap-2 pt-2">
                    <button class="btn-primary px-4 py-2 text-sm font-medium flex-1" @click="confirmOutlineAndStart">
                      ✅ 确认大纲并开始撰写
                    </button>
                  </div>
                </div>
                <!-- Progress -->
                <div v-else-if="msg._type === 'progress'" class="space-y-3">
                  <div class="text-sm font-medium text-gray-700">{{ msg.title }}</div>
                  <div class="space-y-1">
                    <div v-for="item in msg.items" :key="item.name" class="flex items-center gap-2 text-sm">
                      <span v-if="item.status === 'done'" class="text-green-500">✓</span>
                      <span v-else-if="item.status === 'writing'" class="text-yellow-500">✍️</span>
                      <span v-else class="text-gray-300">○</span>
                      <span :class="item.status === 'done' ? 'text-gray-500' : item.status === 'writing' ? 'text-gray-800 font-medium' : 'text-gray-400'">{{ item.name }}</span>
                    </div>
                  </div>
                  <div v-if="msg.subtitle" class="text-xs text-gray-400 mt-2">{{ msg.subtitle }}</div>
                </div>
                <!-- Done -->
                <div v-else-if="msg._type === 'done'" class="text-center py-4">
                  <div class="text-3xl mb-3">🎉</div>
                  <div class="text-sm font-semibold text-gray-800 mb-1">{{ msg.title }}</div>
                  <div class="text-xs text-gray-500 mb-4">{{ msg.subtitle }}</div>
                  <div class="flex gap-3 justify-center">
                    <button v-if="msg.docxPath" class="btn-primary px-4 py-2 text-sm" @click="openDocx(msg.docxPath)">
                      📥 下载文档
                    </button>
                    <router-link to="/dochistory" class="btn-ghost px-4 py-2 text-sm inline-flex items-center gap-1">
                      📂 历史文档
                    </router-link>
                    <button class="btn-ghost px-4 py-2 text-sm" @click="resetDoc">新建项目</button>
                  </div>
                </div>
                <!-- Plain text -->
                <div v-else class="prose-rag text-sm text-gray-700" v-html="renderMd(msg.content)"></div>
              </div>
            </div>
          </div>
        </template>

        <!-- Thinking -->
        <div v-if="thinking && !messages.find(m => m._type === 'progress')" class="flex gap-3">
          <div class="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <svg class="w-4 h-4 text-primary-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
          <div class="card px-4 py-3 text-sm text-gray-400 rounded-tl-sm">{{ thinkingText }}</div>
        </div>
      </div>

      <!-- Input bar -->
      <div class="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3">
        <div class="flex gap-2 items-end">
          <div class="flex-1">
            <textarea
              ref="inputRef"
              v-model="input"
              @keydown.enter.exact.prevent="sendMessage"
              rows="1"
              :placeholder="inputPlaceholder"
              class="input resize-none overflow-hidden py-2.5 pr-4 text-sm"
              style="min-height:42px;max-height:120px;"
              :disabled="thinking"
            ></textarea>
          </div>
          <button class="btn-primary h-10 px-4 flex-shrink-0" @click="sendMessage" :disabled="!input.trim() || thinking">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
            </svg>
          </button>
        </div>
        <p v-if="phase === 'outline'" class="text-xs text-gray-400 mt-1.5 px-1">📋 大纲已生成，可直接编辑标题或增删章节/小节，然后点击"确认大纲并开始撰写"</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, computed, onMounted, onBeforeUnmount, reactive } from 'vue'
import { kbApi, docgenApi } from '@/api'
import { useAppStore } from '@/stores/app'
import { marked } from 'marked'

const appStore = useAppStore()

// ── State ──────────────────────────────────────────────────────────────
const messages = ref([])
const input = ref('')
const thinking = ref(false)
const msgContainer = ref(null)
const inputRef = ref(null)

// Project
const projectName = ref('')
const phase = ref('idle')  // idle | outline | writing | done
const thinkingText = ref('')

// KB list
const kbList = ref([])
const kbLoading = ref(false)

// Form
const form = reactive({
  name: '',
  kbId: null,
  background: '',
  style: 'report',
})

const styleOptions = [
  { label: '可研报告', value: 'report' },
  { label: '解决方案', value: 'solution' },
  { label: '白皮书', value: 'whitepaper' },
  { label: '投标文件', value: 'bid' },
  { label: '产品介绍', value: 'product' },
]

marked.setOptions({ breaks: true, gfm: true })
const renderMd = (text) => marked.parse(text || '')

// ── Computed ────────────────────────────────────────────────────────────
const phaseLabel = computed(() => {
  const map = { idle: '就绪', outline: '大纲确认', writing: '撰写中', done: '完成' }
  return map[phase.value] || '就绪'
})

const phaseBadgeClass = computed(() => {
  const map = { idle: 'bg-gray-100 text-gray-500', outline: 'bg-yellow-100 text-yellow-700', writing: 'bg-orange-100 text-orange-600', done: 'bg-green-100 text-green-600' }
  return map[phase.value] || 'bg-gray-100 text-gray-500'
})

const inputPlaceholder = computed(() => {
  if (thinking.value) return '处理中...'
  if (phase.value === 'idle') return ''
  if (phase.value === 'outline') return '输入"继续"开始撰写，或输入其他调整要求...'
  if (phase.value === 'writing') return '撰写中，请稍候...'
  if (phase.value === 'done') return '文档已生成完毕，如需修改请输入...'
  return '输入内容后按 Enter 发送...'
})

// ── Scroll ─────────────────────────────────────────────────────────────
async function scrollToBottom() {
  await nextTick()
  if (msgContainer.value) {
    msgContainer.value.scrollTo({ top: msgContainer.value.scrollHeight, behavior: 'smooth' })
  }
}

// ── Send message ───────────────────────────────────────────────────────────
async function sendMessage() {
  const text = input.value.trim()
  if (!text || thinking.value) return
  input.value = ''
  if (inputRef.value) inputRef.value.style.height = '42px'
  await handleUserMessage(text)
}

// ── Handle user input ─────────────────────────────────────────────────────
async function handleUserMessage(text) {
  const lower = text.toLowerCase().trim()

  // 用户输入"继续"，大纲已出 → 确认大纲并开始撰写
  if ((lower === '继续' || lower === '开始撰写' || lower === '开始写' || lower === '确认') && phase.value === 'outline') {
    await confirmOutlineAndStart()
    return
  }

  // 大纲调整提示
  if ((lower.includes('调整') || lower.includes('修改') || lower.includes('编辑')) && phase.value === 'outline') {
    messages.value.push({ role: 'user', content: text })
    messages.value.push({ role: 'assistant', _type: 'plain', content: '请直接在大纲中编辑标题、删除或添加章节/小节，然后点击"确认大纲并开始撰写"按钮。' })
    await scrollToBottom()
    return
  }

  // 撰写完成后
  if (phase.value === 'done') {
    messages.value.push({ role: 'user', content: text })
    messages.value.push({ role: 'assistant', _type: 'plain', content: '当前文档已生成完成。如需修改某个章节，请告诉我具体章节和修改内容。' })
    await scrollToBottom()
    return
  }

  // 自由对话追加
  if (phase.value === 'outline' || phase.value === 'writing') {
    messages.value.push({ role: 'user', content: text })
    await scrollToBottom()
    thinking.value = true
    thinkingText.value = '正在思考...'
    await sleep(1000)
    thinking.value = false
    thinkingText.value = ''
    messages.value.push({ role: 'assistant', _type: 'plain', content: `收到。输入"继续"开始撰写，或继续描述您的需求。` })
    await scrollToBottom()
    return
  }
}

// ── Reset ─────────────────────────────────────────────────────────────────
function resetDoc() {
  messages.value = []
  phase.value = 'idle'
  projectName.value = ''
  form.name = ''
  form.kbId = null
  form.background = ''
  form.style = 'report'
}

// ── Start generation ─────────────────────────────────────────────────────────
async function startGeneration() {
  const name = form.name.trim()
  if (!name) {
    appStore.showToast('请填写文档名称', 'error')
    return
  }

  projectName.value = name
  thinking.value = true
  thinkingText.value = '正在分析主题并构建大纲...'
  phase.value = 'outline'

  messages.value.push({ role: 'user', content: `《${name}》\n背景：${form.background || '无'}` })
  await scrollToBottom()

  try {
    // 用 LLM + KB 上下文生成大纲
    const outlineRes = await fetch('/api/docgen/outline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        background: form.background,
        kb_id: form.kbId,
        style: form.style,
      }),
    })

    let chapters = []
    if (outlineRes.ok) {
      const outlineData = await outlineRes.json()
      if (outlineData.data?.chapters?.length) {
        // 把嵌套格式展平为模板需要的格式
        chapters = outlineData.data.chapters.map(ch => ({
          id: ch.seq || '',
          title: ch.title || '',
          status: 'pending',
          _raw: ch,  // 保留原始数据给 startWriting 用
        }))
      }
    }
    // Fallback 默认大纲
    if (!chapters.length) {
      chapters = [
        { id: '01', title: '项目概述', status: 'pending', _raw: { seq: '01', title: '项目概述', sections: [{ title: '建设背景', word_count: 2000 }, { title: '项目目标', word_count: 1500 }] } },
        { id: '02', title: '需求分析', status: 'pending', _raw: { seq: '02', title: '需求分析', sections: [{ title: '业务需求', word_count: 2000 }, { title: '功能需求', word_count: 2000 }] } },
        { id: '03', title: '系统设计', status: 'pending', _raw: { seq: '03', title: '系统设计', sections: [{ title: '总体架构', word_count: 2500 }, { title: '功能模块', word_count: 2000 }] } },
        { id: '04', title: '技术方案', status: 'pending', _raw: { seq: '04', title: '技术方案', sections: [{ title: '技术选型', word_count: 2000 }, { title: '关键技术', word_count: 2000 }] } },
        { id: '05', title: '实施计划', status: 'pending', _raw: { seq: '05', title: '实施计划', sections: [{ title: '项目进度', word_count: 1500 }, { title: '资源配置', word_count: 1500 }] } },
        { id: '06', title: '投资估算', status: 'pending', _raw: { seq: '06', title: '投资估算', sections: [{ title: '资金预算', word_count: 2000 }] } },
        { id: '07', title: '效益分析', status: 'pending', _raw: { seq: '07', title: '效益分析', sections: [{ title: '经济效益', word_count: 1500 }, { title: '社会效益', word_count: 1500 }] } },
        { id: '08', title: '结论与建议', status: 'pending', _raw: { seq: '08', title: '结论与建议', sections: [{ title: '总结', word_count: 1000 }, { title: '建议', word_count: 1000 }] } },
      ]
    }
    showOutline(chapters)
  } catch (e) {
    showOutline([
      { id: '01', title: '项目概述', status: 'pending', _raw: { seq: '01', title: '项目概述', sections: [{ title: '建设背景', word_count: 2000 }] } },
      { id: '02', title: '需求分析', status: 'pending', _raw: { seq: '02', title: '需求分析', sections: [{ title: '业务需求', word_count: 2000 }] } },
      { id: '03', title: '系统设计', status: 'pending', _raw: { seq: '03', title: '系统设计', sections: [{ title: '总体架构', word_count: 2000 }] } },
      { id: '04', title: '技术方案', status: 'pending', _raw: { seq: '04', title: '技术方案', sections: [{ title: '技术选型', word_count: 2000 }] } },
      { id: '05', title: '实施计划', status: 'pending', _raw: { seq: '05', title: '实施计划', sections: [{ title: '项目进度', word_count: 1500 }] } },
      { id: '06', title: '投资估算', status: 'pending', _raw: { seq: '06', title: '投资估算', sections: [{ title: '资金预算', word_count: 2000 }] } },
      { id: '07', title: '效益分析', status: 'pending', _raw: { seq: '07', title: '效益分析', sections: [{ title: '经济效益', word_count: 1500 }] } },
      { id: '08', title: '结论建议', status: 'pending', _raw: { seq: '08', title: '结论建议', sections: [{ title: '总结', word_count: 1000 }] } },
    ])
  } finally {
    thinking.value = false
  }
}

// ── Show outline ─────────────────────────────────────────────────────────
const editableChapters = ref([])

function showOutline(chapters) {
  thinkingText.value = ''
  // 将 chapters 转为可编辑格式（带 sections）
  editableChapters.value = chapters.map(ch => {
    const raw = ch._raw || {}
    return {
      id: ch.id || '',
      title: ch.title || '',
      sections: (raw.sections || []).map(s => ({ title: s.title || '', word_count: s.word_count || 1500 })),
      status: ch.status || 'pending',
      _raw: raw,
    }
  })
  messages.value.push({
    role: 'assistant',
    _type: 'outline',
    title: projectName.value,
    chapters,
  })
  scrollToBottom()
}

// ── Outline editing ─────────────────────────────────────────────────────
function onOutlineChange() {
  // 仅触发响应式更新
}

function removeChapter(ci) {
  editableChapters.value.splice(ci, 1)
  // 重新编号
  editableChapters.value.forEach((ch, i) => {
    ch.id = String(i + 1).padStart(2, '0')
  })
}

function addChapter() {
  const nextSeq = String(editableChapters.value.length + 1).padStart(2, '0')
  editableChapters.value.push({
    id: nextSeq,
    title: '新章节',
    sections: [{ title: '新小节', word_count: 1500 }],
    status: 'pending',
  })
}

function removeSection(ci, si) {
  editableChapters.value[ci].sections.splice(si, 1)
}

function addSection(ci) {
  if (!editableChapters.value[ci].sections) {
    editableChapters.value[ci].sections = []
  }
  editableChapters.value[ci].sections.push({ title: '新小节', word_count: 1500 })
}

async function confirmOutlineAndStart() {
  // 将编辑后的大纲保存到后端 plan.json
  const chaptersPayload = editableChapters.value.map(ch => ({
    seq: ch.id,
    title: ch.title,
    sections: (ch.sections || []).map(s => ({ title: s.title, word_count: s.word_count || 1500 })),
  }))

  try {
    await fetch('/api/docgen/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: projectName.value, chapters: chaptersPayload }),
    })
  } catch {}

  // 移除大纲消息，添加用户确认消息
  messages.value = messages.value.filter(m => m._type !== 'outline')
  messages.value.push({ role: 'user', content: '大纲确认，开始撰写' })
  await scrollToBottom()
  await startWriting(form.kbId)
}

// ── Start writing ─────────────────────────────────────────────────────────
async function startWriting(kbId) {
  phase.value = 'writing'
  messages.value = messages.value.filter(m => m._type !== 'outline')
  messages.value.push({
    role: 'assistant',
    _type: 'progress',
    title: '✍️ 正在检索知识库并撰写章节...',
    subtitle: '基于知识库内容生成专业报告',
    done: 0,
    total: 1,
  })
  await scrollToBottom()
  let docxPath = null
  try {
    const res = await fetch('/api/docgen/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: projectName.value, kb_id: kbId }),
    })
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          const progressMsg = messages.value.find(m => m._type === 'progress')
          if (data.type === 'progress') {
            if (progressMsg) {
              progressMsg.title = data.title || data.phase
              progressMsg.done = data.done
              progressMsg.total = data.total
            }
            await scrollToBottom()
          } else if (data.type === 'done') {
            // 确保中文文件名被正确 URL 编码
            const rawPath = data.docx_path || ''
            docxPath = rawPath.includes('%') ? rawPath : encodeURI(rawPath)
            messages.value = messages.value.filter(m => m._type !== 'progress')
            messages.value.push({
              role: 'assistant',
              _type: 'done',
              title: data.title || `《${projectName.value}》生成完成！`,
              subtitle: data.subtitle || '精美版 docx 已生成',
              docxPath,
            })
            phase.value = 'done'
            await scrollToBottom()
          } else if (data.type === 'error') {
            messages.value.push({
              role: 'assistant',
              _type: 'plain',
              content: `❌ 生成失败：${data.data}`,
            })
            phase.value = 'outline'
            await scrollToBottom()
          }
        } catch {}
      }
    }
  } catch (e) {
    const progressMsg = messages.value.find(m => m._type === 'progress')
    if (progressMsg) {
      messages.value = messages.value.filter(m => m._type !== 'progress')
    }
    messages.value.push({
      role: 'assistant',
      _type: 'plain',
      content: `❌ 请求失败：${e.message}`,
    })
    phase.value = 'outline'
    await scrollToBottom()
  }
}

// ── Open docx ─────────────────────────────────────────────────────────
function openDocx(path) {
  window.open(path, '_blank')
}

// ── Utilities ───────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

// ── Status SSE (断线重连) ─────────────────────────────────────────────
const statusES = ref(null)

function connectStatusSSE() {
  if (statusES.value) { statusES.value.close(); statusES.value = null }
  const es = new EventSource('/api/docgen/status')
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      const progressMsg = messages.value.find(m => m._type === 'progress')
      if (data.type === 'progress') {
        if (progressMsg) {
          progressMsg.title = data.title || data.phase
          progressMsg.done = data.done
          progressMsg.total = data.total
        }
        scrollToBottom()
      } else if (data.type === 'done') {
        const rawPath = data.docx_path || ''
        const docxPath = rawPath.includes('%') ? rawPath : encodeURI(rawPath)
        messages.value = messages.value.filter(m => m._type !== 'progress')
        messages.value.push({
          role: 'assistant',
          _type: 'done',
          title: data.title || `《${projectName.value}》生成完成！`,
          subtitle: data.subtitle || '精美版 docx 已生成',
          docxPath,
        })
        phase.value = 'done'
        scrollToBottom()
        es.close(); statusES.value = null
      } else if (data.type === 'error') {
        messages.value = messages.value.filter(m => m._type !== 'progress')
        messages.value.push({
          role: 'assistant',
          _type: 'plain',
          content: `❌ 生成失败：${data.data}`,
        })
        phase.value = 'outline'
        scrollToBottom()
        es.close(); statusES.value = null
      }
    } catch {}
  }
  es.onerror = () => {
    es.close(); statusES.value = null
  }
  statusES.value = es
}

async function checkRunningTask() {
  try {
    const res = await docgenApi.simpleStatus()
    const s = res.data
    if (s.status === 'running') {
      projectName.value = s.project_name || ''
      phase.value = 'writing'
      messages.value = [{
        role: 'assistant',
        _type: 'progress',
        title: '✍️ 正在继续生成...',
        done: 0,
        total: 1,
      }]
      await scrollToBottom()
      connectStatusSSE()
    } else if (s.status === 'error' && s.error) {
      // 上次任务失败，显示错误信息
      messages.value.push({
        role: 'assistant',
        _type: 'plain',
        content: `❌ 上次生成失败：${s.error}`,
      })
      phase.value = 'outline'
    }
  } catch {}
}

onBeforeUnmount(() => {
  if (statusES.value) { statusES.value.close(); statusES.value = null }
})

// ── Init ───────────────────────────────────────────────────────────────────
onMounted(async () => {
  kbLoading.value = true
  try {
    const res = await kbApi.list({ page_size: 100 })
    kbList.value = res.data.items || []
  } catch {}
  kbLoading.value = false
  checkRunningTask()
})
</script>
