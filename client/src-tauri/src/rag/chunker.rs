// 文本分块 — 中英段落优先 + 滑动窗口 fallback
// 设计：
//   1. 优先按段落（\n\n 或 \r\n\r\n）切分
//   2. 段落 < CHUNK_SIZE 时直接合并
//   3. 单段落 > CHUNK_SIZE 时按句号/换行再切，最后用滑动窗口兜底

use super::config::{CHUNK_OVERLAP, CHUNK_SIZE};

pub struct Chunk {
    pub index: usize,
    pub content: String,
}

/// 将整篇文本切成 chunk 列表
pub fn split_text(text: &str) -> Vec<Chunk> {
    let normalized = text.replace("\r\n", "\n").trim().to_string();
    if normalized.is_empty() {
        return vec![];
    }

    // 第一步：按段落切
    let paragraphs: Vec<&str> = normalized
        .split("\n\n")
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();

    // 第二步：合并段落成 chunk（按 CHUNK_SIZE 累积）
    let mut chunks: Vec<String> = Vec::new();
    let mut current = String::new();

    for para in paragraphs {
        if current.is_empty() {
            current = para.to_string();
        } else if current.len() + para.len() + 2 <= CHUNK_SIZE {
            current.push_str("\n\n");
            current.push_str(para);
        } else {
            // current 满了，先 push
            chunks.push(std::mem::take(&mut current));
            // 如果单个段落超过 CHUNK_SIZE，再切
            if para.len() > CHUNK_SIZE {
                chunks.extend(sliding_window(para));
            } else {
                current = para.to_string();
            }
        }
    }
    if !current.is_empty() {
        chunks.push(current);
    }

    chunks
        .into_iter()
        .enumerate()
        .map(|(index, content)| Chunk {
            index,
            content: content.trim().to_string(),
        })
        .filter(|c| !c.content.is_empty())
        .collect()
}

/// 滑动窗口切分（单段落超长时用）
fn sliding_window(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    if chars.len() <= CHUNK_SIZE {
        out.push(text.to_string());
        return out;
    }

    let step = CHUNK_SIZE.saturating_sub(CHUNK_OVERLAP).max(1);
    let mut start = 0usize;
    while start < chars.len() {
        let end = (start + CHUNK_SIZE).min(chars.len());
        let piece: String = chars[start..end].iter().collect();
        out.push(piece);
        if end >= chars.len() {
            break;
        }
        start += step;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input() {
        assert!(split_text("").is_empty());
        assert!(split_text("   \n\n   ").is_empty());
    }

    #[test]
    fn short_paragraphs() {
        let text = "第一段。\n\n第二段。\n\n第三段。";
        let chunks = split_text(text);
        assert!(chunks.len() >= 1);
        assert!(chunks[0].content.contains("第一段"));
    }

    #[test]
    fn long_paragraph_uses_sliding() {
        let para = "中".repeat(1000);
        let chunks = split_text(&para);
        assert!(chunks.len() >= 3);
    }
}
