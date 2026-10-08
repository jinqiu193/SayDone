//! Global keyboard and mouse hook for PTT (Push-to-Talk) functionality.
//!
//! Uses Win32 SetWindowsHookExW(WH_KEYBOARD_LL / WH_MOUSE_LL) to capture events globally.
//! Runs the message loop on a dedicated thread.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, PostThreadMessageW, SetWindowsHookExW, UnhookWindowsHookEx,
    GetMessageW, TranslateMessage, DispatchMessageW,
    KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_KEYUP,
    WM_SYSKEYDOWN, WM_SYSKEYUP, WM_QUIT,
};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{MSLLHOOKSTRUCT, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MOUSEWHEEL};

/// Virtual key code mapping for PTT settings (keyboard keys only)
/// VK codes: https://learn.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes
fn vk_codes_for_setting(setting: &str) -> Vec<u32> {
    match setting {
        "" => vec![],
        "AltLeft" => vec![0xA4],
        "AltRight" => vec![0xA5],
        "ControlLeft" => vec![0xA2],
        "ControlRight" => vec![0xA3],
        "ShiftLeft" => vec![0xA0],
        "ShiftRight" => vec![0xA1],
        "CapsLock" => vec![0x14],
        "Space" => vec![0x20],
        "F1" => vec![0x70],  "F2" => vec![0x71],  "F3" => vec![0x72],
        "F4" => vec![0x73],  "F5" => vec![0x74],  "F6" => vec![0x75],
        "F7" => vec![0x76],  "F8" => vec![0x77],  "F9" => vec![0x78],
        "F10" => vec![0x79], "F11" => vec![0x7A], "F12" => vec![0x7B],
        _ => vec![0xA5], // default: AltRight
    }
}

/// Check if a shortcut setting is a single keyboard key (handled by hook) vs combo (handled by global_shortcut)
/// Note: MouseMiddleButton is handled by a separate mouse hook, not the keyboard hook
pub fn is_single_key_setting(setting: &str) -> bool {
    matches!(setting,
        "AltLeft" | "AltRight" | "ControlLeft" | "ControlRight" |
        "ShiftLeft" | "ShiftRight" | "CapsLock" | "Space" |
        "F1" | "F2" | "F3" | "F4" | "F5" | "F6" |
        "F7" | "F8" | "F9" | "F10" | "F11" | "F12"
    )
}

#[allow(dead_code)]
fn modifier_kind(setting: &str) -> Option<&'static str> {
    match setting {
        "AltLeft" | "AltRight" => Some("alt"),
        "ControlLeft" | "ControlRight" => Some("ctrl"),
        "ShiftLeft" | "ShiftRight" => Some("shift"),
        _ => None,
    }
}

#[derive(Clone, Serialize)]
struct PTTEvent {
    source: String,
    reason: String,
    #[serde(rename = "keycode")]
    vk: u32,
    #[serde(rename = "pttSetting")]
    ptt_setting: String,
    timestamp: i64,
    #[serde(rename = "altKey")]
    alt_key: bool,
    #[serde(rename = "ctrlKey")]
    ctrl_key: bool,
    #[serde(rename = "shiftKey")]
    shift_key: bool,
}

/// Shared state between the hook callback and the main thread
struct HookSharedState {
    ptt_vk_codes: Vec<u32>,
    ptt_setting: String,
    ptt_key_down: AtomicBool,
    ptt_generation: AtomicU64,
    hands_free_active: AtomicBool,
    hf_vk_codes: Vec<u32>,
    hf_setting: String,
    ai_chat_vk_codes: Vec<u32>,
    ai_chat_setting: String,
    ai_chat_key_down: AtomicBool,
    ai_chat_generation: AtomicU64,
    app_handle: AppHandle,
    #[allow(dead_code)]
    mouse_middle_active: AtomicBool,
}

/// Message sent from the hook callback (non-blocking) to the dispatcher thread.
#[cfg(windows)]
#[allow(dead_code)]
enum HookAction {
    PttDown { vk: u32, gen: u64 },
    PttUp { vk: u32 },
    HfToggle { vk: u32 },
    AiChatPttDown { vk: u32, gen: u64 },
    AiChatPttUp { vk: u32 },
    Diag { vk: u32, msg_name: &'static str, flags: u32 },
    MousePttDown { x: i32, y: i32 },
    MousePttUp { x: i32, y: i32 },
    MouseScrollUp,
    MouseScrollDown,
}

// Thread-local storage for the hook callback
thread_local! {
    static HOOK_STATE: std::cell::RefCell<Option<Arc<HookSharedState>>> = std::cell::RefCell::new(None);
    /// Non-blocking channel sender for offloading work from the hook callback.
    static HOOK_ACTION_TX: std::cell::RefCell<Option<std::sync::mpsc::SyncSender<HookAction>>> = std::cell::RefCell::new(None);
    /// Thread-local storage for the mouse hook callback (separate type from keyboard hook)
    static MOUSE_HOOK_STATE: std::cell::RefCell<Option<Arc<MouseHookState>>> = std::cell::RefCell::new(None);
    /// Scroll delta accumulator for up scroll (resets after action fires)
    static SCROLL_UP_ACCUM: std::cell::Cell<i32> = std::cell::Cell::new(0);
    /// Scroll delta accumulator for down scroll (resets after action fires)
    static SCROLL_DOWN_ACCUM: std::cell::Cell<i32> = std::cell::Cell::new(0);
}

pub struct KeyboardHookManager {
    hook_thread_id: Mutex<Option<u32>>,
    mouse_hook_thread_id: Mutex<Option<u32>>,
    shared_state: Mutex<Option<Arc<HookSharedState>>>,
    mouse_shared_state: Mutex<Option<Arc<MouseHookState>>>,
    running: AtomicBool,
}

struct MouseHookState {
    key_down: AtomicBool,
    generation: AtomicU64,
    app_handle: AppHandle,
    enabled: AtomicBool,
    /// 滚轮上滚 = 发送（Enter）
    scroll_up_send: AtomicBool,
    /// 滚轮下滚 = 逐字删除（Backspace）
    scroll_down_delete: AtomicBool,
    /// 上滚阈值（多少格触发发送）
    scroll_up_threshold: AtomicU32,
    /// 下滚阈值（多少格触发删除）
    scroll_down_threshold: AtomicU32,
}

impl KeyboardHookManager {
    pub fn new() -> Self {
        Self {
            hook_thread_id: Mutex::new(None),
            mouse_hook_thread_id: Mutex::new(None),
            shared_state: Mutex::new(None),
            mouse_shared_state: Mutex::new(None),
            running: AtomicBool::new(false),
        }
    }

