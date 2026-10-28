# M0 模型适配层

业务模块从 `@/lib/providers` 导入 `getProvider`、`recordUsage`、`ProviderError`；从现有 `lib/core/schemas` 选择输出 schema。HTTP 使用原生 fetch，图片转换复用已有 sharp，没有厂商 SDK 或新增依赖。

```ts
const provider = getProvider()
const result = await provider.generateJSON({
  stage: 'design',
  system,
  prompt,
  schema: DesignSpec,
  seed,
  signal, // 编排任务取消信号，可选
})
recordUsage(db, result.usage, { projectId, jobId })
```

## 请求与错误

- 默认 `temperature=0.7`、`timeoutMs=45000`；超时预算覆盖整次调用，包括读图片、读响应、退避、格式降级与结构修正。外部信号优先报 `aborted`，无重试。
- 网络失败、HTTP 5xx 和 429 共最多重试三次，等待 1/2/4 秒 + 0–300ms 抖动。最初请求之外，格式不支持时最多追加一次降级请求，JSON 提取失败或 schema 不匹配时共享最多一次修正请求；这些过程共享同一个三次网络重试预算。因此总 HTTP 请求最多六次。
- 普通 4xx 不重试；只有 400/422 明确表示不支持 `response_format` 时移除它一次。system 从第一次请求起带「只输出 JSON」。修正请求保留原消息与模型回复；提取失败时要求仅输出符合要求的 JSON（jsonMode 开启时要求对象），schema 不符时增加 zod 错误路径/代码摘要。
- 回复支持字符串或 `[{type:'text',text:...}]`；先解析完整 JSON，再提取第一个 JSON 代码块或第一个平衡对象，正确跳过字符串中的括号和转义字符。JSON 提取失败与 schema 不符共享一次修正额度；修正后仍无法解析报 `bad_response`，能够解析但仍不符合 schema 则报 `schema_mismatch`。HTTP 成功响应本身不是合法协议 envelope 时仍立即报 `bad_response`。
- 读响应限制为 2 MiB，超出即取消响应并报 `bad_response`。不跟随重定向，以免向另一个目标转发凭据。
- 失败日志仅输出 HTTP 状态与脱敏后的前 200 字符；先处理转义 JSON 和纯文本中转义的斜杠，再删除配置密钥及已发送图片的 base64，最后截断。错误对象不附带响应正文、请求或底层 cause。
- 对外错误代码：`timeout`、`aborted`、`rate_limited`、`bad_response`、`schema_mismatch`、`upstream_error`；提示信息为简体中文。

## 配置与 profile

工厂复用 `getEnv()`，默认 Mock。设置 `PROVIDER=openai-compatible` 后，端点、文本/视觉模型名和价格全部来自 `LLM_*` 环境变量。API Key 为空时不发送 Authorization。`LLM_PROFILE` 未设时使用 `generic`。

| profile  | 图片                                | seed               | response_format                | ETA 倍数 |
| -------- | ----------------------------------- | ------------------ | ------------------------------ | -------: |
| qwen     | OpenAI `image_url: {url: data URL}` | 支持，0–2147483647 | JSON mode，拒绝时降级一次      |        1 |
| glm      | OpenAI `image_url: {url: data URL}` | 不发送             | JSON mode，拒绝时降级一次      |        1 |
| deepseek | 本项目契约限定为文本                | 不发送             | JSON mode，拒绝时降级一次      |        1 |
| ollama   | 需要本机模型支持视觉；WebP 转 PNG   | 支持               | 不发送，使用提示词约束         |        3 |
| generic  | 未验证接口只允许文本                | 不发送             | 尝试 JSON mode，拒绝时降级一次 |        1 |
| anthropic（`PROVIDER=anthropic`，不读 `LLM_PROFILE`） | Messages base64 `image` 块，WebP/PNG/JPEG 原样 | 不发送 | 强制调用 `submit_json` 工具，模型拒绝强制 tool_choice 时降级为 `auto` 一次 | 1 |

