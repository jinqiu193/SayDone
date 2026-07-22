// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod storage;
mod window;
mod keyboard;
mod context;
mod inject;
mod providers;
mod rag;
mod tavily;
mod models;
mod app_paths;

use storage::Storage;
use window::WindowState;
use keyboard::KeyboardHookManager;
use context::ContextDetector;
use tauri::{Manager, Emitter};
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder, CheckMenuItem};

/// Clean up expired audio files based on retention setting.
fn cleanup_expired_audio(storage: &Storage) {
    let retention_val = storage.get("audioRetentionDays", Some(&serde_json::json!(30)));
    let retention_days = retention_val.as_i64().unwrap_or(30);
    if retention_days < 0 {
        return; // -1 = keep forever
    }

    let cutoff_ms = chrono::Utc::now().timestamp_millis() - retention_days * 24 * 60 * 60 * 1000;
    let audio_dir = app_paths::audio_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

    if !audio_dir.exists() {
        return;
    }

    let mut deleted = 0u32;
    if let Ok(entries) = std::fs::read_dir(&audio_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if let Ok(meta) = std::fs::metadata(&path) {
                if let Ok(modified) = meta.modified() {
                    let mtime_ms = modified
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as i64;
                    if mtime_ms < cutoff_ms {
                        if std::fs::remove_file(&path).is_ok() {
                            deleted += 1;
                        }
                    }
                }
            }
        }
    }

    if deleted > 0 {
        log::info!("Audio cleanup: deleted {} expired files", deleted);
    }
}

/// Clean up expired log files based on retention setting.
fn cleanup_expired_logs(storage: &Storage) {
    let retention_val = storage.get("logRetentionDays", Some(&serde_json::json!(30)));
    let retention_days = retention_val.as_i64().unwrap_or(30);
    if retention_days <= 0 {
        return;
    }

    let cutoff = chrono::Utc::now() - chrono::Duration::days(retention_days);
    let cutoff_ts = cutoff.timestamp();

    let log_dir = app_paths::log_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

    if !log_dir.exists() {
        return;
    }

    let mut deleted = 0u32;
    if let Ok(entries) = std::fs::read_dir(&log_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            // 不删除当前日志文件
            if path.file_name().map(|n| n == "saydone.log").unwrap_or(false) {
                continue;
            }
            if let Ok(meta) = std::fs::metadata(&path) {
                if let Ok(modified) = meta.modified() {
                    let mtime = modified
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs() as i64;
                    if mtime < cutoff_ts {
                        if std::fs::remove_file(&path).is_ok() {
                            deleted += 1;
                        }
                    }
                }
            }
        }
    }

    if deleted > 0 {
        log::info!("Log cleanup: deleted {} expired files", deleted);
    }
}

