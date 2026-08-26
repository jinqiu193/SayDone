// ResultDispatcher — ASR/LLM 结果处理：保存音频 + 写历史 + 个性化 + 调 AI chat
//
// 职责：
// 1. processFinalResult：语音转文字 → 去重 / 分段 / 替换 → 注入
// 2. processAIChatResult：调 bridge.aiChat → 注入 AI 输出
// 3. onError：保存音频兜底 + 写 isEmpty 历史
// 4. updatePersonalizationFromFinal：写用户统计
//
// 不负责：ASR 调用（Provider）、文本注入（TextInserter）、状态机（顶层 Orchestrator）。
//
// 注意：
// - 本类不持有 this.provider.mode —— 通过 deps.getProviderMode() 读取
// - 本类不持有 this.cachedPresets —— 通过 deps.getActiveChatPreset() 等读取
// - 本类不持有 audioStats —— 由 AudioPipeline 在 stopRecording 时取 snapshot

import * as bridge from '../bridge'
import { addRuntimeEvent } from '../debugLog'
import { saveRecordingAudio } from '../audioFileService'
import { dedupeAsrText } from '../asrTextDedup'
import { segmentAsrText } from '../textSegmenter'
import { applyTextReplacements } from '../textReplacement'
import { stripMarkdown } from '@/lib/stripMarkdown'
import { getSetting, addHistory } from '../store'
import { recordSessionStats } from '../personalization/store'
import { matchTemplate } from '../templates/matcher'
import type { FinalResult, TranscriptionProvider } from '../transcription'
import type { ActiveAppContext } from '../../types/appContext'
import type { PromptResolution, UserStats } from '../personalization/types'
import type { OverlayService } from './OverlayService'
import type { RecorderContext, TimedOutProcessingContext } from './types'
import type { AudioPipeline } from './AudioPipeline'
import { buildStatsAppId } from './helpers'

export interface ResultDispatcherDeps {
  /** 顶层 audio pipeline（拿到 finalize / hasIncrementalData） */
  audioPipeline: AudioPipeline
  /** 顶层 ctx（外部读 getLiveElapsedSec / getAudioDurationSec） */
  getRecorderState: () => RecorderContext['state']
  getProviderMode: () => TranscriptionProvider['mode']
  getUserStats: () => UserStats
  setUserStats: (stats: UserStats) => void
  /** 当前激活的 AI chat preset（processAIChatResult 用） */
  getActiveChatPreset?: () => { mode?: 'proofread' | 'chat'; systemPrompt?: string; id?: string; name?: string } | undefined
  /** 用于 processFinalResult 的 buildProviderMetadata */
  buildProviderMetadata: (finalResult?: { asrEngine?: string; asrModel?: string }) => Promise<{
    asrProvider?: string
    aiProvider?: string
    aiModel?: string
  }>
  /** 顶层 transition state 回调：用于 onError 时直接 resetToIdle */
  resetToIdleFn: (opts?: { keepOverlay?: boolean }) => void
  /** TextInserter.handleTextInsertion 注入文本（ctx 共享但函数引用按依赖注入） */
  handleTextInsertionFn: (text: string, options?: { allowWhenIdle?: boolean }) => Promise<void>
  /** 获取模板模式状态（CTRL 键按下时为 true） */
  getTemplateMode: () => boolean
}

export class ResultDispatcher {
  constructor(
    private ctx: RecorderContext,
    private overlayService: OverlayService,
    private deps: ResultDispatcherDeps,
  ) {}

