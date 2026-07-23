//! 选区捕获：读取当前焦点应用中的选中文字。
//!
//! 策略：
//! 1. **首选 UIA**：Windows UI Automation 的 `IUIAutomationTextPattern::GetSelection()`，
//!    不依赖剪贴板、不会污染用户的剪贴板内容。
//!    适用：现代应用（Edge/Chrome/Firefox、VSCode、Notepad、Office 等）。
//! 2. **降级剪贴板**：UIA 失败 / 选区为空 → 模拟 Ctrl+C 把选区拷到剪贴板，读取后再恢复原剪贴板。
//!    适用：未实现 UIA TextPattern 的老 WPF/Win32 控件、Electron 自定义编辑区、PDF 阅读器等。
//!
//! 任何阶段失败都返回 `available=false`，前端退回普通 AI 对话流程。

use serde::Serialize;
use windows::core::Interface;

#[cfg(windows)]
use windows::Win32::Foundation::HANDLE;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
    VIRTUAL_KEY, KEYBD_EVENT_FLAGS,
};
#[cfg(windows)]
use windows::Win32::System::DataExchange::{
    OpenClipboard, CloseClipboard, EmptyClipboard, SetClipboardData,
    GetClipboardData,
};
#[cfg(windows)]
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

#[derive(Debug, Clone, Serialize, Default)]
pub struct SelectionCapture {
    /// 选中的纯文本（首块；多块选区只取第一块）
    #[serde(rename = "text")]
    pub text: String,
    /// 选区所在窗口的 hwnd（用于后续"重新选中 + 替换"）
    #[serde(rename = "hwnd")]
    pub hwnd: String,
    /// 焦点元素的 ControlType（Document/Edit/Text 等）
    #[serde(rename = "controlType")]
    pub control_type: String,
    /// AutomationId（用于排查）
    #[serde(rename = "automationId")]
    pub automation_id: String,
    /// 选区字数（>8000 时前端放弃）
    #[serde(rename = "length")]
    pub length: usize,
    /// 是否有可用的选区文本
    /// false 时前端应当退回普通 AI 对话路径
    #[serde(rename = "available")]
    pub available: bool,
    /// 选区来源：`"uia"` / `"clipboard"` / `""`（失败时）
    #[serde(rename = "source")]
    pub source: String,
}

#[cfg(windows)]
pub fn capture_selection() -> SelectionCapture {
    // 先 UIA；失败/空 → 降级剪贴板
    match capture_selection_via_uia() {
        Ok(cap) if cap.available => cap,
        _ => capture_selection_via_clipboard().unwrap_or_else(|e| {
            log::debug!("[selection] clipboard fallback failed: {}", e);
            SelectionCapture::default()
        }),
    }
}

#[cfg(windows)]
fn capture_selection_via_uia() -> Result<SelectionCapture, String> {
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize,
        CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        IUIAutomation, IUIAutomationTextPattern,
        UIA_TextPatternId, UIA_ControlTypePropertyId, UIA_AutomationIdPropertyId,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    use windows::Win32::UI::Accessibility::CUIAutomation;

    let co_init_result = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let need_co_uninit = co_init_result.is_ok();

    let result = (|| -> Result<SelectionCapture, String> {
        let uia: IUIAutomation = unsafe {
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| format!("CoCreateInstance CUIAutomation: {}", e))?
        };

        let focused = unsafe {
            uia.GetFocusedElement()
                .map_err(|e| format!("GetFocusedElement: {}", e))?
        };

        // ControlType (int → string)
        let mut control_type = String::new();
        if let Ok(v) = unsafe { focused.GetCurrentPropertyValue(UIA_ControlTypePropertyId) } {
            if let Ok(ct_id) = i32::try_from(&v) {
                control_type = control_type_name(ct_id).to_string();
            }
        }

        // AutomationId
        let mut automation_id = String::new();
        if let Ok(v) = unsafe { focused.GetCurrentPropertyValue(UIA_AutomationIdPropertyId) } {
            if let Ok(bstr) = windows::core::BSTR::try_from(&v) {
                automation_id = bstr.to_string();
            }
        }

        // 拿 TextPattern（很多老控件/canvas-based 编辑器没有 → 这里会抛 → 降级剪贴板）
        let pattern_obj = unsafe {
            focused.GetCurrentPattern(UIA_TextPatternId)
                .map_err(|e| format!("GetCurrentPattern(TextPattern): {}", e))?
        };
        let text_pattern: IUIAutomationTextPattern = pattern_obj
            .cast()
            .map_err(|e| format!("cast IUIAutomationTextPattern: {}", e))?;

        // 拿选区集合（多块取第一块）
        let selection_ranges = unsafe {
            text_pattern.GetSelection()
                .map_err(|e| format!("GetSelection: {}", e))?
        };
        let count = unsafe { selection_ranges.Length() }.unwrap_or(0);
        if count <= 0 {
            return Ok(SelectionCapture {
                available: false,
                control_type,
                automation_id,
                source: "uia".to_string(),
                ..Default::default()
            });
        }
        let first_range = unsafe { selection_ranges.GetElement(0) }
            .map_err(|e| format!("GetElement(0): {}", e))?;

        // 读文本（-1 表示整段）
        let bstr = unsafe { first_range.GetText(-1) }
            .map_err(|e| format!("GetText: {}", e))?;
        let text = bstr.to_string();

        // 拿焦点窗口 hwnd（用 foreground window 作为选区所在窗口的近似标识）
        let foreground = unsafe { GetForegroundWindow() };
        let hwnd = if foreground.0.is_null() {
            String::new()
        } else {
            format!("{}", foreground.0 as isize)
        };

        Ok(SelectionCapture {
            length: text.chars().count(),
            text,
            hwnd,
            control_type,
            automation_id,
            available: true,
            source: "uia".to_string(),
        })
    })();

    if need_co_uninit {
        unsafe { CoUninitialize() };
    }

    result
}

