# A2 第二次独立复核：2026-10-20 云端对比实验

本次全量复核 33 个成功页面，按 gold 事实表口径标出 **111 条**确定的无依据说法，另有 **24 条 disputed**，不计入主要指标。规则层与独立标注同句命中 **50 条**，句级召回率为 **50/111 = 45.0%**；10-14 为 **21/89 = 23.6%**，本次高 **21.4 个百分点**。确定的句级误报 **11 条**，精确率 **50/(50+11) = 82.0%**；页面计数一致率 **10/33 = 30.3%**，10-14 为 8/32 = 25.0%。

独立复核确认：上次咖啡“份/杯”**单位错误 9 → 0**。本次相应页面省略单位，不能写成“已正确抽取出杯”。“12 元 / 80g”等规格并列写法沿用上次解释，保留展示歧义，见单位复核节。

**样本量限制：只有 3 组样本、7 个商品，素材是合成图片，各组每个样本尝试 3 次；33 页不是 33 个独立商家。上述结果只描述这 3 组样本和两次运行，不能推广为泛化结论，不能仅凭变化断言代码修复造成效果提升。** 本报告也不等同于模型判定层、120 条规则用例集或真实商家验证的结果。

## 输入、范围与独立性

- 本轮被测提交：`dafb379f0cdc`；报告标记日期 2026-10-20。
- 运行编号：`openai-compatible-qwen-plus-1020`；`provider=openai-compatible`、`mock=false`；文本 `qwen-plus`，视觉 `qwen3-vl-plus`；`codeHash=2d84acb81cfa1126`。这些字段在盲标后与 `raw.json` 内嵌 config 核对一致。
- 复核分支：`docs/a2-1020`；基线 `3cbf12f05210`；工作目录 `.`。被测提交与文档工作基线明确区分。
- 只读输入仓库 `../shizhao`。未切换或修改 `../shizhao-codex`，未访问 holdout，未运行模型调用、未执行任何被测 HTML。
- 本轮输入是 `eval/reports/2026-10-20/review-sheet.csv` 的 33 行及三个样本 `eval/samples/<sampleId>/gold.json`。`input.txt` 仅用来标注“商家原文已声明”，不扩大 gold 的证据范围。
- `../shizhao/eval/runs/openai-compatible-qwen-plus-1020/` 在现场不存在。因此按提示词修订允许的路径使用已提取 `visible_text`；无法重新核验 HTML 到可见文本的提取、隐藏元素或卡片 DOM 归属。未把旧运行的 `config.json` 当成本轮配置。
- 先完整读指定 A2 提示词及其文末修订。为遵守“先独立标注、后对比”，盲标前仅从本轮报告读取第 60–62 行复核口径及实验配置段，未读取本轮结果、`raw.json` 或 `done.json`；冻结后才读完整报告及规则明细。任务提示和用户本身已透露“33 页”“单位 9 → 0”和历史 23.6%，故不声称对这些总体信息完全不知情。
- 历史口径依据：`eval/reports/2026-10-14/report.md` 的 A2 分歧附录，以及 `eval/runs/openai-compatible-qwen-plus/independent-review/` 下原始报告、逐句标签、填表。10-14 报告目录本身没有另一个 A2 文件，已追溯其引用的原始复核。
- 在知道本轮规则结果之前，先将所有标注写入 `A2-review-sheet.csv` 并记录 SHA-256，随后只做匹配与统计，没有根据规则结果回改标注。提交检查发现CSV记录结束符为CRLF，于是只将34处记录结束符统一为LF；转换前后33行全部10字段逐值相同，原始冻结散列与交付散列均列在下文。

## 口径与计数方法

1. 以商家确认的 **gold** 为唯一事实依据；常识、商品名可能蕴含的原料、商家未纳入 gold 的“招牌”，均不自动成为配方/工艺依据。“商家原文已声明”是来源备注，仍保留无依据计数。
2. 延续 10-14：每页 `visible_text` 按非空行去重，一行多处问题记一条，不跨页去重。不把分隔符 `｜` 或同一行内多句话再拆成多个条目。原始文本的字面量 `\n` 仅作排版噪声清理，不改变原行边界；清理后为空的行不标注。文中 `L` 编号是原始非空去重行的 1-based 序号，保留纯排版行的序号以便复算。
3. 明确原料、制作方式、加工状态、具体风味、服务、库存、定位、数量等，未在 gold 确认即记无依据；纯氛围、裸 CTA、版权元信息、反馈表单控件不记。沿用历史对“蛋奶香”“表皮微焦”等具体产品描述的严格口径；不以常见配方推断商家实际采用的配方。
4. 纯感官/修辞边界列为 disputed。先判断是否含确定的无依据事实；若含有，整行仍为确定无依据。孤立“手作温度”类泛化标题和面向具体商品的工艺陈述存在语境边界，保留争议标记及理由，不称这些人工判断客观无争议。
5. 电话只证明联系方式，不自动证明电话预订；咖啡 gold 只有 `9:00-21:00`，新增“每天/周一至周日”按 10-14 已有营业日期判例计无依据。可颂 gold 本来有“每天”，相同日期表述有依据。
6. 商品名英文别名、已确认价格与规格的并列展示不因格式不同而计错；漏写价格/单位另属完整性问题，不等于新增无依据说法。仅依据文本顺序发现的两处可能串位，因缺少 HTML，列 disputed。
7. `annotator_sentences` 用 ` | ` 分隔；句内原有竖线转义为 `\|`。原清单前六列原样保留，填入 `annotator_unsupported_count`、`annotator_sentences`、`annotator=codex-a2`、`notes`。
8. 规则明细从本轮 `raw.json → compare.pages[].unsupportedSentences` 读取。只匹配同一页的同一可见行，结合被规则去掉的 gold 原文手工核对，一对一配对，不用关键词相似度跨行配对。附录保留全部 64 条规则结果的行号映射。
9. **与 10-14 可比的主指标是句/行级相交**：人工认为整行无依据，规则也报同一行，即为 TP；FN 为人工行未被报出；FP 为被报出的行有依据或属于非事实文字。规则命中的 disputed 行剔除。主指标并不证明该行每一个错误都被正确识别；仅版权年份触发的混合行另列原因校验。
10. 页面一致率在剔除争议命中后比较两个每页计数，分母仍为所有成功页面；不删掉整张有争议句的页面。32 页旧结果与33页新结果都按这一逐片段排除方法报告。