    /// Start the keyboard hook with the given PTT, hands-free, and AI Chat settings
    pub fn start(&self, app: &AppHandle, ptt_setting: &str, hf_setting: &str, ai_chat_setting: &str) {
        if self.running.load(Ordering::SeqCst) {
            self.stop();
        }

        let hf_vk_codes = if is_single_key_setting(hf_setting) {
            vk_codes_for_setting(hf_setting)
        } else {
            vec![]
        };

        let ai_chat_vk_codes = if is_single_key_setting(ai_chat_setting) {
            vk_codes_for_setting(ai_chat_setting)
        } else {
            vec![]
        };

        let state = Arc::new(HookSharedState {
            ptt_vk_codes: vk_codes_for_setting(ptt_setting),
            ptt_setting: ptt_setting.to_string(),
            ptt_key_down: AtomicBool::new(false),
            ptt_generation: AtomicU64::new(0),
            hands_free_active: AtomicBool::new(false),
            hf_vk_codes,
            hf_setting: hf_setting.to_string(),
            ai_chat_vk_codes,
            ai_chat_setting: ai_chat_setting.to_string(),
            ai_chat_key_down: AtomicBool::new(false),
            ai_chat_generation: AtomicU64::new(0),
            app_handle: app.clone(),
            mouse_middle_active: AtomicBool::new(false),
        });

        *self.shared_state.lock().unwrap() = Some(state.clone());
        self.running.store(true, Ordering::SeqCst);

        let state_for_thread = state.clone();
        let (tx, rx) = std::sync::mpsc::channel::<u32>();

        thread::spawn(move || {
            Self::hook_thread(state_for_thread, tx);
        });

        if let Ok(thread_id) = rx.recv_timeout(std::time::Duration::from_secs(5)) {
            *self.hook_thread_id.lock().unwrap() = Some(thread_id);
            log::info!("Keyboard hook started, thread_id={}", thread_id);
        } else {
            log::error!("Keyboard hook thread failed to start");
            self.running.store(false, Ordering::SeqCst);
        }
    }

    /// Start the mouse hook with all three feature flags.
    /// ptt_enabled: middle button PTT
    /// scroll_up_send: wheel up → Enter
    /// scroll_down_delete: wheel down → Backspace
    /// up_threshold: how many wheel notches to accumulate before triggering send
    /// down_threshold: how many wheel notches to accumulate before triggering delete
    pub fn start_mouse_hook_with_flags(
        &self,
        app: &AppHandle,
        ptt_enabled: bool,
        scroll_up: bool,
        scroll_down: bool,
        up_threshold: u32,
        down_threshold: u32,
    ) {
        self.stop_mouse_hook();

        let state = Arc::new(MouseHookState {
            key_down: AtomicBool::new(false),
            generation: AtomicU64::new(0),
            app_handle: app.clone(),
            enabled: AtomicBool::new(ptt_enabled),
            scroll_up_send: AtomicBool::new(scroll_up),
            scroll_down_delete: AtomicBool::new(scroll_down),
            scroll_up_threshold: AtomicU32::new(up_threshold.max(1)),
            scroll_down_threshold: AtomicU32::new(down_threshold.max(1)),
        });

        *self.mouse_shared_state.lock().unwrap() = Some(state.clone());

        let state_for_hook = state.clone();
        let (tx, rx) = std::sync::mpsc::channel::<u32>();

        thread::spawn(move || {
            Self::mouse_hook_thread(state_for_hook, tx);
        });

        if let Ok(thread_id) = rx.recv_timeout(std::time::Duration::from_secs(5)) {
            *self.mouse_hook_thread_id.lock().unwrap() = Some(thread_id);
            log::info!(
                "Mouse hook started, thread_id={}, ptt={}, scrollUp={}, scrollDown={}",
                thread_id, ptt_enabled, scroll_up, scroll_down
            );
        } else {
            log::error!("Mouse hook thread failed to start");
        }
    }

