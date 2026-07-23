//! Text injection — writes text into the target application.
//!
//! Strategy priority:
//! 1. SendInput Unicode mode (works like IME input methods, bypasses secure input restrictions)
//! 2. UI Automation ValuePattern (works for web controls)
//! 3. clipboard + WM_PASTE (native Win32 controls)
//! 4. clipboard + SendInput Ctrl+V (last resort)
//!
//! Two entry points:
//! - `inject_text_to_hwnd(text, hwnd, focus_hwnd)` — uses pre-probed hwnd (preferred)
//! - `inject_text(text)` — re-captures context (legacy fallback)

use serde::Serialize;
use windows::core::Interface;

#[cfg(windows)]
use windows::Win32::Foundation::{HWND, POINT, GetLastError};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow,
    SendMessageTimeoutW, SMTO_ABORTIFHUNG, GetCursorPos,
};
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
    VIRTUAL_KEY, KEYBD_EVENT_FLAGS,
};
#[cfg(windows)]
use windows::Win32::System::Threading::GetCurrentThreadId;
#[cfg(windows)]
use windows::Win32::System::DataExchange::{
    OpenClipboard, CloseClipboard, EmptyClipboard, SetClipboardData,
};
#[cfg(windows)]
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
#[cfg(windows)]
use windows::Win32::Foundation::HANDLE;

use crate::context;

#[derive(Debug, Clone, Serialize, Default)]
pub struct InjectResult {
    pub ok: bool,
    pub strategy: Option<String>,
    pub reason: Option<String>,
    pub detail: Option<String>,
    #[serde(default)]
    pub uncertain: bool,
}

#[cfg(windows)]
pub fn inject_text_to_hwnd(text: &str, target_hwnd_val: isize, focus_hwnd_val: isize) -> InjectResult {
    let target = HWND(target_hwnd_val as *mut _);
    let focus = if focus_hwnd_val != 0 {
        HWND(focus_hwnd_val as *mut _)
    } else {
        target
    };

    unsafe { do_inject(target, focus, text) }
}

