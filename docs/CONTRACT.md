# 实招 Shizhao：共享契约

> 每个模块的开发会话都要先阅读本文件。本文件定义各模块之间唯一允许的通信方式。第 01 号提示词负责把它落成 `lib/core/` 的代码和 `docs/CONTRACT.md`；之后任何模块都不得自行修改。

## 1. 项目一句话

实招（Shizhao）是一个开源 AI 商家宣传页生成器：小商家上传商品照片和文字，系统生成手机宣传页和二维码。**AI 只决定视觉风格和氛围文案；商品名、价格、规格、联系方式由代码从商家确认过的事实表直接填入页面；AI 写的每句文案都要经过事实守卫检查。** 口号：AI 只改颜值，不改事实。

本项目定位为**可信 AI 营销内容的基础设施**，采用「开源核心 + 商业服务」模式：

| 层级 | 内容 | 本次实现方式 |
|---|---|---|
| 开源免费 | fact-guard 规则层、评测基准、小店宣传页样板应用 | 完整实现 |
| 商业服务 | 模型判定层 API、行业规则包、企业私有部署 | 以 API Key 区分权限，不做计费 |

当前版本不做下单、支付和商家账号体系。顾客可以对宣传页提交纠错，商家确认后才生效（开源协作中 Issue → PR → 合并的迁移）。

## 2. 仓库结构

```
shizhao/
├── app/                      # Next.js App Router：商家界面、API 路由、/p/[slug] 公开页
├── lib/
│   ├── core/                 # 共享 zod schema、类型、状态机（本契约的代码形态）
│   ├── db/                   # Drizzle schema、迁移、数据访问函数
│   ├── providers/            # M0 模型适配层
│   ├── assets/               # M2 素材上传
│   ├── extract/              # M3 事实抽取
│   ├── design/               # M5 风格生成
│   ├── copy/                 # M7 文案生成（调用 packages/fact-guard）
│   ├── render/               # M6 渲染器
│   ├── jobs/                 # M9 任务编排
│   ├── publish/              # M11 发布与二维码
│   ├── stats/                # M12 访问统计
│   ├── qa/                   # M8 生成后质检（本次已砍，保留目录供赛后）
│   └── corrections/          # M18 顾客纠错
├── packages/
│   └── fact-guard/           # M7 事实守卫，零运行时依赖，可独立发布
├── templates/<templateId>/   # M6 模板插件
├── rules/packs/              # 行业规则包 YAML（base、food）
├── eval/                     # M16 评测集与对比实验
├── docs/
└── data/                     # 运行时数据（gitignore）：db.sqlite、uploads/、pages/
```

## 3. 核心类型（zod schema，位于 `lib/core/schemas.ts`）

