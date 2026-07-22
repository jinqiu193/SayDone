<template>
  <div class="flex h-full overflow-hidden">
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Header -->
      <div class="page-header">
        <div class="page-header-icon">
          <svg class="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h1 class="page-header-title">系统设置</h1>
          <p class="page-header-desc">配置模型、检索参数和系统行为</p>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto">
        <div v-if="loading" class="flex flex-col items-center justify-center h-full text-sm text-gray-400">
          <svg class="w-8 h-8 animate-spin mb-3 text-primary-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          加载中...
        </div>

        <div v-else class="max-w-3xl mx-auto px-6 py-6 space-y-6">

          <!-- Section: LLM 后端 -->
          <section class="card-static rounded-xl p-5">
            <h2 class="text-sm font-semibold text-gray-800 mb-1">LLM 后端</h2>
            <p class="text-xs text-gray-400 mb-4">选择大语言模型的运行方式</p>
            <div class="grid grid-cols-2 gap-3">
              <label v-for="b in backends" :key="b.value"
                class="flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 cursor-pointer transition-all duration-200"
                :class="form.llm_backend === b.value
                  ? 'border-primary-500 bg-primary-50/60 shadow-sm shadow-primary-500/10'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'">
                <input type="radio" :value="b.value" v-model="form.llm_backend" class="sr-only" />
                <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                  :class="form.llm_backend === b.value ? 'bg-primary-100' : 'bg-gray-100'">
                  {{ b.icon }}
                </div>
                <div>
                  <p class="text-sm font-medium text-gray-800">{{ b.label }}</p>
                  <p class="text-xs text-gray-500">{{ b.desc }}</p>
                </div>
              </label>
            </div>
          </section>

          <!-- Section: Ollama 配置 -->
          <section v-if="form.llm_backend === 'ollama'" class="card-static rounded-xl p-5">
            <h2 class="text-sm font-semibold text-gray-800 mb-1">Ollama 配置</h2>
            <p class="text-xs text-gray-400 mb-4">连接本地 Ollama 服务</p>
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1.5">Ollama 地址</label>
                <input v-model="form.ollama_url" type="text" class="input" placeholder="http://localhost:11434" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1.5">对话模型</label>
                <input v-model="form.ollama_model" type="text" class="input" placeholder="qwen3.5:9b" />
                <p class="text-xs text-gray-400 mt-1.5">切换模型后需重启后端生效</p>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1.5">Temperature</label>
                  <input v-model.number="form.ollama_temperature" type="number" step="0.1" min="0" max="2" class="input" placeholder="0.3" />
                  <p class="text-xs text-gray-400 mt-1.5">越高越随机，越低越确定</p>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1.5">最大 Token</label>
                  <input v-model.number="form.ollama_max_tokens" type="number" class="input" placeholder="4096" />
                </div>
              </div>
            </div>
          </section>

          <!-- Section: 外部 API 配置 -->
          <section v-if="form.llm_backend === 'external'" class="card-static rounded-xl p-5">
            <h2 class="text-sm font-semibold text-gray-800 mb-1">外部 API 配置</h2>
            <p class="text-xs text-gray-400 mb-4">连接 OpenAI 兼容的第三方服务</p>
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1.5">API 地址</label>
                <input v-model="form.ext_api_base" type="text" class="input" placeholder="https://api.minimaxi.com/anthropic/v1" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1.5">API 密钥</label>
                <div class="relative">
                  <input v-model="form.ext_api_key" :type="showApiKey ? 'text' : 'password'" class="input pr-10" placeholder="输入密钥，仅本地存储" />
                  <button class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    @click="showApiKey = !showApiKey">
                    <svg v-if="showApiKey" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                    <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                </div>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1.5">模型名称</label>
                <input v-model="form.ext_model" type="text" class="input" placeholder="如 MiniMax-Text-01" />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1.5">最大 Token</label>
                  <input v-model.number="form.ext_max_tokens" type="number" class="input" placeholder="2048" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1.5">Temperature</label>
                  <input v-model.number="form.ext_temperature" type="number" step="0.1" min="0" max="2" class="input" placeholder="0.3" />
                </div>
              </div>
            </div>
          </section>

          <!-- Section: Embedding 模型 -->
          <section class="card-static rounded-xl p-5">
            <h2 class="text-sm font-semibold text-gray-800 mb-1">Embedding 模型</h2>
            <p class="text-xs text-gray-400 mb-4">文本向量化模型，切换后需重建向量索引</p>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1.5">模型名称</label>
              <input v-model="form.embedding_model" type="text" class="input" placeholder="nomic-embed-text:latest" />
              <p class="text-xs text-gray-400 mt-1.5">切换模型后需重启后端并重新处理文档</p>
            </div>
          </section>

          <!-- Section: RAG 检索参数 -->
          <section class="card-static rounded-xl p-5">
            <h2 class="text-sm font-semibold text-gray-800 mb-1">RAG 检索参数</h2>
            <p class="text-xs text-gray-400 mb-4">调整文档分块与检索策略，影响回答质量</p>
            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1.5">分块大小 (Chunk Size)</label>
                  <input v-model.number="form.chunk_size" type="number" min="100" max="8000" class="input" placeholder="1500" />
                  <p class="text-xs text-gray-400 mt-1.5">每个文本块的字符数</p>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1.5">分块重叠 (Overlap)</label>
                  <input v-model.number="form.chunk_overlap" type="number" min="0" max="2000" class="input" placeholder="300" />
                  <p class="text-xs text-gray-400 mt-1.5">相邻块的重叠字符数</p>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1.5">检索数量 (Top K)</label>
                  <input v-model.number="form.top_k" type="number" min="1" max="50" class="input" placeholder="10" />
                  <p class="text-xs text-gray-400 mt-1.5">初始检索的文档片段数</p>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1.5">重排保留数 (Rerank K)</label>
                  <input v-model.number="form.rerank_top_k" type="number" min="1" max="20" class="input" placeholder="6" />
                  <p class="text-xs text-gray-400 mt-1.5">重排后送入模型的片段数</p>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1.5">相关度阈值</label>
                  <input v-model.number="form.retrieval_score_threshold" type="number" step="0.05" min="0" max="1" class="input" placeholder="0.3" />
                  <p class="text-xs text-gray-400 mt-1.5">低于此阈值的片段将被过滤</p>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1.5">上下文最大长度</label>
                  <input v-model.number="form.max_context_length" type="number" min="1000" max="64000" class="input" placeholder="8000" />
                  <p class="text-xs text-gray-400 mt-1.5">送入模型的上下文字符上限</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Section: Reranker 重排序 -->
          <section class="card-static rounded-xl p-5">
            <h2 class="text-sm font-semibold text-gray-800 mb-1">Reranker 重排序</h2>
            <p class="text-xs text-gray-400 mb-4">使用 Cross-Encoder 对检索结果二次排序，大幅提升 Top-K 精准度</p>
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm font-medium text-gray-700">启用 Reranker</label>
                  <p class="text-xs text-gray-400">关闭时仅使用向量相似度排序</p>
                </div>
                <button
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                  :class="form.reranker_enabled ? 'bg-primary-500' : 'bg-gray-300'"
                  @click="form.reranker_enabled = !form.reranker_enabled">
                  <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm"
                    :class="form.reranker_enabled ? 'translate-x-6' : 'translate-x-1'"></span>
                </button>
              </div>

              <template v-if="form.reranker_enabled">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Reranker 后端</label>
                  <div class="grid grid-cols-3 gap-2">
                    <label v-for="rb in rerankerBackends" :key="rb.value"
                      class="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all duration-200"
                      :class="form.reranker_backend === rb.value
                        ? 'border-primary-500 bg-primary-50/60'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'">
                      <input type="radio" :value="rb.value" v-model="form.reranker_backend" class="sr-only" />
                      <span class="text-lg">{{ rb.icon }}</span>
                      <span class="text-xs font-medium" :class="form.reranker_backend === rb.value ? 'text-primary-700' : 'text-gray-600'">{{ rb.label }}</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1.5">模型名称</label>
                  <input v-model="form.reranker_model" type="text" class="input"
                    :placeholder="form.reranker_backend === 'local' ? 'BAAI/bge-reranker-v2-m3' : form.reranker_backend === 'ollama' ? 'bge-reranker-v2-m3' : 'jina-reranker-v2-base-multilingual'" />
                  <p class="text-xs text-gray-400 mt-1.5">
                    {{ form.reranker_backend === 'local' ? 'HuggingFace 模型 ID，如 BAAI/bge-reranker-v2-m3' : form.reranker_backend === 'ollama' ? 'Ollama 中的 Reranker 模型名' : 'API 服务提供的模型名' }}
                  </p>
                </div>

                <template v-if="form.reranker_backend === 'external'">
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1.5">API 地址</label>
                    <input v-model="form.reranker_api_base" type="text" class="input"
                      placeholder="https://api.jina.ai/v1/rerank" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1.5">API 密钥</label>
                    <div class="relative">
                      <input v-model="form.reranker_api_key" :type="showRerankerKey ? 'text' : 'password'" class="input pr-10"
                        placeholder="输入密钥，仅本地存储" />
                      <button class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        @click="showRerankerKey = !showRerankerKey">
                        <svg v-if="showRerankerKey" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                        <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </template>
              </template>
            </div>
          </section>

          <!-- Section: Query 改写与分解 -->
          <section class="card-static rounded-xl p-5">
            <h2 class="text-sm font-semibold text-gray-800 mb-1">Query 改写与分解</h2>
            <p class="text-xs text-gray-400 mb-4">自动改写模糊查询或拆分复杂查询，提升检索召回率</p>
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm font-medium text-gray-700">启用 Query 改写</label>
                  <p class="text-xs text-gray-400">关闭时使用原始查询直接检索</p>
                </div>
                <button
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                  :class="form.query_rewrite_enabled ? 'bg-primary-500' : 'bg-gray-300'"
                  @click="form.query_rewrite_enabled = !form.query_rewrite_enabled">
                  <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm"
                    :class="form.query_rewrite_enabled ? 'translate-x-6' : 'translate-x-1'"></span>
                </button>
              </div>

              <template v-if="form.query_rewrite_enabled">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">改写模式</label>
                  <div class="grid grid-cols-3 gap-2">
                    <label v-for="m in rewriteModes" :key="m.value"
                      class="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all duration-200"
                      :class="form.query_rewrite_mode === m.value
                        ? 'border-primary-500 bg-primary-50/60'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'">
                      <input type="radio" :value="m.value" v-model="form.query_rewrite_mode" class="sr-only" />
                      <span class="text-lg">{{ m.icon }}</span>
                      <span class="text-xs font-medium" :class="form.query_rewrite_mode === m.value ? 'text-primary-700' : 'text-gray-600'">{{ m.label }}</span>
                      <span class="text-[10px] text-gray-400 text-center leading-tight">{{ m.desc }}</span>
                    </label>
                  </div>
                </div>
              </template>
            </div>
          </section>

          <!-- Section: 文件上传 -->
          <section class="card-static rounded-xl p-5">
            <h2 class="text-sm font-semibold text-gray-800 mb-1">文件上传</h2>
            <p class="text-xs text-gray-400 mb-4">控制允许上传的文件类型和大小</p>
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1.5">最大文件大小 (MB)</label>
                <input v-model.number="form.max_file_size_mb" type="number" min="1" max="1024" class="input" placeholder="100" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1.5">允许的文件类型</label>
                <input v-model="form.allowed_extensions" type="text" class="input" placeholder="pdf,doc,docx,txt,xls,xlsx,jpg,jpeg,png" />
                <p class="text-xs text-gray-400 mt-1.5">用逗号分隔文件扩展名</p>
              </div>
            </div>
          </section>

          <!-- Section: 系统提示词 -->
          <section class="card-static rounded-xl p-5">
            <h2 class="text-sm font-semibold text-gray-800 mb-1">系统提示词</h2>
            <p class="text-xs text-gray-400 mb-4">自定义 AI 助手的行为和人设</p>
            <div>
              <textarea v-model="form.system_prompt" rows="4" class="input resize-y" placeholder="你是一个专业的知识库助手，请基于提供的参考资料准确回答用户的问题..."></textarea>
              <p class="text-xs text-gray-400 mt-1.5">留空则使用默认提示词</p>
            </div>
          </section>

          <!-- Section: 语音合成 (TTS) -->
          <section class="card-static rounded-xl p-5">
            <h2 class="text-sm font-semibold text-gray-800 mb-1">语音合成 (TTS)</h2>
            <p class="text-xs text-gray-400 mb-4">配置 MiniMax 文字转语音服务，支持将对话回复下载为 MP3</p>
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1.5">MiniMax API Key</label>
                <div class="relative">
                  <input v-model="form.minimax_api_key" :type="showMinimaxKey ? 'text' : 'password'" class="input pr-9"
                    placeholder="sk-..." />
                  <button class="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                    @click="showMinimaxKey = !showMinimaxKey">
                    <svg v-if="showMinimaxKey" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                    </svg>
                    <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                  </button>
                </div>
                <p class="text-xs text-gray-400 mt-1.5">从 <a href="https://platform.minimaxi.com" target="_blank" class="text-primary-600 hover:underline">MiniMax 开放平台</a> 获取</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1.5">默认音色</label>
                <input v-model="form.tts_voice_id" class="input" placeholder="presenter_female" />
                <p class="text-xs text-gray-400 mt-1.5">默认使用新闻女生 (presenter_female)，可在 <a href="https://platform.minimaxi.com" target="_blank" class="text-primary-600 hover:underline">MiniMax 平台</a> 查看全部音色</p>
              </div>
            </div>
          </section>

          <!-- Section: 连接状态 -->
          <section class="card-static rounded-xl p-5">
            <h2 class="text-sm font-semibold text-gray-800 mb-1">连接状态</h2>
            <p class="text-xs text-gray-400 mb-4">当前系统运行状态概览</p>
            <div class="space-y-3">
              <div class="flex items-center justify-between py-2 px-3 rounded-lg"
                :class="health?.ollama ? 'bg-emerald-50/60' : 'bg-gray-50'">
                <div class="flex items-center gap-2.5">
                  <span class="w-2 h-2 rounded-full" :class="health?.ollama ? 'bg-emerald-400 pulse-glow' : 'bg-gray-300'"></span>
                  <span class="text-sm" :class="health?.ollama ? 'text-emerald-700' : 'text-gray-500'">
                    {{ health?.ollama ? 'Ollama 已连接' : 'Ollama 未连接' }}
                  </span>
                </div>
                <button class="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors" @click="testConnection" :disabled="testing">
                  {{ testing ? '测试中...' : '测试连接' }}
                </button>
              </div>
              <div class="grid grid-cols-3 gap-3 text-center">
                <div class="py-2.5 px-3 rounded-lg bg-gray-50">
                  <p class="text-xs text-gray-400 mb-0.5">后端</p>
                  <p class="text-sm font-medium text-gray-700">{{ form.llm_backend }}</p>
                </div>
                <div class="py-2.5 px-3 rounded-lg bg-gray-50">
                  <p class="text-xs text-gray-400 mb-0.5">对话模型</p>
                  <p class="text-sm font-medium text-gray-700 truncate">{{ health?.llm_model || '-' }}</p>
                </div>
                <div class="py-2.5 px-3 rounded-lg bg-gray-50">
                  <p class="text-xs text-gray-400 mb-0.5">Embedding</p>
                  <p class="text-sm font-medium text-gray-700 truncate">{{ health?.embedding_model || '-' }}</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Save button -->
          <div class="flex items-center justify-end gap-3 pt-2 pb-6">
            <button class="btn-ghost px-5 py-2.5" @click="loadSettings">重置</button>
            <button class="btn-primary px-6 py-2.5" @click="save" :disabled="saving">
              <svg v-if="saving" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              {{ saving ? '保存中...' : '保存设置' }}
            </button>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { sysApi } from '@/api'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const showApiKey = ref(false)