  /** AI 对话模式：调 bridge.aiChat + 注入。
   *
   *  selection-as-input 语义：
   *  - 仅「既说话又有选区」时 selectedText 传给 bridge（双信封）
   *  - 「无语音 + 有选区」→ effectiveText = rawAsrText || selectedText；selectedText 不传 */
  async processAIChatResult(
    result: FinalResult,
    context: TimedOutProcessingContext,
    options: { allowInsertionWhenIdle: boolean; source: 'processing' | 'late_after_timeout' },
  ): Promise<void> {
    const audioDur = context.audioDurationSec
    const wallSec = context.wallTimeSec > 0 ? context.wallTimeSec : audioDur
    const rawAsrText = dedupeAsrText(result.asrText) || result.asrText || ''

    addRuntimeEvent('info', 'ai-chat', 'ASR 识别完成，准备发送给 AI', {
      asrText: rawAsrText.length > 50 ? rawAsrText.slice(0, 50) + '...' : rawAsrText,
      asrMs: result.asrMs,
      audioSec: audioDur,
    })

    const recordId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

    const capturedSelection = this.ctx.capturedSelection
    const selectedTextForEffective = capturedSelection && capturedSelection.text.trim()
      ? capturedSelection.text
      : ''
    const effectiveText = rawAsrText.trim() || selectedTextForEffective

    if (!effectiveText) {
      addRuntimeEvent('info', 'ai-chat', 'ASR 文本为空且无选区，跳过 AI 对话')
      this.overlayService.showError('没有识别到语音内容，也没有选区文字')
      if (this.ctx.state === 'processing') {
        this.deps.resetToIdleFn({ keepOverlay: true })
      }
      return
    }
    const speechEmptyButHasSelection = !rawAsrText.trim() && !!selectedTextForEffective
    if (speechEmptyButHasSelection) {
      addRuntimeEvent('info', 'ai-chat', 'ASR 文本为空但有选区 → 把选区内容当作 AI 输入', {
        selectionLen: selectedTextForEffective.length,
      })
    }

    this.overlayService.showAIThinking()

    // 读 AI config
    let aiConfig: { provider: string; api_url: string; api_key: string; model: string }
    try {
      const [provider, apiUrl, apiKey, model] = await Promise.all([
        getSetting('cloudAi.provider', 'deepseek'),
        getSetting('cloudAi.apiUrl', ''),
        getSetting('cloudAi.apiKey', ''),
        getSetting('cloudAi.model', ''),
      ])
      aiConfig = {
        provider: provider as string,
        api_url: apiUrl as string,
        api_key: apiKey as string,
        model: model as string,
      }
      if (!aiConfig.api_key) {
        addRuntimeEvent('error', 'ai-chat', '未配置 AI 供应商 API Key')
        this.overlayService.showError('未配置 AI API Key')
        if (this.ctx.state === 'processing') this.deps.resetToIdleFn({ keepOverlay: true })
        return
      }
    } catch (err) {
      addRuntimeEvent('error', 'ai-chat', '获取 AI 配置失败', { error: String(err) })
      this.overlayService.showError('获取 AI 配置失败')
      if (this.ctx.state === 'processing') this.deps.resetToIdleFn({ keepOverlay: true })
      return
    }

    addRuntimeEvent('info', 'ai-chat', '开始调用 AI 对话', {
      provider: aiConfig.provider,
      model: aiConfig.model,
      textLen: rawAsrText.length,
    })

    let aiResponseText = ''
    let aiElapsedMs = 0

    try {
      // 从当前激活的 chat preset 取 systemPrompt + mode
      const activePreset = this.deps.getActiveChatPreset?.()
      const presetMode = (activePreset?.mode ?? 'chat') as 'proofread' | 'chat'
      const presetSystemPrompt = activePreset?.systemPrompt ?? ''

      const aiResult = await bridge.aiChat({
        text: effectiveText,
        aiConfig,
        systemPrompt: presetSystemPrompt,
        mode: presetMode,
        // 仅「说话 + 选区」时启用双信封；「无语音 + 选区」走单信封（effectiveText 已含选区）
        selectedText: (rawAsrText.trim() && selectedTextForEffective) ? selectedTextForEffective : undefined,
      })
      aiResponseText = stripMarkdown(aiResult.text || '')
      aiElapsedMs = aiResult.elapsed_ms || 0
      const tavilyStatus = (aiResult as { tavily_status?: string }).tavily_status || null

      addRuntimeEvent('info', 'ai-chat', 'AI 对话完成', {
        responseLen: aiResponseText.length,
        elapsedMs: aiElapsedMs,
        tavilyStatus,
      })
      if (tavilyStatus === 'failed') {
        addRuntimeEvent('warn', 'ai-chat', 'Tavily 联网搜索失败，已降级到无搜索模式', { tavilyStatus })
      } else if (tavilyStatus === 'missing_api_key') {
        addRuntimeEvent('warn', 'ai-chat', 'Tavily 已启用但未配置 API key，已跳过联网搜索', { tavilyStatus })
      } else if (tavilyStatus === 'ok') {
        addRuntimeEvent('info', 'ai-chat', 'Tavily 联网搜索成功', { tavilyStatus })
      }
    } catch (err) {
      addRuntimeEvent('error', 'ai-chat', 'AI 对话失败', { error: String(err) })
      this.overlayService.showError('AI 对话失败: ' + String(err).slice(0, 100))
      if (this.ctx.state === 'processing') this.deps.resetToIdleFn({ keepOverlay: true })
      return
    }

    if (!aiResponseText.trim()) {
      addRuntimeEvent('warn', 'ai-chat', 'AI 返回空文本')
      this.overlayService.showError('AI 没有返回内容')
      if (this.ctx.state === 'processing') this.deps.resetToIdleFn({ keepOverlay: true })
      return
    }

    // 注入（立即开始，不等历史写完）
    this.ctx.textInsertionInFlight = true
    void this.deps.handleTextInsertionFn(aiResponseText, { allowWhenIdle: options.allowInsertionWhenIdle })
      .finally(() => {
        this.ctx.textInsertionInFlight = false
      })

    // 写历史（非阻塞，音频保存和写入都在后台进行）
    void (async () => {
      try {
        const audioFilePath = await this.saveAudioForHistory(recordId)
        await addHistory({
          id: recordId,
          timestamp: Date.now(),
          asrText: effectiveText,
          llmText: aiResponseText,
          asrMs: result.asrMs,
          llmMs: aiElapsedMs,
          durationSec: wallSec,
          audioDurationSec: audioDur > 0 ? audioDur : undefined,
          asrDurationSec: result.durationSec > 0 ? result.durationSec : undefined,
          charCount: aiResponseText.length,
          isEmpty: false,
          audioFilePath,
          ...this.buildHistoryMetadata(context.promptResolution),
        })
        void bridge.emit('history-updated')
      } catch (err) {
        addRuntimeEvent('warn', 'ai-chat', '写入历史记录失败', { error: String(err) })
      }
    })()
  }

