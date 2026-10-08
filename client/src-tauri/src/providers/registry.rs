// 供应商注册表 — Tauri commands 入口

use serde::{Deserialize, Serialize};
use tauri::State;
use super::types::*;
use super::{ai_openai_compat, ai_ollama, app_classifier, asr_doubao, asr_minimax, asr_qwen, asr_qwen_omni, asr_zhipu, meeting_summarize};
use crate::rag;
use crate::storage::Storage;
use std::time::Instant;
use super::prompt_defense::WrapMode;

// ─── AI 生成热词 — 本地兜底词集 ─────────────────────────────────────────────
// 这些词是写死的高质量种子词。未配 AI provider 或 LLM 调用失败时使用。
// 每个角色 80 词左右，匹配前端 hotwords/roles.ts 的 id。

const FALLBACK_HOTWORDS_DEVELOPER: &[&str] = &[
    "Kubernetes", "Docker", "TypeScript", "JavaScript", "Python", "Rust", "Go", "Java", "Kotlin", "Swift",
    "React", "Vue", "Next.js", "Nuxt", "Svelte", "Tauri", "Electron", "Node.js", "Deno", "Bun",
    "WebAssembly", "WebSocket", "GraphQL", "gRPC", "RESTful", "JSON", "YAML", "TOML", "Protobuf", "OpenAPI",
    "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "ClickHouse", "SQLite", "DynamoDB", "Cassandra", "Kafka",
    "AWS", "Azure", "GCP", "阿里云", "腾讯云", "Lambda", "S3", "EC2", "VPC", "CDN",
    "CI/CD", "GitHub Actions", "GitLab CI", "Jenkins", "ArgoCD", "Terraform", "Ansible", "Helm", "Istio", "Envoy",
    "Linux", "Nginx", "Apache", "Systemd", "iOS", "Android", "macOS", "Windows", "VSCode", "JetBrains",
    "async/await", "Promise", "Future", "trait", "lifetime", "borrow checker", "macro", "泛型", "闭包", "协程",
    "monorepo", "微服务", "中台", "高并发", "分布式", "消息队列", "缓存", "索引", "事务", "锁",
];

const FALLBACK_HOTWORDS_PRODUCT: &[&str] = &[
    "PRD", "MRD", "BRD", "用户故事", "用户画像", "用户旅程", "Persona", "OKR", "KPI", "北极星指标",
    "AB 测试", "灰度发布", "MVP", "PMF", "DAU", "MAU", "WAU", "留存率", "流失率", "召回",
    "转化率", "漏斗", "GMV", "ARPU", "LTV", "CAC", "ROI", "ROAS", "CTR", "CVR",
    "增长黑客", "私域", "公域", "渠道", "投放", "拉新", "促活", "留存", "变现", "裂变",
    "需求池", "需求评审", "迭代", "版本", "里程碑", "甘特图", "燃尽图", "看板", "Scrum", "敏捷",
    "竞品分析", "市场调研", "用户访谈", "问卷", "可用性测试", "Aha 时刻", "上瘾模型", "Hook 模型", "福格模型", "上瘾机制",
    "商业画布", "价值主张", "SWOT", "PEST", "5W2H", "SMART", "RICE", "Kano 模型", "波士顿矩阵", "波特五力",
    "B 端", "C 端", "SaaS", "PaaS", "IaaS", "订阅制", "Freemium", "增值服务", "B2B", "B2C",
];

