// Renders report.md and the review sheet from computed results. Pure functions.
import {
  FULL_REVIEW_LIMIT,
  REVIEW_RATIO,
  selectForReview,
  type Group,
  type GroupSummary,
} from './aggregate'
import { EXTRACT_FIELDS, type ExtractField } from './extract-compare'
import type { GuardLayer } from './experiments'
import { A_SYSTEM, A_USER_GOLD, A_USER_RAW, describeFacts } from './group-a'
import type { PageDetail, Results } from './results'
import type { Sample } from './samples'

const DASH = '—'
const pct = (x: number | null | undefined): string =>
  x == null ? DASH : `${(x * 100).toFixed(1)}%`
const num = (x: number | null | undefined, digits = 2): string =>
  x == null ? DASH : x.toFixed(digits)

const GROUP_LABEL: Record<Group, [string, string]> = {
  'A-gold': ['对照组 A：AI 直接写整页', 'gold 事实表的自然语言描述'],
  'A-raw': ['对照组 A：AI 直接写整页', '原始图片和文字'],
  'B-gold': ['实验组 B：实招（代码保证的字段一致性，**由设计保证**）', 'gold 事实表（已确认）'],
  'B-e2e': ['实验组 B：实招（端到端）', '原始图片和文字 → 抽取 → 商家不修改 → 生成'],
}

const FIELD_LABEL: Record<ExtractField, string> = {
  name: '商品名',
  price: '价格',
  spec: '规格',
  phone: '店铺电话',
  address: '店铺地址',
}

const LAYER_LABEL: Record<GuardLayer, string> = {
  rules: '仅规则层',
  'rules-judge': '规则层 + 模型判定层',
}

function conclusion(r: Results): string {
  const s = r.compare.summaries
  const layer: GuardLayer | undefined = r.guard['rules-judge']
    ? 'rules-judge'
    : r.guard.rules
      ? 'rules'
      : undefined
  const rates = layer ? r.guard[layer]!.rates : undefined
  const bGold = s['B-gold']
  const bErrors = bGold && bGold.pages > 0 ? String(bGold.totalPriceNameErrors) : DASH
  const first =
    `直接让 AI 生成整页，每页平均出现 ${num(s['A-gold']?.meanFactErrors)} 处编造或改错的商品信息；` +
    `实招的价格、商品名错误为 ${bErrors}（${bGold?.pages ?? 0} 个页面，由设计保证，不是模型效果），` +
    `编造说法拦截率为 ${pct(rates?.blockRate)}，误伤率为 ${pct(rates?.falsePositiveRate)}` +
    `${layer ? `（${LAYER_LABEL[layer]}，cases.zh.json）` : ''}。`
  const second =
    `端到端（从原始图片和文字出发、商家不做修改）时，实招每页平均 ${num(s['B-e2e']?.meanFactErrors)} 处事实错误；` +
    `对照组 A 使用同样的原始输入时为每页 ${num(s['A-raw']?.meanFactErrors)} 处。`
  return `${first}\n\n${second}`
}

function extractionTable(r: Results): string[] {
  const rows = EXTRACT_FIELDS.map((f) => {
    const x = r.extraction.scores[f]
    return `| ${FIELD_LABEL[f]} | ${x.gold} | ${x.predicted} | ${x.correct} | ${pct(x.precision)} | ${pct(x.recall)} |`
  })
  const diffs = r.extraction.diffs.map(
    (d) =>
      `- \`${d.sampleId}\` ${FIELD_LABEL[d.field]}${d.item ? `（${d.item}）` : ''}：标注 ${d.gold ?? '（无）'}，抽取 ${d.predicted ?? '（无）'}`,
  )
  return [
    '## 实验一：事实抽取准确率',
    '',
    `样本量：${r.samples.length} 组样本，完成 ${r.extraction.completed} 组，失败 ${r.extraction.failed.length} 组。商品按「去空白后名称完全一致」配对，价格与规格只在配对成功的商品上计正确；准确率 = 正确数 / 抽取数，召回率 = 正确数 / 标注数（全部样本合并计算）。`,
    '',
    '| 字段 | 标注数 | 抽取数 | 正确数 | 准确率 | 召回率 |',
    '|---|---:|---:|---:|---:|---:|',
    ...rows,
    '',
    '逐条差异：',
    '',
    ...(diffs.length > 0 ? diffs : ['- 无']),
    ...(r.extraction.failed.length > 0
      ? ['', ...r.extraction.failed.map((f) => `- \`${f.sampleId}\` 抽取失败：${f.error}`)]
      : []),
  ]
}

