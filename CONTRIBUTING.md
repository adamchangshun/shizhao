# 贡献指南

感谢你愿意参与实招。无论是报告问题、补充规则词表、新增模板还是改进文档，都欢迎。参与前请先阅读[行为准则](CODE_OF_CONDUCT.md)。

不知道从哪里开始，可以看 [docs/good-first-issues.md](docs/good-first-issues.md)。

## 开发环境

- Node.js 24、pnpm（已在 pnpm 12.11 上验证）。
- 按 [README 的快速开始](README.md#快速开始)运行 `pnpm i` 和 `pnpm bootstrap`（生成 `.env`、管理口令并迁移数据库），之后用 `pnpm dev` 启动。
- 默认 `PROVIDER=mock`，不需要任何模型密钥；所有测试都在 Mock 下运行，不访问网络。
- `pnpm test` 运行前会自动安装 Playwright 的无界面 Chromium（渲染相关测试需要）。

常用命令：

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动开发服务器（端口 6688） |
| `pnpm typecheck` | 类型检查（应用和 `packages/fact-guard`） |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier 格式化 |
| `pnpm test` | Vitest 单元与集成测试 |
| `pnpm test:e2e` | Playwright 端到端测试 |
| `pnpm render:demo` | 用固定数据渲染全部模板，输出到 `data/demo/` |
| `pnpm --filter fact-guard test` | 只运行 fact-guard 包的测试 |

## 代码约定

- TypeScript strict、Next.js 15 App Router、SQLite（better-sqlite3 + Drizzle）、zod 3、Vitest、Playwright。
- 界面文字用简体中文；代码、标识符、提交信息用英文。
- `lib/core/` 和 `docs/CONTRACT.md` 是各模块共享的契约，修改前请先开 issue 讨论。
- 新增数据库字段：修改 `lib/db/schema.ts` 后运行 `pnpm db:generate --name <描述>` 生成新迁移，不要改动已有迁移文件。
- 不引入新依赖，除非确有必要；如需引入，请在 PR 中说明理由和许可证（不接受 GPL / AGPL 依赖）。
- 不在代码、测试、日志中写入任何真实密钥。

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)：

```
<type>(<scope>): <description>
```

`type` 取 `feat`、`fix`、`docs`、`test`、`refactor`、`perf`、`chore`、`ci` 之一，例如 `feat(templates): add bakery-window template`、`fix(fact-guard): allow 一口价 idiom`。

## 测试要求

- 新功能和缺陷修复都要配测试，PR 合并前 `pnpm typecheck && pnpm lint && pnpm test` 必须全部通过。
- 测试只在模块边界替换外部依赖（例如模型服务用 Mock），不 mock 模块内部的协作者。
- 期望值来自手算样例或规格，不写和实现同义反复的断言。
- 修复缺陷时先写一个能复现问题的测试。

## 提交 PR

1. Fork 仓库，从 `main` 拉出分支，例如 `feat/<简短描述>`。
2. 完成修改并通过上面的检查。
3. 提交 PR，按模板填写改动内容和测试方式。改动界面时附截图。
4. 维护者审查后合并。较大的改动请先开 issue 讨论方案，避免白做。

## 贡献一套新模板

每套模板是 `templates/<templateId>/` 下的一个插件，包含三个文件：

```
templates/<templateId>/
├── index.tsx    # React 组件，默认导出，接收 TemplateProps
├── styles.ts    # 导出 styles 字符串，渲染时内联到页面
└── meta.json    # 模板说明
```

`meta.json` 的字段（类型见 `lib/render/types.ts` 的 `TemplateMeta`）：

| 字段 | 说明 |
|---|---|
| `id` | 模板 id，与目录名相同，只用小写字母和连字符 |
| `nameZh` | 中文名称，例如「海报」 |
| `descriptionZh` | 一句话说明适合什么场景 |
| `supports` | 支持的项目类型：`single`（单品）、`menu`（菜单），可以都支持 |

编写组件时必须遵守：

- **事实只能通过事实组件输出**。商品名、价格、规格、店铺电话和地址等，一律使用 `lib/render/shared/facts` 中的组件（`ItemText`、`ItemPrice`、`ShopText` 等），不要自己拼接文字。生成流程的质检会逐项核对页面上带 `data-fact` 标记的内容与事实表完全一致，不一致就不会生成版本。
- `copy` 里只有氛围文案（标题、副标题、结语、商品短评），不包含任何事实。
- 图片通过 `props.image(assetId, size, hero)` 获取，首屏主图传 `hero = true`，其余图片会懒加载。
- 配色、字体、装饰、首屏布局来自 `props.design`（`DesignSpec`），请支持全部取值。
- 页面在 360、375、430 像素宽的手机上不能出现横向滚动。

接入步骤：

1. 在 `templates/index.ts` 中注册新模板。
2. 把模板 id 加入 `lib/core/schemas.ts` 的 `TemplateId`，并在 `lib/design/prompt.ts` 中补充一行模板说明，让风格生成能选到它。因为这会改动共享契约，请先开 issue（可以使用「新模板提案」模板）。
3. 运行 `pnpm render:demo` 查看效果；运行 `pnpm test`，渲染测试会对所有模板检查事实标记、快照和横向溢出，按需更新快照（`pnpm exec vitest run tests/render -u`）并在 PR 中说明。
4. 字体只能使用 `lib/render/fonts.ts` 中已有的开源字体；如需新字体，必须是 OFL 或同等宽松许可，并在 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) 中补充。

## 补充规则词表

规则定义在 `packages/fact-guard/src/rules/index.ts`，`rules/packs/*.zh.yaml`（JSON 形式的 YAML 1.2）是供贡献和审阅的同内容副本，测试会逐项核对两者一致，所以两处要同时修改。`base.zh.yaml` 是通用规则，`food.zh.yaml` 是餐饮食品行业规则。修改后在 `packages/fact-guard/test/` 中补充应拦截和应放行的用例，并运行 `pnpm --filter fact-guard test`。新增词条时请同时考虑误伤，例如含数字的成语。

## 新增评测样本

按 [eval/README.md](eval/README.md)「新增一组样本」一节操作。要点：

- 图片只能使用自己拍摄、获得书面授权或明确可商用的图片，并在样本目录的 `LICENSE.txt` 中逐张写明来源与许可。
- `gold.json` 是人工标注的标准事实表；`input.txt` 原样粘贴商家原始文字，不要整理。
- 不要提交真实商家未授权公开的信息（电话、地址等）。

## 报告问题

- 缺陷和功能建议：在 [GitHub Issues](https://github.com/adamchangshun/shizhao/issues) 或 [Gitee Issues](https://gitee.com/sheng-changshun/shizhao/issues) 中按模板提交。
- 安全漏洞：不要公开提交，请按 [SECURITY.md](SECURITY.md) 私下报告。

## 许可证

提交贡献即表示你同意按 [Apache-2.0](LICENSE) 许可证授权你的贡献。
