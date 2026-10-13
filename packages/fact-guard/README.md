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
- `guardDocument` 返回 fields、hits、rewritten、removed、copyRefs；hits 的 phase 区分 original 和 rewrite。copyRefs 只描述最终文本；corpus.paths 可与 facts 平行传入，否则使用 facts.N。
- `defaultRules` 包括通用声明、绝对化与诱导分享；`rulePacks.food` 包括工艺和食品功效；`mergeRules` 对相同 id 采用后者覆盖，数组输入不会被改写。
- 每条规则支持 whitelist 和 whitelistPatterns（在规范化文本上按正则边界匹配，只豁免命中区间）。例如「第一口」不豁免「第一口碑」，「最终」不豁免「最终极」。
- 排名和荣誉规则使用 `evidenceScope: 'phrase'`，将命中扩展至标点之间的完整短语并要求事实包含该说法；「月销量300份」不能支持「销量遥遥领先」。这种字面比对较保守，语义同义改写仍交给 Judge。其余规则默认按命中词核对。不能用“不是无糖”授权“无糖”；绝对化及诱导分享不会因事实表出现而放行。
- 价格比对将元、块钱、¥/￥前缀统一为元；没有后续计数名词的阿拉伯数字「128块」也按价格处理。「128块蛋糕」保留块的数量单位，不能借用「128元」作为依据。新增成语白名单只覆盖成语自身，不豁免同句中的真实数量。
- 规则贡献文件为仓库 `rules/packs/*.zh.yaml`，采用 YAML 1.2 的 JSON 形式；测试逐项比较 TS 数据，无需 YAML 运行时依赖。

规则层能识别已列出的词与模式；事实表全局数字匹配不验证商品归属，也不识别所有语义改写。未命中不代表已经核实事实。语义判定需要提供 Judge；证据和最终发布由调用方负责。

A1 在开发期间被实现方看过并用于调整规则，因此只作为回归集；其成绩是样本内结果，不能作为未见过表达上的独立留出评测。新增审查探测同样属于回归测试。独立留出集需由未接触实现及这些样例的一方另行生成和保管。

## English

A standalone, zero-runtime-dependency marketing-copy guard. Inject optional batch judges and rewriters; this package never calls a model or database. Build with `pnpm --filter fact-guard build`, import the ESM export, and use the example above. Hits retain original UTF-16 offsets. Document cleaning uses at most two judge calls and one rewrite call, rewriting at most ten original sentences. Every rewritten sentence is checked again; malformed callbacks throw. Reference records describe final output only. Rules are finite heuristics, not exhaustive semantic verification or legal certification.

## 致谢 / Acknowledgments

文本规范化、白名单和中文数字处理参考下列项目的思路，全部以 TypeScript 独立实现，未复制源码：

- [ToolGood.Words](https://github.com/toolgood/ToolGood.Words)（Apache-2.0）
- [houbb/sensitive-word](https://github.com/houbb/sensitive-word)（Apache-2.0）
- [humingzhang/wordfilter](https://gitee.com/humingzhang/wordfilter)（Apache-2.0）
- [cn2an](https://github.com/Ailln/cn2an)（MIT）
