# 🎙️ SayDone — 言出，文成

**随口说，出色写。** 按住说话，松开即得 AI 润色后的文字，自动输入到光标位置。

[English](README.md) | 中文

---

## 📦 下载安装

> 支持 Windows 10/11，开箱即用

| 安装包 | 说明 | 下载 |
|--------|------|------|
| NSIS 安装包（推荐） | 15MB，静默安装 | [SayDone_1.0.0_x64-setup.exe](https://github.com/jinqiu193/SayDone/releases/download/v1.0.0/SayDone_1.0.0_x64-setup.exe) |
| MSI 中文版 | 22MB | [SayDone_1.0.0_x64_zh-CN.msi](https://github.com/jinqiu193/SayDone/releases/download/v1.0.0/SayDone_1.0.0_x64_zh-CN.msi) |

---

## ✨ 核心功能

- **🎤 全局语音输入** — 在任何应用中按住快捷键即可口述，松开后文字自动插入光标位置
- **✍️ AI 智能润色** — 口语自动转书面语，去口癖、纠错、分段，支持自定义 prompt
- **🔌 7 种语音识别引擎** — 豆包 ASR、千问 ASR、智谱 GLM-ASR、MiniMax ASR、本地离线（FunASR / sherpa-onnx GGUF）
- **🚀 长录音不丢字** — 自动 30 秒分片并发转写，支持数分钟连续语音
- **📝 热词增强** — 自定义专业术语词表，大幅提升领域识别准确率
- **🖱️ 鼠标 PTT** — 中键按住说话，滚轮上滑发送/下滑删除，全程不碰键盘
- **🤖 AI 对话模式** — 按住 Ctrl 说话，松开后 AI 直接回答并插入
- **📊 悬浮窗反馈** — 录音状态、波形动画、处理进度实时可见
- **💾 历史记录** — 所有转录结果本地保存，支持搜索和收藏
- **📄 智能模板** — RAG 知识库 + 场景模板，按场景自动选择润色风格
- **🎨 多主题** — 多种主题风格，界面简洁现代

---

## 🎯 为什么选 SayDone？

| 对比项 | SayDone | 系统语音输入 | 其他工具 |
|--------|---------|-------------|---------|
| AI 润色 | ✅ 口语→书面 | ❌ 原样输出 | 部分 |
| 离线识别 | ✅ FunASR/GGUF | ❌ | 少数 |
| 全局注入 | ✅ 任意输入框 | ✅ | 部分 |
| 鼠标操作 | ✅ 全程鼠标 | ❌ | ❌ |
| 长录音 | ✅ 分片并发 | ❌ | 部分 |
| 开源免费 | ✅ | - | 大多收费 |

---

## ⌨️ 快捷键

| 模式 | 快捷键 | 说明 |
|------|--------|------|
| 按住说话 | `Alt` | 按住开始录音，松开结束并转文字 |
| 免提模式 | `Shift` | 按一次开始，再按结束（适合长录音） |
| AI 对话 | `Ctrl` | 按住录音，松开后 AI 回复 |
| 鼠标 PTT | `中键` | 按住中键说话，滚轮上滑发送 |

---

## 🔧 配置指南

### 语音识别（ASR）

| 供应商 | 模型 | 特点 | 费用 |
|--------|------|------|------|
| 豆包 ASR | Doubao-Seed-ASR-2.0 | 速度快，准确率高 | 按量计费 |
| 千问 ASR | qwen3-asr-flash | 流式输出，实时性好 | 有免费额度 |
| 智谱 GLM-ASR | glm-asr-2512 | SSE 流式，中文强 | 有免费额度 |
| MiniMax | asr-1.0 | 非流式，稳定 | 有免费额度 |
| 本地离线 | SenseVoice GGUF | 无需联网，隐私安全 | 免费 |

### AI 润色

支持 DeepSeek、通义千问、Azure OpenAI、Ollama 本地模型。自定义 prompt 灵活控制润色风格。

---

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| 桌面客户端 | Tauri v2、React 18、TypeScript、Tailwind CSS |
| 系统集成 | Rust（全局键盘/鼠标钩子、剪贴板、SQLite） |
| 语音识别 | 豆包/千问/智谱/MiniMax + FunASR、sherpa-onnx (C/C++) |
| AI 润色 | DeepSeek、通义千问、Azure OpenAI、Ollama |
| RAG 嵌入 | fastembed |
| Office 集成 | UI Automation (UIA) 文字注入 |

---

## 🚀 开发

```bash
# 安装依赖
cd client && npm install

# 开发模式
npm run tauri dev

# 构建安装包
npm run tauri build
```

**前置要求：** Node.js 18+、Rust 1.75+、Windows 10/11

---

## 📸 效果演示

> 🎬 录制中，敬请期待

---

## 🙏 致谢

本项目基于以下优秀开源项目构建：

- [SayIt](https://github.com/crosswk/SayIt) — 语音输入 + AI 润色架构参考
- [FunASR](https://github.com/modelscope/FunASR) — 阿里达摩院离线语音识别
- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) — C/C++ 语音识别框架
- [Tauri](https://github.com/tauri-apps/tauri) — 桌面应用框架
- [React](https://github.com/facebook/react) — UI 框架

---

## 📄 许可证

本项目仅供个人学习研究使用。第三方组件遵循其各自的许可证。

## Use plugin: trae-remote-official:github