/// 选区替换：先把原选区重新选中（基于原选区长度），再用 `text` 覆盖它。
///
/// 流程：
/// 1. 通过 `target_hwnd_val` 拿 UIA 元素 + `IUIAutomationTextPattern`
/// 2. 拿当前选区集合 —— 如果还没被破坏（用户还没松键），直接复用
/// 3. 如果选区已塌缩，从 `DocumentRange` 末尾往前数 `sel_len` 字符构造原选区
/// 4. `Select()` 选中 → 走 `do_inject`（Ctrl+V / SendInput）覆盖
/// 5. 失败 → 降级到 `do_inject` 把 `text` 注入当前光标（用户可 Ctrl+Z 撤销）
///
/// 注意：原选区长度按 chars 计数（与 capture_selection 一致），UIA `Range` 走字符单位。
#[cfg(windows)]
pub fn inject_replace_selection(
    text: &str,
    target_hwnd_val: isize,
    sel_len: usize,
) -> InjectResult {
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize,
        CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationTextPattern,
        IUIAutomationTextRange, UIA_TextPatternId,
        TextPatternRangeEndpoint_Start, TextUnit_Character,
    };
    use windows::Win32::Foundation::HWND;
    use windows::core::Interface;

    let target = HWND(target_hwnd_val as *mut _);
    if target.0.is_null() {
        return InjectResult {
            ok: false,
            strategy: None,
            reason: Some("invalid_hwnd".to_string()),
            detail: None,
            uncertain: false,
        };
    }

    crate::commands::system::write_log_line(
        &format!(
            "[RUST] [inject-replace] start: target_hwnd={} sel_len={} text_len={}",
            target_hwnd_val,
            sel_len,
            text.chars().count()
        )
    );

    let co_init_result = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let need_co_uninit = co_init_result.is_ok();

    let select_result = (|| -> Result<(), String> {
        let uia: IUIAutomation = unsafe {
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| format!("CoCreateInstance CUIAutomation: {}", e))?
        };

        let element = unsafe {
            uia.ElementFromHandle(target)
                .map_err(|e| format!("ElementFromHandle: {}", e))?
        };

        let pattern_obj = unsafe {
            element
                .GetCurrentPattern(UIA_TextPatternId)
                .map_err(|e| format!("GetCurrentPattern(TextPattern): {}", e))?
        };
        let text_pattern: IUIAutomationTextPattern = pattern_obj
            .cast()
            .map_err(|e| format!("cast IUIAutomationTextPattern: {}", e))?;

        // 拿当前选区（用户在按住 Ctrl 录音过程中选区可能还在/已塌缩/已清）
        let sel_array = unsafe {
            text_pattern
                .GetSelection()
                .map_err(|e| format!("GetSelection: {}", e))?
        };
        let count = unsafe { sel_array.Length() }.unwrap_or(0);

        let sel_range: IUIAutomationTextRange = if count > 0 {
            // 选区还活着 —— 直接用第一块
            unsafe { sel_array.GetElement(0) }
                .map_err(|e| format!("sel_array.GetElement(0): {}", e))?
        } else {
            // 选区已塌缩/被清 —— 从 document range 末尾往前数 sel_len 字符构造原选区
            crate::commands::system::write_log_line(
                "[RUST] [inject-replace] selection collapsed, building fallback range from doc end"
            );
            let doc = unsafe {
                text_pattern
                    .DocumentRange()
                    .map_err(|e| format!("DocumentRange: {}", e))?
            };
            if sel_len > 0 {
                // 把起点往前推 sel_len 字符（"从末尾往前 sel_len 字符 = 选区起点"）
                unsafe { doc.MoveEndpointByUnit(TextPatternRangeEndpoint_Start, TextUnit_Character, -(sel_len as i32)) }
                    .map_err(|e| format!("MoveEndpointByUnit(Start, Backward, sel_len): {}", e))?;
            }
            doc
        };

        // 重新选中原范围
        unsafe { sel_range.Select() }
            .map_err(|e| format!("sel_range.Select: {}", e))?;

        crate::commands::system::write_log_line(
            "[RUST] [inject-replace] re-selected original range, falling through to do_inject"
        );
        Ok(())
    })();

    if need_co_uninit {
        unsafe { CoUninitialize() };
    }

    if let Err(e) = select_result {
        crate::commands::system::write_log_line(&format!(
            "[RUST] [inject-replace] UIA select failed ({}), falling back to do_inject (insert at caret)",
            e
        ));
    }

    // 走 do_inject：UIA 成功重新选中 → 注入即替换；UIA 失败 → 注入到当前光标
    unsafe { do_inject(target, target, text) }
}

#[cfg(not(windows))]
pub fn inject_replace_selection(
    _text: &str,
    _target: isize,
    _sel_len: usize,
) -> InjectResult {
    InjectResult { ok: false, strategy: None, reason: Some("not_windows".to_string()), detail: None, uncertain: false }
}

#[cfg(windows)]
pub fn inject_text(text: &str) -> InjectResult {
    let ctx = context::capture_context("inject");

    if ctx.hwnd.is_empty() || ctx.hwnd == "0" {
        return InjectResult {
            ok: false, strategy: None,
            reason: Some("no_foreground_window".to_string()), detail: None,
            uncertain: false,
        };
    }

    let editable = is_likely_editable(&ctx);
    if !editable {
        return InjectResult {
            ok: false,
            strategy: Some("overlay_fallback".to_string()),
            reason: Some("not_editable".to_string()),
            detail: Some(format!(
                "class={} focusClass={} hasCaret={} process={}",
                ctx.window_class, ctx.focus_class, ctx.has_caret, ctx.process_name
            )),
            uncertain: false,
        };
    }

    let target_hwnd = ctx.hwnd.parse::<isize>().unwrap_or(0);
    let _focus_hwnd = ctx.focus_hwnd.parse::<isize>().unwrap_or(0);

    // Try to get the window under the mouse cursor first (more accurate for web apps)
    let mouse_hwnd = get_window_under_cursor();
    let inject_hwnd = if mouse_hwnd != 0 && mouse_hwnd != target_hwnd {
        crate::commands::system::write_log_line(&format!(
            "[RUST] [inject] using mouse window {} instead of focus {}",
            mouse_hwnd, target_hwnd
        ));
        mouse_hwnd
    } else {
        target_hwnd
    };

    inject_text_to_hwnd(text, inject_hwnd, inject_hwnd)
}

