use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use crate::keyboard::KeyboardHookManager;
use crate::storage::Storage;

#[tauri::command]
pub fn shortcuts_changed(
    app: AppHandle,
    storage: State<Storage>,
    hook: State<KeyboardHookManager>,
) {
    let ptt_setting = storage.get("shortcutPTT", None);
    let ptt_str = ptt_setting.as_str().unwrap_or("ShiftRight");
    let hf_val = storage.get("shortcutHandsFree", None);
    let hf_key = hf_val.as_str().unwrap_or("AltRight");
    let ai_chat_val = storage.get("shortcutAIChat", None);
    let ai_chat_key = ai_chat_val.as_str().unwrap_or("ControlRight");

    hook.reconfigure(&app, ptt_str, hf_key, ai_chat_key);

    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let _ = app.global_shortcut().unregister_all();

    if !hf_key.is_empty() && hf_key.contains('+') {
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
            log::info!("Re-registered hands-free shortcut: {}", hf_key);
        }
    }
}

#[tauri::command]
pub fn test_shortcut(_accelerator: String) -> Result<bool, String> {
    Ok(true)
}

#[tauri::command]
pub fn set_mouse_ptt_enabled(
    app: AppHandle,
    hook: State<KeyboardHookManager>,
    storage: State<Storage>,
    enabled: bool,
) {
    let storage_key = "mouseMiddleButtonPTT";
    let _ = storage.set(storage_key, &serde_json::json!(enabled));
    hook.set_mouse_ptt(&app, enabled);
}

#[tauri::command]
pub fn set_mouse_scroll_actions(
    app: AppHandle,
    hook: State<KeyboardHookManager>,
    storage: State<Storage>,
    up_send: bool,
    down_delete: bool,
    up_threshold: Option<u32>,
    down_threshold: Option<u32>,
) {
    let _ = storage.set("scrollUpToSend", &serde_json::json!(up_send));
    let _ = storage.set("scrollDownToDelete", &serde_json::json!(down_delete));
    hook.set_scroll_actions(&app, up_send, down_delete, up_threshold.unwrap_or(1), down_threshold.unwrap_or(1));
}

#[cfg(windows)]
mod ptt_lab_hook {
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    use std::sync::{Arc, Mutex};
    use tauri::{AppHandle, Emitter};

    pub static LAB_RUNNING: AtomicBool = AtomicBool::new(false);
    pub static LAB_THREAD_ID: AtomicU32 = AtomicU32::new(0);

    pub struct LabState {
        pub app: AppHandle,
        pub vk_code: u32,
        pub action_tx: std::sync::mpsc::SyncSender<(String, u32, i64)>,
    }

    pub static LAB_STATE: Mutex<Option<Arc<LabState>>> = Mutex::new(None);

    thread_local! {
        static KEY_DOWN_FLAG: std::cell::Cell<bool> = std::cell::Cell::new(false);
    }

    pub fn start_lab_hook(
        app: AppHandle,
        vk_code: u32,
    ) -> Result<(), String> {
        if LAB_RUNNING.load(Ordering::SeqCst) {
            stop_lab_hook();
            std::thread::sleep(std::time::Duration::from_millis(100));
        }

        let (tx, rx) = std::sync::mpsc::sync_channel::<(String, u32, i64)>(64);
        let lab_app = app.clone();
        std::thread::spawn(move || {
            while let Ok((phase, vk, ts)) = rx.recv() {
                let _ = lab_app.emit("ptt-lab-event", serde_json::json!({
                    "phase": phase,
                    "vk": vk,
                    "timestamp": ts,
                }));
            }
        });

        let state = Arc::new(LabState {
            app: app.clone(),
            vk_code,
            action_tx: tx,
        });

        {
            let mut guard = LAB_STATE.lock().unwrap();
            *guard = Some(state.clone());
        }

        LAB_RUNNING.store(true, Ordering::SeqCst);

        let state_for_hook = state.clone();
        std::thread::spawn(move || {
            lab_hook_thread(state_for_hook);
        });

        Ok(())
    }

