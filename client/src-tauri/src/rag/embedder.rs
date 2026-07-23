// 嵌入器 — BGE-small-zh-v1.5 全局单例 + 异步包装
// 模型加载策略：
//  1. 优先 ModelScope 直链下载（国内可达，不走 hf-hub）
//  2. fallback HF Xenova 仓库（通过 hf-hub，缺网络时会失败）
//  3. 用 fastembed::TextEmbedding::try_new_from_user_defined 直接喂内存字节，
//     完全跳过 hf-hub 的 HF URL 模型文件管理 → 国内网络友好

use super::config::{model_cache_dir, EMBED_MODEL_NAME};
use fastembed::{Pooling, QuantizationMode, TextEmbedding, TokenizerFiles, UserDefinedEmbeddingModel};
use parking_lot::Mutex;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

/// ModelScope 仓库（BGE-small-zh-v1.5 的 ONNX 导出版，Maiteka 维护）
const MS_REPO: &str = "https://www.modelscope.cn/Maiteka/bge-small-zh-v1.5-onnx/resolve/master";

const FILES: &[(&str, &str)] = &[
    ("model_qint8.onnx", "model.onnx"),            // 24MB 量化版，部署首选
    ("tokenizer.json", "tokenizer.json"),
    ("config.json", "config.json"),
    ("tokenizer_config.json", "tokenizer_config.json"),
    ("special_tokens_map.json", "special_tokens_map.json"),
];

/// 进度回调闭包
type ProgressFn<'a> = dyn FnMut(usize, usize, &str) + Send + 'a;

fn download_one<F: FnMut(usize, usize, &str) + ?Sized>(
    url: &str,
    progress: &mut F,
    file_idx: usize,
    file_count: usize,
    file_label: &str,
) -> Result<Vec<u8>, String> {
    log::info!("[rag-embedder] GET {}", url);
    // ModelScope 会先返回 302 → cdn-lfs-cn-1.modelscope.cn 带签名的 auth_key URL，
    // 走默认 redirect policy（10 hop）应该够。带 cookie store 防止 CSRF 校验，
    // UA 用浏览器风格防止 CDN 误判。
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .cookie_store(true)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;
    let mut resp = client
        .get(url)
        .header("Accept", "*/*")
        .send()
        .map_err(|e| format!("请求 {} 失败: {}", url, e))?;
    log::info!(
        "[rag-embedder]   → {} (final-url={})",
        resp.status(),
        resp.url()
    );
    if !resp.status().is_success() {
        return Err(format!(
            "HTTP {} (final-url={}) 下载 {} 失败",
            resp.status(),
            resp.url(),
            file_label
        ));
    }
    if !resp.status().is_success() {
        return Err(format!(
            "HTTP {} 下载 {} 失败",
            resp.status(),
            file_label
        ));
    }
    let total = resp.content_length().unwrap_or(0) as usize;
    progress(0, total, file_label);
    let mut buf: Vec<u8> = Vec::with_capacity(total.max(1024));
    let mut last_percent: i32 = -1;
    let mut chunk = [0u8; 65536];
    use std::io::Read;
    let mut downloaded: usize = 0;
    loop {
        let n = resp
            .read(&mut chunk)
            .map_err(|e| format!("读取流失败: {}", e))?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        downloaded += n;
        // 上报该文件进度（按"已下载字节 / 总字节"内部进度）
        // 整体进度 = (file_idx + downloaded/total) / file_count
        let file_pct = if total > 0 {
            (downloaded as f64 / total as f64 * 100.0) as i32
        } else {
            0
        };
        if file_pct != last_percent {
            last_percent = file_pct;
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                progress(downloaded, total, file_label);
            }));
        }
    }
    let _ = file_idx; // suppress
    let _ = file_count;
    Ok(buf)
}

fn fetch_ms(progress: &mut ProgressFn<'_>) -> Result<(Vec<u8>, TokenizerFiles), String> {
    let mut onnx_bytes: Option<Vec<u8>> = None;
    let mut tokenizer_file: Option<Vec<u8>> = None;
    let mut config_file: Option<Vec<u8>> = None;
    let mut tokenizer_config_file: Option<Vec<u8>> = None;
    let mut special_tokens_map_file: Option<Vec<u8>> = None;

    for (i, (ms_name, _label)) in FILES.iter().enumerate() {
        progress(0, 0, ms_name); // 触发 UI 更新当前文件
        let url = format!("{}/{}", MS_REPO, ms_name);
        let data = download_one(&url, progress, i, FILES.len(), ms_name)?;
        match *ms_name {
            "model_qint8.onnx" => onnx_bytes = Some(data),
            "tokenizer.json" => tokenizer_file = Some(data),
            "config.json" => config_file = Some(data),
            "tokenizer_config.json" => tokenizer_config_file = Some(data),
            "special_tokens_map.json" => special_tokens_map_file = Some(data),
            _ => {}
        }
    }

    Ok((
        onnx_bytes.ok_or_else(|| "ONNX 模型字节为空".to_string())?,
        TokenizerFiles {
            tokenizer_file: tokenizer_file.ok_or_else(|| "tokenizer.json 缺失".to_string())?,
            config_file: config_file.ok_or_else(|| "config.json 缺失".to_string())?,
            special_tokens_map_file: special_tokens_map_file
                .ok_or_else(|| "special_tokens_map.json 缺失".to_string())?,
            tokenizer_config_file: tokenizer_config_file
                .ok_or_else(|| "tokenizer_config.json 缺失".to_string())?,
        },
    ))
}

