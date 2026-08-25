// GGUF ASR 推理 — 通过 FunASR llama.cpp 运行时 (llama-funasr-sensevoice)
// 使用子进程调用 CLI 二进制，适合 GGUF 格式的 SenseVoice / Paraformer 模型

use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use super::downloader::model_dir;

#[derive(Debug, Clone, Serialize)]
pub struct GgufAsrResult {
    pub text: String,
    pub elapsed_ms: u64,
}

/// 带自动清理的临时 WAV 文件
struct TempWav {
    path: PathBuf,
}
impl Drop for TempWav {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}
impl TempWav {
    fn path(&self) -> &Path {
        &self.path
    }
}

/// CLI 二进制路径缓存，避免每次都查找
pub(crate) struct CliBinaryCache {
    pub sensevoice_cli: PathBuf,
}

unsafe impl Send for CliBinaryCache {}

static CLI_CACHE: Mutex<Option<CliBinaryCache>> = Mutex::new(None);

/// 获取 llama-funasr-sensevoice 二进制路径
/// 查找顺序：
///   1. 环境变量 FUNASR_LLAMACPP_BIN
///   2. 应用资源目录 (resources/)
///   3. PATH 环境变量
pub fn resolve_sensevoice_cli() -> Result<PathBuf, String> {
    // 1) 缓存命中
    if let Some(ref c) = *CLI_CACHE.lock().unwrap() {
        if c.sensevoice_cli.exists() {
            return Ok(c.sensevoice_cli.clone());
        }
    }

    let binary_name = if cfg!(windows) {
        "llama-funasr-sensevoice.exe"
    } else {
        "llama-funasr-sensevoice"
    };

    // 2) 环境变量
    if let Ok(p) = std::env::var("FUNASR_LLAMACPP_BIN") {
        let pb = PathBuf::from(p);
        if pb.exists() {
            let mut cache = CLI_CACHE.lock().unwrap();
            *cache = Some(CliBinaryCache {
                sensevoice_cli: pb.clone(),
            });
            return Ok(pb);
        }
    }

    // 3) 应用 resources 目录 (开发环境)
    if let Ok(res_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let candidate = PathBuf::from(res_dir).join("resources").join(binary_name);
        if candidate.exists() {
            let mut cache = CLI_CACHE.lock().unwrap();
            *cache = Some(CliBinaryCache {
                sensevoice_cli: candidate.clone(),
            });
            return Ok(candidate);
        }
    }

    // 3b) 用户指定目录 (E:\SayIt-main\...\SenseVoiceHotkey-v1.0)
    let sensevoice_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("SenseVoiceHotkey-v1.0");
    let candidate = sensevoice_dir.join(binary_name);
    if candidate.exists() {
        let mut cache = CLI_CACHE.lock().unwrap();
        *cache = Some(CliBinaryCache {
            sensevoice_cli: candidate.clone(),
        });
        return Ok(candidate);
    }
    let model_candidate = sensevoice_dir.join("sensevoice-small-q8.gguf");
    if model_candidate.exists() {
        let cli_from_model_dir = sensevoice_dir.join(binary_name);
        if cli_from_model_dir.exists() {
            let mut cache = CLI_CACHE.lock().unwrap();
            *cache = Some(CliBinaryCache {
                sensevoice_cli: cli_from_model_dir.clone(),
            });
            return Ok(cli_from_model_dir);
        }
    }

    // Linux AppImage
    if let Ok(res_dir) = std::env::var("APPDIR") {
        let candidate = PathBuf::from(res_dir)
            .join("resources")
            .join(binary_name);
        if candidate.exists() {
            let mut cache = CLI_CACHE.lock().unwrap();
            *cache = Some(CliBinaryCache {
                sensevoice_cli: candidate.clone(),
            });
            return Ok(candidate);
        }
    }

    // Windows / macOS: 可执行文件同级 resources 目录
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidate = parent.join("resources").join(binary_name);
            if candidate.exists() {
                let mut cache = CLI_CACHE.lock().unwrap();
                *cache = Some(CliBinaryCache {
                    sensevoice_cli: candidate.clone(),
                });
                return Ok(candidate);
            }
        }
    }

    // 4) PATH
    if let Ok(paths) = std::env::var("PATH") {
        for p in std::env::split_paths(&paths) {
            let candidate = p.join(binary_name);
            if candidate.exists() {
                let mut cache = CLI_CACHE.lock().unwrap();
                *cache = Some(CliBinaryCache {
                    sensevoice_cli: candidate.clone(),
                });
                return Ok(candidate);
            }
        }
    }

    Err(format!(
        "未找到 FunASR llama.cpp 运行时 ({}). 请从 https://github.com/modelscope/FunASR/releases 下载 runtime-llamacpp 包，解压后把二进制放入 resources/ 目录，或设置环境变量 FUNASR_LLAMACPP_BIN",
        binary_name
    ))
}

