// POC: 验证 sherpa-onnx 1.13 OfflineSpeakerDiarization 在 Windows + Rust 上的实际能力。
// 运行：poc-diarization.exe <path-to-16k-mono-wav>
//
// 环境变量（可选）：
//   SEG_MODEL          - pyannote 分割模型路径（默认 models/sherpa-onnx-pyannote-segmentation-3-0/model.onnx）
//   EMB_MODEL          - 说话人 embedding 模型路径（默认 models/eres2net-base.onnx）
//   NUM_SPEAKERS       - 强制说话人数（默认 -1 = 自动聚类）
//   CLUSTER_THRESHOLD  - 聚类阈值（默认 0.5）

use sherpa_onnx::{
    FastClusteringConfig, OfflineSpeakerDiarization, OfflineSpeakerDiarizationConfig,
    OfflineSpeakerSegmentationModelConfig, OfflineSpeakerSegmentationPyannoteModelConfig,
    SpeakerEmbeddingExtractorConfig,
};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("用法: poc-diarization.exe <path-to-16k-mono-wav>");
        std::process::exit(1);
    }
    let wav_path = &args[1];

    // ===== 1. 读 WAV =====
    let (samples, sample_rate) = match read_wav(wav_path) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("读 WAV 失败: {} ({})", wav_path, e);
            std::process::exit(1);
        }
    };
    println!("读入 {} Hz 单声道，样本数 {} ({:.2}s)",
        sample_rate, samples.len(),
        samples.len() as f32 / sample_rate as f32);
    if sample_rate != 16000 {
        eprintln!("警告：采样率 {} ≠ 16000，可能影响准确率", sample_rate);
    }

    // ===== 2. 配置 diarization =====
    let seg_model = std::env::var("SEG_MODEL").unwrap_or_else(|_| {
        "models/sherpa-onnx-pyannote-segmentation-3-0/model.onnx".to_string()
    });
    let emb_model = std::env::var("EMB_MODEL").unwrap_or_else(|_| {
        "models/eres2net-base.onnx".to_string()
    });
    let num_speakers: i32 = std::env::var("NUM_SPEAKERS")
        .ok().and_then(|s| s.parse().ok()).unwrap_or(-1);
    let threshold: f32 = std::env::var("CLUSTER_THRESHOLD")
        .ok().and_then(|s| s.parse().ok()).unwrap_or(0.5);

    println!("\n模型配置:");
    println!("  segmentation : {}", seg_model);
    println!("  embedding    : {}", emb_model);
    println!("  num_speakers : {} (-1 = auto)", num_speakers);
    println!("  threshold    : {}", threshold);

    let config = OfflineSpeakerDiarizationConfig {
        segmentation: OfflineSpeakerSegmentationModelConfig {
            pyannote: OfflineSpeakerSegmentationPyannoteModelConfig {
                model: Some(seg_model),
            },
            num_threads: 4,
            debug: false,
            provider: Some("cpu".to_string()),
        },
        embedding: SpeakerEmbeddingExtractorConfig {
            model: Some(emb_model),
            num_threads: 4,
            debug: false,
            provider: Some("cpu".to_string()),
        },
        clustering: FastClusteringConfig {
            num_clusters: num_speakers,
            threshold,
        },
        min_duration_on: 0.3,
        min_duration_off: 0.5,
    };

    let sd = match OfflineSpeakerDiarization::create(&config) {
        Some(v) => v,
        None => {
            eprintln!("初始化 diarization 失败");
            std::process::exit(1);
        }
    };

    println!("\nDiarization pipeline 初始化 OK (sample_rate = {})", sd.sample_rate());

    // ===== 3. 跑 diarization =====
    let audio_dur = samples.len() as f32 / sample_rate as f32;
    let start = std::time::Instant::now();
    let result = match sd.process(&samples) {
        Some(r) => r,
        None => {
            eprintln!("diarization process() 失败");
            std::process::exit(1);
        }
    };
    let elapsed = start.elapsed();

    // ===== 4. 打印结果 =====
    let num_speakers_detected = result.num_speakers();
    let num_segments = result.num_segments();
    let rtf = elapsed.as_secs_f32() / audio_dur;
    println!("\n处理耗时: {:.2}s (RTF = {:.3}x, 即处理速度是实时 {:.2} 倍)",
        elapsed.as_secs_f32(), rtf, 1.0 / rtf);
    println!("检测到说话人数: {}", num_speakers_detected);
    println!("总片段数: {}", num_segments);

    let segments = result.sort_by_start_time();
    if segments.is_empty() {
        println!("\n未检测到任何说话片段");
        return;
    }

    let mut counts: std::collections::BTreeMap<i32, usize> = std::collections::BTreeMap::new();
    let mut total_dur: f32 = 0.0;
    for seg in &segments {
        *counts.entry(seg.speaker).or_insert(0) += 1;
        total_dur += seg.end - seg.start;
    }
    println!("\n说话人分布 (标签 → 片段数 → 总时长):");
    let mut per_speaker_dur: std::collections::BTreeMap<i32, f32> = std::collections::BTreeMap::new();
    for seg in &segments {
        *per_speaker_dur.entry(seg.speaker).or_insert(0.0) += seg.end - seg.start;
    }
    for (spk, cnt) in &counts {
        let dur = per_speaker_dur.get(spk).copied().unwrap_or(0.0);
        println!("  Speaker {:>2}: {:>3} 个片段, 总时长 {:>6.2}s ({:.1}%)",
            spk, cnt, dur, dur / audio_dur * 100.0);
    }

    println!("\n时间线 (秒):");
    println!("  {:>8}  {:>8}  {:>6}  {:>6}", "开始", "结束", "说话人", "时长");
    println!("  --------  --------  ------  ------");
    for seg in &segments {
        println!("  {:>8.2}  {:>8.2}  Spk{:>2}  {:>5.2}s",
            seg.start, seg.end, seg.speaker, seg.end - seg.start);
    }
    println!("\n总说话时长: {:.2}s，占音频 {:.1}%", total_dur, total_dur / audio_dur * 100.0);
}

fn read_wav(path: &str) -> Result<(Vec<f32>, i32), String> {
    let reader = hound::WavReader::open(path)
        .map_err(|e| format!("open: {}", e))?;
    let spec = reader.spec();
    if spec.channels != 1 {
        return Err(format!("需单声道 wav，当前 {} 声道", spec.channels));
    }
    let sr = spec.sample_rate;
    let max_val = (1i32 << (spec.bits_per_sample - 1)) as f32;

    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            reader.into_samples::<i32>()
                .map(|s| s.map_err(|e| format!("sample: {}", e)))
                .map(|s| s.map(|v| v as f32 / max_val))
                .collect::<Result<Vec<_>, _>>()?
        }
        hound::SampleFormat::Float => {
            reader.into_samples::<f32>()
                .map(|s| s.map_err(|e| format!("sample: {}", e)))
                .collect::<Result<Vec<_>, _>>()?
        }
    };
    Ok((samples, sr as i32))
}