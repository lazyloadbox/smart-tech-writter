# mock-case-02 — 术语表导入样例（P0-1）

本目录是设计文档 `docs/design/glossary-and-section-export-design.md` **P0-1** 的产出：一份贴近真实导出的
`No. / en-US / zh-CN` Excel 术语表，专门覆盖导入解析中最容易出错的情况。

## 文件

| 文件 | 说明 |
|---|---|
| `glossary-sample.xlsx` | 主样例。3 个 sheet：`Terms`（新格式，含标题横幅行 + 表头 + 脏数据）、`Legacy3Col`（旧三列格式）、`NoHeader`（无表头，首列为数字） |
| `glossary-sample.csv` | 新格式 CSV：BOM + CRLF + 带逗号的引号字段 |
| `glossary-legacy.csv` | 旧三列 CSV（English / 简体中文 / 繁體中文） |
| `manifest.json` | 机器可读的真值：每个数据行的期望分类（`new` / `dupInFile` / `conflictInFile` / `invalid`）与统计 |
| `generate-sample.mjs` | 生成脚本（确定性，可重复执行） |

重新生成（会覆盖上述产物）：

```powershell
node test/mock-case-02/generate-sample.mjs
```

## `Terms` sheet 的布局与期望

| 行 | 内容 | 期望行为 |
|---|---|---|
| 1 | 合并单元格横幅「ESP32 PWM 术语表 / Glossary」 | 不是表头，也不应作为数据导入 |
| 2 | `No.` / `en-US` / `zh-CN` 表头（有底色、加粗） | 识别为表头行，数据从第 3 行开始 |
| 3–7 | `Duty cycle` 的正常行、重复行、空白差异行、冲突行 | 3/4/7 行合并去重；第 7 行（`Duty cycle` → 占空比寄存器）报 `conflictInFile` |
| 8 | 整行空白 | 跳过，不报错 |
| 9–17 | 正常条目、连字符变体、富文本单元格、空 en、缺 zh-CN、零宽字符、NBSP、句末标点 | 见 `manifest.json` 的 `rows[]` |
| 18–19 | 其余正常条目 | 导入 |

`manifest.json` 的 `Terms.expected` 是测试真值：

```json
{ "new": 10, "dupInFile": 4, "conflictInFile": 1, "invalid": 1 }
```

> 注意：当前 `mapping.ipc.ts` 的解析器**会**以错误的方式处理这个文件（位置取列导致 `No.` 被当成英文，
> `zh_tw NOT NULL` 导致缺繁体列的行被跳过）。这正是 P1-4/P1-5 要修复的差距（G1/G2），不要为了
> “让现有解析器通过” 而修改样例。

## `Legacy3Col` / `NoHeader` / CSV

- `Legacy3Col` 第 6 行 `Table` 的 `zh-TW` 为空：旧导入逻辑会丢弃整行，新 schema 必须保留该术语。
- `NoHeader` 没有表头行，首列是整数：解析器需要回退到 `seq / en / zhCN` 位置映射（设计 §2.4.2）。
- `glossary-sample.csv` 第 4 行 `固件升级, 固件更新` 是带逗号的引号字段，用于验证 CSV 解析。
- `glossary-legacy.csv` 是旧格式的 CSV 变体，用于回归旧文件仍可导入。