    /// Stop the mouse hook
    pub fn stop_mouse_hook(&self) {
        if let Some(thread_id) = self.mouse_hook_thread_id.lock().unwrap().take() {
            #[cfg(windows)]
            unsafe {
                use windows::Win32::UI::WindowsAndMessaging::{PostThreadMessageW, WM_QUIT};
                use windows::Win32::Foundation::{WPARAM, LPARAM};
                let _ = PostThreadMessageW(thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }
        *self.mouse_shared_state.lock().unwrap() = None;
    }

    /// Set scroll action flags. Starts/stops the mouse hook as needed.
    pub fn set_scroll_actions(&self, app: &AppHandle, up_send: bool, down_delete: bool, up_threshold: u32, down_threshold: u32) {
        let up_threshold = up_threshold.max(1);
        let down_threshold = down_threshold.max(1);

        // 一次快照（避免连续 4 次 lock 引起性能/潜在锁竞争问题）
        let (ptt_on, hook_running) = {
            let guard = self.mouse_shared_state.lock().unwrap();
            match guard.as_ref() {
                Some(s) => (s.enabled.load(Ordering::SeqCst), true),
                None => (false, false),
            }
        }; // guard dropped

        // 锁内仅做原子 store；start_mouse_hook_with_flags 内部又会 mouse_shared_state.lock()，
        // 因此 start / stop 一律在锁外调用，避免 std::sync::Mutex 非可重入死锁。
        if hook_running {
            if let Some(state) = self.mouse_shared_state.lock().unwrap().as_ref() {
                state.scroll_up_send.store(up_send, Ordering::SeqCst);
                state.scroll_down_delete.store(down_delete, Ordering::SeqCst);
                state.scroll_up_threshold.store(up_threshold, Ordering::SeqCst);
                state.scroll_down_threshold.store(down_threshold, Ordering::SeqCst);
            }
        } else if up_send || down_delete {
            self.start_mouse_hook_with_flags(app, ptt_on, up_send, down_delete, up_threshold, down_threshold);
        }

        if !ptt_on && !up_send && !down_delete {
            self.stop_mouse_hook();
        }
    }

    /// Set mouse PTT enabled. Starts/stops the mouse hook as needed.
    pub fn set_mouse_ptt(&self, app: &AppHandle, enabled: bool) {
        // 一次快照（避免连续 5 次 lock 引起性能/潜在锁竞争问题）
        let (scroll_up, scroll_down, up_threshold, down_threshold, hook_running) = {
            let guard = self.mouse_shared_state.lock().unwrap();
            match guard.as_ref() {
                Some(s) => (
                    s.scroll_up_send.load(Ordering::SeqCst),
                    s.scroll_down_delete.load(Ordering::SeqCst),
                    s.scroll_up_threshold.load(Ordering::SeqCst),
                    s.scroll_down_threshold.load(Ordering::SeqCst),
                    true,
                ),
                None => (false, false, 1, 1, false),
            }
        }; // guard dropped here

        // 锁内仅做原子 store；start_mouse_hook_with_flags / stop_mouse_hook 内部又会
        // mouse_shared_state.lock()，因此 start / stop 一律在锁外调用，
        // 避免 std::sync::Mutex 非可重入死锁。
        let need_stop = if hook_running {
            if let Some(state) = self.mouse_shared_state.lock().unwrap().as_ref() {
                state.enabled.store(enabled, Ordering::SeqCst);
            }
            !enabled && !scroll_up && !scroll_down
        } else if enabled {
            self.start_mouse_hook_with_flags(
                app,
                true,
                scroll_up,
                scroll_down,
                up_threshold,
                down_threshold,
            );
            false
        } else {
            false
        };

        if need_stop {
            self.stop_mouse_hook();
        }
    }

    /// Stop the keyboard hook
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);

        self.stop_mouse_hook();

        // 清理可能卡住的修饰键状态
        #[cfg(windows)]
        if let Some(state) = self.shared_state.lock().unwrap().as_ref() {
            if state.ptt_key_down.load(Ordering::SeqCst) {
                state.ptt_key_down.store(false, Ordering::SeqCst);
                // 发送合成的 keyup 事件，让 Windows 释放修饰键
                for &vk in &state.ptt_vk_codes {
                    unsafe {
                        use windows::Win32::UI::Input::KeyboardAndMouse::*;
                        let mut input = INPUT {
                            r#type: INPUT_KEYBOARD,
                            ..std::mem::zeroed()
                        };
                        input.Anonymous.ki = KEYBDINPUT {
                            wVk: VIRTUAL_KEY(vk as u16),
                            dwFlags: KEYEVENTF_KEYUP,
                            ..std::mem::zeroed()
                        };
                        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
                    }
                }
                log::info!("[ptt] sent synthetic keyup on stop to clear modifier state");
            }
            if state.ai_chat_key_down.load(Ordering::SeqCst) {
                state.ai_chat_key_down.store(false, Ordering::SeqCst);
                for &vk in &state.ai_chat_vk_codes {
                    unsafe {
                        use windows::Win32::UI::Input::KeyboardAndMouse::*;
                        let mut input = INPUT {
                            r#type: INPUT_KEYBOARD,
                            ..std::mem::zeroed()
                        };
                        input.Anonymous.ki = KEYBDINPUT {
                            wVk: VIRTUAL_KEY(vk as u16),
                            dwFlags: KEYEVENTF_KEYUP,
                            ..std::mem::zeroed()
                        };
                        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
                    }
                }
                log::info!("[ai-chat] sent synthetic keyup on stop to clear modifier state");
            }
        }

        if let Some(thread_id) = self.hook_thread_id.lock().unwrap().take() {
            #[cfg(windows)]
            unsafe {
                let _ = PostThreadMessageW(thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }

        if let Some(thread_id) = self.mouse_hook_thread_id.lock().unwrap().take() {
            #[cfg(windows)]
            unsafe {
                let _ = PostThreadMessageW(thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }

        *self.shared_state.lock().unwrap() = None;
    }

    /// Reconfigure with new PTT, hands-free, and AI Chat settings
    pub fn reconfigure(&self, app: &AppHandle, ptt_setting: &str, hf_setting: &str, ai_chat_setting: &str) {
        self.stop();
        // Small delay to let the old hook thread exit
        thread::sleep(std::time::Duration::from_millis(100));
        self.start(app, ptt_setting, hf_setting, ai_chat_setting);
    }

    /// Set hands-free mode active (suppresses PTT up events temporarily)
    #[allow(dead_code)]
    pub fn set_hands_free(&self, active: bool) {
        if let Some(state) = self.shared_state.lock().unwrap().as_ref() {
            state.hands_free_active.store(active, Ordering::SeqCst);
            if active {
                state.ptt_key_down.store(false, Ordering::SeqCst);
            }
        }
    }

    #[cfg(windows)]
    fn hook_thread(state: Arc<HookSharedState>, tx: std::sync::mpsc::Sender<u32>) {
        use windows::Win32::System::Threading::GetCurrentThreadId;

        log::info!(
            "keyboard hook thread starting, ptt_setting={} vk_codes={:?}",
            state.ptt_setting, state.ptt_vk_codes
        );

        // Create a bounded channel for non-blocking sends from the hook callback.
        // Buffer of 64 is plenty — we only send on PTT key events.
        let (action_tx, action_rx) = std::sync::mpsc::sync_channel::<HookAction>(64);

        // Spawn dispatcher thread — handles logging and emit (potentially blocking ops)
        let dispatch_state = state.clone();
        thread::spawn(move || {
            while let Ok(action) = action_rx.recv() {
                match action {
                    HookAction::Diag { vk, msg_name, flags } => {
                        crate::commands::system::write_log_line(
                            &format!("[RUST] [hook-diag] vk={} msg={} flags=0x{:X}", vk, msg_name, flags)
                        );
                    }
                    HookAction::PttDown { vk, gen } => {
                        let setting = &dispatch_state.ptt_setting;
                        crate::commands::system::write_log_line(
                            &format!("[RUST] [ptt] keydown vk={} setting={} gen={}", vk, setting, gen)
                        );
                        let event = PTTEvent {
                            source: "rust_hook".to_string(),
                            reason: "keydown".to_string(),
                            vk,
                            ptt_setting: setting.clone(),
                            timestamp: chrono::Utc::now().timestamp_millis(),
                            alt_key: setting == "AltLeft" || setting == "AltRight",
                            ctrl_key: setting == "ControlLeft" || setting == "ControlRight",
                            shift_key: setting == "ShiftLeft" || setting == "ShiftRight",
                        };
                        let _ = dispatch_state.app_handle.emit("ptt-down", &event);

                        // Arm hard release timer (5min)
                        let state_clone = dispatch_state.clone();
                        thread::spawn(move || {
                            // 4-minute warning
                            thread::sleep(std::time::Duration::from_secs(240));
                            if state_clone.ptt_generation.load(Ordering::SeqCst) == gen
                                && state_clone.ptt_key_down.load(Ordering::SeqCst)
                            {
                                crate::commands::system::write_log_line(
                                    &format!("[RUST] [ptt] 4min timeout warning gen={}", gen)
                                );
                                let warn_event = PTTEvent {
                                    source: "rust_hook".to_string(),
                                    reason: "timeout_warning".to_string(),
                                    vk,
                                    ptt_setting: state_clone.ptt_setting.clone(),
                                    timestamp: chrono::Utc::now().timestamp_millis(),
                                    alt_key: false, ctrl_key: false, shift_key: false,
                                };
                                let _ = state_clone.app_handle.emit("ptt-timeout-warning", &warn_event);
                            }
                            // Remaining 60s until hard cutoff
                            thread::sleep(std::time::Duration::from_secs(60));
                            if state_clone.ptt_generation.load(Ordering::SeqCst) == gen
                                && state_clone.ptt_key_down.load(Ordering::SeqCst)
                            {
                                state_clone.ptt_key_down.store(false, Ordering::SeqCst);
                                crate::commands::system::write_log_line(
                                    &format!("[RUST] [ptt] hard_timeout_release gen={}", gen)
                                );
                                let timeout_event = PTTEvent {
                                    source: "rust_hook".to_string(),
                                    reason: "hard_timeout_release".to_string(),
                                    vk,
                                    ptt_setting: state_clone.ptt_setting.clone(),
                                    timestamp: chrono::Utc::now().timestamp_millis(),
                                    alt_key: false, ctrl_key: false, shift_key: false,
                                };
                                let _ = state_clone.app_handle.emit("ptt-up", &timeout_event);
                            }
                        });
                    }
                    HookAction::PttUp { vk } => {
                        let setting = &dispatch_state.ptt_setting;
                        crate::commands::system::write_log_line(
                            &format!("[RUST] [ptt] keyup vk={} setting={}", vk, setting)
                        );
                        let event = PTTEvent {
                            source: "rust_hook".to_string(),
                            reason: "keyup".to_string(),
                            vk,
                            ptt_setting: setting.clone(),
                            timestamp: chrono::Utc::now().timestamp_millis(),
                            alt_key: setting == "AltLeft" || setting == "AltRight",
                            ctrl_key: setting == "ControlLeft" || setting == "ControlRight",
                            shift_key: setting == "ShiftLeft" || setting == "ShiftRight",
                        };
                        let _ = dispatch_state.app_handle.emit("ptt-up", &event);
                    }
                    HookAction::HfToggle { vk } => {
                        crate::commands::system::write_log_line(
                            &format!("[RUST] [hf] toggle vk={} setting={}", vk, dispatch_state.hf_setting)
                        );
                        let _ = dispatch_state.app_handle.emit("toggle-hands-free", serde_json::json!({
                            "source": "rust_hook",
                            "vk": vk,
                        }));
                    }
                    HookAction::AiChatPttDown { vk, gen } => {
                        let setting = &dispatch_state.ai_chat_setting;
                        crate::commands::system::write_log_line(
                            &format!("[RUST] [ai-chat] keydown vk={} setting={} gen={}", vk, setting, gen)
                        );
                        let event = PTTEvent {
                            source: "rust_hook".to_string(),
                            reason: "keydown".to_string(),
                            vk,
                            ptt_setting: setting.clone(),
                            timestamp: chrono::Utc::now().timestamp_millis(),
                            alt_key: setting == "AltLeft" || setting == "AltRight",
                            ctrl_key: setting == "ControlLeft" || setting == "ControlRight",
                            shift_key: setting == "ShiftLeft" || setting == "ShiftRight",
                        };
                        let _ = dispatch_state.app_handle.emit("ai-chat-ptt-down", &event);

                        let state_clone = dispatch_state.clone();
                        thread::spawn(move || {
                            thread::sleep(std::time::Duration::from_secs(240));
                            if state_clone.ai_chat_generation.load(Ordering::SeqCst) == gen
                                && state_clone.ai_chat_key_down.load(Ordering::SeqCst)
                            {
                                let warn_event = PTTEvent {
                                    source: "rust_hook".to_string(),
                                    reason: "timeout_warning".to_string(),
                                    vk,
                                    ptt_setting: state_clone.ai_chat_setting.clone(),
                                    timestamp: chrono::Utc::now().timestamp_millis(),
                                    alt_key: false, ctrl_key: false, shift_key: false,
                                };
                                let _ = state_clone.app_handle.emit("ai-chat-ptt-timeout-warning", &warn_event);
                            }
                            thread::sleep(std::time::Duration::from_secs(60));
                            if state_clone.ai_chat_generation.load(Ordering::SeqCst) == gen
                                && state_clone.ai_chat_key_down.load(Ordering::SeqCst)
                            {
                                state_clone.ai_chat_key_down.store(false, Ordering::SeqCst);
                                let timeout_event = PTTEvent {
                                    source: "rust_hook".to_string(),
                                    reason: "hard_timeout_release".to_string(),
                                    vk,
                                    ptt_setting: state_clone.ai_chat_setting.clone(),
                                    timestamp: chrono::Utc::now().timestamp_millis(),
                                    alt_key: false, ctrl_key: false, shift_key: false,
                                };
                                let _ = state_clone.app_handle.emit("ai-chat-ptt-up", &timeout_event);
                            }
                        });
                    }
                    HookAction::AiChatPttUp { vk } => {
                        let setting = &dispatch_state.ai_chat_setting;
                        crate::commands::system::write_log_line(
                            &format!("[RUST] [ai-chat] keyup vk={} setting={}", vk, setting)
                        );
                        let event = PTTEvent {
                            source: "rust_hook".to_string(),
                            reason: "keyup".to_string(),
                            vk,
                            ptt_setting: setting.clone(),
                            timestamp: chrono::Utc::now().timestamp_millis(),
                            alt_key: setting == "AltLeft" || setting == "AltRight",
                            ctrl_key: setting == "ControlLeft" || setting == "ControlRight",
                            shift_key: setting == "ShiftLeft" || setting == "ShiftRight",
                        };
                        let _ = dispatch_state.app_handle.emit("ai-chat-ptt-up", &event);
                    }
                    HookAction::MousePttDown { .. } | HookAction::MousePttUp { .. } => {
                        // Mouse events are handled by the mouse hook dispatcher thread
                    }
                    HookAction::MouseScrollUp | HookAction::MouseScrollDown => {
                        // Scroll actions are handled directly in low_level_mouse_proc
                        // via send_key(), not through the dispatcher.
                    }
                }
            }
            log::info!("[ptt] dispatcher thread exited");
        });

        // Set thread-local state for the callback
        HOOK_STATE.with(|s| {
            *s.borrow_mut() = Some(state.clone());
        });
        HOOK_ACTION_TX.with(|s| {
            *s.borrow_mut() = Some(action_tx);
        });

        unsafe {
            let install_hook = || -> Option<windows::Win32::UI::WindowsAndMessaging::HHOOK> {
                match SetWindowsHookExW(
                    WH_KEYBOARD_LL,
                    Some(low_level_keyboard_proc),
                    None,
                    0,
                ) {
                    Ok(h) => {
                        log::info!("SetWindowsHookExW succeeded: {:?}", h.0);
                        Some(h)
                    }
                    Err(e) => {
                        log::error!("SetWindowsHookExW failed: {}", e);
                        None
                    }
                }
            };

            let hook = match install_hook() {
                Some(h) => h,
                None => return,
            };

            let thread_id = GetCurrentThreadId();
            let _ = tx.send(thread_id);
            log::info!("keyboard hook message loop starting on thread {}", thread_id);

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            log::info!("keyboard hook message loop exited");
            let _ = UnhookWindowsHookEx(hook);
        }

        HOOK_STATE.with(|s| {
            *s.borrow_mut() = None;
        });
        HOOK_ACTION_TX.with(|s| {
            *s.borrow_mut() = None;
        });
    }

    #[cfg(not(windows))]
    fn hook_thread(_state: Arc<HookSharedState>, tx: std::sync::mpsc::Sender<u32>) {
        let _ = tx.send(0);
    }

    #[cfg(windows)]
    fn mouse_hook_thread(state: Arc<MouseHookState>, tx: std::sync::mpsc::Sender<u32>) {
        use windows::Win32::System::Threading::GetCurrentThreadId;

        log::info!("mouse hook thread starting, MouseMiddleButton PTT");

        MOUSE_HOOK_STATE.with(|s| {
            *s.borrow_mut() = Some(state.clone());
        });
        SCROLL_UP_ACCUM.with(|a| a.set(0));
        SCROLL_DOWN_ACCUM.with(|a| a.set(0));

        unsafe {
            let hook = match SetWindowsHookExW(
                WH_MOUSE_LL,
                Some(low_level_mouse_proc),
                None,
                0,
            ) {
                Ok(h) => {
                    log::info!("SetWindowsHookExW (mouse) succeeded: {:?}", h.0);
                    h
                }
                Err(e) => {
                    log::error!("SetWindowsHookExW (mouse) failed: {}", e);
                    return;
                }
            };

            let thread_id = GetCurrentThreadId();
            let _ = tx.send(thread_id);
            log::info!("mouse hook message loop starting on thread {}", thread_id);

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            log::info!("mouse hook message loop exited");
            let _ = UnhookWindowsHookEx(hook);
        }

        MOUSE_HOOK_STATE.with(|s| {
            *s.borrow_mut() = None;
        });
    }

    #[cfg(not(windows))]
    fn mouse_hook_thread(_state: Arc<MouseHookState>, tx: std::sync::mpsc::Sender<u32>) {
        let _ = tx.send(0);
    }
}

#[cfg(windows)]
unsafe extern "system" fn low_level_keyboard_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    // ── CRITICAL: This callback MUST return within ~200ms or Windows
    // will silently remove the hook. NO blocking operations allowed.
    // All logging and emit are offloaded via try_send to a dispatcher thread.
    //
    // CRITICAL: Wrap everything in catch_unwind to prevent any panic from crashing the process.
    // The keyboard hook runs in a shared DLL context; a panic here brings down the entire app.

    if n_code >= 0 {
        // Use catch_unwind to prevent any panic from crashing the process
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            process_keyboard_event(n_code, w_param, l_param)
        }));

        match result {
            Ok(consumed) => {
                if consumed {
                    return LRESULT(1);
                }
            }
            Err(_panic_info) => {
                // A panic occurred in the hook callback. Log it and continue.
                // This is better than crashing the entire application.
                // Don't log here - logging may cause issues in the hook context.
            }
        }
    }