```ts
import { z } from 'zod'

export const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const FactSource = z.enum(['merchant_text', 'image_ocr', 'merchant_edit'])

export const Price = z.object({
  amount: z.number().nonnegative().multipleOf(0.01),
  currency: z.literal('CNY'),
  unit: z.string().min(1).max(8).optional(), // 例如「个」「6 寸」「份」「杯」；只取商家原文，原文没写时留空
})

export const FactItem = z.object({
  id: z.string().min(1),                     // 稳定 id，例如 nanoid(8)
  name: z.string().min(1).max(30),
  price: Price.optional(),
  spec: z.string().max(40).optional(),       // 规格，例如「约 450g」
  description: z.string().max(120).optional(),
  tags: z.array(z.string().max(10)).max(5).default([]),
  imageAssetIds: z.array(z.string()).max(6).default([]),
  sources: z.record(z.enum(['name', 'price', 'spec', 'description']), FactSource).default({}),
})

export const Shop = z.object({
  name: z.string().min(1).max(30),
  phone: z.string().max(20).optional(),
  wechat: z.string().max(40).optional(),
  address: z.string().max(80).optional(),
  hours: z.string().max(40).optional(),
  mapUrl: z.string().url().refine(u => u.startsWith('https://'), '仅允许 https 链接').optional(), // 渲染前再次校验
})

export const FactSheet = z.object({
  projectId: z.string(),
  revision: z.number().int().positive(),
  shop: Shop,
  items: z.array(FactItem).min(1).max(30),
  extraClaims: z.array(z.string().max(30)).max(10).default([]), // 商家明确声明的卖点，文案只能引用这里和上面的字段
  confirmedAt: z.string().datetime().nullable(),
})

export const TemplateId = z.enum(['poster', 'card-stack', 'menu-board'])
export const FontId = z.enum(['noto-sans-sc', 'noto-serif-sc', 'lxgw-wenkai', 'zcool-xiaowei', 'zcool-kuaile']) // 均为 OFL 许可

export const DesignSpec = z.object({
  templateId: TemplateId,
  palette: z.object({ bg: Hex, surface: Hex, primary: Hex, accent: Hex, text: Hex }),
  fontPair: z.object({ heading: FontId, body: FontId }),
  decoration: z.enum(['none', 'paper', 'confetti', 'line-art', 'grain']),
  heroLayout: z.enum(['full-bleed', 'split', 'stacked']),
  motion: z.enum(['none', 'subtle']),
  moodKeywords: z.array(z.string().max(6)).min(1).max(4),
  seed: z.number().int().nonnegative(),
})

export const CopyDraft = z.object({
  headline: z.string().min(1).max(20),
  subhead: z.string().max(40),
  itemBlurbs: z.record(z.string(), z.string().max(60)), // key 为 FactItem.id
  closing: z.string().max(40),
})

export const GuardViolation = z.object({
  field: z.string(),                         // 例如 'headline' 或 'itemBlurbs.ab12cd34'
  sentence: z.string(),
  reason: z.enum(['unsupported_number', 'unsupported_claim', 'ad_law_absolute', 'llm_flagged']),
  evidence: z.string().optional(),           // 命中的词或模型给出的理由
})

export const GuardResult = z.object({
  copy: CopyDraft,                           // 清洗后的文案
  violations: z.array(GuardViolation),       // 最初检测到的全部违规
  rewritten: z.number().int().nonnegative(), // 重写后通过的句数
  removed: z.number().int().nonnegative(),   // 最终删除的句数
})

export const JobStatus = z.enum(['queued', 'designing', 'writing', 'guarding', 'rendering', 'checking', 'succeeded', 'failed', 'timed_out'])

export const Usage = z.object({
  provider: z.string(),
  model: z.string(),
  stage: z.string(),                         // 例如 'extract' | 'design' | 'copy' | 'guard'
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costCny: z.number().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
})

export const QaIssue = z.object({
  severity: z.enum(['blocking', 'advisory']),
  code: z.string(),                          // 例如 'fact_mismatch' | 'horizontal_overflow' | 'image_broken'
  message: z.string(),
})
export const QaReport = z.object({ passed: z.boolean(), issues: z.array(QaIssue), screenshots: z.array(z.string()) })
```

## 4. 任务状态机（`lib/core/job-state.ts`）

```
queued → designing → writing → guarding → rendering → checking → succeeded
任一非终态 → failed | timed_out
终态：succeeded、failed、timed_out（不可再转换）
```

只能通过 `transition(job, next)` 改变状态；非法转换抛出 `InvalidTransitionError`。

项目的展示状态由数据推导，不单独存储：

| 展示状态 | 条件 |
|---|---|
| `generating` | 存在非终态的任务 |
| `previewable` | 没有运行中的任务，存在成功版本，`publishedVersionId` 为空 |
| `live` | `publishedVersionId` 非空且项目未下线 |

## 5. 数据库表（Drizzle，`lib/db/schema.ts`）

