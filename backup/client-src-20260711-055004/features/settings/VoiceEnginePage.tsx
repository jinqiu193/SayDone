// 语音引擎设置页面 — 工作模式 + ASR 识别服务配置 + 识别测试

import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '@/services/store'
import { switchProvider, getWorkMode, type WorkMode } from '@/services/transcription'
import { refreshRecorderSettings, reconnectProvider } from '@/services/recorder'
import WorkModeSection from './WorkModeSection'
import CloudAPISection from './CloudAPISection'
import LocalModeSection from './LocalModeSection'
import ServerSection from './ServerSection'
import AsrTestSection from './AsrTestSection'

export default function VoiceEnginePage() {
  const [workMode, setWorkMode] = useState<WorkMode>(getWorkMode)

  useEffect(() => {
    getSetting('workMode', 'server').then((value) => {
      const v = value as WorkMode
      if (v === 'server' || v === 'cloud_api' || v === 'local') setWorkMode(v)
    })
  }, [])

  const handleWorkModeChange = async (mode: WorkMode) => {
    setWorkMode(mode)
    await setSetting('workMode', mode)
    await switchProvider(mode)
    await refreshRecorderSettings()
    reconnectProvider()
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-bold">语音引擎</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        选择语音转文字的运行方式，并配置对应的识别服务。
      </p>

      <div className="space-y-6">
        <WorkModeSection value={workMode} onChange={(m) => void handleWorkModeChange(m)} />

        {workMode === 'local' && <LocalModeSection />}
        {workMode === 'server' && <ServerSection />}
        {workMode === 'cloud_api' && <CloudAPISection />}

        <AsrTestSection workMode={workMode} />
      </div>
    </div>
  )
}
