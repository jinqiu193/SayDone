use serde_json::Value;
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::commands::system::write_log_line;

const OVERLAY_DEFAULT_BASE_WIDTH: f64 = 360.0;
const OVERLAY_BASE_HEIGHT: f64 = 56.0;
const OVERLAY_FALLBACK_WIDTH: f64 = 520.0;
const OVERLAY_FALLBACK_HEIGHT: f64 = 224.0;

/// Time of last received pong from overlay (epoch millis). 0 = never.
/// Used to detect WebView2 unresponsiveness in `show_overlay`.
static LAST_PONG_MS: AtomicI64 = AtomicI64::new(0);
/// Monotonic id for ping/pong correlation
static PING_SEQ: AtomicU64 = AtomicU64::new(0);

/// 显示器信息缓存：避免每次 overlay update 都调 `primary_monitor()`（涉及 WMI/Windows API 调用）
/// `calc_overlay_bounds` 是热路径（30 Hz → 现在 1 Hz，但仍值得缓存以便用户在设置页面快速切换位置时秒响应）。
/// 缓存失效：500 ms 或显示器变化时刷新。
struct MonitorCache {
    width: f64,
    height: f64,
    fetched_at_ms: AtomicI64,
}
static MONITOR_CACHE: std::sync::OnceLock<std::sync::Mutex<Option<MonitorCache>>> =
    std::sync::OnceLock::new();

const MONITOR_CACHE_TTL_MS: i64 = 500;

/// Returns (logical_width, logical_height) of the primary monitor.
/// Result is cached for `MONITOR_CACHE_TTL_MS` to avoid expensive system queries.
fn get_primary_monitor_size(app: &AppHandle) -> (f64, f64) {
    let now = chrono::Utc::now().timestamp_millis();
    let cache_mutex = MONITOR_CACHE.get_or_init(|| std::sync::Mutex::new(None));
    {
        let guard = cache_mutex.lock().unwrap();
        if let Some(ref cached) = *guard {
            let age = now - cached.fetched_at_ms.load(Ordering::Relaxed);
            if age < MONITOR_CACHE_TTL_MS {
                return (cached.width, cached.height);
            }
        }
    }
    // 缓存过期，重新查询
    let (w, h) = if let Some(monitor) = app.primary_monitor().ok().flatten() {
        let size = monitor.size();
        let scale = monitor.scale_factor();
        (size.width as f64 / scale, size.height as f64 / scale)
    } else {
        (1920.0, 1080.0)
    };
    {
        let mut guard = cache_mutex.lock().unwrap();
        *guard = Some(MonitorCache {
            width: w,
            height: h,
            fetched_at_ms: AtomicI64::new(now),
        });
    }
    (w, h)
}

