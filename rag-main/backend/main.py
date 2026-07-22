"""
企业内部知识库系统 - FastAPI 主程序
Package: top.modelx.rag
Author: hua
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from loguru import logger
import sys
import os

from app.core.config import settings
from app.core.database import init_db
from app.api import kb, document, chat, system, docgen, tts
from app.services.retrieval_log import setup_rag_loggers

# 配置日志 — Windows 控制台默认 GBK，需强制 UTF-8 避免 emoji 编码错误
import io
logger.remove()
logger.add(
    io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True),
    level="INFO",
    format="<green>{time:HH:mm:ss}</green> | <level>{level}</level> | {message}",
)
logger.add("logs/app.log", rotation="10 MB", retention="7 days", level="INFO", encoding="utf-8")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting RAG System...")
    init_db()
    setup_rag_loggers()          # ← 新增
    logger.info(f"✅ Database initialized")
    logger.info(f"📦 LLM Model: {settings.OLLAMA_LLM_MODEL}")
    logger.info(f"🔍 Embedding Model: {settings.OLLAMA_EMBEDDING_MODEL}")
    yield
    logger.info("👋 Shutting down")




app = FastAPI(
    title="Enterprise RAG Knowledge Base",
    description="企业内部知识库系统 - by hua",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局异常处理
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"code": 500, "message": str(exc), "data": None}
    )

# 注册路由
app.include_router(kb.router)
app.include_router(document.router)
app.include_router(chat.router)
app.include_router(system.router)
app.include_router(docgen.router)
app.include_router(tts.router)


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "author": "hua",
        "package": "top.modelx.rag",
    }



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info",
    )