    CallNextHookEx(None, n_code, w_param, l_param)
}

#[cfg(windows)]
unsafe fn process_keyboard_event(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> bool {
    // This function should NEVER panic. If it does, the outer catch_unwind will catch it.

    // Early return if TLS is not initialized yet (hook installed but not started)
    let state_opt = HOOK_STATE.with(|s| s.borrow().clone());
    let state = match state_opt {
        Some(s) => s,
        None => return false, // State not initialized yet, pass through
    };

    let kb = match (l_param.0 as *const KBDLLHOOKSTRUCT).as_ref() {
        Some(kb) => kb,
        None => return false, // Invalid pointer, pass through
    };

    let vk = kb.vkCode;
    let msg = w_param.0 as u32;

    let mut consumed = false;

    let is_ptt_key = state.ptt_vk_codes.contains(&vk);
    let is_hf_key = !state.hf_vk_codes.is_empty()
        && state.hf_vk_codes.contains(&vk)
        && !is_ptt_key;

    if is_ptt_key {
        let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
        let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;

        if is_down {
            consumed = true;
        }

        if is_down && !state.ptt_key_down.load(Ordering::SeqCst)
            && !state.hands_free_active.load(Ordering::SeqCst)
        {
            state.ptt_key_down.store(true, Ordering::SeqCst);
            let gen = state.ptt_generation.fetch_add(1, Ordering::SeqCst) + 1;

            HOOK_ACTION_TX.with(|tx| {
                if let Some(sender) = tx.borrow().as_ref() {
                    let _ = sender.try_send(HookAction::PttDown { vk, gen });
                }
            });
        }

        if is_up && state.ptt_key_down.load(Ordering::SeqCst) {
            state.ptt_key_down.store(false, Ordering::SeqCst);

            if !state.hands_free_active.load(Ordering::SeqCst) {
                HOOK_ACTION_TX.with(|tx| {
                    if let Some(sender) = tx.borrow().as_ref() {
                        let _ = sender.try_send(HookAction::PttUp { vk });
                    }
                });
            }
        }
    }

    if is_hf_key {
        let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;
        let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
        if is_down {
            consumed = true;
        }
        if is_up {
            HOOK_ACTION_TX.with(|tx| {
                if let Some(sender) = tx.borrow().as_ref() {
                    let _ = sender.try_send(HookAction::HfToggle { vk });
                }
            });
        }
    }

    // AI Chat key: hold to record, release to send
    let is_ai_chat_key = !state.ai_chat_vk_codes.is_empty()
        && state.ai_chat_vk_codes.contains(&vk)
        && !is_ptt_key
        && !is_hf_key;

    if is_ai_chat_key {
        let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
        let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;

        if is_down {
            consumed = true;
        }

        let already_down = state.ai_chat_key_down.load(Ordering::SeqCst);
        if is_down && !already_down && !state.hands_free_active.load(Ordering::SeqCst) {
            state.ai_chat_key_down.store(true, Ordering::SeqCst);
            let gen = state.ai_chat_generation.fetch_add(1, Ordering::SeqCst) + 1;

            HOOK_ACTION_TX.with(|tx| {
                if let Some(sender) = tx.borrow().as_ref() {
                    let _ = sender.try_send(HookAction::AiChatPttDown { vk, gen });
                }
            });
        }

        if is_up && state.ai_chat_key_down.load(Ordering::SeqCst) {
            state.ai_chat_key_down.store(false, Ordering::SeqCst);

            if !state.hands_free_active.load(Ordering::SeqCst) {
                HOOK_ACTION_TX.with(|tx| {
                    if let Some(sender) = tx.borrow().as_ref() {
                        let _ = sender.try_send(HookAction::AiChatPttUp { vk });
                    }
                });
            }
        }
    }

    consumed
}

#[cfg(windows)]
unsafe extern "system" fn low_level_mouse_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    let msg = w_param.0 as u32;

    if n_code >= 0 {
        // Wrap in catch_unwind to prevent panics from crashing the process
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            process_mouse_event(n_code, w_param, l_param, msg)
        }));

        match result {
            Ok(consumed) => {
                if consumed {
                    return LRESULT(1);
                }
            }
            Err(_panic_info) => {
                // Don't log here - logging may cause issues in the hook context.
            }
        }
    }

    CallNextHookEx(None, n_code, w_param, l_param)
}