## 四组汇总及 10-14 并排对比

| 组别 | 10-14页数 | 10-14人工总数 | 10-14人工/页 | 10-20页数 | 10-20人工总数 | 10-20人工/页 | 10-20规则剔争议 总数/每页 | 10-20规则原始 总数/每页 |
|---|---|---|---|---|---|---|---|---|
| A-gold | 9 | 32 | 3.56 | 9 | 55 | 6.11 | 35 / 3.89 | 38 / 4.22 |
| A-raw | 7 | 21 | 3.00 | 7 | 30 | 4.29 | 22 / 3.14 | 22 / 3.14 |
| B-gold | 7 | 6 | 0.86 | 8 | 12 | 1.50 | 0 / 0.00 | 0 / 0.00 |
| B-e2e | 9 | 30 | 3.33 | 9 | 14 | 1.56 | 4 / 0.44 | 4 / 0.44 |

10-14 原始 A2 报告中的规则量为 A-gold 28 条（3.11/页）、A-raw 16 条（2.29/页），两类 B 均为 0；A-gold 的原始规则结果是 30 条，旧复核已剔除其中 2 条 disputed。10-20 为 38 条剔除 3 条后得到 35，不能将旧剔争议值与新原始值混作同一口径。四组均值不做无权平均，整体召回按条数合并。

| 组别 | TP | FP | FN | 规则命中争议句 | 召回率 | 页面计数一致 |
|---|---|---|---|---|---|---|
| A-gold | 31 | 4 | 24 | 3 | 31/55 = 56.4% | 2/9 |
| A-raw | 15 | 7 | 15 | 0 | 15/30 = 50.0% | 0/7 |
| B-gold | 0 | 0 | 12 | 0 | 0/12 = 0.0% | 4/8 |
| B-e2e | 4 | 0 | 10 | 0 | 4/14 = 28.6% | 4/9 |

总账：人工 111 = TP 50 + FN 61；规则原始 64 = TP 50 + FP 11 + disputed 3；用于精确率的规则条目为 61。争议标签共 24 条，其中只有 3 条被规则命中，不能把 24 全部从规则分母扣除。

本次可颂 A-raw/2、/3 和 B-gold/1 无成功页，不计作零错误；三次失败计入运行尝试但不进入每页均值。旧结果有 32 页，新结果有 33 页；各次生成内容不同，即使 sample/group/run 相同也不是同一篇页面的前后编辑。

## 逐页人工计数：与 10-14 并排

| 页面 | 10-14人工 | 10-20人工 | 10-20规则剔争议 | TP | FP | FN |
|---|---|---|---|---|---|---|
| `bakery-croissant-single/A-gold/1` | 1 | 4 | 4 | 4 | 0 | 0 |
| `bakery-croissant-single/A-gold/2` | 5 | 3 | 3 | 3 | 0 | 0 |
| `bakery-croissant-single/A-gold/3` | 1 | 2 | 1 | 1 | 0 | 1 |
| `bakery-croissant-single/A-raw/1` | — | 1 | 3 | 1 | 2 | 0 |
| `bakery-croissant-single/A-raw/2` | 1 | — | — | — | — | — |
| `bakery-croissant-single/A-raw/3` | 2 | — | — | — | — | — |
| `bakery-croissant-single/B-gold/1` | 0 | — | — | — | — | — |
| `bakery-croissant-single/B-gold/2` | 0 | 0 | 0 | 0 | 0 | 0 |
| `bakery-croissant-single/B-gold/3` | 1 | 0 | 0 | 0 | 0 | 0 |
| `bakery-croissant-single/B-e2e/1` | 3 | 1 | 1 | 1 | 0 | 0 |
| `bakery-croissant-single/B-e2e/2` | 2 | 1 | 1 | 1 | 0 | 0 |
| `bakery-croissant-single/B-e2e/3` | 2 | 3 | 2 | 2 | 0 | 1 |
| `bakery-dessert-menu/A-gold/1` | 7 | 10 | 9 | 8 | 1 | 2 |
| `bakery-dessert-menu/A-gold/2` | 6 | 6 | 3 | 3 | 0 | 3 |
| `bakery-dessert-menu/A-gold/3` | 6 | 9 | 6 | 6 | 0 | 3 |
| `bakery-dessert-menu/A-raw/1` | 6 | 7 | 5 | 5 | 0 | 2 |
| `bakery-dessert-menu/A-raw/2` | 3 | 7 | 6 | 5 | 1 | 2 |
| `bakery-dessert-menu/A-raw/3` | — | 6 | 4 | 4 | 0 | 2 |
| `bakery-dessert-menu/B-gold/1` | 0 | 3 | 0 | 0 | 0 | 3 |
| `bakery-dessert-menu/B-gold/2` | — | 4 | 0 | 0 | 0 | 4 |
| `bakery-dessert-menu/B-gold/3` | 0 | 3 | 0 | 0 | 0 | 3 |
| `bakery-dessert-menu/B-e2e/1` | 0 | 3 | 0 | 0 | 0 | 3 |
| `bakery-dessert-menu/B-e2e/2` | 3 | 3 | 0 | 0 | 0 | 3 |
| `bakery-dessert-menu/B-e2e/3` | 2 | 2 | 0 | 0 | 0 | 2 |
| `drink-cafe-menu/A-gold/1` | 0 | 5 | 3 | 2 | 1 | 3 |
| `drink-cafe-menu/A-gold/2` | 2 | 7 | 2 | 1 | 1 | 6 |
| `drink-cafe-menu/A-gold/3` | 4 | 9 | 4 | 3 | 1 | 6 |
| `drink-cafe-menu/A-raw/1` | 2 | 3 | 1 | 0 | 1 | 3 |
| `drink-cafe-menu/A-raw/2` | 2 | 5 | 0 | 0 | 0 | 5 |
| `drink-cafe-menu/A-raw/3` | 5 | 1 | 3 | 0 | 3 | 1 |
| `drink-cafe-menu/B-gold/1` | 3 | 0 | 0 | 0 | 0 | 0 |
| `drink-cafe-menu/B-gold/2` | 2 | 2 | 0 | 0 | 0 | 2 |
| `drink-cafe-menu/B-gold/3` | — | 0 | 0 | 0 | 0 | 0 |
| `drink-cafe-menu/B-e2e/1` | 6 | 1 | 0 | 0 | 0 | 1 |
| `drink-cafe-menu/B-e2e/2` | 6 | 0 | 0 | 0 | 0 | 0 |
| `drink-cafe-menu/B-e2e/3` | 6 | 0 | 0 | 0 | 0 | 0 |

