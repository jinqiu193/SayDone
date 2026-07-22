# SayIt 项目开发规范

## 项目命名说明
- **Cargo.toml**: `name = "saydone"` → 编译出 `saydone.exe`
- **tauri.conf.json**: `"productName": "SayDone"`
- **文件夹名**: `SayIt-main`（历史遗留）
- 正确的可执行文件是 `saydone.exe`，不是 `sayit.exe`

## 启动流程

### Tauri 开发模式
这是一个 Tauri 桌面应用，前端运行在 WebView2 里，不是浏览器网页。

**正确启动方式：**
1. 先启动前端开发服务器：
   ```bash
   cd e:\SayIt-main\SayIt-main\client
   npm run dev
   ```
2. 再启动应用：
   ```bash
   e:\SayIt-main\SayIt-main\client\src-tauri\target\release\saydone.exe
   ```
   或者使用 `npm start`（会同时启动前端和应用）

**常见错误：**
- `ERR_CONNECTION_REFUSED localhost:1420` → 前端开发服务器未运行，需先执行 `npm run dev`
- 不要直接访问浏览器中的 localhost:1420，那是给 WebView2 加载用的
- 图标/名称不一样 → 使用 `saydone.exe`，不是 `sayit.exe`