| 表 | 字段 |
|---|---|
| `projects` | id (text pk)、slug (text unique，6 位，字符集 `23456789abcdefghjkmnpqrstuvwxyz`)、type (`single`/`menu`)、title、publishedVersionId (nullable)、unpublishedAt (nullable)、createdAt、deletedAt (nullable) |
| `assets` | id、projectId、kind (`image`/`text`)、path、width、height、sha256、bytes、text (nullable)、createdAt |
| `fact_sheets` | projectId、revision、json (FactSheet)、confirmedAt (nullable)、createdAt；主键 (projectId, revision) |
| `jobs` | id、projectId、factRevision、status、stage、seed、error (nullable)、startedAt、finishedAt (nullable)、createdAt、brief (json nullable，R11) |
| `versions` | id、projectId、jobId (nullable，纠错重渲染时为空)、origin (`generate`/`correction`)、factRevision、designSpec (json)、copy (json)、guard (json)、htmlPath、qa (json nullable)、createdAt |
| `usage_records` | id、jobId (nullable)、projectId、Usage 各字段、createdAt |
| `visit_events` | id、projectId、versionId、source (`qr`/`link`)、action (`view`/`call`/`wechat_copy`/`navigate`)、createdAt |
| `corrections` | id、projectId、versionId、field（事实路径，如 `items.<id>.price`、`shop.phone`，或 `other`）、suggestedValue (≤100)、note (nullable，≤200)、status (`pending`/`accepted`/`rejected`/`spam`)、resultRevision (nullable)、createdAt、resolvedAt (nullable)；**不含任何顾客身份信息** |

所有时间字段为 ISO 8601 字符串（UTC）。

## 6. API 路由

| 方法 | 路径 | 说明 | 负责模块 |
|---|---|---|---|
| POST | `/api/projects` | 新建项目 → `{ id, slug }` | 01 |
| DELETE | `/api/projects/:id` | 删除项目及其全部文件 | 01 |
| POST | `/api/projects/:id/assets` | multipart 上传图片和文字 | 03 |
| POST | `/api/projects/:id/extract` | 抽取事实 → 新 revision 的未确认 FactSheet | 04 |
| PUT | `/api/projects/:id/facts` | 保存商家修改（生成新 revision） | 04 |
| POST | `/api/projects/:id/facts/confirm` | 确认最新 revision | 04 |
| POST | `/api/projects/:id/jobs` | 发起生成（可选请求体 `{ styleBrief? }`，见 R11）→ `{ jobId }` | 08 |
| GET | `/api/jobs/:id` | `{ status, stage, etaSeconds: [lo, hi], error? }` | 08 |
| GET | `/api/projects/:id/versions` | 版本列表 | 08 |
| GET | `/api/versions/:id/preview` | 预览 HTML（需管理口令） | 08 |
| POST | `/api/projects/:id/publish` | `{"versionId":"<版本ID>","factsConfirmed":true}` 发布；`factsConfirmed` 只有在商家核对过该版本页面上的事实后才能设为 `true`，缺少或不为 `true` 返回 400 | 09 |
| POST | `/api/projects/:id/unpublish` | 下线 | 09 |
| GET | `/api/projects/:id/qr` | 二维码 PNG / SVG（`?format=svg`） | 09 |
| GET | `/p/:slug` | 公开宣传页 | 10 |
| POST | `/api/track` | 访问与点击埋点 | 10 |
| GET | `/api/projects/:id/stats` | 统计汇总 | 10 |
| POST | `/api/corrections` | 顾客提交纠错（公开，限流） | 15 |
| GET | `/api/projects/:id/corrections` | 纠错列表 | 15 |
| POST | `/api/corrections/:id/accept` | 采纳 `{ value? }` → 新 revision + 重渲染 + 发布 | 15 |
| POST | `/api/corrections/:id/reject` | 忽略 | 15 |
| POST | `/api/guard` | 营销文案事实检查 API（无 Key 仅规则层，有 Key 可用模型判定与行业规则包） | 16 |
| GET | `/check` | 文案检查页（公开） | 16 |