const showMinimaxKey = ref(false)
const showRerankerKey = ref(false)
const health = ref(null)

const backends = [
  { value: 'ollama', label: 'Ollama', desc: '本地模型', icon: '💻' },
  { value: 'external', label: '外部 API', desc: 'Minimax / OpenAI 等', icon: '🌐' },
]

const rerankerBackends = [
  { value: 'local', label: '本地模型', icon: '🏠' },
  { value: 'ollama', label: 'Ollama', icon: '💻' },
  { value: 'external', label: '外部 API', icon: '🌐' },
]

const rewriteModes = [
  { value: 'rewrite', label: '改写', icon: '✏️', desc: '模糊查询→精确查询' },
  { value: 'decompose', label: '分解', icon: '🔀', desc: '复杂问题→多个子问题' },
  { value: 'both', label: '两者', icon: '⚡', desc: '先改写再分解' },
]

const form = ref({
  llm_backend: 'ollama',
  ollama_url: 'http://localhost:11434',
  ollama_model: '',
  ollama_temperature: 0.3,
  ollama_max_tokens: 4096,
  ext_api_base: '',
  ext_api_key: '',
  ext_model: '',
  ext_max_tokens: 2048,
  ext_temperature: 0.3,
  embedding_model: 'nomic-embed-text:latest',
  chunk_size: 1500,
  chunk_overlap: 300,
  top_k: 10,
  rerank_top_k: 6,
  retrieval_score_threshold: 0.3,
  max_context_length: 8000,
  max_file_size_mb: 100,
  allowed_extensions: 'pdf,doc,docx,txt,xls,xlsx,jpg,jpeg,png,gif,bmp',
  system_prompt: '',
  reranker_enabled: false,
  reranker_backend: 'local',
  reranker_model: 'BAAI/bge-reranker-v2-m3',
  reranker_api_base: '',
  reranker_api_key: '',
  query_rewrite_enabled: false,
  query_rewrite_mode: 'rewrite',
  minimax_api_key: '',
  tts_voice_id: 'presenter_female',
})

