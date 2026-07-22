# qwen-asr submodule 升级检查清单

`openless-all/app/src-tauri/vendor/qwen-asr` 是 macOS 本地 Qwen3-ASR 的 C 引擎来源。OpenLess 只从组织 fork `https://github.com/Open-Less/qwen-asr.git` 拉取 submodule；`antirez/qwen-asr` 只作为上游同步来源，不直接进入主仓构建链路。

## 升级原则

- 不直接把 `.gitmodules` 改回个人上游仓库。
- 不在未审查 upstream diff 的情况下推进 submodule commit。
- 每次升级只推进 submodule 指针；除非编译或 FFI 必需，不混入 OpenLess 主项目逻辑改动。
- 保留当前锁定 commit 的可回滚性，必要时能 `git checkout <old-commit> -- openless-all/app/src-tauri/vendor/qwen-asr` 回退。

## 操作步骤

1. 在 `Open-Less/qwen-asr` fork 中同步 upstream。
2. 审查 fork 中待引入 commit：
   - C 源码：`qwen_asr*.c`、`qwen_asr*.h`
   - 构建脚本 / 模型下载脚本
   - 新增二进制、大文件、网络下载地址或 shell 命令
   - FFI API 是否改变：`qwen_load`、`qwen_free`、`qwen_set_token_callback`、`qwen_transcribe_audio`、`qwen_transcribe_stream`
3. 在 OpenLess 主仓更新 submodule：
   ```bash
   git submodule sync --recursive openless-all/app/src-tauri/vendor/qwen-asr
   git submodule update --init --recursive openless-all/app/src-tauri/vendor/qwen-asr
   cd openless-all/app/src-tauri/vendor/qwen-asr
   git fetch origin
   git checkout <reviewed-commit>
   cd -
   ```
4. 验证 submodule 来源仍是组织 fork：
   ```bash
   git config --file .gitmodules --get submodule.openless-all/app/src-tauri/vendor/qwen-asr.url
   git -C openless-all/app/src-tauri/vendor/qwen-asr remote get-url origin
   git submodule status openless-all/app/src-tauri/vendor/qwen-asr
   git diff --submodule=log -- openless-all/app/src-tauri/vendor/qwen-asr
   ```
5. 至少运行：
   ```bash
   cd openless-all/app
   npm run build
   cargo check --manifest-path src-tauri/Cargo.toml
   ```
   macOS 发布前还要用 `INSTALL=0 ./scripts/build-mac.sh` 验证 C 源编译和链接。

## PR / commit 说明必须包含

- 旧 submodule commit 和新 submodule commit。
- 已审查的 upstream commit 范围。
- 是否有 FFI API、模型文件结构、下载脚本或构建参数变化。
- 已运行的验证命令和未覆盖的平台。