  /** 语音转文字路径：去重 / 分段 / 替换 → 注入 */
  async processFinalResult(
    result: FinalResult,
    context: TimedOutProcessingContext,
    options: { allowInsertionWhenIdle: boolean; source: 'processing' | 'late_after_timeout' },
  ): Promise<void> {
    const dedupedAsr = dedupeAsrText(result.asrText)
    const effectiveAsr = dedupedAsr || result.asrText
    const effectiveLlm = result.llmText

    const needsSegment = !effectiveLlm || effectiveLlm === effectiveAsr
    const segmented = needsSegment ? segmentAsrText(effectiveAsr) : effectiveLlm
    let sanitized = needsSegment ? segmented : stripMarkdown(segmented)
    sanitized = sanitized.replace(/[\r\n]+/g, ' ')
    const textToPaste = await applyTextReplacements(sanitized)
    const hasText = Boolean(textToPaste && textToPaste.trim())
    const audioDur = context.audioDurationSec
    const wallSec = context.wallTimeSec > 0 ? context.wallTimeSec : audioDur
    const promptResolution = context.promptResolution
    const appContext = context.appContext

    addRuntimeEvent('info', 'recorder', '收到 final', {
      hasText,
      asrMs: result.asrMs,
      llmMs: result.llmMs,
      durationSec: result.durationSec,
      audioSec: audioDur,
      textLen: textToPaste ? textToPaste.length : 0,
      source: options.source,
    })

    const isTemplateMode = this.deps.getTemplateMode()
    if (isTemplateMode && hasText) {
      await this.processTemplateResult(textToPaste, context, options)
      return
    }

    // 保存音频 + 写历史（非阻塞，音频保存是磁盘 IO，不应延迟注入）
    void (async () => {
      try {
        const recordId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        const audioFilePath = await this.saveAudioForHistory(recordId)
        const providerMeta = await this.deps.buildProviderMetadata(result)
        await addHistory({
          id: recordId,
          timestamp: Date.now(),
          asrText: result.asrText,
          llmText: textToPaste,
          asrMs: result.asrMs,
          llmMs: result.llmMs,
          durationSec: wallSec,
          audioDurationSec: audioDur > 0 ? audioDur : undefined,
          asrDurationSec: result.durationSec > 0 ? result.durationSec : undefined,
          charCount: hasText ? textToPaste.length : 0,
          isEmpty: !hasText,
          audioFilePath,
          ...this.buildHistoryMetadata(promptResolution),
          ...providerMeta,
        })
        void bridge.emit('history-updated')
      } catch (error) {
        addRuntimeEvent('warn', 'recorder', '写入历史记录失败', { error: String(error) })
      }
    })()

    if (!hasText) {
      if (this.ctx.state === 'processing') this.deps.resetToIdleFn()
      return
    }

    // 写个性化统计
    void this.updatePersonalizationFromFinal(textToPaste, promptResolution, appContext)

    // 注入
    this.ctx.textInsertionInFlight = true
    void this.deps.handleTextInsertionFn(textToPaste, { allowWhenIdle: options.allowInsertionWhenIdle })
      .finally(() => {
        this.ctx.textInsertionInFlight = false
      })
  }

