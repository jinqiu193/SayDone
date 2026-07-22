"""
文档管理 API - 上传、导入、删除、查询
Package: top.modelx.rag
Author: hua
"""
import os
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, BackgroundTasks, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.config import settings
from app.models import Document, KnowledgeBase, DocStatus
from app.schemas import DocOut, LocalPathImport, ResponseModel, PageData
from app.services.document import doc_service
from loguru import logger

router = APIRouter(prefix="/api/doc", tags=["文档"])


@router.get("", response_model=ResponseModel)
def list_docs(
    kb_id: int = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Document).filter(Document.kb_id == kb_id)
    if status:
        query = query.filter(Document.status == status)
    if keyword:
        query = query.filter(Document.filename.like(f"%{keyword}%"))
    total = query.count()
    items = query.order_by(Document.created_at.desc()) \
        .offset((page - 1) * page_size).limit(page_size).all()
    return ResponseModel(data=PageData(
        total=total, items=[DocOut.model_validate(i) for i in items],
        page=page, page_size=page_size
    ))


@router.post("/upload", response_model=ResponseModel)
async def upload_files(
    background_tasks: BackgroundTasks,
    kb_id: int = Form(...),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """上传文件到指定知识库"""
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    doc_ids = []
    skipped = []
    updated = []
    for f in files:
        if not doc_service.is_supported_file(f.filename):
            raise HTTPException(status_code=400, detail=f"不支持的文件类型: {f.filename}")

        # 保存文件
        content = await f.read()
        if len(content) > settings.MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"文件过大: {f.filename}")

        # 计算文件哈希
        from app.services.document import compute_content_hash
        file_hash = compute_content_hash(content)

        # upsert: 同名文件检测 → 内容相同跳过 / 内容不同覆盖
        dest_path = doc_service.get_upload_path(kb_id, f.filename)
        with open(dest_path, "wb") as out:
            out.write(content)

        doc, is_new = doc_service.upsert_document(
            db=db,
            kb_id=kb_id,
            filename=f.filename,
            file_path=dest_path,
            file_size=len(content),
            file_hash=file_hash,
            source_type="upload",
        )

        if doc.status == DocStatus.PENDING:
            doc_ids.append(doc.id)
            if not is_new:
                updated.append(f.filename)
        else:
            # 内容未变，跳过处理
            skipped.append(f.filename)

    db.commit()

    # 后台异步处理（仅处理有变化的文档）
    for doc_id in doc_ids:
        background_tasks.add_task(doc_service.process_document, db, doc_id)

    msg_parts = []
    if doc_ids:
        msg_parts.append(f"成功上传 {len(doc_ids)} 个文件")
    if updated:
        msg_parts.append(f"更新 {len(updated)} 个文件")
    if skipped:
        msg_parts.append(f"跳过 {len(skipped)} 个未变文件")

    return ResponseModel(
        message="，".join(msg_parts) + "，正在后台处理中" if doc_ids else "所有文件内容未变，无需更新",
        data={"doc_ids": doc_ids, "skipped": skipped, "updated": updated}
    )


@router.post("/import-path", response_model=ResponseModel)
async def import_from_local_path(
    background_tasks: BackgroundTasks,
    body: LocalPathImport,
    db: Session = Depends(get_db),
):
    """从本地路径导入文件"""
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == body.kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    try:
        background_tasks.add_task(
            doc_service.import_from_path,
            db, body.kb_id, body.path, body.recursive
        )
        return ResponseModel(message=f"正在导入路径: {body.path}")
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/import-url", response_model=ResponseModel)
async def import_from_url(
    background_tasks: BackgroundTasks,
    kb_id: int = Form(...),
    url: str = Form(...),
    db: Session = Depends(get_db),
):
    """从 URL 抓取网页内容并存入知识库"""
    import re
    # 简单 URL 格式校验
    if not re.match(r'^https?://', url):
        raise HTTPException(status_code=400, detail="请输入有效的 http/https URL")

    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    try:
        from app.services.document import add_url_document, process_url

        doc_id = add_url_document(db, kb_id, url)
        background_tasks.add_task(process_url, db, kb_id, url, doc_id)
        return ResponseModel(
            message=f"正在抓取网页内容：{url}",
            data={"doc_id": doc_id}
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"URL import error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{doc_id}", response_model=ResponseModel)
def get_doc(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    return ResponseModel(data=DocOut.model_validate(doc))


@router.delete("/{doc_id}", response_model=ResponseModel)
def delete_doc(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    doc_service.delete_document(db, doc_id)
    return ResponseModel(message="删除成功")


@router.post("/{doc_id}/reprocess", response_model=ResponseModel)
async def reprocess_doc(
    doc_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """重新处理失败的文档"""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    doc.status = DocStatus.PENDING
    doc.error_msg = None
    db.commit()
    background_tasks.add_task(doc_service.process_document, db, doc_id)
    return ResponseModel(message="已重新提交处理")
