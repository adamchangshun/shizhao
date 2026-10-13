# 实招 Shizhao

**AI 只改颜值，不改事实。**

实招帮小商家把商品照片和几行文字变成一张手机宣传页：AI 负责排版、配色和氛围文案，价格、商品名、电话这些事实只来自商家亲自确认过的事实表，夸大或编造的说法会被事实守卫拦下。

[English](README.en.md) · [贡献指南](CONTRIBUTING.md) · [路线图](ROADMAP.md) · [文案检查 API](docs/API.md) · [参考项目与致谢](docs/REFERENCES.md)

<!-- 演示 GIF：录制后放到 docs/assets/demo.gif，再把下一行取消注释。
![实招演示](docs/assets/demo.gif)
-->

## 定位

在我们检索的 GitHub 与 Gitee 开源项目中，未发现同时覆盖中文营销文案、商家确认事实表与广告法 / 微信外链规范的工具。实招把这三件事放在同一条流水线里：先抽取并让商家确认事实，再让 AI 只在事实之外发挥。

## 关键数字

| 指标 | 结果 | 来源 |
|---|---|---|
| 生成一页的耗时 | 待真实模型重跑后填入 | `eval/reports/` |
| 规则层 + 模型判定层的拦截率 / 误伤率 | 待真实模型重跑后填入 | `eval/reports/` |
| 对比实验：AI 直接写整页 vs 实招 | 待真实模型重跑后填入 | `eval/reports/` |
| 自动化测试 | 768 个用例全部通过（2026-10-14，提交 `dd054cc`） | `pnpm test` |

仓库里现有的 `eval/reports/2026-10-13/` 是用 Mock 模型生成的流程验证报告，其中的数字没有意义，不作引用。

**独立留出集（只测规则层）**：

> 我们另外构造了一个 80 条的留出测试集，其中应拦截 52 条、应放行 28 条。出题方只依据功能规格出题，不接触实现代码；实现方在测试前看不到题目。题目在运行前冻结并记录哈希，之后对指定提交只运行了一次，期间没有调整规则或用例。这次只测试了规则层，没有调用模型：拦截率为 63.5%（33/52，95% 置信区间 49.9%～75.2%），误杀率为 21.4%（6/28，95% 置信区间 10.2%～39.5%）；漏拦主要集中在换说法的成分、产地、功效声明和隐含排名，误杀主要来自含数字的成语。

规则层只能识别列出的词和模式，换个说法就可能漏过，所以还有可选的模型判定层兜底；两层合计的效果以真实模型的评测报告为准。

## 工作流程

```mermaid
flowchart LR
  A[上传照片和文字] --> B[事实抽取]
  B --> C[商家确认事实表]
  C --> D[风格生成]
  C --> E[文案生成]
  E --> F[事实守卫]
  D --> G[页面渲染]
  F --> G
  G --> H[质检：页面上的事实逐项核对]
  H --> I[发布：固定链接 + 二维码]
```

- **事实抽取**：视觉模型从照片和文字中读出商品名、价格、规格、店铺信息，生成事实表草稿。
- **商家确认**：商家逐项核对后确认；之后的生成只使用已确认的版本。
- **风格生成**：模型只输出受约束的风格参数（模板、配色、字体搭配、装饰、首屏布局），不写页面代码。
- **文案生成与事实守卫**：模型写氛围文案，守卫先用规则层检查绝对化用语、无依据的销量 / 排名 / 功效等说法，可选的模型判定层再逐句判断；不通过的句子会被改写或删除。
- **渲染与质检**：价格、商品名、电话等事实由模板直接从事实表填入，不经过模型；渲染后逐项核对页面上的事实与事实表完全一致，不一致就不生成版本。
- **发布**：每个项目有固定短链接，重新发布只切换指向的版本，已经打印出去的二维码继续有效。

## 当前进度

