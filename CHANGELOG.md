# 更新日志 / Changelog

本文件记录每个版本的重要变化，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。每个版本先写中文，后附英文。

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Each release is written in Chinese first, followed by English.

## [0.1.0] - 未发布 / Unreleased

### 中文

第一个公开版本，内容为 `main` 截至提交 `3cbf12f`（2026-10-20）的代码。

#### 模块

模块编号与名称同 [`docs/CONTRACT.md`](docs/CONTRACT.md)（13 号「生成后质检」本版不包含）。

- **01 脚手架与核心契约**（`lib/core/`、`lib/db/`）：共享 zod schema 与任务状态机；项目的创建、查询与删除；管理口令登录，会话签名密钥独立保存，登录失败有全局限流；SQLite + Drizzle 迁移。
- **02 模型适配层**（`lib/providers/`）：默认离线 Mock 模型；任意 OpenAI 兼容接口，内置 `qwen`、`glm`、`deepseek`、`ollama`、`generic` 五种配置；超时、重试、JSON 结构修正、token 成本统计；Ollama 的图片与 JSON 模式适配。
- **03 素材上传**（`lib/assets/`）：照片与文字上传，支持 HEIC，生成 WebP 展示图和缩略图，校验文件类型和大小。
- **04 事实抽取与确认**（`lib/extract/`）：从照片和文字抽取商品名、价格、规格、店铺信息，生成事实表草稿；商家修改并确认后形成新修订版本。价格单位只取商家原文，原文没写时留空，不再补默认「份」。
- **05 风格生成**（`lib/design/`）：模型只输出受约束的风格参数（模板、配色、字体搭配、装饰、首屏布局），配色经过对比度校验。
- **06 页面渲染与模板**（`lib/render/`、`templates/`）：3 套模板（海报、卡片叠放、菜单板）；事实由模板直接从事实表填入；字体子集化内嵌；页面自包含。
- **07 事实守卫与文案生成**（`packages/fact-guard/`、`lib/copy/`）：零运行时依赖的规则层（绝对化用语，无依据的销量、排名、功效、成分、产地、工艺、定位说法，诱导分享，价格与数字核对），通用与餐饮食品两个规则包；营业时间和地址只作区间证据；商品描述只能以本商品的事实和店铺事实为依据；可选的模型判定层与改写。
- **08 生成任务编排**（`lib/jobs/`）：同一项目同时只有一个生成任务；分阶段超时与预计耗时；重启后恢复中断的任务；生成后逐项核对页面事实与事实表一致。
- **09 发布与二维码**（`lib/publish/`）：每个项目一个固定短链接，发布只在数据库事务中切换版本，重新发布后二维码不变；二维码 PNG / SVG；宣传页长图。
- **10 公开页与访问统计**（`/p/<短码>/`、`lib/stats/`）：顾客访问当前发布的版本；统计访问量，区分扫码与链接访问；`pnpm stats:export <projectId>` 按天导出 CSV。
- **11 商家界面**：项目列表、上传、事实表核对与确认、生成进度、版本预览、发布核对与二维码、访问统计、纠错处理。
- **12 评测集与对比实验**（`eval/`）：事实抽取准确率、「AI 直接写整页」与实招的对比、守卫拦截率与误伤率三项评测，可续跑，可导出 promptfoo 配置；3 组合成样本。
- **14 开源交付**：多阶段 `Dockerfile`（非 root 运行，构建时排除任何深度的 `.env*`）与 `docker-compose.yml`；`pnpm bootstrap`、`pnpm demo`；GitHub Actions CI（typecheck、lint、单元测试、密钥扫描、许可证检查、构建、e2e）；README（中英文）、Apache-2.0 许可证、贡献指南、行为准则、治理、路线图、安全策略、第三方许可证。
- **15 顾客纠错**（`lib/corrections/`）：公开的纠错提交接口（限流、个人信息过滤），商家采纳后生成新修订、重新渲染并发布。
- **16 文案检查页与 API**（`/check`、`POST /api/guard`、`lib/guard-api/`）：规则层无需登录；模型判定层与行业规则包需要 API Key，有每分钟限流、每日配额和并发上限。
- **17 部署与真机验收**（`deploy/`）：公网部署文档、生产 compose（Caddy 自动 HTTPS）、微信预检页、每日备份脚本。真机验收记录尚未填写。