/// 降级方案：模拟 Ctrl+C → 读剪贴板 → 恢复原剪贴板。
///
/// 大多数 Windows 应用（包括不支持 UIA TextPattern 的）都支持 Ctrl+C 复制选区。
/// 副作用：会临时覆盖用户剪贴板；恢复失败时用户剪贴板被替换为选中文本（用户最可能复制的就是它）。
#[cfg(windows)]
fn capture_selection_via_clipboard() -> Result<SelectionCapture, String> {
    use windows::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED,
    };

    crate::commands::system::write_log_line("[RUST] [selection] UIA 不可用，降级到剪贴板方案");

    let co_init_result = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let need_co_uninit = co_init_result.is_ok();

    // 1) 备份当前剪贴板（如果可读）
    let saved_clipboard = unsafe { read_clipboard_text() };

    // 2) 模拟 Ctrl+C
    let copy_ok = unsafe { send_ctrl_c() };
    if !copy_ok {
        if need_co_uninit { unsafe { CoUninitialize() }; }
        return Err("SendInput Ctrl+C 失败".to_string());
    }

    // 3) 等一小段时间让剪贴板更新
    std::thread::sleep(std::time::Duration::from_millis(80));

    // 4) 读剪贴板
    let text = unsafe { read_clipboard_text() }.unwrap_or_default();

    // 5) 恢复原剪贴板（如果备份成功）；失败也没关系 —— 用户大概率就是要用选区
    if let Some(prev) = saved_clipboard {
        let _ = unsafe { write_clipboard_text(&prev) };
    } else {
        // 没有可恢复内容：清空剪贴板（避免残留 Ctrl+C 的结果）
        let _ = unsafe { clear_clipboard() };
    }

    if need_co_uninit {
        unsafe { CoUninitialize() };
    }

    if text.trim().is_empty() {
        crate::commands::system::write_log_line("[RUST] [selection] 剪贴板方案：复制后剪贴板仍为空");
        return Ok(SelectionCapture {
            available: false,
            source: "clipboard".to_string(),
            ..Default::default()
        });
    }

    let foreground = unsafe { GetForegroundWindow() };
    let hwnd = if foreground.0.is_null() {
        String::new()
    } else {
        format!("{}", foreground.0 as isize)
    };

    crate::commands::system::write_log_line(&format!(
        "[RUST] [selection] 剪贴板方案：成功，len={}",
        text.chars().count()
    ));

    Ok(SelectionCapture {
        length: text.chars().count(),
        text,
        hwnd,
        control_type: "Clipboard".to_string(),
        automation_id: String::new(),
        available: true,
        source: "clipboard".to_string(),
    })
}

