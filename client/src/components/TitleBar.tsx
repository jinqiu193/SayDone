import * as bridge from '@/services/bridge'
import { Minus, Square, X } from 'lucide-react'

export default function TitleBar() {
  return (
    <div className="flex h-10 items-center justify-end bg-titlebar border-b select-none"
         style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
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
  )
}
