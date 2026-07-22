import sys
sys.path.insert(0, r'F:\rag-main\backend')
import os
os.chdir(r'F:\rag-main\backend')  # 模拟服务器工作目录
print(f"Working dir: {os.getcwd()}")
print(f"CHROMA_PERSIST_DIR: {__import__('app.core.config', sys.modules).settings.CHROMA_PERSIST_DIR}")

import asyncio, math
from app.services.rag import RAGService

async def test():
    rag = RAGService()
    query = "输液监控系统 智慧医院"
    print(f"\nQuery: {query}")
    print(f"OLLAMA_EMBEDDING_MODEL: {rag._get_llm().model_name if hasattr(rag._get_llm(), 'model_name') else 'unknown'}")

    results, cache_hit = await rag.retrieve(kb_id=1, query=query, k=3)
    print(f"Cache hit: {cache_hit}, Results: {len(results)}")
    for doc, score in results:
        sim = math.exp(-float(score))
        content = doc.page_content[:100].replace('\n', ' ')
        print(f"  sim={sim:.4f} kb={doc.metadata.get('kb_id')} doc={doc.metadata.get('filename', '?')[:30]}: {content}...")

    # Also test without threshold
    from app.services.vector_store import vector_service
    raw, filt = await vector_service.similarity_search_async(kb_id=1, query=query, k=3, score_threshold=0.0)
    print(f"\nRaw (no threshold): {len(raw)}")
    for doc, score in raw[:3]:
        sim = math.exp(-float(score))
        content = doc.page_content[:100].replace('\n', ' ')
        print(f"  sim={sim:.4f}: {content}...")

asyncio.run(test())