const FALLBACK_HOTWORDS_WRITER: &[&str] = &[
    "公众号", "10w+", "标题党", "完读率", "打开率", "涨粉", "取关", "流量主", "广告主", "互推",
    "知乎", "小红书", "B 站", "抖音", "快手", "头条号", "百家号", "微博", "豆瓣", "即刻",
    "选题", "大纲", "开头", "钩子", "金句", "结尾", "转场", "伏笔", "反转", "高潮",
    "第一人称", "第三人称", "全知视角", "叙事", "倒叙", "插叙", "顺叙", "意识流", "白描", "工笔",
    "比喻", "拟人", "排比", "夸张", "反讽", "反问", "设问", "通感", "借代", "双关",
    "干货", "种草", "测评", "开箱", "横评", "对比", "体验", "上手", "踩雷", "避坑",
    "追热点", "蹭流量", "情绪价值", "共鸣", "代入感", "爽点", "虐点", "甜点", "泪点", "笑点",
    "周更", "日更", "断更", "太监", "填坑", "催更", "首订", "均订", "扑街", "起量",
];

const FALLBACK_HOTWORDS_STUDENT: &[&str] = &[
    "文献综述", "实证研究", "定性研究", "定量研究", "案例研究", "田野调查", "元分析", "扎根理论", "内容分析", "历史研究",
    "显著性", "置信区间", "p-value", "p 值", "假设检验", "t 检验", "卡方检验", "方差分析", "ANOVA", "回归分析",
    "相关性", "因变量", "自变量", "中介变量", "调节变量", "控制变量", "协变量", "样本量", "效应量", "统计功效",
    "引言", "文献综述", "方法", "结果", "讨论", "结论", "参考文献", "致谢", "摘要", "关键词",
    "APA", "MLA", "Chicago", "GB/T 7714", "EndNote", "Zotero", "Mendeley", "知网", "Web of Science", "Scopus",
    "开题", "中期", "答辩", "盲审", "送审", "外审", "查重", "降重", "AI 率", "学术不端",
    "SCI", "SSCI", "CSSCI", "EI", "核心期刊", "影响因子", "分区", "JCR", "中科院分区", "h 指数",
    "第一作者", "通讯作者", "共同一作", "致谢", "项目基金", "国自然", "省自然", "校级", "横向课题", "纵向课题",
];

const FALLBACK_HOTWORDS_BUSINESS: &[&str] = &[
    "报价单", "SOW", "合同", "订单", "发票", "收据", "对账单", "回款", "应收账款", "预付款",
    "ROI", "ROAS", "CPA", "CPC", "CPM", "客单价", "复购率", "转化率", "GMV", "毛利率",
    "私域流量", "公域流量", "裂变", "分销", "代理", "加盟", "直营", "联营", "OEM", "ODM",
    "客户", "用户", "会员", "VIP", "潜客", "商机", "线索", "商机转化", "成单", "续约",
    "客户成功", "客户满意度", "NPS", "净推荐值", "客户旅程", "触点", "售后", "退换货", "投诉", "差评",
    "提案", "Pitch", "BP", "商业计划书", "路演", "尽调", "DD", "估值", "对赌", "排他期",
    "月报", "周报", "日报", "OKR", "复盘", "述职", "晋升", "调薪", "KPI", "360 评估",
    "出差", "报销", "审批", "工单", "SLA", "OKR 复盘", "述职答辩", "客户拜访", "商务谈判", "价格策略",
];

fn builtin_fallback_for_roles(roles: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for role in roles {
        let source: &[&str] = match role.as_str() {
            "developer" => FALLBACK_HOTWORDS_DEVELOPER,
            "product" => FALLBACK_HOTWORDS_PRODUCT,
            "writer" => FALLBACK_HOTWORDS_WRITER,
            "student" => FALLBACK_HOTWORDS_STUDENT,
            "business" => FALLBACK_HOTWORDS_BUSINESS,
            _ => &[],
        };
        for w in source {
            let key = w.to_lowercase();
            if seen.insert(key) {
                out.push((*w).to_string());
            }
        }
    }
    // 单角色全词集（80）已经够用，多角色合并最多 200 词
    out.truncate(200);
    out
}

