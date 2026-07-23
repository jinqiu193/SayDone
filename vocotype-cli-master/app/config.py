"""Configuration helpers for the speak-keyboard runtime."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional


DEFAULT_CONFIG: Dict[str, Any] = {
    "hotkeys": {"toggle": "f2"},
    "audio": {
        "sample_rate": 16000,
        "block_ms": 20,
        "device": None,
        # 单次录音的最大大小（字节），默认20MB
        # 达到此限制后将自动停止录音并开始转录
        "max_session_bytes": 20 * 1024 * 1024,
    },
    "vad": {
        "start_threshold": 0.02,
        "stop_threshold": 0.01,
        "min_speech_ms": 300,
        "min_silence_ms": 200,
        "pad_ms": 200,
    },
    # 识别后端：funasr（本地离线）或 volcengine（火山引擎云端流式）
    "backend": "funasr",
    "asr": {
        "use_vad": False,
        "use_punc": True,
        "language": "zh",
        "hotword": "",
        "batch_size_s": 60.0,
    },
    # 火山引擎 BigASR 流式识别配置（仅当 backend == "volcengine" 时生效）
    # 文档：https://www.volcengine.com/docs/6561/1354869
    "volcengine": {
        # 在火山引擎控制台 https://console.volcengine.com/speech/app 创建应用后获取
        "app_key": "",
        "access_key": "",
        # 资源 ID，默认按时长计费
        "resource_id": "volc.bigasr.sauc.duration",
        # WebSocket 端点（一般无需修改）
        "url": "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
        # 识别模型名称
        "model_name": "bigmodel",
        # 每次发送的音频时长（毫秒），越小延迟越低
        "chunk_ms": 100,
        # 是否添加标点
        "enable_punc": True,
        # 是否启用数字/格式规范化（ITN）
        "enable_itn": True,
    },
    "output": {
        "dedupe": True,
        "max_history": 5,
        "min_chars": 1,
        "method": "auto",
        "append_newline": False,
    },
    "logging": {"dir": "logs", "level": "INFO"},
}


def _merge_dict(base: Dict[str, Any], overrides: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(base)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _merge_dict(result[key], value)
        else:
            result[key] = value
    return result


def load_config(path: Optional[str] = None) -> Dict[str, Any]:
    """Load configuration from JSON file if provided, otherwise defaults."""

    config = dict(DEFAULT_CONFIG)
    if not path:
        return config

    expanded_path = os.path.expanduser(path)
    if not os.path.exists(expanded_path):
        raise FileNotFoundError(f"Config file not found: {expanded_path}")

    with open(expanded_path, "r", encoding="utf-8") as f:
        overrides = json.load(f)

    return _merge_dict(config, overrides)


def ensure_logging_dir(config: Dict[str, Any]) -> str:
    """Ensure the logging directory exists and return its absolute path.
    
    日志目录相对于项目根目录（main.py 所在目录），而不是当前工作目录。
    这样即使从其他目录运行脚本，日志也能正确保存到项目目录下。
    """
    log_dir = config["logging"].get("dir", "logs")
    
    # 如果已经是绝对路径，直接使用
    if os.path.isabs(log_dir):
        pass
    else:
        # 相对路径：基于项目根目录（向上两级到达项目根目录）
        # app/config.py -> app/ -> 项目根目录
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        log_dir = os.path.join(project_root, log_dir)
    
    os.makedirs(log_dir, exist_ok=True)
    return log_dir