`PROFILE_CAPABILITIES[profile].etaMultiplier` 供任务编排调整预计耗时；不会擅自延长调用超时。文本配置使用纯字符串 user content，有非空图片列表时使用视觉模型和多模态 content。

`PROFILE_CAPABILITIES[profile].jsonMode` 控制 JSON 协议参数：ollama 为 `false`，其他 profile 为 `true`。关闭时所有请求（包括重试和修正）省略 `response_format`，system 仍追加「只输出 JSON。」，不限制对象或数组；提取失败后的修正提示同样不限定类型。实际输出类型由调用方提示词与 schema 决定，复用原 JSON 提取、校验及共享的一次修正额度，无新增环境变量。

仅 Ollama 将 WebP 在内存中解码并转成 PNG，data URL 同步使用 `image/png`，不写文件。PNG/JPEG 及其他 profile 的图片保持原样。转换失败报 `bad_response`；转换前后检查同一个超时/取消信号，不在已取消时发送请求。

关闭 JSON 模式后，普通说明文字加裸 JSON 对象可直接提取，不消耗修正机会。第 3 轮审查 M1 指出的原有解析边界仍待独立处理：`<think>` 内的花括号可能先被选中；说明文字包裹的数组可能被截成首个对象。纯数组和 JSON 代码块内数组可直接解析。本次按范围要求不修改通用 `json.ts`，也不改变调用超时。

以上是项目明确支持的协议配置，不代表所有模型版本均已实测。各 profile 的本地 HTTP 协议测试均已覆盖；使用者必须选择自己服务中支持相应能力的模型。模型名不内置在适配器中。