function compareRow(group: Group, s: GroupSummary | undefined): string {
  const [label, input] = GROUP_LABEL[group]
  if (!s)
    return `| ${label} | ${input} | 0/0 | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${DASH} |`
  const guard = s.guard
    ? `${s.guard.intercepted} / ${s.guard.rewritten} / ${s.guard.removed}`
    : DASH
  return (
    `| ${label} | ${input} | ${s.pages}/${s.attempts} | ${num(s.meanFactErrors)}（合计 ${s.totalFactErrors}） | ` +
    `${num(s.meanPriceNameErrors)}（合计 ${s.totalPriceNameErrors}） | ${num(s.meanUnsupported)}（合计 ${s.totalUnsupported}） | ` +
    `${guard} | ${num(s.meanCostCny, 4)} | ${s.meanLatencyMs == null ? DASH : (s.meanLatencyMs / 1000).toFixed(2)} |`
  )
}

function reviewLine(r: Results): string {
  const total = r.compare.pages.filter((p) => p.ok).length
  const chosen = selectForReview(r.compare.pages.filter((p) => p.ok)).length
  const mode =
    total <= FULL_REVIEW_LIMIT
      ? `本次共 ${total} 个页面（不超过 ${FULL_REVIEW_LIMIT} 个），需全量标注`
      : `本次共 ${total} 个页面（超过 ${FULL_REVIEW_LIMIT} 个），按样本 × 组别分层抽取 ${chosen} 个（不低于 ${REVIEW_RATIO * 100}%）`
  return mode
}

