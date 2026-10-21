# M7 文案生成与事实守卫

```ts
import {
  generateCopy,
  guardCopy,
  buildFactCorpus,
  guardWithRulesOnly,
  computeCopyRefs,
} from '@/lib/copy'
const copy = await generateCopy({ factSheet, design }, { jobId, signal })
const guarded = await guardCopy({ copy, factSheet }, { jobId, signal })
// 08 写 versions.guard 和 versions.copyRefs；15 在事实修订时无需模型即可复查。
const corrected = guardWithRulesOnly(guarded.copy, buildFactCorpus(updatedFactSheet))
const refs = computeCopyRefs(corrected.copy, updatedFactSheet)
```

`generateCopy` 的第二参数可注入 LLMProvider，默认 getProvider。只发送店名、商品名/id、moodKeywords；提示词明确排除价格、数字、成分、产地、认证、排名、功效及诱导分享。JSON schema 覆盖全部真实商品 id，不接受未知 id，执行共享契约的 20/40/60/40 字段上限。

`guardCopy` 使用通用 + food 规则，整份文案最多两次 guard-judge 和一次 guard-rewrite。规则通过句才送 judge；前十句违规才重写，重写的所有句子再次完整检查；字段长度超限的替换句删除。加上生成，一份文案最多四次 generateJSON 调用。不存在需要判定或重写的句子时省略对应调用。

所有成功返回的 provider 调用即时写 usage_records，支持可选 jobId 归属校验。provider 错误原样传播，已记录的早期调用不回滚；失败请求没有可用 Usage 时不虚构 token/费用。取消信号转交 provider。此处统计的是 generateJSON 调用；provider 内部 HTTP 重试由 M0 负责。

`GuardResult` 的 violations 只包含最初违规，计数按原句计算。附加 copyRefs 使用已有共享类型，不改 GuardResult schema。`computeCopyRefs` 与输出最终 copy 一致，引用路径包括 shop.name/hours/address、items.ID.name/spec/description/price/tags.N、extraClaims.N，价格使用 28元和¥28两种文本别名，价格单位也是 price 来源。按共享契约使用完整原文字面引用，不声称有完整的语义溯源。

`buildFactCorpus` 将 shop.hours/address 放入独立的 spanFacts/spanPaths，不加入普通 facts 或通用数字证据池；词表命中必须由句中完整字段的显示等价区间覆盖。时刻可单独引用时间区间的任一端点，但句中区间仍须整段匹配。Judge/Rewriter 的 JSON 输入另带 spanFacts；现有模型提示词未在本次范围内修改，旧回调可能忽略该字段，真实模型判定仍须单独验证。规则层与重写复查始终使用完整隔离的 corpus。

标题全部删除时通常回退店名。共享契约允许店名30字、标题20字，因此长店名只取前20个 UTF-16 单元，并记录 shop.name 来源。若店名本身命中绝对化或诱导分享等规则，使用「欢迎光临」，避免回退绕过守卫；其余字段删空后保持空字符串。原事实表和店名不被改写。规则层纠错函数是同步纯检查，不打开 provider 或数据库。

MockProvider 延续固定 demo 内容，但按 copy.itemIds、judge.sentences、rewrite.items 复制原有 fixture，以覆盖真实 id 与批量调用。这是测试/demo 的固定回复，不能证明真实模型核验效果。

规则贡献 YAML 使用 JSON 形式（YAML 1.2 合法子集），显式排除 Prettier 的 YAML 改写，保持无解析器依赖的逐项一致性检查。未引入新依赖。

## 验证与限制

