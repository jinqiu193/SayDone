"""
RAG 推理服务（生产级）
- QueryCache 查询缓存
- 多检索策略（similarity / mmr / hybrid）
- 检索日志 + Prompt 日志 + 命中率统计
- Context 截断保护
- 异步非阻塞
Package: top.modelx.rag
Author: hua
"""
import json
import time
import httpx
from typing import List, Optional, AsyncGenerator, Tuple, Union
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import BaseMessage, AIMessageChunk
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.outputs import ChatGeneration, ChatResult
from loguru import logger

from app.core.config import settings, load_runtime_settings
from app.services.vector_store import vector_service
from app.services.cache import query_cache
from app.services.retrieval_log import (
    log_retrieval, log_prompt, RetrievalStats
)
from app.services.reranker import get_reranker
from app.services.query_rewrite import get_query_rewriter


SYSTEM_PROMPT = """你是企业内部知识库助手，必须严格根据以下参考文档回答用户问题。

⚠️ 严格规则：
1. 你只能使用下方【参考文档】中的信息来回答问题，绝对禁止使用你自己的知识或外部信息
2. 如果参考文档中没有相关信息，必须明确回复"根据当前知识库内容，未找到相关信息"，禁止编造答案
3. 回答时必须引用具体来源，格式：【来源：文件名】
4. 如果参考文档内容不完整或模糊，如实说明，不要猜测或补充
5. 回答要清晰、专业、用中文

【参考文档】：
{context}

⚠️ 再次强调：只能使用上述参考文档中的信息，不要使用任何其他知识。
"""


# ── MiniMax Anthropic 兼容接口（/v1/messages）─────────────────────────
class MiniMaxAnthropicChat(BaseChatModel):
    """MiniMax API（Anthropic 兼容），使用 /v1/messages 端点。"""
    model_config = {"extra": "allow"}

    def __init__(
        self,
        api_key: str = "",
        model: str = "",
        base_url: str = "https://api.minimaxi.com/anthropic",
        max_tokens: int = 2048,
        temperature: float = 0.3,
        streaming: bool = False,
        **kwargs,
    ):
        super().__init__(**kwargs)
        # Pydantic v2 + extra="allow" 允许随意属性，但需手动赋值
        object.__setattr__(self, "api_key", api_key)
        object.__setattr__(self, "model", model)
        object.__setattr__(self, "base_url", base_url.rstrip("/"))
        object.__setattr__(self, "max_tokens", max_tokens)
        object.__setattr__(self, "temperature", temperature)
        object.__setattr__(self, "streaming", streaming)

    @property
    def _llm_type(self) -> str:
        return "minimax_anthropic"

    @property
    def _identifying_params(self) -> dict:
        return {"model": self.model, "base_url": self.base_url}

    def _messages_to_anthropic(self, messages: list) -> list:
        """将 LangChain messages 转换为 Anthropic 格式。"""
        result = []
        for msg in messages:
            role = msg.type  # 'system'|'human'|'ai'
            content = msg.content if hasattr(msg, "content") else str(msg)
            if role == "system":
                result.append({"role": "user", "content": f"<system>{content}</system>"})
            elif role == "human":
                result.append({"role": "user", "content": content})
            elif role == "ai":
                result.append({"role": "assistant", "content": content})
            else:
                result.append({"role": "user", "content": str(msg)})
        return result

    def _generate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        **kwargs,
    ) -> ChatResult:
        """同步生成（非流式）。"""
        anth_messages = self._messages_to_anthropic(messages)
        payload = {
            "model": self.model,
            "messages": anth_messages,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "thinking_budget": 0,  # 禁用思考过程，直接输出文本
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }
        with httpx.Client(timeout=httpx.Timeout(180.0, connect=30.0)) as client:
            r = client.post(f"{self.base_url}/v1/messages", json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()
        # MiniMax 返回 content 列表，找到 type="text" 的块
        content = ""
        if data.get("content"):
            for block in data["content"]:
                if block.get("type") == "text" and "text" in block:
                    content = block["text"]
                    break
        return ChatResult(
            generations=[ChatGeneration(message=AIMessageChunk(content=content))]
        )

    async def _agenerate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        **kwargs,
    ) -> ChatResult:
        """异步生成（非流式）。"""
        anth_messages = self._messages_to_anthropic(messages)
        payload = {
            "model": self.model,
            "messages": anth_messages,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "thinking_budget": 0,  # 禁用思考过程，直接输出文本
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }
        async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=30.0)) as client:
            r = await client.post(f"{self.base_url}/v1/messages", json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()
        # 提取 text 类型内容（跳过 thinking 类型）
        content = ""
        for block in (data.get("content") or []):
            if block.get("type") == "text":
                content = block.get("text", "")
                break
        return ChatResult(
            generations=[ChatGeneration(message=AIMessageChunk(content=content))]
        )

    async def _astream(
        self,
        messages: List[BaseMessage],
        **kwargs,
    ) -> AsyncGenerator[ AIMessageChunk, None]:
        """流式生成。"""
        anth_messages = self._messages_to_anthropic(messages)
        payload = {
            "model": self.model,
            "messages": anth_messages,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "stream": True,
            "thinking_budget": 0,  # 禁用思考过程
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0), follow_redirects=True) as client:
            async with client.stream("POST", f"{self.base_url}/v1/messages", json=payload, headers=headers) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        raw = line[6:]
                        if raw == "[DONE]":
                            break
                        try:
                            chunk = json.loads(raw)
                            if chunk.get("type") == "content_block_delta":
                                delta = chunk.get("delta", {})
                                if delta.get("type") == "text_delta":
                                    yield AIMessageChunk(content=delta.get("text", ""))
                        except json.JSONDecodeError:
                            pass


