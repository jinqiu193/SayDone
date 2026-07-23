# 2026-07-13 修复备份 — Tavily camelCase IPC 序列化

## Bug

设置面板填了 API key，但前端始终提示 "Tavily API key 未配置，请先在设置中填写"。

DB 实际状态：
```
tavily.enabled    = "true"           ← 写入了
tavily.apiKey     = "\"\""           ← 被默认空字符串覆盖
tavily.maxResults = "5"              ← 巧合也是默认
tavily.topic      = "\"general\""    ← 巧合也是默认
```

`enabled` 单字段能写入，但 `api_key / max_results / topic` 三个 snake_case 字段全部丢失。

## 根因

Tauri 2 IPC 序列化只对 **最外层 command 参数名** 做 camelCase ↔ snake_case 自动转换，**不会递归到内嵌 struct 字段**。

```ts
// 前端
tavilySetConfig({ enabled: true, apiKey: "tvly-...", maxResults: 5, topic: "general" })
//       ↑ bridge.ts 包装成 invoke('tavily_set_config', { config: {...} })
//                                                          ^^^^^^^^^^
//                            最外层 config 名字无需转换
//                            但 TavilyConfig { api_key, max_results, topic } 这些内嵌字段
//                            在 Rust 端以 snake_case 定义，前端 camelCase 序列化时
//                            Rust serde 找不到对应字段，全部走 #[serde(default)]
```

## 修复

`client/src-tauri/src/tavily/types.rs`：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]   // ← 新增
pub struct TavilyConfig { ... }

#[serde(rename_all = "camelCase")]   // ← 新增
pub struct SearchQuery { ... }

#[serde(rename_all = "camelCase")]   // ← 新增
pub struct SearchResults { ... }
```

RAG 那边没遇到这个问题是因为它只用了 `enabled / top_k`，且前端发送时已经统一 snake_case 在外层，绕开了 Tauri 2 不递归转换的限制。

## 用户操作

旧 DB 里 `tavily.apiKey` 是空字符串（被默认值覆盖），升级后需要：
1. 安装新版本
2. 重新填一次 API Key（这次会真正写入 DB）

如果想保留原 key，可以用 SQL 直接 patch：
```sql
UPDATE app_settings SET value_json = '"tvly-你的key"' WHERE key = 'tavily.apiKey';
```

## 产物

构建耗时：1m 53s（纯打 bundle，未重新编译 Rust）

| 文件 | 大小 |
|---|---|
| saydone.exe | 43 MB |
| SayDone_0.0.7_x64-setup.exe (NSIS) | 11 MB |
| SayDone_0.0.7_x64_zh-CN.msi | 16 MB |
| SayDone_0.0.7_x64_en-US.msi | 16 MB |