- 包内开发/回归标注集：第2轮修复补入四个白名单绕过反例后为67 应拦截、30 应放行；该集用于回归，不是独立留出集。
- Claude A1 原题在开发期间被实现方参考并用于调整规则。原提交 9d99a06 上的44/47（93.62%）、误杀0/23、spacing_and_punct 7/7是样本内成绩，不得表述为独立留出评测。A1 此后只用于回归；第1轮报告提供的37/47（78.7%）消融结果属于审查方对原提交的实验，本轮未重新运行该消融。
- 07gap 修复后的 A1 回归：45/47 拦截、误杀0/23，spacing_and_punct 7/7。仍漏检 adv-019「一杯下肚，熬夜加班都不怕」（出题方标记 disputed）和 adv-033「朋友圈都在晒的杨枝甘露」，涉及隐含语义，需要 Judge。测试没有更改原题或原标签；未访问或使用 A1b 调整规则。
- A1 读取方式：`FACT_GUARD_A1_PATH=<原题路径> pnpm test`；未合并 A1 时普通测试将明确跳过一项，不代表 A1 已被纳入 main。
- 语义模型为 MockProvider/受控边界验证，未做真实在线或 Ollama 模型核验。`itemBlurbs.<id>` 只以本商品事实加店铺事实和 extraClaims 为依据（`fieldCorpus`，A4 H2），B 的描述引用 A 的价格或规格会判为 unsupported_number；标题、副标题、结尾面向整页，仍用全表事实。Judge 输入另带 fields 与 paths 供它按字段核对。copyRefs 仍按 R7 对全表字面引用计算，纠正 A 的事实时会一并剪掉引用 A 的其他句子。规则层不证明所有同义声明都正确。
- 跨商品措辞（v0.1.1）：W5 在线验证中，qwen-plus judge 对 B 描述里出现的 A 标签「燕麦奶可选」3 次全部放行，不遵从 `evidence[i]`。因此 `crossItemRule(corpus)` 把所有商品的 spec、description、tags 原文作为规则词条，`guardCopy` 和 `guardWithRulesOnly` 都会把它并入所用规则集。依据仍然来自 `fieldCorpus`：本商品、shop.* 或 extraClaims 中有这段文本（规范化后包含，带否定前缀的不算）就放行，否则判为 `unsupported_claim`（ruleId `cross-item`），与其他规则命中的处理方式相同：先尝试重写，重写句同样复查，不通过就删除并计入 removed。比对使用 fact-guard 的 `normalizeText`，并忽略字符之间的空白。商品名不在词条中，A 的名字所在区间也豁免，所以「比拿铁更清爽」这类比较句可以保留；共享契约只把名称、价格、规格的展示交给代码，并没有禁止文案提及其他商品，R7 copyRefs 本来就按全表记录这类引用。两个商品都有的 tag 不算借用。整页字段使用全表，不受影响。词条前面紧跟否定词（不、未、非、没有、不含、并非、不是）时不算命中：B 写自己的「不加糖」，不会被当成在借用 A 的「加糖」。已知的保守误判：文本里有多余空白（例如 B 把自己的 tag「Oat Milk」写成「OatMilk」）时，依据比对找不到原文，这一句会被删除。
- 本分支由 Codex 实现与自查，仍须 Claude 交叉审查；不合并、不推送。

## English: shop evidence and review regression

`buildFactCorpus` keeps shop hours and addresses in `spanFacts` with parallel `spanPaths`, separate from ordinary facts and the general numeric evidence pool. Lexical hits require a complete display-equivalent occurrence of that shop field covering the hit. Either endpoint of a known time range can support a single time; sentence ranges must match a complete ordered range.

Judge/Rewriter JSON inputs carry `spanFacts` separately. Their existing application prompts are outside this patch's scope and may ignore this new field; live model behavior remains unverified. Rule checks and rewrite rechecks always use the full, separated corpus.

Final `copyRefs` includes literal shop.name/hours/address references alongside product and extra-claim paths. Display-equivalent or endpoint-only references do not invent a complete literal match. No shared schema changed.

The 07gap A1 regression blocks 45/47 cases with 0/23 false positives and catches 7/7 spacing/punctuation cases. The remaining misses are adv-019 (implicit effect, disputed) and adv-033 (implicit popularity). A1 was visible during development and is not a holdout evaluation; its cases/labels are unchanged. A1b was neither accessed nor used for tuning. Item blurbs are checked against their own item's facts plus shop facts and extraClaims (`fieldCorpus`, A4 H2); page-level fields keep the full sheet, and copyRefs stay sheet-wide literal references (R7). Since v0.1.1, `crossItemRule` also blocks a blurb that repeats another item's spec, description or tag wording without support from its own evidence, numbers or not (the live judge did not honor `evidence[i]` for this). Item names stay allowed, so comparisons such as "lighter than the latte" survive. Claude's independent review remains a separate gate; there is no merge or push.
