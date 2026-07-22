// 豆包流式语音识别 2.0 — 实时流式会话管理
// 支持边录边发：start 时建连，send_chunk 实时发送音频，finish 发最后一包等结果

use super::doubao_protocol;
use super::types::AsrProviderConfig;
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite;

const WS_URL: &str = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream";
const RESOURCE_ID: &str = "volc.seedasr.sauc.duration";

type WsStream = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;

/// 全局会话状态
static SESSION: once_cell::sync::Lazy<Arc<Mutex<Option<WsStream>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(None)));

/// 打开豆包流式 ASR 会话：建立 WebSocket 连接并发送 client request
///
/// hotwords：热词列表，会通过 request.context 字段直传给服务端（流式输入模式最多 5000 词）
#[tauri::command]
pub async fn doubao_stream_open(
    config: AsrProviderConfig,
    sample_rate: u32,
    hotwords: Option<Vec<String>>,
) -> Result<(), String> {
    // 关闭旧会话
    {
        let mut session = SESSION.lock().await;
        if let Some(mut ws) = session.take() {
            let _ = ws.close(None).await;
        }
    }

    let app_id = if config.app_id.is_empty() { &config.api_key } else { &config.app_id };

    let request = tungstenite::http::Request::builder()
        .uri(WS_URL)
        .header("Host", "openspeech.bytedance.com")
        .header("X-Api-App-Key", app_id)
        .header("X-Api-Access-Key", &config.api_key)
        .header("X-Api-Resource-Id", RESOURCE_ID)
        .header("X-Api-Connect-Id", uuid::Uuid::new_v4().to_string())
        .header("Sec-WebSocket-Key", tungstenite::handshake::client::generate_key())
        .header("Sec-WebSocket-Version", "13")
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .body(())
        .map_err(|e| format!("构建请求失败: {}", e))?;

    let (mut ws, _) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|e| format!("WebSocket 连接失败: {}", e))?;

    // 发送 full client request
    let mut request_params = serde_json::json!({
        "model_name": "bigmodel",
        "enable_itn": true,
        "enable_punc": true,
        "result_type": "full",
        "show_utterances": true
    });
    // 注入热词（如果有）
    if let Some(words) = &hotwords {
        if let Some(ctx) = doubao_protocol::build_hotword_context(words) {
            request_params["context"] = serde_json::Value::String(ctx);
        }
    }

    let client_request = serde_json::json!({
        "user": { "uid": app_id },
        "audio": {
            "format": "pcm",
            "rate": sample_rate,
            "bits": 16,
            "channel": 1
        },
        "request": request_params
    });

    let frame = doubao_protocol::build_full_client_request(
        &serde_json::to_string(&client_request).unwrap(),
    );
    ws.send(tungstenite::Message::Binary(frame.into()))
        .await
        .map_err(|e| format!("发送请求失败: {}", e))?;

    // 等待服务端确认
    if let Some(msg) = ws.next().await {
        let msg = msg.map_err(|e| format!("接收确认失败: {}", e))?;
        if let tungstenite::Message::Binary(data) = msg {
            let resp = doubao_protocol::parse_server_response(&data)?;
            if resp.is_error {
                return Err(format!("服务端错误: {}", resp.payload));
            }
        }
    }

    // 保存会话
    let mut session = SESSION.lock().await;
    *session = Some(ws);

    Ok(())
}

/// 发送一个音频包（非最后一包）
#[tauri::command]
pub async fn doubao_stream_send(pcm_b64: String) -> Result<(), String> {
    let pcm = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD, &pcm_b64,
    ).map_err(|e| format!("base64 解码失败: {}", e))?;

    let mut session = SESSION.lock().await;
    let ws = session.as_mut().ok_or("会话未建立")?;

    let frame = doubao_protocol::build_audio_request(&pcm, false);
    ws.send(tungstenite::Message::Binary(frame.into()))
        .await
        .map_err(|e| format!("发送音频失败: {}", e))?;

    Ok(())
}

/// 发送最后一包并等待最终识别结果
///
/// `app`：Tauri AppHandle，用于在流式过程中 emit "asr-partial" 事件给前端
/// `session_id`：可选 session 标识（会议纪要场景下用于路由 partial 到正确的会话）
#[tauri::command]
pub async fn doubao_stream_finish(
    app: AppHandle,
    session_id: Option<String>,
) -> Result<String, String> {
    let mut session = SESSION.lock().await;
    let ws = session.as_mut().ok_or("会话未建立")?;

    // 发送空的最后一包（负包）
    let frame = doubao_protocol::build_audio_request(&[], true);
    ws.send(tungstenite::Message::Binary(frame.into()))
        .await
        .map_err(|e| format!("发送最后一包失败: {}", e))?;

    // 接收最终结果
    let mut final_text = String::new();
    let sid = session_id.unwrap_or_else(|| "default".to_string());

    while let Some(msg) = ws.next().await {
        let msg = msg.map_err(|e| format!("接收结果失败: {}", e))?;
        match msg {
            tungstenite::Message::Binary(data) => {
                let resp = doubao_protocol::parse_server_response(&data)?;
                if resp.is_error {
                    // 关闭会话
                    let _ = ws.close(None).await;
                    *session = None;
                    return Err(format!("识别错误: {}", resp.payload));
                }

                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&resp.payload) {
                    // utterance 模式（show_utterances=true）：result.text 是单句结果，utterances[] 是数组
                    if let Some(text) = json.get("result")
                        .and_then(|r| r.get("text"))
                        .and_then(|t| t.as_str())
                    {
                        if !text.is_empty() {
                            final_text = text.to_string();
                            // 推送 partial 给前端（isFinal=true 表示这句话已终结）
                            let _ = app.emit("asr-partial", serde_json::json!({
                                "sessionId": sid,
                                "text": final_text,
                                "isFinal": true,
                            }));
                        }
                    }
                    // 单字 partial 模式：utterances 数组里的每一项都是一句
                    if let Some(utterances) = json.get("result")
                        .and_then(|r| r.get("utterances"))
                        .and_then(|u| u.as_array())
                    {
                        for utt in utterances {
                            if let (Some(text), Some(definite)) = (
                                utt.get("text").and_then(|t| t.as_str()),
                                utt.get("definite").and_then(|d| d.as_bool()),
                            ) {
                                if !text.is_empty() {
                                    let _ = app.emit("asr-partial", serde_json::json!({
                                        "sessionId": sid,
                                        "text": text,
                                        "isFinal": definite,
                                    }));
                                }
                            }
                        }
                    }
                }

                if resp.is_last {
                    break;
                }
            }
            tungstenite::Message::Close(_) => break,
            _ => {}
        }
    }

    // 关闭连接
    let _ = ws.close(None).await;
    *session = None;

    Ok(final_text)
}

/// 关闭会话（异常中断时调用）
#[tauri::command]
pub async fn doubao_stream_close() -> Result<(), String> {
    let mut session = SESSION.lock().await;
    if let Some(mut ws) = session.take() {
        let _ = ws.close(None).await;
    }
    Ok(())
}