  /** 模板模式：匹配模板 + 生成文档 */
  private async processTemplateResult(
    userInput: string,
    context: TimedOutProcessingContext,
    options: { allowInsertionWhenIdle: boolean; source: 'processing' | 'late_after_timeout' },
  ): Promise<void> {
    addRuntimeEvent('info', 'template', '模板模式处理中', { userInput: userInput.slice(0, 50) })

    try {
      const matchResult = await matchTemplate(userInput)
      const { template, score } = matchResult

      if (!template) {
        addRuntimeEvent('info', 'template', '未匹配到模板或相似度低于阈值', {
          score,
          userInput: userInput.slice(0, 30),
        })
        this.overlayService.showInfo('未匹配到模板，使用普通模式')
        void this.deps.handleTextInsertionFn(userInput, { allowWhenIdle: options.allowInsertionWhenIdle })
        return
      }

      addRuntimeEvent('info', 'template', '匹配到模板', {
        templateName: template.name,
        score,
      })

      this.overlayService.showTemplateProcessing(template.name)

      const generatedText = await this.generateFromTemplate(userInput, template.content)

      this.ctx.textInsertionInFlight = true
      void this.deps.handleTextInsertionFn(generatedText, { allowWhenIdle: options.allowInsertionWhenIdle })
        .finally(() => {
          this.ctx.textInsertionInFlight = false
        })

      void (async () => {
        const recordId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        const audioDur = context.audioDurationSec
        const wallSec = context.wallTimeSec > 0 ? context.wallTimeSec : audioDur
        await addHistory({
          id: recordId,
          timestamp: Date.now(),
          asrText: userInput,
          llmText: generatedText,
          asrMs: 0,
          llmMs: 0,
          durationSec: wallSec,
          audioDurationSec: audioDur > 0 ? audioDur : undefined,
          charCount: generatedText.length,
          isEmpty: false,
          audioFilePath: undefined,
          ...this.buildHistoryMetadata(context.promptResolution),
          templateId: template.id,
          templateName: template.name,
          templateScore: score,
        })
        void bridge.emit('history-updated')
      })()
    } catch (error) {
      addRuntimeEvent('error', 'template', '模板处理失败', { error: String(error) })
      this.overlayService.showError('模板处理失败: ' + String(error).slice(0, 50))
      void this.deps.handleTextInsertionFn(userInput, { allowWhenIdle: options.allowInsertionWhenIdle })
    }
  }

  /** 使用模板内容生成文档 */
  private async generateFromTemplate(userInput: string, templateContent: string): Promise<string> {
    const aiConfig: { provider: string; api_url: string; api_key: string; model: string } = {
      provider: await getSetting('cloudAi.provider', 'deepseek') as string,
      api_url: await getSetting('cloudAi.apiUrl', '') as string,
      api_key: await getSetting('cloudAi.apiKey', '') as string,
      model: await getSetting('cloudAi.model', '') as string,
    }

    if (!aiConfig.api_key) {
      addRuntimeEvent('warn', 'template', '未配置 AI API，使用模板原文')
      return templateContent
    }

    const systemPrompt = `你是一个文档生成助手。用户会提供一个模板和一句话的需求描述。

请根据模板格式和用户的需求，生成完整的文档内容。

要求：
1. 严格按照模板的格式和结构
2. 对于模板中的占位符（如 {{xxx}}），根据用户需求填写合理的内容
3. 如果某些信息用户没有提供，使用合理的默认值或留空提示
4. 保持文档格式的完整性

模板：
${templateContent}

用户需求：${userInput}

请直接输出生成的文档内容，不要解释。`

    try {
      const result = await bridge.aiChat({
        text: userInput,
        aiConfig,
        systemPrompt,
        mode: 'chat',
      })
      return stripMarkdown(result.text || templateContent)
    } catch (error) {
      addRuntimeEvent('error', 'template', 'AI 生成失败，使用模板原文', { error: String(error) })
      return templateContent
    }
  }