/// Get the window handle under the mouse cursor
#[cfg(windows)]
fn get_window_under_cursor() -> isize {
    unsafe {
        let mut point = POINT::default();
        if GetCursorPos(&mut point).is_ok() {
            use windows::Win32::UI::WindowsAndMessaging::WindowFromPoint;
            let hwnd = WindowFromPoint(point);
            if !hwnd.is_invalid() {
                return hwnd.0 as isize;
            }
        }
    }
    0
}

#[cfg(not(windows))]
pub fn inject_text_to_hwnd(_text: &str, _target: isize, _focus: isize) -> InjectResult {
    InjectResult { ok: false, strategy: None, reason: Some("not_windows".to_string()), detail: None, uncertain: false }
}
#[cfg(not(windows))]
pub fn inject_text(_text: &str) -> InjectResult {
    InjectResult { ok: false, strategy: None, reason: Some("not_windows".to_string()), detail: None, uncertain: false }
}

fn is_likely_editable(ctx: &context::AppContext) -> bool {
    is_likely_editable_pub(ctx)
}

pub fn is_likely_editable_pub(ctx: &context::AppContext) -> bool {
    // 1. 有光标 → 一定是编辑控件
    if ctx.has_caret { return true; }

    let fc = ctx.focus_class.to_lowercase();
    let wc = ctx.window_class.to_lowercase();

    // 2. 已知的原生 Win32 编辑控件类名
    let native_editable_classes = [
        "edit", "richedit", "richedit20w", "richedit50w",
        "scintilla", "texteditorsid", "_wwg",
    ];
    for cls in &native_editable_classes {
        if fc.contains(cls) || wc.contains(cls) { return true; }
    }

    // 3. UI Automation 控件类型判断
    if !ctx.control_type.is_empty() {
        let ct = ctx.control_type.as_str();
        let is_editable_control = ct == "Edit" || ct == "Document" || ct == "ComboBox";
        let has_value = ctx.is_value_pattern_available;
        let is_rich_editor = (ct == "Custom" || ct == "Group" || ct == "Pane") && has_value;

        if is_editable_control || is_rich_editor {
            if ctx.is_enabled && ctx.is_read_only != Some(true) {
                return true;
            }
        }

        // 4. Chromium 类窗口（通过窗口类名识别，适用于所有 Chromium-based 应用：
        // Chrome, Edge, Electron, VSCode, TRAE 等）
        let is_chromium_class = fc.contains("chrome_widgetwin")
            || fc.contains("chrome_renderwidgethost")
            || wc.contains("chrome_widgetwin");

        if is_chromium_class && ctx.is_keyboard_focusable && ctx.is_enabled {
            // 排除明显不可编辑的控件类型
            let definitely_not_editable = matches!(ct,
                "Button" | "MenuItem" | "MenuBar" | "Menu" | "Tab" | "TabItem" |
                "ToolBar" | "TitleBar" | "ScrollBar" | "Image" | "Hyperlink" |
                "StatusBar" | "Header" | "HeaderItem" | "Separator" | "ProgressBar"
            );
            if !definitely_not_editable {
                return true;
            }
        }
    }

    // 5. Chromium 类窗口但 UIA 没有提供控件类型信息（常见于 Electron 应用）
    if fc.contains("chrome_widgetwin") || wc.contains("chrome_widgetwin") {
        return true;
    }

    // 6. 默认：倾向于尝试注入。
    // 用户已经主动按下 PTT 录音，说明焦点应该在某个输入框上。
    // 与其因为识别不出来就拒绝，不如尝试注入 —— 即使失败也会走兜底流程
    // （复制到剪贴板 + 显示兜底卡片），不会造成副作用。
    true
}

// ─── Core injection logic ───

#[cfg(windows)]
const WM_PASTE: u32 = 0x0302;