除 `/p/:slug`、`/api/track`、`POST /api/corrections`、`/api/guard`、`/check` 外，所有路由都要求管理口令（见第 7 节 `ADMIN_TOKEN`；匿名例外另见 R6 等修订，登录与登出接口除外）。脚本调用时在请求头写 `Authorization: Bearer <ADMIN_TOKEN>`，商家后台登录后用 Cookie。各请求体与可串联的 curl 示例见 [API-quickstart.md](API-quickstart.md)。错误响应统一为 `{ error: { code: string, message: string } }`，`message` 为中文且不泄露内部细节。

## 7. 环境变量（`.env.example`）

| 变量 | 必需 | 说明 |
|---|---|---|
| `PROVIDER` | 否 | `mock`（默认）或 `openai-compatible` |
| `LLM_BASE_URL` | 选 openai-compatible 时必需 | 任意 OpenAI 兼容接口：通义千问 DashScope 兼容模式、DeepSeek、智谱、模力方舟、Ollama（`http://localhost:11434/v1`）等 |
| `LLM_API_KEY` | 视服务而定 | Ollama 可留空 |
| `LLM_MODEL_TEXT` | 同上 | 文本模型名 |
| `LLM_MODEL_VISION` | 同上 | 视觉模型名（用于事实抽取） |
| `LLM_PRICE_INPUT_PER_1K` / `LLM_PRICE_OUTPUT_PER_1K` | 否 | 每千 token 单价（元），用于成本统计；默认 0 |
| `PUBLIC_BASE_URL` | 是 | 公开访问域名，例如 `http://localhost:6688` |
| `ADMIN_TOKEN` | 是 | 商家界面管理口令 |
| `DATA_DIR` | 否 | 默认 `./data` |
| `GUARD_API_KEYS` | 否 | 逗号分隔的 API Key 列表，持有者可使用模型判定层与行业规则包 |

开发端口默认 6688。

## 审查后修订（2026-10-10，优先于上文）

以下修订来自 Codex 独立审查与 Claude 复核，**与上文冲突时以本节为准**。

### R1 补充路由（商家界面所需）

| 方法 | 路径 | 说明 | 负责模块 |
|---|---|---|---|
| GET | `/api/projects` | 项目列表：`{ id, slug, type, title, state, thumbUrl?, views7d }[]` | 01（`views7d` 由 10 补充） |
| GET | `/api/projects/:id` | 项目详情：基本信息、`state`、最新 FactSheet 摘要、已发布版本 id | 01 |
| GET | `/api/projects/:id/assets` | 素材列表 | 03 |
| DELETE | `/api/assets/:id` | 删除素材及其文件 | 03 |
| GET | `/api/projects/:id/facts` | 最新 revision 的 FactSheet（含是否已确认） | 04 |

### R2 页面与图片的存放和访问（解决公开页无法加载图片）

- 每个版本是一个自包含目录：`DATA_DIR/pages/<projectId>/<versionId>/index.html` + `media/<assetId>-<size>.webp`。渲染时把用到的图片复制进 `media/`，HTML 中一律用**相对路径** `media/<assetId>-<size>.webp`。
- 公开地址统一带结尾斜杠：`/p/<slug>/`；`/p/<slug>` 308 重定向到 `/p/<slug>/` 并保留查询参数。二维码内容为 `PUBLIC_BASE_URL/p/<slug>/?src=qr`。
- 公开图片：`GET /p/<slug>/media/<file>` 只从**当前已发布版本**的 `media/` 目录读取，文件名必须匹配 `^[a-zA-Z0-9_-]+-(display|thumb)\.webp$`。
- 预览：`GET /api/versions/:id/` 返回 HTML，`GET /api/versions/:id/media/<file>` 返回图片，均需管理口令。
- 发布：**不复制文件**。版本目录生成后不可变；发布 = 在一个数据库事务中把 `projects.publishedVersionId` 指向该版本。公开页与公开图片每次请求都按这个指针读取 `DATA_DIR/pages/<projectId>/<versionId>/`。

### R3 并发与部署前提

