# glossary-eval — 术语匹配质量评测集（P0-4）

本目录是设计文档 `docs/design/glossary-and-section-export-design.md` **P0-4** 的产出：
一个可重复运行、带人工标注真值的评测集，用来**量化**“全量注入前 500 条”的现状基线，
以及后续 L1–L5 引擎能带来的提升。后续每一阶段（P2a/P2b/P2c/P3）都用它做回归门禁。

## 运行

```powershell
npm run eval:glossary     # = node scripts/eval-glossary.mjs --check --write
node scripts/eval-glossary.mjs --check          # 只测量 + 校验，不写 baseline.json
node scripts/eval-glossary.mjs --fill 0         # 不填充合成条目（只有 111 条子集时基线为 100%）
```

## 目录结构

| 路径 | 说明 |
|---|---|
| `glossary.json` | 人工整理的术语表子集（111 条，ESP32 PWM / 嵌入式 / 技术写作域），列含义同导入的 `en-US / zh-CN`，`kind: "phrase"` 表示句子类条目 |
| `cases/` | 4 份源材料：中文调试笔记、英文 DITA、中英混写邮件、英文需求表 |
| `expected/<case>.json` | 每份材料的期望命中条目与**匹配层级**（`exact` / `variant` / `concept`） |
| `baseline.json` | 最近一次运行的结果（由 `--write` 生成，提交到仓库作为基线记录） |

## 为什么要有合成条目

`getMappingContext` 只注入 `ORDER BY en LIMIT 500`，而真实术语表有 3k–5k 条。
为了复现“字母序靠后的条目永远进不了提示词”这一差距（G6），脚本用固定词表生成
确定性合成条目（默认 `--fill 3889`，总计 4000 条）。合成条目带 4 位编号，
不会出现在任何 case 文本中（`--check` 会验证这一点）。

## 指标定义

| 指标 | 定义 | 用途 |
|---|---|---|
| `baseline injectable recall` | 期望条目中出现在“前 500 条注入块”的比例 | 现状上限：模型连看都看不到的条目，召回必然为 0 |
| `baseline usable recall` | 期望条目中 **既被注入、又能字面命中** 的比例 | 现状可实际利用的上限（未计模型误用/漏用） |
| `selective engine ceiling` | 期望条目中被 L1/L2（字面/变体）命中的比例 | 改为“只注入命中条目”后 L1–L3 能达到的上限 |
| `concept-only` | 声明为 `concept` 的条目数 | 必须靠 L4 语义或 L5 AI 候选才能召回的部分 |
| token waste | `1 − tokens(命中条目块) / tokens(500 条全量块)` | 说明全量注入浪费的上下文预算 |

`exact` / `variant` 判定是脚本内的近似实现（大小写、连字符/空格、简单词形、全大写缩写），
仅用于评价**评测集本身**是否标注正确，不作为引擎实现。真实实现见 P2a。

## 标注规则

- `exact`：英文或中文在文中**逐字出现**（大小写不敏感、空格差异可接受）。
- `variant`：只有连字符/空格/单复数/词形/缩写差异时匹配（如 `duty-cycle`、`frequencies`、`PWM`）。
- `concept`：字面与变体都不出现，只能靠语义理解（如文中“比较寄存器”对应术语 `Duty cycle register`）。

`--check` 会校验：每条期望都能在 `glossary.json` 找到、标注层级与实际文本一致、
合成条目不污染文本、`en_key` 不重复。标注错了会让 CI 直接失败。

## 扩充方式

1. 往 `cases/` 加材料（`.md` / `.dita` / `.txt` / `.xml` / `.eml`）。
2. 在同名 `expected/<basename>.json` 标注期望条目，代码里没有的新概念先加到 `glossary.json`。
3. `npm run eval:glossary`，确认 `--check` 通过，并把新的 `baseline.json` 一起提交。