/// Find the Chrome_RenderWidgetHostHWND child window (the actual input surface
/// in Chromium/Electron apps). This is where WM_PASTE should be sent, not the
/// top-level Chrome_WidgetWin_1 window.
#[cfg(windows)]
unsafe fn find_chromium_render_widget(root: HWND) -> Option<HWND> {
    use windows::Win32::UI::WindowsAndMessaging::{EnumChildWindows, GetClassNameW};
    use windows::Win32::Foundation::{BOOL, LPARAM};

    // EnumChildWindows already recurses into all descendants.
    // We pass a pointer to Option<HWND> through LPARAM.
    let mut found: Option<HWND> = None;
    let found_ptr = &mut found as *mut Option<HWND>;

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let found_ptr = lparam.0 as *mut Option<HWND>;
        if found_ptr.is_null() || (*found_ptr).is_some() {
            return BOOL(0); // Stop
        }
        let mut buf = [0u16; 256];
        let len = GetClassNameW(hwnd, &mut buf);
        if len > 0 {
            let class = String::from_utf16_lossy(&buf[..len as usize]).to_lowercase();
            if class.contains("chrome_renderwidgethosthwnd") {
                *found_ptr = Some(hwnd);
                return BOOL(0); // Found — stop enumeration
            }
        }
        BOOL(1) // Continue
    }

    let _ = EnumChildWindows(root, Some(enum_proc), LPARAM(found_ptr as isize));
    found
}

#[cfg(windows)]
unsafe fn do_inject(target: HWND, focus: HWND, text: &str) -> InjectResult {
    // Detect Chromium-based windows (Chrome_WidgetWin_1)
    let target_class = crate::context::read_class_name(target).to_lowercase();
    let is_chromium = target_class.contains("chrome_widgetwin");

    // ── 前台窗口校验 ──
    // 用户在 ASR / AI 处理期间可能切窗口（IM 弹通知、Cursor AI 面板、浏览器新标签等）。
    // 此时直接 Ctrl+V 会注入到错的窗口。处理：
    //   1. 如果 target 还是前台窗口 → 直接走正常注入
    //   2. 如果 target 是有效的（PID 还在）但不是前台 → 尝试 SetForegroundWindow 拉回来
    //   3. 如果 SetForegroundWindow 失败（被 Windows 拒绝）→ 返回 foreground_changed 让前端重新 probe
    let fg = GetForegroundWindow();
    let fg_pid: u32 = {
        let mut p = 0u32;
        GetWindowThreadProcessId(fg, Some(&mut p));
        p
    };
    let target_pid: u32 = {
        let mut p = 0u32;
        GetWindowThreadProcessId(target, Some(&mut p));
        p
    };
    if fg.0 != target.0 && target_pid != 0 {
        // target 进程还活着但不是前台
        let _ = SetForegroundWindow(target);
        std::thread::sleep(std::time::Duration::from_millis(30));
        let fg2 = GetForegroundWindow();
        if fg2.0 != target.0 {
            crate::commands::system::write_log_line(&format!(
                "[RUST] [inject] 前台窗口已切换: target={} (pid={}) fg={} (pid={}) — 无法拉回，注入可能错位",
                target.0 as isize, target_pid, fg.0 as isize, fg_pid
            ));
            // 仍然继续尝试注入（do_inject 内部的 force_foreground 会再试一次），
            // 但同时给前端一个信号 —— 通过 inject 失败，让前端重新 probe + 注入
        } else {
            crate::commands::system::write_log_line(&format!(
                "[RUST] [inject] 前台窗口已切换，已 SetForegroundWindow 拉回 target={}", target.0 as isize
            ));
        }
    }

    // Strategy 1: 直接发送 Ctrl+V（用户已经把焦点放在输入框了）
    let result = try_send_input_ctrl_v(target, text);
    if result.ok {
        return result;
    }

    // Strategy 2: SendInput Unicode 模式
    if let Some(result) = try_send_input_unicode(target, focus, text) {
        return result;
    }

    // Strategy 3: UI Automation ValuePattern
    if let Some(result) = try_uia_value_pattern(text) {
        return result;
    }

    // Strategy 4: WM_PASTE
    // For Chromium windows, find the actual render widget host child window
    // and send WM_PASTE there. Sending to the top-level Chrome_WidgetWin_1
    // does nothing — Chromium ignores it.
    let paste_target = if is_chromium {
        match find_chromium_render_widget(target) {
            Some(rwh) => {
                crate::commands::system::write_log_line(&format!(
                    "[RUST] [inject] found render widget host hwnd={} for target={}",
                    rwh.0 as isize, target.0 as isize
                ));
                rwh
            }
            None => {
                crate::commands::system::write_log_line(
                    "[RUST] [inject] chromium detected but no render widget host found"
                );
                // Fall back to focus or target
                if focus.0 != std::ptr::null_mut() { focus } else { target }
            }
        }
    } else {
        if focus.0 != std::ptr::null_mut() { focus } else { target }
    };

    if let Some(result) = try_wm_paste(paste_target, text, is_chromium) {
        return result;
    }

    try_send_input_ctrl_v(target, text)
}