`—` 表示该次没有纳入成功页面，不是 0。表含两次样本/组别/次数的并集 36 个槽位；本轮实际填表仍为 33 行。原句及理由见同目录 `A2-review-sheet.csv`。

## 五类分歧归档

为避免重叠：①是商品价格单位错误；②是 gold 与商家原文的来源口径；③是非事实文字被过度触发；④是 gold 口径下真正未报出的人工无依据行；⑤在下表指**除③外的其他规则误报**。误报总数为③+⑤=11，不能再把“总误报11”与③6重复相加。②本轮已全部被规则命中，保留为口径案例而非漏报。其余 46 条常规 TP 不放进分歧表。

10-14 附录的③名为“商品名自带成分”，与本轮要求的“规则过严”不是同一分类。本轮按用户给出的名称使用③；商品名蕴含成分仍按历史严格 gold 口径标注，其未报出的条目计在④，**不因本轮分类改名而豁免或重写原始计数**。

| 类别 | 本轮条数 | 定位与例句 |
|---|---|---|
| ① 单位错误 | 0 | 明确金额后量词与gold冲突为0；历史咖啡份/杯9条本次均不再出现 |
| ② 口径（商家原文已声明） | 4 | 可颂B-e2e三个页面的招牌，/3有两行；全部为TP |
| ③ 规则过严 | 6 | 5条仅因版权年份报出的无问题页脚 + 1条泛化标题；属于误报子集 |
| ④ 规则真漏 | 61 | A-gold 24、A-raw 15、B-gold 12、B-e2e 10；包含严格gold口径下原料/工艺/状态/服务等 |
| ⑤ 其他规则误报 | 5 | 可颂现烤1条、地址/版权混合1条、独立价格数字3条；与③互斥 |

②的完整定位：`bakery-croissant-single/B-e2e/1:L6`、`/2:L6`、`/3:L6` 原句均为“招牌黄油可颂，12 元一个，约 80g，每天早上现烤。”；`/3:L7` 为“招牌黄油可颂，每天早上现烤”。四条 notes 均注明“商家原文已声明”。商家原文的“本周甜品”不能支持页面额外加入的“本周限定”，后者不归②。

④的典型遗漏包括电话预订、免费 Wi-Fi、外卖/会员积分、热冰可选、支付方式、每周营业日期，以及具体原料或加工状态。B-gold 的12条全部未被规则报出；B-e2e 的14条中仅4条“招牌”被报出。因此本轮 B-e2e 的召回增加不能推成所有原料、服务、工艺风险均已解决。附录给出全部61条FN，以便逐条检查。

## 规则误报：全部原句

