// 应用感知润色 — 根据目标应用自动选择润色风格
//
// 分类逻辑：
//   聊天/IM  → Casual（保持口语化）
//   邮件/文档 → Formal（书面语）
//   浏览器/通用 → Standard（适度润色）

use super::types::PolishStyle;

const CASUAL_KEYWORDS: &[&str] = &[
    "wechat", "weixin", "dingtalk", "钉钉", "飞书",
    "qq", "tim", "telegram", "slack", "discord",
    "whatsapp", "signal", "line", "kakaotalk",
    "tencent meet", "zoom", "teams", "腾讯会议",
    "企业微信", "微信", "QQ",
];

const FORMAL_KEYWORDS: &[&str] = &[
    "outlook", "foxmail", "thundermail",
    "mail", "邮件", "邮箱",
    "word", "excel", "ppt", "powerpoint",
    "文档", "表格", "演示",
    "notion", "obsidian", "印象笔记",
    "note", "笔记",
];

const FORMAL_EXE: &[&str] = &[
    "OUTLOOK", "EXCEL", "WINWORD", "POWERPNT",
    "THUNDERBIRD", "FOXMAIL",
];

const CASUAL_EXE: &[&str] = &[
    "WECHAT", "WXWORK", "DINGTALK", "FEISHU",
    "Telegram", "Discord", "Slack",
    "QQ", "TIM", "TencentMeeting",
    "zoom", "teams",
];

pub fn classify_app(process_name: &str, window_title: &str) -> PolishStyle {
    let lower_exe = process_name.to_lowercase();
    let lower_title = window_title.to_lowercase();
    let combined = format!("{} {}", lower_exe, lower_title);

    for exe in FORMAL_EXE {
        if lower_exe.contains(&exe.to_lowercase()) {
            return PolishStyle::Formal;
        }
    }
    for exe in CASUAL_EXE {
        if lower_exe.contains(&exe.to_lowercase()) {
            return PolishStyle::Casual;
        }
    }

    for keyword in CASUAL_KEYWORDS {
        if combined.contains(keyword) {
            return PolishStyle::Casual;
        }
    }
    for keyword in FORMAL_KEYWORDS {
        if combined.contains(keyword) {
            return PolishStyle::Formal;
        }
    }

    PolishStyle::Standard
}

pub fn get_polish_instruction(style: PolishStyle) -> &'static str {
    match style {
        PolishStyle::Casual => {
            "你是一个随意的朋友在帮忙整理聊天消息。"
        }
        PolishStyle::Formal => {
            "你是一个专业秘书在帮助润色正式文档。"
        }
        PolishStyle::Standard | PolishStyle::Auto => {
            "你是一个语音转文本的校对助手。"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_casual_wechat() {
        assert_eq!(classify_app("WeChat.exe", "微信"), PolishStyle::Casual);
    }

    #[test]
    fn test_casual_dingtalk() {
        assert_eq!(classify_app("DingTalk.exe", "钉钉 - 对话"), PolishStyle::Casual);
    }

    #[test]
    fn test_formal_outlook() {
        assert_eq!(classify_app("OUTLOOK.EXE", "邮件主题"), PolishStyle::Formal);
    }

    #[test]
    fn test_formal_word() {
        assert_eq!(classify_app("WINWORD.EXE", "文档 - Microsoft Word"), PolishStyle::Formal);
    }

    #[test]
    fn test_standard_chrome() {
        assert_eq!(classify_app("chrome.exe", "Google"), PolishStyle::Standard);
    }
}
