# SayDone

**Speak naturally, write brilliantly — Replace typing with your voice, AI turns spoken words into polished text in real time.**

[中文文档](README.zh-CN.md) | English

Press a hotkey to start speaking, release to finish — AI-polished text is automatically inserted at your cursor position.

---

## Features

- **Global Voice Input** — Press a hotkey in any application to dictate; text is auto-inserted at the cursor
- **AI Polishing** — Automatically converts spoken language to written language, removes filler words, corrects errors, and restructures paragraphs
- **Multiple ASR Engines** — Doubao ASR, Qwen3-ASR, local offline recognition (FunASR / sherpa-onnx)
- **Hotword Enhancement** — Custom terminology dictionaries to improve recognition accuracy
- **Overlay Feedback** — Real-time recording status, waveform animation, and processing progress
- **History Records** — All transcriptions saved locally with search and favorites
- **Template Matching** — RAG-based smart template system for scenario-specific polishing
- **Mouse PTT** — Middle-button push-to-talk, scroll-up to send, scroll-down to delete
- **Multi-Theme** — Multiple theme styles with a clean, modern UI

---

## Download

[Download Windows Installer](https://github.com/jinqiu193/YCRW/releases)

---

## Usage

### Hotkeys

| Mode | Key | Description |
|------|-----|-------------|
| Push to Talk | `Alt` | Hold to record, release to transcribe and insert |
| Hands-Free | `Shift` | Press once to start, press again to stop |
| AI Chat | `Ctrl` | Hold to record, release for AI response |
| Mouse PTT | `Middle Button` | Hold middle button to talk |

### Configuration

1. Configure ASR and AI polishing services on first launch
2. Supports cloud APIs (Doubao, Qwen, etc.) and local deployment
3. Customize hotword dictionaries for domain-specific terminology

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Client | Tauri v2, React, TypeScript, Tailwind CSS |
| System Integration | Rust (global keyboard hooks, clipboard, SQLite) |
| Speech Recognition | Qwen3-ASR, Doubao ASR, FunASR, sherpa-onnx (C/C++) |
| AI Polishing | DeepSeek, Qwen, Azure OpenAI |
| RAG Embedding | fastembed |
| Office Integration | UI Automation (UIA) for text insertion into Microsoft Office |

---

## Development

```bash
# Install dependencies
cd client
npm install

# Development mode
npm run tauri dev

# Build
npm run tauri build
```

### Prerequisites

- Node.js 18+
- Rust 1.75+
- Windows 10/11

---

## Acknowledgements & Open-Source Dependencies

This project builds upon the work of outstanding open-source projects. We deeply respect the intellectual property of all contributors and gratefully acknowledge the following projects:

| Project | Author | License | Contribution |
|---------|--------|---------|-------------|
| [VocoType](https://github.com/233stone/vocotype-cli) | 233stone | Apache 2.0 | Core voice input architecture and CLI reference |
| [FunASR](https://github.com/modelscope/FunASR) | Alibaba DAMO Academy | Apache 2.0 | Offline speech recognition engine |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | k2-fsa | Apache 2.0 | C/C++ speech recognition framework with ONNX runtime |
| [ModelX RAG](https://github.com/modelx-ai/rag) | hua | AGPL-3.0 | RAG knowledge base system reference |
| [Tauri](https://github.com/tauri-apps/tauri) | Tauri Apps | MIT/Apache 2.0 | Desktop application framework |
| [React](https://github.com/facebook/react) | Meta | MIT | UI framework |

**Note:** This project includes C/C++ components from sherpa-onnx for on-device speech recognition, and integrates with Microsoft Office via UI Automation (UIA) for text insertion. All third-party components retain their original licenses and copyrights.

---

## License

This project is for personal learning and research use only. Third-party components are subject to their respective licenses.

## Use plugin: trae-remote-official:github