| 页面与行 | 页面原句 | 规则命中证据 | 分类 | 判为有依据或非事实的理由 |
|---|---|---|---|---|
| `bakery-croissant-single/A-raw/1:L12` | 今日新鲜出炉 🥐 | 新鲜出炉 | ⑤ | gold明确每天早上现烤；沿用旧复核对新鲜出炉的支持口径 |
| `bakery-croissant-single/A-raw/1:L15` | © 2025 麦香小铺 · 每一口都是清晨的温度 | 2025 | ③ | 命中证据只有版权年份；其余为氛围/已确认位置或泛化制作文字，不新增具体经营事实 |
| `bakery-dessert-menu/A-gold/1:L4` | 手作温度 · 甜蜜交付 | 手作 | ③ | 泛化情绪标题，未明确手工工序或配送承诺；沿用旧复核的氛围排除 |
| `bakery-dessert-menu/A-raw/2:L18` | © 2025 甜心烘焙坊 · 每一口都是爱的味道 | 2025 | ③ | 命中证据只有版权年份；其余为氛围/已确认位置或泛化制作文字，不新增具体经营事实 |
| `drink-cafe-menu/A-gold/1:L25` | © 2024 转角咖啡 · 杭州西湖区 | 2024 | ③ | 命中证据只有版权年份；其余为氛围/已确认位置或泛化制作文字，不新增具体经营事实 |
| `drink-cafe-menu/A-gold/2:L24` | © 2024 转角咖啡 · 杭州西湖 | 2024 | ③ | 命中证据只有版权年份；其余为氛围/已确认位置或泛化制作文字，不新增具体经营事实 |
| `drink-cafe-menu/A-gold/3:L24` | © 2024 转角咖啡 · 杭州西湖区文三路 100 号 | 2024, 三, 100 | ⑤ | 地址是gold同一地址的缩写变体；版权年份不作经营事实 |
| `drink-cafe-menu/A-raw/1:L19` | © 2025 转角咖啡 · 每一杯都用心制作 | 2025 | ③ | 命中证据只有版权年份；其余为氛围/已确认位置或泛化制作文字，不新增具体经营事实 |
| `drink-cafe-menu/A-raw/3:L3` | 22 | 22 | ⑤ | 结合相邻商品名，分别为拿铁22、美式18、柠檬茶15的gold价格；缺货币符号不使数字失据 |
| `drink-cafe-menu/A-raw/3:L5` | 18 | 18 | ⑤ | 结合相邻商品名，分别为拿铁22、美式18、柠檬茶15的gold价格；缺货币符号不使数字失据 |
| `drink-cafe-menu/A-raw/3:L7` | 15 | 15 | ⑤ | 结合相邻商品名，分别为拿铁22、美式18、柠檬茶15的gold价格；缺货币符号不使数字失据 |

其中可由 gold 正面核对的事实误报为⑤5条；另6条③是应从事实指标排除的元信息/氛围，不等于声称 gold 证明版权年份真实性。对于“手作温度”标题的边界，本轮盲标把这一泛化标题排除，而下列商品语境中的三个表达列 disputed；这是语境判断，不能将误报数字包装成完全无主观判断。

## 规则命中的争议句与原因命中质量

| 页面与行 | 原句 | 处理 |
|---|---|---|
| `bakery-croissant-single/A-gold/3:L8` | 酥脆外皮｜丰润黄油香｜手作温度 | disputed，剔除精确率和每页规则计数，不算FP或TP |
| `bakery-croissant-single/A-gold/3:L22` | © 2024 麦香小铺 · 手作温度，从清晨开始 | disputed，剔除精确率和每页规则计数，不算FP或TP |
| `bakery-dessert-menu/A-gold/3:L5` | 手作 · 温暖 · 每一口都用心 | disputed，剔除精确率和每页规则计数，不算FP或TP |

其余21条未被规则命中的 disputed 也不进入人工111条或FN61条，原句和理由均在 CSV notes 中。包括两处可能串位：咖啡 B-e2e/1 的“拿铁中杯，清简回甘”出现在美式及18元后；B-e2e/2 的“美式咖啡”出现在拿铁及22元后。由于缺少HTML，仅凭可见文本顺序不能确认卡片归属，未将其升级为确定错误。

主指标中有3条需要降级理解的TP：

| 页面与行 | 人工无依据内容 | 实际规则证据 |
|---|---|---|
| `bakery-dessert-menu/A-gold/2:L22` | 所有产品均为当日新鲜制作 | 只有 `2024` |
| `bakery-dessert-menu/A-gold/3:L26` | 所有甜品均为当日新鲜制作 | 只有 `2024` |
| `bakery-dessert-menu/A-raw/3:L22` | 所有甜品当日新鲜制作 | 只有 `2025` |

按用户要求与10-14的**同句命中**口径，这3条仍在TP50内；但不能说规则识别了制作时效错误。若另要求命中理由也指向人工指出的无依据事实，则为 **47/111 = 42.3%**，对应14条输出侧误报、64条人工侧遗漏、3条争议剔除，理由级精确率47/61=77.0%。这是一项补充敏感性核验，**不能拿42.3%直接与未经同样重算的旧23.6%做严格同口径比较**。即使一条规则报出了混合行中的某个正确问题，也不表示该行其他问题均被覆盖。

## ① 单位错误的独立确认

先逐页阅读33页的价格、对应商品与gold单位，再以独立于原报告脚本的金额/量词扫描做交叉核对，没有运行原 `count-unit-errors.py` 来充当独立判断。

- 10-14：旧复核CSV中可识别的金额后显式量词出现47处，9处冲突，全部为 `drink-cafe-menu/B-e2e/{1,2,3}` 每页的 `¥22份`、`¥18份`、`¥15份`，gold为“杯”。
- 10-20：金额后显式单字量词出现49处，逐项对照同价商品的gold单位，冲突0处；同一样本没有同价但不同单位的归属冲突。该扫描是辅助检查，其计数单位是文字出现次数，不是人工去重行数。
- 咖啡 B-e2e 三页的22、18、15均没有“份”或其他错误量词，属于**没有补默认单位**；未声称生成了正确的“杯”。其他明确“个/份/杯”与gold一致。
- “12 元 / 80g”“¥128 / 6寸”“128 元/6 寸”以及独立的“/6寸”按商品上下文作为价格与标称规格并列。尤其10-14 A2已把可颂“12 / 80g”的规则命中列为误报；本轮在盲标冻结前核对该先例，并沿用该解释。单个斜线不足以确立“每80g按重出售”，但省略“约”确有展示歧义，不能推广为任何重量计价表达都正确。
- 巴斯克 B-e2e 三页未显示128元，是价格完整性缺失，不计错单位，也不计新增无依据句；其存在不被“单位0”掩盖。
- `git diff 65f0473 dafb379 -- eval/samples` 为空；本轮读取的三个gold与文档worktree对应文件字节一致。

