# 路线图

这里列出计划中的功能，**都还没有实现**。已经实现的功能见 [README](README.md#当前进度)。顺序和范围会根据社区反馈调整，欢迎在 issue 中讨论。

## 近期

- **Docker 镜像在 Linux 与 Windows 上的验证**。
- **0.2.0 之后重跑真实模型评测**：README 的对比实验数字来自 2026-10-20 的运行，F1 等修复之后还没有重跑；Anthropic 适配器还没有用真实接口验证。
- **更多行业规则包**：美妆、保健食品（这两类的广告法与功效宣称限制尤其多）。
- **图片内容审核接入**：商家上传的图片在生成前做内容审核。
- **更多国产开源模型适配**：在现有 `qwen`、`glm`、`deepseek`、`ollama` 配置之外，验证更多可本地部署的开源模型。

## 中期

- **fact-guard 独立发布到 npm**：包已经可以独立构建（`pnpm --filter fact-guard build`），下一步是正式发布。
- **公开的「营销文案事实一致性」基准**：把评测集扩充为公开基准，包括更多行业样本和独立留出集。
- **用顾客纠错数据持续改进规则**：顾客在页面上指出的错误经商家确认后，用来补充规则词表和评测用例。
- **事实识别双重核对**：视觉模型 + 本地 OCR（[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) / [RapidOCR](https://github.com/RapidAI/RapidOCR)）交叉核对价格，两者不一致时提醒商家重点确认。
- **小模型事实判断**：评估 [MiniCheck](https://github.com/Liyan06/MiniCheck) 等方法在中文营销文案上的效果，降低模型判定层的成本。
- **多次生成一致性检测**：参考 [SelfCheckGPT](https://github.com/potsawee/selfcheckgpt)、[UQLM](https://github.com/cvs-health/uqlm)，对同一输入多次生成，用结果之间的分歧发现不稳定的说法。
- **生态集成**：fact-guard 作为 [Guardrails AI](https://github.com/guardrails-ai/guardrails) 校验器、[NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails) 动作发布；评测集作为 promptfoo / deepeval 插件。

## 远期

- **云 API 与企业版正式商用**：托管的文案检查 API、行业规则包托管与更新、企业私有部署，从验证阶段进入正式服务（见 [GOVERNANCE.md](GOVERNANCE.md)）。
- **一份描述，多种形态**：用同一份「商品信息 + 风格参数」中间表示，生成 H5 页面、小程序（参考 uni-app 的多端方案）和长图。
- **商家可视化微调**：参考 [Puck](https://github.com/puckeditor/puck)（MIT），让商家拖拽调整版面，商品信息字段保持锁定、不可编辑。
- **社区模板库**：社区贡献的模板经审查后收录，商家可以直接选用。

## 社区

- 演示视频同步发布到 B 站。
- 开通交流群，入口放在 README。
- 评估申请加入国内开源组织。