/// Try UI Automation ValuePattern to set the value of the focused element
/// This works for web input fields in Chromium/Electron apps
#[cfg(windows)]
unsafe fn try_uia_value_pattern(text: &str) -> Option<InjectResult> {
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize,
        CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation,
        UIA_ValueValuePropertyId, UIA_IsValuePatternAvailablePropertyId,
        IUIAutomationValuePattern, IUIAutomationElement2,
    };

    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

    let uia: Result<IUIAutomation, _> = CoCreateInstance(
        &CUIAutomation,
        None,
        CLSCTX_INPROC_SERVER,
    );

    if let Ok(uia) = uia {
        if let Ok(element) = uia.GetFocusedElement() {
            // Cast to IUIAutomationElement2
            let element2: IUIAutomationElement2 = match element.cast() {
                Ok(e) => e,
                Err(_) => {
                    CoUninitialize();
                    return None;
                }
            };

            let vp_available = element.GetCurrentPropertyValue(UIA_IsValuePatternAvailablePropertyId)
                .ok()
                .and_then(|v| bool::try_from(&v).ok())
                .unwrap_or(false);

            crate::commands::system::write_log_line(&format!(
                "[RUST] [inject] UIA focused element, vp_available={}", vp_available
            ));

            if vp_available {
                let current_value = element.GetCurrentPropertyValue(UIA_ValueValuePropertyId)
                    .ok()
                    .and_then(|v| {
                        let bstr = windows::core::BSTR::try_from(&v).ok()?;
                        Some(bstr.to_string())
                    })
                    .unwrap_or_default();

                let pattern_unknown = element2.GetCurrentPattern(
                    windows::Win32::UI::Accessibility::UIA_ValuePatternId
                ).ok()?;

                let pattern: IUIAutomationValuePattern = match pattern_unknown.cast() {
                    Ok(p) => p,
                    Err(_) => {
                        CoUninitialize();
                        return None;
                    }
                };

                let new_value = format!("{}{}", current_value, text);
                let bstr = windows::core::BSTR::from(&new_value);

                if pattern.SetValue(&bstr).is_ok() {
                    crate::commands::system::write_log_line(&format!(
                        "[RUST] [inject] UIA ValuePattern success, textLen={}", text.len()
                    ));
                    CoUninitialize();
                    return Some(InjectResult {
                        ok: true,
                        strategy: Some("uia_value_pattern".to_string()),
                        reason: None,
                        detail: Some(format!("textLen={}", text.len())),
                        uncertain: false,
                    });
                } else {
                    crate::commands::system::write_log_line("[RUST] [inject] UIA SetValue failed");
                }
            }
        }
    }

    CoUninitialize();
    None
}

/// SendInput Unicode mode - this is how IME input methods work!
/// This bypasses secure input restrictions because it sends raw character events.
#[cfg(windows)]
unsafe fn try_send_input_unicode(target: HWND, focus: HWND, text: &str) -> Option<InjectResult> {
    let _fg_ok = force_foreground(target);
    release_modifiers();
    std::thread::sleep(std::time::Duration::from_millis(20));

    if focus != target && focus.0 != std::ptr::null_mut() {
        attach_and_set_focus(target, focus);
    }

    std::thread::sleep(std::time::Duration::from_millis(15));

    let mut sent = 0u32;
    let total_chars = text.chars().filter(|c| !c.is_control()).count();

    for c in text.chars() {
        if c.is_control() {
            continue;
        }

        let scan_code = c as u16;

        let mut down_input: INPUT = std::mem::zeroed();
        down_input.r#type = INPUT_KEYBOARD;
        down_input.Anonymous.ki = KEYBDINPUT {
            wVk: VIRTUAL_KEY(0),
            wScan: scan_code,
            dwFlags: KEYEVENTF_UNICODE,
            time: 0,
            dwExtraInfo: 0,
        };

        let mut up_input: INPUT = std::mem::zeroed();
        up_input.r#type = INPUT_KEYBOARD;
        up_input.Anonymous.ki = KEYBDINPUT {
            wVk: VIRTUAL_KEY(0),
            wScan: scan_code,
            dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
            time: 0,
            dwExtraInfo: 0,
        };

        let result = SendInput(&[down_input, up_input], std::mem::size_of::<INPUT>() as i32);
        if result >= 2 {
            sent += 1;
        }

        std::thread::sleep(std::time::Duration::from_micros(50));
    }

    release_modifiers();

    let last_error = if sent == 0 { GetLastError().0 } else { 0 };
    crate::commands::system::write_log_line(&format!(
        "[RUST] [inject] SendInput Unicode: sent={}/{} textLen={} GetLastError={}",
        sent, total_chars, text.len(), last_error
    ));

    if sent > 0 {
        Some(InjectResult {
            ok: true,
            strategy: Some("send_input_unicode".to_string()),
            reason: None,
            detail: Some(format!("sent={}/{} textLen={}", sent, total_chars, text.len())),
            uncertain: false,
        })
    } else {
        None
    }
}