pub fn record_overlay_pong(_seq: u64) {
    let now = chrono::Utc::now().timestamp_millis();
    LAST_PONG_MS.store(now, Ordering::SeqCst);
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[derive(Debug, Clone, PartialEq)]
enum OverlayLayout {
    Base,
    Fallback,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum OverlayPosition {
    Bottom,
    Top,
}

impl Default for OverlayPosition {
    fn default() -> Self {
        OverlayPosition::Bottom
    }
}

pub struct WindowState {
    overlay_layout: Mutex<OverlayLayout>,
    overlay_base_width: Mutex<f64>,
    overlay_position: Mutex<OverlayPosition>,
}

impl WindowState {
    pub fn new() -> Self {
        Self {
            overlay_layout: Mutex::new(OverlayLayout::Base),
            overlay_base_width: Mutex::new(OVERLAY_DEFAULT_BASE_WIDTH),
            overlay_position: Mutex::new(OverlayPosition::Bottom),
        }
    }

    pub fn show_overlay(&self, app: &AppHandle) {
        let layout = self.overlay_layout.lock().unwrap().clone();
        let is_fallback = layout == OverlayLayout::Fallback;
        let base_w = *self.overlay_base_width.lock().unwrap();

        let position = self.overlay_position.lock().unwrap().clone();
        let bounds = calc_overlay_bounds(app, is_fallback, base_w, position);
        let (mon_w, mon_h, mon_scale) = monitor_info(app);

        if let Some(overlay) = app.get_webview_window("overlay") {
            // ── Diagnostic snapshot before any state change ──
            let was_visible = overlay.is_visible().unwrap_or(false);
            let outer_pos = overlay.outer_position()
                .map(|p| format!("{},{}", p.x, p.y))
                .unwrap_or_else(|_| "err".to_string());
            let outer_size = overlay.outer_size()
                .map(|s| format!("{}x{}", s.width, s.height))
                .unwrap_or_else(|_| "err".to_string());

            // Probe webview responsiveness — send a ping; pong arrival is logged async.
            let seq = PING_SEQ.fetch_add(1, Ordering::SeqCst) + 1;
            let last_pong = LAST_PONG_MS.load(Ordering::SeqCst);
            let pong_age_ms = if last_pong == 0 { -1 } else { now_ms() - last_pong };

            let ping_emit_err = overlay.emit("overlay-ping", seq).err()
                .map(|e| format!("{:?}", e));

            write_log_line(&format!(
                "[overlay-diag] show begin handle=present layout={:?} fallback={} was_visible={} \
                 outer_pos={} outer_size={} target_bounds={:?} monitor={}x{}@{:.2} \
                 ping_seq={} last_pong_age_ms={} ping_emit_err={:?}",
                layout, is_fallback, was_visible,
                outer_pos, outer_size, bounds, mon_w, mon_h, mon_scale,
                seq, pong_age_ms, ping_emit_err,
            ));

            let pos_err = overlay.set_position(tauri::Position::Logical(
                tauri::LogicalPosition::new(bounds.0, bounds.1)
            )).err().map(|e| format!("{:?}", e));
            let size_err = overlay.set_size(tauri::Size::Logical(
                tauri::LogicalSize::new(bounds.2, bounds.3)
            )).err().map(|e| format!("{:?}", e));
            let show_err = overlay.show().err().map(|e| format!("{:?}", e));
            let aot_err = overlay.set_always_on_top(true).err().map(|e| format!("{:?}", e));
            // Win32 加固：Tauri set_always_on_top 只设 WS_EX_TOPMOST 标志位，
            // 多个 topmost 窗口共存时会被其他 topmost 窗口挤到下面。
            // 用 SetWindowPos(HWND_TOPMOST) 显式推到 topmost 栈顶。
            let topmost_ok = overlay_hwnd_raw(&overlay)
                .map(force_overlay_topmost)
                .unwrap_or(true);
            set_overlay_interactivity(&overlay, is_fallback);

            // Re-snapshot to confirm visibility actually changed
            let now_visible = overlay.is_visible().unwrap_or(false);
            let now_outer_pos = overlay.outer_position()
                .map(|p| format!("{},{}", p.x, p.y))
                .unwrap_or_else(|_| "err".to_string());

            let any_err = pos_err.is_some() || size_err.is_some()
                || show_err.is_some() || aot_err.is_some();
            let level = if any_err { "WARN" } else { "INFO" };
            write_log_line(&format!(
                "[overlay-diag] show end [{}] now_visible={} now_outer_pos={} \
                 pos_err={:?} size_err={:?} show_err={:?} aot_err={:?}",
                level, now_visible, now_outer_pos,
                pos_err, size_err, show_err, aot_err,
            ));
        } else {
            write_log_line(&format!(
                "[overlay-diag] show begin handle=MISSING layout={:?} fallback={} \
                 target_bounds={:?} monitor={}x{}@{:.2} — recreating",
                layout, is_fallback, bounds, mon_w, mon_h, mon_scale,
            ));
            self.create_overlay(app, is_fallback, base_w);
        }
    }

    pub fn hide_overlay(&self, app: &AppHandle) {
        // Reset to base layout when hiding
        let prev_layout = {
            let mut g = self.overlay_layout.lock().unwrap();
            let prev = g.clone();
            *g = OverlayLayout::Base;
            prev
        };

        if let Some(overlay) = app.get_webview_window("overlay") {
            set_overlay_interactivity(&overlay, false);
            let was_visible = overlay.is_visible().unwrap_or(false);
            let hide_err = overlay.hide().err().map(|e| format!("{:?}", e));
            write_log_line(&format!(
                "[overlay-diag] hide prev_layout={:?} was_visible={} hide_err={:?}",
                prev_layout, was_visible, hide_err,
            ));
        } else {
            write_log_line(&format!(
                "[overlay-diag] hide handle=MISSING prev_layout={:?}",
                prev_layout,
            ));
        }
    }

    pub fn update_overlay_state(&self, app: &AppHandle, data: &Value) {
        let state_str = data.get("state").and_then(|s| s.as_str()).unwrap_or("");

        if let Some(bw) = data.get("baseWidth").and_then(|v| v.as_f64()) {
            if bw >= 160.0 && bw <= 600.0 {
                *self.overlay_base_width.lock().unwrap() = bw;
            }
        }

        if let Some(pos_str) = data.get("position").and_then(|v| v.as_str()) {
            let new_pos = if pos_str == "top" { OverlayPosition::Top } else { OverlayPosition::Bottom };
            let mut pos = self.overlay_position.lock().unwrap();
            if *pos != new_pos {
                *pos = new_pos;
                if let Some(overlay) = app.get_webview_window("overlay") {
                    let is_fallback = self.overlay_layout.lock().unwrap().clone() == OverlayLayout::Fallback;
                    let base_w = *self.overlay_base_width.lock().unwrap();
                    let bounds = calc_overlay_bounds(app, is_fallback, base_w, new_pos);
                    let _ = overlay.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(bounds.0, bounds.1)));
                }
            }
        }

        let next_layout = if state_str == "fallback" {
            OverlayLayout::Fallback
        } else {
            OverlayLayout::Base
        };

        let is_fallback = next_layout == OverlayLayout::Fallback;
        let base_w = *self.overlay_base_width.lock().unwrap();
        let position = self.overlay_position.lock().unwrap().clone();

        {
            let mut current = self.overlay_layout.lock().unwrap();
            if *current != next_layout {
                *current = next_layout;
                if let Some(overlay) = app.get_webview_window("overlay") {
                    let bounds = calc_overlay_bounds(app, is_fallback, base_w, position);
                    let _ = overlay.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(bounds.0, bounds.1)));
                    let _ = overlay.set_size(tauri::Size::Logical(tauri::LogicalSize::new(bounds.2, bounds.3)));
                    let _ = overlay.set_always_on_top(true);
                    // Win32 加固：布局切换时也强制 topmost
                    if let Some(hwnd) = overlay_hwnd_raw(&overlay) {
                        force_overlay_topmost(hwnd);
                    }
                }
            }
        }

        if let Some(overlay) = app.get_webview_window("overlay") {
            set_overlay_interactivity(&overlay, is_fallback);

            if is_fallback {
                let _ = overlay.show();
            }

            let _ = overlay.emit("overlay-state", data);
        }
    }

    fn create_overlay(&self, app: &AppHandle, is_fallback: bool, base_w: f64) {
        let position = self.overlay_position.lock().unwrap().clone();
        let bounds = calc_overlay_bounds(app, is_fallback, base_w, position);

        let builder = WebviewWindowBuilder::new(
            app,
            "overlay",
            WebviewUrl::App("overlay.html".into()),
        )
        .title("SayDone Overlay")
        .inner_size(bounds.2, bounds.3)
        .position(bounds.0, bounds.1)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false);

        match builder.build() {
            Ok(overlay) => {
                set_overlay_interactivity(&overlay, is_fallback);
                let show_err = overlay.show().err().map(|e| format!("{:?}", e));
                let now_visible = overlay.is_visible().unwrap_or(false);
                // Win32 加固：首次创建后立即推 HWND_TOPMOST，避免其他 topmost
                // 窗口在 Tauri 异步初始化期间抢占 z-order。
                if let Some(hwnd) = overlay_hwnd_raw(&overlay) {
                    force_overlay_topmost(hwnd);
                }
                write_log_line(&format!(
                    "[overlay-diag] create_overlay OK is_fallback={} bounds={:?} \
                     show_err={:?} now_visible={}",
                    is_fallback, bounds, show_err, now_visible,
                ));
            }
            Err(e) => {
                eprintln!("[overlay] create_overlay: FAILED: {}", e);
                log::error!("Failed to create overlay window: {}", e);
                write_log_line(&format!(
                    "[overlay-diag] create_overlay FAILED is_fallback={} bounds={:?} err={:?}",
                    is_fallback, bounds, e,
                ));
            }
        }
    }
}