#[cfg(windows)]
unsafe fn process_mouse_event(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
    msg: u32,
) -> bool {
    // Handle middle button PTT
    if msg == WM_MBUTTONDOWN || msg == WM_MBUTTONUP {
        if let Some(data) = (l_param.0 as *const MSLLHOOKSTRUCT).as_ref() {
            let _ = data; // suppress unused warning
        }

        MOUSE_HOOK_STATE.with(|s| {
            if let Some(state) = s.borrow().as_ref() {
                if !state.enabled.load(Ordering::SeqCst) {
                    return;
                }

                if msg == WM_MBUTTONDOWN && !state.key_down.load(Ordering::SeqCst) {
                    let _gen = state.generation.fetch_add(1, Ordering::SeqCst);
                    state.key_down.store(true, Ordering::SeqCst);
                    let event = PTTEvent {
                        source: "rust_mouse_hook".to_string(),
                        reason: "mbuttondown".to_string(),
                        vk: 0x04,
                        ptt_setting: "MouseMiddleButton".to_string(),
                        timestamp: chrono::Utc::now().timestamp_millis(),
                        alt_key: false, ctrl_key: false, shift_key: false,
                    };
                    let _ = state.app_handle.emit("ptt-down", &event);
                } else if msg == WM_MBUTTONUP && state.key_down.load(Ordering::SeqCst) {
                    state.key_down.store(false, Ordering::SeqCst);
                    let event = PTTEvent {
                        source: "rust_mouse_hook".to_string(),
                        reason: "mbuttonup".to_string(),
                        vk: 0x04,
                        ptt_setting: "MouseMiddleButton".to_string(),
                        timestamp: chrono::Utc::now().timestamp_millis(),
                        alt_key: false, ctrl_key: false, shift_key: false,
                    };
                    let _ = state.app_handle.emit("ptt-up", &event);
                }
            }
        });
    }

    // Handle mouse wheel for scroll-to-send / scroll-to-delete
    if msg == WM_MOUSEWHEEL {
        let data = match (l_param.0 as *const MSLLHOOKSTRUCT).as_ref() {
            Some(d) => d,
            None => return false,
        };
        let wheel_delta = ((data.mouseData >> 16) & 0xFFFF) as i16 as i32;

        let mut consume = false;

        MOUSE_HOOK_STATE.with(|s| {
            if let Some(state) = s.borrow().as_ref() {
                let up_send = state.scroll_up_send.load(Ordering::SeqCst);
                let down_delete = state.scroll_down_delete.load(Ordering::SeqCst);
                if !up_send && !down_delete {
                    SCROLL_UP_ACCUM.with(|a| a.set(0));
                    SCROLL_DOWN_ACCUM.with(|a| a.set(0));
                    return;
                }

                if wheel_delta > 0 && up_send {
                    let threshold = state.scroll_up_threshold.load(Ordering::SeqCst) as i32;
                    let acc = SCROLL_UP_ACCUM.with(|a| a.get()) + wheel_delta;
                    SCROLL_UP_ACCUM.with(|a| a.set(acc));

                    if acc >= 120 * threshold && is_focused_element_editable() {
                        SCROLL_UP_ACCUM.with(|a| a.set(0));
                        consume = true;
                        crate::commands::system::write_log_line(
                            &format!("[RUST] [scroll] wheel up accum={} threshold={} → Enter", acc, threshold)
                        );
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(10));
                            send_key(0x0D);
                        });
                    }
                } else if wheel_delta < 0 && down_delete {
                    let threshold = state.scroll_down_threshold.load(Ordering::SeqCst) as i32;
                    let acc = SCROLL_DOWN_ACCUM.with(|a| a.get()) + (-wheel_delta);
                    SCROLL_DOWN_ACCUM.with(|a| a.set(acc));

                    if acc >= 120 * threshold && is_focused_element_editable() {
                        SCROLL_DOWN_ACCUM.with(|a| a.set(0));
                        consume = true;
                        crate::commands::system::write_log_line(
                            &format!("[RUST] [scroll] wheel down accum={} threshold={} → Backspace", acc, threshold)
                        );
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(10));
                            send_key(0x08);
                        });
                    }
                }
            }
        });

        return consume;
    }

    false
}

