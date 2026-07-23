# 2026-07-14 备份 — 浮窗低音量提示修复

## 问题

录音时如果长时间静音（>3s），浮窗右侧会显示 `音量过低，请靠近麦克风` 提示。

两个体验问题：
1. **文字太长**：原提示 10 个字符，浮窗横向空间有限时会换行/挤压，导致浮窗整体变形
2. **不会自动消失**：只在用户开口说话（rms > 阈值）时才会清掉。如果用户一直不出声，提示就一直挂着

## 修复

### 1. 缩短文字 + 缩短动画

`client/src/services/recorder/OverlayService.ts:223`：
```diff
- warning: '音量过低，请靠近麦克风',
+ // 简短提示避免浮窗变形；浮窗侧会再 setTimeout 3s 自动消失
+ warning: '麦克风无音',
```

### 2. 浮窗侧 3 秒自动消失

`client/src/overlay/Overlay.tsx`：
- 新增 `warningAutoClearTimerRef`：每次 payload.warning 变化时重置计时器
- 收到非空 warning → 起 3 秒 setTimeout，到点自动 setWarning('')
- 收到空 warning 或再次收到 warning → 清掉旧计时器再起新的

### 3. 渲染侧去掉 pulse + 强制不换行

```diff
- <span className="ml-2 text-xs animate-pulse" ...>
+ <span
+   className="ml-2 shrink-0 whitespace-nowrap text-xs"
+   title="麦克风长时间没有声音，请靠近或检查音量"
+ >
+   ⚠ {warning}
+ </span>
```

去掉了 `animate-pulse`（pulse 会让宽度抖动），加了 `shrink-0 whitespace-nowrap`（不允许换行或收缩）。

## 验证

构建耗时：1m 54s

| 文件 | 大小 |
|---|---|
| saydone.exe | 43 MB |
| SayDone_0.0.7_x64-setup.exe (NSIS) | 11 MB |
| SayDone_0.0.7_x64_zh-CN.msi | 16 MB |
| SayDone_0.0.7_x64_en-US.msi | 16 MB |