function compareSection(r: Results): string[] {
  const s = r.compare.summaries
  const n = r.config.n
  return [
    '## 实验二：对比实验',
    '',
    `样本量：${r.samples.length} 组样本 × 每组每样本 N=${n} 次 = 每组 ${r.samples.length * n} 次尝试；「页面数」为成功生成的页面数 / 尝试次数。` +
      (r.compare.missing.length > 0
        ? ` 有 ${r.compare.missing.length} 个部分未完成，未计入：${r.compare.missing.join('、')}。`
        : ''),
    '',
    '| 组别 | 输入 | 页面数 | 每页事实错误 | 其中价格与商品名 | 每页无依据说法（规则层计数） | 守卫拦截 / 重写 / 删除（句，合计） | 平均成本（元/次） | 平均模型耗时（秒/次） |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
    ...(['A-gold', 'A-raw', 'B-gold', 'B-e2e'] as const).map((g) => compareRow(g, s[g])),
    '',
    '两类结果分开看，不合成一个数字：',
    '',
    '- **代码保证的字段一致性**（B 组 gold 输入）：实招页面上的商品名、价格、规格和联系方式由代码从商家确认的事实表直接填入，生成后再逐字段核对，所以这一行的价格、商品名错误为 0 是**由设计保证**的，不是模型效果，不应当作模型能力宣传。',
    '- **端到端效果**（B 组原始输入）：从原始图片和文字出发，经过事实抽取、商家不做任何修改、再生成页面，统计页面上的事实错误。这一行才可以与对照组 A 的「原始图片和文字」一行比较；抽取错误会如实传到页面上。',
    '',
    '指标定义（全部由代码计算，不依赖模型判断）：',
    '',
    '- 页面文本：用 HTML 解析器（node-html-parser）提取可见文本，忽略 `<head>`、`<script>`、`<style>`、`<noscript>`、`<template>`，以及标记为 `aria-hidden="true"`、`hidden` 属性、行内样式 `display:none` / `visibility:hidden` 或常见隐藏类名（`hidden`、`invisible`、`sr-only`、`visually-hidden`）的元素（例如卡片序号「01」），两组同样处理；这是静态 DOM 文本，不执行样式表；对照组 A 的 HTML **从不在浏览器中执行**。',
    '- 事实错误 = 页面上不在事实表中的价格（逐处计）+ 事实表中页面缺失的商品价格 + 页面缺失或被改写的商品名（去空白后不出现）+ 页面缺失的店铺电话 + 页面上多出的其他电话号码。一个被改错的价格同时计为「多出一个错误价格」和「缺少正确价格」两处。价格从「¥ / ￥ / 元」前后的数字中提取。',
    '- 平均成本、平均模型耗时：来自每次尝试的模型用量记录（usage_records：费用与每次模型调用耗时之和），按尝试次数平均；B 组含风格、文案、守卫各阶段，端到端一行还含事实抽取。',
    '- 守卫拦截 / 重写 / 删除：B 组事实守卫在初稿中拦截的句数、重写后通过的句数、最终删除的句数。',
    '',
    '### 关于「无依据说法」',
    '',
    '「无依据说法」一列**只用 fact-guard 规则层计数**：把页面可见文本去掉 gold 事实表中的原文后，逐句交给规则层（base + food 规则包）检查，以 gold 事实表为依据，一句命中一条或多条规则记 1 处。这是基于规则的自动计数，可能漏检，也可能误判。',
    '',
    `为避免「自己评自己」，这一项另由 Codex（A2）独立复核：页面总数不超过 ${FULL_REVIEW_LIMIT} 个时全量标注，超过时按样本与组别分层抽样，比例不低于 ${REVIEW_RATIO * 100}%。${reviewLine(r)}。复核清单见同目录 \`review-sheet.csv\`（模板：\`eval/review-template.csv\`），**复核结果单独统计，不并入上表**。`,
  ]
}

function guardSection(r: Results): string[] {
  const rows = (['rules', 'rules-judge'] as const).map((layer) => {
    const g = r.guard[layer]
    if (!g)
      return `| ${LAYER_LABEL[layer]} | 未运行 | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${DASH} |`
    const judge =
      layer === 'rules'
        ? '无'
        : g.judgeProvider === 'mock'
          ? 'mock（固定放行，结果无意义）'
          : g.models.join('、') || (g.judgeProvider ?? DASH)
    const x = g.rates
    return `| ${LAYER_LABEL[layer]} | ${judge} | ${x.blockCases} | ${x.detected} | ${pct(x.blockRate)} | ${x.passCases} | ${x.falsePositives} | ${pct(x.falsePositiveRate)} |`
  })
  const anyGuard = r.guard.rules ?? r.guard['rules-judge']
  return [
    '## 实验三：守卫拦截率与误伤率',
    '',
    `样本量：\`packages/fact-guard/test/cases.zh.json\` 人工标注用例 ${anyGuard ? anyGuard.rates.blockCases + anyGuard.rates.passCases : DASH} 条（应拦截 ${anyGuard?.rates.blockCases ?? DASH} 条，应放行 ${anyGuard?.rates.passCases ?? DASH} 条）。拦截率 = 拦截数 / 应拦截数；误伤率 = 误伤数 / 应放行数。模型判定层只看规则层放行的句子，与生成流水线一致。`,
    '',
    '| 判定方式 | 判定层模型 | 应拦截 | 拦截 | 拦截率 | 应放行 | 误伤 | 误伤率 |',
    '|---|---|---:|---:|---:|---:|---:|---:|',
    ...rows,
    '',
    '说明：该用例集与规则层同由 07 号模块建立，规则是对照这些用例编写的，规则层在其上的成绩偏乐观，不能代表对未见过的说法的拦截能力。',
  ]
}

