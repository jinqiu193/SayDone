"""
Query 改写与分解服务 — 提升模糊/复杂查询的召回率
支持三种模式：
  - rewrite:  将模糊查询改写为更精确的检索查询
  - decompose: 将复杂查询拆分为多个子查询并行检索
  - both:     先改写再分解
Package: top.modelx.rag | Author: hua
"""
import json
import re
import time
import asyncio
from typing import List, Tuple, Optional
from langchain_core.documents import Document
from loguru import logger

from app.core.config import settings, load_runtime_settings


# ── Prompt 模板 ──────────────────────────────────────────────────────────────

REWRITE_SYSTEM = """你是一个查询改写专家。你的任务是将用户的模糊、口语化或不精确的查询，改写为更适合在知识库中检索的精确查询。

改写规则：
1. 保留用户的核心意图，不要改变问题的范围
2. 将口语化表达转为专业术语（如"怎么搞"→"操作步骤"）
3. 补充隐含的上下文信息（如代词替换为具体名词）
4. 去除无意义的修饰词，突出关键词
5. 如果查询已经足够精确，直接返回原文
6. 只输出改写后的查询，不要解释"""

DECOMPOSE_SYSTEM = """你是一个查询分解专家。你的任务是将用户的复杂查询拆分为多个独立的子查询，以便在知识库中分别检索后合并结果。

分解规则：
1. 每个子查询应是一个独立、可回答的具体问题
2. 子查询之间不应有依赖关系
3. 如果查询本身是简单问题，不需要分解，返回单个查询
4. 子查询数量不超过 4 个
5. 以 JSON 数组格式输出，例如：["子查询1", "子查询2", "子查询3"]
6. 只输出 JSON 数组，不要其他内容"""