| 部分 | 状态 |
|---|---|
| 脚手架与鉴权、模型适配层、素材上传、事实抽取与确认 | 已完成 |
| 风格生成、页面渲染与 3 套模板、事实守卫与文案生成、生成任务编排 | 已完成 |
| 发布与二维码、评测集与对比实验、文案检查页与 API | 已完成 |
| 顾客访问的公开页与访问统计、商家操作界面、顾客纠错 | 开发中 |
| Docker 一键运行、`pnpm demo` 演示脚本、CI | 开发中 |

目前完整的「建项目 → 上传 → 抽取 → 确认 → 生成 → 发布」流程可以通过 HTTP 接口走通（接口列表见 [docs/CONTRACT.md](docs/CONTRACT.md) 第 6 节及文末修订 R1），商家界面完成后会补充截图。

## 快速开始

需要 Node.js 24 和 pnpm（已在 Node 24.14、pnpm 12.11 上验证）。不配置任何模型密钥时，系统使用内置的 Mock 模型（固定演示数据，不联网），整个流程都能跑通。

```bash
git clone https://github.com/adamchangshun/shizhao.git   # 或 https://gitee.com/sheng-changshun/shizhao.git
cd shizhao
pnpm i
cp .env.example .env.local
# 编辑 .env.local，把 ADMIN_TOKEN 设为至少 12 位的随机字符串，例如用 `openssl rand -hex 16` 生成
pnpm db:migrate
pnpm dev
```

启动后可以访问：

- `http://localhost:6688/check`：文案检查页，粘贴一段宣传文案即可看到哪些说法会被拦截，无需登录。
- `http://localhost:6688/login`：用 `ADMIN_TOKEN` 登录商家后台接口。
- `http://localhost:6688/api/health`：健康检查。

也可以直接调用文案检查接口：

```bash
curl -X POST http://localhost:6688/api/guard \
  -H 'Content-Type: application/json' \
  -d '{"text":"全城销量第一，当天现烤。","facts":["当天现烤"]}'
```

「全城销量第一」会因无依据的销量说法和绝对化用语被拦截，「当天现烤」有事实依据，可以保留。

想先看看生成的页面长什么样，可以运行：

```bash
pnpm render:demo
```

它用固定的单品和菜单数据渲染全部 3 套模板，输出到 `data/demo/<模板>-<数据>/index.html`，用浏览器直接打开即可。首次运行前需要执行一次 `pnpm exec playwright install --only-shell chromium` 安装无界面浏览器（`pnpm test` 会自动安装）。

开发常用命令：`pnpm typecheck`、`pnpm lint`、`pnpm test`。

> Docker 方式（`docker compose up`）和一键初始化脚本（`pnpm bootstrap`、`pnpm demo`）正在开发，完成后补充到这里。

## 接入真实模型

在 `.env.local` 中设置 `PROVIDER=openai-compatible`，再按下表填写。仓库不内置任何密钥，也不内置模型名，请填写你所用服务中实际可用的模型。

| 服务 | `LLM_PROFILE` | `LLM_BASE_URL` | 图片识别 |
|---|---|---|---|
| 通义千问（阿里云百炼） | `qwen` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 支持（需填写视觉模型） |
| 智谱 | `glm` | `https://open.bigmodel.cn/api/paas/v4` | 支持（需填写视觉模型） |
| DeepSeek | `deepseek` | `https://api.deepseek.com/v1` | 不支持，只能处理文字 |
| 模力方舟 | `generic` | `https://ai.gitee.com/v1` | 不支持（`generic` 只按文字接口使用） |
| Ollama（本机运行） | `ollama` | `http://localhost:11434/v1` | 需要本机模型支持视觉 |

```bash
PROVIDER=openai-compatible
LLM_PROFILE=qwen
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=<你的密钥>          # Ollama 可留空
LLM_MODEL_TEXT=<文本模型名>
LLM_MODEL_VISION=<视觉模型名>
LLM_PRICE_INPUT_PER_1K=0        # 每千 token 单价（元），只用于成本统计
LLM_PRICE_OUTPUT_PER_1K=0
```

