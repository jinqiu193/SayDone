# User Memories

- Pipeline路由优先：用户请求进来5秒判断走哪条路
- Critical Rules独占：影响正确性的规则放SKILL.md显眼位置
- 模板代码外置：200字以上的结构化内容 → references/
- Bug文档隔离：根因+修复写bug_fix_guide.md，SKILL.md只引用
- References加"何时加载"列：明确告知Agent何时读什么
- 根目录：`C:/Users/Administrator/AppData/Roaming/LobsterAI/SKILLs/lobsterai-skill-zip-long-doc-agent/`
- 当前版本：integrate_report.py v3（1105行，从bak5恢复）
- 最新验证：`报告生成.docx`（163KB，991段落，包含第13章"资产定位方案"）✅
- **已知Bug**：`人员定位_*.txt` 等非标准文件名会被错误解析，需在TOC循环前加 `if not seq.isdigit(): continue` 保护（已在fix_seq.py中修复并验证）
- **重要**：`integrate_report.py` 大文件写入受工具限制（>10KB含复杂字符串会截断），需通过 `gen_final.py` 脚本或 bak5 备份+edit方式处理
- **三周期分析核心方法论**（2026-04-20）：短期=新闻催化+资金情绪；中期=产业链逻辑+业绩验证；长期=战略壁垒+竞争格局（对应新增6个参数）
