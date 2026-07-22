"""
文档处理服务 - 协调文档解析、分块、向量化
Package: top.modelx.rag
Author: hua
"""
import os
import hashlib
import shutil
from pathlib import Path
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from loguru import logger
from app.core.config import settings
from app.models import Document, KnowledgeBase, DocStatus
from app.services.parser import parser
from app.services.vector_store import vector_service
from app.services.cache import query_cache


def compute_file_hash(file_path: str) -> str:
    """计算文件内容的 SHA256 哈希"""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def compute_content_hash(content: bytes) -> str:
    """计算二进制内容的 SHA256 哈希"""
    return hashlib.sha256(content).hexdigest()


class DocumentService:
    """文档处理服务"""

    def get_upload_path(self, kb_id: int, filename: str) -> str:
        """生成文件存储路径"""
        kb_dir = os.path.join(settings.UPLOAD_DIR, f"kb_{kb_id}")
        os.makedirs(kb_dir, exist_ok=True)
        return os.path.join(kb_dir, filename)

    def is_supported_file(self, filename: str) -> bool:
        ext = Path(filename).suffix.lower().lstrip(".")
        return ext in settings.allowed_extensions_list

    def find_existing_doc(
        self, db: Session, kb_id: int, filename: str
    ) -> Optional[Document]:
        """查找知识库中同文件名的已有文档"""
        return (
            db.query(Document)
            .filter(Document.kb_id == kb_id, Document.filename == filename)
            .first()
        )

    def upsert_document(
        self,
        db: Session,
        kb_id: int,
        filename: str,
        file_path: str,
        file_size: int,
        file_hash: str,
        source_type: str = "upload",
    ) -> Tuple[Document, bool]:
        """
        文档增量更新：同名文件 upsert。
        返回 (document, is_new)：
          - is_new=True  → 新文档
          - is_new=False → 已有同名文档（内容相同则跳过，内容不同则覆盖更新）
        """
        existing = self.find_existing_doc(db, kb_id, filename)

        if existing is None:
            # 新文档
            doc = Document(
                kb_id=kb_id,
                filename=filename,
                file_path=file_path,
                file_type=parser.get_file_type(filename),
                file_size=file_size,
                file_hash=file_hash,
                version=1,
                source_type=source_type,
                status=DocStatus.PENDING,
            )
            db.add(doc)
            db.flush()
            return doc, True

        # 同名文档已存在 → 比较哈希
        if existing.file_hash == file_hash:
            # 内容完全相同，跳过
            logger.info(
                f"[UPSERT] File unchanged, skipping: {filename} "
                f"(doc_id={existing.id}, hash={file_hash[:12]}...)"
            )
            existing.status = DocStatus.COMPLETED  # 确保状态正常
            db.commit()
            return existing, False

        # 内容有变化 → 覆盖更新
        old_version = existing.version or 1
        logger.info(
            f"[UPSERT] File changed, updating: {filename} "
            f"(doc_id={existing.id}, v{old_version}→v{old_version + 1})"
        )

        # 1. 删除旧向量
        vector_service.delete_documents(kb_id, existing.id)

        # 2. 删除旧文件
        if existing.file_path and os.path.exists(existing.file_path):
            try:
                os.remove(existing.file_path)
            except Exception as e:
                logger.warning(f"Failed to delete old file: {e}")

        # 3. 更新记录
        existing.file_path = file_path
        existing.file_size = file_size
        existing.file_hash = file_hash
        existing.file_type = parser.get_file_type(filename)
        existing.version = old_version + 1
        existing.status = DocStatus.PENDING
        existing.error_msg = None
        existing.chunk_count = 0
        existing.char_count = 0
        existing.meta_info = None
        db.commit()

        # 4. 清除查询缓存
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(query_cache.invalidate_kb(kb_id))
            else:
                loop.run_until_complete(query_cache.invalidate_kb(kb_id))
        except RuntimeError:
            pass

        return existing, False

    async def process_document(
        self,
        db: Session,
        doc_id: int,
    ):
        """后台处理文档：解析 + 向量化"""
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            logger.error(f"Document not found: {doc_id}")
            return

        # 更新状态为处理中
        doc.status = DocStatus.PROCESSING
        db.commit()

        try:
            # 1. 解析文档
            documents, meta = parser.parse(doc.file_path, doc.filename)

            # 2. 向量化存储
            # chunk_count = vector_service.add_documents(
            #     kb_id=doc.kb_id,
            #     documents=documents,
            #     doc_id=doc.id,
            #     filename=doc.filename,
            # )

            #  向量化存储（异步）：
            chunk_count = await vector_service.add_documents_async(
                kb_id=doc.kb_id,
                documents=documents,
                doc_id=doc.id,
                filename=doc.filename,
            )

            # 3. 更新文档状态
            doc.status = DocStatus.COMPLETED
            doc.chunk_count = chunk_count
            doc.char_count = meta.get("total_chars", 0)
            doc.meta_info = meta
            db.commit()

            # 4. 更新知识库文档计数
            self._update_kb_doc_count(db, doc.kb_id)
            logger.info(f"Document processed: {doc.filename}, chunks={chunk_count}")

            # 5. 清除查询缓存（新文档入库后旧缓存失效）
            try:
                await query_cache.invalidate_kb(doc.kb_id)
            except Exception as e:
                logger.warning(f"Cache invalidation failed: {e}")

        except Exception as e:
            logger.error(f"Error processing document {doc_id}: {e}")
            doc.status = DocStatus.FAILED
            doc.error_msg = str(e)[:500]
            db.commit()

    def _update_kb_doc_count(self, db: Session, kb_id: int):
        from app.models import DocStatus
        count = db.query(Document).filter(
            Document.kb_id == kb_id,
            Document.status == DocStatus.COMPLETED
        ).count()
        db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).update(
            {"doc_count": count}
        )
        db.commit()

    async def import_from_path(
        self,
        db: Session,
        kb_id: int,
        path: str,
        recursive: bool = True,
    ) -> list:
        """从本地路径导入文件"""
        path_obj = Path(path)
        if not path_obj.exists():
            raise FileNotFoundError(f"Path not found: {path}")

        files = []
        if path_obj.is_file():
            files = [path_obj]
        elif path_obj.is_dir():
            pattern = "**/*" if recursive else "*"
            files = [f for f in path_obj.glob(pattern) if f.is_file()]
        else:
            raise ValueError(f"Invalid path: {path}")

        doc_ids = []
        for f in files:
            if not self.is_supported_file(f.name):
                logger.warning(f"Skipping unsupported file: {f.name}")
                continue

            # 复制文件到上传目录
            dest_path = self.get_upload_path(kb_id, f.name)
            if str(f) != dest_path:
                shutil.copy2(str(f), dest_path)

            # 计算文件哈希
            file_hash = compute_file_hash(dest_path)

            # upsert 文档记录
            doc, is_new = self.upsert_document(
                db=db,
                kb_id=kb_id,
                filename=f.name,
                file_path=dest_path,
                file_size=f.stat().st_size,
                file_hash=file_hash,
                source_type="local_path",
            )
            if doc.status == DocStatus.PENDING:
                doc_ids.append(doc.id)
            # 内容未变则跳过处理

        db.commit()

        # 异步处理所有文档
        for doc_id in doc_ids:
            await self.process_document(db, doc_id)

        return doc_ids

    def delete_document(self, db: Session, doc_id: int):
        """删除文档：删除文件、向量、数据库记录，并清除缓存"""
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return

        kb_id = doc.kb_id

        # 删除向量
        vector_service.delete_documents(kb_id, doc_id)

        # 删除文件
        if doc.file_path and os.path.exists(doc.file_path):
            try:
                os.remove(doc.file_path)
            except Exception as e:
                logger.error(f"Error deleting file: {e}")

        # 删除数据库记录
        db.delete(doc)
        db.commit()

        # 清除查询缓存
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(query_cache.invalidate_kb(kb_id))
            else:
                loop.run_until_complete(query_cache.invalidate_kb(kb_id))
        except RuntimeError:
            pass

        # 更新计数
        self._update_kb_doc_count(db, kb_id)