fn set_overlay_interactivity(overlay: &tauri::WebviewWindow, interactive: bool) {
    let _ = overlay.set_ignore_cursor_events(!interactive);
}

/// Win32 强制把 overlay 窗口设为 HWND_TOPMOST。
///
/// 为什么需要：Tauri 的 `set_always_on_top(true)` 只在窗口创建或属性变化时
/// 设置 WS_EX_TOPMOST 标志位；但 Windows 的 z-order 规则是：
/// 多个 topmost 窗口之间按"最后激活"排序，其他 topmost 窗口（如截图工具、
/// 悬浮窗、Pin 图标）激活时会把我们的 overlay 挤到它们下面。
///
/// 解法：每次 show / update 后用 SetWindowPos(HWND_TOPMOST, SWP_NOMOVE |
/// SWP_NOSIZE | SWP_NOACTIVATE) 显式把我们推到 topmost 栈顶，且不抢焦点。
///
/// 仅在 Windows 上生效；其他平台返回 false 让调用方忽略。
#[cfg(windows)]
fn force_overlay_topmost(hwnd_raw: isize) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE,
    };

    let hwnd = HWND(hwnd_raw as *mut std::ffi::c_void);
    // SAFETY: HWND 来自 Tauri 的 window.hwnd()，由 WebView2 / 系统保证有效；
    // 操作只改 z-order，不动位置/尺寸/焦点，幂等。
    unsafe {
        let result = SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
        if result.is_ok() {
            write_log_line(&format!(
                "[overlay-diag] SetWindowPos(HWND_TOPMOST) OK hwnd={}",
                hwnd_raw
            ));
            true
        } else {
            let err = result.unwrap_err();
            write_log_line(&format!(
                "[overlay-diag] SetWindowPos(HWND_TOPMOST) FAILED hwnd={} err={:?}",
                hwnd_raw, err
            ));
            log::warn!("[overlay] SetWindowPos(HWND_TOPMOST) failed: {:?}", err);
            false
        }
    }
}