class QueryRewriter:
    """查询改写与分解服务"""

    def __init__(self):
        self._rewrite_llm = None
        self._decompose_llm = None

    def _get_rewrite_llm(self):
        """获取改写用的轻量 LLM（复用主 LLM 配置）"""
        if self._rewrite_llm is not None:
            return self._rewrite_llm
        from app.services.rag import rag_service
        self._rewrite_llm = rag_service._get_llm(streaming=False)
        return self._rewrite_llm

    def _get_decompose_llm(self):
        if self._decompose_llm is not None:
            return self._decompose_llm
        from app.services.rag import rag_service
        self._decompose_llm = rag_service._get_llm(streaming=False)
        return self._decompose_llm

    # ── 改写 ──────────────────────────────────────────────────────────────

    async def rewrite(self, query: str, history: List[dict] = None) -> str:
        """将模糊查询改写为精确检索查询"""
        llm = self._get_rewrite_llm()

        # 构建带上下文的 prompt
        user_content = query
        if history:
            # 从最近对话中提取上下文线索
            recent = history[-4:]  # 最近 2 轮
            context_parts = []
            for msg in recent:
                role = "用户" if msg["role"] == "user" else "助手"
                context_parts.append(f"{role}: {msg['content'][:200]}")
            context_str = "\n".join(context_parts)
            user_content = f"对话上下文：\n{context_str}\n\n当前查询：{query}"

        from langchain_core.messages import SystemMessage, HumanMessage
        messages = [
            SystemMessage(content=REWRITE_SYSTEM),
            HumanMessage(content=user_content),
        ]

        try:
            t0 = time.time()
            result = await llm.ainvoke(messages)
            rewritten = result.content.strip()
            elapsed = (time.time() - t0) * 1000

            # 如果改写结果和原查询差异太小，返回原查询
            if self._is_trivial_rewrite(query, rewritten):
                logger.info(f"[REWRITE] Trivial rewrite, using original query")
                return query

            logger.info(
                f"[REWRITE] {query[:50]!r} → {rewritten[:50]!r} | latency={elapsed:.0f}ms"
            )
            return rewritten
        except Exception as e:
            logger.error(f"[REWRITE] Failed, using original query: {e}")
            return query

    # ── 分解 ──────────────────────────────────────────────────────────────

    async def decompose(self, query: str, history: List[dict] = None) -> List[str]:
        """将复杂查询分解为多个子查询"""
        llm = self._get_decompose_llm()

        user_content = query
        if history:
            recent = history[-4:]
            context_parts = []
            for msg in recent:
                role = "用户" if msg["role"] == "user" else "助手"
                context_parts.append(f"{role}: {msg['content'][:200]}")
            context_str = "\n".join(context_parts)
            user_content = f"对话上下文：\n{context_str}\n\n当前查询：{query}"

        from langchain_core.messages import SystemMessage, HumanMessage
        messages = [
            SystemMessage(content=DECOMPOSE_SYSTEM),
            HumanMessage(content=user_content),
        ]

        try:
            t0 = time.time()
            result = await llm.ainvoke(messages)
            content = result.content.strip()
            elapsed = (time.time() - t0) * 1000

            # 解析 JSON 数组
            sub_queries = self._parse_sub_queries(content)

            if len(sub_queries) <= 1:
                logger.info(f"[DECOMPOSE] Single query, no decomposition needed")
                return [query]

            logger.info(
                f"[DECOMPOSE] {query[:50]!r} → {len(sub_queries)} sub-queries | "
                f"latency={elapsed:.0f}ms"
            )
            return sub_queries
        except Exception as e:
            logger.error(f"[DECOMPOSE] Failed, using original query: {e}")
            return [query]

    # ── 并行检索与合并 ────────────────────────────────────────────────────

    async def retrieve_with_rewrite(
        self,
        kb_id: int,
        query: str,
        history: List[dict] = None,
        strategy: str = "hybrid",
    ) -> Tuple[List[Tuple[Document, float]], dict]:
        """
        带改写/分解的检索流程。
        返回 (results, meta)，meta 包含改写/分解信息。
        """
        rs = load_runtime_settings()
        mode = rs.get("query_rewrite_mode", settings.QUERY_REWRITE_MODE)
        enabled = rs.get("query_rewrite_enabled", settings.QUERY_REWRITE_ENABLED)

        meta = {
            "original_query": query,
            "rewritten_query": None,
            "sub_queries": [],
            "mode": "none",
        }

        if not enabled or mode == "none":
            # 直接检索
            from app.services.rag import rag_service
            results, _ = await rag_service.retrieve(kb_id, query, strategy=strategy)
            return results, meta

        # ── Step 1: 改写 ──────────────────────────────────────────────
        effective_query = query
        if mode in ("rewrite", "both"):
            effective_query = await self.rewrite(query, history)
            meta["rewritten_query"] = effective_query
            meta["mode"] = "rewrite"

        # ── Step 2: 分解 ──────────────────────────────────────────────
        if mode in ("decompose", "both"):
            sub_queries = await self.decompose(effective_query, history)
            meta["sub_queries"] = sub_queries
            meta["mode"] = mode

            if len(sub_queries) > 1:
                # 并行检索每个子查询
                results = await self._parallel_retrieve(kb_id, sub_queries, strategy)
                return results, meta

        # 单查询检索（改写后）
        from app.services.rag import rag_service
        results, _ = await rag_service.retrieve(kb_id, effective_query, strategy=strategy)
        return results, meta

    async def _parallel_retrieve(
        self,
        kb_id: int,
        sub_queries: List[str],
        strategy: str = "hybrid",
    ) -> List[Tuple[Document, float]]:
        """并行检索多个子查询，合并去重"""
        from app.services.rag import rag_service

        # 并行执行所有子查询
        tasks = [
            rag_service.retrieve(kb_id, q, strategy=strategy)
            for q in sub_queries
        ]
        all_results = await asyncio.gather(*tasks, return_exceptions=True)

        # 合并 & 去重（按文档内容 hash）
        seen = set()
        merged = []
        for result in all_results:
            if isinstance(result, Exception):
                logger.error(f"[PARALLEL] Sub-query failed: {result}")
                continue
            items, _ = result
            for doc, score in items:
                # 用 doc_id + chunk_index 或内容前 200 字去重
                doc_id = doc.metadata.get("doc_id", "")
                chunk_idx = doc.metadata.get("chunk_index", "")
                dedup_key = f"{doc_id}:{chunk_idx}" if doc_id else doc.page_content[:200]

                if dedup_key not in seen:
                    seen.add(dedup_key)
                    merged.append((doc, score))

        # 按分数降序排列
        merged.sort(key=lambda x: x[1], reverse=True)

        logger.info(
            f"[PARALLEL] {len(sub_queries)} sub-queries → {len(merged)} unique results"
        )
        return merged

    # ── 工具方法 ──────────────────────────────────────────────────────────

    @staticmethod
    def _is_trivial_rewrite(original: str, rewritten: str) -> bool:
        """判断改写结果是否过于轻微（不值得用改写结果）"""
        # 去除首尾空白后比较
        o = original.strip()
        r = rewritten.strip()
        if o == r:
            return True
        # 改写结果包含原查询且长度差异小于 20%
        if o in r and abs(len(r) - len(o)) / max(len(o), 1) < 0.2:
            return True
        return False

    @staticmethod
    def _parse_sub_queries(content: str) -> List[str]:
        """从 LLM 输出中解析子查询列表"""
        # 尝试直接解析 JSON
        try:
            result = json.loads(content)
            if isinstance(result, list):
                return [str(q).strip() for q in result if str(q).strip()]
        except json.JSONDecodeError:
            pass

        # 尝试提取 JSON 数组（LLM 可能在前后加了文字）
        json_match = re.search(r'\[.*?\]', content, re.DOTALL)
        if json_match:
            try:
                result = json.loads(json_match.group())
                if isinstance(result, list):
                    return [str(q).strip() for q in result if str(q).strip()]
            except json.JSONDecodeError:
                pass

        # 兜底：按换行/编号分割
        lines = content.strip().split('\n')
        queries = []
        for line in lines:
            line = re.sub(r'^\d+[\.\)、]\s*', '', line.strip())
            if line and len(line) > 3:
                queries.append(line)

        return queries if queries else [content]


# ── 全局单例 ────────────────────────────────────────────────────────────────

_query_rewriter: Optional[QueryRewriter] = None


def get_query_rewriter() -> QueryRewriter:
    global _query_rewriter
    if _query_rewriter is None:
        _query_rewriter = QueryRewriter()
    return _query_rewriter


def reset_query_rewriter():
    """重置实例（配置变更后调用）"""
    global _query_rewriter
    _query_rewriter = None
