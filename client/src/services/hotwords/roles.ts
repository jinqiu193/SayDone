// AI 热词生成 — 角色 / 场景元数据
// 与后端 providers/registry.rs 中的 describe_roles_for_prompt / describe_scenarios_for_prompt
// 保持 id 一致；改这里要同步改后端的 id map

export interface Role {
  id: string
  label: string
  icon: string
  /** 给 LLM 的领域提示词（仅在走 LLM 时使用） */
  promptHint: string
}

export interface Scenario {
  id: string
  label: string
  icon: string
  promptHint: string
}

export const ROLES: Role[] = [
  {
    id: 'developer',
    label: '软件开发者',
    icon: '💻',
    promptHint: '后端 / 前端 / 移动端 / 算法 / 运维 / 数据',
  },
  {
    id: 'product',
    label: '产品经理',
    icon: '🏗️',
    promptHint: '需求、PRD、用户故事、OKR、AB 测试、增长',
  },
  {
    id: 'writer',
    label: '文字工作者',
    icon: '📝',
    promptHint: '公众号、博客、文案、记者、编辑，含网络流行语',
  },
  {
    id: 'student',
    label: '学生 / 科研',
    icon: '🎓',
    promptHint: '论文、笔记、报告，含学科术语、文献引用',
  },
  {
    id: 'business',
    label: '商务 / 销售',
    icon: '💼',
    promptHint: '邮件、合同、客户沟通、汇报，含商务术语',
  },
]

export const SCENARIOS: Scenario[] = [
  {
    id: 'code',
    label: '写代码',
    icon: '💻',
    promptHint: '代码、技术文档、code review',
  },
  {
    id: 'meeting',
    label: '开会',
    icon: '🗣️',
    promptHint: '会议记录、讨论、决策',
  },
  {
    id: 'email',
    label: '写邮件',
    icon: '📧',
    promptHint: '商务邮件、敬语、客套话',
  },
  {
    id: 'chat',
    label: '日常聊天',
    icon: '💬',
    promptHint: '网络流行语、缩写、口语化',
  },
  {
    id: 'document',
    label: '写文档',
    icon: '📄',
    promptHint: '技术文档、说明、教程',
  },
  {
    id: 'note',
    label: '做笔记',
    icon: '🗒️',
    promptHint: '速记、要点、列表',
  },
]

export const MAX_PICKS_PER_CATEGORY = 3

/** 根据角色 id 列表生成默认主题名（用户可改） */
export function defaultThemeName(roleIds: string[], scenarioIds: string[]): string {
  const roleLabels = roleIds
    .map((id) => ROLES.find((r) => r.id === id)?.label)
    .filter(Boolean) as string[]
  const scenarioLabels = scenarioIds
    .map((id) => SCENARIOS.find((s) => s.id === id)?.label)
    .filter(Boolean) as string[]
  const rolePart = roleLabels[0] || '我的'
  const scenarioPart = scenarioLabels.length > 0 ? ` · ${scenarioLabels.join('/')}` : ''
  return `AI 推荐 - ${rolePart}${scenarioPart}`
}
