"""Volcengine BigASR streaming speech recognition client.

接入文档：https://www.volcengine.com/docs/6561/1354869
WebSocket 端点：wss://openspeech.bytedance.com/api/v3/sauc/bigmodel
"""

from __future__ import annotations

import asyncio
import gzip
import json
import logging
import time
import uuid
from typing import Any, Dict, Optional

import numpy as np

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Binary protocol constants
# ──────────────────────────────────────────────────────────────────────────────

PROTOCOL_VERSION = 0b0001
HEADER_SIZE = 0b0001  # 1 × 4 bytes = 4-byte header

# Message types
FULL_CLIENT_REQUEST = 0b0001
AUDIO_ONLY_REQUEST = 0b0010
FULL_SERVER_RESPONSE = 0b1001
SERVER_ERROR_RESPONSE = 0b1111

# Message type specific flags
NO_SEQUENCE = 0b0000   # no sequence number, not last package
NEG_SEQUENCE = 0b0010  # bit-1 set → last package

# Serialization / compression
JSON_SERIALIZATION = 0b0001
GZIP_COMPRESSION = 0b0001

# API defaults
DEFAULT_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
DEFAULT_RESOURCE_ID = "volc.bigasr.sauc.duration"
DEFAULT_CHUNK_MS = 100  # milliseconds of audio per WebSocket frame


# ──────────────────────────────────────────────────────────────────────────────
# Protocol helpers
# ──────────────────────────────────────────────────────────────────────────────

def _build_header(message_type: int, flags: int) -> bytearray:
    """Build the 4-byte binary-protocol header."""
    hdr = bytearray(4)
    hdr[0] = (PROTOCOL_VERSION << 4) | HEADER_SIZE
    hdr[1] = (message_type << 4) | flags
    hdr[2] = (JSON_SERIALIZATION << 4) | GZIP_COMPRESSION
    hdr[3] = 0x00
    return hdr


def _build_full_client_request(payload_dict: dict, sequence: int = 1) -> bytes:
    """Build the initial FULL_CLIENT_REQUEST packet (JSON + gzip)."""
    payload = gzip.compress(json.dumps(payload_dict).encode("utf-8"))
    pkt = bytearray(_build_header(FULL_CLIENT_REQUEST, 0b0001))  # POS_SEQUENCE
    pkt.extend(sequence.to_bytes(4, "big", signed=True))  # sequence number
    pkt.extend(len(payload).to_bytes(4, "big"))            # payload size
    pkt.extend(payload)
    return bytes(pkt)


def _build_audio_packet(audio_data: bytes, is_last: bool = False) -> bytes:
    """Build an AUDIO_ONLY_REQUEST packet.

    Args:
        audio_data: Raw PCM bytes for this chunk.
        is_last:    True to signal the end of the audio stream (sets bit-1 in
                    the flags field so the server finalises recognition).
    """
    flags = NEG_SEQUENCE if is_last else NO_SEQUENCE
    compressed = gzip.compress(audio_data)
    pkt = bytearray(_build_header(AUDIO_ONLY_REQUEST, flags))
    pkt.extend(len(compressed).to_bytes(4, "big"))  # payload size
    pkt.extend(compressed)
    return bytes(pkt)


def _parse_server_response(data: bytes) -> dict:
    """Parse a server response packet into a plain dict."""
    header_size = data[0] & 0x0F
    message_type = data[1] >> 4
    flags = data[1] & 0x0F
    compression = data[2] & 0x0F

    payload = data[header_size * 4:]
    result: dict = {"is_last_package": bool(flags & 0x02), "message_type": message_type}

    if flags & 0x01:  # has sequence number
        result["sequence"] = int.from_bytes(payload[:4], "big", signed=True)
        payload = payload[4:]

    if message_type == FULL_SERVER_RESPONSE:
        size = int.from_bytes(payload[:4], "big", signed=True)
        payload_bytes = payload[4: 4 + size]
        if compression == GZIP_COMPRESSION:
            payload_bytes = gzip.decompress(payload_bytes)
        result["payload"] = json.loads(payload_bytes.decode("utf-8"))

    elif message_type == SERVER_ERROR_RESPONSE:
        code = int.from_bytes(payload[:4], "big", signed=False)
        result["error_code"] = code
        size = int.from_bytes(payload[4:8], "big", signed=False)
        payload_bytes = payload[8: 8 + size]
        if compression == GZIP_COMPRESSION:
            payload_bytes = gzip.decompress(payload_bytes)
        result["error_msg"] = json.loads(payload_bytes.decode("utf-8"))

    return result


