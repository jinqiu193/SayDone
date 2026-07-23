import * as bridge from '@/services/bridge'
import { Minus, Square, X, Wand2 } from 'lucide-react'
import appIcon from '@/assets/ico-frame-48x48.png'
import { useAiEnabled } from '@/hooks/useAiEnabled'
import { toggleAiEnabled } from '@/stores/aiEnabled'
import { Tooltip } from '@/components/ui/tooltip'

export default function TitleBar() {
  const aiEnabled = useAiEnabled()

  return (
    <div className="flex h-10 items-center justify-between bg-titlebar border-b select-none"
         style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center gap-2.5 pl-3">
        <img src={appIcon} alt="SayDone" className="h-7 w-7" draggable={false} />
        <span className="text-sm text-foreground" style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, letterSpacing: '0.01em' }}>SayDone</span>
      </div>
      <div className="flex items-center">
        <div className="flex items-center pr-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Tooltip content={aiEnabled ? 'AI 整理已开启，点击关闭后将输出识别原文' : 'AI 整理已关闭，点击开启后自动整理'}>
            <button
              type="button"
              role="switch"
              aria-checked={aiEnabled}
              onClick={() => { void toggleAiEnabled() }}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-accent"
              aria-label="AI 整理开关"
            >
              <Wand2 className={aiEnabled ? 'h-3.5 w-3.5 text-primary' : 'h-3.5 w-3.5 text-muted-foreground'} />
              <span className={aiEnabled ? 'text-xs text-foreground' : 'text-xs text-muted-foreground'}>AI 整理</span>
              <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${aiEnabled ? 'bg-primary' : 'bg-muted'}`}>
                <span className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-card shadow transition-transform ${aiEnabled ? 'translate-x-3' : ''}`} />
              </span>
            </button>
          </Tooltip>
        </div>
        <div className="flex" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => bridge.minimize()}
                  className="flex h-10 w-11 items-center justify-center hover:bg-accent"
                  aria-label="最小化">
            <Minus className="h-4 w-4" />
          </button>
          <button onClick={() => bridge.maximize()}
                  className="flex h-10 w-11 items-center justify-center hover:bg-accent"
                  aria-label="最大化">
            <Square className="h-3 w-3" />
          </button>
          <button onClick={() => bridge.close()}
                  className="flex h-10 w-11 items-center justify-center hover:bg-titlebar-close-hover hover:text-titlebar-close-hover-text"
                  aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
