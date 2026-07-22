"""
URL 网页内容抓取服务
使用 trafilatura（优先）或 requests + BeautifulSoup 抓取网页正文
"""
import re
from typing import Tuple, List, Dict
from langchain_core.documents import Document
from loguru import logger


def scrape_url(url: str, max_chars: int = 50000) -> Tuple[List[Document], Dict]:
    """
    抓取 URL 内容，返回 (documents, metadata)
    自动选择最佳抓取方式：
      - trafilatura：擅长提取文章正文，自动去广告/导航
      - BeautifulSoup：通用备用方案
    """
    content = ""
    extractor = "unknown"

    # 尝试 trafilatura（最佳文章提取）
    try:
        import trafilatura
        downloaded = trafilatura.fetch_url(url)
        if downloaded:
            result = trafilatura.extract(
                downloaded,
                include_comments=False,
                include_tables=True,
                no_fallback=True,
            )
            if result:
                content = result
                extractor = "trafilatura"
    except ImportError:
        logger.debug("trafilatura not installed, falling back to BeautifulSoup")
    except Exception as e:
        logger.warning(f"trafilatura failed for {url}: {e}")

    # 备用：requests + BeautifulSoup
    if not content:
        try:
            import requests
            from bs4 import BeautifulSoup

            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            }
            resp = requests.get(url, headers=headers, timeout=30, verify=True)
            resp.encoding = resp.apparent_encoding or "utf-8"
            soup = BeautifulSoup(resp.text, "html.parser")

            # 移除脚本和样式
            for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                tag.decompose()

            # 优先取 article / main 标签
            main = soup.find("article") or soup.find("main")
            if main:
                content = main.get_text(separator="\n", strip=True)
            else:
                body = soup.find("body") or soup
                content = body.get_text(separator="\n", strip=True)

            # 合并多余空行
            content = re.sub(r"\n{3,}", "\n\n", content).strip()
            extractor = "beautifulsoup"

        except Exception as e:
            logger.error(f"BeautifulSoup scrape failed for {url}: {e}")
            raise ValueError(f"无法抓取网页内容：{e}")

    if not content:
        raise ValueError("抓取成功但未提取到有效正文内容")

    # 截断过长内容
    if len(content) > max_chars:
        content = content[:max_chars] + "\n\n[内容过长已截断]"

    doc = Document(
        page_content=content,
        metadata={"source": url, "extractor": extractor},
    )

    meta = {
        "url": url,
        "extractor": extractor,
        "total_chars": len(content),
    }
    logger.info(f"[URL Scrape] {url} → {len(content)} chars (extractor={extractor})")
    return [doc], meta