#[cfg(not(windows))]
fn force_overlay_topmost(_hwnd_raw: isize) -> bool {
    true
}

/// 拿 overlay 窗口的 Win32 HWND（raw pointer），给 SetWindowPos 用。
/// Tauri 的 WebviewWindow::hwnd() 返回 &HWND（Tauri 包装的 newtype），
/// 内部是 *mut c_void。这里取 inner 指针。
#[cfg(windows)]
fn overlay_hwnd_raw(overlay: &tauri::WebviewWindow) -> Option<isize> {
    overlay
        .hwnd()
        .ok()
        .map(|h| h.0 as *mut std::ffi::c_void as isize)
}

#[cfg(not(windows))]
fn overlay_hwnd_raw(_overlay: &tauri::WebviewWindow) -> Option<isize> {
    None
}

/// Returns (logical_width, logical_height, scale_factor) of primary monitor.
fn monitor_info(app: &AppHandle) -> (f64, f64, f64) {
    if let Some(monitor) = app.primary_monitor().ok().flatten() {
        let size = monitor.size();
        let scale = monitor.scale_factor();
        (size.width as f64 / scale, size.height as f64 / scale, scale)
    } else {
        (1920.0, 1080.0, 1.0)
    }
}

/// Returns (x, y, width, height)
fn calc_overlay_bounds(app: &AppHandle, is_fallback: bool, base_w: f64, position: OverlayPosition) -> (f64, f64, f64, f64) {
    let (desired_w, desired_h) = if is_fallback {
        (OVERLAY_FALLBACK_WIDTH, OVERLAY_FALLBACK_HEIGHT)
    } else {
        (base_w, OVERLAY_BASE_HEIGHT)
    };

    let (screen_w, screen_h) = get_primary_monitor_size(app);

    let w = desired_w.min(screen_w - 40.0).max(160.0);
    let h = desired_h.min(screen_h - 40.0).max(56.0);
    let x = ((screen_w - w) / 2.0).round();

    let y = match position {
        OverlayPosition::Top => 8.0,
        OverlayPosition::Bottom => (screen_h - h - 72.0).max(8.0),
    };

    (x, y, w, h)
}
