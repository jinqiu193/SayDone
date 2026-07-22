"""
配置管理模块 - 支持 .env + 运行时设置文件
Package: top.modelx.rag | Author: hua
"""
from pydantic_settings import BaseSettings
from typing import List
import os
import json


def _runtime_settings_path() -> str:
    # __file__ = F:\rag-main\backend\app\core\config.py
    # 4x dirname -> F:\rag-main\backend -> 5x -> F:\rag-main
    p = os.path.abspath(__file__)
    for _ in range(4):
        p = os.path.dirname(p)
    return os.path.join(p, "data", "settings.json")


def load_runtime_settings() -> dict:
    try:
        path = _runtime_settings_path()
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Enterprise RAG System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    SECRET_KEY: str = "your-secret-key"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Database
    DATABASE_URL: str = "mysql+pymysql://root:password@localhost:3306/rag_db"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # LLM Backend: "ollama" | "external"
    LLM_BACKEND: str = "ollama"
    # Ollama
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_LLM_MODEL: str = "qwen3.5:9b"
    # External API (Minimax / OpenAI-compatible)
    EXTERNAL_LLM_API_KEY: str = ""
    EXTERNAL_LLM_MODEL: str = ""
    EXTERNAL_LLM_API_BASE: str = ""
    EXTERNAL_LLM_MAX_TOKENS: int = 2048
    EXTERNAL_LLM_TEMPERATURE: float = 0.1  # 降低温度减少幻觉，0.0为完全确定性
    OLLAMA_TEMPERATURE: float = 0.3
    OLLAMA_MAX_TOKENS: int = 4096
    # Embedding
    OLLAMA_EMBEDDING_MODEL: str = "nomic-embed-text:latest"
    # System Prompt
    SYSTEM_PROMPT: str = ""

    # MiniMax TTS
    MINIMAX_API_KEY: str = ""
    MINIMAX_TTS_VOICE_ID: str = "presenter_female"

    # Vector Store
    CHROMA_PERSIST_DIR: str = "./chroma_db"
    CHROMA_COLLECTION_NAME: str = "rag_documents"

    # File Upload
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE: int = 104857600
    ALLOWED_EXTENSIONS: str = "pdf,doc,docx,txt,xls,xlsx,jpg,jpeg,png,gif,bmp"

    # RAG Config
    CHUNK_SIZE: int = 1500  # 增大分块以捕获更完整信息
    CHUNK_OVERLAP: int = 300  # 增大重叠避免信息断裂
    TOP_K: int = 10  # 多检索一些，靠RERANK_TOP_K过滤
    RERANK_TOP_K: int = 6  # 取前6条构建上下文
    RETRIEVAL_SCORE_THRESHOLD: float = 0.3  # 提高阈值，只保留相关度>30%的文档
    MAX_CONTEXT_LENGTH: int = 8000  # 增加上下文长度上限

    # Reranker 重排序
    RERANKER_ENABLED: bool = False  # 是否启用 Reranker
    RERANKER_BACKEND: str = "local"  # local | ollama | external
    RERANKER_MODEL: str = "BAAI/bge-reranker-v2-m3"  # Reranker 模型名称
    RERANKER_API_BASE: str = ""  # 外部 Reranker API 地址
    RERANKER_API_KEY: str = ""  # 外部 Reranker API 密钥

    # Query 改写与分解
    QUERY_REWRITE_ENABLED: bool = False  # 是否启用查询改写
    QUERY_REWRITE_MODE: str = "rewrite"  # rewrite | decompose | both

    # Cache
    QUERY_CACHE_TTL: int = 300
    QUERY_CACHE_MAX_SIZE: int = 500
    EMBEDDING_CACHE_MAX_SIZE: int = 2000

    # Async Worker
    EMBEDDING_CONCURRENCY: int = 3
    EMBED_BATCH_SIZE: int = 20

    # Logging
    LOG_DIR: str = "./logs"
    LOG_RETRIEVAL: bool = True
    LOG_PROMPT: bool = True
    LOG_LEVEL: str = "INFO"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # 运行时设置覆盖 .env 默认值
        rs = load_runtime_settings()
        if rs.get("llm_backend"):
            self.LLM_BACKEND = rs["llm_backend"]
        if rs.get("ollama_url"):
            self.OLLAMA_BASE_URL = rs["ollama_url"]
        if rs.get("ollama_model"):
            self.OLLAMA_LLM_MODEL = rs["ollama_model"]
        if rs.get("ext_api_key"):
            self.EXTERNAL_LLM_API_KEY = rs["ext_api_key"]
        if rs.get("ext_api_base"):
            self.EXTERNAL_LLM_API_BASE = rs["ext_api_base"]
        if rs.get("ext_model"):
            self.EXTERNAL_LLM_MODEL = rs["ext_model"]
        if rs.get("ext_max_tokens"):
            self.EXTERNAL_LLM_MAX_TOKENS = int(rs["ext_max_tokens"])
        if rs.get("ext_temperature"):
            self.EXTERNAL_LLM_TEMPERATURE = float(rs["ext_temperature"])
        if rs.get("ollama_temperature"):
            self.OLLAMA_TEMPERATURE = float(rs["ollama_temperature"])
        if rs.get("ollama_max_tokens"):
            self.OLLAMA_MAX_TOKENS = int(rs["ollama_max_tokens"])
        if rs.get("embedding_model"):
            self.OLLAMA_EMBEDDING_MODEL = rs["embedding_model"]
        if rs.get("chunk_size"):
            self.CHUNK_SIZE = int(rs["chunk_size"])
        if rs.get("chunk_overlap"):
            self.CHUNK_OVERLAP = int(rs["chunk_overlap"])
        if rs.get("top_k"):
            self.TOP_K = int(rs["top_k"])
        if rs.get("rerank_top_k"):
            self.RERANK_TOP_K = int(rs["rerank_top_k"])
        if rs.get("retrieval_score_threshold"):
            self.RETRIEVAL_SCORE_THRESHOLD = float(rs["retrieval_score_threshold"])
        if rs.get("max_context_length"):
            self.MAX_CONTEXT_LENGTH = int(rs["max_context_length"])
        if rs.get("max_file_size_mb"):
            self.MAX_FILE_SIZE = int(rs["max_file_size_mb"]) * 1024 * 1024
        if rs.get("allowed_extensions"):
            self.ALLOWED_EXTENSIONS = rs["allowed_extensions"]
        self.SYSTEM_PROMPT = rs.get("system_prompt", "")
        if rs.get("minimax_api_key"):
            self.MINIMAX_API_KEY = rs["minimax_api_key"]
        if rs.get("tts_voice_id"):
            self.MINIMAX_TTS_VOICE_ID = rs["tts_voice_id"]
        # Reranker
        if rs.get("reranker_enabled") is not None:
            self.RERANKER_ENABLED = bool(rs["reranker_enabled"])
        if rs.get("reranker_backend"):
            self.RERANKER_BACKEND = rs["reranker_backend"]
        if rs.get("reranker_model"):
            self.RERANKER_MODEL = rs["reranker_model"]
        if rs.get("reranker_api_base"):
            self.RERANKER_API_BASE = rs["reranker_api_base"]
        if rs.get("reranker_api_key"):
            self.RERANKER_API_KEY = rs["reranker_api_key"]
        # Query Rewrite
        if rs.get("query_rewrite_enabled") is not None:
            self.QUERY_REWRITE_ENABLED = bool(rs["query_rewrite_enabled"])
        if rs.get("query_rewrite_mode"):
            self.QUERY_REWRITE_MODE = rs["query_rewrite_mode"]

    @property
    def allowed_extensions_list(self) -> List[str]:
        return [ext.strip().lower() for ext in self.ALLOWED_EXTENSIONS.split(",")]

    def ensure_dirs(self):
        os.makedirs(self.UPLOAD_DIR, exist_ok=True)
        os.makedirs(self.CHROMA_PERSIST_DIR, exist_ok=True)
        os.makedirs(self.LOG_DIR, exist_ok=True)
        # 确保 data 目录存在
        data_dir = os.path.dirname(_runtime_settings_path())
        os.makedirs(data_dir, exist_ok=True)

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
settings.ensure_dirs()
