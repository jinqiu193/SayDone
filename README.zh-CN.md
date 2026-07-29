# SayDone 言出，文成

**随口说，出色写 — 用说话代替打字，AI 实时把口语变成书面表达。**

[English](README.md) | 中文

按下快捷键开始说话，松开后，润色后的文字自动输入到光标位置。

---

## 功能特性

- **全局语音输入** — 在任何应用中按下快捷键即可口述，文字自动插入光标位置
- **AI 智能润色** — 口语自动转书面语，去口癖、纠错、分段
- **多种语音识别** — 豆包 ASR、千问 ASR、本地离线识别（FunASR / sherpa-onnx）
- **热词增强** — 自定义专业术语词表，提升识别准确率
- **悬浮窗反馈** — 录音状态、波形动画、处理进度实时可见
- **历史记录** — 所有转录结果本地保存，支持搜索和收藏
- **模板匹配** — 基于 RAG 的智能模板系统，按场景润色
- **鼠标 PTT** — 中键按住说话，滚轮上滑发送，下滑删除
- **多主题** — 支持多种主题风格，界面美观

---

## 下载

[下载 Windows 安装包](https://github.com/jinqiu193/YCRW/releases)

---

## 使用方法

### 快捷键

| 模式 | 快捷键 | 说明 |
|------|--------|------|
| 按住说话 | `Alt` | 按住开始录音，松开结束并转文字 |
| 免提模式 | `Shift` | 按一次开始，再按结束 |
| AI 对话 | `Ctrl` | 按住录音，松开后 AI 回复 |
| 鼠标 PTT | `中键` | 按住中键说话 |

### 配置

1. 首次使用需要配置语音识别和 AI 润色服务
2. 支持云 API（豆包、千问等）和本地部署
3. 可以自定义热词库，提升专业术语识别准确率

---

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面客户端 | Tauri v2、React、TypeScript、Tailwind CSS |
| 客户端系统集成 | Rust（全局键盘钩子、剪贴板、SQLite） |
| 语音识别 | Qwen3-ASR、字节豆包 ASR、FunASR、sherpa-onnx (C/C++) |
| AI 润色 | DeepSeek、通义千问、Azure OpenAI |
| RAG 嵌入 | fastembed |
| Office 集成 | UI Automation (UIA) 实现文字注入到 Microsoft Office |

---

## 开发

```bash
# 安装依赖
cd client
npm install

# 开发模式
npm run tauri dev

# 构建
npm run tauri build
```

### 前置要求

- Node.js 18+
- Rust 1.75+
- Windows 10/11

---

## 致谢与开源依赖

本项目基于以下优秀开源项目构建。我们尊重所有贡献者的知识产权，并在此致以诚挚的感谢：

| 项目 | 作者 | 许可证 | 贡献 |
|------|------|--------|------|
| [SayIt](https://github.com/crosswk/SayIt) | crosswk | AGPL-3.0 | 主要参考 — 语音输入 + AI 润色架构 |
| [VocoType](https://github.com/233stone/vocotype-cli) | 233stone | Apache 2.0 | 核心语音输入架构与 CLI 参考 |
| [FunASR](https://github.com/modelscope/FunASR) | 阿里巴巴达摩院 | Apache 2.0 | 离线语音识别引擎 |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | k2-fsa | Apache 2.0 | C/C++ 语音识别框架，基于 ONNX 运行时 |
| [ModelX RAG](https://github.com/modelx-ai/rag) | hua | AGPL-3.0 | RAG 知识库系统参考 |
| [Tauri](https://github.com/tauri-apps/tauri) | Tauri Apps | MIT/Apache 2.0 | 桌面应用框架 |
| [React](https://github.com/facebook/react) | Meta | MIT | UI 框架 |

**特别说明：** 本项目包含 sherpa-onnx 的 C/C++ 组件用于本地语音识别，并通过 UI Automation (UIA) 与 Microsoft Office 集成实现文字注入。所有第三方组件保留其原始许可证和版权声明。

---

## 许可证

本项目仅供个人学习研究使用。第三方组件遵循其各自的许可证。

## Use plugin: trae-remote-official:github