# ──────────────────────────────────────────────────────────────────────────────
# Client
# ──────────────────────────────────────────────────────────────────────────────

class VolcengineASRClient:
    """Volcengine BigASR streaming speech recognition client.

    使用方式：
        client = VolcengineASRClient(config["volcengine"])
        result = client.transcribe(samples, sample_rate=16000)
        print(result["text"])
    """

    def __init__(self, config: Dict[str, Any]) -> None:
        self._app_key = config.get("app_key", "")
        self._access_key = config.get("access_key", "")
        self._resource_id = config.get("resource_id", DEFAULT_RESOURCE_ID)
        self._url = config.get("url", DEFAULT_URL)
        self._model_name = config.get("model_name", "bigmodel")
        try:
            self._chunk_ms = int(config.get("chunk_ms", DEFAULT_CHUNK_MS))
            if self._chunk_ms <= 0:
                raise ValueError
        except (ValueError, TypeError):
            logger.warning("volcengine.chunk_ms 配置无效，已回退至 %d ms", DEFAULT_CHUNK_MS)
            self._chunk_ms = DEFAULT_CHUNK_MS
        self._enable_punc = bool(config.get("enable_punc", True))
        self._enable_itn = bool(config.get("enable_itn", True))

        if not self._app_key or not self._access_key:
            logger.warning(
                "Volcengine ASR: app_key 或 access_key 未配置，"
                "请在配置文件的 volcengine 节中设置这两个字段"
            )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def transcribe(
        self,
        samples: np.ndarray,
        sample_rate: int = 16000,
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """将 numpy 音频样本转录为文本（同步接口，内部使用 asyncio）。

        Args:
            samples:     int16 或 float32 的 1-D numpy 数组。
            sample_rate: 采样率，默认 16000 Hz。
            options:     可选覆盖项，支持 enable_punc / enable_itn。

        Returns:
            与 FunASRServer.transcribe_audio() 格式兼容的 dict：
            {"success": True/False, "text": str, "raw_text": str,
             "duration": float, "inference_latency": float, "confidence": float}
        """
        if not self._app_key or not self._access_key:
            return {
                "success": False,
                "error": (
                    "Volcengine ASR 未配置 app_key 或 access_key，"
                    "请在配置文件的 volcengine 节中填写凭据"
                ),
            }

        # 确保样本为 int16 PCM
        if samples.dtype != np.int16:
            # float32 → int16
            audio_int16 = np.clip(samples, -1.0, 1.0)
            audio_int16 = (audio_int16 * 32767).astype(np.int16)
        else:
            audio_int16 = samples
        audio_bytes = audio_int16.tobytes()

        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(
                self._async_transcribe(audio_bytes, sample_rate, options or {})
            )
        except Exception as exc:
            logger.error("Volcengine ASR 转录异常: %s", exc, exc_info=True)
            return {"success": False, "error": str(exc)}
        finally:
            loop.close()

    def cleanup(self) -> None:
        """释放资源（Volcengine 客户端使用无状态 WebSocket 连接，每次转录后自动关闭，无需额外清理）。"""

    # ------------------------------------------------------------------
    # Internal async implementation
    # ------------------------------------------------------------------

    async def _async_transcribe(
        self,
        audio_bytes: bytes,
        sample_rate: int,
        options: Dict[str, Any],
    ) -> Dict[str, Any]:
        """异步转录实现。"""
        try:
            import websockets  # type: ignore[import-untyped]
        except ImportError:
            return {
                "success": False,
                "error": "websockets 未安装，请执行: pip install websockets>=12.0",
            }

        request_id = str(uuid.uuid4())
        headers = {
            "X-Api-Resource-Id": self._resource_id,
            "X-Api-Access-Key": self._access_key,
            "X-Api-App-Key": self._app_key,
            "X-Api-Request-Id": request_id,
        }

        full_text = ""
        audio_duration_s = 0.0
        start_time = time.time()

        init_payload = {
            "audio": {
                "format": "pcm",
                "codec": "raw",
                "sample_rate": sample_rate,
                "channel": 1,
            },
            "request": {
                "model_name": self._model_name,
                "enable_punc": options.get("enable_punc", self._enable_punc),
                "enable_itn": options.get("enable_itn", self._enable_itn),
            },
        }

        # bytes per chunk (int16 = 2 bytes/sample)
        chunk_samples = sample_rate * self._chunk_ms // 1000
        chunk_bytes = chunk_samples * 2

        try:
            async with websockets.connect(
                self._url,
                additional_headers=headers,
                open_timeout=15,
                close_timeout=10,
            ) as ws:
                # ── 1. Send init request ────────────────────────────────────
                await ws.send(_build_full_client_request(init_payload, sequence=1))

                # ── 2. Receive init ACK ─────────────────────────────────────
                raw = await asyncio.wait_for(ws.recv(), timeout=10.0)
                init_resp = _parse_server_response(raw)
                logger.debug("Volcengine ASR 初始化响应: %s", init_resp)

                if init_resp.get("message_type") == SERVER_ERROR_RESPONSE:
                    err = init_resp.get("error_msg", "初始化失败")
                    return {
                        "success": False,
                        "error": f"Volcengine ASR 初始化失败: {err}",
                    }

                # ── 3. Stream audio + receive results concurrently ──────────
                audio_done = asyncio.Event()

                async def _send_audio() -> None:
                    total = len(audio_bytes)
                    offset = 0
                    while offset < total:
                        end = min(offset + chunk_bytes, total)
                        chunk = audio_bytes[offset:end]
                        is_last = end >= total
                        await ws.send(_build_audio_packet(chunk, is_last=is_last))
                        offset = end
                    audio_done.set()
                    logger.debug("Volcengine ASR 音频发送完毕")

                send_task = asyncio.create_task(_send_audio())

                # Receive until server signals last package or connection closes
                try:
                    async for msg in ws:
                        resp = _parse_server_response(msg)
                        logger.debug("Volcengine ASR 服务端响应: %s", resp)

                        if resp.get("message_type") == SERVER_ERROR_RESPONSE:
                            await send_task
                            err = resp.get("error_msg", "未知错误")
                            return {
                                "success": False,
                                "error": f"Volcengine ASR 服务端错误: {err}",
                            }

                        payload = resp.get("payload", {})
                        result = payload.get("result", {})
                        text = result.get("text", "")
                        if text:
                            full_text = text  # 用最新收到的结果替换（服务端返回累积文本）

                        audio_info = payload.get("audio_info", {})
                        duration_ms = audio_info.get("duration", 0)
                        if duration_ms:
                            audio_duration_s = duration_ms / 1000.0

                        if resp.get("is_last_package"):
                            logger.debug("Volcengine ASR 收到最终结果包")
                            break
                except Exception as recv_exc:
                    # Connection may close after last package — that's normal
                    logger.debug("Volcengine ASR 接收循环结束: %s", recv_exc)

                await send_task

        except Exception as exc:
            logger.error("Volcengine ASR WebSocket 错误: %s", exc, exc_info=True)
            return {"success": False, "error": f"Volcengine ASR WebSocket 错误: {exc}"}

        inference_latency = time.time() - start_time
        logger.info(
            "Volcengine ASR 转录完成：%r (耗时 %.2fs，音频时长 %.2fs)",
            full_text,
            inference_latency,
            audio_duration_s,
        )

        return {
            "success": True,
            "text": full_text,
            "raw_text": full_text,
            "duration": audio_duration_s,
            "inference_latency": inference_latency,
            "confidence": 1.0,
        }