/// Try WM_PASTE message
/// For Chromium windows, WM_PASTE success is unreliable (SendMessageTimeoutW
/// returns non-zero even when the paste didn't actually happen), so we mark
/// the result as uncertain instead of claiming success.
#[cfg(windows)]
unsafe fn try_wm_paste(target: HWND, text: &str, is_chromium: bool) -> Option<InjectResult> {
    let clipboard_ok = set_clipboard_with_retry(text, 5, 30);
    if !clipboard_ok {
        return None;
    }

    let focus_class = crate::context::read_class_name(target).to_lowercase();
    let try_wm_paste = focus_class.contains("edit")
        || focus_class.contains("richedit")
        || focus_class.contains("scintilla")
        || focus_class.contains("chrome_widgetwin")
        || focus_class.contains("chrome_renderwidgethosthwnd")
        || focus_class.contains("mozilla");

    if !try_wm_paste {
        return None;
    }

    crate::commands::system::write_log_line(&format!(
        "[RUST] [inject] WM_PASTE attempt hwnd={} class={} textLen={} isChromium={}",
        target.0 as isize, focus_class, text.len(), is_chromium
    ));

    let mut result_val: usize = 0;
    let send_ok = SendMessageTimeoutW(
        target,
        WM_PASTE,
        windows::Win32::Foundation::WPARAM(0),
        windows::Win32::Foundation::LPARAM(0),
        SMTO_ABORTIFHUNG,
        2000,
        Some(&mut result_val),
    );

    if send_ok.0 != 0 {
        crate::commands::system::write_log_line(&format!(
            "[RUST] [inject] WM_PASTE delivered hwnd={} class={}",
            target.0 as isize, focus_class
        ));
        // Chrome_RenderWidgetHostHWND is the actual rendering surface in
        // Chromium apps — WM_PASTE sent here is meaningful (unlike the
        // top-level Chrome_WidgetWin_1 which ignores it).
        // We still mark it uncertain because we can't verify the paste
        // actually happened, but we don't block the fallback flow.
        let is_render_widget = focus_class.contains("chrome_renderwidgethosthwnd");
        if is_chromium && !is_render_widget {
            // Sent to the Chromium main window — known to be unreliable
            return None;
        }
        Some(InjectResult {
            ok: true,
            strategy: Some("wm_paste".to_string()),
            reason: None,
            detail: Some(format!("hwnd={} textLen={}", target.0 as isize, text.len())),
            uncertain: is_chromium,
        })
    } else {
        None
    }
}