结论为：在这33页、上述与10-14一致的显示解释下，确定单位错误为0；旧咖啡默认“份”的9处确已不再出现。没有HTML、只有3组样本且单位缺失未纳入错误，故不能据此宣称单位提取普遍正确。

## Codex GPT 模式分工与验收记录

Codex负责全部33页标注、原始材料核对、冻结、64条规则对齐、计算及文件验证。通过已显式启动的 `codex-gpt-mode`，向ChatGPT Pro派发T2 v1，提供gold摘录和12个边界片段，未发送规则结果；Pro仅做口径检查，不是另一份33页全量标注。

Pro确认了价格/规格并列、电话不蕴含预订、版权元信息排除和③⑤避免重复计数等边界。对“质朴面团裹着黄油，现烤出炉”，Pro倾向disputed；Codex核对10-14同类“黄油作为配料/成分”判例后，保留本轮严格gold下的无依据标签。对“风味最佳”，本轮沿用提示词的绝对化口径；该行同时有无防腐剂的确定问题，整行无依据不依赖这一边界。不得把Pro意见当作已完成全部标签或已验证统计。

Pro对话：https://chatgpt.com/c/6ad83938-63a0-83e9-b236-8c3e13af2ec9

接收的可见对话文本SHA-256：`sha256-a09e0ec124590d329df88cb19d4f83880b3ca2ae6d839fcb17d0ed0f018744b0`。正文记录替代Skill默认的额外 `CODEX_REVIEW_SUMMARY.md`，以遵守本轮只新增两个仓库文件的范围。

| 要求 | 对应任务 | 已验证证据 |
|---|---|---|
| R1 全量33页、四字段填齐 | T1/T3 Codex | 清单与产物page_id集合完全一致，无重复、无抽样 |
| R2 先独立标注后对比 | T2/T3 Codex + Pro边界检查 | 先冻结CSV散列，再读取本轮规则；仅换行序列化调整，全部字段相同，无标签回改 |
| R3 gold及10-14口径 | T2/T3 | 三份gold逐项核对、原文备注4条、历史边界判例 |
| R4 四组/逐页/召回/误报/五类/单位 | T4 Codex | 汇总、36槽位并排表、64条映射、61条FN、11条FP、单位核对 |
| R5 三组样本限制 | T5 Codex | 结论与限制明确，不作泛化或因果归因 |
| R6 仅指定worktree两个新增文件 | T1/T5 Codex | 基线与分支核对、限定路径diff、CSV字段及Markdown核验 |

本任务为文档与数据复核，没有修改运行时代码，不安装依赖、不重跑应用测试或云模型。提交前核验CSV可解析、计数与句列表相符、前六列未改变、全部规则映射可回溯、总账平衡、输出范围及 `git diff --check`。本地提交后不合并、不推送。

## 可复核指纹

| 材料 | SHA-256或时间 |
|---|---|
| 盲标冻结时间（UTC） | 2026-10-21T04:08:03.091249+00:00 |
| 盲标冻结时间（Asia/Shanghai） | 2026-10-21 12:08:03 |
| 输入review-sheet.csv | sha256-bb3d9e3184da91bd3d3b5a46964ba4eac21d8e5280c79c30d648b1d63521a22d |
| 盲标冻结CSV（CRLF记录结束符） | sha256-1a954c5ea0375ce29c3d4de0cd26b141ac05d0320984d23a36d2853cbbfd3821 |
| 交付A2-review-sheet.csv（LF记录结束符） | sha256-031bd74e98bd38147e4e3b517ef9c1eb41ad53a38702d544d7b9f1c95e71c0e8 |
| 转换前后相同的规范化CSV行JSON | sha256-df0b09deb7ba813841a0183703e1cc031e0fb5031dbfc58c3c5dc8cb99e04d4b |
| 本轮raw.json | sha256-d1a4e9b4c441d4b0a6e4db95b296677d81927cb9f1949b827fa790cde9707341 |
| 10-14 labels.jsonl | sha256-ada8087632fe3f3529e27a6c265f984c00af5b76f6bccfd6b31163dcd0820608 |
| eval/samples/bakery-croissant-single/gold.json | sha256-751f2d841d54bc89199897b11eac0e1756aaed8449f00e150741355a8d550d17 |
| eval/samples/bakery-dessert-menu/gold.json | sha256-2c7f009dff9a40e1da7c65850101fc254b070ebfe2ee1a620adaf83765449ecd |
| eval/samples/drink-cafe-menu/gold.json | sha256-0f43bb251b371ee7e117689ec086b7dfe2b9203f4aae49eaf8149aa944168e89 |

## 附录A：全部规则句的一对一映射

规则序号为该页 `unsupportedSentences[]` 的1-based位置。L为CSV可见文本原始非空去重行号；TP/FP/D分别表示同句命中、误报、争议剔除。该表给出全部64条，不用模糊文本相似度推断。

