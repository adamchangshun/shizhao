# 新人任务清单

下面 8 个任务都来自项目当前的真实缺口，可以独立完成，不需要了解整个系统。每个任务都写明了背景、要改的位置和完成标准，可以直接据此在 [GitHub](https://github.com/adamchangshun/shizhao/issues) 或 [Gitee](https://gitee.com/sheng-changshun/shizhao/issues) 上创建 issue。

开始前请先读 [CONTRIBUTING.md](../CONTRIBUTING.md)，在对应 issue 里留言认领，避免重复劳动。所有任务的完成标准都包括 `pnpm typecheck && pnpm lint && pnpm test` 通过。

规则层任务中的「当前行为」都在 2026-10-14 的 `main` 上实测过。

---

## 1. 规则层：拦截「最终之选」这类绝对化用语

- **背景**：「这是您的最终之选。」目前不会被拦截，但「最终之选」和「最佳之选」一样属于广告法禁止的绝对化用语。
- **位置**：`packages/fact-guard/src/rules/index.ts` 中的绝对化规则（`absolute`），并同步修改 `rules/packs/base.zh.yaml`（测试会逐项核对两者一致）；测试放在 `packages/fact-guard/test/`。
- **完成标准**：新增应拦截的用例（「最终之选」「终极之选」等）和应放行的用例（例如「最终价格以店内为准」），`pnpm --filter fact-guard test` 通过。
- **难度**：入门，只改规则和测试。

## 2. 规则层：事实表里有空格或全角字符时不应误伤

- **背景**：事实表中写的是「必 吃 榜」或「抖音甜品榜ＴＯＰ3」这类带空格、全角字符的写法时，文案里规范写法的「必吃榜」「ＴＯＰ3」仍被判为无依据。原因是文案会做规范化，事实区间却没有做同样的规范化。
- **位置**：`packages/fact-guard/src/check.ts` 中按事实区间（`evidenceScope: 'fact-span'`）查找依据的逻辑，规范化函数在 `packages/fact-guard/src/normalize.ts`。
- **完成标准**：上述两个例子在有对应事实时放行，没有事实时仍然拦截；保持命中位置是原文的 UTF-16 区间。
- **难度**：中等，需要读懂规范化前后的位置映射。

## 3. 规则层：「128块一个」应按价格理解

- **背景**：事实表有「128元」时，「128块一个。」仍被判为无依据的数字。规则把「块」后面跟「一个」的情况当成了数量单位。
- **位置**：`packages/fact-guard/src/cn-number.ts` 和价格比对逻辑。
- **完成标准**：「128块一个」「128块一份」在有「128元」时放行；「128块蛋糕」仍按数量处理、不能借用「128元」作依据（已有测试覆盖，不能被破坏）。
- **难度**：入门到中等。

## 4. 新增一个行业规则包：美妆

- **背景**：现在只有通用规则包和餐饮食品规则包。美妆类宣传常见的违规说法（例如「祛斑」「医学级」「100% 纯天然」）还没有覆盖。
- **位置**：在 `packages/fact-guard/src/rules/index.ts` 的 `rulePacks` 中新增 `cosmetics`，同时新建 `rules/packs/cosmetics.zh.yaml`（格式参考 `food.zh.yaml`），并在 `packages/fact-guard/test/rules.test.ts` 中加入两者一致的核对。
- **完成标准**：每条规则至少 2 个应拦截和 2 个应放行的测试用例；在 PR 中写明依据的法规或监管文件名称。
- **难度**：入门，主要工作是整理词表，需要一点法规知识。

## 5. 新增一个模型服务的配置示例

- **背景**：README 列出了通义千问、智谱、DeepSeek、模力方舟和 Ollama。还有很多国内服务提供 OpenAI 兼容接口，例如月之暗面（Kimi）、硅基流动。
- **位置**：README.md 和 README.en.md 的「接入真实模型」表格。
- **完成标准**：用 `LLM_PROFILE=generic` 实测一次 `pnpm eval:extract` 或文案生成，在 PR 中贴出脱敏后的结果（不要贴密钥）；表格中写明 base URL 和是否支持图片。
- **难度**：入门，需要自己有该服务的账号。

## 6. 新增一组评测样本

- **背景**：评测集目标是 10 组样本（烘焙甜品 5 组、小餐饮 / 饮品 5 组，单品与菜单各半），现在只有 3 组合成样本。
- **位置**：`eval/samples/<sampleId>/`，步骤见 [eval/README.md](../eval/README.md)「新增一组样本」。
- **完成标准**：图片为自己拍摄或明确可商用，`LICENSE.txt` 逐张写明来源；`gold.json` 人工标注完整；`PROVIDER=mock pnpm eval:extract` 能读取样本、不报格式错误。
- **难度**：入门，不需要写代码。

## 7. 下线从未发布的项目时不应改变状态

- **背景**：对一个从未发布过的项目调用 `POST /api/projects/:id/unpublish`，会写入 `unpublishedAt`，之后公开页的状态从「尚未发布」变成「已下线」。
- **位置**：`lib/publish/index.ts` 的 `unpublishProject`；测试在 `tests/publish/publish.test.ts`。
- **完成标准**：`publishedVersionId` 为空时不写数据库（或返回 409，在 issue 中先确定哪种），并补充测试，确认之后 `getPublishedHtmlPath` 仍返回 `never_published`。
- **难度**：入门。

## 8. 启动时清理没有数据库记录的版本目录

- **背景**：生成任务先写版本目录、再写数据库记录。如果进程恰好在两步之间崩溃，会在 `DATA_DIR/pages/<projectId>/` 下留下一个没有记录的版本目录。它只占磁盘，不影响数据一致性（见 `docs/review-log.md` 08 号第 1 轮）。
- **位置**：`lib/jobs/` 中的启动恢复逻辑（`runner.ts`），路径工具在 `lib/jobs/files.ts`。
- **完成标准**：服务启动时删除没有对应 `versions` 记录、且不属于运行中任务的版本目录；不跟随符号链接，不删除 `pages` 之外的任何东西；有测试覆盖正常目录被保留、孤儿目录被删除两种情况。
- **难度**：中等，涉及文件系统安全，提交时请说明如何避免误删。
