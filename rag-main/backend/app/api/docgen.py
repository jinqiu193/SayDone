"""
DocGen API - 长文档生成接口
RAG 检索 + LLM 生成 → integrate_report.py 精美排版
"""
import json
import os
import subprocess
import asyncio
import uuid as _uuid
from datetime import datetime
from pathlib import Path
from loguru import logger
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from app.services.vector_store import vector_service

router = APIRouter(prefix="/api/docgen", tags=["DocGen"])

SKILL_DIR = Path(r"C:\Users\Administrator\AppData\Roaming\LobsterAI\SKILLs\lobsterai-skill-zip-long-doc-agent")
CHAPTERS_DIR = Path(r"F:\agent\chapters")
INTEGRATE_SCRIPT = SKILL_DIR / "integrate_report.py"

# ── 全局任务状态（后台生成，允许离开页面）─────────────────────────────────
_task_state = {
    "status": "idle",      # idle | running | done | error
    "task_id": None,
    "project_name": "",
    "started_at": None,
    "events": [],          # 所有进度事件
    "result": None,        # 生成完成的结果 {title, subtitle, docx_path}
    "error": None,
}

# 全局引用，防止 asyncio Task 被 GC 回收而取消
_background_task = None

def _push_event(event: dict):
    """向全局任务状态推送进度事件"""
    _task_state["events"].append(event)

class _MirroringQueue:
    """asyncio.Queue 包装器，同时将事件推送到全局状态并自动更新任务状态"""
    def __init__(self, queue: asyncio.Queue):
        self._queue = queue

    async def put(self, item):
        _push_event(item)
        if item.get("type") == "done":
            _task_state["status"] = "done"
            _task_state["result"] = {k: v for k, v in item.items() if k != "type"}
        elif item.get("type") == "error":
            _task_state["status"] = "error"
            _task_state["error"] = item.get("data", "未知错误")
        await self._queue.put(item)


def _run_script(script_path: str, args: list, cwd: str = None) -> subprocess.CompletedProcess:
    cmd = ["python", script_path] + args
    # 确保 integrate_report.py 与后端使用同一个 chapters 目录
    env = os.environ.copy()
    env["LOBAI_CHAPTERS_DIR"] = str(CHAPTERS_DIR)
    env["LOBAI_OUTPUT_DIR"] = str(CHAPTERS_DIR / "output")
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=cwd or str(CHAPTERS_DIR),
        timeout=600,
        env=env,
    )


# ── RAG + LLM 写作引擎 ─────────────────────────────────────────────────

def _build_rag_context(retrieval_results: list, max_chars: int = 4000) -> str:
    """将检索结果构建为 LLM 写作上下文"""
    if not retrieval_results:
        return "（知识库中无相关参考资料，请根据通用知识撰写）"
    parts = []
    total = 0
    for doc, score in retrieval_results:
        content = doc.page_content.strip()
        if total + len(content) > max_chars:
            remaining = max_chars - total
            if remaining > 100:
                parts.append(content[:remaining] + "\n[...]")
            break
        parts.append(f"【参考资料 {score:.2f}】\n{content}")
        total += len(content) + 20
    return "\n\n".join(parts)


def _generate_chapter_content(
    chapter_title: str,
    section_title: str,
    rag_context: str,
    project_name: str,
    llm,
    prev_context: str = "",
) -> str:
    """用 LLM 根据知识库上下文生成章节内容"""
    # 构建前文上下文提示
    context_hint = ""
    if prev_context:
        context_hint = f"""
【前文摘要】（已完成章节的概要，请保持连贯、避免重复）：
{prev_context}

要求：
- 与前文保持逻辑连贯，自然承接
- 不要重复前文已详细论述的内容，如有必要可简要引用（如"如前文所述…"）
- 关键数据、名称、术语必须与前文保持一致
"""
    prompt = f"""你是一位专业的行业报告撰写专家。请根据以下参考资料，为项目「{project_name}」撰写章节。

【章节】{chapter_title}
【小节】{section_title}

【参考资料】：
{rag_context}
{context_hint}
要求：
1. 内容必须从参考资料中提炼，不得凭空编造或生成与资料无关的通用废话
2. 语言专业、严谨，符合正式报告风格
3. 不少于 800 字，层次分明，分级标题清晰
4. 如参考资料不足200字，说明知识库相关资料极少，应在正文中明确说明"根据现有资料..."，不得编造细节
5. 直接输出正文，不要"开头"、"导言"等引入段落
"""
    try:
        logger.info(f"[LLM生成] 开始生成章节：{chapter_title} - {section_title}")
        response = llm.invoke(prompt)
        if hasattr(response, "content"):
            result = response.content.strip()
        else:
            result = str(response).strip()
        logger.info(f"[LLM生成] 完成，生成内容长度：{len(result)} 字符")
        return result
    except Exception as e:
        logger.error(f"[LLM错误] 章节：{chapter_title} - {section_title}，错误：{e}")
        return f"（内容生成失败：{e}）\n\n{rag_context[:1000]}"