核验参考（2026-10-12）：[Qwen OpenAI Chat](https://help.aliyun.com/en/model-studio/qwen-api-via-openai-chat-completions)、[GLM 对话补全](https://docs.bigmodel.cn/api-reference/模型-api/对话补全)、[DeepSeek JSON](https://api-docs.deepseek.com/guides/json_mode/)、[Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)。功能契约中的 deepseek 文本限制优先于厂商后来扩展的能力。

## Anthropic Messages 协议

`PROVIDER=anthropic` 使用 `lib/providers/anthropic.ts`，复用同一组 `LLM_*` 变量，`LLM_BASE_URL` 填到 `/v1`，请求发往 `<base>/messages`，带 `x-api-key`（Key 为空时不发送）与 `anthropic-version: 2023-06-01`。超时、取消、重试次数与退避、2 MiB 响应上限、不跟随重定向、脱敏日志、错误代码和 usage 计费规则与 openai-compatible 完全一致，`readResponse`/`safeExcerpt` 直接复用。

- 结构化输出：请求带一个 `submit_json` 工具（`input_schema` 只约束 `result` 字段存在；zod 3 无法导出 JSON Schema，具体形状仍由提示词描述、zod 校验），`tool_choice` 强制调用该工具且关闭并行调用。Claude Opus 5.5、Sonnet 5.5、Fable 5.1 等新模型对强制 `tool_choice` 返回 400，此时只在错误体提到 `tool_choice` 不支持的情况下降级为 `auto` 一次，与 openai-compatible 的 `response_format` 降级共享同一套重试预算。
- 取结果：优先读取 `submit_json` 的 `result`（若为字符串则按 `json.ts` 解析）；模型没有调用工具时退回 `json.ts` 从文本提取。提取失败或 schema 不符共享一次修正：上一轮 assistant 内容原样回传（含 thinking 块），工具调用以 `is_error` 的 `tool_result` 回复修正提示，否则以普通文本回复。
- 不发送 `temperature`、`seed`：新模型对采样参数返回 400，Messages 协议没有 seed。`max_tokens` 固定 16000。
- usage：`input_tokens` 加缓存写入/读取 token 计入输入，`output_tokens` 计入输出；缺失时同样按字符估算并标记 `~est`。
- 本地协议测试见 `tests/providers/anthropic.test.ts`，未调用真实接口。

## Usage

所有成功返回的模型回复（包括随后需 schema 修正的第一轮）累加 token，再按每千 token 人民币单价计费，最后保留四位小数。1200 输入 / 300 输出、0.002 / 0.006 单价对应 0.0042 元。`latencyMs` 包含重试和等待。

usage 缺失或无效时，按输入消息文本与输出字符数分别除以 1.5、向上取整，`model` 后加 `~est`。图片、思考 token、隐藏协议开销无法由字符准确估算；估算不等于账单。调用最终失败时没有成功结果，不能据此证明未发生上游计费。

`recordUsage` 校验现有 Usage schema，写入现有 `usage_records` 表，支持 `jobId: null` 或省略；非空 job 必须属于指定 project。无需迁移。

## 离线 Mock fixture

`new MockProvider({ delay: false })` 可在测试中关闭延迟；默认随机模拟 300–800ms，支持同样的超时和外部取消。不会请求网络或读传入图片。每次深拷贝 fixture 并校验调用方 schema，避免污染后续调用。

| stage         | fixture / schema 格式                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| extract       | `extract.json`：完整 FactSheet；业务模块可用 `FactSheet.pick({shop:true,items:true,extraClaims:true})`。id/projectId/revision 为演示占位，真实持久化应由抽取模块赋值。拿铁图片识别价格预置 20 元，供 04 号测试商家文本 18 元覆盖它。 |
| design        | `design.json`：六组 DesignSpec，按 seed % 6 选择，并把本次 seed 写入返回值。                                                                                                                                                         |
| copy          | `copy.json`：CopyDraft；subhead 故意包含「零糖配方，全城销量第一。」供 07 号规则守卫拦截。                                                                                                                                           |
| guard-judge   | `guard-judge.json`：`Array<{unsupported:boolean; reason?:string}>`，预置单句安全判定。                                                                                                                                               |
| guard-rewrite | `guard-rewrite.json`：`string[]`，预置单句安全氛围文案。                                                                                                                                                                             |

Mock 是固定数据演示，不执行任意业务提示词。批量 judge/rewriter 的句数和业务结构由调用方定义，后续模块应按此固定单句 fixture 组织 Mock 演示，不把「安全判定 fixture」当成真实事实校验。

## 验证

`pnpm typecheck && pnpm lint && pnpm test`；聚焦本模块可运行 `pnpm exec vitest run tests/providers/provider.test.ts`。

本机 Ollama 真实 extract 的结果与其是否含图片详见未提交的 `CODEX_REVIEW_SUMMARY.md`。云端模型没有在本次任务中付费试调；本地协议测试通过不等于云端兼容验收。Claude 交叉审查按项目双模型协作规则另行执行。

## 输出预算 / Output budgets

每次请求（包括网络重试、格式降级和 schema 修正）都带 `max_tokens`：extract 8192、design 1024、copy 4096、guard-judge 8192、guard-rewrite 4096；未知 stage 2048。`profiles.ts` 的 `maxOutputTokens` 可按 profile 覆盖；Ollama extract 为 4096。上限是每次请求的输出预算，不是整项任务或账单上限；截断后仍走原有 JSON/schema 校验，不接受不完整数据。未进行真实模型额度或大批量完整性验收。

Every request, including retries, format fallback and schema repair, carries `max_tokens`: extract 8192, design 1024, copy 4096, guard-judge 8192, guard-rewrite 4096, and 2048 for unknown stages. Profiles can override individual stages through `maxOutputTokens` in `profiles.ts`; Ollama extract uses 4096. These are per-request output budgets, not task or billing caps. Truncated output still has to pass JSON/schema validation. Real-model quota and large-batch completeness have not been validated.