#### 测试

- `pnpm test`：55 个测试文件、1077 个测试全部通过（在 `3cbf12f` 上实跑，2026-10-21）。

#### 评测数字

规则层（只测规则，不调用模型）：

| 测试集 | 性质 | 样本量 | 拦截 | 误杀 | 来源 |
|---|---|---|---|---|---|
| A1 对抗集 | **样本内**：开发期间被实现方参考并用于调整规则，只作回归集 | 应拦截 47、应放行 23 | 45/47 | 0/23 | `pnpm test` 输出（`3cbf12f`）；[`docs/review-log.md`](docs/review-log.md)「07 规则补强」 |
| A1b 留出集 | **留出集**：出题方不接触实现，题目冻结后对提交 `1299c61`（2026-10-13）只运行一次；07 规则补强之后没有重测 | 应拦截 52、应放行 28 | 63.5%（33/52，95% CI 49.9%–75.2%） | 21.4%（6/28，95% CI 10.2%–39.5%） | [README「评测与验证」](README.md#评测与验证) |

两次云端对比实验（文本 `qwen-plus`、视觉 `qwen3-vl-plus`；3 组合成样本共 7 个商品，每组每样本 N=3；被测提交 10-14 为 `65f0473`，10-20 为 `dafb379`；均为样本内，没有留出集）：

| 指标 | 10-14 | 10-20 | 样本量 |
|---|---:|---:|---|
| 实验组 B 端到端：每页事实错误 | 0.78（7 处 / 9 页） | 0.33（3 处 / 9 页） | 每次 9 次尝试，9 页成功 |
| 单位错误（全部组别合计） | 9 | 0 | 10-20 共 33 页；10-14 的 9 条全部在 B 端到端组 |

- 来源：[`eval/reports/2026-10-20/report.md`](eval/reports/2026-10-20/report.md)「10-14 vs 10-20 对照」「单位错误条数」两节，原始数据为两次报告同目录的 `raw.json`，单位错误由同目录 `count-unit-errors.py` 计算。
- 只有 3 组样本、两次运行，变化不能推广，也不能单独归因于代码修复：同期对照组 A（原始输入）从每页 0.86 处（6 处 / 7 页）变为 0.14 处（1 处 / 7 页），而 A 组代码没有改动。10-20 剩下的 3 处都是同一个抽取漏项（见「已知问题」）。
- 单位错误为 0 只针对报告中可识别的「金额 + 单字量词」写法。
- 无依据说法的 A2 第二次独立复核（10-20 的 33 个页面，**尚未完成**，结果单独统计，不并入上表）：
  - 规则层召回率：<!-- TODO: A2 第二次复核 -->
  - 独立标注数：<!-- TODO: A2 第二次复核 -->

#### 已知问题

来自全仓安全审查 A4 第 1 轮（被测 `dafb379`），计划在 0.1.x 处理。HIGH 两条已在本版修复。

设计取舍：

- M1 `lib/auth.ts`：登录失败预算是全局的，连续错误口令会让新登录与 Bearer 请求在 15 分钟内被拒绝；已登录的会话不受影响。负责人决定保留。

MEDIUM：

- M2 `lib/providers/openai-compatible.ts`：模型请求没有设 `max_tokens`，持 Guard API Key 的调用方可以消耗更多模型额度。
- M3 `lib/corrections/submit.ts`、`lib/http.ts`：纠错接口不校验请求来源，外站页面可以借访客提交纠错，占用单个项目每天 50 条的额度。
- M4 `app/api/track/route.ts`：同上，外站可以写入伪造的统计事件，访问统计会失真。
- M5 `lib/corrections/filter.ts`：个人信息过滤对加了较多分隔符的手机号不生效，也不覆盖 QQ、支付宝号；纠错内容可能留存顾客自己写的联系方式。
- M6 `packages/fact-guard/src/normalize.ts`：干扰字符只在部分位置被归一，夹带零宽等字符的文案可能漏过规则层（含 `/api/guard` 的规则模式）。
- M7 `packages/fact-guard/src/normalize.ts`：规范化只处理全角 ASCII，其他 Unicode 数字形式不会被识别为数字，数字核对可能漏检。
- M8 `packages/fact-guard/src/rules/index.ts`：氛围白名单短语（如「慢烤的时光」「限定的温柔」）会连带放行同一句里的工艺或定位声明。
- M9 `packages/fact-guard/src/grounding.ts`：营业时间端点只按时刻值匹配，与营业时刻相同的数字可以支撑无依据的促销说法。
- M10 `lib/extract/price.ts`（`GAP`）：价格抽取正则在超长空白输入下耗时随空格数平方增长；只有管理员能上传文字。
- M11 `lib/guard-api/handler.ts`、`lib/stats/limiter.ts`：开启 `TRACK_TRUST_PROXY` 时，限流按完整 IPv6 地址分桶，同一网段换地址可绕过匿名限流。
- M12 `Dockerfile`、`deploy/docker-compose.prod.yml`：基础镜像使用可变标签，没有固定 digest。
- M13 `.github/workflows/ci.yml`：Actions 使用可变标签，没有固定提交 SHA。

07 规则层（07 规则补强第 2 轮审查遗留，在 `3cbf12f` 上已复现；与上面 M8、M9 同源）：

- MEDIUM `packages/fact-guard/src/rules/index.ts`：白名单「慢烤的时光」会放行慢烤工艺声明，包括「慢烤的时光，……」这样跨逗号接结果的写法；影响 `unsupported_claim`，接入判定层时有一次兜底。修复分支 `fix/07-rules-gap`（未合并）已收窄前置词写法，跨逗号写法在该分支仍放行。
- MEDIUM `packages/fact-guard/src/grounding.ts`：「N 点」形式的积分说法会借营业时间的时刻放行，数字在「积分」前后都一样；修复分支 `fix/07-rules-gap`（未合并）已覆盖两种顺序。

LOW：

- L1 `app/api/auth/logout/route.ts`：登出接口不校验来源，外站可以把管理员登出；不能读取数据。
- L2 `lib/assets/index.ts`：删除素材与上传同一张图片并发时，上传可能返回一个随即被删除的 ID；两个操作都需要管理口令。
- L3 `lib/providers/openai-compatible.ts`：`LLM_BASE_URL` 允许公网明文 HTTP，由部署者配置。
- L4 `lib/providers/openai-compatible.ts`：多张图片转 base64 时内存峰值较高；图片只能由管理员上传，有张数上限。
- L5 `lib/providers/openai-compatible.ts`、`lib/guard-api/check.ts`：上游非 2xx 响应的正文（已脱敏，截断到 200 字）会写进日志。
- L6 `docker/entrypoint.sh`：开发用 compose 未设置 `ADMIN_TOKEN` 时，首次启动把随机口令打印到容器日志；生产 compose 要求显式设置。
- L7 `scripts/bootstrap.ts`、`scripts/demo.ts`：本地脚本把管理口令打印到终端，在 CI 或录屏时需注意。
- L8 `eval/lib/samples.ts`：评测样本文件不拒绝符号链接，用真实 Key 跑评测时可能把链接目标发给模型服务。
- L9 `eval/lib/report.ts`：`review-sheet.csv` 没有防公式注入，用表格软件打开时需注意。
- L10 `lib/stats/track.ts`：不存在的短码不消耗限流额度；核实后不构成锁放大，作为加固项记录。
- L11 `lib/extract/price.ts`：核实为误报（从商家原文抽取商家写的价格是预期行为），保留编号以便对照。
- L12 `packages/fact-guard/src/check.ts`：商家确认的地址字段里写的促销或工艺说法会被当作依据；属于商家自己的声明，可作为字段语义校验的加固项。

其他：

- 事实抽取：规格夹在商品名和价格之间的写法（如「巴斯克芝士蛋糕 6 寸 128 元」）会漏掉价格；商家不修改直接确认时，页面会缺这个价格。10-14、10-20 两次云端实验都出现（B 端到端每次 3 处）。商家在「核对信息」里补上即可。
- 判定层依赖云端模型：模型判定层和改写需要配置外部模型服务；不配置时只有规则层，规则层只能识别列出的词和模式，换说法的成分、产地、功效声明和隐含排名可能漏过（见 A1b 留出集结果）。

### English

First public release, covering `main` as of commit `3cbf12f` (2026-10-20).

#### Modules

Module numbers and names follow [`docs/CONTRACT.md`](docs/CONTRACT.md). Module 13 (post-generation QA) is not part of this release.

- **01 Scaffold and core contract** (`lib/core/`, `lib/db/`): shared zod schemas and the job state machine; project create / read / delete; admin-token login with a separately stored session signing key and a global login-failure limit; SQLite with Drizzle migrations.
- **02 Model provider layer** (`lib/providers/`): offline Mock provider by default; any OpenAI-compatible API with five built-in profiles (`qwen`, `glm`, `deepseek`, `ollama`, `generic`); timeouts, retries, JSON repair and token cost tracking; Ollama image and JSON-mode support.
- **03 Asset upload** (`lib/assets/`): photo and text upload with HEIC support, WebP display images and thumbnails, file type and size checks.
- **04 Fact extraction and confirmation** (`lib/extract/`): extracts item names, prices, specs and shop details into a draft fact sheet; merchant edits and confirmation create a new revision. The price unit comes only from the merchant's text and stays empty when the merchant did not write one (no default "份").
- **05 Style generation** (`lib/design/`): the model only outputs constrained style parameters (template, palette, font pairing, decoration, hero layout); palettes are contrast-checked.
- **06 Page rendering and templates** (`lib/render/`, `templates/`): three templates (poster, stacked cards, menu board); facts are filled in by the template straight from the fact sheet; subset fonts are embedded; pages are self-contained.
- **07 Fact guard and copy generation** (`packages/fact-guard/`, `lib/copy/`): a zero-runtime-dependency rule layer (absolute wording; unsupported sales, ranking, efficacy, ingredient, origin, process and positioning claims; share baiting; price and number checks) with general and food rule packs; opening hours and address count only as span evidence; item blurbs may only rely on that item's facts plus shop facts; optional model judge and rewrite.
- **08 Generation jobs** (`lib/jobs/`): one generation job per project at a time; per-stage timeouts and ETA; interrupted jobs resume after restart; every fact on the generated page is checked against the fact sheet.
- **09 Publishing and QR codes** (`lib/publish/`): one fixed short link per project; publishing switches the version inside a database transaction, so the QR code never changes; PNG / SVG QR codes; long-image export.
- **10 Public page and analytics** (`/p/<slug>/`, `lib/stats/`): customers see the published version; views are counted and split into QR scans and link visits; `pnpm stats:export <projectId>` exports daily CSV.
- **11 Merchant UI**: project list, upload, fact review and confirmation, generation progress, version preview, publish checklist and QR code, analytics, correction handling.
- **12 Evaluation set and comparison experiments** (`eval/`): fact extraction accuracy, "AI writes the whole page" vs Shizhao, and guard block / false-positive rates; resumable runs and promptfoo export; three synthetic samples.
- **14 Open-source delivery**: multi-stage `Dockerfile` (non-root; `.env*` files at any depth are excluded from the build) and `docker-compose.yml`; `pnpm bootstrap` and `pnpm demo`; GitHub Actions CI (typecheck, lint, unit tests, secret scan, license check, build, e2e); README (Chinese and English), Apache-2.0 license, contributing guide, code of conduct, governance, roadmap, security policy, third-party licenses.
- **15 Customer corrections** (`lib/corrections/`): a public correction endpoint (rate-limited, personal-info filtering); once the merchant accepts, a new revision is created, re-rendered and published.
- **16 Copy check page and API** (`/check`, `POST /api/guard`, `lib/guard-api/`): the rule layer needs no login; the model judge and industry rule packs need an API key, with per-minute rate limits, daily quotas and a concurrency cap.
- **17 Deployment and on-device acceptance** (`deploy/`): public deployment guide, production compose (Caddy with automatic HTTPS), WeChat pre-check page, daily backup script. The on-device acceptance record is not filled in yet.

#### Tests

- `pnpm test`: 55 test files, 1077 tests, all passing (run on `3cbf12f`, 2026-10-21).

#### Evaluation numbers

Rule layer only (no model calls):

| Set | Nature | Size | Blocked | False positives | Source |
|---|---|---|---|---|---|
| A1 adversarial set | **In-sample**: consulted by the implementer and used to tune rules during development; regression use only | 47 to block, 23 to pass | 45/47 | 0/23 | `pnpm test` output (`3cbf12f`); [`docs/review-log.md`](docs/review-log.md), "07 rules gap" |
| A1b holdout | **Holdout**: written without seeing the implementation, frozen, then run exactly once against commit `1299c61` (2026-10-13); not re-run after the 07 rule update | 52 to block, 28 to pass | 63.5% (33/52, 95% CI 49.9%–75.2%) | 21.4% (6/28, 95% CI 10.2%–39.5%) | [README, "Evaluation"](README.en.md) |

Two cloud comparison runs (text `qwen-plus`, vision `qwen3-vl-plus`; 3 synthetic samples with 7 items in total, N=3 per sample per group; commit under test `65f0473` on 10-14 and `dafb379` on 10-20; both in-sample, no holdout):

| Metric | 10-14 | 10-20 | Sample size |
|---|---:|---:|---|
| Group B end-to-end: fact errors per page | 0.78 (7 errors / 9 pages) | 0.33 (3 errors / 9 pages) | 9 attempts per run, 9 pages generated |
| Unit errors (all groups) | 9 | 0 | 33 pages on 10-20; all 9 on 10-14 were in group B end-to-end |

- Source: [`eval/reports/2026-10-20/report.md`](eval/reports/2026-10-20/report.md), sections "10-14 vs 10-20 对照" and "单位错误条数"; raw data in each report's `raw.json`; unit errors counted by `count-unit-errors.py` in the same directory.
- With 3 samples and two runs, these changes do not generalize and cannot be attributed to code fixes alone: over the same runs, control group A (raw input) went from 0.86 errors per page (6 / 7 pages) to 0.14 (1 / 7 pages) with no change to group A's code. The 3 errors left on 10-20 are all the same extraction miss (see Known issues).
- Zero unit errors applies only to the "amount + single-character measure word" patterns the report can recognize.
- Second independent A2 review of unsupported claims (33 pages from 10-20; **not finished yet**, reported separately from the table above):
  - Rule-layer recall: <!-- TODO: A2 第二次复核 -->
  - Independent annotations: <!-- TODO: A2 第二次复核 -->

#### Known issues

From round 1 of the A4 full-repository security review (commit under test `dafb379`), planned for 0.1.x. Both HIGH findings are fixed in this release.

Design trade-off:

- M1 `lib/auth.ts`: the login-failure budget is global, so repeated wrong tokens block new logins and Bearer requests for 15 minutes; existing sessions are unaffected. Kept by owner decision.

MEDIUM:

- M2 `lib/providers/openai-compatible.ts`: model requests set no `max_tokens`, so a Guard API key holder can consume more model quota.
- M3 `lib/corrections/submit.ts`, `lib/http.ts`: the correction endpoint does not check request origin, so another site can submit corrections through visitors and use up a project's 50-per-day quota.
- M4 `app/api/track/route.ts`: same as M3; another site can write forged analytics events, skewing the stats.
- M5 `lib/corrections/filter.ts`: the personal-info filter misses phone numbers with many separators and does not cover QQ or Alipay IDs; corrections may retain contact details the customer typed.
- M6 `packages/fact-guard/src/normalize.ts`: noise characters are normalized only in some positions, so copy containing zero-width and similar characters may slip past the rule layer (including the rules mode of `/api/guard`).
- M7 `packages/fact-guard/src/normalize.ts`: normalization only handles full-width ASCII; other Unicode digit forms are not read as numbers, so number checks may miss them.
- M8 `packages/fact-guard/src/rules/index.ts`: mood whitelist phrases (such as 「慢烤的时光」「限定的温柔」) also let through process or positioning claims in the same sentence.
- M9 `packages/fact-guard/src/grounding.ts`: opening-hour endpoints are matched by clock value only, so a number equal to an opening time can support an unsupported promotion.
- M10 `lib/extract/price.ts` (`GAP`): the price regex takes time quadratic in the amount of whitespace on very long input; only the admin can upload text.
- M11 `lib/guard-api/handler.ts`, `lib/stats/limiter.ts`: with `TRACK_TRUST_PROXY` on, rate limits are keyed by full IPv6 address, so rotating addresses within one prefix bypasses the anonymous limit.
- M12 `Dockerfile`, `deploy/docker-compose.prod.yml`: base images use mutable tags without pinned digests.
- M13 `.github/workflows/ci.yml`: Actions use mutable tags rather than pinned commit SHAs.

07 rule layer (left over from round 2 of the 07 rules-gap review, reproduced on `3cbf12f`; same root causes as M8 and M9 above):

- MEDIUM `packages/fact-guard/src/rules/index.ts`: the whitelist phrase 「慢烤的时光」 lets slow-roast process claims through, including the form where the result follows after a comma; affects `unsupported_claim`, with one more check when the model judge is enabled. The unmerged fix branch `fix/07-rules-gap` narrows the leading-word forms; the comma-separated form still passes on that branch.
- MEDIUM `packages/fact-guard/src/grounding.ts`: points claims written as "N 点" are grounded by opening-hour clock values, whichever side of 「积分」 the number is on; the unmerged fix branch `fix/07-rules-gap` covers both orders.

LOW:

- L1 `app/api/auth/logout/route.ts`: logout does not check origin, so another site can log the admin out; no data can be read.
- L2 `lib/assets/index.ts`: deleting an asset while the same image is being uploaded may return an ID that is deleted right away; both actions need the admin token.
- L3 `lib/providers/openai-compatible.ts`: `LLM_BASE_URL` allows plain HTTP to public hosts; set by the deployer.
- L4 `lib/providers/openai-compatible.ts`: peak memory can be high when many images are base64-encoded; only the admin can upload images, and the count is capped.
- L5 `lib/providers/openai-compatible.ts`, `lib/guard-api/check.ts`: bodies of non-2xx upstream responses (redacted, truncated to 200 characters) are logged.
- L6 `docker/entrypoint.sh`: in the development compose, when `ADMIN_TOKEN` is unset, the generated token is printed to the container log on first start; the production compose requires it to be set.
- L7 `scripts/bootstrap.ts`, `scripts/demo.ts`: local scripts print the admin token to the terminal; take care in CI or screen recordings.
- L8 `eval/lib/samples.ts`: sample files are not checked for symlinks, so an evaluation run with a real key may send a link target to the model service.
- L9 `eval/lib/report.ts`: `review-sheet.csv` is not protected against formula injection; take care when opening it in a spreadsheet.
- L10 `lib/stats/track.ts`: unknown short links do not consume rate-limit budget; verified not to amplify locking, recorded as hardening.
- L11 `lib/extract/price.ts`: verified as a false positive (extracting the price the merchant wrote is intended); kept for cross-reference.
- L12 `packages/fact-guard/src/check.ts`: promotion or process wording inside the merchant-confirmed address field counts as evidence; it is the merchant's own statement, recorded as a field-semantics hardening item.

Other:

- Fact extraction: when a spec sits between the item name and the price (e.g. 「巴斯克芝士蛋糕 6 寸 128 元」), the price is missed; if the merchant confirms without editing, the page lacks that price. This happened in both cloud runs (3 errors in group B end-to-end each time). The merchant can add it on the fact review screen.
- The model judge depends on a cloud model: the judge and rewrite need an external model service. Without one, only the rule layer runs, which recognizes listed words and patterns only; paraphrased ingredient, origin, efficacy and implied-ranking claims may get through (see the A1b holdout result).