// 把用户传入的 roles/scenarios id 翻译成中文描述，喂给 LLM
fn describe_roles_for_prompt(roles: &[String]) -> String {
    let map: &[(&str, &str)] = &[
        ("developer", "软件开发者（前后端、移动端、算法、运维、数据）"),
        ("product", "产品经理 / 产品负责人"),
        ("writer", "文字工作者（新媒体、公众号、博客、文案、记者、编辑）"),
        ("student", "学生 / 科研人员（写论文、做研究、做笔记）"),
        ("business", "商务 / 销售 / 客户成功（邮件、合同、客户沟通、汇报）"),
    ];
    let mut out = Vec::new();
    for r in roles {
        if let Some((_, label)) = map.iter().find(|(k, _)| *k == r.as_str()) {
            out.push(*label);
        }
    }
    if out.is_empty() {
        "普通中文用户".to_string()
    } else {
        out.join("、")
    }
}

fn describe_scenarios_for_prompt(scenarios: &[String]) -> String {
    let map: &[(&str, &str)] = &[
        ("code", "写代码 / 技术文档 / code review"),
        ("meeting", "开会 / 会议记录 / 讨论"),
        ("email", "写邮件 / 商务沟通"),
        ("chat", "日常聊天 / 即时通讯"),
        ("document", "写技术文档 / 教程 / 说明书"),
        ("note", "做笔记 / 速记 / 知识整理"),
    ];
    let mut out = Vec::new();
    for s in scenarios {
        if let Some((_, label)) = map.iter().find(|(k, _)| *k == s.as_str()) {
            out.push(*label);
        }
    }
    if out.is_empty() {
        "通用中文语音输入".to_string()
    } else {
        out.join("、")
    }
}