- **部署形态固定为单实例、持久磁盘、长期运行的 Node 进程**（不用 Serverless），见 `17-部署与真机验收.md`。
- `jobs` 表建部分唯一索引：同一 `projectId` 最多一条非终态任务（`status NOT IN ('succeeded','failed','timed_out')`）；创建任务与检查放在同一个 SQLite 事务中。
- 所有「检查后更新」的操作（任务状态、纠错采纳、发布）使用条件更新：`UPDATE ... WHERE id=? AND status=?`，以影响行数判断是否抢到处理权。

### R4 环境变量补充

| 变量 | 说明 |
|---|---|
| `LLM_PROFILE` | 已验证的接口配置：`qwen` / `glm` / `deepseek` / `ollama` / `generic`（见 02 号修订） |
| `GUARD_KEY_DAILY_LIMIT` | 每个 API Key 每日最多请求数，默认 2000 |

### R5 纠错状态补充

`corrections.status` 增加中间状态 `processing`（采纳处理中，见 15 号修订 1）；失败时回到 `pending`。

## 审查后修订（第二轮，优先于上文及第一轮修订）

### R6 匿名路由补充

`GET /api/health` 为匿名例外，只返回固定内容 `{ "ok": true }`，不含版本号、路径、配置等任何信息。

### R7 文案的事实引用记录

`versions` 表增加 `copyRefs` 字段（json）：记录 `CopyDraft` 中每个字段的每一句引用了哪些事实路径，格式 `Record<field, Array<{ sentence: string; refs: string[] }>>`。由 07 号在守卫时生成（句子包含某个事实原文即视为引用该事实路径），供 15 号纠错时使用。

### R8 第三轮补充

- `corrections` 增加 `processingAt`（nullable）；`processing` 超过 5 分钟视为中断，回退为 `pending`。
- 每个版本（包括纠错生成的版本）写入时，`copyRefs` 必须与该版本最终的 `copy` 一致。07 号导出 `computeCopyRefs(copy, factSheet)` 供 08 号与 15 号共用。

## 开源项目调研修订（2026-10-11，优先于上文）

### R9 宣传页长图（微信访问兜底）

- 发布时为该版本生成一张手机长图：`DATA_DIR/pages/<projectId>/<versionId>/long.png`（宽 1080px，页面全长截图，底部拼接二维码与「扫码查看完整页面」）。
- 路由：`GET /api/projects/:id/long-image` 返回当前已发布版本的长图（需管理口令，由 09 号负责）。
- 环境变量 `LONG_IMAGE_ENABLED`（默认 `true`）：服务器没有安装浏览器时设为 `false`，发布照常进行，只是不生成长图。

## 商家风格偏好修订（2026-10-28，优先于上文）

### R11 生成任务的 styleBrief

- `POST /api/projects/:id/jobs` 接收可选请求体 `{ styleBrief? }`；不带请求体与以前完全相同。
- `StyleBrief = { templateId?: TemplateId, moodKeywords?: string[], primary?: Hex }`（`lib/design/brief.ts`）：三项都可省略，整个对象可省略；`moodKeywords` 1～4 个、每个 1～6 个汉字，与模型输出的风格词同一条规则；不允许其他字段；`styleBrief: null` 不合法。空对象视为没有偏好。
- 非法时返回 400 `{ error: { code: 'invalid_style_brief', message } }`，`message` 用中文说明是哪一项不合法，不创建任务。
- `jobs` 表增加可空列 `brief`（json），保存校验后的 StyleBrief；没有偏好时为 null。版本表不另存 brief，结果已体现在 `designSpec`。
- 生成结果必须遵守：指定了 `templateId` 就使用它（相似度判定不切换模板）；指定了 `primary` 就是最终的 `palette.primary`（统一小写），text 仍保证在 bg 与 surface 上 ≥ 4.5:1；指定了 `moodKeywords` 就是最终的风格词。`DesignSpec` 字段不变，seed 仍随机。