/// Fallback: clipboard + SendInput Ctrl+V
/// If SendInput returns 0 (which happens in some Chromium/Electron contexts
/// for reasons that don't set GetLastError), falls back to keybd_event.
#[cfg(windows)]
unsafe fn try_send_input_ctrl_v(target: HWND, text: &str) -> InjectResult {
    let clipboard_ok = set_clipboard_with_retry(text, 5, 30);
    if !clipboard_ok {
        return InjectResult {
            ok: false,
            strategy: Some("clipboard".to_string()),
            reason: Some("clipboard_write_failed".to_string()),
            detail: Some("failed after 5 retries".to_string()),
            uncertain: false,
        };
    }

    // 在 send Ctrl+V 前先把焦点拉回 target。
    // IM/通知弹窗、Cursor AI 面板等会在 ASR/AI 处理期间偷偷夺走前台焦点
    // —— 用户感知不到，但 SendInput 会注入到错的地方。
    let _ = force_foreground(target);

    // 直接发送 Ctrl+V 到前台窗口（用户已经把焦点放在输入框了）
    release_modifiers();
    std::thread::sleep(std::time::Duration::from_millis(20));

    // 获取前台窗口信息
    let fg_window = GetForegroundWindow();
    crate::commands::system::write_log_line(&format!(
        "[RUST] [inject] Ctrl+V: fg_window={} target={}",
        fg_window.0 as isize, target.0 as isize
    ));

    let vk_ctrl = VIRTUAL_KEY(0x11);
    let vk_v = VIRTUAL_KEY(0x56);
    let inputs = [
        make_key_input(vk_ctrl, KEYBD_EVENT_FLAGS(0)),
        make_key_input(vk_v, KEYBD_EVENT_FLAGS(0)),
        make_key_input(vk_v, KEYEVENTF_KEYUP),
        make_key_input(vk_ctrl, KEYEVENTF_KEYUP),
    ];

    let input_size = std::mem::size_of::<INPUT>() as i32;
    let sent = SendInput(&inputs, input_size);

    let last_error = if sent == 0 { GetLastError().0 } else { 0 };
    crate::commands::system::write_log_line(&format!(
        "[RUST] [inject] SendInput result: sent={}/{} inputSize={} textLen={} GetLastError={}",
        sent, inputs.len(), input_size, text.len(), last_error
    ));

    std::thread::sleep(std::time::Duration::from_millis(30));
    release_modifiers();

    // If SendInput returned 0 with no error, try keybd_event (legacy API)
    // This works in some cases where SendInput silently fails.
    if sent == 0 {
        crate::commands::system::write_log_line("[RUST] [inject] SendInput failed, trying keybd_event fallback");
        let ke_ok = keybd_event_ctrl_v();
        crate::commands::system::write_log_line(&format!(
            "[RUST] [inject] keybd_event result: ok={}", ke_ok
        ));
        std::thread::sleep(std::time::Duration::from_millis(10));
        release_modifiers();

        if ke_ok {
            return InjectResult {
                ok: true,
                strategy: Some("keybd_event_ctrl_v".to_string()),
                reason: None,
                detail: Some(format!("target={} textLen={}", target.0 as isize, text.len())),
                uncertain: true,
            };
        }
    }

    let detail = format!(
        "sent={} target={} textLen={}",
        sent, target.0 as isize, text.len()
    );

    InjectResult {
        ok: sent >= 4,
        strategy: Some("send_input_ctrl_v".to_string()),
        reason: if sent >= 4 { None } else { Some("send_input_short_write".to_string()) },
        detail: Some(detail),
        uncertain: false,
    }
}

/// Legacy keybd_event API — sometimes works when SendInput silently returns 0.
/// Deprecated by Microsoft but still functional.
#[cfg(windows)]
unsafe fn keybd_event_ctrl_v() -> bool {
    #[link(name = "user32")]
    extern "system" {
        fn keybd_event(b_vk: u8, b_scan: u8, dw_flags: u32, dw_extra_info: usize);
    }

    const KEYEVENTF_KEYUP: u32 = 0x0002;

    // Ctrl down
    keybd_event(0x11, 0, 0, 0);
    // V down
    keybd_event(0x56, 0, 0, 0);
    // V up
    keybd_event(0x56, 0, KEYEVENTF_KEYUP, 0);
    // Ctrl up
    keybd_event(0x11, 0, KEYEVENTF_KEYUP, 0);
    true
}

// ─── Window activation helpers ───

#[cfg(windows)]
unsafe fn force_foreground(target: HWND) -> bool {
    #[link(name = "user32")]
    extern "system" {
        fn AttachThreadInput(id_attach: u32, id_attach_to: u32, f_attach: i32) -> i32;
        fn BringWindowToTop(hwnd: HWND) -> i32;
        fn ShowWindow(hwnd: HWND, n_cmd_show: i32) -> i32;
    }
    const SW_SHOW: i32 = 5;

    let my_tid = GetCurrentThreadId();
    let mut pid: u32 = 0;
    let target_tid = GetWindowThreadProcessId(target, Some(&mut pid));

    let attached = if target_tid != 0 && target_tid != my_tid {
        AttachThreadInput(my_tid, target_tid, 1) != 0
    } else {
        false
    };

    let f24_down = make_key_input(VIRTUAL_KEY(0x87), KEYBD_EVENT_FLAGS(0));
    let f24_up = make_key_input(VIRTUAL_KEY(0x87), KEYEVENTF_KEYUP);
    let _ = SendInput(&[f24_down, f24_up], std::mem::size_of::<INPUT>() as i32);

    let _ = ShowWindow(target, SW_SHOW);
    let _ = BringWindowToTop(target);
    let _ = SetForegroundWindow(target);
    std::thread::sleep(std::time::Duration::from_millis(50));

    let fg_ok = GetForegroundWindow() == target;
    if !fg_ok {
        let _ = SetForegroundWindow(target);
        std::thread::sleep(std::time::Duration::from_millis(30));
    }

    if attached {
        AttachThreadInput(my_tid, target_tid, 0);
    }

    GetForegroundWindow() == target
}

