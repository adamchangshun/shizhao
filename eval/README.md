# 评测集与对比实验（M16）

```bash
PROVIDER=mock pnpm eval:extract   # 实验一：事实抽取准确率
PROVIDER=mock pnpm eval:compare   # 实验二：对照组 A（AI 直接写整页）vs 实验组 B（实招）
PROVIDER=mock pnpm eval:guard     # 实验三：守卫拦截率与误伤率
pnpm eval:report                  # 汇总到 eval/reports/<日期>/report.md + raw.json + review-sheet.csv
pnpm eval:promptfoo               # 导出 eval/promptfoo/（promptfoo 可直接运行的配置）
```

- 真实实验：在 `.env.local` 配好 `PROVIDER=openai-compatible` 与 `LLM_*` 后去掉 `PROVIDER=mock` 运行；mock 结果没有意义。
- 可选变量：`EVAL_N`（每组每样本次数，默认 3）、`EVAL_TEMPERATURE`（对照组 A 温度，默认 0.6）、`EVAL_RUN_ID`（默认 `mock` 或 `<接口>-<文本模型>`）。
- 产物在 `eval/runs/<runId>/<sampleId>/<group>/<n>/`（不提交）；数据库与上传文件在 `eval/runs/<runId>/data/`，不碰开发用的 `data/`。
- 中断后重跑会跳过已完成部分（`done.json` 最后写入并校验文件哈希）；损坏或不完整的部分会重跑；想重跑某部分就删掉它的目录。

## 新增一组样本

1. 新建 `eval/samples/<sampleId>/`，目录名只用小写字母、数字和连字符。
2. `images/`：商品图片（png / jpg / webp）。只能用自己拍摄、获得书面授权或明确可商用的图片。
3. `LICENSE.txt`：逐张写明图片来源与许可（拍摄者、授权书编号或可商用许可链接）。
4. `input.txt`：商家原始文字，原样粘贴，不要整理。
5. `gold.json`：人工标注的标准事实表，格式同契约 `FactSheet`，但不含 `projectId`、`revision`、`confirmedAt`；`items[].imageAssetIds` 填 `images/` 下的文件名。可参考已有样本。
6. 运行 `pnpm eval:extract`，样本格式有误时会报出具体字段；然后重跑其余脚本和 `pnpm eval:promptfoo`。

目标 10 组：烘焙甜品 5 组、小餐饮 / 饮品 5 组，单品与菜单各半。现有 3 组为脚本生成的合成图片示例（`eval/scripts/make-synthetic-images.ts`，CC0）。