async function loadHealth() {
  try { health.value = await sysApi.health() } catch {}
}

async function loadSettings() {
  loading.value = true
  try {
    const [d, h] = await Promise.all([sysApi.settings(), sysApi.health()])
    health.value = h
    form.value = {
      llm_backend:      d.llm_backend    || 'ollama',
      ollama_url:        d.ollama_url     || 'http://localhost:11434',
      ollama_model:      d.ollama_model   || '',
      ollama_temperature: d.ollama_temperature ?? 0.3,
      ollama_max_tokens: d.ollama_max_tokens ?? 4096,
      ext_api_base:      d.ext_api_base    || '',
      ext_api_key:       '',
      ext_model:         d.ext_model       || '',
      ext_max_tokens:    d.ext_max_tokens || 2048,
      ext_temperature:   d.ext_temperature || 0.3,
      embedding_model:   d.embedding_model || 'nomic-embed-text:latest',
      chunk_size:        d.chunk_size      ?? 1500,
      chunk_overlap:     d.chunk_overlap   ?? 300,
      top_k:             d.top_k           ?? 10,
      rerank_top_k:      d.rerank_top_k    ?? 6,
      retrieval_score_threshold: d.retrieval_score_threshold ?? 0.3,
      max_context_length: d.max_context_length ?? 8000,
      max_file_size_mb:  d.max_file_size_mb ?? 100,
      allowed_extensions: d.allowed_extensions ?? 'pdf,doc,docx,txt,xls,xlsx,jpg,jpeg,png,gif,bmp',
      system_prompt:     d.system_prompt   || '',
      reranker_enabled:  d.reranker_enabled ?? false,
      reranker_backend:  d.reranker_backend || 'local',
      reranker_model:    d.reranker_model   || 'BAAI/bge-reranker-v2-m3',
      reranker_api_base: d.reranker_api_base || '',
      reranker_api_key:  '',
      query_rewrite_enabled: d.query_rewrite_enabled ?? false,
      query_rewrite_mode:    d.query_rewrite_mode || 'rewrite',
      minimax_api_key:   '',
      tts_voice_id:      d.tts_voice_id    || 'presenter_female',
    }
  } catch (e) {
    appStore.showToast('加载设置失败: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await sysApi.updateSettings({
      llm_backend:      form.value.llm_backend,
      ollama_url:       form.value.ollama_url,
      ollama_model:     form.value.ollama_model,
      ollama_temperature: form.value.ollama_temperature,
      ollama_max_tokens: form.value.ollama_max_tokens,
      ext_api_key:      form.value.ext_api_key,
      ext_api_base:     form.value.ext_api_base,
      ext_model:        form.value.ext_model,
      ext_max_tokens:   form.value.ext_max_tokens,
      ext_temperature:  form.value.ext_temperature,
      embedding_model:  form.value.embedding_model,
      chunk_size:       form.value.chunk_size,
      chunk_overlap:    form.value.chunk_overlap,
      top_k:            form.value.top_k,
      rerank_top_k:     form.value.rerank_top_k,
      retrieval_score_threshold: form.value.retrieval_score_threshold,
      max_context_length: form.value.max_context_length,
      max_file_size_mb: form.value.max_file_size_mb,
      allowed_extensions: form.value.allowed_extensions,
      system_prompt:    form.value.system_prompt,
      reranker_enabled: form.value.reranker_enabled,
      reranker_backend: form.value.reranker_backend,
      reranker_model:   form.value.reranker_model,
      reranker_api_base: form.value.reranker_api_base,
      reranker_api_key: form.value.reranker_api_key,
      query_rewrite_enabled: form.value.query_rewrite_enabled,
      query_rewrite_mode:    form.value.query_rewrite_mode,
      minimax_api_key:  form.value.minimax_api_key,
      tts_voice_id:     form.value.tts_voice_id,
    })
    appStore.showToast('设置已保存，部分参数重启后生效', 'success')
    await loadHealth()
  } catch (e) {
    appStore.showToast('保存失败: ' + e.message, 'error')
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  testing.value = true
  try {
    await loadHealth()
    appStore.showToast(health.value?.ollama ? 'Ollama 连接正常' : 'Ollama 连接失败', health.value?.ollama ? 'success' : 'error')
  } catch {
    appStore.showToast('连接测试失败', 'error')
  } finally {
    testing.value = false
  }
}

onMounted(loadSettings)
</script>