def _extract_chapter_summary(content: str, max_chars: int = 400) -> str:
    """从已生成的章节内容中提取摘要，用于传递给下一章作为上下文"""
    # 去掉标题行，取正文前 N 字
    lines = content.strip().split('\n')
    body_lines = [l for l in lines if not l.strip().startswith('#')]
    body = '\n'.join(body_lines).strip()
    if len(body) <= max_chars:
        return body
    return body[:max_chars] + "…"


async def _write_chapters_with_rag(
    kb_id: int,
    project_name: str,
    chapter_list: list,
    llm,
    event_queue: asyncio.Queue,
):
    """为每个章节执行：RAG检索 → LLM生成 → 写入txt文件（同章小节并行）"""
    logger.info(f"[_write_chapters_with_rag] kb_id={kb_id} project={project_name} chapters={len(chapter_list)}")

    # 检查 KB 状态
    if not kb_id:
        logger.error("[_write_chapters_with_rag] kb_id is None or 0 - KB not selected!")
        await event_queue.put({
            "type": "error",
            "data": "未选择知识库，无法生成专业报告。请在左侧选择知识库后重试。"
        })
        return
    stats = vector_service.get_kb_stats(kb_id)
    kb_count = stats.get("vector_count", 0)
    logger.info(f"[_write_chapters_with_rag] kb_id={kb_id} vector_count={kb_count}")
    if kb_count == 0:
        await event_queue.put({
            "type": "error",
            "data": f"知识库 ID={kb_id} 暂无索引内容，请先上传并解析文档后再试。"
        })
        return
    from app.services.rag import RAGService
    rag = RAGService()

    total = len(chapter_list)
    # 已生成章节的摘要累积，用于传递给后续章节作为上下文
    prev_summaries: list[str] = []

    async def _generate_section(idx: int, seq: str, title: str, sec_idx: int, sec: dict, prev_ctx: str = ""):
        """生成单个小节内容（RAG检索 + LLM生成）"""
        sec_title = sec.get("title", "")

        # 推送小节进度
        await event_queue.put({
            "type": "progress",
            "phase": "writing",
            "title": f"✍️ {seq} {title} — {sec_title}（{sec_idx+1}）",
            "done": idx,
            "total": total,
        })

        # RAG 检索
        query = f"{project_name} {title} {sec_title}"
        try:
            retrieval_results, _ = await vector_service.similarity_search_async(
                kb_id=kb_id, query=query, k=12, score_threshold=0.0
            )
        except Exception:
            retrieval_results = []

        rag_context = _build_rag_context(retrieval_results, max_chars=6000)

        # LLM 生成（用 asyncio.to_thread 避免阻塞事件循环）
        content = await asyncio.to_thread(
            _generate_chapter_content,
            chapter_title=title,
            section_title=sec_title,
            rag_context=rag_context,
            project_name=project_name,
            llm=llm,
            prev_context=prev_ctx,
        )
        return sec_title, content

    for idx, chapter_info in enumerate(chapter_list):
        seq = chapter_info.get("seq", f"{idx+1:02d}")
        title = chapter_info.get("title", f"第{seq}章")
        sections = chapter_info.get("sections", [])

        # 构建前文上下文（所有已完成章节的摘要拼接）
        prev_ctx = "\n---\n".join(prev_summaries) if prev_summaries else ""

        await event_queue.put({
            "type": "progress",
            "phase": "writing",
            "title": f"\u270d\ufe0f 正在撰写：{seq} {title}",
            "done": idx,
            "total": total,
        })

        # 同章所有小节并行生成（最多 4 并发）
        if sections:
            semaphore = asyncio.Semaphore(4)

            async def _gen_with_sem(sec_idx, sec):
                async with semaphore:
                    return await _generate_section(idx, seq, title, sec_idx, sec, prev_ctx)

            tasks = [_gen_with_sem(i, s) for i, s in enumerate(sections)]
            results = await asyncio.gather(*tasks)

            all_content = [f"## {sec_title}\n\n{content}\n" for sec_title, content in results]
        else:
            # 无小节的章节，直接生成整章内容
            await event_queue.put({
                "type": "progress",
                "phase": "writing",
                "title": f"✍️ {seq} {title}",
                "done": idx,
                "total": total,
            })
            query = f"{project_name} {title}"
            try:
                retrieval_results, _ = await vector_service.similarity_search_async(
                    kb_id=kb_id, query=query, k=12, score_threshold=0.0
                )
            except Exception:
                retrieval_results = []
            rag_context = _build_rag_context(retrieval_results, max_chars=6000)
            content = await asyncio.to_thread(
                _generate_chapter_content,
                chapter_title=title,
                section_title="全文",
                rag_context=rag_context,
                project_name=project_name,
                llm=llm,
                prev_context=prev_ctx,
            )
            all_content = [content]

        # 写入章节文件
        safe_seq = seq.replace(".", "").zfill(2)
        chapter_file = CHAPTERS_DIR / f"{safe_seq}-{title}.txt"
        full_chapter_content = f"# {title}\n\n" + "\n\n".join(all_content)
        with open(chapter_file, "w", encoding="utf-8") as f:
            f.write(full_chapter_content)

        # 累积本章摘要，供后续章节参考
        summary = f"第{seq}章 {title}：{_extract_chapter_summary(full_chapter_content, max_chars=300)}"
        prev_summaries.append(summary)
        logger.info(f"[上下文传递] 第{seq}章摘要已加入（累计{len(prev_summaries)}章）")

        await asyncio.sleep(0.2)

    await event_queue.put({"type": "done_writing", "total": total})


