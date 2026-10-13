# 参考项目与致谢

实招在设计和实现过程中参考了下列开源项目。每一项都写明许可证、借鉴了什么，以及使用方式：

- **未复制代码**：只参考思路、产品设计或评测方法，实招的实现全部独立编写。
- **作为依赖使用**：以未修改的 npm 包形式引入，许可证见 [THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md)。
- **列入路线图**：尚未使用，计划评估或集成，见 [ROADMAP.md](../ROADMAP.md)。

使用规则：GPL 许可的项目只参考产品设计，不使用其代码；没有声明许可证的项目只参考覆盖范围，不复制任何内容。

许可证信息于 2026-10-14 从各仓库首页核对。

## AI 输出事实检查与评测

| 项目 | 许可证 | 借鉴内容 | 使用方式 |
|---|---|---|---|
| [vectara/hallucination-leaderboard](https://github.com/vectara/hallucination-leaderboard) | Apache-2.0 | 评测报告「一句结论 + 表格 + 可复现配置」的格式 | 未复制代码 |
| [zjunlp/FactCHD](https://github.com/zjunlp/FactCHD) | MIT | 事实冲突检测的问题定义；实招的依据换成了商家确认的事实表，而不是世界知识 | 未复制代码 |
| [ragas](https://github.com/vibrantlabsai/ragas) | Apache-2.0 | 忠实度（faithfulness）指标：陈述能否由给定上下文支持 | 未复制代码 |
| [promptfoo](https://github.com/promptfoo/promptfoo) | MIT | 评测集可导出为 promptfoo 能直接运行的配置（`pnpm eval:promptfoo`） | 未复制代码，只生成兼容格式的配置文件 |
| [MiniCheck](https://github.com/Liyan06/MiniCheck) | Apache-2.0 | 用小模型做事实判断，降低判定成本 | 列入路线图 |
| [SelfCheckGPT](https://github.com/potsawee/selfcheckgpt) | MIT | 多次生成一致性检测 | 列入路线图 |
| [UQLM](https://github.com/cvs-health/uqlm) | Apache-2.0 | 输出不确定性度量 | 列入路线图 |
| [Guardrails AI](https://github.com/guardrails-ai/guardrails) | Apache-2.0 | 校验器生态；计划把 fact-guard 发布为它的校验器 | 列入路线图 |
| [NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) | Apache-2.0 | 对话护栏的动作机制；计划把 fact-guard 发布为它的动作 | 列入路线图 |
| [deepeval](https://github.com/confident-ai/deepeval) | Apache-2.0 | 评测插件；计划把评测集做成插件 | 列入路线图 |
| [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | Apache-2.0 | 本地 OCR，与视觉模型交叉核对价格 | 列入路线图 |
| [RapidOCR](https://github.com/RapidAI/RapidOCR) | Apache-2.0 | 同上，更轻量的本地 OCR | 列入路线图 |

## 中文违禁词与规则引擎

| 项目 | 许可证 | 借鉴内容 | 使用方式 |
|---|---|---|---|
| [ToolGood.Words](https://github.com/toolgood/ToolGood.Words) | Apache-2.0 | 文本规范化与词表匹配的思路 | 未复制代码，fact-guard 用 TypeScript 独立实现 |
| [houbb/sensitive-word](https://github.com/houbb/sensitive-word) | Apache-2.0 | 白名单与文本规范化的思路 | 未复制代码 |
| [humingzhang/wordfilter](https://gitee.com/humingzhang/wordfilter) | Apache-2.0 | 词表过滤的思路 | 未复制代码 |
| [cn2an](https://github.com/Ailln/cn2an) | MIT | 中文数字解析（「百分之九十」「三成」「八折」等） | 未复制代码，`parseCnNumber` 独立实现 |

## 营销页与 H5 生成

| 项目 | 许可证 | 借鉴内容 | 使用方式 |
|---|---|---|---|
| [abi/screenshot-to-code](https://github.com/abi/screenshot-to-code) | MIT | 对比实验中对照组「AI 直接写整页」的提示词写法（前端角色、移动端优先、只返回完整 HTML） | 未复制代码，提示词独立编写 |
| [wandb/openui](https://github.com/wandb/openui) | Apache-2.0 | 同上 | 未复制代码 |
| [鲁班 H5（luban-h5）](https://github.com/ly525/luban-h5) | GPL-3.0 | H5 页面编辑器的产品形态 | 只参考产品设计，不使用代码 |
| [H5-Dooring](https://github.com/MrXujiang/h5-Dooring) | GPL-3.0 | H5 可视化搭建的产品形态 | 只参考产品设计，不使用代码 |
| [Puck](https://github.com/puckeditor/puck) | MIT | 可视化编辑器；计划用于商家微调页面，商品信息字段保持锁定 | 列入路线图 |
| [uni-app](https://github.com/dcloudio/uni-app) | Apache-2.0 | 一套描述生成 H5、小程序等多端的方案 | 列入路线图 |

## 小店与扫码场景

| 项目 | 许可证 | 借鉴内容 | 使用方式 |
|---|---|---|---|
| [node-qrcode](https://github.com/soldair/node-qrcode) | MIT | 生成发布页的二维码（PNG / SVG，纠错级别 M） | 作为依赖使用（`qrcode`） |
| [jsQR](https://github.com/cozmo/jsQR) | Apache-2.0 | 在测试中解码生成的二维码，确认内容正确 | 作为开发依赖使用（`jsqr`） |
| [sharp](https://github.com/lovell/sharp) | Apache-2.0 | 商家照片的缩放、转 WebP | 作为依赖使用 |
| [heic-convert](https://github.com/catdad-experiments/heic-convert) | ISC | 把 iPhone 拍摄的 HEIC 照片转成通用格式 | 作为依赖使用 |

## 字体

页面使用的五款开源字体（思源黑体、思源宋体、霞鹜文楷、站酷小薇体、站酷快乐体）及其许可证见 [THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md#字体)。

感谢以上项目的作者和贡献者。如果你认为某项描述不准确，欢迎提交 issue 指出。