function configSection(r: Results): string[] {
  return [
    '## 实验配置',
    '',
    `- 运行编号：\`${r.runId}\`（产物目录 \`eval/runs/${r.runId}/\`，不提交到仓库）`,
    `- 模型接口：${r.config.provider}；文本模型 ${r.config.textModel ?? DASH}，视觉模型 ${r.config.visionModel ?? DASH}`,
    `- 接口地址：${r.config.endpoint ?? DASH}；接口配置（LLM_PROFILE）：${r.config.profile ?? DASH}`,
    `- 生成代码指纹：\`${r.config.codeHash}\`（流水线、模板、规则包与对照组 A 生成代码的内容哈希；与当前代码不一致的产物不计入本报告）`,
    `- 实际调用的模型（来自用量记录）：${r.models.length > 0 ? r.models.join('、') : DASH}`,
    `- 温度：对照组 A 生成整页 ${r.config.temperature}；实验组 B 沿用流水线内置温度（风格 0.9、文案 0.6、守卫判定与重写 0、事实抽取 0），对照组 A 的温度取与文案阶段相同的值`,
    `- 每组每样本运行次数 N：${r.config.n}`,
    `- 日期：${r.date}`,
    `- git commit：${r.commit}`,
    `- 样本：${r.samples.map((s) => `\`${s.id}\`（${s.items} 个商品，${s.images} 张图）`).join('、')}`,
  ]
}

const RELATED = [
  '## 相关工作',
  '',
  '- [vectara/hallucination-leaderboard](https://github.com/vectara/hallucination-leaderboard)：用固定文档集衡量模型摘要的幻觉率，本报告的「一句结论 + 表格 + 可复现配置」格式参考了它。不同点：它测通用英文摘要，用模型（HHEM）判定；本评测测中文营销页面，事实错误由代码按商家确认的事实表逐字段比对。',
  '- [zjunlp/FactCHD](https://github.com/zjunlp/FactCHD)：事实冲突幻觉检测基准，关注模型输出与世界知识的冲突。不同点：本评测的依据不是世界知识，而是**商家确认过的事实表**；商家没写的卖点即使在现实中为真，也算无依据说法。',
  '- [ragas](https://github.com/vibrantlabsai/ragas) 的忠实度（faithfulness）指标：衡量回答中的陈述能否由检索到的上下文支持，通常用模型拆句并判定。相同点：都以「给定上下文」为依据；不同点：本评测面向中文营销文案，规则层用确定性规则（数字、成分、产地、认证、排名、绝对化用语等）计数，模型判定层另行报告，人工（A2）复核单独统计。',
]

function appendix(samples: Sample[]): string[] {
  const example = samples[0]
  return [
    '## 附录：对照组 A 提示词全文',
    '',
    '写法参考主流开源 AI 网页生成项目（[abi/screenshot-to-code](https://github.com/abi/screenshot-to-code)、[wandb/openui](https://github.com/wandb/openui)）的常见做法：资深前端角色、Tailwind CSS、移动端优先、写完整内容不留占位注释、占位图片、只返回完整 HTML。因为本项目的模型适配层只提供 JSON 输出接口，最后一行要求把 HTML 放在 JSON 的 `html` 字段里返回，其余与常见写法一致；返回的 HTML 不做任何后处理。',
    '',
    '系统提示词：',
    '',
    '```text',
    A_SYSTEM,
    '```',
    '',
    '用户提示词（gold 事实描述输入）：',
    '',
    '```text',
    A_USER_GOLD,
    '```',
    '',
    '用户提示词（原始图片和文字输入，图片作为多模态附件随消息发送）：',
    '',
    '```text',
    A_USER_RAW,
    '```',
    ...(example
      ? [
          '',
          `\`{facts}\` 的生成示例（样本 \`${example.id}\`）：`,
          '',
          '```text',
          describeFacts(example.gold),
          '```',
        ]
      : []),
  ]
}

