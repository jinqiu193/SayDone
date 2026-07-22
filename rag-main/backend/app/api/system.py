"""
System API - status, stats, cache, settings
Package: top.modelx.rag | Author: hua
"""
import json
import os
from datetime import datetime, timedelta
from collections import Counter
import httpx
from fastapi import APIRouter, HTTPException
from sqlalchemy import func
from app.core.config import settings, load_runtime_settings
from app.core.database import SessionLocal
from app.models import KnowledgeBase, Document, Conversation, Message, DocStatus
from app.services.rag import rag_service
from app.services.cache import query_cache, embedding_cache
from app.services.retrieval_log import RetrievalStats
from app.services.vector_store import vector_service

router = APIRouter(prefix="/api/system", tags=["System"])

# Runtime settings file (editable via API)
_SETTINGS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "..", "data", "settings.json")


def _load_settings() -> dict:
    try:
        os.makedirs(os.path.dirname(_SETTINGS_FILE), exist_ok=True)
        with open(_SETTINGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_settings(data: dict):
    os.makedirs(os.path.dirname(_SETTINGS_FILE), exist_ok=True)
    with open(_SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@router.get("/health")
async def health_check():
    ollama_ok = rag_service.test_connection()
    rs = load_runtime_settings()
    backend = rs.get("llm_backend", settings.LLM_BACKEND)
    if backend == "ollama":
        llm_model = rs.get("ollama_model", settings.OLLAMA_LLM_MODEL)
    else:
        llm_model = rs.get("ext_model", settings.EXTERNAL_LLM_MODEL)
    return {
        "status":           "healthy",
        "ollama":           ollama_ok,
        "llm_backend":      backend,
        "llm_model":        llm_model,
        "embedding_model":  settings.OLLAMA_EMBEDDING_MODEL,
        "external_api_base": rs.get("ext_api_base", settings.EXTERNAL_LLM_API_BASE),
        "external_model":   rs.get("ext_model", settings.EXTERNAL_LLM_MODEL),
        "version":          settings.APP_VERSION,
    }


@router.get("/settings")
async def get_settings():
    """Get all configurable settings (no secrets exposed)"""
    cfg = _load_settings()
    return {
        "llm_backend":    cfg.get("llm_backend",   settings.LLM_BACKEND),
        "ollama_url":     cfg.get("ollama_url",   settings.OLLAMA_BASE_URL),
        "ollama_model":   cfg.get("ollama_model", settings.OLLAMA_LLM_MODEL),
        "ext_api_key":    cfg.get("ext_api_key",  ""),      # never return actual key
        "ext_api_base":   cfg.get("ext_api_base", settings.EXTERNAL_LLM_API_BASE),
        "ext_model":      cfg.get("ext_model",     settings.EXTERNAL_LLM_MODEL),
        "ext_max_tokens": cfg.get("ext_max_tokens", settings.EXTERNAL_LLM_MAX_TOKENS),
        "ext_temperature": cfg.get("ext_temperature", settings.EXTERNAL_LLM_TEMPERATURE),
        "embedding_model": settings.OLLAMA_EMBEDDING_MODEL,
        "reranker_enabled":  cfg.get("reranker_enabled",  settings.RERANKER_ENABLED),
        "reranker_backend":  cfg.get("reranker_backend",  settings.RERANKER_BACKEND),
        "reranker_model":    cfg.get("reranker_model",    settings.RERANKER_MODEL),
        "reranker_api_base": cfg.get("reranker_api_base", settings.RERANKER_API_BASE),
        "reranker_api_key":  "",  # never return actual key
        "query_rewrite_enabled": cfg.get("query_rewrite_enabled", settings.QUERY_REWRITE_ENABLED),
        "query_rewrite_mode":    cfg.get("query_rewrite_mode",    settings.QUERY_REWRITE_MODE),
        "minimax_api_key":  cfg.get("minimax_api_key", ""),  # never return actual key
        "tts_voice_id":     cfg.get("tts_voice_id", settings.MINIMAX_TTS_VOICE_ID),
    }


@router.put("/settings")
async def update_settings(payload: dict):
    """Update settings (partial update supported)"""
    cfg = _load_settings()

    # Allowed fields
    for field in ["llm_backend", "ollama_url", "ollama_model",
                  "ollama_temperature", "ollama_max_tokens",
                  "ext_api_key", "ext_api_base", "ext_model",
                  "ext_max_tokens", "ext_temperature",
                  "embedding_model",
                  "chunk_size", "chunk_overlap", "top_k", "rerank_top_k",
                  "retrieval_score_threshold", "max_context_length",
                  "max_file_size_mb", "allowed_extensions",
                  "system_prompt",
                  "reranker_enabled", "reranker_backend", "reranker_model",
                  "reranker_api_base", "reranker_api_key",
                  "query_rewrite_enabled", "query_rewrite_mode",
                  "minimax_api_key", "tts_voice_id"]:
        if field in payload:
            cfg[field] = payload[field]

    _save_settings(cfg)

    # Reranker 配置变更时重置实例
    reranker_fields = {"reranker_enabled", "reranker_backend", "reranker_model",
                       "reranker_api_base", "reranker_api_key"}
    if reranker_fields & set(payload.keys()):
        from app.services.reranker import reset_reranker
        reset_reranker()

    # Query Rewrite 配置变更时重置实例
    rewrite_fields = {"query_rewrite_enabled", "query_rewrite_mode"}
    if rewrite_fields & set(payload.keys()):
        from app.services.query_rewrite import reset_query_rewriter
        reset_query_rewriter()

    return {"message": "Settings updated. Restart backend to apply."}


@router.get("/stats")
async def get_stats():
    return {
        "retrieval":       RetrievalStats.summary(),
        "query_cache":     query_cache.stats(),
        "embedding_cache": embedding_cache.stats(),
    }


@router.post("/cache/clear")
async def clear_cache(kb_id: int = None):
    if kb_id:
        await query_cache.invalidate_kb(kb_id)
    else:
        await query_cache._cache.clear_prefix("q:")
    return {"message": "Cache cleared"}


@router.get("/models")
async def list_models():
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{settings.OLLAMA_BASE_URL}/api/tags", timeout=5
            )
            return {"models": [m["name"] for m in r.json().get("models", [])]}
    except Exception as e:
        return {"models": [], "error": str(e)}


# ── 统计仪表盘 ──────────────────────────────────────────────────────
@router.get("/dashboard")
async def get_dashboard():
    """全局统计仪表盘数据"""
    db = SessionLocal()
    try:
        # 1. 知识库统计
        kb_total = db.query(func.count(KnowledgeBase.id)).scalar() or 0

        # 2. 文档统计
        doc_total = db.query(func.count(Document.id)).scalar() or 0
        doc_by_status = {}
        for row in db.query(Document.status, func.count(Document.id)).group_by(Document.status).all():
            doc_by_status[row[0].value if hasattr(row[0], "value") else str(row[0])] = row[1]
        doc_by_type = {}
        for row in db.query(Document.file_type, func.count(Document.id)).group_by(Document.file_type).all():
            if row[0]:
                ext = row[0].lstrip(".").lower()
                doc_by_type[ext] = doc_by_type.get(ext, 0) + row[1]
        total_file_size = db.query(func.sum(Document.file_size)).scalar() or 0
        total_chunks = db.query(func.sum(Document.chunk_count)).scalar() or 0
        total_chars = db.query(func.sum(Document.char_count)).scalar() or 0

        # 3. 向量统计（遍历所有知识库）
        total_vectors = 0
        kb_list = db.query(KnowledgeBase.id).all()
        for (kb_id,) in kb_list:
            stats = vector_service.get_kb_stats(kb_id)
            total_vectors += stats.get("vector_count", 0)

        # 4. 对话统计
        conv_total = db.query(func.count(Conversation.id)).scalar() or 0
        msg_total = db.query(func.count(Message.id)).scalar() or 0
        user_msg_total = db.query(func.count(Message.id)).filter(Message.role == "user").scalar() or 0
        total_tokens = db.query(func.sum(Message.tokens)).filter(Message.tokens.isnot(None)).scalar() or 0

        # 5. 热门问题（最近 30 天 user 消息频次 Top 10）
        since = datetime.now() - timedelta(days=30)
        hot_questions = []
        try:
            rows = db.query(Message.content, func.count(Message.id).label("cnt")) \
                .filter(Message.role == "user", Message.created_at >= since) \
                .group_by(Message.content) \
                .order_by(func.count(Message.id).desc()) \
                .limit(10).all()
            hot_questions = [{"question": r[0][:80], "count": r[1]} for r in rows if r[0]]
        except Exception:
            pass

        # 6. 最近 7 天每日对话数
        daily_chats = []
        try:
            for i in range(6, -1, -1):
                day = (datetime.now() - timedelta(days=i)).date()
                next_day = day + timedelta(days=1)
                cnt = db.query(func.count(Conversation.id)) \
                    .filter(Conversation.created_at >= day,
                            Conversation.created_at < next_day).scalar() or 0
                daily_chats.append({"date": day.isoformat(), "count": cnt})
        except Exception:
            pass

        # 7. 最近 7 天每日提问数
        daily_questions = []
        try:
            for i in range(6, -1, -1):
                day = (datetime.now() - timedelta(days=i)).date()
                next_day = day + timedelta(days=1)
                cnt = db.query(func.count(Message.id)) \
                    .filter(Message.role == "user",
                            Message.created_at >= day,
                            Message.created_at < next_day).scalar() or 0
                daily_questions.append({"date": day.isoformat(), "count": cnt})
        except Exception:
            pass

        # 8. 引用排行（被引用最多的文档 Top 5）
        cited_docs = []
        try:
            messages_with_sources = db.query(Message.sources) \
                .filter(Message.sources.isnot(None), Message.role == "assistant").all()
            doc_counter = Counter()
            for (sources,) in messages_with_sources:
                if isinstance(sources, list):
                    for src in sources:
                        fname = src.get("filename", "") if isinstance(src, dict) else ""
                        if fname:
                            doc_counter[fname] += 1
            cited_docs = [{"filename": k, "count": v} for k, v in doc_counter.most_common(5)]
        except Exception:
            pass

        # 9. 知识库文档分布
        kb_doc_distribution = []
        try:
            rows = db.query(KnowledgeBase.name, KnowledgeBase.doc_count) \
                .order_by(KnowledgeBase.doc_count.desc()).limit(8).all()
            kb_doc_distribution = [{"name": r[0], "doc_count": r[1]} for r in rows]
        except Exception:
            pass

        return {
            "code": 200,
            "data": {
                "kb": {"total": kb_total},
                "documents": {
                    "total": doc_total,
                    "by_status": doc_by_status,
                    "by_type": doc_by_type,
                    "total_file_size": total_file_size,
                    "total_chunks": total_chunks,
                    "total_chars": total_chars,
                },
                "vectors": {"total": total_vectors},
                "conversations": {
                    "total": conv_total,
                    "message_total": msg_total,
                    "user_message_total": user_msg_total,
                    "total_tokens": total_tokens,
                },
                "hot_questions": hot_questions,
                "daily_chats": daily_chats,
                "daily_questions": daily_questions,
                "cited_docs": cited_docs,
                "kb_doc_distribution": kb_doc_distribution,
            },
        }
    except Exception as e:
        return {"code": 500, "data": None, "message": str(e)}
    finally:
        db.close()
