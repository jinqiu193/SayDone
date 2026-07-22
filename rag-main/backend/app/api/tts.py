"""
文字转语音 API - 代理 MiniMax TTS
Package: top.modelx.rag
"""
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger

from app.core.config import settings

router = APIRouter(prefix="/api/tts", tags=["TTS"])

MINIMAX_API_HOST = "api.minimaxi.com"


class TTSRequest(BaseModel):
    text: str
    voice_id: str = "presenter_female"  # 默认：新闻女生
    language: str = "Chinese"


@router.post("/generate")
async def generate_tts(req: TTSRequest):
    """调用 MiniMax TTS 生成语音，返回 MP3 base64"""
    api_key = settings.MINIMAX_API_KEY
    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 MiniMax API Key，请在系统设置中填写")

    if not req.text.strip():
        raise HTTPException(status_code=400, detail="文本内容不能为空")

    payload = {
        "model": "speech-2.8-hd",
        "text": req.text[:5000],  # MiniMax 单次上限
        "stream": False,
        "voice_setting": {
            "voice_id": req.voice_id,
        },
        "language": req.language,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"https://{MINIMAX_API_HOST}/v1/t2a_v2",
                json=payload,
                headers=headers,
            )

        if resp.status_code != 200:
            logger.error(f"TTS API error: {resp.status_code} {resp.text[:200]}")
            raise HTTPException(status_code=resp.status_code, detail=f"MiniMax TTS 调用失败: {resp.status_code}")

        data = resp.json()

        # 提取音频 hex 数据
        audio_hex = None
        if data.get("data") and data["data"].get("audio"):
            audio_hex = data["data"]["audio"]
        elif data.get("audio"):
            audio_hex = data["audio"]

        if not audio_hex:
            logger.error(f"TTS no audio in response: {str(data)[:200]}")
            raise HTTPException(status_code=500, detail="TTS 返回数据中无音频")

        # hex -> base64
        audio_bytes = bytes.fromhex(audio_hex)
        import base64
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

        return {
            "code": 200,
            "data": {
                "audio_base64": audio_b64,
                "audio_hex_length": len(audio_hex),
                "voice_id": req.voice_id,
            },
        }

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="TTS 请求超时，请稍后重试")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=f"TTS 生成失败: {str(e)}")


@router.get("/voices")
async def list_voices():
    """获取 MiniMax 可用音色列表（仅中文音色）"""
    api_key = settings.MINIMAX_API_KEY
    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 MiniMax API Key")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"https://{MINIMAX_API_HOST}/v1/get_voice",
                json={"voice_type": "all"},
                headers=headers,
            )

        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="获取音色列表失败")

        data = resp.json()

        # 提取音色数组
        voice_array = None
        if data.get("system_voice") and isinstance(data["system_voice"], list):
            voice_array = data["system_voice"]
        elif data.get("voice_list") and isinstance(data["voice_list"], list):
            voice_array = data["voice_list"]
        elif data.get("data") and isinstance(data["data"], list):
            voice_array = data["data"]
        elif isinstance(data, list):
            voice_array = data

        # 过滤：只保留中文名称音色
        def has_chinese(text):
            return bool(text and __import__("re").search(r"[\u4e00-\u9fa5]", text))

        if voice_array:
            voice_array = [
                v for v in voice_array
                if has_chinese(v.get("voice_name") or v.get("name") or v.get("voice_id") or "")
            ]

        return {
            "code": 200,
            "data": voice_array or [],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get voices error: {e}")
        raise HTTPException(status_code=500, detail=f"获取音色列表失败: {str(e)}")
