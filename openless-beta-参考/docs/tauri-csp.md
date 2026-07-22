# Tauri CSP 边界

OpenLess 的桌面 WebView 已在 `openless-all/app/src-tauri/tauri.conf.json` 启用最小 CSP。该策略只放开前端渲染和 Tauri IPC 必需的来源：

- `script-src 'self'`：脚本只允许随应用打包的前端产物；Tauri 会在构建时为自身注入脚本补齐必要 nonce / hash。
- `connect-src 'self' ipc: http://ipc.localhost http://localhost:1420 ws://localhost:1420`：允许同源连接、Tauri IPC，以及 Vite 开发模式的本机 HTTP / HMR 连接。
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` 与 `font-src https://fonts.gstatic.com`：当前 React 页面大量使用 `style={{ ... }}` 保持设计稿像素对齐，因此短期保留 inline style；外部字体只允许 Google Fonts 相关域名。
- `object-src 'none'`、`base-uri 'none'`、`form-action 'none'`、`frame-ancestors 'none'`：关闭插件对象、base URL、表单提交和嵌入入口。

Provider 校验、ASR/LLM 请求、更新检查、本地 ASR 模型下载等网络访问都在 Rust / Tauri plugin 侧执行，不通过 WebView 的 `fetch` 直连外部服务，因此不在 WebView CSP 中放开 provider 域名。QA markdown 的 sanitizer 仍是第一道防线；CSP 只作为纵深防御。
