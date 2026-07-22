"""
数据库连接模块
Package: top.modelx.rag
Author: hua
"""
from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool, StaticPool
from app.core.config import settings
from loguru import logger

is_sqlite = settings.DATABASE_URL.startswith("sqlite")

if is_sqlite:
    engine = create_engine(
        settings.DATABASE_URL,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
        echo=settings.DEBUG,
    )
else:
    engine = create_engine(
        settings.DATABASE_URL,
        poolclass=QueuePool,
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=settings.DATABASE_MAX_OVERFLOW,
        pool_pre_ping=True,
        pool_recycle=3600,
        echo=settings.DEBUG,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    from app.models import knowledge_base, document, conversation
    Base.metadata.create_all(bind=engine)
    _auto_migrate()
    logger.info("Database tables initialized")


def _auto_migrate():
    """自动迁移：给已有表添加缺失的列（无需 Alembic）"""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    with engine.begin() as conn:
        # documents 表新增字段
        if "documents" in insp.get_table_names():
            existing_cols = {c["name"] for c in insp.get_columns("documents")}
            migrations = [
                ("file_hash", "VARCHAR(64)"),
                ("version", "INTEGER DEFAULT 1"),
            ]
            for col_name, col_type in migrations:
                if col_name not in existing_cols:
                    conn.execute(text(
                        f"ALTER TABLE documents ADD COLUMN {col_name} {col_type}"
                    ))
                    logger.info(f"Auto-migrated: documents.{col_name}")