// 保留旧版本（try_new + hf-hub）作为 ModelScope 失败的兜底，但当前不再使用
#[allow(dead_code)]
fn fetch_hfhub(app: &AppHandle, progress: &mut ProgressFn<'_>) -> Result<TextEmbedding, String> {
    progress(0, 0, "尝试 HF Xenova 仓库…");
    let cache_dir = model_cache_dir(app);
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("创建缓存目录失败: {}", e))?;
    TextEmbedding::try_new(
        fastembed::InitOptions::new(fastembed::EmbeddingModel::BGESmallZHV15)
            .with_cache_dir(cache_dir)
            .with_show_download_progress(false),
    )
    .map_err(|e| format!("HF 兜底加载失败: {}", e))
}

static EMBEDDER: OnceLock<Mutex<Option<TextEmbedding>>> = OnceLock::new();

fn slot() -> &'static Mutex<Option<TextEmbedding>> {
    EMBEDDER.get_or_init(|| Mutex::new(None))
}

/// 异步初始化嵌入器（ModelScope → 本地内存加载）
pub async fn init_embedder(app: AppHandle) -> Result<(), String> {
    {
        let guard = slot().lock();
        if guard.is_some() {
            emit_status(Some(&app), "ready", 100, "嵌入模型已就绪");
            return Ok(());
        }
    }

    // 报告 0% —— UI 会显示"准备开始"
    emit_status(Some(&app), "downloading", 0, "准备加载嵌入模型");
    let _ = model_cache_dir(&app); // 确保缓存目录被创建（暂未在本路径存储）

    let app_err = app.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<TextEmbedding, String> {
        // 闭包：接受 (downloaded, total, label) 三参数调 emit_status
        // 下载端只关心"已下载/总量"，UI 端通过 percent 字段上报
        let mut current_pct: u8 = 5;
        let mut progress = |downloaded: usize, total: usize, label: &str| {
            // 整体 5–95% 区间被文件下载占用；模型初始化本身会再追 95→99
            let pct_in_file = if total > 0 {
                (downloaded as f64 / total as f64).clamp(0.0, 1.0)
            } else {
                0.0
            };
            // 文件归一化：5% + 90% * pct_in_file
            let p = 5.0 + 90.0 * pct_in_file;
            current_pct = p as u8;
            emit_status(
                Some(&app_err),
                "downloading",
                current_pct,
                &format!("下载 {}：{}%", label, (pct_in_file * 100.0) as u8),
            );
        };

        let (onnx_bytes, tok_files) = fetch_ms(&mut progress)?;
        progress(0, 0, "加载到 fastembed");

        let model = UserDefinedEmbeddingModel::new(onnx_bytes, tok_files)
            .with_quantization(QuantizationMode::Dynamic)
            .with_pooling(Pooling::Cls);

        let emb = TextEmbedding::try_new_from_user_defined(
            model,
            fastembed::InitOptionsUserDefined::default(),
        )
        .map_err(|e| format!("初始化 BGE 嵌入器失败: {}", e))?;
        Ok(emb)
    })
    .await
    .map_err(|e| format!("spawn_blocking 失败: {}", e))?;

    match result {
        Ok(emb) => {
            {
                let mut guard = slot().lock();
                *guard = Some(emb);
            }
            emit_status(Some(&app), "ready", 100, "嵌入模型已就绪");
            if let Some(storage) = app.try_state::<crate::storage::Storage>() {
                storage.with_conn(|conn| {
                    let _ = super::store::write_rag_setting(
                        conn,
                        "rag.modelStatus",
                        &serde_json::json!("ready"),
                    );
                });
            }
            Ok(())
        }
        Err(e) => {
            emit_status(Some(&app), "error", 0, &e);
            if let Some(storage) = app.try_state::<crate::storage::Storage>() {
                storage.with_conn(|conn| {
                    let _ = super::store::write_rag_setting(
                        conn,
                        "rag.modelStatus",
                        &serde_json::json!("error"),
                    );
                });
            }
            Err(e)
        }
    }
}

/// 检查嵌入器是否已初始化
pub fn is_ready() -> bool {
    slot().lock().is_some()
}

/// 模型显示名
pub fn model_name() -> &'static str {
    EMBED_MODEL_NAME
}

/// 同步 embed 一批文本（需先 init_embedder）
pub fn embed_sync(texts: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
    let mut guard = slot().lock();
    let emb = guard
        .as_mut()
        .ok_or_else(|| "嵌入模型未初始化，请先下载".to_string())?;
    emb.embed(texts, None).map_err(|e| format!("embed 失败: {}", e))
}

/// 异步包装（内部走 spawn_blocking）
pub async fn embed_async(texts: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
    tokio::task::spawn_blocking(move || embed_sync(texts))
        .await
        .map_err(|e| format!("spawn_blocking join 失败: {}", e))?
}

/// 单文本 embed（便捷方法）
pub async fn embed_one(text: &str) -> Result<Vec<f32>, String> {
    let mut results = embed_async(vec![text.to_string()]).await?;
    results
        .pop()
        .ok_or_else(|| "embed 返回为空".to_string())
}

fn emit_status(app: Option<&AppHandle>, status: &str, percent: u8, message: &str) {
    if let Some(a) = app {
        super::config::emit_model_progress(a, status, percent, message);
    }
    log::info!("[rag-embedder] {} {}% - {}", status, percent, message);
}