export function renderReport(r: Results, samples: Sample[]): string {
  const s = r.compare.summaries
  const limitations = [
    '## 已知局限',
    '',
    `- 样本量小：当前 ${r.samples.length} 组样本，每组 N=${r.config.n} 次；仓库中的 3 组示例是用脚本生成的合成图片，目标是人工补充到 10 组（烘焙甜品 5 组、小餐饮 / 饮品 5 组，单品与菜单各半）。`,
    '- 无依据说法的规则检测可能漏检（规则没覆盖的说法）和误判（例如页面上的营业时间、门牌号以外的数字）；因此由 Codex（A2）独立复核，复核结果单独统计。',
    `- 人工复核比例：页面数不超过 ${FULL_REVIEW_LIMIT} 个时全量，否则分层抽样不低于 ${REVIEW_RATIO * 100}%。`,
    '- 价格只识别「¥ / ￥ / 元」前后的阿拉伯数字：「十二元」这类中文数字、「12-15 元」的区间下限会漏掉；通过样式表规则隐藏的文字仍会被当作可见文本（只识别行内样式和常见隐藏类名）。',
    '- 一个被改错的价格计 2 处（错误价格 + 缺失的正确价格）；商品名只判断是否原样出现，不判断是否放在正确的商品旁边。',
    '- 不在事实表中的价格和电话号码，既计入「事实错误」，也会被规则层当作无依据数字计入「无依据说法」，两列不能相加。',
    '- 实验组 B 的温度由流水线代码固定，对照组 A 只能取一个温度（与文案阶段相同），两组的随机性并不完全可比。',
    `- 失败的生成计入尝试次数和成本，但不计入每页指标${s['A-gold'] && s['A-gold'].failed > 0 ? '（对照组 A 有生成失败）' : ''}。`,
  ]
  const banner = r.mock
    ? [
        '> **注意：本报告由 mock 模型（`PROVIDER=mock`，固定演示数据）生成。下面所有数字只用于验证评测流程能端到端跑通，没有任何意义，不能引用。** 接入真实模型后须重新运行 `pnpm eval:extract && pnpm eval:compare && pnpm eval:guard && pnpm eval:report`，并使用新生成的报告。',
        '',
      ]
    : []
  return [
    `# 实招评测报告（${r.date}）`,
    '',
    ...banner,
    '## 结论',
    '',
    conclusion(r),
    '',
    ...extractionTable(r),
    '',
    ...compareSection(r),
    '',
    ...guardSection(r),
    '',
    ...configSection(r),
    '',
    ...limitations,
    '',
    ...RELATED,
    '',
    ...appendix(samples),
    '',
    '原始数据：同目录 `raw.json`（全部逐页指标、可见文本和配置）。',
    '',
  ].join('\n')
}

export const REVIEW_COLUMNS = [
  'page_id',
  'sample_id',
  'group',
  'run',
  'page_file',
  'visible_text',
  'annotator_unsupported_count',
  'annotator_sentences',
  'annotator',
  'notes',
] as const

export function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One row per page to review; the annotator columns are left empty. */
export function renderReviewSheet(pages: PageDetail[]): string {
  const rows = selectForReview(pages.filter((p) => p.ok)).map((p) =>
    [
      `${p.sampleId}/${p.group}/${p.n}`,
      p.sampleId,
      p.group,
      p.n,
      p.pageFile ?? '',
      p.visibleText,
      '',
      '',
      '',
      '',
    ]
      .map(csvCell)
      .join(','),
  )
  return [REVIEW_COLUMNS.join(','), ...rows].join('\n') + '\n'
}