// 从 LLM 输出里解析 JSON 数组（容忍 ```json 块、think 标签、首尾标点）
fn parse_hotwords_array(raw: &str) -> Vec<String> {
    let s = raw.trim();
    // 1) 整体解析
    if let Ok(v) = serde_json::from_str::<Vec<String>>(s) {
        return v.into_iter().filter(|x| !x.trim().is_empty()).map(|x| x.trim().to_string()).collect();
    }
    // 2) 抓第一个 [..] 块
    if let Some(start) = s.find('[') {
        if let Some(rel_end) = s[start..].rfind(']') {
            let slice = &s[start..=start + rel_end];
            if let Ok(v) = serde_json::from_str::<Vec<String>>(slice) {
                return v.into_iter().filter(|x| !x.trim().is_empty()).map(|x| x.trim().to_string()).collect();
            }
            // 3) 退路：regex 抓所有 "..." 字符串
            if let Ok(re) = regex::Regex::new(r#""([^"\\]*(?:\\.[^"\\]*)*)""#) {
                return re
                    .captures_iter(slice)
                    .filter_map(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
                    .filter(|x| !x.is_empty())
                    .collect();
            }
        }
    }
    Vec::new()
}

/// AI 生成热词（Tauri command）
/// 调 LLM 失败 / 未配 / 解析空 → 自动走本地 FALLBACK_HOTWORDS_* 词集
#[tauri::command]
pub async fn ai_generate_hotwords(
    request: AiHotwordsRequest,
) -> Result<AiHotwordsResult, String> {
    let config = &request.ai_config;
    let roles_desc = describe_roles_for_prompt(&request.roles);
    let scenarios_desc = describe_scenarios_for_prompt(&request.scenarios);

    // 触发 fallback 的硬性条件：没配 api_key 或 provider 为空
    let api_key_missing = config.api_key.trim().is_empty()
        || matches!(config.provider.as_str(), "" | "none");
    if api_key_missing {
        log::info!(
            "[ai-generate-hotwords] AI provider 未配置，使用本地词集 (roles={:?})",
            request.roles
        );
        return Ok(AiHotwordsResult {
            words: builtin_fallback_for_roles(&request.roles),
            raw_text: String::new(),
            elapsed_ms: 0,
            source: "fallback".to_string(),
        });
    }

    let system_prompt = format!(
        "你是中文语音输入法的热词生成助手。\n\
         用户角色：[{roles}]\n\
         使用场景：[{scenarios}]\n\
         {extra}\n\
         请生成 80-120 个该角色在该场景下最常说的中文/英文专有名词、术语、产品名、缩写，作为语音输入热词以提升识别准确率。\n\n\
         【硬性输出要求】\n\
         1. 只输出一个合法 JSON 数组，不要任何解释、前后缀、Markdown 代码块标记\n\
         2. 例如：[\"Kubernetes\",\"WebSocket\",\"Tauri\",\"Rust\",\"Cargo\"]\n\
         3. 不要通用词（不要\"这个\"\"那个\"\"然后\"等）\n\
         4. 区分大小写（iOS 与 ios 不同）\n\
         5. 数量控制在 80-120 之间，宁少勿多\n\
         6. 优先：人名/产品名/技术术语/英文术语/缩写/行业黑话",
        roles = roles_desc,
        scenarios = scenarios_desc,
        extra = request
            .extra_context
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .map(|s| format!("补充上下文：{}\n", s))
            .unwrap_or_default(),
    );

    let user_msg = "请按 system 指令生成热词 JSON 数组。".to_string();

    let start = Instant::now();
    let raw = match config.provider.as_str() {
        "openai_compat" | "deepseek" | "doubao" | "qwen" => {
            match ai_openai_compat::polish_with_mode(&user_msg, config, Some(&system_prompt), WrapMode::Chat).await {
                Ok(r) => r.text,
                Err(e) => {
                    log::warn!("[ai-generate-hotwords] LLM 调用失败: {}，走 fallback", e);
                    return Ok(AiHotwordsResult {
                        words: builtin_fallback_for_roles(&request.roles),
                        raw_text: format!("LLM error: {}", e),
                        elapsed_ms: start.elapsed().as_millis() as u64,
                        source: "fallback".to_string(),
                    });
                }
            }
        }
        "ollama" => {
            match ai_ollama::polish_with_mode(&user_msg, config, Some(&system_prompt), WrapMode::Chat).await {
                Ok(r) => r.text,
                Err(e) => {
                    log::warn!("[ai-generate-hotwords] Ollama 调用失败: {}，走 fallback", e);
                    return Ok(AiHotwordsResult {
                        words: builtin_fallback_for_roles(&request.roles),
                        raw_text: format!("LLM error: {}", e),
                        elapsed_ms: start.elapsed().as_millis() as u64,
                        source: "fallback".to_string(),
                    });
                }
            }
        }
        other => {
            return Ok(AiHotwordsResult {
                words: builtin_fallback_for_roles(&request.roles),
                raw_text: format!("未知的 AI 供应商: {}，已使用本地词集", other),
                elapsed_ms: 0,
                source: "fallback".to_string(),
            });
        }
    };

    let elapsed = start.elapsed().as_millis() as u64;
    let words = parse_hotwords_array(&raw);

    if words.is_empty() {
        log::warn!("[ai-generate-hotwords] LLM 输出解析为空，走 fallback");
        return Ok(AiHotwordsResult {
            words: builtin_fallback_for_roles(&request.roles),
            raw_text: raw,
            elapsed_ms: elapsed,
            source: "fallback".to_string(),
        });
    }

    // 截断到 200 词上限
    let mut words = words;
    words.truncate(200);

    Ok(AiHotwordsResult {
        words,
        raw_text: raw,
        elapsed_ms: elapsed,
        source: "llm".to_string(),
    })
}


fn build_polish_system_prompt(
    base_prompt: Option<&str>,
    style: PolishStyle,
    process_name: &str,
) -> String {
    let style_instruction = match style {
        PolishStyle::Casual => "风格：随意、口语化。只修正明显的错字，保持聊天语气。",
        PolishStyle::Formal => "风格：正式书面语。优化句子结构，添加适当标点，保持专业。",
        PolishStyle::Standard | PolishStyle::Auto => {
            "风格：适度润色。修正错字，添加标点，适当断句，不改变原意。"
        }
    };

    let app_note = if !process_name.is_empty() {
        format!("目标应用：{}。", process_name)
    } else {
        String::new()
    };

    let base = base_prompt.unwrap_or("你是语音转文本的校对助手。");
    format!("{}\n\n{}{}", base, app_note, style_instruction)
}

/// 云端 AI 校对（Tauri command）
#[tauri::command]
pub async fn cloud_polish(request: CloudPolishRequest) -> Result<AiResult, String> {
    let config = &request.ai_config;

    let (final_style, process_name) = if let Some(ref target) = request.target_app {
        if target.polish_style == PolishStyle::Auto {
            let detected = app_classifier::classify_app(&target.process_name, &target.window_title);
            (detected, target.process_name.clone())
        } else {
            (target.polish_style, target.process_name.clone())
        }
    } else {
        (PolishStyle::Standard, String::new())
    };

    let system_prompt = build_polish_system_prompt(
        request.system_prompt.as_deref(),
        final_style,
        &process_name,
    );

    match config.provider.as_str() {
        "openai_compat" | "deepseek" | "doubao" | "qwen" => {
            ai_openai_compat::polish(&request.text, config, Some(&system_prompt)).await
        }
        "ollama" => {
            ai_ollama::polish(&request.text, config, Some(&system_prompt)).await
        }
        other => Err(format!("未知的 AI 供应商: {}", other)),
    }
}

/// 云端 AI 对话（Tauri command）
/// 与 cloud_polish 不同，此命令使用助手角色 system prompt，让 AI 直接回答问题。
///
/// 参数：
/// - `system_prompt`：来自前端 preset 的 system_prompt；为 None/空时使用内置默认（兜底）
/// - `mode`：决定 WrapMode。"chat" → WrapMode::Chat（AI 自由回答，不被"只输出文本"约束）；
///   "proofread" 或 None → WrapMode::Proofread（保留旧行为，向后兼容）
/// - `selected_text`：非空时进入"选区操作"分支，使用双信封 prompt 包装
///   选中的文字 + 语音指令，强制 AI 只输出处理后的结果文本。
#[tauri::command]
pub async fn ai_chat(
    request: AiChatRequest,
    storage: State<'_, Storage>,
) -> Result<AiResult, String> {
    let text = request.text;
    let ai_config = request.ai_config;
    let selected_text = request.selected_text.clone();

    if text.trim().is_empty() {
        return Ok(AiResult {
            text: String::new(),
            elapsed_ms: 0,
                    ..Default::default()
        });
    }

    // 决定 system_prompt：前端传了就用前端的，否则用内置默认
    let system_prompt: String = match request.system_prompt.as_deref() {
        Some(s) if !s.trim().is_empty() => s.to_string(),
        _ => "你是一个智能助手。请根据用户的语音输入给出直接、简洁、有用的回答。不需要寒暄和客套话，直接回答用户的问题或回应。如果用户表达的是观点而非问题，可以给出简洁的相关回应或补充。请用中文回答。".to_string(),
    };

    // ─── 选区操作分支：双信封 + Selection 专用 system_prompt + Tavily 联网 ───
    // 进入条件：前端 selected_text 非空（UIA 读到了选区）。
    // 选区路径**不做 RAG**（已有完整上下文），但**仍启用 Tavily**：用户可能想联网查证。
    if let Some(sel) = selected_text.as_deref() {
        if !sel.trim().is_empty() {
            use super::prompt_defense::wrap_selection;
            let custom_prompt = if system_prompt.trim().is_empty() {
                None
            } else {
                Some(system_prompt.as_str())
            };
            let (user_msg, sys_prompt) = wrap_selection(sel, &text, custom_prompt);
            log::info!(
                "[ai-chat] selection mode: sel_len={} voice_cmd_len={}",
                sel.chars().count(),
                text.chars().count()
            );

            // 选区路径也启用 Tavily 联网增强（用户决策：选区即指令也启用）
            let (sys_prompt, tavily_status) = crate::tavily::cmd::tavily_augment_system_prompt(
                storage.inner(),
                &text,
                &sys_prompt,
            )
            .await;

            let result = match ai_config.provider.as_str() {
                "openai_compat" | "deepseek" | "doubao" | "qwen" => {
                    ai_openai_compat::chat_with_preset(&ai_config, &sys_prompt, &user_msg).await
                }
                "ollama" => {
                    ai_ollama::chat_with_preset(&ai_config, &sys_prompt, &user_msg).await
                }
                other => Err(format!("未知的 AI 供应商: {}", other)),
            }?;
            return Ok(AiResult {
                tavily_status: Some(format!("{:?}", tavily_status).to_lowercase()),
                ..result
            });
        }
    }

    // 决定 WrapMode：
    // - mode == "chat" → WrapMode::Chat（自由回答，对应前端的 Chat 预设）
    // - 其他/None → WrapMode::Proofread（保留旧行为，向后兼容）
    use super::prompt_defense::WrapMode;
    let mode = match request.mode.as_deref() {
        Some("chat") => WrapMode::Chat,
        _ => WrapMode::Proofread,
    };

    log::info!(
        "[ai-chat] command: mode={:?}, system_prompt_len={}, text_len={}",
        mode,
        system_prompt.len(),
        text.len()
    );

    // ─── RAG hook + Tavily hook：仅 Chat 模式 ───
    // 流程：先 RAG（本地知识库） → 再 Tavily（联网）→ 拼到 system_prompt 后面
    // Proofread 模式两个 augment 都跳过，按用户决策"仅 Chat 启用"。
    let (system_prompt, tavily_status) = if matches!(mode, WrapMode::Chat) {
        let rag_prompt = match try_rag_augment(storage.inner(), &text, &system_prompt).await {
            Ok(augmented) => augmented,
            Err(e) => {
                log::warn!("[ai-chat] RAG augment 失败，使用原 system_prompt: {}", e);
                system_prompt
            }
        };
        let (with_tavily, status) =
            crate::tavily::cmd::tavily_augment_system_prompt(storage.inner(), &text, &rag_prompt)
                .await;
        (with_tavily, status)
    } else {
        (system_prompt, crate::tavily::types::TavilyStatus::Disabled)
    };

    let result = match ai_config.provider.as_str() {
        "openai_compat" | "deepseek" | "doubao" | "qwen" => {
            ai_openai_compat::polish_with_mode(&text, &ai_config, Some(&system_prompt), mode).await
        }
        "ollama" => {
            ai_ollama::polish_with_mode(&text, &ai_config, Some(&system_prompt), mode).await
        }
        other => Err(format!("未知的 AI 供应商: {}", other)),
    }?;
    Ok(AiResult {
        tavily_status: Some(format!("{:?}", tavily_status).to_lowercase()),
        ..result
    })
}

/// 尝试用 RAG 检索结果增强 system_prompt
/// 失败/未启用/无结果都返回原始 prompt
async fn try_rag_augment(
    storage: &Storage,
    query: &str,
    base_prompt: &str,
) -> Result<String, String> {
    // 读 rag.enabled
    let enabled = storage.with_conn(|conn| {
        rag::store::read_rag_setting(conn, "rag.enabled")
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    });
    if !enabled {
        return Ok(base_prompt.to_string());
    }
    let top_k = storage.with_conn(|conn| {
        rag::store::read_rag_setting(conn, "rag.topK")
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .and_then(|v| v.as_i64())
            .unwrap_or(5)
    });

    // 检索
    let context_opt = rag::cmd::retrieve_context_for_chat(storage, query, top_k, "default").await?;
    let context = match context_opt {
        Some(c) if !c.is_empty() => c,
        _ => return Ok(base_prompt.to_string()),
    };

    // 拼接：原 prompt + RAG 提示段
    let augmented = format!(
        "{}\n\n【参考知识库内容】\n（以下内容来自本地知识库，可作为上下文参考。请基于这些信息和你的判断回答用户问题；如果参考内容与问题无关，可忽略。）\n\n{}",
        base_prompt.trim_end(),
        context.trim()
    );
    Ok(augmented)
}

/// AI 对话请求（前端传入）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatRequest {
    pub text: String,
    pub ai_config: AiProviderConfig,
    /// 前端 preset 的 system_prompt；为 None/空时 Rust 用内置默认
    #[serde(default)]
    pub system_prompt: Option<String>,
    /// "chat" 或 "proofread"；决定 WrapMode
    #[serde(default)]
    pub mode: Option<String>,
    /// 选区操作模式：用户提供选中的文字，AI 按 `text`（语音指令）处理选区。
    /// None/空 → 普通 AI 对话；非空 → 选区操作（双信封 prompt）
    #[serde(default)]
    pub selected_text: Option<String>,
}

