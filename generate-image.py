# -*- coding: utf-8 -*-
import httpx
import hashlib
import sys
import time

TOKEN_URL = "http://127.0.0.1:53699/get_token"
API_URL = "https://autoglm-api.zhipuai.cn/agentdr/v1/assistant/skills/generate-image"
APP_ID = "100003"
APP_SECRET = "38d2391985e2369a5fb8227d8e6cd5e5"


def get_token():
    resp = httpx.get(TOKEN_URL, timeout=10)
    token = resp.text.strip()
    if not token.startswith("Bearer "):
        token = "Bearer " + token
    return token


def get_sign(timestamp: str) -> str:
    raw = f"{APP_ID}&{timestamp}&{APP_SECRET}"
    return hashlib.md5(raw.encode()).hexdigest()


def generate(prompt: str) -> str:
    token = get_token()
    timestamp = str(int(time.time()))
    sign = get_sign(timestamp)

    headers = {
        "Authorization": token,
        "Content-Type": "application/json",
        "X-Auth-Appid": APP_ID,
        "X-Auth-TimeStamp": timestamp,
        "X-Auth-Sign": sign,
    }
    payload = {"text": prompt}

    resp = httpx.post(API_URL, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != 0:
        raise Exception(f"API error: {data}")
    return data["data"]["image_url"]


if __name__ == "__main__":
    prompt = sys.argv[1] if len(sys.argv) > 1 else "麦克风图标"
    url = generate(prompt)
    print(url)
