//! 集中式应用路径常量
//!
//! 所有 Rust 代码通过这个模块获取应用数据目录、日志目录、音频目录等。
//! 严禁在任何其他位置硬编码 `"com.saydone.app"` 字符串。

use std::path::PathBuf;

/// 应用在 `dirs::data_local_dir()` 下的子目录名（macOS / Linux 对应 `~/Library/Application Support`、
/// Windows 对应 `%LOCALAPPDATA%`）。
pub const APP_DIR: &str = "com.saydone.app";

/// 应用数据根目录（`data_local_dir/APP_DIR`）。
pub fn app_root() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir().ok_or_else(|| "无法解析 data_local_dir".to_string())?;
    Ok(base.join(APP_DIR))
}

/// 日志文件目录（`app_root/logs`）。
pub fn log_dir() -> Result<PathBuf, String> {
    Ok(app_root()?.join("logs"))
}

/// 日志文件路径（`log_dir/saydone.log`）。
pub fn log_file() -> Result<PathBuf, String> {
    Ok(log_dir()?.join("saydone.log"))
}

/// SQLite 数据库路径（`app_root/saydone.db`）。
pub fn db_file() -> Result<PathBuf, String> {
    Ok(app_root()?.join("saydone.db"))
}

/// 录音文件目录（`app_root/audio`）。
pub fn audio_dir() -> Result<PathBuf, String> {
    Ok(app_root()?.join("audio"))
}

/// RAG 模型目录（`app_root/models`）。
pub fn models_dir() -> Result<PathBuf, String> {
    Ok(app_root()?.join("models"))
}

/// 诊断导出目录（`app_root/diagnostics`）。
pub fn diagnostics_dir() -> Result<PathBuf, String> {
    Ok(app_root()?.join("diagnostics"))
}

/// 全局配置目录（`app_root/config`）。
pub fn config_dir() -> Result<PathBuf, String> {
    Ok(app_root()?.join("config"))
}