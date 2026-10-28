# 文案检查 API

`POST /api/guard` 与公开页面 `/check` 使用同一服务。规则层开源免费；模型判定与餐饮食品规则包需要运营方配置的 API Key。当前版本不做计费、注册或密钥自助申请。

## 请求与鉴权

请求为 JSON；未列出的字段返回400。字符串长度、命中位置均按 JavaScript UTF-16 单元计算，位置是各句原文的半开区间，可直接用 `sentence.text.slice(start, end)`；emoji可能占两个单元。

| 字段     | 默认值  | 限制                               |
| -------- | ------- | ---------------------------------- |
| text     | 必填    | 非空，最多5000单元，拆句后最多80句 |
| facts    | []      | 最多100条，每条最多100单元         |
| industry | general | general 或 food                    |
| mode     | rules   | rules 或 rules+judge               |
| rewrite  | false   | 只有 rules+judge 可设为true        |

流式请求体限制100 KiB，不依赖客户端提供的Content-Length。

- 无Authorization：仅允许rules + general，每分钟20次。
- `Authorization: Bearer <key>`：Key必须属于服务端 `GUARD_API_KEYS`（逗号分隔）。允许全部模式，每Key每分钟120次。
- 无Key请求增值功能、错误Key或错误Authorization格式均返回403「该功能需要 API Key」。管理Cookie或管理口令不替代API Key；本模块没有新增管理接口。
- Key用等长摘要作常量时间比较，不写入日志、数据库或URL。所有响应带 `X-RateLimit-Remaining` 和 `Cache-Control: no-store`；失败请求也消耗分钟额度。

## 并发、配额与超时

每Key每日有效请求数由 `GUARD_KEY_DAILY_LIMIT` 控制，默认2000，包括携带合法Key的规则请求。按UTC日期重置；SQLite只保存Key的SHA-256指纹、日期和次数。已有调用信息迁移后保留，公共API的usage_records.project_id和job_id为空，stage固定为api-guard。

配额用事务内INSERT OR IGNORE与条件UPDATE原子扣减；扣减成功后才能调用模型，重启不会清零。模型请求先排队、获槽后再扣日额；排队取消或超时不扣日额。准入后的模型失败或客户端取消不返还配额，以防重复消耗。

单进程全局最多2个请求占用模型槽，等待队列最多64个；等待超过10秒返回429。总期限从路由入口开始计30秒，包含读取请求体与排队，超时取消读取和模型信号。即使模型未响应取消，HTTP先返回超时，槽位也要等底层调用真正结束才释放。代理/Node接收请求前的耗时不在路由计时范围内，部署层须另设接收超时。

每请求最多一次批量guard-judge与一次批量guard-rewrite；无待判断/重写句时跳过。重写只处理前10句违规句，单条建议最多500单元；超出的违规句保持blocked。每条建议拆句后再运行规则，仍有命中则不提供建议；**不做第二次模型判定，建议不等于事实已证实**。这里的调用次数指generateJSON阶段调用；底层M0适配器已有的HTTP重试策略保持不变，仍受总取消信号与剩余超时约束。

## 返回值

- passed：原文的所有句子均为ok才为true；存在改写建议仍为false。
- sentences：保留各句原文与标点，status为ok、blocked或rewritten；hits保留引擎所有命中；rewrite仅在有规则复查通过的建议时出现。
- hits：reason、evidence、start、end。reason为unsupported_number、unsupported_claim、ad_law_absolute、llm_flagged；模型命中以整句区间高亮，evidence为简短理由。
- stats：total为原句数，blocked为仍未解决的句数，rewritten为已提供建议的句数。
- meta：mode、industry、rulesVersion、latencyMs（路由入口到完成）。规则版本是包版本+所用YAML文件原始字节的SHA-256前8位；general使用base文件，food按base、food顺序串联。

当前引擎对「零糖配方，全城销量第一」返回零糖、销量、第一三处命中。接口保留实际规则结果，不为了旧提示词“两处命中”的文字描述删去销量命中。

## curl 示例

本地启动开发服务使用6690端口；正式服务将下面的地址替换为自己的HTTPS域名。

```bash
curl -sS -i http://localhost:6690/api/guard \
  -H 'Content-Type: application/json' \
  -d '{"text":"零糖配方，全城销量第一","facts":[]}'
```

```bash
curl -sS http://localhost:6690/api/guard \
  -H 'Content-Type: application/json' \
  -d '{"text":"当天现烤，6 寸只要 128 元","facts":["当天现烤","6寸","128元"]}'
```