/// 测试 AI 连接（Tauri command）
#[tauri::command]
pub async fn test_ai_connection(config: AiProviderConfig) -> Result<TestResult, String> {
    match config.provider.as_str() {
        "openai_compat" | "deepseek" | "doubao" | "qwen" => {
            Ok(ai_openai_compat::test_connection(&config).await)
        }
        "ollama" => {
            Ok(ai_ollama::test_connection(&config).await)
        }
        other => Err(format!("未知的 AI 供应商: {}", other)),
    }
}

/// 测试 ASR 连接（Tauri command）
#[tauri::command]
pub async fn test_asr_connection(config: AsrProviderConfig) -> Result<TestResult, String> {
    match config.provider.as_str() {
        "doubao" => Ok(asr_doubao::test_connection(&config).await),
        "qwen" => Ok(asr_qwen::test_connection(&config).await),
        "qwen_omni" => Ok(asr_qwen_omni::test_connection(&config).await),
        "zhipu" => Ok(asr_zhipu::test_connection(&config).await),
        "minimax" => Ok(asr_minimax::test_connection(&config).await),
        other => Err(format!("未知的 ASR 供应商: {}", other)),
    }
}

/// 云端 ASR 转写（Tauri command）
#[tauri::command]
pub async fn cloud_transcribe(request: CloudTranscribeRequest) -> Result<AsrResult, String> {
    let config = &request.asr_config;
    match config.provider.as_str() {
        "doubao" => {
            asr_doubao::transcribe(
                &request.audio_b64,
                request.sample_rate,
                config,
                &request.hotwords,
            )
            .await
        }
        "qwen" => {
            asr_qwen::transcribe(
                &request.audio_b64,
                request.sample_rate,
                config,
                &request.hotwords,
            )
            .await
        }
        "qwen_omni" => {
            asr_qwen_omni::transcribe(
                &request.audio_b64,
                request.sample_rate,
                config,
                &request.hotwords,
            )
            .await
        }
        "zhipu" => {
            asr_zhipu::transcribe(
                &request.audio_b64,
                request.sample_rate,
                config,
                &request.hotwords,
            )
            .await
        }
        "minimax" => {
            asr_minimax::transcribe(
                &request.audio_b64,
                request.sample_rate,
                config,
                &request.hotwords,
            )
            .await
        }
        other => Err(format!("未知的 ASR 供应商: {}", other)),
    }
}

/// 会议纪要总结（Tauri command）
/// 与 cloud_polish 区别：max_tokens=4096，使用会议专用 system prompt
#[tauri::command]
pub async fn summarize_meeting(
    request: MeetingSummarizeRequest,
) -> Result<AiResult, String> {
    let config = &request.ai_config;

    match config.provider.as_str() {
        "openai_compat" | "deepseek" | "doubao" | "qwen" => {
            meeting_summarize::summarize_meeting(&request.text, config).await
        }
        "ollama" => {
            ai_ollama::summarize_meeting(&request.text, config).await
        }
        other => Err(format!("未知的 AI 供应商: {}", other)),
    }
}
