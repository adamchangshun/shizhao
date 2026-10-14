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
- `defaultRules` 包括通用声明、工艺 `process`、定位 `positioning`、绝对化与诱导分享；`rulePacks.food` 保留原有工艺和食品功效规则；`mergeRules` 对相同 id 采用后者覆盖，数组输入不会被改写。
- 工艺词：手作、手工、现烤、现做、现磨、手切、慢烤、低温、古法、秘制。定位词：招牌、热销、人气、爆款、必点、限量、限定、本周限定、新鲜出炉。按命中词 grounding，商品名、description 或 extraClaims 中包含该词即可作为依据；例如 `facts: ['招牌黄油可颂']` 支持文案「招牌」。否定声明不授权肯定说法。`爆款` 归入定位，不再重复使用排名规则的整段事实要求。
- 每条规则支持 whitelist 和 whitelistPatterns，只豁免命中区间；原文片段必须连续，不能含被规范化删除的干扰字符。「第一口／次／眼」还要求后接句末、标点或规则明确列出的动词、助词等语境；「第一口福」「第一眼镜」「第一 次次爆满」不会因子串或删除干扰字符而获豁免。
- 排名和荣誉规则使用 `evidenceScope: 'fact-span'`：先找句子中完整、原样出现的事实文本区间，只有区间覆盖的命中才有依据。「月销量300份的蛋糕」可以引用「月销量300份」；「月销量300份全城领先」中的「领先」仍无依据。调换完整事实的前后修饰可放行，同义改写仍交给 Judge。自定义规则可继续选用 `phrase` 完整短语核对，其余规则默认按命中词核对。不能用“不是无糖”授权“无糖”；绝对化及诱导分享不会因事实表出现而放行。
- 价格比对将元、块钱、¥/￥前缀统一为元；没有后续计数名词的阿拉伯数字「128块」也按价格处理。「128块蛋糕」保留块的数量单位，不能借用「128元」作为依据。新增成语白名单只覆盖成语自身，不豁免同句中的真实数量。
- 数字 grounding 额外支持事实文本展示区间：全角/半角、空格、横线/波浪线等价；时刻支持冒号、点/时、分、半、整及中文数字。`每天7:30-19:00` 支持「每天７点３０分—１９点」，`西湖区文三路100号` 支持「西湖区文三路 １００ 号」。完整时间区间比对，不能交换分钟或借用时间数字支持数量；原文命中位置保留。仅覆盖对应区间，不豁免同句其他数字、绝对化或诱导分享。
- 调用方必须把需要引用的营业时间、地址等文本加入 `corpus.facts`；包不会自行读取 FactSheet。普通咖啡、奶、芝士、柠檬、茶没有加入成分禁词；现有无糖、有机等可核验配方词仍要求依据，不做自动配方推断。
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