合法Key的模型检查（本地验收以MockProvider运行）：

```bash
curl -sS http://localhost:6690/api/guard \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $GUARD_API_KEY" \
  -d '{"text":"零糖配方。午后暖意。","mode":"rules+judge","industry":"food","rewrite":true}'
```

## Node 示例

```js
const response = await fetch('http://localhost:6690/api/guard', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: '外酥里嫩，香气扑鼻。', facts: [] }),
})
const data = await response.json()
if (!response.ok) throw new Error(data.error.message)
for (const sentence of data.sentences) {
  for (const hit of sentence.hits) {
    console.log(hit.reason, sentence.text.slice(hit.start, hit.end))
  }
}
```

## 错误

统一格式 `{ "error": { "code": "...", "message": "中文提示" } }`，不返回堆栈、原始服务错误或输入。

| HTTP      | code                                   | 含义                                 |
| --------- | -------------------------------------- | ------------------------------------ |
| 400       | invalid_input                          | JSON/schema无效或字符/事实条数超限   |
| 403       | api_key_required                       | Key无效或无权使用当前功能            |
| 413       | payload_too_large / too_many_sentences | 请求体字节或句数超限                 |
| 429       | rate_limited / daily_quota_exceeded    | 分钟或每日额度不足                   |
| 429       | model_queue_full / model_queue_timeout | 模型队列满或等待超过10秒             |
| 499       | request_cancelled                      | 客户端取消（断连时可能无法接收响应） |
| 504       | request_timeout / provider_timeout     | 整体或模型超时                       |
| 502 / 503 | provider_*                             | 模型响应不可用，或上游限流           |
| 500       | internal_error                         | 服务内部错误                         |

## 部署与隐私

先运行 `pnpm db:migrate`。单实例长期Node进程、持久SQLite磁盘是部署前提。

Next.js Request不提供可靠的直连对端IP。默认 `GUARD_TRUST_PROXY=false`，忽略客户端转发头，匿名请求共用安全预算。部署到可信反向代理后，可设置 `GUARD_TRUST_PROXY=true`，由代理覆盖 `X-Real-IP` 为规范化真实地址，禁止从公网直连应用端口；应用只接受合法单一IP并以进程随机盐哈希分桶。不使用客户端可任意拼接的X-Forwarded-For。未配置可信入口时无法声称精确按访客IP区分。

代理示例要点：`proxy_set_header X-Real-IP $remote_addr; proxy_request_buffering off; client_max_body_size 100k; client_body_timeout 30s;`；同时设置连接/读取期限并禁用请求体日志和正文缓存落盘。请结合实际代理部署配置，不把客户端声明的转发头当作可信数据。

应用不把text、facts或Key落库，也不记录其全文（本实现不记录输入摘要）。仅持久化配额与成功模型调用的用量元数据。`rules+judge`会把文案/事实发送到已配置的模型服务，外部服务的数据保留策略由部署方选择；代理、APM和外部模型的保留不属于本应用本地存储保证。浏览器只在当前组件内存中保存输入与Key，不使用localStorage或Cookie保存Key。

规则匹配不是完整语义事实核验，也不替代人工确认；MockProvider只验证演示链路，不证明真实模型识别率。此模块不更改fact-guard规则，也不使用独立留出集。

## 附：生成任务的风格偏好（管理 API）

本文其余部分只描述文案检查 API。商家后台的 `POST /api/projects/:id/jobs`（需管理口令）可带可选请求体，让商家指定风格：

```json
{ "styleBrief": { "templateId": "menu-board", "moodKeywords": ["日式", "极简"], "primary": "#1f3a5f" } }
```

| 字段 | 规则 |
|---|---|
| `templateId` | `poster` / `card-stack` / `menu-board`，可省略 |
| `moodKeywords` | 1～4 个风格词，每个 1～6 个汉字，可省略 |
| `primary` | `#RRGGBB` 主色，可省略 |

三项都可省略，整个 `styleBrief` 或请求体也可省略（与以前相同，由模型自由搭配）；不允许其他字段。生成结果一定遵守给出的项：版本 `designSpec` 的 `templateId`、`palette.primary`（统一小写）、`moodKeywords` 与之一致，文字色仍保证 4.5:1 对比度。不合法时返回 400 `invalid_style_brief`，`message` 用中文说明是哪一项，不创建任务。完整的 curl 流程见 [API-quickstart.md](./API-quickstart.md) 第 6 节。