    pub fn stop_lab_hook() {
        if LAB_RUNNING.load(Ordering::SeqCst) {
            let tid = LAB_THREAD_ID.load(Ordering::SeqCst);
            if tid != 0 {
                unsafe {
                    use windows::Win32::UI::WindowsAndMessaging::PostThreadMessageW;
                    use windows::Win32::Foundation::{WPARAM, LPARAM};
                    const WM_QUIT: u32 = 0x0012;
                    let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
                }
            }
            LAB_RUNNING.store(false, Ordering::SeqCst);
            LAB_THREAD_ID.store(0, Ordering::SeqCst);
            let mut guard = LAB_STATE.lock().unwrap();
            *guard = None;
            KEY_DOWN_FLAG.with(|f| f.set(false));
            log::info!("[ptt-lab] stopped lab hook");
        }
    }

    fn lab_hook_thread(state: Arc<LabState>) {
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowsHookExW, UnhookWindowsHookEx, GetMessageW,
            TranslateMessage, DispatchMessageW, CallNextHookEx,
            KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL,
            WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
        };
        use windows::Win32::Foundation::{WPARAM, LPARAM, LRESULT};
        use windows::Win32::System::Threading::GetCurrentThreadId;

        let vk_code = state.vk_code;
        let tx = state.action_tx.clone();

        KEY_DOWN_FLAG.with(|f| f.set(false));

        unsafe extern "system" fn lab_keyboard_proc(
            n_code: i32,
            w_param: WPARAM,
            l_param: LPARAM,
        ) -> LRESULT {
            if n_code >= 0 {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    process_lab_keyboard(n_code, w_param, l_param)
                }));

                match result {
                    Ok(true) => return LRESULT(1),
                    Ok(false) => {}
                    Err(_) => {}
                }
            }
            CallNextHookEx(None, n_code, w_param, l_param)
        }

        unsafe fn process_lab_keyboard(
            n_code: i32,
            w_param: WPARAM,
            l_param: LPARAM,
        ) -> bool {
            let kb = match (l_param.0 as *const KBDLLHOOKSTRUCT).as_ref() {
                Some(kb) => kb,
                None => return false,
            };

            let vk = kb.vkCode;
            let msg = w_param.0 as u32;

            let state_guard = LAB_STATE.lock().unwrap();
            let state = match state_guard.as_ref() {
                Some(s) => s,
                None => return false,
            };

            if vk != state.vk_code {
                return false;
            }

            let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
            let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;

            if is_down && !KEY_DOWN_FLAG.with(|v| v.get()) {
                KEY_DOWN_FLAG.with(|v| v.set(true));
                let ts = chrono::Utc::now().timestamp_millis();
                if state.action_tx.try_send(("down".to_string(), vk, ts)).is_err() {
                    KEY_DOWN_FLAG.with(|v| v.set(false));
                }
                return true;
            }

            if is_up && KEY_DOWN_FLAG.with(|v| v.get()) {
                KEY_DOWN_FLAG.with(|v| v.set(false));
                let ts = chrono::Utc::now().timestamp_millis();
                let _ = state.action_tx.try_send(("up".to_string(), vk, ts));
                return true;
            }

            if is_down || is_up {
                return true;
            }

            false
        }

        unsafe {
            let tid = GetCurrentThreadId();
            LAB_THREAD_ID.store(tid, Ordering::SeqCst);
            log::info!("[ptt-lab] hook thread started, tid={}, vk=0x{:X}", tid, vk_code);

            let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(lab_keyboard_proc), None, 0) {
                Ok(h) => h,
                Err(e) => {
                    log::error!("[ptt-lab] SetWindowsHookExW failed: {}", e);
                    LAB_RUNNING.store(false, Ordering::SeqCst);
                    LAB_THREAD_ID.store(0, Ordering::SeqCst);
                    return;
                }
            };

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            let _ = UnhookWindowsHookEx(hook);
            LAB_RUNNING.store(false, Ordering::SeqCst);
            LAB_THREAD_ID.store(0, Ordering::SeqCst);
            KEY_DOWN_FLAG.with(|f| f.set(false));
            log::info!("[ptt-lab] hook thread exited");
        }
    }
}

#[tauri::command]
pub fn set_ptt_lab_config(data: Value, _app: AppHandle) -> Result<(), String> {
    let enabled = data.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
    log::info!("[ptt-lab] set_ptt_lab_config called, enabled={}", enabled);

    #[cfg(windows)]
    {
        if !enabled {
            ptt_lab_hook::stop_lab_hook();
            return Ok(());
        }

        let vk_code: u32 = data.get("vkCode")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32)
            .unwrap_or(0xA3);

        ptt_lab_hook::start_lab_hook(_app, vk_code)?;
    }

    #[cfg(not(windows))]
    {
        let _ = (data, _app);
    }

    Ok(())
}
