// 文档模板存储服务

import { getSetting, setSetting } from '@/services/store'
import type { DocumentTemplate, TemplateMatchResult } from './types'

const TEMPLATES_KEY = 'document_templates'
const TEMPLATE_THRESHOLD_KEY = 'template_match_threshold'
const TEMPLATE_ENABLED_KEY = 'template_match_enabled'
const DEFAULT_THRESHOLD = 0.6

const BUILT_IN_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'builtin_leave',
    name: '请假申请',
    triggerKeywords: ['请假', '病假', '年假', '事假', '请假条', '休息一天', '请假申请', 'leave'],
    content: `请假申请

申请人：{{applicant}}
部门：{{department}}
请假类型：{{leaveType}}
请假日期：{{startDate}}
结束日期：{{endDate}}
请假天数：{{days}}
请假原因：{{reason}}

申请人签字：___
日期：___`,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'builtin_notice',
    name: '放假通知',
    triggerKeywords: ['放假', '通知', '节假日', '放假安排', '放假通知', 'notice', 'holiday'],
    content: `【放假通知】

各部门、全体员工：

根据公司安排，现将{{year}}年{{holiday}}放假事项通知如下：

一、放假时间
{{startDate}} 至 {{endDate}}，共 {{days}} 天。

二、值班安排
{{duty}}

三、注意事项
{{notes}}

{{company}}
{{date}}`,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'builtin_report',
    name: '工作周报',
    triggerKeywords: ['周报', '日报', '月报', '工作报告', '工作汇报', '总结', 'report', 'summary'],
    content: `【{{period}}工作报告】

姓名：{{name}}
部门：{{department}}
日期：{{date}}

一、本周工作完成情况
{{completed}}

二、下周工作计划
{{planned}}

三、问题与建议
{{issues}}

四、其他
{{others}}`,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'builtin_meeting',
    name: '会议纪要',
    triggerKeywords: ['会议', '开会', '会议纪要', 'meeting', '会议记录'],
    content: `【会议纪要】

会议主题：{{title}}
会议时间：{{dateTime}}
会议地点：{{location}}
主持人：{{host}}
记录人：{{recorder}}

一、参会人员
{{attendees}}

二、会议议题
{{topics}}

三、讨论内容
{{discussion}}

四、决议事项
{{decisions}}

五、下次会议安排
{{nextMeeting}}

记录人：___    日期：___`,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'builtin_email',
    name: '工作邮件',
    triggerKeywords: ['邮件', 'email', '发邮件', '写邮件', '工作邮件'],
    content: `主题：{{subject}}

收件人：{{to}}
抄送：{{cc}}
密送：{{bcc}}

{{body}}

---
{{sender}}
{{date}}`,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'builtin_memo',
    name: '内部便签',
    triggerKeywords: ['便签', '便条', 'memo', '留言', '条子'],
    content: `【便签】

致：{{to}}
发自：{{from}}
日期：{{date}}

{{content}}

{{signature}}`,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

export async function getTemplates(): Promise<DocumentTemplate[]> {
  const stored = await getSetting<DocumentTemplate[]>(TEMPLATES_KEY, [])
  if (stored.length === 0) {
    await setTemplates(BUILT_IN_TEMPLATES)
    return BUILT_IN_TEMPLATES
  }
  return stored
}

export async function setTemplates(templates: DocumentTemplate[]): Promise<void> {
  await setSetting(TEMPLATES_KEY, templates)
}

export async function addTemplate(template: DocumentTemplate): Promise<void> {
  const templates = await getTemplates()
  templates.push(template)
  await setTemplates(templates)
}

export async function updateTemplate(id: string, updates: Partial<DocumentTemplate>): Promise<void> {
  const templates = await getTemplates()
  const index = templates.findIndex((t) => t.id === id)
  if (index !== -1) {
    templates[index] = { ...templates[index], ...updates, updatedAt: Date.now() }
    await setTemplates(templates)
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const templates = await getTemplates()
  const filtered = templates.filter((t) => t.id !== id)
  await setTemplates(filtered)
}

export async function getTemplateThreshold(): Promise<number> {
  return (await getSetting<number>(TEMPLATE_THRESHOLD_KEY, DEFAULT_THRESHOLD)) ?? DEFAULT_THRESHOLD
}

export async function setTemplateThreshold(threshold: number): Promise<void> {
  await setSetting(TEMPLATE_THRESHOLD_KEY, threshold)
}

export async function getTemplateMatchEnabled(): Promise<boolean> {
  return (await getSetting<boolean>(TEMPLATE_ENABLED_KEY, true)) ?? true
}

export async function setTemplateMatchEnabled(enabled: boolean): Promise<void> {
  await setSetting(TEMPLATE_ENABLED_KEY, enabled)
}

export async function resetTemplates(): Promise<void> {
  await setTemplates(BUILT_IN_TEMPLATES)
}