  /** onError 入口：保存音频兜底 + 写 isEmpty 历史 + reset */
  async onError(msg: string): Promise<void> {
    addRuntimeEvent('error', 'backend', msg)

    const audioDur = this.ctx.audioSentSamples / 16000
    const wallSec = this.ctx.wallTimeAtStopSec > 0 ? this.ctx.wallTimeAtStopSec : audioDur
    if (audioDur >= 0.5 || this.deps.audioPipeline.hasIncrementalData()) {
      const saveErrorHistory = async () => {
        const recordId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        let audioFilePath: string | undefined
        const saveAudioEnabled = await getSetting('audioRetentionEnabled', true)
        if (saveAudioEnabled) {
          try {
            const finalized = await this.deps.audioPipeline.finalize()
            if (finalized) audioFilePath = finalized
            else if (this.ctx.recordedChunks.length > 0) {
              const savedPath = await saveRecordingAudio(recordId, this.ctx.recordedChunks)
              if (savedPath) audioFilePath = savedPath
            }
          } catch (err) {
            addRuntimeEvent('warn', 'recorder', '保存音频文件失败（错误恢复）', { error: String(err) })
          }
        } else {
          void this.deps.audioPipeline.cleanupIncomplete()
        }
        await addHistory({
          id: recordId,
          timestamp: Date.now(),
          asrText: '',
          llmText: '',
          asrMs: 0,
          llmMs: 0,
          durationSec: wallSec,
          audioDurationSec: audioDur > 0 ? audioDur : undefined,
          charCount: 0,
          isEmpty: true,
          audioFilePath,
          ...this.buildHistoryMetadata(),
        })
        void bridge.emit('history-updated')
      }
      void saveErrorHistory().catch(() => {})
    }

    this.deps.resetToIdleFn()
  }

  /** 写个性化统计 */
  async updatePersonalizationFromFinal(
    finalText: string,
    promptResolution: PromptResolution | null,
    appContext: ActiveAppContext | null,
  ): Promise<void> {
    if (!finalText.trim()) return
    try {
      const wordCount = finalText.length
      const appId = buildStatsAppId(appContext, promptResolution?.appId)
      const newStats = await recordSessionStats(appId, wordCount)
      this.deps.setUserStats(newStats)
      addRuntimeEvent('info', 'personalization', 'session stats recorded', {
        appId,
        appName: promptResolution?.appName,
        wordCount,
        totalWords: newStats.totalWords,
        totalSessions: newStats.totalSessions,
      })
    } catch (error) {
      addRuntimeEvent('warn', 'personalization', 'failed to record session stats', {
        error: String(error),
      })
    }
  }

  /** 从 settings 取 AI/ASR provider metadata — 历史记录里展示用 */
  async buildProviderMetadataFn(finalResult?: { asrEngine?: string; asrModel?: string }): Promise<{
    asrProvider?: string
    aiProvider?: string
    aiModel?: string
  }> {
    return this.deps.buildProviderMetadata(finalResult)
  }

  // ─── 私有 helpers ───

  /** 保存音频：优先增量 finalize → 回退 saveRecordingAudio */
  private async saveAudioForHistory(recordId: string): Promise<string | undefined> {
    let audioFilePath: string | undefined
    const saveAudioEnabled = await getSetting('audioRetentionEnabled', true)
    if (!saveAudioEnabled) {
      void this.deps.audioPipeline.cleanupIncomplete()
      return undefined
    }
    try {
      const finalized = await this.deps.audioPipeline.finalize()
      if (finalized) audioFilePath = finalized
      else if (this.ctx.recordedChunks.length > 0) {
        const savedPath = await saveRecordingAudio(recordId, this.ctx.recordedChunks)
        if (savedPath) audioFilePath = savedPath
      }
    } catch (err) {
      addRuntimeEvent('warn', 'recorder', '保存音频文件失败', { error: String(err) })
    }
    return audioFilePath
  }

  /** 把 promptResolution 映射成 history metadata 字段 */
  private buildHistoryMetadata(promptResolution?: PromptResolution | null) {
    const resolved = promptResolution || this.ctx.currentPromptResolution || undefined
    return {
      appId: resolved?.appId,
      appName: resolved?.appName,
      promptPresetId: resolved?.preset.id,
      promptPresetName: resolved?.preset.name,
      promptRuleId: resolved?.matchedRule?.id,
      promptSummary: resolved?.summary,
      workMode: this.deps.getProviderMode(),
    }
  }
}