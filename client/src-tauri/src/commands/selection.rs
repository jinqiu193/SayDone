//! 选区命令：暴露 `capture_selection` 给前端调用。

use crate::context::selection::SelectionCapture;

#[tauri::command]
pub fn capture_selection() -> SelectionCapture {
    crate::context::selection::capture_selection()
}