#[cfg(windows)]
unsafe fn attach_and_set_focus(target: HWND, focus: HWND) {
    #[link(name = "user32")]
    extern "system" {
        fn AttachThreadInput(id_attach: u32, id_attach_to: u32, f_attach: i32) -> i32;
    }

    let my_tid = GetCurrentThreadId();
    let mut pid: u32 = 0;
    let target_tid = GetWindowThreadProcessId(target, Some(&mut pid));
    let attached = if target_tid != 0 && target_tid != my_tid {
        AttachThreadInput(my_tid, target_tid, 1) != 0
    } else {
        false
    };

    use windows::Win32::UI::Input::KeyboardAndMouse::SetFocus;
    let _ = SetFocus(focus);
    std::thread::sleep(std::time::Duration::from_millis(10));

    if attached {
        AttachThreadInput(my_tid, target_tid, 0);
    }
}

// ─── Key input helpers ───

#[cfg(windows)]
fn make_key_input(vk: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    // Use zeroed() to ensure ALL bytes (including padding and unused union members)
    // are initialized. Uninitialized padding bytes can cause SendInput to return 0.
    let mut input: INPUT = unsafe { std::mem::zeroed() };
    input.r#type = INPUT_KEYBOARD;
    input.Anonymous.ki = KEYBDINPUT {
        wVk: vk,
        wScan: 0,
        dwFlags: flags,
        time: 0,
        dwExtraInfo: 0,
    };
    input
}

#[cfg(windows)]
unsafe fn release_modifiers() {
    let modifiers: [u16; 6] = [0xA4, 0xA5, 0xA0, 0xA1, 0xA2, 0xA3];
    let inputs: Vec<INPUT> = modifiers.iter().map(|&vk| {
        make_key_input(VIRTUAL_KEY(vk), KEYEVENTF_KEYUP)
    }).collect();
    let sent = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    if sent == 0 {
        crate::commands::system::write_log_line(&format!(
            "[RUST] [inject] release_modifiers SendInput returned 0, GetLastError={}",
            GetLastError().0
        ));
    }
}

// ─── Clipboard helpers ───

#[cfg(windows)]
unsafe fn set_clipboard_with_retry(text: &str, max_retries: u32, retry_delay_ms: u64) -> bool {
    for attempt in 0..max_retries {
        if native_set_clipboard_text(text) { return true; }
        if attempt < max_retries - 1 {
            std::thread::sleep(std::time::Duration::from_millis(retry_delay_ms));
        }
    }
    false
}

#[cfg(windows)]
unsafe fn native_set_clipboard_text(text: &str) -> bool {
    if OpenClipboard(HWND(std::ptr::null_mut())).is_err() { return false; }

    let result = (|| -> bool {
        let _ = EmptyClipboard();
        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        let byte_len = wide.len() * 2;

        let hmem = match GlobalAlloc(GMEM_MOVEABLE, byte_len) {
            Ok(h) => h,
            Err(_) => return false,
        };

        let locked = GlobalLock(hmem);
        if locked.is_null() { return false; }

        std::ptr::copy_nonoverlapping(wide.as_ptr() as *const u8, locked as *mut u8, byte_len);
        let _ = GlobalUnlock(hmem);

        SetClipboardData(13, HANDLE(hmem.0 as *mut _)).is_ok()
    })();

    let _ = CloseClipboard();
    result
}

#[cfg(windows)]
pub unsafe fn set_clipboard_with_retry_pub(text: &str, max_retries: u32, retry_delay_ms: u64) -> bool {
    set_clipboard_with_retry(text, max_retries, retry_delay_ms)
}