事实抽取需要读照片，所以要完整使用实招，至少要有一个支持图片的配置（`qwen`、`glm` 或带视觉模型的 `ollama`）。各配置的协议细节见 [lib/providers/README.md](lib/providers/README.md)。

## 外部服务

| 服务 | 用途 | 是否必需 | 在哪申请 | 是否收费 | 不配置时 |
|---|---|---|---|---|---|
| 大模型接口（通义千问、智谱、DeepSeek、模力方舟等） | 事实抽取、风格、文案、文案判定 | 否 | [阿里云百炼](https://bailian.console.aliyun.com/)、[智谱开放平台](https://open.bigmodel.cn/)、[DeepSeek 开放平台](https://platform.deepseek.com/)、[模力方舟](https://ai.gitee.com/) | 按调用量收费 | 使用 Mock 固定数据 |
| Ollama | 在本机运行开源模型 | 否 | [ollama.com](https://ollama.com/) 下载 | 免费，占用本机算力 | 同上 |
| Playwright Chromium | 运行测试、`pnpm render:demo` | 仅开发时需要 | `pnpm test` 自动安装 | 免费 | 测试和演示渲染无法运行，应用本身不受影响 |
| 域名与 HTTPS 证书 | 让顾客在手机上扫码打开 | 公网部署时必需 | 域名注册商；中国大陆服务器还需 ICP 备案 | 域名收费，证书可免费 | 只能在本机或局域网访问（环境校验拒绝公网 http 地址） |

## 开源范围

- **开放**：应用全部代码、`packages/fact-guard` 规则层、行业规则包（`rules/packs/`）、评测脚本与合成样本。
- **不在仓库中**：外部模型服务；商家上传的照片、文字和生成的页面（保存在部署方自己的 `data/` 目录）。商家素材不会因为代码开源而公开。

## 开源核心 + 商业服务

- **永久开源免费**：本仓库的全部代码，包括事实守卫规则层、模板、评测集和自部署所需的一切。
- **商业服务（验证阶段）**：托管的文案检查 API（含模型判定层）、行业规则包的托管与持续更新、企业私有部署支持。目前只开放了接口本身，尚未收费，详见 [docs/API.md](docs/API.md)。
- 治理方式与收入用途见 [GOVERNANCE.md](GOVERNANCE.md)。

## fact-guard：可单独使用的文案守卫

`packages/fact-guard` 是零运行时依赖的 TypeScript 库，不依赖 Next.js 和数据库，可以单独用于任何营销文案检查场景。用法见 [packages/fact-guard/README.md](packages/fact-guard/README.md)。

## 评测

评测脚本、样本格式和新增样本的方法见 [eval/README.md](eval/README.md)。接入真实模型后运行：

```bash
pnpm eval:extract && pnpm eval:compare && pnpm eval:guard && pnpm eval:report
```

## 如何构建的

本项目由 Claude 和 Codex 两个模型分工开发：每个模块由其中一方编写，另一方只读审查，有 HIGH 级问题时修复后再审，审查记录全部公开在 [docs/review-log.md](docs/review-log.md)。截至 2026-10-14，记录了 10 个模块共 26 轮审查；各轮报告合计 63 条 HIGH、36 条 MEDIUM、20 条 LOW（同一问题在多轮中出现时分别计数）。记录表中的 102 条问题里，63 条已修复，其余每条都写明了不采纳或暂缓的理由。

## 参与贡献

- 贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)，适合新人的任务见 [docs/good-first-issues.md](docs/good-first-issues.md)。
- 问题反馈：[GitHub Issues](https://github.com/adamchangshun/shizhao/issues) 或 [Gitee Issues](https://gitee.com/sheng-changshun/shizhao/issues)。
- 安全漏洞请按 [SECURITY.md](SECURITY.md) 私下报告。
- 行为准则：[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 许可证

[Apache-2.0](LICENSE)。第三方依赖、字体的许可证见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。
