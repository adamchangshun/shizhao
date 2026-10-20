# fact-guard · 营销文案事实守卫

零运行时依赖的 TypeScript 库。规则检查可核验声明；可选的批量 Judge / Rewriter 由调用方提供。Apache-2.0。

```js
import { guardText, mergeRules, defaultRules, rulePacks } from '@shizhao/fact-guard'
const corpus = { facts: ['当天现烤', '28元'] }
const rules = mergeRules(defaultRules, rulePacks.food)
const result = await guardText('零糖配方。当天现烤。', corpus, { rules })
console.log(result.text) // 当天现烤。
```

`pnpm --filter fact-guard build` 输出独立 ESM 和类型到 `dist/`。`package.json` 的 dependencies 为空。发布内容仅 dist、README、LICENSE，不依赖 Next.js 或实招数据库。

在源码仓库安装 workspace 开发依赖后，运行 `pnpm --filter fact-guard test` 可单独复现包测试，不加载应用数据库或环境初始化。发布 tarball 不包含测试和开发工具。

## 接口与约定

- `checkSentence(sentence, corpus, rules?)` 返回 reason、evidence、ruleId、start/end。位置为原文 UTF-16 半开区间；规范化包括有限繁简映射、全角转半角、英文小写、中文之间最多三个干扰码点。
- `parseCnNumber(text)` 精确解析完整表达式，返回 value、unit、raw、start/end；不支持则 null。百分之九十为 `{value:90, unit:'%'}`；三成和八折分别为 30%、80%；半天为 0.5 天。`extractNumbers` 提取数字声明，排除一杯、一口等场景习惯用法。
- `splitSentences` 保留中文标点及换行。`guardText` 清理一个字段；`guardDocument(fields, corpus, opts?)` 共享批量预算：规则通过句一次 judge → 前十个违规句一次 rewriter → 重写的所有句再次规则和一次 judge。超出十句直接删除；多句重写必须全部通过；回调数量或格式错误抛错，不返回未经验证的文本。
- `guardDocument` 返回 fields、hits、rewritten、removed、copyRefs；hits 的 phase 区分 original 和 rewrite。copyRefs 只描述最终文本，按完整原文字面引用记录；corpus.paths 与 facts、spanPaths 与 spanFacts 分别平行，否则使用 facts.N / spanFacts.N。时间端点或显示等价引用可通过规则，但不据此伪造完整原文引用。
- `defaultRules` 包括通用声明、工艺 `process`、定位 `positioning`、绝对化与诱导分享；`rulePacks.food` 保留原有工艺和食品功效规则；`mergeRules` 对相同 id 采用后者覆盖，数组输入不会被改写。
- 工艺词：手作、手工、现烤、现做、现磨、手切、慢烤、低温、古法、秘制。「低温」默认命中，未知商品或工艺仍要求依据，不以列举商品或工艺作为触发条件。定位词：招牌、热销、人气、必点、限量、限定、本周限定、新鲜出炉。普通 facts 按命中词核对，否定声明不授权肯定说法。`爆款` 属于 ranking，必须由完整事实区间覆盖：`爆款草莓蛋糕` 不能为「全城爆款」作依据。
- 每条规则支持 whitelist 和 whitelistPatterns，只豁免命中区间。字面白名单不接受删除干扰字符后的拼接；模式先检查规范化整句上下文，再仅对模式显式匹配的原文横向空格提供兼容，不能删除 emoji、零宽字符或换行来制造豁免。「第一口／次／眼」仍要求后接句末、标点或明确语境；「第一口福」「第一眼镜」「第一 次次爆满」不会获豁免。
- 「低温」仅用 whitelistPatterns 豁免明确天气结构：后接天气、天、下或夜晚／冬日等时间背景并满足后续边界，或接来袭／袭来；前接寒潮／冬日时要求后有语句边界。模拟、控制等人工条件不豁免；「低温天然奶油」「低温下发酵」也不属于天气结构。「低温 天气」「低温天气里制作一杯热可可」放行；「模拟低温天气的慢发酵」仍要求依据。天气只豁免该处命中，不支持同句其他位置的「低温」。
- 「慢烤」比喻模式覆盖时光、岁月、周末、午后等抽象对象及「般／一样／一般」「悠长／缓慢／漫长」组合。前文60字内、不跨标点的「经」「采用」「通过」「靠」「以」「全程」「每一块」等工艺线索不豁免；后文12字内的出炉、制成等制作结果也不豁免。「用心」不按「用」工艺线索处理，因此「用心感受慢烤般的午后」放行，「可颂慢烤的时光里出炉」要求依据。其他窄白名单保留「招牌笑容」「限定的温柔」和「手工皂般／一样／一般（的）细腻」。白名单不豁免其他命中，不绕过数字、绝对化或诱导分享；food 中的「手工」采用同一比喻白名单。
- 排名和荣誉规则使用 `evidenceScope: 'fact-span'`：先找句子中完整、原样出现的事实文本区间，只有区间覆盖的命中才有依据。「月销量300份的蛋糕」可以引用「月销量300份」；「月销量300份全城领先」中的「领先」仍无依据。调换完整事实的前后修饰可放行，同义改写仍交给 Judge。自定义规则可继续选用 `phrase` 完整短语核对，其余规则默认按命中词核对。不能用“不是无糖”授权“无糖”；绝对化及诱导分享不会因事实表出现而放行。
- 价格比对将元、块钱、¥/￥前缀统一为元；没有后续计数名词的阿拉伯数字「128块」也按价格处理。「128块蛋糕」保留块的数量单位，不能借用「128元」作为依据。新增成语白名单只覆盖成语自身，不豁免同句中的真实数量。
- 数字 grounding 支持事实文本展示区间：全角/半角、空格、横线/波浪线等价；时刻支持冒号、点/时、分、半、整及中文数字。`每天7:30-19:00` 支持「每天７点３０分—１９点」「营业到19:00」「早上7:30开门」。句中时间区间仍须整段匹配；不能交换分钟、反转端点或拼接来自不同区间的端点，时间数字不能支持普通数量。
- 「8点积分」「8点会员分」「8点福利」等计量后缀，以及「积分8点」「积分送8点」等紧邻数量前缀，均排除出时刻识别，同时作用于文案与事实；不能借开门时间放行积分，也不能用积分事实支持开门时刻。普通事实里确有相应数量声明时仍可引用。奖励前缀必须紧接数字，不跨分句；「积分活动早上8点见」「22点前到店」「营业到22点」等仍按时刻核对。
- 调用方必须把营业时间、地址放入 `corpus.spanFacts`，配套路径放入 `spanPaths`；不得同时放进普通 `facts`。它们不进入通用数字池；所有词表命中仅在句中完整地址／时间原文的显示等价区间覆盖该命中时获得依据。「店在云南南路30号」可由相同地址支持；「云南的阳光味道」「买2送1」不能借用地址里的地名、门牌号。不会删除省市、截取地址或去掉 emoji 来制造证据；普通词表也不继承时间专用的端点、时刻改写豁免。包不会自行读取 FactSheet。
- Judge / Rewriter 收到可选 `spanFacts`，与普通 `facts` 分开。调用方的语义判定实现需识别此字段及其受限含义；旧回调仍可调用，但可能忽略新证据。规则层始终保留隔离并复查重写，不能通过把 spanFacts 合回 facts 来兼容。本次仅验证确定性回调的数据传递，未验证真实模型判定。
- 普通咖啡、奶、芝士、柠檬、茶没有加入成分禁词；现有无糖、有机等可核验配方词仍要求依据，不做自动配方推断。
- 规则贡献文件为仓库 `rules/packs/*.zh.yaml`，采用 YAML 1.2 的 JSON 形式；测试逐项比较 TS 数据，无需 YAML 运行时依赖。

