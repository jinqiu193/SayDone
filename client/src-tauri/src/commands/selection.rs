//! 选区命令：暴露 `capture_selection` 给前端调用。

use crate::context::selection::{capture_selection as capture_selection_impl, SelectionCapture};

/// 通过 UI Automation 读取当前焦点应用中的选中文字。
/// 不修改剪贴板、不发送 Ctrl+C。
#[tauri::command]
pub fn capture_selection() -> SelectionCapture {
    capture_selection_impl()
}
