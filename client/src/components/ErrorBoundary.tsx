// 通用 React Error Boundary — 防止单个组件的 render 错误让整个窗口/浮窗白屏。
// 用法：
//   <ErrorBoundary name="Overlay">
//     <Overlay />
//   </ErrorBoundary>

import React from 'react'

interface Props {
  /** 诊断标签，写入 runtime 日志 */
  name: string
  /** 出错时显示的兜底 UI（默认：紧凑错误条 + 重置按钮） */
  fallback?: React.ReactNode
  /** 出错时调用的回调（可用于：上报 / 强制 overlay state reset / IPC 通知） */
  onError?: (error: Error, info: React.ErrorInfo) => void
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 静默写入 runtime event；不冒到 console 避免与 P1-6 的清理冲突
    void import('../services/debugLog').then(({ addRuntimeEvent }) => {
      addRuntimeEvent('error', 'react-boundary', `[${this.props.name}] ${error.message}`, {
        stack: error.stack?.slice(0, 800),
        componentStack: info.componentStack?.slice(0, 400),
      })
    }).catch(() => {})
    this.props.onError?.(error, info)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback

    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <div className="max-w-md rounded-lg border border-border/40 bg-card p-4 text-card-foreground shadow-sm">
          <p className="text-sm font-semibold text-destructive">
            {this.props.name} 出现渲染错误
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {this.state.error?.message ?? '未知错误'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            重试
          </button>
        </div>
      </div>
    )
  }
}