规则层能识别已列出的词与模式；事实表全局数字匹配不验证商品归属，也不识别所有语义改写。未命中不代表已经核实事实。语义判定需要提供 Judge；证据和最终发布由调用方负责。

A1 在开发期间被实现方看过并用于调整规则，因此只作为回归集；其成绩是样本内结果，不能作为未见过表达上的独立留出评测。新增审查探测同样属于回归测试。独立留出集需由未接触实现及这些样例的一方另行生成和保管。

## English

A standalone, zero-runtime-dependency marketing-copy guard. Inject optional batch judges and rewriters; this package never calls a model or database. Build with `pnpm --filter fact-guard build`, import the ESM export, and use the example above. Hits retain original UTF-16 offsets. Document cleaning uses at most two judge calls and one rewrite call, rewriting at most ten original sentences. Every rewritten sentence is checked again; malformed callbacks throw. Reference records describe final output only. Rules are finite heuristics, not exhaustive semantic verification or legal certification.

- `checkSentence` returns reason, evidence, ruleId and half-open start/end offsets. Normalization folds fullwidth characters, selected traditional Chinese characters and Latin case, and removes up to three interference characters between Chinese characters. Normalization can reveal violations but cannot manufacture whitelist exemptions.
- `parseCnNumber` parses complete supported expressions or returns null. `百分之九十` is 90%, `三成` is 30%, `八折` is 80%, and `半天` is 0.5 days. Numeric matching preserves units; currency variants normalize to yuan, while `128块蛋糕` remains a count rather than a price.
- The base `process` terms are 手作、手工、现烤、现做、现磨、手切、慢烤、低温、古法、秘制. 低温 matches by default: unknown products and processes still require evidence, without a product/process trigger allowlist. Positioning terms remain 招牌、热销、人气、必点、限量、限定、本周限定、新鲜出炉. Ordinary facts can support matched terms; negated facts cannot authorize affirmative claims. Ordinary coffee, milk, cheese, lemon and tea are not restricted ingredient terms.
- `爆款` belongs to `ranking`, which, like `honors`, requires the hit to fall inside a complete literal fact occurrence. `爆款草莓蛋糕` supports a quotation of that product name but does not support `全城爆款`. Other rules default to matched-term evidence; custom rules may select whole-phrase evidence. Absolute and sharing-inducement rules ignore merchant evidence.
- Only explicit weather `whitelistPatterns` exempt 低温: weather/day/night contexts with appropriate following boundaries, arrival-of-cold phrases, or 寒潮/冬日 before 低温 followed by a clause boundary. Simulated or controlled conditions are not exempt. 低温天然奶油 and 低温下发酵 still require evidence; 低温 天气 and 低温天气里制作一杯热可可 pass. 模拟低温天气的慢发酵 remains a claim. Each exemption covers only its own occurrence.
- Literal whitelists never inherit interference removal. Pattern context is checked against the normalized sentence first; horizontal spaces are accepted only when the same pattern explicitly matches the character-folded original span. Emoji, zero-width characters and newlines cannot manufacture exemptions. Absolute-term safeguards remain unchanged.
- The 慢烤 metaphor pattern combines abstract objects and simile/duration words. Factual leads including 经、采用、通过、靠、以、全程 and 每一块 disable exemptions within the preceding 60 characters of the same clause; concrete results such as 出炉 or 制成 within the next 12 characters also disable them. 用心 is not treated as the process verb 用: 用心感受慢烤般的午后 passes, while 可颂慢烤的时光里出炉 requires evidence. Narrow exemptions for 招牌笑容、限定的温柔 and 手工皂般／一样／一般（的）细腻 remain. The food pack shares the soap exemption; other claims, numbers, absolutes and inducements remain checked.
- Put shop hours and addresses in `spanFacts?: string[]`, with parallel `spanPaths?: string[]`, **never in ordinary `facts` as well**. Their numbers are excluded from the general numeric evidence pool. All lexical rules require the hit to be covered by a complete display-equivalent occurrence of that span fact. An address containing 云南 or house numbers does not support unrelated origin or promotional claims, even elsewhere in the same sentence.
- Display equivalence permits fullwidth forms, spacing and dash/wave separators; it does not remove province/city names, truncate addresses or delete emoji. Clock evidence additionally recognizes colon, 点/时, 分/半/整 and Chinese numerals. A fact range `7:30-19:00` supports either endpoint as a single time. A sentence range must match one complete ordered fact range: no swapped minutes, reversed endpoints or recombination across ranges. Clock digits never support ordinary quantities; lexical rules do not inherit the special clock equivalences.
- Reward suffixes such as 8点积分、8点会员分 and 8点福利, and immediately adjacent prefixes such as 积分8点 or 积分送8点, exclude the amount from clock recognition in both sentences and evidence. Opening hours cannot support reward amounts; points facts cannot support opening times. Actual ordinary reward facts can still be quoted. Prefixes cannot cross clauses or unrelated words: 积分活动早上8点见、22点前到店 and 营业到22点 remain clock references.
- Judge and Rewriter inputs expose optional `spanFacts` separately from `facts`. Consumers must honor its restricted evidence semantics. Existing callbacks remain callable but may ignore the new context; never merge it back into `facts` for compatibility. Rewrites are rechecked against the full original corpus. Deterministic callback transport is tested; live model behavior is not established.
- `computeDocumentRefs` / `copyRefs` record complete literal facts in final output. `paths` parallels `facts`; `spanPaths` parallels `spanFacts`; defaults are `facts.N` and `spanFacts.N`. Display-equivalent or endpoint-only support does not fabricate a literal source reference.
- `mergeRules` replaces rules with the same id without mutating inputs. `rulePacks.food` retains food process/effect rules. Contribution YAML files use the JSON subset of YAML 1.2 and are compared with TS rules in tests. After installing workspace development dependencies, `pnpm --filter fact-guard test` runs package tests without application database setup; the published package contains only dist, README and LICENSE.

Global numeric and matched-term grounding does not establish which product a claim belongs to. Passing finite rules does not verify every paraphrase or stronger surrounding assertion; use a semantic Judge where needed. A1 and review reproductions are development-visible regression cases, not independent holdout evidence.

## 致谢 / Acknowledgments

文本规范化、白名单和中文数字处理参考下列项目的思路，全部以 TypeScript 独立实现，未复制源码：

- [ToolGood.Words](https://github.com/toolgood/ToolGood.Words)（Apache-2.0）
- [houbb/sensitive-word](https://github.com/houbb/sensitive-word)（Apache-2.0）
- [humingzhang/wordfilter](https://gitee.com/humingzhang/wordfilter)（Apache-2.0）
- [cn2an](https://github.com/Ailln/cn2an)（MIT）