/// 获取 SenseVoiceHotkey-v1.0 目录（如果有）
fn sensevoice_hotkey_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("SenseVoiceHotkey-v1.0")
}

/// 解析 GGUF 模型文件路径（支持多种文件名）
fn resolve_model_file(dir: &Path) -> Result<PathBuf, String> {
    let candidates = [
        "sensevoice-small-q8.gguf",
        "sensevoice-small-f16.gguf",
        "sensevoice-small-q8_0.gguf",
        "SenseVoiceSmall-q8.gguf",
        "SenseVoiceSmall-f16.gguf",
        "sensevoice.gguf",
    ];

    let search_dirs: Vec<PathBuf> = if dir.to_string_lossy().contains("sensevoice-small-gguf") {
        vec![dir.to_path_buf(), sensevoice_hotkey_dir()]
    } else {
        vec![dir.to_path_buf()]
    };

    for search_dir in search_dirs {
        if !search_dir.exists() {
            continue;
        }
        for name in &candidates {
            let p = search_dir.join(name);
            if p.exists() {
                return Ok(p);
            }
        }
        if let Ok(entries) = std::fs::read_dir(search_dir) {
            let mut found: Option<PathBuf> = None;
            for entry in entries.flatten() {
                let path = entry.path();
                let is_gguf = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.eq_ignore_ascii_case("gguf"))
                    .unwrap_or(false);
                if !is_gguf {
                    continue;
                }
                let filename = path
                    .file_name()
                    .and_then(|f| f.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if filename.contains("vad") {
                    continue;
                }
                if filename.contains("sensevoice") {
                    return Ok(path);
                }
                if found.is_none() {
                    found = Some(path);
                }
            }
            if let Some(p) = found {
                return Ok(p);
            }
        }
    }
    Err("GGUF 模型文件不存在 (期望 sensevoice-small-q8.gguf)".into())
}

/// 解析 VAD 模型路径（fsmn-vad.gguf）
fn resolve_vad_file(dir: &Path) -> Option<PathBuf> {
    let candidates = [
        "fsmn-vad.gguf",
        "fsmn-vad-q8.gguf",
        "fsmn-vad-f16.gguf",
    ];

    let search_dirs: Vec<PathBuf> = if dir.to_string_lossy().contains("sensevoice-small-gguf") {
        vec![dir.to_path_buf(), sensevoice_hotkey_dir()]
    } else {
        vec![dir.to_path_buf()]
    };

    for search_dir in search_dirs {
        if !search_dir.exists() {
            continue;
        }
        for name in &candidates {
            let p = search_dir.join(name);
            if p.exists() {
                return Some(p);
            }
        }
        if let Ok(entries) = std::fs::read_dir(search_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let is_gguf = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.eq_ignore_ascii_case("gguf"))
                    .unwrap_or(false);
                if !is_gguf {
                    continue;
                }
                let filename = path
                    .file_name()
                    .and_then(|f| f.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if filename.contains("vad") {
                    return Some(path);
                }
            }
        }
    }
    None
}

/// 写入 WAV 文件 (16kHz, 16-bit PCM, mono)
fn write_pcm_wav(path: &Path, samples: &[f32]) -> Result<(), String> {
    let num_samples = samples.len() as u32;
    let byte_rate = 16000u32 * 2;
    let data_size = num_samples * 2;
    let file_size = 36u32 + data_size;

    let mut file = std::fs::File::create(path)
        .map_err(|e| format!("创建 WAV 文件失败: {}", e))?;

    // RIFF header
    file.write_all(b"RIFF")
        .and_then(|_| file.write_all(&file_size.to_le_bytes()))
        .and_then(|_| file.write_all(b"WAVE"))
        .and_then(|_| file.write_all(b"fmt "))
        .and_then(|_| file.write_all(&16u32.to_le_bytes()))
        .and_then(|_| file.write_all(&1u16.to_le_bytes())) // PCM
        .and_then(|_| file.write_all(&1u16.to_le_bytes())) // mono
        .and_then(|_| file.write_all(&16000u32.to_le_bytes()))
        .and_then(|_| file.write_all(&byte_rate.to_le_bytes()))
        .and_then(|_| file.write_all(&2u16.to_le_bytes())) // block align
        .and_then(|_| file.write_all(&16u16.to_le_bytes())) // bits
        .and_then(|_| file.write_all(b"data"))
        .and_then(|_| file.write_all(&data_size.to_le_bytes()))
        .map_err(|e| format!("写入 WAV header 失败: {}", e))?;

    for s in samples {
        let pcm = (s.clamp(-1.0, 1.0) * 32768.0) as i16;
        file.write_all(&pcm.to_le_bytes())
            .map_err(|e| format!("写入 PCM 数据失败: {}", e))?;
    }
    Ok(())
}