fn main() {
    // Initialize logger so log::info!/warn!/error! produce output
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    // 全局 panic hook：tao 0.34 在窗口销毁时调 set_position 会 panic
    // "cannot move state from Destroyed"。panic 后进程会退出，但 WebView2
    // 子进程可能残留。把整个进程组都 kill 掉，避免僵尸进程堆积占内存。
    //
    // 历史上 panic 信息只写 stderr（release 默认隐藏 console），无法排查。
    // 改为同时 append 到 logs/panic.log，便于事后取证。
    let panic_log_path = app_paths::log_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("panic.log");
    if let Some(parent) = panic_log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let default_panic = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let ts = chrono::Utc::now().to_rfc3339();
        let line = format!(
            "[{}] [PANIC] {}\nbacktrace: {}\n",
            ts,
            info,
            std::backtrace::Backtrace::capture()
        );
        eprintln!("{}", line);
        log::error!("{}", line.trim_end());
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&panic_log_path)
        {
            use std::io::Write;
            let _ = f.write_all(line.as_bytes());
        }
        default_panic(info);
        // 触发 webview2 子进程清理：tauri 0 没有显式 API，最直接是进程自杀
        // 之前 spawn 的 webview2 helper 会随父进程句柄释放而清理
        std::process::exit(1);
    }));

    log::info!("SayDone starting, version={}", env!("CARGO_PKG_VERSION"));
    log::info!("Log file: {:?}", app_paths::log_file().unwrap_or_else(|_| std::path::PathBuf::from(".")));

    // Allow self-signed certificates and auto-grant microphone for backend connection (WebView2)
    // This must be set before any WebView2 instance is created
    if std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_err() {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--ignore-certificate-errors --auto-accept-camera-and-microphone-capture",
        );
    }

    let db_path = app_paths::db_file().expect("failed to resolve db file path");

    // 主线程先初始化 storage（含 schema migrations）。两个并发线程若独立打开同一个 DB，
    // 会在 WAL 模式下竞争 schema_migrations INSERT，触发 UNIQUE constraint panic。
    let storage = Storage::new(db_path).expect("failed to initialize SQLite storage");

    // Clean up expired audio files on startup (async, non-blocking)
    // 复用主线程的 storage，避免重复打开导致并发写
    let storage_for_audio = storage.clone();
    std::thread::spawn(move || {
        cleanup_expired_audio(&storage_for_audio);
    });

    // Clean up expired log files on startup (async, non-blocking)
    let storage_for_logs = storage.clone();
    std::thread::spawn(move || {
        cleanup_expired_logs(&storage_for_logs);
    });

    // One-time migration from Electron app's SQLite database
    if let Err(e) = storage.migrate_from_electron() {
        eprintln!("Warning: Electron data migration failed: {}", e);
    }

    // Read PTT setting before moving storage into managed state
    let ptt_setting_val = storage.get("shortcutPTT", None);
    let ptt_str = ptt_setting_val.as_str().unwrap_or("ShiftRight").to_string();
    let hf_setting_val = storage.get("shortcutHandsFree", None);
    let hf_str = hf_setting_val.as_str().unwrap_or("AltRight").to_string();
    let ai_chat_setting_val = storage.get("shortcutAIChat", None);
    let ai_chat_str = ai_chat_setting_val.as_str().unwrap_or("ControlRight").to_string();
    eprintln!("[main] PTT setting from DB: raw={:?} parsed={:?}", ptt_setting_val, ptt_str);
    eprintln!("[main] HF setting from DB: raw={:?} parsed={:?}", hf_setting_val, hf_str);
    eprintln!("[main] AI Chat setting from DB: raw={:?} parsed={:?}", ai_chat_setting_val, ai_chat_str);

    let window_state = WindowState::new();
    let keyboard_hook = KeyboardHookManager::new();
    let context_detector = ContextDetector::new();

    tauri::Builder::default()
        .manage(storage)
        .manage(window_state)
        .manage(keyboard_hook)
        .manage(context_detector)
        .setup(move |app| {
            let hook: tauri::State<KeyboardHookManager> = app.state();
            hook.start(app.handle(), &ptt_str, &hf_str, &ai_chat_str);

            let storage: tauri::State<Storage> = app.state();
            let mouse_ptt_val = storage.get("mouseMiddleButtonPTT", None);
            let mouse_ptt_enabled = mouse_ptt_val.as_bool().unwrap_or(false);

            let scroll_up_val = storage.get("scrollUpToSend", None);
            let scroll_up_enabled = scroll_up_val.as_bool().unwrap_or(false);
            let scroll_down_val = storage.get("scrollDownToDelete", None);
            let scroll_down_enabled = scroll_down_val.as_bool().unwrap_or(false);

            let scroll_up_thr = storage.get("scrollUpSensitivity", None)
                .as_number()
                .and_then(|n| n.as_u64())
                .map(|v| v as u32)
                .unwrap_or(1)
                .max(1);
            let scroll_down_thr = storage.get("scrollDownSensitivity", None)
                .as_number()
                .and_then(|n| n.as_u64())
                .map(|v| v as u32)
                .unwrap_or(1)
                .max(1);

            // Start mouse hook with all feature flags if any is enabled
            if mouse_ptt_enabled || scroll_up_enabled || scroll_down_enabled {
                hook.start_mouse_hook_with_flags(
                    app.handle(),
                    mouse_ptt_enabled,
                    scroll_up_enabled,
                    scroll_down_enabled,
                    scroll_up_thr,
                    scroll_down_thr,
                );
            }

            // 设置窗口图标（用 ICO 文件，包含多尺寸帧，Windows 自动选最合适的）
            // 并根据启动方式决定是否显示主窗口：
            // 开机自启会带 --minimized 参数 → 保持隐藏，静默停留在托盘
            // 用户手动打开则正常显示（窗口配置为 visible:false，需显式 show）
            let launched_minimized = std::env::args().any(|arg| arg == "--minimized");
            if let Some(main_window) = app.get_webview_window("main") {
                let ico_bytes = include_bytes!("../icons/icon.ico");
                log::info!("icon.ico bytes length: {}", ico_bytes.len());
                match tauri::image::Image::from_bytes(ico_bytes) {
                    Ok(icon) => {
                        log::info!("icon loaded successfully, size: {}x{}", icon.width(), icon.height());
                        let _ = main_window.set_icon(icon);
                    }
                    Err(e) => {
                        log::error!("failed to decode icon: {}", e);
                    }
                }
                if !launched_minimized {
                    let _ = main_window.show();
                    let _ = main_window.set_focus();
                } else {
                    log::info!("Launched with --minimized, staying hidden in tray");
                }
            }

            // 系统托盘图标
            {
                let show_item = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;

                let mouse_ptt_enabled = storage.get("mouseMiddleButtonPTT", None).as_bool().unwrap_or(false);
                let mouse_ptt_item = CheckMenuItem::with_id(app, "mouse_ptt", "鼠标中键说话", true, mouse_ptt_enabled, None::<&str>)?;

                let scroll_up_enabled = storage.get("scrollUpToSend", None).as_bool().unwrap_or(false);
                let scroll_up_item = CheckMenuItem::with_id(app, "scroll_up", "滚轮上滑发送", true, scroll_up_enabled, None::<&str>)?;

                let scroll_down_enabled = storage.get("scrollDownToDelete", None).as_bool().unwrap_or(false);
                let scroll_down_item = CheckMenuItem::with_id(app, "scroll_down", "滚轮下滑删除", true, scroll_down_enabled, None::<&str>)?;

                let quit_item = MenuItemBuilder::with_id("quit", "退出 SayDone").build(app)?;
                let tray_menu = MenuBuilder::new(app)
                    .item(&show_item)
                    .separator()
                    .item(&mouse_ptt_item)
                    .item(&scroll_up_item)
                    .item(&scroll_down_item)
                    .separator()
                    .item(&quit_item)
                    .build()?;

                let ico_bytes = include_bytes!("../icons/icon.ico");
                let icon = tauri::image::Image::from_bytes(ico_bytes)
                    .expect("failed to load tray icon");

                let _tray = TrayIconBuilder::new()
                    .icon(icon)
                    .tooltip("SayDone — 按住说话，松开输入")
                    .menu(&tray_menu)
                    .on_menu_event(|app, event| {
                        let storage = app.state::<Storage>();
                        match event.id().as_ref() {
                            "show" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.unminimize();
                                    let _ = w.set_focus();
                                }
                            }
                            "mouse_ptt" => {
                                let current = storage.get("mouseMiddleButtonPTT", None).as_bool().unwrap_or(false);
                                let new_state = !current;
                                let _ = storage.set("mouseMiddleButtonPTT", &serde_json::json!(new_state));
                                let _ = app.emit("mouse-ptt-changed", serde_json::json!({ "enabled": new_state }));
                            }
                            "scroll_up" => {
                                let current = storage.get("scrollUpToSend", None).as_bool().unwrap_or(false);
                                let new_state = !current;
                                let _ = storage.set("scrollUpToSend", &serde_json::json!(new_state));
                                let _ = app.emit("scroll-up-changed", serde_json::json!({ "enabled": new_state }));
                            }
                            "scroll_down" => {
                                let current = storage.get("scrollDownToDelete", None).as_bool().unwrap_or(false);
                                let new_state = !current;
                                let _ = storage.set("scrollDownToDelete", &serde_json::json!(new_state));
                                let _ = app.emit("scroll-down-changed", serde_json::json!({ "enabled": new_state }));
                            }
                            "quit" => {
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        // 左键单击托盘图标 → 显示主窗口
                        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                            if let Some(w) = tray.app_handle().get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            // Start WinEvent hook for foreground window monitoring
            let detector: tauri::State<ContextDetector> = app.state();
            detector.start_winevent_hook(app.handle());

            // Register hands-free global shortcut (only for combo keys; single keys are handled by keyboard hook)
            {
                let storage: tauri::State<Storage> = app.state();
                let hf_val = storage.get("shortcutHandsFree", None);
                let hf_key = hf_val.as_str().unwrap_or("AltRight");
                if !hf_key.is_empty() && hf_key.contains('+') {
                    use tauri_plugin_global_shortcut::GlobalShortcutExt;
                    if let Err(e) = app.global_shortcut().on_shortcut(
                        hf_key,
                        move |_app, _shortcut, _event| {
                            let _ = _app.emit("toggle-hands-free", serde_json::json!({
                                "source": "globalShortcut",
                            }));
                        },
                    ) {
                        log::warn!("Failed to register hands-free shortcut '{}': {}", hf_key, e);
                    } else {
                        log::info!("Registered hands-free shortcut: {}", hf_key);
                    }
                }
            }

            // 首次安装时自动启用开机自启（仅执行一次）
            {
                use tauri_plugin_autostart::ManagerExt;
                let storage: tauri::State<Storage> = app.state();
                let autostart = app.autolaunch();
                let already_set = storage.get("autoLaunchInitialized", None);
                if already_set.is_null() || already_set.as_str() == Some("") {
                    // 首次运行，注册开机自启并标记（新注册已带 --minimized 参数）
                    let _ = autostart.enable();
                    let flag = serde_json::json!("true");
                    let _ = storage.set("autoLaunchInitialized", &flag);
                    let _ = storage.set("autoLaunchArgsMigrated", &flag);
                    log::info!("Auto-launch enabled on first run");
                } else {
                    // 老用户迁移：旧自启项不带 --minimized 参数，重新注册一次以写入新参数
                    let migrated = storage.get("autoLaunchArgsMigrated", None);
                    if migrated.as_str() != Some("true") {
                        if autostart.is_enabled().unwrap_or(false) {
                            let _ = autostart.disable();
                            let _ = autostart.enable();
                            log::info!("Auto-launch re-registered with --minimized arg");
                        }
                        let _ = storage.set("autoLaunchArgsMigrated", &serde_json::json!("true"));
                    }
                }
            }

            // RAG 嵌入模型：DB 标记为 ready 或 error 时启动后台自动恢复。
            // 解决"重启后页面显示已加载但上传提示未初始化"的问题——前端 status 读 DB，
            // 后端 is_ready() 读进程内 EMBEDDER OnceLock；新进程必须把模型从内存重新加载，
            // is_ready() 才会返回 true。失败不阻塞启动。
            // 包含 error 是因为：上一次 init 可能因为网络抖动失败，重启后再试一次。
            {
                let storage: tauri::State<Storage> = app.state();
                let model_status = storage.get("rag.modelStatus", None);
                let status_str = model_status.as_str().unwrap_or("");
                let should_auto_init = status_str == "ready" || status_str == "error";
                if should_auto_init {
                    log::info!("RAG: DB modelStatus={:?}，启动后台自动恢复嵌入器", model_status);
                    let app_handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        match rag::embedder::init_embedder(app_handle.clone()).await {
                            Ok(()) => log::info!("RAG: 启动时自动恢复嵌入器成功"),
                            Err(e) => log::warn!("RAG: 启动时自动恢复嵌入器失败: {}", e),
                        }
                    });
                } else {
                    log::info!("RAG: DB modelStatus={:?}，跳过启动时自动恢复", model_status);
                }
            }

            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // updater plugin disabled until signing keys are generated
        // .plugin(tauri_plugin_updater::Builder::new().build())
        // .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .invoke_handler(tauri::generate_handler![
            // Store
            commands::storage::store_get,
            commands::storage::store_set,
            commands::storage::store_delete,
            // History
            commands::storage::history_list,
            commands::storage::history_count,
            commands::storage::history_add,
            commands::storage::history_update,
            commands::storage::history_delete,
            commands::storage::history_set_favorite,
            // Window
            commands::window::show_overlay,
            commands::window::hide_overlay,
            commands::window::update_overlay_state,
            commands::window::overlay_pong,
            // Paste / Context
            commands::paste::paste_text,
            commands::paste::get_probe_result,
            commands::paste::get_active_app_context,
            commands::paste::copy_text,
            commands::paste::is_hwnd_alive,
            // Selection (UIA TextPattern)
            commands::selection::capture_selection,
            // System
            commands::system::get_client_runtime_info,
            commands::system::get_auto_launch,
            commands::system::set_auto_launch,
            commands::system::get_update_status,
            commands::system::check_for_updates,
            commands::system::install_downloaded_update,
            commands::system::download_update,
            commands::system::append_debug_log,
            commands::system::restart_app,
            commands::system::save_audio_to_downloads,
            commands::system::reveal_file_in_folder,
            // Audio
            commands::audio::save_audio_file,
            commands::audio::save_pcm_as_wav,
            commands::audio::append_pcm_to_wav,
            commands::audio::finalize_wav_file,
            commands::audio::cleanup_incomplete_wav,
            commands::audio::read_audio_file,
            commands::audio::delete_audio_file,
            // Shortcuts
            commands::shortcuts::shortcuts_changed,
            commands::shortcuts::test_shortcut,
            commands::shortcuts::set_ptt_lab_config,
            commands::shortcuts::set_mouse_ptt_enabled,
            commands::shortcuts::set_mouse_scroll_actions,
            // Export
            commands::export::save_text_export,
            commands::export::save_export_bundle,
            commands::export::save_full_export,
            // Diagnostics
            commands::diagnostics::collect_settings,
            commands::diagnostics::get_diagnostics_preview,
            commands::diagnostics::create_diagnostics_zip,
            commands::diagnostics::read_diagnostics_zip,
            commands::diagnostics::copy_diagnostics_zip,
            commands::diagnostics::read_log_file,
            commands::diagnostics::open_log_folder,
            // Providers (cloud ASR / AI)
            providers::registry::cloud_polish,
            providers::registry::cloud_transcribe,
            providers::registry::ai_chat,
            providers::registry::summarize_meeting,
            providers::registry::ai_generate_hotwords,
            providers::registry::test_ai_connection,
            providers::registry::test_asr_connection,
            // Doubao realtime streaming ASR
            providers::asr_doubao_realtime::doubao_stream_open,
            providers::asr_doubao_realtime::doubao_stream_send,
            providers::asr_doubao_realtime::doubao_stream_finish,
            providers::asr_doubao_realtime::doubao_stream_close,
            // Qwen realtime streaming ASR
            providers::asr_qwen_realtime::qwen_stream_open,
            providers::asr_qwen_realtime::qwen_stream_send,
            providers::asr_qwen_realtime::qwen_stream_finish,
            providers::asr_qwen_realtime::qwen_stream_close,
            // RAG 知识库
            rag::cmd::rag_init_model,
            rag::cmd::rag_get_status,
            rag::cmd::rag_set_enabled,
            rag::cmd::rag_list_documents,
            rag::cmd::rag_add_text,
            rag::cmd::rag_add_file,
            rag::cmd::rag_delete_document,
            rag::cmd::rag_search,
            // Tavily 联网搜索
            tavily::cmd::tavily_get_config,
            tavily::cmd::tavily_set_config,
            tavily::cmd::tavily_test_search,
            // Models (local model management)
            models::registry::list_available_models,
            models::registry::list_downloaded_models,
            models::registry::download_model,
            models::registry::delete_model,
            models::registry::open_models_folder,
            models::registry::open_model_folder,
            models::local_asr::local_transcribe,
            models::local_asr::preload_local_model,
            models::test_audio::run_asr_benchmark,
            models::test_audio::get_test_audio_b64,
        ])
        .on_window_event(|window, event| {
            // 点击关闭按钮时隐藏到托盘，而不是退出
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