| 页面 | 规则序号 | 人工原行 | 结果 |
|---|---|---|---|
| `bakery-croissant-single/A-gold/1` | 1 | L13 | TP |
| `bakery-croissant-single/A-gold/1` | 2 | L19 | TP |
| `bakery-croissant-single/A-gold/1` | 3 | L21 | TP |
| `bakery-croissant-single/A-gold/1` | 4 | L22 | TP |
| `bakery-croissant-single/A-gold/2` | 1 | L11 | TP |
| `bakery-croissant-single/A-gold/2` | 2 | L12 | TP |
| `bakery-croissant-single/A-gold/2` | 3 | L23 | TP |
| `bakery-croissant-single/A-gold/3` | 1 | L8 | D |
| `bakery-croissant-single/A-gold/3` | 2 | L12 | TP |
| `bakery-croissant-single/A-gold/3` | 3 | L22 | D |
| `bakery-croissant-single/A-raw/1` | 1 | L12 | FP |
| `bakery-croissant-single/A-raw/1` | 2 | L13 | TP |
| `bakery-croissant-single/A-raw/1` | 3 | L15 | FP |
| `bakery-croissant-single/B-e2e/1` | 1 | L6 | TP |
| `bakery-croissant-single/B-e2e/2` | 1 | L6 | TP |
| `bakery-croissant-single/B-e2e/3` | 1 | L6 | TP |
| `bakery-croissant-single/B-e2e/3` | 2 | L7 | TP |
| `bakery-dessert-menu/A-gold/1` | 1 | L4 | FP |
| `bakery-dessert-menu/A-gold/1` | 2 | L8 | TP |
| `bakery-dessert-menu/A-gold/1` | 3 | L9 | TP |
| `bakery-dessert-menu/A-gold/1` | 4 | L12 | TP |
| `bakery-dessert-menu/A-gold/1` | 5 | L13 | TP |
| `bakery-dessert-menu/A-gold/1` | 6 | L20 | TP |
| `bakery-dessert-menu/A-gold/1` | 7 | L22 | TP |
| `bakery-dessert-menu/A-gold/1` | 8 | L23 | TP |
| `bakery-dessert-menu/A-gold/1` | 9 | L27 | TP |
| `bakery-dessert-menu/A-gold/2` | 1 | L4 | TP |
| `bakery-dessert-menu/A-gold/2` | 2 | L8 | TP |
| `bakery-dessert-menu/A-gold/2` | 3 | L22 | TP |
| `bakery-dessert-menu/A-gold/3` | 1 | L5 | D |
| `bakery-dessert-menu/A-gold/3` | 2 | L10 | TP |
| `bakery-dessert-menu/A-gold/3` | 3 | L11 | TP |
| `bakery-dessert-menu/A-gold/3` | 4 | L16 | TP |
| `bakery-dessert-menu/A-gold/3` | 5 | L19 | TP |
| `bakery-dessert-menu/A-gold/3` | 6 | L24 | TP |
| `bakery-dessert-menu/A-gold/3` | 7 | L26 | TP |
| `bakery-dessert-menu/A-raw/1` | 1 | L3 | TP |
| `bakery-dessert-menu/A-raw/1` | 2 | L4 | TP |
| `bakery-dessert-menu/A-raw/1` | 3 | L12 | TP |
| `bakery-dessert-menu/A-raw/1` | 4 | L17 | TP |
| `bakery-dessert-menu/A-raw/1` | 5 | L18 | TP |
| `bakery-dessert-menu/A-raw/2` | 1 | L3 | TP |
| `bakery-dessert-menu/A-raw/2` | 2 | L4 | TP |
| `bakery-dessert-menu/A-raw/2` | 3 | L13 | TP |
| `bakery-dessert-menu/A-raw/2` | 4 | L17 | TP |
| `bakery-dessert-menu/A-raw/2` | 5 | L18 | FP |
| `bakery-dessert-menu/A-raw/2` | 6 | L19 | TP |
| `bakery-dessert-menu/A-raw/3` | 1 | L3 | TP |
| `bakery-dessert-menu/A-raw/3` | 2 | L4 | TP |
| `bakery-dessert-menu/A-raw/3` | 3 | L22 | TP |
| `bakery-dessert-menu/A-raw/3` | 4 | L23 | TP |
| `drink-cafe-menu/A-gold/1` | 1 | L5 | TP |
| `drink-cafe-menu/A-gold/1` | 2 | L21 | TP |
| `drink-cafe-menu/A-gold/1` | 3 | L25 | FP |
| `drink-cafe-menu/A-gold/2` | 1 | L24 | FP |
| `drink-cafe-menu/A-gold/2` | 2 | L25 | TP |
| `drink-cafe-menu/A-gold/3` | 1 | L13 | TP |
| `drink-cafe-menu/A-gold/3` | 2 | L17 | TP |
| `drink-cafe-menu/A-gold/3` | 3 | L19 | TP |
| `drink-cafe-menu/A-gold/3` | 4 | L24 | FP |
| `drink-cafe-menu/A-raw/1` | 1 | L19 | FP |
| `drink-cafe-menu/A-raw/3` | 1 | L3 | FP |
| `drink-cafe-menu/A-raw/3` | 2 | L5 | FP |
| `drink-cafe-menu/A-raw/3` | 3 | L7 | FP |

## 附录B：全部未命中的人工无依据行（④，61条）

