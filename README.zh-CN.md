# 🎙️ SayDone — 言出，文成

**随口说，出色写。** 按住说话，松开即得 AI 润色后的文字，自动输入到光标位置。

[English](README.md) | 中文

告别打字——用说话代替键盘，AI 实时把口语变成书面表达。

<p>
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/Tauri-v2-orange" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/Rust-🦀-red" alt="Rust" />
  <img src="https://img.shields.io/badge/React-18-61dafb" alt="React 18" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## 📦 下载安装

> 支持 Windows 10/11 x64，开箱即用，无需额外运行时

| 安装包 | 大小 | 下载 |
|--------|------|------|
| **NSIS（推荐）** | 15MB | [SayDone_1.0.0_x64-setup.exe](https://github.com/jinqiu193/SayDone/releases/download/v1.0.0/SayDone_1.0.0_x64-setup.exe) |
| MSI 中文版 | 22MB | [SayDone_1.0.0_x64_zh-CN.msi](https://github.com/jinqiu193/SayDone/releases/download/v1.0.0/SayDone_1.0.0_x64_zh-CN.msi) |

<details>
<summary>📖 首次使用配置教程</summary>

1. 下载并安装
2. 打开 SayDone，首次启动会引导你配置语音识别服务
3. 选择一个 ASR 供应商（推荐千问 ASR，有免费额度）
4. 填入 API Key（各供应商获取方式见下方表格）
5. 按住 `Alt` 键开始说话，松开后文字自动输入到光标位置

**零配置方案**：如果不想注册云服务，选择"本地离线"模式，下载 SenseVoice 模型后即可离线使用。
</details>

---

## ✨ 核心功能

### 🎤 全局语音输入
在任何应用中按住 `Alt` 键即可口述，松开后文字自动插入光标位置。支持微信、Word、浏览器、IDE、聊天软件——任意输入框。

### ✍️ AI 智能润色
口语自动转书面语，去口癖（"嗯""那个"）、纠错、分段。支持自定义 prompt，灵活控制润色风格——从忠实转录到正式公文，一键切换。

### 🔌 7 种语音识别引擎

| 供应商 | 模型 | 特点 | 费用 | 推荐场景 |
|--------|------|------|------|---------|
| 豆包 ASR | Doubao-Seed-ASR-2.0 | 速度快，准确率高 | 按量计费 | 日常使用 |
| 千问 ASR | qwen3-asr-flash | 流式输出，实时性好 | 有免费额度 | 追求实时性 |
| 智谱 GLM-ASR | glm-asr-2512 | SSE 流式，中文强 | 有免费额度 | 中文场景 |
| MiniMax | asr-1.0 | 稳定可靠 | 有免费额度 | 通用场景 |
| 本地离线 | SenseVoice GGUF | 无需联网，隐私安全 | **免费** | 隐私优先 |

### 🚀 长录音不丢字
自动 30 秒分片并发转写，支持数分钟连续语音。不会因为录音太长导致识别失败或丢字。

### 🖱️ 鼠标 PTT — 全程不碰键盘
- **中键按住** → 开始说话
- **松开** → 自动转文字并输入
- **滚轮上滑** → 发送
- **滚轮下滑** → 删除

一只手完成语音输入全流程，适合不方便用键盘的场景。

### 🤖 AI 对话模式
按住 `Ctrl` 键说话，松开后 AI 直接回答并插入。可用于 AI 写作助手、快速提问等场景。

### 📊 悬浮窗实时反馈
录音状态、波形动画、处理进度实时可见。不用切窗口，看一眼就知道状态。

### 💾 历史记录
所有转录结果本地保存，支持搜索和收藏。误删可找回，历史可回放。

### 📄 智能模板
RAG 知识库 + 场景模板，按场景自动选择润色风格。写邮件用正式风格、写消息用口语风格。

### 🎨 多主题
多种主题风格，界面简洁现代。支持跟随系统主题自动切换。

---

## 🎯 为什么选 SayDone？

| 对比项 | SayDone | Windows 语音输入 | 其他工具 |
|--------|---------|-----------------|---------|
| AI 润色 | ✅ 口语→书面 | ❌ 原样输出 | 部分 |
| 离线识别 | ✅ 无需联网 | ❌ | 少数 |
| 全局注入 | ✅ 任意输入框 | ✅ | 部分 |
| 鼠标操作 | ✅ 全程鼠标 | ❌ | ❌ |
| 长录音 | ✅ 分片并发 | ❌ | 部分 |
| 多引擎切换 | ✅ 7 种引擎 | ❌ | 1-2 种 |
| 自定义热词 | ✅ | ❌ | 部分 |
| 开源免费 | ✅ | ✅ | 大多收费 |

---

## ⌨️ 快捷键

| 模式 | 快捷键 | 说明 |
|------|--------|------|
| 按住说话 | `Alt` | 按住开始录音，松开结束并转文字 |
| 免提模式 | `Shift` | 按一次开始，再按结束（适合长录音） |
| AI 对话 | `Ctrl` | 按住录音，松开后 AI 回复 |
| 鼠标 PTT | `中键` | 按住中键说话，滚轮上滑发送 |

> 所有快捷键均可自定义

---

## 🔧 配置指南

### 快速开始（3 分钟）

1. **安装** SayDone
2. 打开设置 → 语音识别 (ASR)
3. 选择供应商（推荐 **千问 ASR**，有免费额度）
4. 在[百炼平台](https://bailian.console.aliyun.com/)注册获取 API Key
5. 填入 Key，点击「测试连接」
6. 按住 `Alt` 键开始说话

### AI 润色配置

支持 DeepSeek、通义千问、Azure OpenAI、Ollama 本地模型。在设置页配置 AI 供应商和自定义 prompt。

<details>
<summary>📝 润色 Prompt 示例</summary>

```
你是语音文本精炼助手。输入是 ASR 语音识别的原始转写，你的任务是清洗为可直接使用的干净文本。
核心原则：保留用户全部有效信息，只清除语音噪声和识别错误。
1. 移除口语填充词（嗯、啊、那个、就是说）
2. 识别自我修正——"不对""不是"后以最终表达为准
3. 修正明显的语音识别错误：同音字、专有名词
4. 添加标点符号，必要时分段
只输出精炼后的文本。
```
</details>

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

<details>
<summary>🏗️ 项目架构</summary>

```
client/
├── src/
│   ├── overlay/          # 悬浮窗（独立窗口）
│   ├── services/
│   │   ├── recorder/     # 录音状态机 + 子模块
│   │   ├── transcription/ # ASR Provider 层
│   │   ├── bridge.ts     # Tauri IPC 桥
│   │   └── store.ts      # 本地存储
│   ├── features/
│   │   └── settings/     # 设置页
│   └── pages/            # 主页面
└── src-tauri/
    └── src/
        ├── providers/    # Rust ASR 供应商实现
        ├── keyboard/      # 全局键盘钩子
        ├── inject/        # 文字注入
        └── models/        # 本地模型管理
```
</details>

---

## 📸 效果演示

> 🎬 录制中，敬请期待

---

## ❓ FAQ

<details>
<summary>支持 macOS / Linux 吗？</summary>
目前仅支持 Windows。Tauri v2 框架支持跨平台，未来可能适配 macOS。
</details>

<details>
<summary>本地离线模式需要什么配置？</summary>
下载 SenseVoice GGUF 模型（254MB~470MB），无需 GPU，CPU 即可运行。完全离线，隐私安全。
</details>

<details>
<summary>API Key 是必须的吗？</summary>
不是。选择"本地离线"模式，下载模型后即可免费使用，无需任何 API Key。
</details>

<details>
<summary>录音最长能支持多久？</summary>
自动 30 秒分片并发转写，实测支持数分钟连续语音。免提模式适合长录音。
</details>

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

本项目采用 MIT 许可证。第三方组件遵循其各自的许可证。

## Use plugin: trae-remote-official:github
