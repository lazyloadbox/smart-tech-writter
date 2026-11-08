# mock-case-03 · 短语/短句术语表测试夹具

用于手工测试「术语 & 用语映射」的导入与匹配能力。与 `test/mock-case-02/`
（刻意包含重复、冲突、空行等噪音的**解析器**夹具）不同，本文件夹产出的文件是
**干净可导入**的数据，且每一条英文都是 `kind = 'phrase'`。

## 文件

| 文件 | 说明 |
|---|---|
| `glossary-phrases.xlsx` | **主测试文件**。Sheet `Phrases` 为数据（`No. / en-US / zh-CN / zh-TW / Do not use`），Sheet `Readme` 仅为说明（导入时不要选它） |
| `glossary-phrases.csv` | 同数据 CSV 版本（UTF-8 BOM + CRLF），用于验证 CSV 导入路径 |
| `generate-phrase-sample.mjs` | 生成脚本（确定性输出） |

## 重新生成

```powershell
npm run gen:glossary-phrases
# 等价于 node test/mock-case-03/generate-phrase-sample.mjs
```

脚本会先自检：任何一行若会被 `classifyEntryKind()` 判为 `term` 就直接报错退不生成。

## 数据概况（42 行）

- 全部为短语或短句：要么 > 6 个词，要么以 `.` 结尾 → 均判为 `phrase`
- 40 行有 zh-TW；2 行留空（验证 zh-TW 目标语言的 zh-CN 回退，提示词中出现 `(zh-CN reference)`）
- 12 行带 `Do not use` 禁用写法（验证 R7 检查与一键替换）
- 内容覆盖：安全须知、PWM/测量、UI 操作步骤、文档固定句式、长名词短语

## 建议的验证步骤

1. 设置 → 「术语 & 用语映射」→ 导入 Excel/CSV → 选 `glossary-phrases.xlsx`，Sheet 选 `Phrases`。
2. 预览应显示 `A=No. B=en-US C=zh-CN D=zh-TW E=Do not use`（表头第 1 行识别）。
3. 导入模式选「替换」或「追加」均可；统计里「用语」数量应等于 42。
4. 「匹配试验场」场景选 `translation`、目标 `zh-CN`，粘贴文件里的英文句子 → 应命中对应条目；
   粘贴近似句（改动一两个词）可验证 L3 模糊匹配。
5. 粘贴含 `tech support`、`heatsink`、`duty ratio` 等禁用写法的文本，Review 中应出现 R7 提示。