class RAGService:

    def _get_llm(self, streaming: bool = False) -> BaseChatModel:
        # 直接从运行时设置读取（跳过 Pydantic 字段机制）
        rs = load_runtime_settings()
        backend = rs.get("llm_backend", settings.LLM_BACKEND)
        if backend == "ollama":
            from langchain_ollama import ChatOllama
            think_num = rs.get("ollama_think_num", 0)  # 0 = 禁用思考模式
            return ChatOllama(
                base_url=rs.get("ollama_url", settings.OLLAMA_BASE_URL),
                model=rs.get("ollama_model", settings.OLLAMA_LLM_MODEL),
                streaming=streaming,
                temperature=0.1,  # 降低温度减少幻觉
                num_predict=2048,
                think_num=think_num,
            )
        else:
            ext_base = rs.get("ext_api_base", settings.EXTERNAL_LLM_API_BASE)
            if "minimaxi.com" in ext_base:
                # MiniMax Anthropic 兼容接口（/v1/messages，非 /v1/chat/completions）
                return MiniMaxAnthropicChat(
                    api_key=rs.get("ext_api_key", settings.EXTERNAL_LLM_API_KEY),
                    model=rs.get("ext_model", settings.EXTERNAL_LLM_MODEL),
                    base_url=ext_base,
                    streaming=streaming,
                    max_tokens=int(rs.get("ext_max_tokens", settings.EXTERNAL_LLM_MAX_TOKENS)),
                    temperature=float(rs.get("ext_temperature", settings.EXTERNAL_LLM_TEMPERATURE)),
                )
            else:
                from langchain_openai import ChatOpenAI
                return ChatOpenAI(
                    model=rs.get("ext_model", settings.EXTERNAL_LLM_MODEL),
                    api_key=rs.get("ext_api_key", settings.EXTERNAL_LLM_API_KEY),
                    base_url=ext_base,
                    streaming=streaming,
                    max_tokens=int(rs.get("ext_max_tokens", settings.EXTERNAL_LLM_MAX_TOKENS)),
                    temperature=float(rs.get("ext_temperature", settings.EXTERNAL_LLM_TEMPERATURE)),
                )

    # ── 检索（带缓存 + 日志）─────────────────────────────────────────────

    async def retrieve(
        self,
        kb_id: int,
        query: str,
        k: int = None,
        strategy: str = "similarity",
    ) -> Tuple[List[Tuple], bool]:
        """
        返回 (results, cache_hit)
        results = [(Document, score), ...]
        """
        k = k or settings.TOP_K
        t0 = time.time()

        # 1. 查 QueryCache
        cached = await query_cache.get(kb_id, query, k)
        if cached is not None:
            latency = (time.time() - t0) * 1000
            log_retrieval(kb_id, query, cached, latency,
                          cache_hit=True, strategy=strategy)
            return cached, True

        # 2. 向量检索
        results, filtered_out = await vector_service.similarity_search_async(
            kb_id=kb_id,
            query=query,
            k=k,
            strategy=strategy,
        )

        latency = (time.time() - t0) * 1000
        log_retrieval(kb_id, query, results, latency,
                      cache_hit=False, strategy=strategy,
                      filtered_count=filtered_out)

        # 3. 写 QueryCache
        if results:
            await query_cache.set(kb_id, query, k, results)

        return results, False

    # ── Reranker 重排序 ─────────────────────────────────────────────────────

    async def _rerank(self, query: str, results: List[Tuple]) -> List[Tuple]:
        """对检索结果进行 Cross-Encoder 重排序"""
        if not results:
            return results

        reranker = get_reranker()
        if reranker is None:
            return results

        t0 = time.time()
        try:
            reranked = await reranker.rerank(query, results, top_k=settings.RERANK_TOP_K)
            elapsed = (time.time() - t0) * 1000
            logger.info(
                f"[RERANK] query={query[:50]!r} | "
                f"input={len(results)} → output={len(reranked)} | "
                f"latency={elapsed:.1f}ms"
            )
            return reranked
        except Exception as e:
            logger.error(f"[RERANK] Failed, falling back to original order: {e}")
            return results

    # ── Query 改写与分解 ────────────────────────────────────────────────────

    async def _rewrite_retrieve(
        self,
        kb_id: int,
        query: str,
        history: Optional[List[dict]] = None,
        strategy: str = "hybrid",
    ) -> Tuple[List[Tuple], dict]:
        """
        带改写/分解的检索流程。
        返回 (results, rewrite_meta)
        """
        rs = load_runtime_settings()
        enabled = rs.get("query_rewrite_enabled", settings.QUERY_REWRITE_ENABLED)

        if not enabled:
            results, _ = await self.retrieve(kb_id, query, strategy=strategy)
            return results, {"original_query": query, "mode": "none"}

        rewriter = get_query_rewriter()
        return await rewriter.retrieve_with_rewrite(
            kb_id, query, history=history, strategy=strategy
        )

    # ── Context 构建 ────────────────────────────────────────────────────────

    def _build_context(self, results: List[Tuple]) -> Tuple[str, List[dict]]:
        # 只取前 RERANK_TOP_K 条（已按 sim 降序）
        top_results = results[:settings.RERANK_TOP_K]

        parts = []
        sources = []
        total_len = 0

        for i, (doc, score) in enumerate(top_results):
            filename = doc.metadata.get("filename", "未知文件")
            page = doc.metadata.get("page", "")
            page_info = f"·第{page}页" if page else ""
            content = doc.page_content

            if total_len + len(content) > settings.MAX_CONTEXT_LENGTH:
                remain = settings.MAX_CONTEXT_LENGTH - total_len
                if remain < 100:
                    break
                content = content[:remain] + "…"

            part = f"[{i + 1}] 【{filename}{page_info}】（相关度：{score:.2%}）\n{content}"
            parts.append(part)
            total_len += len(content)

            sources.append({
                "index": i + 1,
                "filename": filename,
                "page": page,
                "score": round(float(score), 4),
                "doc_id": doc.metadata.get("doc_id"),
                "content": doc.page_content[:300] + "…"
                if len(doc.page_content) > 300
                else doc.page_content,
            })

        return "\n\n---\n\n".join(parts), sources

    def _build_prompt_messages(self, history: List[dict]) -> list:
        msgs = [("system", SYSTEM_PROMPT)]
        for msg in history[-6:]:          # 最近 3 轮
            if msg["role"] == "user":
                msgs.append(("human", msg["content"]))
            elif msg["role"] == "assistant":
                msgs.append(("ai", msg["content"]))
        msgs.append(("human", "{question}"))
        return msgs

    # ── 非流式问答 ────────────────────────────────────────────────────────

    async def chat(
        self,
        kb_id: int,
        question: str,
        history: Optional[List[dict]] = None,
        strategy: str = "similarity",
    ) -> Tuple[str, List[dict]]:
        history = history or []

        results, rewrite_meta = await self._rewrite_retrieve(
            kb_id, question, history=history, strategy=strategy
        )
        results = await self._rerank(question, results)
        context, sources = self._build_context(results)

        log_prompt(
            kb_id=kb_id,
            question=question,
            context_length=len(context),
            history_turns=len(history) // 2,
            prompt_tokens_est=len(context) // 2 + len(question) // 2,
        )

        llm = self._get_llm(streaming=False)
        prompt = ChatPromptTemplate.from_messages(
            self._build_prompt_messages(history)
        )
        chain = prompt | llm | StrOutputParser()
        answer = await chain.ainvoke({"context": context, "question": question})
        return answer, sources

    # ── 流式问答 ─────────────────────────────────────────────────────────

    async def chat_stream(
        self,
        kb_id: int,
        question: str,
        history: Optional[List[dict]] = None,
        strategy: str = "similarity",
    ) -> AsyncGenerator[str, None]:
        history = history or []

        results, rewrite_meta = await self._rewrite_retrieve(
            kb_id, question, history=history, strategy="hybrid"
        )
        results = await self._rerank(question, results)
        context, sources = self._build_context(results)

        log_prompt(
            kb_id=kb_id,
            question=question,
            context_length=len(context),
            history_turns=len(history) // 2,
            prompt_tokens_est=len(context) // 2 + len(question) // 2,
        )

        # 先推送改写信息
        if rewrite_meta.get("mode") != "none":
            yield f"data: {json.dumps({'type': 'rewrite', 'data': rewrite_meta}, ensure_ascii=False)}\n\n"

        # 推送来源
        yield f"data: {json.dumps({'type': 'sources', 'data': sources}, ensure_ascii=False)}\n\n"

        if not results:
            msg = "根据当前知识库内容，未找到与该问题相关的信息。"
            yield f"data: {json.dumps({'type': 'token', 'data': msg}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'data': msg}, ensure_ascii=False)}\n\n"
            return

        # MiniMax 外部 API：直接调用，不走 LangChain chain（避免 astream 兼容性问题）
        rs = load_runtime_settings()
        ext_base = rs.get("ext_api_base", "")
        if rs.get("llm_backend") == "external" and "minimaxi.com" in ext_base:
            async for chunk in self._mini_max_stream(history, context, question):
                yield chunk
            return

        # Ollama：用 LangChain 流式
        llm = self._get_llm(streaming=True)
        prompt = ChatPromptTemplate.from_messages(
            self._build_prompt_messages(history)
        )
        chain = prompt | llm

        full_answer = ""
        try:
            async for event in chain.astream({"context": context, "question": question}):
                if hasattr(event, "content") and event.content:
                    token = event.content
                    full_answer += token
                    yield f"data: {json.dumps({'type': 'token', 'data': token}, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)}, ensure_ascii=False)}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'data': full_answer}, ensure_ascii=False)}\n\n"

    async def _mini_max_stream(self, history: list, context: str, question: str) -> AsyncGenerator[str, None]:
        """MiniMax Anthropic API 流式直接调用（绕过 LangChain chain）。"""
        rs = load_runtime_settings()
        api_key = rs.get("ext_api_key", "")
        model = rs.get("ext_model", "MiniMax M2.7")
        base = rs.get("ext_api_base", "https://api.minimaxi.com/anthropic").rstrip("/")
        max_tokens = int(rs.get("ext_max_tokens", 2048))
        temperature = float(rs.get("ext_temperature", 0.3))

        # 构建消息
        msgs = []
        for msg in history[-6:]:
            if msg["role"] == "user":
                msgs.append({"role": "user", "content": msg["content"]})
            elif msg["role"] == "assistant":
                msgs.append({"role": "assistant", "content": msg["content"]})
        full_prompt = f"{SYSTEM_PROMPT.replace('{context}', context)}\n\n用户：{question}"
        msgs.append({"role": "user", "content": full_prompt})

        payload = {
            "model": model,
            "messages": msgs,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
            "thinking_budget": 0,
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }

        full_answer = ""
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0), follow_redirects=True) as client:
                async with client.stream("POST", f"{base}/v1/messages", json=payload, headers=headers) as resp:
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            raw = line[6:]
                            if raw == "[DONE]":
                                break
                            try:
                                chunk = json.loads(raw)
                                if chunk.get("type") == "content_block_delta":
                                    delta = chunk.get("delta", {})
                                    if delta.get("type") == "text_delta":
                                        token = delta.get("text", "")
                                        full_answer += token
                                        yield f"data: {json.dumps({'type': 'token', 'data': token}, ensure_ascii=False)}\n\n"
                            except json.JSONDecodeError:
                                pass
        except Exception as e:
            logger.error(f"MiniMax stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)}, ensure_ascii=False)}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'data': full_answer}, ensure_ascii=False)}\n\n"

    # ── 工具方法 ──────────────────────────────────────────────────────────

    def test_connection(self) -> bool:
        try:
            import httpx
            r = httpx.get(f"{settings.OLLAMA_BASE_URL}/api/tags", timeout=5)
            return r.status_code == 200
        except Exception:
            return False


# 全局单例
rag_service = RAGService()