#[cfg(windows)]
unsafe fn send_ctrl_c() -> bool {
    // 0x11 = VK_CONTROL, 0x43 = 'C'
    let vk_ctrl = VIRTUAL_KEY(0x11);
    let vk_c = VIRTUAL_KEY(0x43);

    let ctrl_down = make_key_input(vk_ctrl, KEYBD_EVENT_FLAGS(0));
    let c_down = make_key_input(vk_c, KEYBD_EVENT_FLAGS(0));
    let c_up = make_key_input(vk_c, KEYEVENTF_KEYUP);
    let ctrl_up = make_key_input(vk_ctrl, KEYEVENTF_KEYUP);

    let arr = [ctrl_down, c_down, c_up, ctrl_up];
    let sent = SendInput(&arr, std::mem::size_of::<INPUT>() as i32);
    sent == arr.len() as u32
}

#[cfg(windows)]
fn make_key_input(vk: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS) -> INPUT {
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
unsafe fn read_clipboard_text() -> Option<String> {
    use windows::Win32::System::Memory::GlobalLock;
    use windows::Win32::Foundation::{HGLOBAL, HWND};

    if OpenClipboard(HWND(std::ptr::null_mut())).is_err() {
        return None;
    }
    let result = (|| -> Option<String> {
        // 优先 CF_UNICODETEXT (13) → CF_TEXT (1) 兜底
        for format in [13u32, 1u32] {
            if let Ok(h) = GetClipboardData(format) {
                if !h.0.is_null() {
                    // GetClipboardData 返回 HANDLE，GlobalLock 需要 HGLOBAL
                    let hg = HGLOBAL(h.0);
                    let ptr = GlobalLock(hg);
                    if !ptr.is_null() {
                        let text = if format == 13 {
                            // UTF-16LE, null-terminated
                            read_wide_string(ptr as *const u16)
                        } else {
                            // ANSI / UTF-8, null-terminated
                            std::ffi::CStr::from_ptr(ptr as *const i8)
                                .to_string_lossy()
                                .into_owned()
                        };
                        let _ = GlobalUnlock(hg);
                        if !text.is_empty() {
                            return Some(text);
                        }
                    }
                }
            }
        }
        None
    })();
    let _ = CloseClipboard();
    result
}

#[cfg(windows)]
unsafe fn read_wide_string(ptr: *const u16) -> String {
    let mut len = 0;
    while *ptr.add(len) != 0 { len += 1; }
    let slice = std::slice::from_raw_parts(ptr, len);
    String::from_utf16_lossy(slice)
}

#[cfg(windows)]
unsafe fn write_clipboard_text(text: &str) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;

    if OpenClipboard(HWND(std::ptr::null_mut())).is_err() {
        return Err("OpenClipboard 失败".to_string());
    }
    let r = (|| -> Result<(), String> {
        EmptyClipboard().map_err(|e| format!("EmptyClipboard: {}", e))?;
        // 用 CF_UNICODETEXT (13) 保证中文不丢
        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        let byte_len = wide.len() * 2;

        let hmem = GlobalAlloc(GMEM_MOVEABLE, byte_len)
            .map_err(|e| format!("GlobalAlloc: {}", e))?;
        if hmem.0.is_null() { return Err("GlobalAlloc 返回 null".to_string()); }

        let locked = GlobalLock(hmem);
        if locked.is_null() { return Err("GlobalLock 返回 null".to_string()); }
        std::ptr::copy_nonoverlapping(wide.as_ptr() as *const u8, locked as *mut u8, byte_len);
        let _ = GlobalUnlock(hmem);

        SetClipboardData(13, HANDLE(hmem.0 as *mut _))
            .map_err(|e| format!("SetClipboardData: {}", e))?;
        Ok(())
    })();
    let _ = CloseClipboard();
    r
}

#[cfg(windows)]
unsafe fn clear_clipboard() -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    if OpenClipboard(HWND(std::ptr::null_mut())).is_err() {
        return Err("OpenClipboard 失败".to_string());
    }
    let r = EmptyClipboard().map_err(|e| format!("EmptyClipboard: {}", e));
    let _ = CloseClipboard();
    r
}

#[cfg(windows)]
fn control_type_name(id: i32) -> &'static str {
    match id {
        50004 => "Edit",
        50020 => "Text",
        50030 => "Document",
        50033 => "Pane",
        _ => "Unknown",
    }
}

#[cfg(not(windows))]
pub fn capture_selection() -> SelectionCapture {
    SelectionCapture::default()
}
