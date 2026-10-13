# M5 风格生成

```ts
import { generateDesign, ensureContrast } from '@/lib/design'

const { spec, usage, onPrimary } = await generateDesign({
  factSheet,
  previousSpecs, // 按时间从旧到新排列，只比较最后一份
  seed: 42,
  // heroImage: { path: '/absolute/path/main.webp', mime: 'image/webp' },
})

// 重新从已保存的 spec 获取主色上的文字色，无需改动共享契约。
const readable = ensureContrast(spec.palette)
```

`generateDesign(input, options?)` 默认调用已有 `getProvider()`。第二个参数可传入 `provider`、`signal`、`timeoutMs`；测试与离线演示使用 `new MockProvider({ delay: false })`。timeoutMs 是每次 provider 调用的预算；最多三次调用，任务总预算由调用方的 signal 控制。

输出包含共享契约定义的 `spec`、每次成功调用的 `usage` 数组，以及额外的 `onPrimary`。spec 中的所有 hex 颜色统一为小写。onPrimary 为 `#ffffff` 或 `#000000` 中对 primary 对比度更高者，不写入 DesignSpec。本模块不修改渲染器；已有渲染器仍独立计算主色上的文字色。

模型输入由显式白名单构建：店名、商品名数组、extraClaims、最近一版的 templateId 与 moodKeywords。不会序列化价格、联系方式、规格、商品描述、项目 ID 或整个历史风格。可选主图最多一张，类型沿用 `ImageInput`；图片和允许的文本字段本身仍可能包含商家写入的其他信息。本模块不承担素材内容脱敏。

模型枚举与六位 hex 颜色约束复用 `lib/core/schemas.ts`，中文风格词额外限制为 1～4 个、每词 1～6 个汉字。调用方 seed 必须为非负安全整数，原样写入最终 spec；去重重试使用递增的请求 seed，最大安全整数回绕到 0。接口对 seed 的具体范围限制仍由 provider 决定。

与最近一版模板相同且主色色相最短圆周距离小于 30° 时，最多重新调用模型两次；仍相似则按 poster → card-stack → menu-board → poster 强制切换模板，以新对象返回。饱和度低于 0.1 的主色按无彩色处理：两者都是无彩色时相似，仅一方是无彩色时不相似；否则使用圆周色相距离。较早历史版本不参与相似判定。风格相似与不可解配色共用重试额度，总模型调用最多 3 次。

文字对比度按 [W3C 相对亮度公式](https://www.w3.org/WAI/WCAG22/Understanding/relative-luminance.html) 计算，使用未舍入的 [4.5:1 阈值](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)。已达标文字原样保留；否则保持 HSL 色相与饱和度，以 0.0001 的明度步长向两侧寻找达标颜色，检查最终六位 hex。8 位 RGB 量化可能带来小幅色相误差；本模块验收的米色案例误差小于 5°。

某些 bg/surface 对没有共同满足 4.5:1 的文字色，例如 `#000000` 与 `#777777`。独立调用 `ensureContrast` 时只调整 text，有限搜索后抛出 `PaletteContrastError`，固定 code 为 `unreadable_palette`，便于和非法颜色参数区分。`generateDesign` 只捕获这一错误并递增请求 seed 重试；正常的模型、schema、取消或代码错误不会被当成配色问题吞掉。

三次调用后仍不可解时，按第 1 轮审查要求在代码中兜底：保留 bg、primary、accent，将 surface 的 HSL 明度移到与 bg 相同的位置，尽量保留 surface 的色相和饱和度，然后重新调整 text。若两个颜色的 HSL 明度相同但相对亮度仍差异过大，则使用 `surface = bg` 作为最终兜底；同一背景总有可读的黑色或白色文字。所有返回路径仍检查最终 hex 在两个背景上的对比度。此兜底仅发生在最后一次调用，不额外消耗模型调用，并保留所有成功模型回复的 Usage；之后仍执行相邻风格判定，必要时切换模板。

正文仅允许 noto-sans-sc、noto-serif-sc、lxgw-wenkai。zcool-xiaowei 正文映射到较接近的 noto-serif-sc，zcool-kuaile 正文映射到 noto-sans-sc；合法标题保持，纯函数对未知字体回退 noto-sans-sc。真实模型选择枚举外字体会在 provider schema 校验时拒绝。

模型提示词全文位于 `prompt.ts` 的 `DESIGN_SYSTEM_PROMPT`。本地验收汇总、五次生成 JSON 和命令日志位于 `CODEX_REVIEW_SUMMARY.md` 与 `data/design-verification/`（均不提交）。本模块仅负责风格规格，不负责页面渲染或营销文案。

验证：`pnpm typecheck && pnpm lint && pnpm test`。Claude 按模块提示词审查后负责合并与同步远端；Codex 仅提交功能分支。