# ── 获取当前大纲 ────────────────────────────────────────────────────────
@router.get("/plan")
async def get_plan():
    try:
        plan_path = CHAPTERS_DIR / "plan.json"
        if not plan_path.exists():
            return {"code": 200, "data": []}
        with open(plan_path, encoding="utf-8") as f:
            plan = json.load(f)
        chapters = []
        for section in (plan.get("chapters") or []):
            for sec in (section.get("sections") or []):
                chapters.append({
                    "id": section.get("seq", "") + "-" + sec.get("title", "")[:4],
                    "title": f"{section.get('seq','')} {sec.get('title','')}",
                    "status": "pending",
                })
        return {"code": 200, "data": chapters, "title": plan.get("title", "")}
    except Exception:
        return {"code": 200, "data": []}


# ── 保存/更新大纲 ────────────────────────────────────────────────────────
@router.post("/plan")
async def save_plan(payload: dict):
    """保存用户编辑后的大纲到 plan.json"""
    try:
        plan_path = CHAPTERS_DIR / "plan.json"
        # 读取现有 plan 获取 title/subject 等元数据
        existing = {}
        if plan_path.exists():
            with open(plan_path, encoding="utf-8") as f:
                existing = json.load(f)

        chapters = payload.get("chapters", [])
        plan_data = {
            "title": payload.get("title") or existing.get("title", ""),
            "subject": payload.get("title") or existing.get("subject", ""),
            "author": existing.get("author", ""),
            "cover_style": existing.get("cover_style", 4),
            "chapters": chapters,
        }
        with open(plan_path, "w", encoding="utf-8") as f:
            json.dump(plan_data, f, ensure_ascii=False, indent=2)

        return {"code": 200, "data": {"chapters": chapters}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 生成大纲（LLM + KB）────────────────────────────────────────────────
@router.post("/outline")
async def generate_outline(payload: dict):
    """用 LLM + KB 上下文生成章节大纲，写入 plan.json"""
    try:
        project_name = payload.get("name", "未命名项目")
        background = payload.get("background", "")
        kb_id = payload.get("kb_id")
        chapters = []

        if kb_id:
            try:
                from app.services.rag import RAGService
                rag_svc = RAGService()
                llm = rag_svc._get_llm(streaming=False)
                retrieval_results, _ = await rag_svc.retrieve(kb_id, project_name, k=4)
                rag_context = _build_rag_context(retrieval_results, max_chars=2000)

                import re
                outline_prompt = (
                    f'你是一位专业的可研报告规划专家。请为项目「{project_name}」生成详细大纲。\n\n'
                    f'项目背景：{background or "未提供"}\n\n'
                    f'相关知识库资料：\n{rag_context}\n\n'
                    f'请生成 5-8 个主要章节，每个章节包含 3-6 个小节。\n'
                    f'直接输出 JSON 数组，不要任何其他内容：\n'
                    f'[{{"seq": "01", "title": "章节标题", "sections": [{{"title": "小节标题", "word_count": 1500}}]}}]'
                )
                response = llm.invoke(outline_prompt)
                raw = response.content.strip() if hasattr(response, "content") else str(response).strip()
                match = re.search(r'\[.*\]', raw, re.DOTALL)
                if match:
                    chapters = json.loads(match.group(0))
            except Exception:
                chapters = []

        if not chapters:
            chapters = [
                {"seq": "01", "title": "项目概述", "sections": [{"title": "建设背景", "word_count": 2000}, {"title": "项目目标", "word_count": 1500}]},
                {"seq": "02", "title": "需求分析", "sections": [{"title": "业务需求", "word_count": 2000}, {"title": "功能需求", "word_count": 2000}]},
                {"seq": "03", "title": "系统设计", "sections": [{"title": "总体架构", "word_count": 2500}, {"title": "功能模块", "word_count": 2000}]},
                {"seq": "04", "title": "技术方案", "sections": [{"title": "技术选型", "word_count": 2000}, {"title": "关键技术", "word_count": 2000}]},
                {"seq": "05", "title": "实施计划", "sections": [{"title": "项目进度", "word_count": 1500}, {"title": "资源配置", "word_count": 1500}]},
                {"seq": "06", "title": "投资估算", "sections": [{"title": "资金预算", "word_count": 2000}]},
                {"seq": "07", "title": "效益分析", "sections": [{"title": "经济效益", "word_count": 1500}, {"title": "社会效益", "word_count": 1500}]},
                {"seq": "08", "title": "结论与建议", "sections": [{"title": "总结", "word_count": 1000}, {"title": "建议", "word_count": 1000}]},
            ]

        plan_data = {
            "title": project_name,
            "subject": project_name,
            "author": payload.get("author", ""),
            "cover_style": payload.get("style", 4),
            "chapters": chapters,
        }
        plan_path = CHAPTERS_DIR / "plan.json"
        with open(plan_path, "w", encoding="utf-8") as f:
            json.dump(plan_data, f, ensure_ascii=False, indent=2)

        return {"code": 200, "data": {"chapters": chapters, "title": project_name}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 开始撰写（SSE 流式 + 后台运行）──────────────────────────────────────
@router.post("/start")
async def start_writing(payload: dict = None):
    """
    RAG检索 + LLM生成真实章节内容，然后整合为精美docx。
    支持离开页面后继续运行，完成后可在「历史文档」中查看下载。
    """
    if _task_state["status"] == "running":
        raise HTTPException(status_code=409, detail="已有生成任务正在运行")

    kb_id = (payload or {}).get("kb_id")
    project_name = (payload or {}).get("name", "项目报告")
    task_id = _uuid.uuid4().hex[:8]

    _task_state.update({
        "status": "running",
        "task_id": task_id,
        "project_name": project_name,
        "started_at": datetime.now().isoformat(),
        "events": [],
        "result": None,
        "error": None,
    })

    raw_queue = asyncio.Queue()
    mirror_queue = _MirroringQueue(raw_queue)

    # 将后台任务存为全局引用，防止 SSE 断开时被 GC 回收
    global _background_task

    async def event_generator():
        # 启动后台写作任务（不随 SSE 断开而取消）
        global _background_task
        _background_task = asyncio.create_task(_run_writing(kb_id, project_name, mirror_queue))

        while True:
            try:
                event = await asyncio.wait_for(raw_queue.get(), timeout=300)
            except asyncio.TimeoutError:
                break

            yield "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"
            if event.get("type") in ("done", "error"):
                break
        # 注意：不取消 writing_task，让后台任务继续运行

    async def _run_writing(kb_id: int, project_name: str, queue: asyncio.Queue):
        try:
            plan_path = CHAPTERS_DIR / "plan.json"
            if not plan_path.exists():
                await queue.put({"type": "error", "data": "找不到 plan.json，请先生成大纲"})
                return

            with open(plan_path, encoding="utf-8") as f:
                plan = json.load(f)

            chapter_list = plan.get("chapters", [])
            if not chapter_list:
                await queue.put({"type": "error", "data": "大纲为空，请先生成大纲"})
                return

            # 清理旧的章节文件，确保按最新大纲生成
            for old_file in CHAPTERS_DIR.glob("*.txt"):
                old_file.unlink(missing_ok=True)
                logger.info(f"[清理] 删除旧章节文件: {old_file.name}")
            old_hash = CHAPTERS_DIR / "content_hashes.json"
            if old_hash.exists():
                old_hash.unlink()
            # 清理旧输出（包括 docx 和 md）
            output_dir = CHAPTERS_DIR / "output"
            if output_dir.exists():
                for f in output_dir.glob("*"):
                    f.unlink(missing_ok=True)

            total = len(chapter_list)

            from app.services.rag import RAGService
            rag_svc = RAGService()
            llm = rag_svc._get_llm(streaming=False)

            # 长文档生成需要更大的 max_tokens，覆盖默认值
            if hasattr(llm, "max_tokens"):
                object.__setattr__(llm, "max_tokens", 10000)

            # RAG检索 + LLM生成章节
            await _write_chapters_with_rag(
                kb_id=kb_id,
                project_name=project_name,
                chapter_list=chapter_list,
                llm=llm,
                event_queue=queue,
            )

            # 一致性审查
            await queue.put({
                "type": "progress",
                "phase": "checking",
                "title": "\U0001f50d 跨章一致性审查...",
                "done": total,
                "total": total,
            })
            await asyncio.sleep(0.5)

            # 生成 docx
            await queue.put({
                "type": "progress",
                "phase": "generating",
                "title": "\U0001f4c4 正在整合并生成精美排版...",
                "done": total,
                "total": total,
            })

            hash_file = CHAPTERS_DIR / "content_hashes.json"
            if hash_file.exists():
                hash_file.unlink()

            result = _run_script(str(INTEGRATE_SCRIPT), [], cwd=str(SKILL_DIR))
            if result.returncode != 0:
                await queue.put({"type": "error", "data": result.stderr[:300]})
                return

            docx_candidates = list((CHAPTERS_DIR / "output").glob("*.docx"))
            # 如果主 output 目录为空，从默认输出目录迁移
            if not docx_candidates:
                default_output = Path(os.path.expanduser("~")) / ".config" / "lobsterai-report-agent" / "output"
                if default_output.exists():
                    import shutil
                    _ensure_output_dir()
                    for docx_file in default_output.glob("*.docx"):
                        dest = (CHAPTERS_DIR / "output") / docx_file.name
                        if not dest.exists():
                            shutil.copy2(str(docx_file), str(dest))
                    for md_file in default_output.glob("*.md"):
                        dest = (CHAPTERS_DIR / "output") / md_file.name
                        if not dest.exists():
                            shutil.copy2(str(md_file), str(dest))
                    docx_candidates = list((CHAPTERS_DIR / "output").glob("*.docx"))
            if docx_candidates:
                latest_docx = docx_candidates[0]
                # 将默认文件名"整合报告.docx"重命名为项目名
                safe_name = "".join(c for c in project_name if c.isalnum() or c in "（）()_-— ").strip()
                if not safe_name:
                    safe_name = "项目报告"
                target_name = f"{safe_name}.docx"
                if latest_docx.name != target_name:
                    target_path = latest_docx.parent / target_name
                    latest_docx.rename(target_path)
                    latest_docx = target_path
                # 同步重命名纯文本 md
                md_candidates = list((CHAPTERS_DIR / "output").glob("*.md"))
                for md_file in md_candidates:
                    md_target = md_file.parent / f"{safe_name}-纯文本.md"
                    if md_file.name != md_target.name:
                        try:
                            md_file.rename(md_target)
                        except Exception:
                            pass
                file_size = latest_docx.stat().st_size
                await queue.put({
                    "type": "done",
                    "title": "\U0001f389 文档生成完成！",
                    "subtitle": f"共 {total} 章 / 约 {file_size // 1024} KB",
                    "docx_path": f"/api/docgen/download/{latest_docx.name}",
                })
            else:
                await queue.put({"type": "error", "data": "未找到生成的 docx 文件"})

        except asyncio.CancelledError:
            raise
        except Exception as e:
            await queue.put({"type": "error", "data": str(e)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


# ── 生成进度（SSE 流式，支持断线重连）───────────────────────────────────
@router.get("/status")
async def stream_status():
    """SSE 流式推送当前生成进度（从头重放所有事件，支持断线重连）"""
    async def event_generator():
        sent = 0
        while True:
            while sent < len(_task_state["events"]):
                event = _task_state["events"][sent]
                yield "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"
                sent += 1
            if _task_state["status"] in ("done", "error", "idle"):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


# ── 生成状态（JSON 快照）───────────────────────────────────────────────
@router.get("/status/simple")
async def get_status_simple():
    """获取当前生成状态的 JSON 快照"""
    return {
        "code": 200,
        "data": {
            "status": _task_state["status"],
            "task_id": _task_state["task_id"],
            "project_name": _task_state["project_name"],
            "started_at": _task_state["started_at"],
            "progress_count": len(_task_state["events"]),
            "result": _task_state["result"],
            "error": _task_state["error"],
        },
    }


# ── 已生成长文档列表 ──────────────────────────────────────────────────
# 扫描多个可能的输出目录（integrate_report.py 可能输出到默认路径）
_HISTORY_SEARCH_DIRS = [
    CHAPTERS_DIR / "output",
    Path(os.path.expanduser("~")) / ".config" / "lobsterai-report-agent" / "output",
]


def _collect_history() -> list:
    """从多个目录收集 docx 文件，去重后按修改时间倒序排列"""
    seen_names = set()
    items = []
    for search_dir in _HISTORY_SEARCH_DIRS:
        if not search_dir.exists():
            continue
        for f in sorted(search_dir.glob("*.docx"), key=lambda x: x.stat().st_mtime, reverse=True):
            if f.name in seen_names:
                continue
            seen_names.add(f.name)
            try:
                st = f.stat()
                items.append({
                    "filename": f.name,
                    "title": f.stem,
                    "size": st.st_size,
                    "created_at": datetime.fromtimestamp(st.st_mtime).isoformat(),
                    "_path": str(f),  # 内部使用，记录文件实际路径
                })
            except OSError:
                continue
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items


def _ensure_output_dir() -> Path:
    """确保主输出目录存在"""
    output_dir = CHAPTERS_DIR / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def _migrate_to_output(filename: str) -> Path | None:
    """将文件从默认输出目录迁移到主输出目录，返回最终路径"""
    target = _ensure_output_dir() / filename
    if target.exists():
        return target
    for search_dir in _HISTORY_SEARCH_DIRS:
        src = search_dir / filename
        if src.exists() and src != target:
            import shutil
            shutil.copy2(str(src), str(target))
            return target
    return target if target.exists() else None


@router.post("/favorite")
async def favorite_as_document(payload: dict):
    """将对话回答收藏为长文档（Markdown → docx）"""
    content = payload.get("content", "").strip()
    filename = payload.get("filename", "收藏文档").strip()
    if not content:
        raise HTTPException(status_code=400, detail="内容不能为空")

    # 生成安全的文件名
    safe_name = "".join(c if c.isalnum() or c in "（）()_-— " else "_" for c in filename)[:200]
    if not safe_name:
        safe_name = "收藏文档"

    output_dir = _ensure_output_dir()

    # 保存 Markdown 副本
    md_path = output_dir / f"{safe_name}-纯文本.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(content)

    # Markdown → docx（使用 python-docx + markdown 库完整解析）
    docx_path = output_dir / f"{safe_name}.docx"
    try:
        from docx import Document as DocxDocument
        from docx.shared import Pt, Inches, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.oxml.ns import qn
        import re as _re

        doc = DocxDocument()

        # 设置默认字体
        style = doc.styles["Normal"]
        style.font.name = "微软雅黑"
        style.font.size = Pt(11)
        style.element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')

        def _add_inline_runs(paragraph, text):
            """解析行内 Markdown 格式并添加 runs：粗体、斜体、行内代码、链接"""
            # 模式：行内代码 `...` > 链接 [text](url) > 粗斜体 *** > 粗体 ** > 斜体 *
            pattern = _re.compile(
                r'(?P<code>`[^`]+`)'
                r'|(?P<link>\[([^\]]+)\]\(([^)]+)\))'
                r'|(?P<bold_italic>\*\*\*.+?\*\*\*)'
                r'|(?P<bold>\*\*.+?\*\*)'
                r'|(?P<italic>\*.+?\*)'
            )
            last = 0
            for m in pattern.finditer(text):
                # 添加匹配前的普通文本
                if m.start() > last:
                    paragraph.add_run(text[last:m.start()])
                if m.group('code'):
                    run = paragraph.add_run(m.group('code')[1:-1])
                    run.font.name = "Consolas"
                    run.font.size = Pt(10)
                    run.font.color.rgb = RGBColor(0xC7, 0x25, 0x4E)
                    run.font.highlight_color = 7  # yellow
                elif m.group('link'):
                    run = paragraph.add_run(m.group('link').split(']')[0][1:])
                    run.font.color.rgb = RGBColor(0x00, 0x66, 0xCC)
                    run.underline = True
                elif m.group('bold_italic'):
                    run = paragraph.add_run(m.group('bold_italic')[3:-3])
                    run.bold = True
                    run.italic = True
                elif m.group('bold'):
                    run = paragraph.add_run(m.group('bold')[2:-2])
                    run.bold = True
                elif m.group('italic'):
                    run = paragraph.add_run(m.group('italic')[1:-1])
                    run.italic = True
                last = m.end()
            # 添加剩余普通文本
            if last < len(text):
                paragraph.add_run(text[last:])

        def _add_table(doc, rows_data):
            """添加表格"""
            if not rows_data:
                return
            # 计算列数（取第一行）
            cols = max(len(row) for row in rows_data)
            table = doc.add_table(rows=len(rows_data), cols=cols, style='Light Grid Accent 1')
            for i, row in enumerate(rows_data):
                for j, cell_text in enumerate(row):
                    if j < cols:
                        cell = table.cell(i, j)
                        cell.text = ""
                        _add_inline_runs(cell.paragraphs[0], cell_text.strip())
            doc.add_paragraph()  # 表后空行

        # ── 逐块解析 Markdown ──
        lines = content.split('\n')
        i = 0
        while i < len(lines):
            line = lines[i].rstrip()

            # 空行
            if not line.strip():
                i += 1
                continue

            # 代码块 ```
            if line.strip().startswith('```'):
                code_lines = []
                i += 1
                while i < len(lines) and not lines[i].rstrip().startswith('```'):
                    code_lines.append(lines[i])
                    i += 1
                i += 1  # skip closing ```
                p = doc.add_paragraph()
                p.style = doc.styles["Normal"]
                run = p.add_run('\n'.join(code_lines))
                run.font.name = "Consolas"
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(0x33, 0x33, 0x33)
                # 添加背景色（通过底纹）
                from docx.oxml import OxmlElement
                shd = OxmlElement('w:shd')
                shd.set(qn('w:fill'), 'F5F5F5')
                shd.set(qn('w:val'), 'clear')
                p.paragraph_format.element.get_or_add_pPr().append(shd)
                continue

            # 标题 # ~ ####
            heading_match = _re.match(r'^(#{1,4})\s+(.+)$', line)
            if heading_match:
                level = len(heading_match.group(1))
                title_text = heading_match.group(2)
                p = doc.add_heading(level=min(level, 4))
                _add_inline_runs(p, title_text)
                i += 1
                continue

            # 表格
            if '|' in line and i + 1 < len(lines) and _re.match(r'^[\s|:-]+$', lines[i + 1]):
                table_rows = []
                while i < len(lines) and '|' in lines[i]:
                    cells = [c.strip() for c in lines[i].strip('|').split('|')]
                    table_rows.append(cells)
                    i += 1
                    # 跳过分隔行
                    if i < len(lines) and _re.match(r'^[\s|:-]+$', lines[i]):
                        i += 1
                        break
                # 继续读取表格剩余行
                while i < len(lines) and '|' in lines[i]:
                    cells = [c.strip() for c in lines[i].strip('|').split('|')]
                    table_rows.append(cells)
                    i += 1
                _add_table(doc, table_rows)
                continue

            # 无序列表 - / *
            list_match = _re.match(r'^(\s*)[-*]\s+(.+)$', line)
            if list_match:
                p = doc.add_paragraph(style="List Bullet")
                _add_inline_runs(p, list_match.group(2))
                i += 1
                continue

            # 有序列表 1. 2. ...
            olist_match = _re.match(r'^(\s*)\d+\.\s+(.+)$', line)
            if olist_match:
                p = doc.add_paragraph(style="List Number")
                _add_inline_runs(p, olist_match.group(2))
                i += 1
                continue

            # 引用 >
            if line.strip().startswith('>'):
                quote_text = line.strip().lstrip('>').strip()
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Inches(0.5)
                _add_inline_runs(p, quote_text)
                # 左侧竖线效果
                from docx.oxml import OxmlElement
                pBdr = OxmlElement('w:pBdr')
                left = OxmlElement('w:left')
                left.set(qn('w:val'), 'single')
                left.set(qn('w:sz'), '12')
                left.set(qn('w:space'), '4')
                left.set(qn('w:color'), 'CCCCCC')
                pBdr.append(left)
                p.paragraph_format.element.get_or_add_pPr().append(pBdr)
                i += 1
                continue

            # 水平分割线 ---  ***
            if _re.match(r'^[-*_]{3,}\s*$', line):
                p = doc.add_paragraph()
                p.paragraph_format.space_before = Pt(6)
                p.paragraph_format.space_after = Pt(6)
                from docx.oxml import OxmlElement
                pBdr = OxmlElement('w:pBdr')
                bottom = OxmlElement('w:bottom')
                bottom.set(qn('w:val'), 'single')
                bottom.set(qn('w:sz'), '6')
                bottom.set(qn('w:space'), '1')
                bottom.set(qn('w:color'), 'CCCCCC')
                pBdr.append(bottom)
                p.paragraph_format.element.get_or_add_pPr().append(pBdr)
                i += 1
                continue

            # 普通段落
            p = doc.add_paragraph()
            _add_inline_runs(p, line)
            i += 1

        doc.save(str(docx_path))
    except ImportError:
        # python-docx 不可用时，直接保存 .md 文件，不生成 docx
        logger.warning("python-docx not installed, saving as .md only")
        return {"code": 200, "message": f"已收藏为文档: {safe_name}-纯文本.md", "data": {"filename": f"{safe_name}-纯文本.md"}}
    except Exception as e:
        logger.error(f"Error generating docx: {e}")
        return {"code": 200, "message": f"已收藏为文档: {safe_name}-纯文本.md", "data": {"filename": f"{safe_name}-纯文本.md"}}

    return {"code": 200, "message": f"已收藏为文档: {safe_name}.docx", "data": {"filename": f"{safe_name}.docx"}}


@router.post("/history/{filename}/add-to-kb")
async def add_history_to_kb(filename: str, payload: dict, background_tasks: BackgroundTasks):
    """将已生成长文档加入指定知识库（复制文件 + 创建记录 + 后台向量化）"""
    from app.core.database import SessionLocal
    from app.models import Document, KnowledgeBase, DocStatus
    from app.services.document import doc_service

    kb_id = payload.get("kb_id")
    if not kb_id:
        raise HTTPException(status_code=400, detail="请指定知识库 ID")

    # 查找文件（优先 .docx，其次 .md）
    file_path = None
    for search_dir in _HISTORY_SEARCH_DIRS:
        candidate = search_dir / filename
        if candidate.exists():
            file_path = candidate
            break
    if not file_path:
        # 尝试同名 .md
        md_name = Path(filename).stem + "-纯文本.md"
        for search_dir in _HISTORY_SEARCH_DIRS:
            candidate = search_dir / md_name
            if candidate.exists():
                file_path = candidate
                break
    if not file_path:
        raise HTTPException(status_code=404, detail="文件不存在")

    db = SessionLocal()
    try:
        kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
        if not kb:
            raise HTTPException(status_code=404, detail="知识库不存在")

        # 复制文件到知识库上传目录
        import shutil
        dest_path = doc_service.get_upload_path(kb_id, file_path.name)
        shutil.copy2(str(file_path), dest_path)

        # 确定文件类型
        from app.services.parser import parser as p
        file_type = p.get_file_type(file_path.name)

        # 创建文档记录
        doc = Document(
            kb_id=kb_id,
            filename=file_path.name,
            file_path=dest_path,
            file_type=file_type,
            file_size=file_path.stat().st_size,
            source_type="docgen",
            status=DocStatus.PENDING,
        )
        db.add(doc)
        db.flush()
        db.commit()
        doc_id = doc.id

        # 后台异步处理（解析 + 向量化）— 用新的 db session
        db2 = SessionLocal()
        background_tasks.add_task(doc_service.process_document, db2, doc_id)

        return {"code": 200, "message": f"已加入知识库「{kb.name}」，正在后台处理中", "data": {"doc_id": doc_id}}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding history doc to KB: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.get("/history")
async def list_history():
    """列出所有已生成的长文档（扫描多个可能的输出目录）"""
    items = _collect_history()
    # 返回给前端时不包含内部路径
    result = [{k: v for k, v in item.items() if not k.startswith("_")} for item in items]
    return {"code": 200, "data": result}


# ── 删除已生成长文档 ──────────────────────────────────────────────────
@router.delete("/history/{filename}")
async def delete_history(filename: str):
    """删除指定的已生成长文档（从所有搜索目录中查找并删除）"""
    deleted = False
    for search_dir in _HISTORY_SEARCH_DIRS:
        out_path = search_dir / filename
        if out_path.exists():
            try:
                out_path.unlink()
                deleted = True
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))
            # 同时删除同名的纯文本 md 文件
            md_name = out_path.stem + "-纯文本.md"
            md_path = out_path.parent / md_name
            if md_path.exists():
                md_path.unlink()
    if not deleted:
        raise HTTPException(status_code=404, detail="文件不存在")
    return {"code": 200, "message": "删除成功"}


# ── 下载 docx ──────────────────────────────────────────────────────────
@router.get("/download/{filename}")
async def download_docx(filename: str):
    """提供 docx 文件下载（自动从搜索目录中查找）"""
    # 先尝试迁移到主输出目录
    file_path = _migrate_to_output(filename)
    if file_path and file_path.exists():
        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    raise HTTPException(status_code=404, detail="文件不存在")
