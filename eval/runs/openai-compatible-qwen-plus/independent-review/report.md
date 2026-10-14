# A2 对比实验独立复核

- 运行编号：`openai-compatible-qwen-plus`
- 真实模型：`provider=openai-compatible`；文本模型 `qwen-plus`；视觉模型 `qwen3-vl-plus`。
- `codeHash`：`5ec49ce9cfe3896c`。
- 规则结果来源：`eval/reports/2026-10-14/raw.json`（`runId` 已核对为本运行）。

## 方法与盲标边界

- 共发现 32 个存在 `page.html` 的页面，未超过 60，因此全量标注；抽样清单见 `sample-list.json`。随机种子按约定记录为 `20261013`，本次全量抽样未使用随机抽取。
- 标注阶段仅使用各样本 `gold.json` 与 `review-sheet.csv` 的 `visible_text`；未打开/读取 `raw.json`、`report.md` 或 `done.json`。可见文本按非空行去重作为标注片段，忽略空白。
- 判定：事实表以外的数字、成分、产地、工艺、服务/促销、库存/供应、排名、功效或绝对化用语记为无依据；纯氛围描述不记。10 条感官或修辞性边界文本标为 `disputed:true`，不进入下面的页面/句级指标。
- 对比阶段以规则 `unsupportedSentences[]` 与独立标注的文本片段做规范化的精确/包含/相似文本匹配；同一规则句或标注句最多配对一次。

## 结果

- 页面级数量一致率：**8/32 = 25.0%**。
- 句级：TP 21，FP 23，FN 68；规则精确率 **47.7%**，召回率 **23.6%**。
- 争议文本：10 条；其中规则命中的 2 条已从上述指标剔除。

| 组别 | 页面数 | 独立标注总数 | 独立标注平均/页 | 规则总数 | 规则平均/页 |
|---|---:|---:|---:|---:|---:|
| A-gold | 9 | 32 | 3.56 | 28 | 3.11 |
| A-raw | 7 | 21 | 3.00 | 16 | 2.29 |
| B-gold | 7 | 6 | 0.86 | 0 | 0.00 |
| B-e2e | 9 | 30 | 3.33 | 0 | 0.00 |

## 典型不一致（每组最多 10 页）

### A-gold

| 页面 | 独立标注有、规则未报 | 规则报出、独立未记 |
|---|---|---|
| `bakery-croissant-single/A-gold/1` | 新鲜出炉 · 当日现烤 · 外带优先 | 每天 7:30 — 19:00 |
| `bakery-croissant-single/A-gold/2` | 热销 | 每天 7:30–19:00 |
| `bakery-croissant-single/A-gold/3` | ✨ 现烤可颂，限量供应，来早有惊喜！ | 每天 7:30 – 19:00 |
| `bakery-dessert-menu/A-gold/1` | ✨ 热销甜品 | — |
| `bakery-dessert-menu/A-gold/2` | ✨ 热销甜品 | — |
| `bakery-dessert-menu/A-gold/3` | 热销甜品 | — |
| `drink-cafe-menu/A-gold/1` | — | ⏰ 营业时间：9:00 – 21:00 |
| `drink-cafe-menu/A-gold/2` | 中杯 · 绵密奶泡与醇厚意式浓缩融合 | 杭州 · 西湖区文三路 100 号 |
| `drink-cafe-menu/A-gold/3` | 中杯 · 经典意式浓缩融合温热牛奶 | \n \n \n \n 营业时间：9:00 – 21:00\n |

### A-raw

| 页面 | 独立标注有、规则未报 | 规则报出、独立未记 |
|---|---|---|
| `bakery-croissant-single/A-raw/2` | 招牌黄油可颂 | 每天 7:30 - 19:00 |
| `bakery-croissant-single/A-raw/3` | 招牌黄油可颂，外皮酥脆金黄，内里层层分明，入口即化。 | 12 / 80g |
| `bakery-dessert-menu/A-raw/1` | 本周限定甜品 | — |
| `bakery-dessert-menu/A-raw/2` | 本周限定甜品 | © 2025   · 每一口都是爱的温度 |
| `drink-cafe-menu/A-raw/1` | 手冲 · 拿铁 · 柠檬茶 | 营业时间：9:00 - 21:00 |
| `drink-cafe-menu/A-raw/2` | 立即下单 · 外卖到家 | 9:00 — 21:00 |
| `drink-cafe-menu/A-raw/3` | S | — |

### B-gold

| 页面 | 独立标注有、规则未报 | 规则报出、独立未记 |
|---|---|---|
| `bakery-croissant-single/B-gold/3` | 晨光里的手作可颂 | — |
| `drink-cafe-menu/B-gold/1` | 奶与意式浓缩轻柔相融，像晨光漫过窗台的温润触感 | — |
| `drink-cafe-menu/B-gold/2` | 手作萃取的澄澈，静谧中自有回甘。 | — |

### B-e2e

| 页面 | 独立标注有、规则未报 | 规则报出、独立未记 |
|---|---|---|
| `bakery-croissant-single/B-e2e/1` | 麦香小铺招牌黄油可颂 | — |
| `bakery-croissant-single/B-e2e/2` | 招牌黄油可颂，12 元一个，约 80g，每天早上现烤。 | — |
| `bakery-croissant-single/B-e2e/3` | 招牌黄油可颂，12 元一个，约 80g，每天早上现烤。 | — |
| `bakery-dessert-menu/B-e2e/2` | 葡式蛋挞，酥皮轻颤，蛋奶香在舌尖缓缓化开，手作温度悄然浮现。 | — |
| `bakery-dessert-menu/B-e2e/3` | 咖啡与奶香交织，云朵般轻盈落唇。 | — |
| `drink-cafe-menu/B-e2e/1` | ¥22份 | — |
| `drink-cafe-menu/B-e2e/2` | ¥22份 | — |
| `drink-cafe-menu/B-e2e/3` | ¥22份 | — |

## 原因分析

- 规则层对营业时间的数字、页脚年份和地址片段多次计数，即便这些信息已在事实表中；这形成主要的句级假阳性。
- 规则层未覆盖多种非数值风险：未证实的食材/制作方式、配送和促销条件、库存/限量、以及“招牌”“热销”等排名定位，因此召回率较低。
- B 组的很多风险是成分、风味和手作工艺叙述；尤其 `B-e2e` 的“份”与事实表“杯”的单位偏差，规则结果均未报出。
- 页面级统计受两类偏差共同影响：规则对支持事实中的数字过度计数，同时遗漏非数值内容风险；不能仅以其较低的 B 组计数作为内容可靠性的充分证据。

## 产物

- `sample-list.json`：全量抽样清单。
- `labels.jsonl`：逐片段独立标注（包含争议标记）。
- `review-sheet.filled.csv`：填入 `codex-a2` 的逐页计数和无依据片段。