# 全局单例
doc_service = DocumentService()


# ── URL 抓取处理 ────────────────────────────────────────────────────────

async def process_url(
    db: Session,
    kb_id: int,
    url: str,
    doc_id: int,
):
    """处理 URL：抓取网页内容 → 分块 → 向量化"""
    from app.models import Document, DocStatus
    from app.services.url_scraper import scrape_url

    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        logger.error(f"Document not found: {doc_id}")
        return

    doc.status = DocStatus.PROCESSING
    db.commit()

    try:
        # 1. 抓取网页内容
        documents, meta = scrape_url(url)

        # 2. 向量化存储
        chunk_count = await vector_service.add_documents_async(
            kb_id=kb_id,
            documents=documents,
            doc_id=doc.id,
            filename=url,
        )

        # 3. 更新文档状态
        doc.status = DocStatus.COMPLETED
        doc.chunk_count = chunk_count
        doc.char_count = meta.get("total_chars", 0)
        doc.meta_info = meta
        db.commit()

        # 4. 更新知识库文档计数
        doc_service._update_kb_doc_count(db, kb_id)
        logger.info(f"URL processed: {url}, chunks={chunk_count}")

    except Exception as e:
        logger.error(f"Error processing URL {url}: {e}")
        doc.status = DocStatus.FAILED
        doc.error_msg = str(e)[:500]
        db.commit()


async def add_url_document(
    db: Session,
    kb_id: int,
    url: str,
) -> int:
    """创建 URL 类型的文档记录，返回 doc_id（支持去重）"""
    from app.models import Document, DocStatus, KnowledgeBase

    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
    if not kb:
        raise ValueError(f"知识库不存在: {kb_id}")

    # URL 用其地址的哈希作为 file_hash
    file_hash = hashlib.sha256(url.encode()).hexdigest()

    # 检查是否已有同 URL 文档
    existing = (
        db.query(Document)
        .filter(Document.kb_id == kb_id, Document.filename == url)
        .first()
    )
    if existing:
        if existing.file_hash == file_hash:
            logger.info(f"[URL] Unchanged, skipping: {url}")
            return existing.id
        # URL 内容可能变化，更新
        existing.file_hash = file_hash
        existing.version = (existing.version or 1) + 1
        existing.status = DocStatus.PENDING
        existing.error_msg = None
        existing.chunk_count = 0
        existing.char_count = 0
        existing.meta_info = None
        db.commit()
        return existing.id

    doc = Document(
        kb_id=kb_id,
        filename=url,
        file_path=url,  # 用 URL 作为 file_path
        file_type="url",
        file_size=0,
        file_hash=file_hash,
        version=1,
        source_type="url",
        status=DocStatus.PENDING,
    )
    db.add(doc)
    db.flush()
    db.commit()
    return doc.id
