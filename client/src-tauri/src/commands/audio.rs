use base64::{engine::general_purpose::STANDARD, Engine};
use std::fs;
use std::path::PathBuf;

fn audio_dir() -> PathBuf {
    crate::app_paths::audio_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[tauri::command]
pub fn save_audio_file(id: String, wav_base64: String) -> Result<String, String> {
    let dir = audio_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let bytes = STANDARD.decode(&wav_base64).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.wav", id));
    fs::write(&path, bytes).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

/// 接收 PCM Int16 LE 原始数据（base64），在 Rust 侧编码 WAV header 并写入文件。
/// 避免前端拼 WAV + base64 编码的开销。
#[tauri::command]
pub fn save_pcm_as_wav(id: String, pcm_base64: String, sample_rate: Option<u32>) -> Result<String, String> {
    let dir = audio_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let pcm = STANDARD.decode(&pcm_base64).map_err(|e| e.to_string())?;
    let sr = sample_rate.unwrap_or(16000);
    let data_len = pcm.len() as u32;

    // Build 44-byte WAV header + PCM data
    let mut wav = Vec::with_capacity(44 + pcm.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());   // chunk size
    wav.extend_from_slice(&1u16.to_le_bytes());    // PCM format
    wav.extend_from_slice(&1u16.to_le_bytes());    // mono
    wav.extend_from_slice(&sr.to_le_bytes());      // sample rate
    wav.extend_from_slice(&(sr * 2).to_le_bytes()); // byte rate
    wav.extend_from_slice(&2u16.to_le_bytes());    // block align
    wav.extend_from_slice(&16u16.to_le_bytes());   // bits per sample
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(&pcm);

    let path = dir.join(format!("{}.wav", id));
    fs::write(&path, &wav).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

/// Append PCM data to an existing WAV file (or create with header if not present).
/// 用于 P2-5：录音过程中按时间分片增量写入，避免把所有 PCM 攒在内存里。
/// Rust 侧直接做磁盘 I/O，避免前端一次合并 ~90MB 数据。
#[tauri::command]
pub fn append_pcm_to_wav(
    id: String,
    pcm_base64: String,
    sample_rate: Option<u32>,
    is_first_chunk: bool,
) -> Result<String, String> {
    use std::io::Write;

    let dir = audio_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.wav", id));

    let pcm = STANDARD.decode(&pcm_base64).map_err(|e| e.to_string())?;
    let sr = sample_rate.unwrap_or(16000);

    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;

    if is_first_chunk || file.metadata().map_err(|e| e.to_string())?.len() == 0 {
        // 重置为新文件 + 写 44-byte header + 第一个 chunk。
        // （chunk 大小在 append_pcm_to_wav 中**不**更新；final flush 时由 finalize_wav 更新）
        let mut header = Vec::with_capacity(44 + pcm.len());
        let data_len = pcm.len() as u32;
        header.extend_from_slice(b"RIFF");
        header.extend_from_slice(&(36 + data_len).to_le_bytes()); // 占位，finalize 时覆写
        header.extend_from_slice(b"WAVE");
        header.extend_from_slice(b"fmt ");
        header.extend_from_slice(&16u32.to_le_bytes());    // chunk size
        header.extend_from_slice(&1u16.to_le_bytes());     // PCM format
        header.extend_from_slice(&1u16.to_le_bytes());     // mono
        header.extend_from_slice(&sr.to_le_bytes());       // sample rate
        header.extend_from_slice(&(sr * 2).to_le_bytes()); // byte rate
        header.extend_from_slice(&2u16.to_le_bytes());     // block align
        header.extend_from_slice(&16u16.to_le_bytes());    // bits per sample
        header.extend_from_slice(b"data");
        header.extend_from_slice(&data_len.to_le_bytes()); // 占位
        header.extend_from_slice(&pcm);

        file.write_all(&header).map_err(|e| e.to_string())?;
    } else {
        file.write_all(&pcm).map_err(|e| e.to_string())?;
    }

    Ok(path.to_string_lossy().to_string())
}

/// 修补 WAV header 中 RIFF/data chunk size 字段（append 阶段是占位）。
/// 录音结束时由前端调用一次。
#[tauri::command]
pub fn finalize_wav_file(id: String, total_pcm_bytes: u32) -> Result<String, String> {
    use std::io::{Read, Seek, SeekFrom, Write};

    let dir = audio_dir();
    let path = dir.join(format!("{}.wav", id));
    if !path.exists() {
        return Err(format!("WAV 文件不存在: {}", id));
    }

    let mut file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&path)
        .map_err(|e| e.to_string())?;

    // RIFF chunk size = 文件总大小 - 8
    let total_size = file.metadata().map_err(|e| e.to_string())?.len();
    let riff_size = (total_size - 8) as u32;

    file.seek(SeekFrom::Start(4)).map_err(|e| e.to_string())?;
    file.write_all(&riff_size.to_le_bytes()).map_err(|e| e.to_string())?;

    // data chunk size
    file.seek(SeekFrom::Start(40)).map_err(|e| e.to_string())?;
    let mut buf4 = [0u8; 4];
    file.read_exact(&mut buf4).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(40)).map_err(|e| e.to_string())?;
    file.write_all(&total_pcm_bytes.to_le_bytes()).map_err(|e| e.to_string())?;

    let _ = buf4; // suppress unused

    Ok(path.to_string_lossy().to_string())
}

/// 删除未 finalize 的临时 WAV 文件（清理异常中断情况）。
#[tauri::command]
pub fn cleanup_incomplete_wav(id: String) -> Result<(), String> {
    let dir = audio_dir();
    let path = dir.join(format!("{}.wav", id));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn read_audio_file(file_path: String) -> Result<Option<String>, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(Some(STANDARD.encode(&bytes)))
}

#[tauri::command]
pub fn delete_audio_file(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
