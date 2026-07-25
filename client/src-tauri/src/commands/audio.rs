use base64::{engine::general_purpose::STANDARD, Engine};
use std::fs;
use std::path::PathBuf;
use tauri::async_runtime;

fn audio_dir() -> PathBuf {
    crate::app_paths::audio_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[tauri::command]
pub async fn save_audio_file(id: String, wav_base64: String) -> Result<String, String> {
    let dir = audio_dir();
    let id_clone = id.clone();
    let dir_clone = dir.clone();

    async_runtime::spawn_blocking(move || {
        fs::create_dir_all(&dir_clone).map_err(|e| e.to_string())?;

        let bytes = STANDARD.decode(&wav_base64).map_err(|e| e.to_string())?;
        let path = dir_clone.join(format!("{}.wav", id_clone));
        fs::write(&path, bytes).map_err(|e| e.to_string())?;

        Ok(path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_pcm_as_wav(id: String, pcm_base64: String, sample_rate: Option<u32>) -> Result<String, String> {
    let dir = audio_dir();
    let id_clone = id.clone();
    let dir_clone = dir.clone();
    let pcm_clone = pcm_base64.clone();
    let sr_clone = sample_rate;

    async_runtime::spawn_blocking(move || {
        fs::create_dir_all(&dir_clone).map_err(|e| e.to_string())?;

        let pcm = STANDARD.decode(&pcm_clone).map_err(|e| e.to_string())?;
        let sr = sr_clone.unwrap_or(16000);
        let data_len = pcm.len() as u32;

        let mut wav = Vec::with_capacity(44 + pcm.len());
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_len).to_le_bytes());
        wav.extend_from_slice(b"WAVE");
        wav.extend_from_slice(b"fmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&sr.to_le_bytes());
        wav.extend_from_slice(&(sr * 2).to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_len.to_le_bytes());
        wav.extend_from_slice(&pcm);

        let path = dir_clone.join(format!("{}.wav", id_clone));
        fs::write(&path, &wav).map_err(|e| e.to_string())?;

        Ok(path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn append_pcm_to_wav(
    id: String,
    pcm_base64: String,
    sample_rate: Option<u32>,
    is_first_chunk: bool,
) -> Result<String, String> {
    let dir = audio_dir();
    let id_clone = id.clone();
    let dir_clone = dir.clone();
    let pcm_clone = pcm_base64.clone();
    let sr_clone = sample_rate;
    let first_chunk_clone = is_first_chunk;

    async_runtime::spawn_blocking(move || {
        use std::io::Write;

        fs::create_dir_all(&dir_clone).map_err(|e| e.to_string())?;
        let path = dir_clone.join(format!("{}.wav", id_clone));

        let pcm = STANDARD.decode(&pcm_clone).map_err(|e| e.to_string())?;
        let sr = sr_clone.unwrap_or(16000);

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| e.to_string())?;

        if first_chunk_clone || file.metadata().map_err(|e| e.to_string())?.len() == 0 {
            let mut header = Vec::with_capacity(44 + pcm.len());
            let data_len = pcm.len() as u32;
            header.extend_from_slice(b"RIFF");
            header.extend_from_slice(&(36 + data_len).to_le_bytes());
            header.extend_from_slice(b"WAVE");
            header.extend_from_slice(b"fmt ");
            header.extend_from_slice(&16u32.to_le_bytes());
            header.extend_from_slice(&1u16.to_le_bytes());
            header.extend_from_slice(&1u16.to_le_bytes());
            header.extend_from_slice(&sr.to_le_bytes());
            header.extend_from_slice(&(sr * 2).to_le_bytes());
            header.extend_from_slice(&2u16.to_le_bytes());
            header.extend_from_slice(&16u16.to_le_bytes());
            header.extend_from_slice(b"data");
            header.extend_from_slice(&data_len.to_le_bytes());
            header.extend_from_slice(&pcm);

            file.write_all(&header).map_err(|e| e.to_string())?;
        } else {
            file.write_all(&pcm).map_err(|e| e.to_string())?;
        }

        Ok(path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn finalize_wav_file(id: String, total_pcm_bytes: u32) -> Result<String, String> {
    let dir = audio_dir();
    let id_clone = id.clone();
    let pcm_bytes = total_pcm_bytes;

    async_runtime::spawn_blocking(move || {
        use std::io::{Read, Seek, SeekFrom, Write};

        let path = dir.join(format!("{}.wav", id_clone));
        if !path.exists() {
            return Err(format!("WAV 文件不存在: {}", id_clone));
        }

        let mut file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .map_err(|e| e.to_string())?;

        let total_size = file.metadata().map_err(|e| e.to_string())?.len();
        let riff_size = (total_size - 8) as u32;

        file.seek(SeekFrom::Start(4)).map_err(|e| e.to_string())?;
        file.write_all(&riff_size.to_le_bytes()).map_err(|e| e.to_string())?;

        file.seek(SeekFrom::Start(40)).map_err(|e| e.to_string())?;
        let mut buf4 = [0u8; 4];
        file.read_exact(&mut buf4).map_err(|e| e.to_string())?;
        file.seek(SeekFrom::Start(40)).map_err(|e| e.to_string())?;
        file.write_all(&pcm_bytes.to_le_bytes()).map_err(|e| e.to_string())?;

        Ok(path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cleanup_incomplete_wav(id: String) -> Result<(), String> {
    let dir = audio_dir();
    let id_clone = id.clone();

    async_runtime::spawn_blocking(move || {
        let path = dir.join(format!("{}.wav", id_clone));
        if path.exists() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_audio_file(file_path: String) -> Result<Option<String>, String> {
    let path = PathBuf::from(&file_path);

    async_runtime::spawn_blocking(move || {
        if !path.exists() {
            return Ok(None);
        }
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        Ok(Some(STANDARD.encode(&bytes)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_audio_file(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);

    async_runtime::spawn_blocking(move || {
        if path.exists() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