| 页面与行 | 原句 | gold口径下原因 |
|---|---|---|
| `bakery-croissant-single/A-gold/3:L23` | 欢迎到店，也支持电话预订哦！ | 支持电话预订未确认；有电话不等于有预订服务 |
| `bakery-croissant-single/B-e2e/3:L3` | 质朴面团裹着黄油，现烤出炉 | 面团裹着黄油为具体原料/制作关系，gold商品名不能替代配方确认 |
| `bakery-dessert-menu/A-gold/1:L16` | 经典意式 · 咖啡酒香 · 绵密顺滑 | 咖啡酒香为未确认的具体配方/风味 |
| `bakery-dessert-menu/A-gold/1:L25` | 微信联系或电话下单，支持同城配送与自提 | 同城配送与自提未确认 |
| `bakery-dessert-menu/A-gold/2:L11` | 酥脆外皮 × 浓郁蛋奶香 | 蛋奶香为未确认的具体配方/风味（沿用10-14蛋奶香口径） |
| `bakery-dessert-menu/A-gold/2:L14` | 经典意式风味｜咖啡与马斯卡彭的温柔邂逅 | 咖啡和马斯卡彭没有原料依据 |
| `bakery-dessert-menu/A-gold/2:L17` | 焦糖表皮 × 绵密流心｜6寸整蛋糕 | 焦糖表皮、流心没有配方/状态依据 |
| `bakery-dessert-menu/A-gold/3:L15` | 酥脆外皮 · 浓郁蛋香 · 经典不败 | 蛋香为未确认的具体产品风味 |
| `bakery-dessert-menu/A-gold/3:L18` | 马斯卡彭奶酪 · 手冲咖啡浸润手指饼干 | 马斯卡彭、手冲咖啡与手指饼干均未确认 |
| `bakery-dessert-menu/A-gold/3:L21` | 浓醇流心 · 焦糖表皮 · 6寸整蛋糕 | 流心、焦糖表皮无配方/状态依据 |
| `bakery-dessert-menu/A-raw/1:L6` | 酥皮层层分明，蛋奶香浓顺滑 | 蛋奶香为未确认的具体配方/风味 |
| `bakery-dessert-menu/A-raw/1:L9` | 经典意式风味，咖啡与马斯卡彭的完美融合 | 咖啡与马斯卡彭无原料依据 |
| `bakery-dessert-menu/A-raw/2:L7` | 酥皮层层分明，蛋香浓郁顺滑 | 蛋香为未确认的具体产品风味 |
| `bakery-dessert-menu/A-raw/2:L10` | 经典意式风味，咖啡与奶酪的完美融合 | 咖啡与奶酪无原料依据 |
| `bakery-dessert-menu/A-raw/3:L10` | 经典意式 · 咖啡酒香 | 咖啡酒香为未确认的具体配方/风味 |
| `bakery-dessert-menu/A-raw/3:L18` | 微信预约更便捷，提前预定不排队 | 提前预定不排队为未确认的服务保证 |
| `bakery-dessert-menu/B-gold/1:L7` | 酥脆外皮裹着柔滑蛋奶香 | 蛋奶香为未确认的具体配方/风味 |
| `bakery-dessert-menu/B-gold/1:L10` | 咖啡微苦与奶霜绵密交织，雅致层次悄然唤醒记忆里的柔软。 | 咖啡与奶霜的原料关系未确认 |
| `bakery-dessert-menu/B-gold/1:L14` | 表面微焦，内里如云朵般温润，甜蜜在静默中缓缓流淌。 | 表面微焦为未确认加工/产品状态（沿用10-14同类口径） |
| `bakery-dessert-menu/B-gold/2:L7` | 金黄酥皮裹着微颤的焦糖奶香，绵密回甘里透出温润气息 | 焦糖奶香为未确认的具体配方/风味 |
| `bakery-dessert-menu/B-gold/2:L10` | 轻盈咖啡香与奶霜层层相依，雅致滋味在舌尖悄然舒展。 | 咖啡香与奶霜的原料关系未确认 |
| `bakery-dessert-menu/B-gold/2:L14` | 外缘微焦，内里如云朵般柔润，暖甜在朴素中静静流淌。 | 外缘微焦为未确认加工/产品状态 |
| `bakery-dessert-menu/B-gold/2:L15` | 慢烘细焙，把心意揉进每一份甜里。 | 慢烘细焙增加慢烘工艺，gold无工艺事实 |
| `bakery-dessert-menu/B-gold/3:L7` | 酥脆外皮裹着柔滑蛋心，微焦香气轻轻漫开。 | 柔滑蛋心与微焦香气为具体产品状态/风味，gold未确认 |
| `bakery-dessert-menu/B-gold/3:L10` | 咖啡与奶霜层层低语，绵密质地如午后阳光般温润舒展。 | 咖啡与奶霜原料关系未确认 |
| `bakery-dessert-menu/B-gold/3:L14` | 表面微皱，内里如云朵般柔软，甜暖在舌尖缓缓铺陈。 | 表面微皱为未确认的具体产品状态 |
| `bakery-dessert-menu/B-e2e/1:L7` | 葡式蛋挞，酥皮轻颤，流心温润 | 流心为未确认的内馅/产品状态 |
| `bakery-dessert-menu/B-e2e/1:L10` | 提拉米苏，绵密层叠，咖啡与奶香低语，雅致在舌尖徐徐舒展。 | 咖啡与奶香为未确认的具体配方/风味 |
| `bakery-dessert-menu/B-e2e/1:L13` | 巴斯克芝士蛋糕，表皮微焦，内里柔润，甜蜜如初遇般温软妥帖。 | 表皮微焦为未确认加工/产品状态 |
| `bakery-dessert-menu/B-e2e/2:L7` | 金黄酥皮轻颤，内里蛋奶微漾，唇齿间缓缓化开 | 蛋奶为未确认原料/产品状态 |
| `bakery-dessert-menu/B-e2e/2:L10` | 咖啡香与奶霜层叠交融，轻盈绵密，如午后一段温柔低语。 | 咖啡香与奶霜原料关系未确认 |
| `bakery-dessert-menu/B-e2e/2:L13` | 外缘微焦，内里柔润如绸，纯粹芝士香里藏着不动声色的雅致。 | 外缘微焦和芝士香未作为配方/状态事实确认 |
| `bakery-dessert-menu/B-e2e/3:L9` | 提拉米苏，绵密层叠间浮起淡淡酒香与可可余韵，甜暖不言而喻。 | 酒香、可可余韵为未确认的具体配方/风味 |
| `bakery-dessert-menu/B-e2e/3:L12` | 巴斯克芝士蛋糕，表皮微焦如秋日私语，内里醇厚柔润，雅致悄然弥漫。 | 表皮微焦为未确认加工/产品状态 |
| `drink-cafe-menu/A-gold/1:L11` | 每日 9:00 – 21:00 | 每日营业日期范围未在gold确认（gold只有时段） |
| `drink-cafe-menu/A-gold/1:L15` | 中杯 · 香浓顺滑，奶泡绵密 | 奶泡为未确认原料/制作形态 |
| `drink-cafe-menu/A-gold/1:L23` | 步行可达 · 免费 Wi-Fi · 温馨阅读角 | 步行可达、免费Wi-Fi与阅读角服务未确认 |
| `drink-cafe-menu/A-gold/2:L2` | 营业中 | 营业中是实时状态，静态gold不能确认 |
| `drink-cafe-menu/A-gold/2:L4` | 西湖边的慢时光，从这一杯开始 | 西湖边位置未确认 |
| `drink-cafe-menu/A-gold/2:L10` | 每天 9:00 — 21:00 | 每天营业日期范围未确认 |
| `drink-cafe-menu/A-gold/2:L14` | 经典意式浓缩融合温热牛奶，中杯规格 | 意式浓缩与温热牛奶原料/制作关系未确认 |
| `drink-cafe-menu/A-gold/2:L20` | 清爽酸甜，夏日特调 | 夏日特调增加未确认的季节产品定位 |
| `drink-cafe-menu/A-gold/2:L22` | 步行可达 · 免费 Wi-Fi · 温馨座位 | 步行可达、免费Wi-Fi与座位服务未确认 |
| `drink-cafe-menu/A-gold/3:L6` | 9:00 – 21:00（每日） | 每日营业日期范围未确认 |
| `drink-cafe-menu/A-gold/3:L9` | 中杯 · 绵密奶泡 × 香醇意式浓缩 | 奶泡与意式浓缩未确认 |
| `drink-cafe-menu/A-gold/3:L11` | 热/冰可选 | 热/冰可选未确认 |
| `drink-cafe-menu/A-gold/3:L21` | 步行可达 · 免费 Wi-Fi · 宠物友好 | 步行可达、免费Wi-Fi与宠物友好未确认 |
| `drink-cafe-menu/A-gold/3:L22` | 微信扫码下单 | 微信扫码下单服务未确认 |
| `drink-cafe-menu/A-gold/3:L23` | 或直接到店 · 支持现金 / 支付宝 / 微信支付 | 现金/支付宝/微信支付方式未确认 |
| `drink-cafe-menu/A-raw/1:L9` | 纯粹咖啡因 · 清爽提神 | 纯粹咖啡因增加成分/功效断言，gold未确认 |
| `drink-cafe-menu/A-raw/1:L17` | 周一至周日 9:00 - 21:00 | 周一至周日营业日期范围未确认 |
| `drink-cafe-menu/A-raw/1:L18` | 立即下单 · 外卖到家 | 外卖到家未确认 |
| `drink-cafe-menu/A-raw/2:L9` | 经典意式浓缩与绵密奶泡的温柔邂逅 | 意式浓缩与奶泡原料/制作关系未确认 |
| `drink-cafe-menu/A-raw/2:L24` | 每日 9:00 - 21:00 | 每日营业日期范围未确认 |
| `drink-cafe-menu/A-raw/2:L27` | 立即到店，享受今日特惠 | 今日特惠促销未确认 |
| `drink-cafe-menu/A-raw/2:L28` | 扫码导航 · 外卖直达 · 会员积分 | 外卖与会员积分未确认 |
| `drink-cafe-menu/A-raw/2:L30` | 外卖下单 | 外卖下单再次具体呈现未确认服务 |
| `drink-cafe-menu/A-raw/3:L24` | 周一至周日 9:00 - 21:00 | 周一至周日营业日期范围未确认 |
| `drink-cafe-menu/B-gold/2:L6` | 拿铁，奶与萃取相融，是晨光里的陪伴 | 奶与萃取原料/制作关系未确认 |
| `drink-cafe-menu/B-gold/2:L9` | 美式清简，水与豆的本真对话，适合安静翻页的片刻。 | 水与豆原料/制作关系未确认 |
| `drink-cafe-menu/B-e2e/1:L6` | 拿铁中杯，奶香与咖啡相融 | 奶香与咖啡相融为未确认的原料关系 |

## 附录C：复算方法

用标准CSV解析器读取输出后，`sum(int(annotator_unsupported_count))` 应得111；按group聚合应得55、30、12、14，页面数9、7、8、9。按附录A归类应得TP50、FP11、D3；每页FN=人工数−该页TP；本轮规则每页参与比较数量=原始unsupported−该页D。10-14人工表按同法得32、21、6、30（总89），旧报告给出TP21、FP23、FN68。CSV句列表的解析应按未转义的 ` | ` 分隔，再把 `\|` 还原为句内竖线。

无模型判定层结果参与上述分子分母。两次模型输出、规则版本、成功页面组成及争议边界均可能影响比较；本复核是基于给定gold的独立人工标注，不是市场事实调查或多标注者一致性实验。
