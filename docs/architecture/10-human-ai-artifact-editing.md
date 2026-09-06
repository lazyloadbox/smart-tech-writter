# 人工确认阶段的人机对话式产出物编辑

## 分析结论

当前代码中有两条包含 AI 产出物确认点的流程：

| 流程 | 确认 step | AI 产出物 | 对话编辑格式 | 修改写回位置 |
|---|---|---|---|---|
| 文档生成 | `review_upload` | 完整文件提炼 Markdown、提取文本、元数据 | Markdown | `DocGenState.inputFiles[].parseMarkdown` |
| 文档生成 | `review_analyze` | 逐文件分析 Markdown、跨文件综合 Markdown、参考资料 | Markdown | `analysisResults[].markdown` / `analysisSynthesisMarkdown` |
| 文档生成 | `review_draft` | 技术文档草稿 | Markdown | `drafts` |
| 文档生成 | `human_review` | AI 质量建议后的技术文档 | Markdown | `humanEditedDrafts`（兼容 `humanEdits`） |
| 文档生成 | `human_confirm` | 最终英文草稿及修改建议 | Markdown | `humanEditedDrafts`（兼容 `humanEdits`） |
| 文档生成 | `review_localize` | AI 本地化后的草稿 | Markdown | `localizedDrafts` |
| 文档生成 | `human_localize_review` | AI 本地化评审建议后的草稿 | Markdown | `localizedDrafts` |
| 文档生成 | `review_dita` | DITA XML | XML | `ditaDocuments` |
| 文档生成 | `human_dita_review` | DITA AI 评审建议后的 XML | XML | `ditaDocuments` |
| 独立本地化 | `review_localize` | DITA 翻译结果 | XML | 当前 run 的 `results[].content` |
| 独立本地化 | `human_localize_review` | 翻译评审建议后的 DITA | XML | 当前 run 的 `results[].content` |
| 独立本地化 | `human_confirm` | 最终 DITA 翻译结果 | XML | 当前 run 的 `results[].content` |

以上 12 个确认点都属于“AI 已经产出、人工需要判断并可能优化后再进入下一阶段”的范围。仅展示运行日志、AI 流式过程和最终导出结果的页面不属于人工确认 step，因此不增加编辑对话。

## 实现方式

- `AiArtifactChat` 是所有确认点共用的聊天式输入组件。每个回合都携带当前最新产出物，AI 返回完整的新产出物；用户可以连续发送多条指令，也可以继续手工编辑。
- `workflow:aiEditArtifact` 服务主流程，`localize:aiEditArtifact` 服务独立本地化流程。两者共用格式感知的系统提示词，强制 Markdown / XML 等只返回完整对应格式，不返回解释或代码围栏。
- 解析和分析确认点以 Markdown 作为可读、可对话修改的权威工件；渲染层保护文件 ID、路径、解析状态等系统字段，人工修改后的 Markdown 通过 `reviewContinue` 写回并传给下游。
- `workflow:reviewContinue` 扩展为按产出物类型写回对应 state channel，确保对话编辑不会只停留在 UI，而会被后续 AI 阶段真正使用。
- 现有 `ReviewPanel` 被所有文档/XML 人工确认点复用；`review_draft` 接入支持多草稿的 `AiDraftEditor`，独立本地化的三个暂停点也复用同一 `ReviewPanel` 对话入口。
