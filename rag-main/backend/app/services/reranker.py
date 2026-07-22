"""
Reranker 重排序服务 - Cross-Encoder 对检索结果二次排序
支持多种后端：
  - ollama:  通过 Ollama 运行 bge-reranker 等模型（需 Ollama 支持 /api/rerank）
  - external: 调用 Jina / Cohere 等 Rerank API
  - local: 使用 FlagEmbedding / sentence-transformers 本地加载模型
Package: top.modelx.rag | Author: hua
"""
import time
from pathlib import Path
from typing import List, Tuple, Optional
from langchain_core.documents import Document
from loguru import logger

from app.core.config import settings, load_runtime_settings


class BaseReranker:
    """Reranker 基类"""

    async def rerank(
        self, query: str, results: List[Tuple[Document, float]], top_k: int = None
    ) -> List[Tuple[Document, float]]:
        raise NotImplementedError


class ExternalAPIReranker(BaseReranker):
    """外部 Rerank API（Jina / Cohere / 自建服务）"""

    def __init__(self, api_base: str, api_key: str, model: str = ""):
        self.api_base = api_base.rstrip("/")
        self.api_key = api_key
        self.model = model

    async def rerank(
        self, query: str, results: List[Tuple[Document, float]], top_k: int = None
    ) -> List[Tuple[Document, float]]:
        if not results:
            return results

        import httpx

        top_k = top_k or settings.RERANK_TOP_K
        documents = [doc.page_content for doc, _ in results]

        # Jina Reranker API 格式
        payload = {
            "model": self.model or "jina-reranker-v2-base-multilingual",
            "query": query,
            "documents": documents,
            "top_n": min(top_k, len(results)),
        }
        headers = {
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            resp = await client.post(
                f"{self.api_base}", json=payload, headers=headers
            )
            resp.raise_for_status()
            data = resp.json()

        # 解析结果 — Jina/Cohere 返回格式: {"results": [{"index": 0, "relevance_score": 0.9}, ...]}
        ranked = []
        results_list = data.get("results", [])
        for item in results_list:
            idx = item.get("index", 0)
            score = float(item.get("relevance_score", 0.0))
            if 0 <= idx < len(results):
                doc, _ = results[idx]
                ranked.append((doc, score))

        ranked.sort(key=lambda x: x[1], reverse=True)
        return ranked[:top_k]


class OllamaReranker(BaseReranker):
    """
    Ollama Reranker — 使用 Ollama 的 /api/embeddings 端点
    通过将 query+doc 拼接后做 embed，与纯 query embed 计算余弦相似度
    这是一种轻量级的 cross-encoding 近似方案

    注意：Ollama 原生不支持 /api/rerank 端点，
    此实现使用 embedding 近似重排序（效果弱于真正的 Cross-Encoder）
    """

    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def rerank(
        self, query: str, results: List[Tuple[Document, float]], top_k: int = None
    ) -> List[Tuple[Document, float]]:
        if not results:
            return results

        import httpx
        import numpy as np

        top_k = top_k or settings.RERANK_TOP_K

        # 1. 获取 query 的 embedding
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            query_resp = await client.post(
                f"{self.base_url}/api/embeddings",
                json={"model": self.model, "prompt": query},
            )
            query_resp.raise_for_status()
            query_vec = np.array(query_resp.json()["embedding"])

            # 2. 获取每个 doc 与 query 拼接后的 embedding
            scores = []
            for doc, _ in results:
                # Cross-Encoder 近似：拼接 query + document
                combined = f"{query}\n{doc.page_content[:2000]}"
                doc_resp = await client.post(
                    f"{self.base_url}/api/embeddings",
                    json={"model": self.model, "prompt": combined},
                )
                doc_resp.raise_for_status()
                doc_vec = np.array(doc_resp.json()["embedding"])

                # 余弦相似度
                sim = float(np.dot(query_vec, doc_vec) / (np.linalg.norm(query_vec) * np.linalg.norm(doc_vec) + 1e-8))
                scores.append(sim)

        # 3. 按分数重排
        ranked = [(doc, score) for (doc, _), score in zip(results, scores)]
        ranked.sort(key=lambda x: x[1], reverse=True)
        return ranked[:top_k]


class LocalReranker(BaseReranker):
    """本地 Cross-Encoder Reranker（使用 FlagEmbedding 或 sentence-transformers）"""

    # 本地模型搜索路径（优先级从高到低）
    LOCAL_MODEL_DIRS = [
        # 项目根目录下的 models/ 文件夹
        str(Path(__file__).resolve().parents[3] / "models"),
    ]

    def __init__(self, model_name: str):
        self.model_name = model_name
        self._model = None
        self._model_path = self._resolve_model_path()

    def _resolve_model_path(self) -> str:
        """解析模型路径：优先本地目录，其次 HuggingFace ID"""
        import os

        # 如果已经是绝对/相对路径且存在，直接使用
        if os.path.isdir(self.model_name):
            return self.model_name

        # 在 LOCAL_MODEL_DIRS 中搜索
        # 从 model_name 提取短名: "BAAI/bge-reranker-v2-m3" → "bge-reranker-v2-m3"
        short_name = self.model_name.split("/")[-1]
        for base_dir in self.LOCAL_MODEL_DIRS:
            # 匹配完整名或短名
            for candidate in [os.path.join(base_dir, self.model_name), os.path.join(base_dir, short_name)]:
                if os.path.isdir(candidate):
                    logger.info(f"Found local model at: {candidate}")
                    return candidate

        # 未找到本地模型，回退到 HuggingFace 自动下载
        logger.info(f"Local model not found in {self.LOCAL_MODEL_DIRS}, will download from HuggingFace")
        return self.model_name

    def _get_model(self):
        if self._model is not None:
            return self._model

        # 优先使用 FlagEmbedding（BGE 系列）
        try:
            from FlagEmbedding import FlagReranker
            self._model = FlagReranker(self._model_path, use_fp16=True)
            logger.info(f"LocalReranker loaded with FlagEmbedding: {self._model_path}")
            return self._model
        except ImportError:
            pass

        # 回退到 sentence-transformers CrossEncoder
        try:
            from sentence_transform import CrossEncoder
            self._model = CrossEncoder(self.model_name, max_length=512)
            logger.info(f"LocalReranker loaded with sentence-transformers: {self.model_name}")
            return self._model
        except ImportError:
            raise ImportError(
                "本地 Reranker 需要 FlagEmbedding 或 sentence-transformers，"
                "请运行: pip install FlagEmbedding>=1.2.0 或 pip install sentence-transformers>=2.2.0"
            )

    async def rerank(
        self, query: str, results: List[Tuple[Document, float]], top_k: int = None
    ) -> List[Tuple[Document, float]]:
        if not results:
            return results

        import asyncio

        top_k = top_k or settings.RERANK_TOP_K
        model = self._get_model()

        # 构建 query-document 对
        pairs = [[query, doc.page_content] for doc, _ in results]

        # 在线程池中执行同步推理
        loop = asyncio.get_event_loop()
        scores = await loop.run_in_executor(
            None, self._compute_scores, model, pairs
        )

        # 按分数重排
        ranked = [(doc, float(score)) for (doc, _), score in zip(results, scores)]
        ranked.sort(key=lambda x: x[1], reverse=True)
        return ranked[:top_k]

    @staticmethod
    def _compute_scores(model, pairs):
        """同步计算分数，在线程池中执行"""
        # FlagReranker.compute_score 支持批量
        if hasattr(model, 'compute_score'):
            return model.compute_score(pairs)
        # sentence-transformers CrossEncoder
        return model.predict(pairs)


# ── 全局 Reranker 工厂 ──────────────────────────────────────────────────────

_reranker_instance: Optional[BaseReranker] = None


def get_reranker() -> Optional[BaseReranker]:
    """
    根据 settings 创建/获取 Reranker 实例。
    配置变更后需重启后端生效（单例模式）。
    """
    global _reranker_instance

    rs = load_runtime_settings()
    enabled = rs.get("reranker_enabled", settings.RERANKER_ENABLED)
    if not enabled:
        return None

    # 如果已经初始化且配置没变，复用
    if _reranker_instance is not None:
        return _reranker_instance

    backend = rs.get("reranker_backend", settings.RERANKER_BACKEND)

    try:
        if backend == "external":
            api_base = rs.get("reranker_api_base", settings.RERANKER_API_BASE)
            api_key = rs.get("reranker_api_key", settings.RERANKER_API_KEY)
            model = rs.get("reranker_model", settings.RERANKER_MODEL)
            _reranker_instance = ExternalAPIReranker(api_base, api_key, model)
            logger.info(f"Reranker initialized: External API ({api_base})")

        elif backend == "ollama":
            ollama_url = rs.get("ollama_url", settings.OLLAMA_BASE_URL)
            model = rs.get("reranker_model", settings.RERANKER_MODEL) or "bge-reranker-v2-m3"
            _reranker_instance = OllamaReranker(ollama_url, model)
            logger.info(f"Reranker initialized: Ollama ({model})")

        elif backend == "local":
            model = rs.get("reranker_model", settings.RERANKER_MODEL) or "BAAI/bge-reranker-v2-m3"
            _reranker_instance = LocalReranker(model)
            logger.info(f"Reranker initialized: Local ({model})")

        else:
            logger.warning(f"Unknown reranker backend: {backend}, reranker disabled")
            return None

    except Exception as e:
        logger.error(f"Reranker initialization failed: {e}")
        return None

    return _reranker_instance


def reset_reranker():
    """重置 Reranker 实例（配置变更后调用）"""
    global _reranker_instance
    _reranker_instance = None