/// Check if the focused element in the foreground window is editable.
/// Uses GetGUIThreadInfo (fast, no COM) — checks for caret presence.
/// Also checks window class for Chromium-based apps where caret may not be reported.
#[cfg(windows)]
unsafe fn is_focused_element_editable() -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId, GetGUIThreadInfo, GUITHREADINFO, GetClassNameW};

    let fg = GetForegroundWindow();
    if fg.is_invalid() {
        return false;
    }

    let mut pid: u32 = 0;
    let tid = GetWindowThreadProcessId(fg, Some(&mut pid));
    if tid == 0 {
        return false;
    }

    // 1. Check for caret via GetGUIThreadInfo (fast, native Win32)
    let mut gui_info = GUITHREADINFO {
        cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
        ..Default::default()
    };
    if GetGUIThreadInfo(tid, &mut gui_info).is_ok() {
        let caret = gui_info.hwndCaret;
        if !caret.is_invalid() && caret.0 != std::ptr::null_mut() {
            let rc = gui_info.rcCaret;
            if (rc.right - rc.left) > 0 || (rc.bottom - rc.top) > 0 {
                return true;
            }
        }
        // hwndFocus might be an editable control even without caret
        let focus = gui_info.hwndFocus;
        if !focus.is_invalid() && focus.0 != std::ptr::null_mut() {
            let mut buf = [0u16; 256];
            let len = GetClassNameW(focus, &mut buf);
            if len > 0 {
                let class = String::from_utf16_lossy(&buf[..len as usize]).to_lowercase();
                if class.contains("edit")
                    || class.contains("richedit")
                    || class.contains("scintilla")
                    || class.contains("chrome_renderwidgethost")
                {
                    return true;
                }
            }
        }
    }

    // 2. For Chromium-based windows (Chrome, Edge, Electron, etc.),
    // GetGUIThreadInfo often doesn't report caret. Check window class instead.
    let mut buf = [0u16; 256];
    let len = GetClassNameW(fg, &mut buf);
    if len > 0 {
        let class = String::from_utf16_lossy(&buf[..len as usize]).to_lowercase();
        if class.contains("chrome_widgetwin") {
            return true;
        }
    }

    false
}