/// 创建带自动清理的临时 WAV
fn create_temp_wav(samples: &[f32]) -> Result<TempWav, String> {
    let tmp_dir = std::env::temp_dir();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let wav_path = tmp_dir.join(format!("saydone_gguf_{}.wav", ts));

    write_pcm_wav(&wav_path, samples)?;

    Ok(TempWav { path: wav_path })
}

/// 从 llama-funasr-sensevoice 输出中提取纯识别文本
///
/// 输出格式示例:
///   "哭什么哭啊 [sensevoice] 1 vad segments [sensevoice] done 0.52s"
///   "我有什么好哭的？ [sensevoice] 1 vad segments [sensevoice] done 0.44s"
///
/// 策略: 用 "[sensevoice]" 分割，每行取第一个片段（即实际语音文本），忽略元数据
fn extract_sensevoice_text(stdout: &str, stderr: &str) -> String {
    let raw = if stdout.trim().is_empty() { stderr } else { stdout };

    if raw.trim().is_empty() {
        return String::new();
    }

    let mut parts: Vec<String> = Vec::new();

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // 按 "[sensevoice]" 分割，取第一段（语音文本），忽略后面的元数据
        let utterance = line.split("[sensevoice]").next().unwrap_or(line).trim();

        if !utterance.is_empty() {
            parts.push(utterance.to_string());
        }
    }

    if parts.is_empty() {
        return String::new();
    }

    parts.join(" ")
}

/// 执行 llama-funasr-sensevoice 进行转写
pub fn transcribe_sensevoice_gguf(
    model_id: &str,
    samples: &[f32],
    _language: Option<&str>,
) -> Result<GgufAsrResult, String> {
    let start = Instant::now();
    let cli = resolve_sensevoice_cli()?;

    let mdir = model_dir(model_id);
    if !mdir.exists() {
        return Err(format!("模型目录不存在: {}", mdir.display()));
    }
    let model_path = resolve_model_file(&mdir)?;
    let vad_path = resolve_vad_file(&mdir);

    // 写临时 WAV (自动清理)
    let temp_wav = create_temp_wav(samples)?;
    let wav_path = temp_wav.path().to_path_buf();

    // 构建命令
    let mut cmd = Command::new(&cli);
    cmd.arg("-m").arg(&model_path);
    cmd.arg("-a").arg(&wav_path);

    if let Some(vad) = vad_path.as_ref() {
        cmd.arg("--vad").arg(vad);
    }

    // Windows: 隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    log::debug!(
        "Running GGUF ASR: {:?} -m {:?} -a {:?} --vad {:?}",
        cli,
        model_path,
        wav_path,
        vad_path,
    );

    let output = cmd
        .output()
        .map_err(|e| format!("启动 llama-funasr-sensevoice 失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "llama-funasr-sensevoice 执行失败 (exit={:?}):\nSTDOUT:\n{}\nSTDERR:\n{}",
            output.status.code(),
            stdout,
            stderr
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    log::debug!(
        "GGUF ASR stdout:\n{}\nstderr:\n{}",
        stdout,
        stderr
    );

    // llama-funasr-sensevoice 输出格式示例:
    //   哭什么哭啊 [sensevoice] 1 vad segments [sensevoice] done 0.52s
    //   我有什么好哭的？ [sensevoice] 1 vad segments [sensevoice] done 0.44s
    //
    // 策略: 先按 [sensevoice] 日志标记分割，提取每个段落中非日志的实际文本
    let final_text = extract_sensevoice_text(&stdout, &stderr);

    Ok(GgufAsrResult {
        text: final_text,
        elapsed_ms: start.elapsed().as_millis() as u64,
    })
}

/// 快速检查 GGUF 模型目录完整性
pub fn is_gguf_model_ready(model_id: &str) -> bool {
    let dir = model_dir(model_id);
    if !dir.exists() {
        return false;
    }
    resolve_model_file(&dir).is_ok()
}