/// Send a single key press + release via SendInput.
/// Used for scroll-triggered actions (Enter / Backspace).
#[cfg(windows)]
unsafe fn send_key(vk: u16) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
    };

    let mut down: INPUT = std::mem::zeroed();
    down.r#type = INPUT_KEYBOARD;
    down.Anonymous.ki = KEYBDINPUT {
        wVk: VIRTUAL_KEY(vk),
        wScan: 0,
        dwFlags: windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS(0),
        time: 0,
        dwExtraInfo: 0,
    };

    let mut up: INPUT = std::mem::zeroed();
    up.r#type = INPUT_KEYBOARD;
    up.Anonymous.ki = KEYBDINPUT {
        wVk: VIRTUAL_KEY(vk),
        wScan: 0,
        dwFlags: KEYEVENTF_KEYUP,
        time: 0,
        dwExtraInfo: 0,
    };

    let sent = SendInput(&[down, up], std::mem::size_of::<INPUT>() as i32);
    let err = windows::Win32::Foundation::GetLastError();

    crate::commands::system::write_log_line(&format!(
        "[RUST] [scroll] send_key vk=0x{:02X} sent={} GetLastError={}",
        vk, sent, err.0
    ));

    // Fallback to keybd_event if SendInput failed
    if sent == 0 {
        crate::commands::system::write_log_line(
            "[RUST] [scroll] SendInput failed, falling back to keybd_event"
        );
        extern "system" {
            fn keybd_event(bVk: u8, bScan: u8, dwFlags: u32, dwExtraInfo: usize);
        }
        const KEYEVENTF_KEYUP_FALLBACK: u32 = 0x0002;
        keybd_event(vk as u8, 0, 0, 0);
        keybd_event(vk as u8, 0, KEYEVENTF_KEYUP_FALLBACK, 0);
    }
}