# Smart Tech Writer — Tech Writer 短期学习计划书 v3

> **目标受众**：有 Markdown/HTML 基础、零编程经验的 Technical Writer  
> **学习周期**：4-6 周（每天 2-3h，周末可加量）  
> **最终目标**：理解项目架构 → 能本地跑起来 → 能阅读和修改 AI Prompt → 能调试简单问题  
> **版本说明**：v3 为深度扩充版，每个主题均包含 Why / What / How / Resources 四层结构

---

## 学习路线总览

### 路线设计的核心理念

本学习计划遵循 **"从地基到楼房、从通用到专用、从理论到实践"** 的认知递进原则。对于一个零编程经验的 Tech Writer 来说，直接跳入 AI Agent 代码无异于让一个刚学会字母的人去读莎士比亚——不是不可能，但极其痛苦且低效。

因此，整份计划按照以下逻辑链展开：

```
能看懂代码 → 能理解 AI → 能拆解项目 → 能用 AI 辅助自己
（板块一）    （板块二）    （板块三）    （板块四）
```

每一板块都是下一板块的**必要前置**：没有编程基础就看不懂 AI API 调用；不理解 LLM 原理就看不懂 Agent 的 System Prompt 为什么那样写；不清楚项目架构就不知道改一个 Prompt 会影响到哪些流程。

---

### 为什么按这个顺序而非其他顺序？

**为什么不先学 AI 再学编程？**
因为 LLM 开发不是"聊天"，它涉及 API 调用、异步编程、JSON 解析、错误处理——全是编程概念。先理解了 `async/await`，再看 `OpenAIProvider.stream()` 就一目了然。反过来，连 `await` 都不认识就去读 AI 代码，每个关键字都是一个障碍。

**为什么不先拆项目再学基础？**
因为本项目涉及的技术栈非常广：Electron、React、TypeScript、Zustand、SQLite、LangChain、OpenAI SDK……如果零基础直接看项目代码，会在 30 秒内被几十个陌生概念淹没。先花两周建立"概念地图"，再去看项目代码，就能把每个文件放进正确的位置。

**为什么把 AI 辅助开发放最后？**
因为 AI 编程工具（Copilot、Cursor）只有在你有了一定基础后才能真正发挥威力。一个零基础的人用 Copilot——Copilot 生成了代码，你看不懂，也不知道它对不对。学了板块一到三之后再用，你就能审查 AI 的输出、理解它的建议、判断质量。

---

### 四大板块概览

本计划将全部学习内容组织为四个逻辑递进的板块，总计约 **96 学时**（4-6 周）。

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│   板块一              板块二              板块三       板块四      │
│   非 AI 基础          AI 核心知识          项目工程     AI 辅助     │
│   ≈ 30h              ≈ 28h               ≈ 24h        ≈ 14h      │
│     │                   │                   │            │        │
│     ▼                   ▼                   ▼            ▼        │
│  能看懂代码           能理解 AI           能拆解项目    能用 AI     │
│  能搭建环境           能调用 API          能改 Prompt   加速自己    │
│  能理解设计           能设计 Agent        能追踪调试               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

### 板块一：非 AI — 软件工程基础（约 30h）

> **定位**：打通"能看懂代码、能搭建环境"的门槛

#### 涵盖内容

| 主题 | 学时 | 为什么排在这里 |
|------|------|--------------|
| **Git 版本控制** | 1.5h | 软件开发的"时间机器"。没有它，代码拿不到、改不了、存不住。第一件事就是学会下载项目 |
| **Node.js + npm** | 2h | JS 的"运行环境"和"应用商店"。本项目的前后端全跑在 Node.js 上，`npm start` 就是启动命令 |
| **VS Code + 终端** | 1h | 写代码的"笔和纸"。不需要成为高手，但需要会打开项目、搜索文件、运行命令 |
| **JavaScript 核心** | 5h | 本项目前后端唯一使用的编程语言。重点不是"能写"而是"能读"——变量、函数、数组、对象 |
| **异步编程 (async/await)** | 3h | ★ 整个学习计划最重要的编程概念。所有 AI API 调用全是异步的，不理解这个就看不懂任何 AI 代码 |
| **TypeScript 基础** | 3h | JS 的"类型标注版"。本项目 100% TypeScript，`interface`、`type`、`?` 可选符号遍布每个文件 |
| **前后端分离设计** | 1.5h | 先讲通用 Web 的前后端分离思想，再切入 Electron 特有的 Main/Renderer 双层架构 |
| **模块化开发** | 1h | 先讲"高内聚低耦合"的通用原则，再看项目如何按 `agents/`、`workflow/`、`storage/` 拆模块 |
| **React 组件化** | 2h | 先讲"UI = 组件树"的通用理念，再看项目 14 个组件如何拼成完整界面 |
| **状态管理** | 0.5h | 局部状态 vs 全局状态的区别，本项目用 Zustand 管理全局状态 |
| **技术栈速览** | 0.5h | 一张表看懂本项目 15 项技术及其选型理由 |

#### 学完板块一后你应该能

- 用 Git 把项目下载到本地
- 用终端运行 `npm install` 和 `npm start`
- 打开项目中的任意 `.ts` / `.tsx` 文件，**大致看懂**在做什么
- 理解"为什么前端代码不能直接读文件"（安全隔离）
- 说出 React 组件、Props、State 分别是什么
- 用"前后端分离"的视角看项目目录结构

---

### 板块二：AI — 大模型开发核心知识（约 28h）⭐ 整个计划的灵魂

> **定位**：建立完整的 AI 开发知识体系。**这是 Tech Writer 最能发挥专业优势的板块。**

#### 为什么板块二是"核心"？

本项目叫 **Smart Tech Writer**——核心就是"用 AI 写技术文档"。板块一学的是"怎么读懂项目的代码"，板块二学的才是"项目在做什么、为什么这样做"。

更重要的是：**AI 开发中最关键的能力不是写代码，而是写好 Prompt**。这正是 Tech Writer 的看家本领——你比大多数程序员更懂得如何组织语言、如何定义受众、如何设计结构、如何约束输出。

#### 涵盖内容

| 主题 | 学时 | 为什么排在这里 | 与项目的关系 |
|------|------|--------------|-------------|
| **LLM 基础概念** | 4h | 理解 Token/Context Window/Temperature/Hallucination 是后续一切的基础 | 决定每个 Agent 能输入多长的文档、AI 输出的确定性和可靠性 |
| **主流模型介绍** | 4h | GPT-4o/Claude/DeepSeek/Qwen/GLM——了解各家模型的特点才能为项目做出正确选型 | 项目通过 `baseURL` 支持切换任意 OpenAI 兼容模型 |
| **Prompt Engineering** | 5h | ★ Tech Writer 的核心竞争力！CRISP 五要素框架、8 种 Prompt 技术、诊断表 | 直接对应 5 个 Agent 的 System Prompt 编写和优化 |
| **Context Engineering** | 2.5h | 比 Prompt 高一层的设计——如何为 AI 构建最优的信息环境 | 项目中 FileParser→Analyzer→Writer 的上下文压缩链路 |
| **OpenAI API 编程** | 3.5h | 动手写代码调 API：Chat Completions、Streaming、Embeddings、Function Calling | 直接对应 `OpenAIProvider.complete()` 和 `.stream()` |
| **RAG 检索增强生成** | 2.5h | 检索→增强→生成三步走，Chunking/Embedding/向量数据库/重排序 | 对应 `LocalSearchService`（当前为简化版关键词搜索） |
| **Agent 设计与实现** | 3h | 5 种 Agent 设计模式（ReAct/Plan-Execute/Multi-Agent/Human-in-the-loop） | 直接对应项目 5 个 Agent 类的设计 |
| **MCP 协议** | 1.5h | AI 与外部工具的标准化协议，解决 N×M 集成问题 | 项目的未来扩展方向 |
| **Skill 系统** | 1h | AI 编程助手的"专业能力包"概念 | Tech Writer 未来可创建和分享的文档 Skill |
| **Loop Engineering** | 2h | Agent 的核心循环机制：Plan→Act→Observe→Reflect | 对应项目的 20 阶段工作流和 PAUSE_STAGES 机制 |
| **AI 业界概念梳理** | 1.5h | 三大 Engineering 对比、Fine-tuning vs RAG vs Prompt、AI Safety、Evaluation | 建立完整的 AI 知识地图，知道每个概念在整个 AI 生态中的位置 |

#### 板块二的独特设计：概念 → 实战 → 项目对照

每个主题都遵循三段式结构：
1. **概念讲解**：这个东西是什么、为什么重要（给零基础的解释）
2. **业界实战**：业界怎么用、有什么工具和最佳实践
3. **项目对照**：在本项目中具体体现在哪里（代码位置 + 设计理由）

这样你学到任何概念时，都能立刻在项目中找到对应——不会产生"学了很多但不知道跟项目有什么关系"的脱节感。

#### 学完板块二后你应该能

- 解释 Token、Temperature、Context Window 的含义及其对文档生成的影响
- 为不同任务（写作/审查/翻译）选择合适的模型
- 用 CRISP 框架写出结构化的 System Prompt
- 区分 Prompt Engineering / Context Engineering / Loop Engineering 的层次
- 写一个调 OpenAI API（含 Streaming）的 Node.js 脚本
- 解释 RAG 的三步骤和本项目的简化实现
- 说明 Agent 比普通 LLM 调用多了哪些关键能力
- 理解 MCP 是什么以及为什么它是未来的趋势

---

### 板块三：项目工程 — Smart Tech Writer 深度解析（约 24h）

> **定位**：从"看懂代码"到"能改代码"，从"理解 AI"到"应用 AI"

#### 为什么板块三排在这里？

板块一给了你"阅读能力"（能看懂代码），板块二给了你"领域知识"（理解 AI 开发）。板块三是这两者的**汇合点**——用板块一学到的编程概念去阅读板块二涉及的 AI 代码。

此时你看项目代码的感受与零基础时完全不同：你不再被 `interface`、`async/await`、`import/export` 这些语法绊倒，也不会对 System Prompt、Streaming、Agent 这些概念感到陌生。你可以专注于理解**架构设计**——为什么这么分层、为什么这么拆模块、为什么用这个模式。

#### 涵盖内容

| 主题 | 学时 | 核心内容 |
|------|------|---------|
| **项目架构总览** | 3h | 为什么选 Electron（桌面应用的必要性）→ 三层架构图 → 技术分层 → 完整数据流追踪 |
| **目录结构详解** | 2h | 每个文件/文件夹的职责说明 + 设计理由（不只告诉你"这是什么"，还告诉你"为什么放这里"） |
| **核心模块解析** | 8h | WorkflowEngine 的 Resume Promise 模式、State Machine 的 20 阶段设计逻辑、Pipeline 的统一模式、Agent 体系的职责划分、Provider 的抽象工厂模式、前端的"状态驱动 UI"模式 |
| **动手实操** | 6h | 4 个层次：环境搭建 → 改 Prompt（3 个递进任务+ A/B 测试）→ 追踪调试 → 分层实战小项目 |
| **项目演进展望** | 1h | 项目可能的演进方向及各方向需要储备的知识 |

#### 板块三的独特设计：每个模块都回答三个问题

1. **🎯 为什么这样设计？**（设计动机和权衡）
2. **🏗️ 怎么实现的？**（架构模式和代码结构）
3. **📖 关键代码解读**（核心逻辑的逐步讲解）

这让你不仅知道"代码长什么样"，更知道"当初为什么这么写"——后者才是真正理解项目的标志。

#### 学完板块三后你应该能

- 画出项目的 Electron 三层架构图
- 说出 20 个 Stage 的流程和 7 个暂停点
- 说出 5 个 Agent 各自的职责
- 解释 WorkflowEngine 如何在不阻塞的情况下等待用户确认（Resume Promise 模式）
- 本地启动项目并跑通完整流程
- 修改任意 Agent 的 System Prompt 并看到输出变化
- 追踪从"用户点击开始"到"文档导出"的完整数据链路

---

### 板块四：AI 辅助开发（约 14h）

> **定位**：学会用 AI 工具加速学习和开发——"元技能"

#### 为什么板块四不可或缺？

板块四要解决的问题是：**"作为一个 Tech Writer，我怎么可能在 6 周内学会编程 + AI + 项目？"**

答案是：**你不是"学"编程，你是用 AI 辅助你编程**。

板块四教的是 21 世纪最重要的"元技能"——如何借助 AI 工具加速一切。学会了这些，你不必纠结语法细节（让 AI 写），你可以用自然语言描述需求（让 AI 生成代码），你只需要专注于审查质量和理解逻辑（人的判断力）。

#### 涵盖内容

| 主题 | 学时 | 核心内容 |
|------|------|---------|
| **AI IDE 工具详解** | 4h | GitHub Copilot 的 10 项功能逐项讲解 + Cursor 对比 + OpenCode/Claude Code/Windsurf/Cline/Aider 等 7 款工具速览 |
| **Spec Coding** | 2.5h | "先写规格书再让 AI 生成代码"的工程方法，含完整 Spec 模板和 5 步工作流 |
| **Vibe Coding** | 2h | "对话式编程"的理念、适用/不适用场景、6 条最佳实践 |
| **AI 超级学习法** | 3h | AI 辅助学习（6 种技巧）、AI 辅助调试（完整错误→方案）、AI 辅助 Prompt 开发（Tech Writer 终极工作流）、建立 AI 开发习惯 |
| **资源汇总** | 0.5h | 20+ 条 AI 工具和社区资源链接 |

#### 板块四的核心理念：AI 代码 = 第一稿，你 = 主编

你不需要成为能徒手写代码的程序员。但你需要成为**能审查 AI 生成代码质量的编辑**——就像你审查一份文档草稿一样。理解代码的逻辑、判断方案的好坏、验证是否满足需求——这才是你作为 Tech Writer 在 AI 时代的独特价值。

#### 学完板块四后你应该能

- 使用 Copilot Chat 的 `/explain` 理解陌生代码
- 使用 Copilot Inline Chat 用中文描述需求并让 AI 修改代码
- 按照 Spec Coding 方法写出清晰的功能规格书
- 判断什么场景适合 Vibe Coding、什么场景必须人工审查
- 形成"AI 辅助 → 人工审查 → 小步提交"的开发习惯

---

### 板块间的逻辑关系

```
板块一（看懂代码）
    │
    │  提供"阅读语法"和"基本概念"
    │
    ▼
板块二（理解 AI）
    │
    │  提供"领域知识"和"设计原理"
    │
    ├──────────────────────┐
    │                      │
    ▼                      ▼
板块三（拆解项目）    板块四（AI 辅助开发）
    │                      │
    │  "知识应用"           │  "元技能" — 贯穿始终
    │                      │
    └──────────┬───────────┘
               │
               ▼
        最终目标：
        理解架构 → 能跑起来 → 能改 Prompt → 能调试
```

板块四虽然在最后，但它的技能**应该从第一天就开始使用**。学 Git 时用 Copilot Chat 问"git status 是什么意思"；学 JS 时让 AI 用类比解释 async/await；学 Prompt Engineering 时让 AI 审查你写的 System Prompt。板块四的"元技能"与板块一到三的"领域知识"是并行推进、相互加速的关系。

---

### 建议的学习节奏（4-6 周）

| 周次 | 主要板块 | 每天安排 | 阶段目标 |
|------|---------|---------|---------|
| **Week 1** | 板块一 | 每天 2h JS/TS 基础，穿插 Git + Node.js | 能看懂简单的 JS/TS 代码 |
| **Week 2** | 板块一（续） | 每天 2h，周末集中学设计概念 + React | 理解前后端分离、模块化、组件化 |
| **Week 3** | 板块一收尾 + 板块二开始 | 每天 2h，完成 React 后开始 LLM 基础 | 从"编程基础"切换到"AI 基础" |
| **Week 4** | 板块二为主 | 每天 2-3h，Prompt Engineering 是重点 | **写出一份结构化的 System Prompt** |
| **Week 5** | 板块二收尾 + 板块三开始 | 每天 2-3h，完成 AI 知识后进入项目 | 启动项目，跑通第一个流程 |
| **Week 6** | 板块三 + 板块四 | 每天 2-3h，动手实操 + AI 辅助工具 | **独立完成一次 Prompt 修改全流程** |

> **弹性调整**：如果某个板块学得特别吃力，可以适当延长。板块一和二的时间投入最值得——基础打好了后面会越来越快。如果时间紧张，板块四中可以优先学 Copilot 基础和 Vibe Coding（最实用），Spec Coding 可以后续再补。

---

# 板块一：非 AI — 软件工程基础

> **目标**：建立编程心智模型，理解项目所用技术栈的基本概念和设计思想  
> **学时**：约 30h  
> **前置要求**：会 Markdown/HTML 即可  
> **学习原则**：每个主题先讲"为什么"、再讲"是什么"、最后讲"在本项目中怎么用"

---

## 1.1 开发环境与工具链（5h）

### 1.1.1 Git 版本控制

#### 📌 为什么需要学这个？

想象你写了一篇 5000 字的技术文档，修改了 20 次。某天你发现 3 天前删除的一个段落其实很重要——但你已经没有那个版本的备份了。Git 就是解决这个问题的：**它像一个"时间机器"，记录你每一次修改，让你随时回到任意历史版本**。

在软件开发中，多人同时改同一份代码是常态。没有 Git，两个人改了同一个文件，只能手动合并（噩梦）。Git 提供了一套成熟的协作机制。

对本项目而言：代码托管在 GitHub 上，你需要用 Git 把代码下载到本地、获取最新更新、如果你要提交修改也需要 Git。

#### 📝 核心概念总结

| 概念 | 用"写文档"的类比来理解 |
|------|----------------------|
| **Repository（仓库）** | 一个项目的"完整档案柜"，所有版本都存在里面 |
| **Commit（提交）** | 按一次"保存快照"按钮，附带一句话说明"这次改了什么" |
| **Branch（分支）** | 一份"复印件"，你可以在上面随便改，不影响原件 |
| **Clone（克隆）** | 把远程档案柜完整复制一份到你自己电脑上 |
| **Pull** | 把别人放到档案柜里的新文件同步到你的电脑 |
| **Push** | 把你的修改上传到共享的档案柜 |
| **.gitignore** | 一张"忽略清单"，告诉 Git："这些文件不要管"（如 `node_modules/`） |

#### 📖 详细学习内容

**Git 的三种状态**（理解这个才算真正入门）：

```
工作目录（Working Directory）  →  git add  →  暂存区（Staging Area）  →  git commit  →  仓库（Repository）
   你正在编辑的文件                "准备就绪"的文件                    "永久存档"的快照
```

**最少必要命令**（先掌握这 6 个，覆盖 90% 日常场景）：

```bash
git clone <仓库地址>              # 第一次：下载项目到本地
git status                        # 最常用的"体检命令"：看看改了哪些文件
git diff                          # 查看具体改了什么内容
git add .                         # 把所有修改加入"准备提交"清单
git commit -m "描述这次改了什么"    # 正式存档
git push                          # 上传到远程仓库
git pull                          # 下载别人的最新修改
```

**分支操作入门**：

```bash
git branch <分支名>        # 创建新分支
git checkout <分支名>      # 切换到那个分支
git merge <分支名>         # 把分支的修改合并回主线
```

#### 🔗 与本项目的关联

- 你通过 `git clone` 获取本项目的源代码
- 你通过 `git pull` 获取项目的最新更新
- 如果你需要提交自己的修改（如优化了 Prompt），通过 `git add` → `git commit` → `git push`
- 项目的 `.gitignore` 文件列出了不需要版本控制的文件（依赖包、构建产物、数据库文件）

#### 📚 推荐资源

| 资源 | 类型 | 说明 | 适合阶段 |
|------|------|------|---------|
| [Git 官方教程（中文版）](https://git-scm.com/book/zh/v2) | 📖 书籍 | 前 3 章即可，最权威的 Git 教材 | 系统学习 |
| [Learn Git Branching](https://learngitbranching.js.org/) | 🎮 交互游戏 | 可视化学习分支操作，强烈推荐！ | 动手练习 |
| [Git 飞行规则](https://github.com/k88hudson/git-flight-rules/blob/master/README_zh-CN.md) | 📋 速查 | 当你不小心搞砸了，查这个看怎么救回来 | 应急参考 |
| [Visualizing Git](https://git-school.github.io/visualizing-git/) | 🖼️ 可视化 | 在线可视化 Git 操作的效果 | 概念理解 |
| B站「Git 入门教程」 | 📺 视频 | 搜播放量最高的，跟着敲命令 | 零基础入门 |

---

### 1.1.2 Node.js 与 npm

#### 📌 为什么需要学这个？

JavaScript 最初只能在浏览器里运行（用来给网页加交互效果）。后来有人想："JavaScript 挺好用的，能不能让它在电脑上直接跑？"于是 Node.js 诞生了——它让 JavaScript 脱离了浏览器，可以在电脑上做任何事：读写文件、访问数据库、启动服务器。

对本项目而言：整个后端（`src/main/`）就是用 Node.js 运行的，AI API 调用、数据库操作、文件解析全靠它。

npm（Node Package Manager）是 Node.js 的"应用商店"。你需要什么功能（比如解析 PDF、生成 Word 文档），不用自己写，去"应用商店"下载一个现成的包就行。本项目依赖了 20+ 个第三方包。

#### 📝 核心概念总结

| 概念 | 用"手机"来类比 |
|------|--------------|
| **Node.js** | 手机操作系统（Android/iOS），让 App 能运行 |
| **npm** | 应用商店（App Store/Google Play） |
| **package.json** | App 的"身份证"：名称、版本、需要哪些依赖 |
| **node_modules/** | 手机上安装的所有 App（占空间，所以 `.gitignore` 掉） |
| **npm install** | "一键安装所有依赖 App" |
| **npm start** | "点图标启动 App" |

#### 📖 详细学习内容

**npm 常用命令**：

```bash
npm install               # 根据 package.json 安装所有依赖（首次 clone 项目后必做）
npm install <包名>        # 安装一个新包
npm install -D <包名>     # 安装为开发依赖（只在开发时用，不打包到最终产品）
npm uninstall <包名>      # 卸载一个包
npm start                 # 启动项目（运行 package.json 中 scripts.start）
npm run <脚本名>          # 运行自定义脚本
npm list --depth=0        # 查看安装了哪些顶级依赖
```

**package.json 结构解读**（以本项目为例）：

```json
{
  "name": "smart-tech-writter",        // 项目名称
  "version": "1.0.0",                  // 当前版本
  "description": "...",                // 项目简介
  "main": ".vite/build/index.js",     // 入口文件
  "scripts": {                         // 可运行的命令
    "start": "electron-forge start",   // → npm start 实际执行这个
    "package": "electron-forge package",
    "make": "electron-forge make",
    "lint": "eslint --ext .ts,.tsx ."
  },
  "dependencies": {                    // 运行时依赖（必须打包到最终产品）
    "@langchain/core": "^1.2.0",
    "openai": "^6.44.0",
    "react": "^19.2.7"
  },
  "devDependencies": {                 // 开发依赖（只在开发时用）
    "typescript": "^5.9.3",
    "electron": "42.4.1",
    "@types/react": "^19.2.17"         // @types/ 开头的是 TS 类型定义
  }
}
```

**版本号 `^` 和 `~` 的含义**：
- `^1.2.0`：允许更新到 `1.x.x` 的最新版（不改变大版本号）
- `~1.2.0`：只允许更新到 `1.2.x` 的最新版（更保守）
- `1.2.0`：精确锁定这个版本

#### 🔗 与本项目的关联

- 你每次启动项目用 `npm start`
- 你每次新增依赖用 `npm install`
- 项目的 `package.json` 记录了所有技术栈信息
- 当你遇到"找不到模块"的错误，通常是忘了 `npm install`

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [Node.js 官方入门](https://nodejs.org/en/learn/getting-started/introduction-to-nodejs) | 📖 官方 | 从安装到第一个程序 |
| [npm 官方文档](https://docs.npmjs.com/about-npm) | 📖 官方 | npm 概念解释 |
| [Node.js 入门教程（中文）](https://www.nodebeginner.org/index-zh-cn.html) | 📖 电子书 | 适合完全零基础 |
| B站「Node.js 入门到实战」 | 📺 视频 | 搜播放量最高的 |

---

### 1.1.3 VS Code 编辑器与终端

#### 📌 为什么需要学这个？

"工欲善其事，必先利其器"。VS Code 是写代码最流行的编辑器（免费、强大、插件多），也是本项目的开发环境。终端（命令行）是直接和电脑"对话"的窗口——很多开发操作没有图形界面，只能通过输入命令完成。

对 Tech Writer 来说，你不需要成为 VS Code 专家，但需要会：打开项目、浏览文件、搜索内容、使用终端运行 `npm start`。

#### 📖 详细学习内容

**VS Code 必备技能**（按优先级排列）：

| 技能 | 快捷键 | 为什么重要 |
|------|--------|-----------|
| 打开文件夹 | `Ctrl+K Ctrl+O` | 打开本项目 |
| 搜索文件 | `Ctrl+P` | 快速找到 `writer.agent.ts` |
| 全局搜索 | `Ctrl+Shift+F` | 搜索某个函数在哪里被调用 |
| 命令面板 | `Ctrl+Shift+P` | VS Code 的"万能入口" |
| 集成终端 | `Ctrl+`` ` | 运行 `npm start`、`git` 命令 |
| 前往定义 | `F12` 或 `Ctrl+点击` | 跳转到函数/类的定义处 |
| 查看引用 | `Shift+F12` | 看某个函数在哪里被调用 |

**推荐安装的扩展**：

| 扩展 | 用途 |
|------|------|
| **ESLint** | 代码错误检查 |
| **Prettier** | 代码自动格式化 |
| **Tailwind CSS IntelliSense** | Tailwind class 自动补全和预览 |
| **GitLens** | Git 可视化增强 |
| **Better Comments** | 高亮不同类型的注释 |

**终端基础命令**（Windows PowerShell）：

```powershell
cd <目录>          # Change Directory — 切换目录
cd ..              # 回到上一级目录
ls 或 dir           # 列出当前目录的文件
pwd                # 显示当前完整路径
mkdir <目录名>      # 创建新文件夹
code .             # 用 VS Code 打开当前目录
```

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [VS Code 官方文档](https://code.visualstudio.com/docs) | 📖 官方 | 前 3 节即可 |
| [VS Code Tips and Tricks](https://code.visualstudio.com/docs/getstarted/tips-and-tricks) | 📖 官方 | 效率技巧汇总 |
| [PowerShell 入门](https://learn.microsoft.com/zh-cn/powershell/scripting/learn/ps101/01-getting-started) | 📖 微软官方 | Windows 用户必读 |

---

## 1.2 编程语言基础：JavaScript + TypeScript（10h）

> **说明**：本节整合了原 W1（JS）和 W2（TS），聚焦"能看懂本项目代码"所需的最小知识。不要求会写，但要求能读。

### 1.2.1 JavaScript 核心概念

#### 📌 为什么需要学这个？

JavaScript 是 Web 开发的事实标准语言。本项目的**整个前端（React）和后端（Node.js）全是用 JavaScript/TypeScript 写的**。不学 JS，就像要看一本用你不认识的语言写的书——每个字都不认识，更不用说理解内容了。

好消息是：JS 是世界上最容易入门的编程语言之一。你不需要成为 JS 专家，只需要达到"能看懂"的水平。

#### 📝 核心概念总结

如果编程语言是一门自然语言，那么：
- **变量** = 名词（给东西起名字）
- **函数** = 动词（执行一个动作）
- **条件判断** = "如果...就..."
- **循环** = "对每一个...做..."
- **对象** = 描述一个事物的属性集合

#### 📖 详细学习内容

**第一阶段：数据与变量（1.5h）**

```javascript
// 变量 — 给数据贴标签
let userName = "Tim";        // let = 可以改的变量
const apiKey = "sk-abc123";  // const = 不能改的常量（本项目大量使用）
var oldWay = "不推荐";        // var = 老写法，现在不用

// 数据类型
"Hello World"                // string（字符串/文本）
42                           // number（数字）
3.14                         // number（小数也是 number）
true / false                 // boolean（布尔值，真/假）
null                         // 空值（"故意没有值"）
undefined                    // 未定义（"忘了给值"）

// 数组 — 按顺序排列的清单
const files = ["doc1.pdf", "doc2.docx", "doc3.eml"];
files[0];                    // "doc1.pdf"（索引从 0 开始！）
files.length;                // 3
files.push("doc4.txt");      // 添加新元素

// 对象 — 用名字（key）来索引的清单
const project = {
  id: "proj-001",
  name: "ESP32 PWM 文档",
  status: "RUNNING",
  currentStage: "draft"
};
project.name;                // "ESP32 PWM 文档"（点号访问）
project["status"];           // "RUNNING"（方括号访问）
```

> 💡 **给零基础者的解释**：变量就像办公桌上的**便利贴**，上面写着一个值。`let` 是可以擦掉重写的便利贴，`const` 是过塑的便利贴（不能改）。数组像一个**编号的抽屉柜**，每个抽屉有一个编号（从 0 开始）。对象像一个**带标签的档案袋**，每份文件有一个标签（名字）。

**第二阶段：控制流 — 让代码"做决策"（1h）**

```javascript
// 条件判断 — "如果...就...否则..."
if (status === 'RUNNING') {
  console.log('工作流正在运行...');
} else if (status === 'COMPLETED') {
  console.log('工作流已完成！');
} else {
  console.log('工作流状态：' + status);
}

// 比较运算符
===        // 严格等于（值和类型都相等）  — 项目中统一用这个
!==        // 不等于
>  <       // 大于、小于
>=  <=     // 大于等于、小于等于
&&         // 并且（AND）
||         // 或者（OR）
!          // 取反（NOT）
```

**第三阶段：循环与数组操作（1.5h）**

```javascript
// for...of — 对每个元素做同样的事
for (const file of state.inputFiles) {
  console.log('处理文件:', file.name);
}

// 数组的三大核心方法（项目中到处可见！）
// map — 把每个元素"变"成另一个东西
const fileNames = files.map(f => f.name);
// [file1, file2, file3] → ["doc1.pdf", "doc2.docx", "doc3.eml"]

// filter — 过滤出符合条件的元素
const readyFiles = files.filter(f => f.parseStatus === 'done');
// 只保留解析完成的文件

// forEach — 对每个元素执行一个操作（不返回新数组）
files.forEach(f => console.log(f.name));
```

**第四阶段：函数 — 把逻辑打包（1.5h）**

```javascript
// 函数定义 — 把一个操作打包，起个名字，随时调用
function parseDocument(filePath) {
  const content = readFile(filePath);
  const result = extractStructure(content);
  return result;    // return = 把结果"交出去"
}

// 箭头函数 — 更简洁的写法（本项目主流写法）
const parseDocument = (filePath) => {
  const content = readFile(filePath);
  return extractStructure(content);
};

// 回调函数 — 把函数作为参数传给另一个函数
// "当文件读完后，请执行这个函数来处理内容"
readFile(filePath, (content) => {
  console.log('读取完成，共', content.length, '字符');
});
```

**第五阶段：模块系统 — import/export（0.5h）**

```javascript
// 一个文件导出它提供的功能
// file-readers/index.ts
export function createReader(filePath) { /* ... */ }

// 另一个文件导入使用
// main/index.ts
import { createReader } from './modules/file-readers';
const reader = createReader('test.pdf');
```

#### 🔗 与本项目的关联

- 本项目的变量命名模式：`const` 优先，`let` 只在需要修改时用
- 数组操作贯穿整个代码：`state.inputFiles.filter(...)`, `files.map(...)`
- 对象（Object）是数据传递的核心载体：`DocGenState`, `UploadedFile`, `ReviewComment`
- 函数式编程风格：大量使用箭头函数和回调

#### 📚 推荐资源

| 资源 | 类型 | 说明 | 适合阶段 |
|------|------|------|---------|
| [MDN JavaScript 教程](https://developer.mozilla.org/zh-CN/docs/Learn/JavaScript) | 📖 官方中文 | 最权威的 JS 教程，中文翻译质量高 | 系统学习 |
| [现代 JavaScript 教程](https://zh.javascript.info/) | 📖 电子书 | 中文社区最推荐的 JS 教材 | 系统学习 |
| [JavaScript 30](https://javascript30.com/) | 🎬 视频+练习 | 30 个小项目，每天一个 | 动手练习 |
| [You Don't Know JS Yet](https://github.com/getify/You-Dont-Know-JS) | 📖 开源书 | 深入理解 JS 核心机制 | 进阶参考 |
| B站「JavaScript 基础入门」 | 📺 视频 | 搜「coderwhy」或「技术胖」的教程 | 零基础入门 |

---

### 1.2.2 异步编程

#### 📌 为什么需要学这个？

这是整个学习计划中**最重要的编程概念**，没有之一。因为——

**所有 AI API 调用都是异步的**。你问 AI 一个问题，它不会立刻回答（可能需要 5-30 秒）。如果你的代码"傻等"AI 回答，整个程序的界面就会卡死——用户点什么都没反应。

异步编程解决的就是这个问题：**"你去忙你的，结果回来了我通知你"**。

#### 📝 核心概念总结

| 概念 | 餐厅点餐类比 |
|------|------------|
| **同步（Synchronous）** | 你站在柜台，盯着厨师，直到菜做好（期间什么事都不能做） |
| **异步（Asynchronous）** | 你点了餐拿个叫号器，回座位刷手机，叫号器响了去取餐 |
| **Callback（回调）** | 你在叫号器上贴了个纸条："响了就送到 3 号桌" |
| **Promise** | 服务员给你一张小票（承诺），上面写了菜名和预计时间 |
| **async/await** | 你可以"假装"同步地等菜，但其实不阻塞（像魔法） |
| **Stream（流式）** | 菜不是一次性上齐的，厨师炒好一道就上一道 |

#### 📖 详细学习内容

**为什么不能同步等？— 理解事件循环（Event Loop）**

JavaScript 是**单线程**的——它像只有一个收银员的便利店，一次只能服务一个人。如果收银员要等一个顾客纠结 10 分钟，后面的顾客全堵住了。

```javascript
// ❌ 同步写法 — 如果 callAI 需要 10 秒，整个界面卡 10 秒
const result = callAI("写一篇技术文档");  // 傻等...
console.log(result);                      // 10 秒后才执行

// ✅ 异步写法 — 发起请求后立刻返回，不阻塞
const result = await callAI("写一篇技术文档"); // await = "在这等结果，但让别人先"
console.log(result);                            // 结果回来后执行
```

**异步的三种写法（从老到新）**：

```javascript
// 1. Callback（回调）— 最老的写法，容易"回调地狱"
readFile('doc.pdf', (error, content) => {
  if (error) { console.error(error); return; }
  parseContent(content, (error, result) => {
    if (error) { console.error(error); return; }
    console.log(result);  // 层层嵌套，难以阅读
  });
});

// 2. Promise — 用 .then() 链式调用，比回调好读
readFile('doc.pdf')
  .then(content => parseContent(content))
  .then(result => console.log(result))
  .catch(error => console.error(error));

// 3. async/await — 最现代的写法（本项目全部用这种）✅
async function processDocument(filePath) {
  try {
    const content = await readFile(filePath);      // 等文件读完
    const result = await parseContent(content);     // 等解析完成
    console.log(result);
  } catch (error) {
    console.error('处理失败：', error.message);
  }
}
```

**async/await 的三个核心规则**：

1. `await` 只能放在 `async function` 里面
2. `await` 会让代码"暂停"在当前行，等 Promise 完成，但**不阻塞其他代码**
3. 必须用 `try { ... } catch (error) { ... }` 包裹，处理可能的错误

**Stream（流式输出）— 打字机效果的实现原理**：

```javascript
// 普通调用：等 10 秒 → 一次性返回全部结果
const fullText = await callAI("解释什么是 PWM");
// fullText = "PWM（脉冲宽度调制）是一种..."（2000 字一次性返回）

// 流式调用：每生成一个字就立刻返回
const stream = await callAIStream("解释什么是 PWM");
for await (const chunk of stream) {
  // chunk = "P" → "WM" → "（脉" → "冲宽" → ...
  process.stdout.write(chunk);  // 逐字打印，像打字机
}
```

#### 🔗 与本项目的关联

- `BaseAgent.callLLM()` 方法同时支持流式和非流式两种模式
- `OpenAIProvider.stream()` 使用 `AsyncIterable`（异步可迭代对象）
- 前端 `AIStreamViewer` 通过 IPC 接收流式 chunk，实时渲染
- 工作流引擎的 `resumeFromHumanInput()` 使用 Promise 等待用户确认

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [MDN: 异步 JavaScript](https://developer.mozilla.org/zh-CN/docs/Learn/JavaScript/Asynchronous) | 📖 官方中文 | 从回调到 async/await 的完整演进 |
| [JavaScript Visualized: Event Loop](https://dev.to/lydiahallie/javascript-visualized-event-loop-3dif) | 📖 图解 | 最直观的事件循环可视化解释 |
| [The Async Await Episode](https://www.youtube.com/watch?v=vn3tm0quoqE) | 🎬 视频 | Fireship，5 分钟讲透 async/await |
| [JavaScript Promise 迷你书](http://liubin.org/promises-book/) | 📖 中文电子书 | 深入理解 Promise |

---

### 1.2.3 TypeScript 基础

#### 📌 为什么需要学这个？

JavaScript 有一个著名的"缺陷"：变量没有类型约束。你永远不知道一个变量是数字、字符串、还是别的什么——直到运行时崩溃。

TypeScript（简称 TS）在 JavaScript 上加了一层"类型标注"——就像给每个变量贴上了"品类标签"。这个标签不会让程序运行更快，但会在你**写代码的时候就告诉你哪里不对**。

```javascript
// JavaScript（没有类型标注）
function add(a, b) { return a + b; }
add(1, 2);       // 3 ✅
add("1", "2");   // "12" ⚠️ 不是你要的！
add("hello", 5); // "hello5" 🤦 完全混乱

// TypeScript（有类型标注）
function add(a: number, b: number): number { return a + b; }
add(1, 2);       // 3 ✅
add("hello", 5); // ❌ 编辑器直接标红！"hello" 不是 number
```

本项目**100% 使用 TypeScript**，不学 TS 就读不懂代码。

#### 📝 核心概念总结

| 概念 | 一句话说明 | 本项目中的出现频率 |
|------|-----------|------------------|
| `interface` | 定义"一个对象应该长什么样" | ⭐⭐⭐⭐⭐ 到处都是 |
| `type` | 给类型起别名，或定义联合类型 | ⭐⭐⭐⭐⭐ |
| `enum` | 一组有名字的常量 | ⭐⭐⭐ |
| 泛型 `<T>` | "类型占位符"，像函数的参数但是是类型 | ⭐⭐ |
| `?` 可选属性 | 这个字段可以有、也可以没有 | ⭐⭐⭐⭐ |
| `|` 联合类型 | 可以是 A 或 B | ⭐⭐⭐⭐ |
| `readonly` | 只读，不能修改 | ⭐⭐ |

#### 📖 详细学习内容

**interface — 项目中最常见的 TS 特性**

`interface` 就像一份"数据规格说明书"，明确告诉所有人：这个数据应该有哪些字段，每个字段是什么类型。

```typescript
// 定义一份"文件"的规格说明书
export interface UploadedFile {
  id: string;                          // id 必须是字符串
  name: string;                        // 文件名必须是字符串
  path: string;                        // 路径必须是字符串
  size: number;                        // 大小必须是数字
  parseStatus: 'pending' | 'parsing' | 'done' | 'error';  // 只能是这 4 个之一
  extractedText?: string;              // ? = 可选，可能有也可能没有
  metadata?: Record<string, string>;   // 可选，如果有的话是一个键值对
  parseError?: string;                 // 可选，解析出错时的错误信息
}

// 使用这个 interface
function displayFile(file: UploadedFile): void {
  console.log(`${file.name} (${file.size} bytes) - ${file.parseStatus}`);
}
```

> 💡 **给零基础者的解释**：`interface` 就像快递包裹上的**物品清单**。你不需要拆开包裹就知道里面有什么、每样东西应该是什么类型。如果寄件人放了不该放的东西（比如应该放书的地方放了一块砖），快递系统（TypeScript）在打包时就拒绝发送，而不是等到收件人拆开才发现。

**type — 给类型起别名**

```typescript
// 基本别名 — 让代码更好读
type FilePath = string;
type FileSize = number;

// 联合类型 — "可以是 A 或 B 或 C"
type StageName = 
  | 'upload_parse' 
  | 'analyze' 
  | 'draft' 
  | 'export';

// 有用例的时候，编辑器会自动提示所有可选值！

// 函数类型 — 描述一个函数的签名
type ProgressCallback = (stage: StageName, message: string) => void;
// 意思是：这个函数接收一个 stage 和一个 message，不返回任何东西
```

**enum — 一组有名字的常量**

```typescript
// 不用 enum 的话
if (status === 'RUNNING') { /* ... */ }
if (status === 'COMPLTED') { /* ... */ }  // 拼错了！但 JS 不报错

// 用 enum
enum WorkflowStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
if (status === WorkflowStatus.RUNNING) { /* ... */ }
// 如果用 WorkflowStatus.COMPLTED，编辑器直接标红！
```

**泛型 `<T>` — 类型的"占位符"**

```typescript
// 不需要深入理解，但要知道这是泛型
// 它让函数/类可以处理"任意类型"的数据，同时保持类型安全

// Promise<T> — "这个异步操作最终会返回一个 T 类型的数据"
async function fetchData(): Promise<DocGenState> {
  // 这表示函数最终返回一个 DocGenState 类型的数据
}

// Array<T> — T 类型的数组
const files: Array<UploadedFile> = [];  // 等价于 UploadedFile[]
```

#### 🔗 与本项目的关联

- `src/shared/types/` 下的所有文件都是 TS 类型定义——这是项目的"数据字典"
- 每个 Agent 的 `execute(state: DocGenState): Promise<Partial<DocGenState>>` 就是 TS 接口
- IPC 通道的类型定义在 `ipc.types.ts` 中，保证前后端通信的类型安全

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) | 📖 官方 | 前 5 章（Basic Types → Object Types）足够 |
| [TypeScript 入门教程（中文）](https://ts.xcatliu.com/) | 📖 中文电子书 | 国人写的，通俗易懂 |
| [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/) | 📖 开源书 | 深入理解 TS 的经典之作 |
| [Total TypeScript](https://www.totaltypescript.com/) | 🎬 视频+练习 | 免费入门课程质量很高 |
| B站「TypeScript 教程」 | 📺 视频 | 搜「技术胖 TypeScript」 |

---

## 1.3 软件设计基础概念（8h）

> **本节原则**：先讲通用的软件设计思想（普适的），再讲本项目的具体实现（具体的）。

### 1.3.1 前后端分离设计

#### 📌 为什么有这个设计思想？

早期的网站是这样工作的：浏览器发一个请求 → 服务器在后台把 HTML 拼好 → 返回完整的网页。这就像去餐厅吃饭，每次都要等厨师把整桌菜全做好了才端上来。如果你想换一道菜？对不起，整桌重做。

**前后端分离**把这个模式拆开了：
- **前端**只管"展示"——用户在屏幕上看到什么、点什么
- **后端**只管"数据和逻辑"——数据存哪里、怎么处理

好处是：改 UI 不用动后端，改业务逻辑不用动前端。就像餐厅把厨房（后端）和大堂（前端）分开管理，换菜单不影响服务流程，换服务员不影响菜品质量。

#### 📝 核心思想总结

```
传统模式（不分离）：           前后端分离：

浏览器 ←── 完整 HTML ──→ 服务器    浏览器 ←── JSON 数据 ──→ API 服务器
（只负责显示）  （拼HTML+查数据）     （React 渲染）  （只返回数据）

一个团队全栈负责                  前端团队 + 后端团队 独立开发
改个按钮颜色要改后端代码           改按钮颜色只需改前端
```

**前后端分离的核心要素**：

| 要素 | 说明 |
|------|------|
| **职责分离** | 前端管展示和交互，后端管数据和逻辑 |
| **API 通信** | 前后端通过 HTTP/WebSocket/IPC 等协议通信 |
| **数据契约** | 前后端约定好数据格式（JSON Schema），各自独立开发 |
| **独立部署** | 前端和后端可以分别部署、分别更新 |
| **技术无关** | 前端用 React/Vue/Angular 不影响后端用 Java/Python/Node.js |

#### 📖 本项目的具体实现

Smart Tech Writer 是 Electron 应用，它的"前后端分离"略有不同：

```
┌──────────────────────────────────────────────────────┐
│                  Smart Tech Writer                     │
│                                                        │
│  前端（Renderer Process）        后端（Main Process）    │
│  ┌─────────────────────┐       ┌──────────────────┐   │
│  │ React 19 + TS        │  IPC  │ Node.js + TS      │   │
│  │ Tailwind CSS          │ ←──→ │                    │   │
│  │ Zustand（状态管理）    │       │ AI API 调用        │   │
│  │                       │       │ SQLite 数据库      │   │
│  │ 负责：                │       │ 文件系统访问       │   │
│  │ • UI 渲染             │       │                    │   │
│  │ • 用户交互处理         │       │ 负责：             │   │
│  │ • 前端状态管理         │       │ • 业务逻辑        │   │
│  │ • 流式输出展示         │       │ • 数据处理        │   │
│  └─────────────────────┘       │ • 工作流调度       │   │
│                                  │ • 文档生成        │   │
│  Preload（contextBridge）       └──────────────────┘   │
│  ──→ 安全地暴露有限 API 给前端                         │
└──────────────────────────────────────────────────────┘
```

**本项目前后端分离的具体体现**：

1. **目录分离**：`src/renderer/`（前端）和 `src/main/`（后端）完全独立
2. **IPC 通信**：Electron 的 IPC 替代了 HTTP，但本质一样——前端发请求，后端返回数据
3. **类型共享**：`src/shared/types/` 定义了前后端共同遵守的"数据契约"
4. **安全隔离**：Renderer 不能直接访问文件系统（`fs`）和数据库，必须通过 IPC → Main Process

**为什么本项目选择前后端分离？**

- **安全**：用户界面的代码不能随意操作电脑文件系统
- **可维护**：UI 调整（改 Tailwind class）和逻辑修改（改 Agent Prompt）互不影响
- **技术栈匹配**：前端用 Web 技术（React），后端用 Node.js 原生能力
- **未来扩展**：如果以后要做 Web 版，后端 API 可以直接复用

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [前后端分离架构概述](https://www.ruanyifeng.com/blog/2014/12/restful_api.html) | 📖 阮一峰 | 中文社区经典入门 |
| [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) | 📖 官方 | Electron 特有的进程模型 |
| [Web 开发基础：前端 vs 后端](https://developer.mozilla.org/zh-CN/docs/Learn/Server-side/First_steps/Introduction) | 📖 MDN | 理解前后端各自的职责 |

---

### 1.3.2 模块化开发

#### 📌 为什么有这个设计思想？

假设你要写一本 1000 页的技术手册。你会把全部内容写在一个 Word 文档里吗？不会——你会拆成章节、小节，每个 `.docx` 只管一个主题。

写代码也是一样。把所有代码塞进一个文件 = 在 10000 行的文件里找一个函数 = 大海捞针。**模块化**就是把代码拆成"高内聚、低耦合"的小模块——每个模块管好自己的事，模块之间通过清晰的接口沟通。

#### 📝 核心思想总结

**模块化的三大黄金法则**：

| 法则 | 说明 | 类比 |
|------|------|------|
| **单一职责** | 一个模块只做一件事 | 每个章节只讲一个主题 |
| **高内聚** | 相关的代码放在一起 | 关于"文件解析"的所有逻辑在一个文件夹里 |
| **低耦合** | 模块间依赖尽可能少 | 改"PDF 解析"不影响"Word 解析" |

**模块化的好处**：

- 🔍 **可查找**：想改文件解析逻辑？直接去 `file-readers/` 文件夹
- 🔧 **可维护**：改 PDF 解析不会不小心破坏 Word 解析
- ♻️ **可复用**：`BaseAgent` 被 5 个 Agent 复用，不用写 5 遍
- 🧪 **可测试**：每个模块可以独立测试
- 👥 **可协作**：两个人可以同时改不同模块，不冲突

**模块的常见形态**：

```typescript
// 1. 函数级模块 — 一个函数做一件事
export function createReader(filePath: string): BaseReader { /* ... */ }

// 2. 类级模块 — 一个类管一个领域
export class FileParserAgent extends BaseAgent { /* ... */ }

// 3. 文件级模块 — 一个文件就是一个小模块
// src/main/modules/agents/writer.agent.ts 只负责"文档写作"逻辑

// 4. 文件夹级模块 — 多个文件组成一个大模块
// src/main/modules/workflow/ 是一个大模块，包含：
//   index.ts       — WorkflowEngine（主类）
//   pipeline.ts    — 各 Stage 执行函数
//   state-machine.ts — 状态机定义
```

#### 📖 本项目的具体实现

**本项目的模块划分逻辑**：

```
src/main/modules/
│
├── agents/              ← "谁来干活" — AI 处理单元
│   ├── base.agent.ts        ← 所有 Agent 的"模板"
│   ├── file-parser.agent.ts ← 负责：文件 → 结构化数据
│   ├── analyzer.agent.ts    ← 负责：数据 → 分析结果
│   ├── writer.agent.ts      ← 负责：分析 → 文档草稿
│   ├── reviewer.agent.ts    ← 负责：草稿 → 审查意见
│   └── localizer.agent.ts   ← 负责：文档 → 翻译版本
│
├── ai-providers/        ← "用什么工具干活" — AI API 封装
│   ├── base.provider.ts     ← Provider 接口定义
│   └── openai.provider.ts   ← OpenAI 具体实现
│
├── workflow/            ← "活怎么安排" — 流程调度
│   ├── index.ts             ← WorkflowEngine 主控制器
│   ├── pipeline.ts          ← 每个步骤怎么做
│   └── state-machine.ts     ← 步骤之间的顺序和规则
│
├── file-readers/        ← "读什么" — 输入解析
│   ├── base.reader.ts       ← Reader 接口
│   ├── pdf.reader.ts        ← PDF 解析
│   ├── word.reader.ts       ← Word 解析
│   ├── text.reader.ts       ← 纯文本解析
│   ├── code.reader.ts       ← 代码文件解析
│   ├── email.reader.ts      ← 邮件解析
│   └── index.ts             ← 工厂函数
│
├── document-builder/    ← "产出什么" — 输出生成
│   ├── docx.builder.ts      ← DOCX 生成
│   └── dita.builder.ts      ← DITA XML 生成
│
├── rag/                 ← "参考什么" — 知识检索
│   └── local-search.service.ts
│
└── storage/             ← "存哪里" — 持久化
    ├── database.ts           ← SQLite 数据库
    └── file-storage.ts       ← 文件读写
```

**模块间的"沟通规则"**：

```typescript
// ✅ 好的模块沟通 — 通过明确的 import/export
// workflow/pipeline.ts
import { FileParserAgent } from '../agents/file-parser.agent';  // 导入
const agent = new FileParserAgent(config.provider);              // 使用

// ✅ 好的模块沟通 — 通过共享类型
// shared/types/workflow.types.ts
export interface DocGenState {
  inputFiles: UploadedFile[];       // ← 来自 document.types.ts
  analysisResults: AnalysisResult[]; // ← 来自 document.types.ts
}

// ❌ 坏的模块沟通 — 直接访问其他模块的内部实现
// 不要这样做！不要 import 其他模块的内部文件
```

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [Clean Code 中文版](https://book.douban.com/subject/4199741/) | 📖 书籍 | 软件设计的经典之作 |
| [设计模式（Design Patterns）](https://refactoringguru.cn/design-patterns) | 📖 网站 | 图解设计模式，中文版 |
| [Node.js 模块系统](https://nodejs.org/api/modules.html) | 📖 官方 | 理解 import/export 的底层机制 |

---

### 1.3.3 React 组件化开发

#### 📌 为什么有这个设计思想？

传统的网页开发是这样的：一个 HTML 文件 + 一个 CSS 文件 + 一个 JS 文件。页面复杂后，这三个文件都会变成庞然大物。改一个按钮的样式，你需要：找到 HTML 里的按钮 → 找到 CSS 里对应的 class → 找到 JS 里对应的事件处理。三种代码分散在三个文件里。

**组件化**改变了这一切：把 UI 拆成独立的、可复用的"积木块"——每个组件包含自己的 HTML（结构）、CSS（样式）、JS（行为），自给自足。

#### 📝 核心思想总结

**组件化的核心理念**：UI = 组件树

```
一个页面不是一张大画布，而是一棵树：
         App
          │
    ┌─────┼─────┐
  Header  Main  Footer
          │
    ┌─────┼─────┐
  Sidebar Content
          │
    ┌─────┼─────┐
  Card1  Card2  Card3
```

**组件化的好处**：

| 好处 | 说明 |
|------|------|
| **可复用** | 同一个 `<Button>` 组件可以在全站用 100 次 |
| **可组合** | 小组件拼成大组件，大组件拼成页面 |
| **可维护** | 改一个组件只影响它自己，不影响其他 |
| **可测试** | 每个组件可以独立测试 |
| **关注点分离** | 写导航栏时只关心导航栏，不关心页面内容 |

**React 组件的三要素**：

```
┌─────────────────────────────────────────┐
│                 React 组件                │
│                                          │
│  Props（入参）    →   组件逻辑   →   JSX（出参） │
│  "父组件给我的数据"  State（内部记忆）  "我渲染的 UI"│
└─────────────────────────────────────────┘
```

```tsx
// 一个完整的 React 组件示例
function DraftViewer({ content, stage }: { content: string; stage: string }) {
  // ↑ Props：父组件传来的数据（只读！不要改）

  const [isEditing, setIsEditing] = useState(false);
  // ↑ State：组件自己的"记忆"，isEditing 初始值是 false

  // 根据 props 和 state，决定渲染什么
  return (
    <div className="p-4 bg-gray-900 rounded-lg">
      <h3>当前阶段：{stage}</h3>
      {isEditing ? (
        <textarea value={content} onChange={...} />
      ) : (
        <MarkdownRenderer content={content} />
      )}
      <button onClick={() => setIsEditing(!isEditing)}>
        {isEditing ? '预览' : '编辑'}
      </button>
    </div>
  );
}
```

> 💡 **给零基础者的解释**：React 组件就像一个**智能表格模板**。你给模板填入不同的数据（Props），它就生成不同的表格。模板里有一些"记忆"（State）——比如"当前是否在编辑模式"。当你点击"编辑"按钮，记忆改变，表格自动更新显示。

**React Hook 速查表**（本项目用到的关键 Hook）：

| Hook | 解决了什么问题 | 一句话说明 | 本项目使用场景 |
|------|--------------|-----------|--------------|
| `useState` | 组件需要"记住"一些东西 | "请帮我在这个组件里记住一个值" | 开关状态、输入框内容、选中项 |
| `useEffect` | 需要在"某个时机"做点事情 | "当 X 发生变化时，请执行这个操作" | 监听 workflow 状态变化、数据获取 |
| `useRef` | 需要一个"跨渲染周期"的变量 | "请给我一个不会触发重渲染的盒子" | 滚动容器引用、定时器 ID |
| `useMemo` | 计算很耗时，不想每次都算 | "只有依赖变了才重新算" | 过滤/排序后的列表数据 |
| `useCallback` | 函数引用变了会导致子组件重渲染 | "只有依赖变了才重新创建这个函数" | 传给子组件的回调函数 |

#### 📖 本项目的具体实现

**本项目的组件树**：

```
App.tsx
└── AppLayout.tsx
    ├── Sidebar（侧边栏导航）
    └── 主内容区（根据路由切换）
        ├── DocGeneratorTab（核心页面）
        │   ├── InputPanel              ← 文件上传区域
        │   ├── StageNavigation         ← 顶部阶段进度条
        │   ├── WorkflowProgress        ← 工作流状态指示
        │   ├── DraftViewer             ← 草稿查看（复用 4 次）
        │   ├── ReviewPanel             ← 审查面板（复用 3 次）
        │   ├── ReviewCommentsView      ← 审查意见卡片列表
        │   ├── AIStreamViewer          ← AI 实时输出展示
        │   ├── AiDraftEditor           ← AI 辅助编辑面板
        │   ├── MarkdownRenderer        ← Markdown 渲染（复用 10+ 次）
        │   ├── CollapsibleSection      ← 可折叠区域（复用 6+ 次）
        │   ├── FilePreviewModal        ← 文件预览弹窗
        │   ├── LogViewer               ← 底部日志面板
        │   └── OutputPanel             ← 导出面板
        └── SettingsTab（设置页面）
```

**组件复用的实际案例**：

```tsx
// ReviewPanel 在 3 个不同的 Stage 中被复用
// Stage 5（人工审核草稿）：
<ReviewPanel 
  drafts={state.drafts} 
  comments={state.aiReviewComments} 
  onSubmitLabel="提交审核意见 ▶"
/>

// Stage 7c（人工审查本地化）：
<ReviewPanel 
  drafts={state.localizedDrafts} 
  comments={state.localizeReviewComments} 
  onSubmitLabel="进入 DITA 生成 ▶"
/>

// Stage 8c（人工审查 DITA）：
<ReviewPanel 
  drafts={state.ditaDocuments} 
  comments={state.ditaReviewComments} 
  onSubmitLabel="确认完成，导出 DITA 文件 ▶"
/>
// 同一个组件，不同的 props，不同的表现！
```

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [React 官方教程 Quick Start](https://react.dev/learn) | 📖 官方 | 新版 React 文档，非常友好 |
| [Thinking in React](https://react.dev/learn/thinking-in-react) | 📖 官方 | 理解 React 思维模式（必读！） |
| [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/) | 📋 速查 | React + TS 的最佳实践速查 |
| [Zustand 官方文档](https://docs.pmnd.rs/zustand/getting-started/introduction) | 📖 官方 | 本项目使用的状态管理库 |

---

### 1.3.4 状态管理思想

#### 📌 为什么要学这个？

在 React 中，每个组件有自己的"记忆"（State）。但当多个组件需要共享同一个数据时（比如"当前工作流状态"），问题来了：谁来持有这个数据？怎么保证所有组件看到的是一致的？

这就是**状态管理**要解决的问题。

#### 📝 核心思想总结

```
局部状态（useState）          全局状态（Zustand Store）
┌──────────────────┐         ┌──────────────────────┐
│ 只在一个组件里用    │         │ 多个组件共享           │
│                    │         │                      │
│ <input value={text}│         │ workflowStore:       │
│  onChange={...} /> │         │   status: 'RUNNING'  │
│                    │         │   drafts: [...]      │
│ text 只有这个组件    │         │   logs: [...]        │
│ 关心，别人不关心     │         │                      │
└──────────────────┘         │ 任何组件都可以读取       │
                              │ 和修改这些数据          │
                              └──────────────────────┘
```

**本项目的状态管理方案 — Zustand**：

Zustand 是德语"状态"的意思，它是最简单的 React 状态管理库之一。不需要 Provider、不需要 action type、不需要 reducer——就是一个简单的 store。

```typescript
// workflow.store.ts — 简化示意
const useWorkflowStore = create((set) => ({
  // State（数据）
  status: 'IDLE',
  currentStage: 'upload_parse',
  drafts: [],
  logs: [],

  // Actions（修改数据的方法）
  setStatus: (status) => set({ status }),
  addLog: (entry) => set((state) => ({ logs: [...state.logs, entry] })),
  appendStreamChunk: (stage, content) => set((state) => ({ /* ... */ })),
  reset: () => set({ status: 'IDLE', drafts: [], logs: [] }),
}));

// 在任何 React 组件中使用
function WorkflowProgress() {
  const status = useWorkflowStore((s) => s.status);      // 读取
  const setStatus = useWorkflowStore((s) => s.setStatus); // 修改
}
```

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [Zustand 官方文档](https://docs.pmnd.rs/zustand/getting-started/introduction) | 📖 官方 | 10 分钟就能学会 |
| [React 状态管理对比](https://tkdodo.eu/blog/practical-react-query) | 📖 博客 | 理解不同状态管理方案的适用场景 |

---

## 1.4 项目技术栈全景速览

| 层级 | 技术 | 版本 | 用途 | 为什么选它？ |
|------|------|------|------|-------------|
| 桌面框架 | Electron | 42 | Web 技术打包为桌面应用 | 一套代码跨 Windows/Mac/Linux |
| 构建工具 | Vite | 5 | 极速开发服务器 + 打包 | 比 Webpack 快 10 倍+ |
| 打包工具 | Electron Forge | 7 | Electron 应用打包分发 | Electron 官方推荐 |
| 前端框架 | React | 19 | 构建用户界面 | 生态最大、社区最活跃 |
| 样式方案 | Tailwind CSS | 4 | 原子化 CSS | 不用写 CSS 文件，开发效率极高 |
| 编程语言 | TypeScript | 5.9 | 类型安全的 JS | 减少运行时 bug，增强代码提示 |
| AI SDK | OpenAI SDK | 6 | 调用 OpenAI 兼容 API | 官方维护，兼容性最好 |
| AI 框架 | LangChain | 1 | Agent 编排框架 | 社区标准，扩展性强 |
| 状态管理 | Zustand | 5 | 轻量级全局状态 | 比 Redux 简洁 10 倍 |
| 数据库 | better-sqlite3 | 12 | 本地 SQLite | 无需安装数据库服务，性能好 |
| 文档生成 | docx | 9 | 程序化生成 Word 文档 | 纯 JS 实现，不依赖 Office |
| Markdown | react-markdown | 10 | 渲染 Markdown 为 React 组件 | 支持 GFM、可自定义渲染器 |
| 日志 | electron-log | 5 | 结构化日志记录 | Electron 专用，支持文件输出 |
| 打包 | archiver | 8 | 文件打包为 ZIP | 批量导出功能 |
| 文件解析 | pdf-parse, mammoth, mailparser | - | PDF/Word/Email 文本提取 | 各自领域的最佳选择 |

---

# 板块二：AI — 大模型开发核心知识

> **目标**：建立完整的大模型开发知识体系，从基础概念到工程实践  
> **学时**：约 28h  
> **这是整个学习计划的核心板块，与项目 AI 能力直接对应**

---

## 2.1 LLM 基础概念（4h）

### 2.1.1 什么是大语言模型？

#### 📌 为什么需要了解这个？

如果不理解 LLM 的基本原理，你就无法理解：
- 为什么 AI 有时会"胡说八道"（Hallucination / 幻觉）
- 为什么同样的 Prompt 每次结果不一样
- 为什么不能让 AI "记住"上次的对话（除非你每次都把历史发过去）
- 为什么输入太长的文档 AI 会"忘记"开头的内容

这些不是 bug，而是 LLM 的固有特性。理解它们，才能写出好的 Prompt、诊断 AI 输出问题。

#### 📝 核心概念总结

大语言模型（LLM, Large Language Model）的本质是一个**超大规模的"下一个 Token 预测器"**。

当参数规模达到数千亿、训练数据覆盖整个互联网的文本后，这个"预测下一个字"的能力就**涌现**出了翻译、摘要、推理、编程、创意写作等高级能力——尽管它从未被显式地教过这些。

#### 📖 详细学习内容

**Token — 模型阅读的最小单位**

Token ≠ 单词 ≠ 汉字。Token 是模型内部"词汇表"中的一个条目。

| 文本类型 | Token 消耗 | 说明 |
|---------|-----------|------|
| 英文常见词 "documentation" | 1 token | 高频词被编码为单个 Token |
| 英文罕见词 "supercalifragilistic" | 4-5 tokens | 罕见词被拆成子词 |
| 中文 "技术文档" | 约 2-3 tokens | 取决于分词器 |
| 代码 "const x = await fetch()" | 约 7 tokens | 每个符号、关键字各占 Token |

**为什么 Token 很重要？**

| 影响维度 | 说明 |
|---------|------|
| **计费** | API 按 Token 收费（输入 + 输出），Token 越多越贵 |
| **Context Window 限制** | 模型一次只能"看到"有限个 Token（如 128K），超过就"忘记" |
| **中文 vs 英文成本** | 中文通常比英文消耗更多 Token |
| **输出质量** | 给 AI 的指令如果 Token 太长，可能被截断 |

> 💡 **给零基础者的解释**：Token 就像中文里的"词"（但不完全一样）。LLM 不是逐字阅读，而是把文本切成小块。就像你用 Ctrl+F 搜索是按"字"搜索，但 LLM 是按"Token"理解。一个中文句子大约 1.5-2 倍的汉字数等于 Token 数。在线工具 [OpenAI Tokenizer](https://platform.openai.com/tokenizer) 可以直观查看。

**Context Window（上下文窗口）— 模型的"短期记忆"**

你给 LLM 的所有内容（System Prompt + User Prompt + 对话历史）的 Token 总数必须 ≤ Context Window。超过则模型"忘记"最早的内容。

主流模型的 Context Window：

| 模型 | Context Window | 能容纳大约 |
|------|---------------|-----------|
| GPT-4o | 128K tokens | 约 300 页 A4 纸 |
| Claude 3.5 Sonnet | 200K tokens | 约 500 页 A4 纸 |
| Gemini 2.5 Pro | 1M tokens | 约 500 本书 |
| DeepSeek V3 | 128K tokens | 约 300 页 A4 纸 |
| Kimi | 200K+ tokens | 约 500+ 页 A4 纸 |

**Temperature（温度）— 控制"创造力"**

```
Temperature = 0    → 🎯 确定性（每次输出几乎一样）
                    适合：代码生成、数据提取、数学计算

Temperature = 0.3~0.5 → 📝 适度创造性
                        适合：技术文档、翻译、摘要

Temperature = 0.7~0.9 → 🎨 较高创造性
                        适合：创意写作、头脑风暴

Temperature = 1.0+ → 🤪 高度随机
                     适合：几乎没有实用场景
```

**其他关键参数**：

| 参数 | 作用 | 典型值 |
|------|------|--------|
| **Top-P** | 核采样：只从概率累计到 P 的 Token 中选 | 0.9-1.0 |
| **max_tokens** | 限制输出最大 Token 数 | 按任务设定 |
| **frequency_penalty** | 惩罚重复 Token（降低重复率） | 0.0-0.5 |
| **presence_penalty** | 惩罚已出现过的 Token（鼓励新话题） | 0.0-0.5 |
| **stop** | 指定停止词，AI 输出到此即停 | `["\n\n", "###"]` |

**Hallucination（幻觉）— AI 的"自信编造"**

LLM 本质是"预测下一个 Token"，不是"检索知识库"。当训练数据中没有相关信息时，模型会"猜测"——而且非常自信。这种"猜测"语法通顺但内容虚构。

防范措施：给 AI 充分上下文（RAG）、Human-in-the-loop 审查、降低 Temperature、Prompt 中要求"不知道就说不知道"。

#### 🔗 与本项目的关联

- `BaseAgent.callLLM()` 中 `temperature` 默认为 0.7（适合写作任务）
- `ReviewerAgent` 应使用更低的 Temperature（审查需要确定性）
- Context Window 决定每个 Agent 能接收的最大输入长度
- Hallucination 是本项目部署 AI 审查 Agent 的核心原因

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [Andrej Karpathy - Intro to LLMs](https://www.youtube.com/watch?v=zjkBMFhNj_g) | 🎬 视频 | OpenAI 联合创始人，1h 讲透 |
| [3Blue1Brown - 神经网络](https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi) | 🎬 系列 | 最直观的可视化讲解 |
| [OpenAI Tokenizer](https://platform.openai.com/tokenizer) | 🛠️ 工具 | 在线查看任意文本的 Token 数 |
| [LLM Visualization](https://bbycroft.net/llm) | 🖼️ 交互 | 3D 可视化 LLM 内部结构 |
| [The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) | 📖 图解 | 最经典的 Transformer 图解 |
| [What Is ChatGPT Doing...and Why Does It Work?](https://writings.stephenwolfram.com/2023/02/what-is-chatgpt-doing-and-why-does-it-work/) | 📖 长文 | Stephen Wolfram 的通俗解释 |

---

## 2.2 主流模型介绍与对比（4h）

#### 📌 为什么需要了解这个？

不同模型有不同的"性格"和"特长"：有的擅长中文（Qwen、DeepSeek），有的擅长英文写作（Claude、GPT-4o），有的擅长长文档（Claude 200K、Kimi），有的性价比极高（DeepSeek V3）。为本项目选对模型，直接影响文档质量和 API 成本。

### 2.2.1 国际主流模型

#### OpenAI — GPT 系列

| 模型 | 发布时间 | Context | 定位 | 输入/输出价格(每百万Token) |
|------|---------|---------|------|--------------------------|
| **GPT-4o** | 2024.05 | 128K | 旗舰多模态 | $2.50 / $10 |
| **GPT-4 Turbo** | 2023.11 | 128K | 上一代旗舰 | $10 / $30 |
| **o1** | 2024.09 | 200K | 推理模型 | $15 / $60 |
| **o3** | 2025.01 | 200K | 新一代推理 | 更贵 |
| **GPT-4o-mini** | 2024.07 | 128K | 轻量快速 | $0.15 / $0.60 |

**特点**：综合能力最强、生态最成熟、API 文档最完善、GPT-4o 在各维度均衡、o1/o3 引入"深度思考"机制但速度慢。

#### Anthropic — Claude 系列

| 模型 | Context | 定位 | 最佳场景 |
|------|---------|------|---------|
| **Claude Opus** | 200K | 最强能力 | 复杂分析、长篇写作 |
| **Claude Sonnet** | 200K | 平衡型 | 日常开发、技术文档（**适合本项目**） |
| **Claude Haiku** | 200K | 快速轻量 | 实时交互、简单问答 |

**特点**：写作质量业界口碑最好（尤其英文）、200K Context Window 标配、Constitutional AI 训练方式安全性高。

#### Google — Gemini 系列

| 模型 | Context | 定位 | 特点 |
|------|---------|------|------|
| **Gemini 2.5 Pro** | 1M | 旗舰 | 超大 Context，多模态领先 |
| **Gemini 2.5 Flash** | 1M | 快速 | 性价比极高 |

### 2.2.2 国产主流模型

| 模型家族 | 代表模型 | 公司 | 特点 | API 兼容 |
|---------|---------|------|------|---------|
| **DeepSeek** | V3, R1 | 深度求索 | 开源、性价比极高（GPT-4o 的 1/50 价格）、推理强 | ✅ 兼容 OpenAI |
| **Qwen** | Qwen3-Max | 阿里巴巴 | 中文理解优秀、多模态、企业级 | ✅ 兼容 OpenAI |
| **GLM** | GLM-4, GLM-4V | 智谱 AI | 中文生态完善、企业定制 | ✅ 部分兼容 |
| **Kimi** | Kimi | 月之暗面 | 超长上下文（200K+） | ✅ 兼容 OpenAI |
| **豆包** | Doubao | 字节跳动 | 性价比高、多模态 | ✅ 兼容 OpenAI |
| **文心一言** | ERNIE 4.5 | 百度 | 中文理解深度好 | ⚠️ 自有 API |

### 2.2.3 模型选型决策框架

```
为 Smart Tech Writer 选模型 →

├── 英文技术文档写作？
│   ├── 质量优先 → Claude Sonnet / GPT-4o
│   └── 成本优先 → DeepSeek V3 / GPT-4o-mini
│
├── 中文技术文档写作？
│   ├── 质量优先 → Qwen-Max / DeepSeek V3
│   └── 成本优先 → DeepSeek V3
│
├── 需要审查/推理/逻辑验证？
│   ├── 最强推理 → o3 / DeepSeek R1
│   └── 够用就行 → GPT-4o
│
├── 处理超长文档（200页+）？
│   ├── 最强 → Claude（200K）/ Gemini（1M）
│   └── 中文 → Kimi（200K+）
│
├── 预算控制？
│   ├── 极致省钱 → DeepSeek V3
│   └── 高性价比 → GPT-4o-mini
│
└── 数据安全（不能上云）？
    └── 自部署 → DeepSeek（开源）/ Qwen（开源）
```

### 2.2.4 OpenAI API 兼容性

本项目通过 `baseURL` 参数实现模型切换，写一次代码可调任何 OpenAI 兼容的 API：

```typescript
// 切换模型只需改 2 个配置项！
// GPT-4o
new OpenAI({ apiKey: 'sk-xxx', baseURL: 'https://api.openai.com/v1' })
// DeepSeek V3
new OpenAI({ apiKey: 'sk-xxx', baseURL: 'https://api.deepseek.com/v1' })
// Qwen
new OpenAI({ apiKey: 'sk-xxx', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' })
// 通通一样的调用方式，不需要改代码！
```

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [OpenAI 模型文档](https://platform.openai.com/docs/models) | 📖 官方 | GPT 系列能力对比 |
| [Anthropic 模型文档](https://docs.anthropic.com/en/docs/about-claude/models) | 📖 官方 | Claude 系列能力对比 |
| [DeepSeek API 文档](https://platform.deepseek.com/api-docs/) | 📖 官方 | DeepSeek 接入指南 |
| [通义千问 API 文档](https://help.aliyun.com/zh/model-studio/) | 📖 官方 | Qwen 接入指南 |
| [Artificial Analysis](https://artificialanalysis.ai/) | 🛠️ 工具 | 独立模型评测（速度、价格、质量） |
| [LMSYS Chatbot Arena](https://chat.lmsys.org/) | 🛠️ 工具 | 社区驱动的模型盲测排行榜 |
| [OpenRouter](https://openrouter.ai/) | 🛠️ 工具 | 统一 API 接入 200+ 模型 |

---

## 2.3 Prompt Engineering（5h）⭐ 核心

#### 📌 为什么这是 Tech Writer 的核心竞争力？

AI 不是魔法——它需要精确的指令才能产出你想要的文档。**写代码的人不一定会写 Prompt，会写 Prompt 的人不一定会写代码。** Tech Writer 在语言表达、受众分析、结构组织上的专业能力，恰恰是 Prompt Engineering 最需要的。

本项目 5 个 Agent 各有一套 System Prompt。这些 Prompt 的质量直接决定了 AI 生成的文档质量。**改 Prompt 不需要写代码，但能产生巨大影响**——这是 Tech Writer 最快的价值切入点。

#### 📝 Prompt Engineering 的定义

> Prompt Engineering 是**通过设计和优化输入给 LLM 的文本指令，来控制其输出质量和格式**的工程实践。

它不是"随便问 AI 一个问题"，而是一套有方法论、可迭代、可评估的系统工程。

#### 📖 详细学习内容

**Prompt 的五要素结构（CRISP 框架）**：

| 要素 | 英文 | 含义 | 示例 |
|------|------|------|------|
| **C**ontext | 背景 | 给 AI 提供它不知道的上下文信息 | "你需要基于以下技术规范生成文档..." |
| **R**ole | 角色 | 定义 AI 的身份和专业领域 | "你是一个有 10 年经验的嵌入式系统文档工程师" |
| **I**nstruction | 指令 | 明确的任务描述 | "1.提取核心概念 2.编写 API 参考 3.添加代码示例" |
| **S**tyle | 格式 | 输出的格式和结构要求 | "使用 Markdown 格式，按 ## 标题组织" |
| **P**arameters | 约束 | 字数、风格、禁止事项等限制 | "字数 2000 以内，不要使用第一人称，代码必须可运行" |

> 记忆技巧：**CRISP** — 一个好的 Prompt 像清脆的薯片，干净利落、层次分明。

**Prompt 技术工具箱**：

| 技术 | 说明 | 使用场景 | 示例 |
|------|------|---------|------|
| **Zero-shot** | 不给例子，直接下指令 | AI 已经充分理解的任务 | "翻译成中文" |
| **Few-shot** | 给 1-3 个范例 | 需要特定格式/风格时 | "例：Input→Output。现在请..." |
| **Chain-of-Thought** | 要求 AI 展示推理步骤 | 复杂推理、多步分析 | "先分析要点→列出大纲→写正文" |
| **Role Prompting** | 赋予 AI 专业身份 | 需要领域专业知识 | "你是资深芯片文档工程师" |
| **Structured Output** | 要求返回 JSON/XML | 需要程序化处理输出 | "请用以下 JSON Schema 返回" |
| **Self-Critique** | 让 AI 审查自己的输出 | 需要高质量保证 | "检查你写的内容，纠正事实错误" |
| **Negative Prompting** | 告诉 AI "不要做什么" | 避免常见错误 | "不要使用缩写、不要省略步骤" |
| **Step-by-Step** | 拆解复杂任务为多个步骤 | 复杂文档生成 | "Step 1: 分析输入 Step 2: 构建大纲..." |

**Prompt 调试循环**：

```
写 Prompt → 跑一次 → 看输出质量 → 分析问题 → 改 Prompt → 再跑
    ↑                                                       │
    └───────────────────────────────────────────────────────┘

每次迭代只改一个变量，观察效果变化
（如果同时改 3 个地方，你不知道哪个改动起效了）
```

**常见问题诊断与修复**：

| 症状 | 可能原因 | 解决方法 |
|------|---------|---------|
| 输出太通用/空洞 | System Prompt 缺少具体角色和约束 | 加上领域角色、细化任务描述 |
| AI 不按格式输出 | 格式指令不够明确 | 用 Few-shot 给范例、强调"必须遵守" |
| AI 编造事实（幻觉） | 上下文信息不足或缺少约束 | 给更多原始资料、降低 Temperature、加"不知道就说不知道" |
| 输出过长/过短 | 字数约束不明确 | 给出具体字数范围（不是"尽量简洁"而是"500字以内"）|
| 输出被截断 | max_tokens 太小 | 增大 max_tokens 限制 |
| AI 拒绝执行 | 触发安全策略 | 调整措辞，避免敏感词组合 |
| 输出语言不对 | 没有明确指定语言 | System Prompt 中明确"请使用简体中文回复" |

**本项目 Prompt 实战分析**：

```typescript
// 本项目中的 Prompt 调用模式
// BaseAgent.callLLM() 统一处理
const messages = [
  { role: 'system', content: this.systemPrompt },  // ← Tech Writer 修改这里！
  { role: 'user',   content: userPrompt },          // ← 由代码动态构建
];

// WriterAgent 的 System Prompt 结构（示意）：
// [CRISP 框架]
// Context:  "你正在为一个嵌入式技术文档项目撰写文档..."
// Role:     "你是一个资深技术文档工程师，擅长将复杂的技术概念..."
// Instruction: "基于提供的分析结果，撰写一篇完整的技术文档..."
// Style:    "使用 Markdown 格式，结构如下：## 概述\n## 技术细节\n..."
// Parameters: "字数控制在 2000-3000 字，代码示例必须完整可运行..."
```

#### 🔗 与本项目的关联

- 每个 Agent 的 `systemPrompt` 就是 Tech Writer 发挥价值的**主战场**
- 修改 System Prompt 不需要改 TypeScript 代码，只需改字符串
- 项目当前有 5 个 Agent，每个都有独立的 System Prompt
- 审查 Agent 的 Prompt 尤其需要精心设计（需要 AI 输出结构化 JSON）

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [OpenAI Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering) | 📖 官方 | **必读**，6 种核心策略 |
| [Anthropic Prompt Library](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview) | 📖 官方 | Claude 风格的 Prompt 指南 |
| [Prompt Engineering Guide (DAIR.AI)](https://www.promptingguide.ai/zh) | 📖 开源 | 最全面的中文 Prompt 工程指南 |
| [Google AI - Prompt Design](https://ai.google.dev/gemini-api/docs/prompting-strategies) | 📖 官方 | Google 的 Prompt 设计策略 |
| [Learn Prompting](https://learnprompting.org/zh-Hans/) | 📖 课程 | 免费的 Prompt Engineering 课程（中文版） |
| [Lilian Weng - Prompt Engineering](https://lilianweng.github.io/posts/2023-03-15-prompt-engineering/) | 📖 博客 | OpenAI 研究员的深度文章 |
| [Brev.dev - Prompt Engineering Guide](https://www.promptingguide.ai/) | 📖 网站 | 社区维护的 Prompt 工程技术大全 |

---

## 2.4 Context Engineering（2.5h）

#### 📌 为什么需要了解这个？

如果说 Prompt Engineering 是"写好一个问题"，那么 **Context Engineering 是"设计好 AI 看到的整个信息环境"**。

当你给 AI 输入的信息本身就很混乱时，再好的 Prompt 也无济于事。Context Engineering 关注的是：**如何为 AI 构建最有效的上下文信息**——给什么信息、以什么顺序给、去掉什么冗余。

#### 📝 核心概念总结

```
Context Engineering 的层次：
Level 1 — 信息选择：给 AI 什么信息？哪些是必要的？哪些是噪音？
Level 2 — 信息组织：信息的顺序是什么？最重要的先给还是最后给？
Level 3 — 信息压缩：长文档怎么精简？怎么保留关键信息？
Level 4 — 动态注入：怎么根据任务动态地从知识库检索并注入信息？
Level 5 — 上下文生命周期：多轮对话中怎么管理上下文的增长？
```

#### 📖 详细学习内容

**核心策略一览**：

| 策略 | 说明 | 本项目中的实现 |
|------|------|--------------|
| **Context Window 管理** | 不超 Token 限制，优先保留重要信息 | 每个 Agent 裁剪输入到合理长度 |
| **动态上下文注入** | 根据当前任务选择性地注入信息 | RAG → 注入相关参考文档 |
| **分层上下文** | System（固定角色）+ User（动态任务）+ RAG（按需资料） | `callLLM()` 的 messages 数组 |
| **上下文压缩** | 对长内容先摘要再传入下一个 Agent | AnalyzerAgent 提取要点 → WriterAgent |
| **Lost-in-the-Middle 应对** | LLM 对中间位置的信息关注度最低 | 关键信息放开头或结尾 |
| **信息去重** | 去掉重复的、冗余的内容 | 合并多份参考文档的重复段落 |

**Lost-in-the-Middle 现象**（重要！）：

研究表明，LLM 对 Prompt 中**开头和结尾**的内容关注度最高，**中间位置**的内容容易被忽略。因此：
- 最重要的指令放开头或结尾
- 参考文档的摘要放开头，完整内容放末尾
- 不要把所有东西堆在 Prompt 的中间部分

**本项目的 Context Flow**：

```
原始文件（可能几万字、Token 爆满）
    │
    ▼
FileParserAgent ──→ 提取结构化数据（缩短约 80%）
    │                 去除了格式噪音，保留核心内容
    ▼
AnalyzerAgent ──→ 提取技术要点 + 关键词（再缩短约 50%）
    │              从结构化数据中提炼精华
    ▼
RAG Search ──→ 找到相关参考文档（动态注入）
    │            根据分析结果搜索本地知识库
    ▼
WriterAgent ──→ 基于分析结果 + 参考文档 → 撰写草稿
                 此时输入的 Token 量已经大幅压缩
```

**为什么每一步都要压缩？**
1. 减少 Token 消耗（省钱）
2. 提高 AI 理解精度（去除噪音）
3. 避免 Context Window 溢出
4. 为后续阶段留出 Context 空间

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [Lost in the Middle (论文解读)](https://arxiv.org/abs/2307.03172) | 📖 论文 | 揭示 LLM 对中间信息关注度低的经典研究 |
| [Anthropic - Context Engineering](https://www.anthropic.com/engineering/prompt-engineering-at-anthropic) | 📖 博客 | Anthropic 的 Prompt/Context 工程实践 |
| [LangChain - Context Management](https://docs.langchain.com/docs/modules/memory/) | 📖 文档 | LangChain 中的上下文管理策略 |

---

## 2.5 OpenAI API 编程实战（3.5h）

#### 📌 为什么需要学这个？

理解 API 的调用方式，你才能理解项目中的 `OpenAIProvider` 在做什么、为什么 AI 的输出能"实时显示"而不是"等 10 秒后一次性出现"、以及如何测试你修改的 Prompt。

#### 📖 详细学习内容

**Chat Completions API — 核心接口**：

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // baseURL: 'https://api.deepseek.com/v1',  // 切换到 DeepSeek
});

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: '你是资深技术文档工程师。' },
    { role: 'user', content: '请解释 ESP32 的 PWM 外设。' },
  ],
  temperature: 0.7,
  max_tokens: 2000,
});

console.log(response.choices[0].message.content);
// 输出：AI 生成的完整回复（一次性返回）
```

**API 参数详解**：

| 参数 | 必填 | 说明 | 本项目默认值 |
|------|------|------|-------------|
| `model` | ✅ | 模型名称 | `gpt-4o`（可通过设置修改） |
| `messages` | ✅ | 消息数组（System + User + Assistant 历史） | 2 条（system + user） |
| `temperature` | ❌ | 随机性 0-2 | 0.7 |
| `max_tokens` | ❌ | 输出 Token 上限 | 不设（模型默认） |
| `top_p` | ❌ | 核采样 | 未使用 |
| `frequency_penalty` | ❌ | 重复惩罚 -2.0~2.0 | 未使用 |
| `presence_penalty` | ❌ | 新话题鼓励 -2.0~2.0 | 未使用 |
| `stop` | ❌ | 停止词 | 未使用 |
| `stream` | ❌ | 是否流式输出 | `false`（普通模式） |

**Messages 的四种角色**：

```typescript
const messages = [
  { role: 'system',    content: '你是技术文档专家。' },                      // 系统级指令
  { role: 'user',      content: '请解释什么是 PWM。' },                      // 用户问题
  { role: 'assistant', content: 'PWM 是脉冲宽度调制...' },                   // AI 之前的回答
  { role: 'user',      content: '能否给出一个 ESP32 上的代码示例？' },        // 用户的追问
  // assistant 的历史消息用于"多轮对话"——本项目目前是单轮，后续可扩展
];
```

**Streaming — 流式输出（本项目大量使用）**：

```typescript
const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: '写一篇 2000 字的 ESP32 文档' }],
  stream: true,  // ← 关键开关
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) {
    process.stdout.write(content);  // 逐字输出，像打字机
  }
}
```

**Streaming 的优势**：

| 优势 | 说明 |
|------|------|
| **用户体验** | 不需要等 10 秒，立刻看到 AI "正在打字" |
| **首字延迟低** | 第一个 Token 通常在几百毫秒内返回 |
| **可中断** | 用户可以在中途取消（如果输出走偏了） |
| **进度感** | 用户知道 AI 在工作，不会以为程序卡死了 |

**Embeddings API — 文本转向量**：

```typescript
const response = await client.embeddings.create({
  model: 'text-embedding-3-small',  // 或 text-embedding-3-large
  input: 'ESP32 是一款低功耗物联网芯片',
});

const vector = response.data[0].embedding;
// vector 是一个 1536 维的浮点数组：
// [0.012, -0.034, 0.089, ...]
// 语义相似的文本 → 向量在空间中靠近 → 可用于语义搜索
```

> 本项目当前未使用 Embeddings（使用关键词搜索），但这是后续升级为语义 RAG 的基础。

#### 🔗 与本项目的关联

对照 `openai.provider.ts` 的源码理解 API 封装方式：
```typescript
// 本项目封装好的调用 — 和上面原始 API 调用的结构一一对应
async complete(messages, options) {
  const response = await this.client.chat.completions.create({
    model: options?.model ?? this.defaultModel,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens,
  });
  return response.choices[0]?.message?.content ?? '';
}
```

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [OpenAI API 官方文档](https://platform.openai.com/docs/api-reference) | 📖 官方 | Chat Completions 的完整参数说明 |
| [OpenAI Cookbook](https://cookbook.openai.com/) | 📖 官方 | 大量实战代码示例 |
| [OpenAI Node.js SDK](https://github.com/openai/openai-node) | 📖 GitHub | SDK 源码和示例 |
| [OpenAI Playground](https://platform.openai.com/playground) | 🛠️ 工具 | 在线测试 Prompt（不用写代码） |

---

## 2.6 RAG（检索增强生成）（2.5h）

#### 📌 为什么需要了解这个？

LLM 的知识有截止日期，也不了解你的本地文件。RAG 解决的核心问题：**让 AI 基于你提供的真实资料来回答，而不是凭"记忆"编造**。

```
传统 LLM：问 → AI 凭训练数据回答（可能过时/编造）
RAG：问 → 检索相关文档 → "这是相关资料，请基于此回答" → AI 回答
```

#### 📝 核心概念总结

RAG 三步走：
1. **Retrieval（检索）**：从知识库找到与问题相关的文档片段
2. **Augmentation（增强）**：把检索到的内容注入到 Prompt 中
3. **Generation（生成）**：LLM 基于增强后的 Prompt 生成回答

#### 📖 详细学习内容

**RAG 的核心组件**：

| 组件 | 作用 | 常见技术选型 |
|------|------|-------------|
| **文档解析** | PDF/Word/网页 → 纯文本 | pdf-parse, mammoth（本项目已用） |
| **文本分块 (Chunking)** | 长文档切小段 | 固定大小切分(~500 tokens)、递归切分、语义切分 |
| **向量化 (Embedding)** | 文本块 → 向量 | text-embedding-3-small, bge-large-zh |
| **向量数据库** | 存储和搜索向量 | Chroma, Milvus, Pinecone, pgvector |
| **检索策略** | 怎么找到最相关的内容 | 关键词匹配、语义相似度、混合搜索 |
| **重排序 (Re-ranking)** | 对初检结果精排 | Cohere Rerank, bge-reranker-v2 |

**Chunking 策略对比**：

| 策略 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| **固定大小** | 每 500 Token 切一刀 | 简单、快速 | 可能把一句话切成两半 |
| **递归切分** | 先按段落→句子→词逐级切 | 保持语义完整性 | 复杂度更高 |
| **语义切分** | 用 Embedding 判断语义边界 | 最准确 | 需要额外 API 调用 |
| **文档结构切分** | 按 Markdown 标题/章节切 | 最适合技术文档 | 需要文档有清晰结构 |

**本项目的 RAG 实现**：

当前使用的是**简化版关键词搜索 RAG**：

```typescript
// LocalSearchService — 基于关键词的本地文件搜索
async search(query: string): Promise<SearchResult[]> {
  const keywords = query.toLowerCase()
    .split(/\s+/)           // 按空格拆分
    .filter(k => k.length > 2);  // 去掉太短的关键词
  
  // 遍历目录
  for (const file of walkDirectory(searchDir)) {
    const content = readFile(file);
    // 匹配关键词，计算相关性分数
    const score = keywords.filter(kw => content.includes(kw)).length;
    if (score > 0) results.push({ file, score });
  }
  
  // 按分数排序，返回 Top-N
  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}
```

**为什么是简化版？**
- 关键词搜索对于"找包含特定技术术语的文档"已经足够好用
- 嵌入模型需要额外 API 调用（增加成本和时间）
- 后续可升级为混合搜索（关键词 + 语义）

**RAG 进阶概念速览**：

| 技术 | 说明 |
|------|------|
| **HyDE** | 先让 LLM 生成假设答案，再用答案去检索（提高召回率） |
| **Self-RAG** | LLM 自己判断检索内容是否相关，不相关再搜 |
| **Graph RAG** | 用知识图谱组织文档间关系 |
| **Agentic RAG** | Agent 自主决定何时检索、检索什么 |

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [LangChain RAG 教程](https://python.langchain.com/docs/tutorials/rag/) | 📖 官方 | RAG 从零构建教程 |
| [Retrieval Augmented Generation (论文)](https://arxiv.org/abs/2005.11401) | 📖 论文 | RAG 原始论文 |
| [Advanced RAG Techniques](https://www.rungalileo.io/blog/mastering-rag-advanced-rag-techniques) | 📖 博客 | 进阶 RAG 技术全景 |
| [Chroma 向量数据库](https://www.trychroma.com/) | 🛠️ 工具 | 最易用的开源向量数据库 |
| [Voyage AI Embeddings](https://www.voyageai.com/) | 🛠️ 工具 | 专为 RAG 优化的 Embedding 模型 |

---

## 2.7 Agent 设计与实现（3h）

#### 📌 为什么需要了解这个？

普通 LLM 调用是"一问一答"。但复杂任务（如"生成一份完整的技术文档"）需要多个步骤、多种能力协作。Agent 就是**把 LLM 从一个"问答机器"升级为一个"能自主规划、执行多步任务的工作者"**。

#### 📝 核心概念总结

> Agent = LLM（大脑）+ Tools（工具）+ Planning（规划）+ Memory（记忆）+ Loop（循环）

```
普通 LLM 调用：    User → LLM → Response（一次完成）
AI Agent：         Goal → Plan → Execute(Tool Call) → Observe → Reflect → Re-plan → ... → Done
```

#### 📖 详细学习内容

**Agent 设计模式对比**：

| 模式 | 流程 | 适用场景 | 优点 | 缺点 |
|------|------|---------|------|------|
| **ReAct** | Think → Act → Observe 循环 | 需要多步推理+工具调用 | 灵活、可解释 | 可能无限循环 |
| **Plan-Execute** | 先 Plan → 再 Execute | 复杂可分解任务 | 规划清晰 | 计划可能不准确 |
| **Tool-use** | LLM 选择并调用工具 | 需访问外部系统 | 可扩展性强 | 依赖工具质量 |
| **Multi-Agent** | 多个 Agent 分工协作 | 需不同专业能力 | 专业分工明确 | 协调复杂 |
| **Human-in-the-loop** | 关键步骤等人类确认 | 需质量保证 | 安全可控 | 降低效率 |

**本项目的 Agent 实现**：

采用 **Multi-Agent + Human-in-the-loop** 混合模式：

```
BaseAgent（抽象基类 — 定义统一接口）
├── 统一接口：systemPrompt + execute(state)
├── 统一 LLM 调用：callLLM(userPrompt, model?)
├── 流式回调：setStreamCallback(cb)
│
├── FileParserAgent   → 职责：文件内容 → 结构化 JSON
├── AnalyzerAgent     → 职责：结构数据 → 技术分析
├── WriterAgent       → 职责：分析结果 → 文档草稿
├── ReviewerAgent     → 职责：文档草稿 → 审查意见
└── LocalizerAgent    → 职责：文档草稿 → 本地化版本
```

**Agent 间的数据流动**：

```
FileParserAgent.execute(state) → 返回 { inputFiles: [...] }
    ↓
AnalyzerAgent.execute(state) → 返回 { analysisResults: [...] }
    ↓
RAG Service → 返回 { referenceSearchResults: [...] }
    ↓
WriterAgent.execute(state) → 返回 { drafts: [...] }
    ↓
ReviewerAgent.execute(state) → 返回 { aiReviewComments: [...] }
    ↓
[人工审核 — Human-in-the-loop]
    ↓
后续 Agent 继续...
```

**为什么每个 Agent 返回 Partial<DocGenState>？**

```typescript
// 每个 Agent 只修改 DocGenState 中自己负责的部分
// FileParserAgent 只改 inputFiles：
{ inputFiles: updatedFiles }

// WriterAgent 只改 drafts：
{ drafts: newDrafts }

// ReviewerAgent 只改 aiReviewComments：
{ aiReviewComments: comments }

// WorkflowEngine 负责把每次的 Partial 合并到完整 State 中
Object.assign(state, partialResult);
```

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents) | 📖 博客 | **必读**，Anthropic 的 Agent 设计哲学 |
| [LLM Powered Autonomous Agents (Lilian Weng)](https://lilianweng.github.io/posts/2023-06-23-agent/) | 📖 博客 | OpenAI 研究员写的 Agent 综述 |
| [LangGraph 文档](https://langchain-ai.github.io/langgraph/) | 📖 官方 | 本项目使用的 Agent 编排框架 |
| [ReAct Paper](https://arxiv.org/abs/2210.03629) | 📖 论文 | ReAct 模式的原始论文 |
| [CrewAI](https://docs.crewai.com/) | 🛠️ 框架 | Multi-Agent 框架参考 |

---

## 2.8 MCP — Model Context Protocol（1.5h）

#### 📌 为什么需要了解这个？

MCP 是 2024 年底 Anthropic 推出的一种**开放协议**，目的是让 AI 应用与外部工具/数据源的集成变得像"USB 接口"一样标准化——只要遵循 MCP 协议，任何工具都可以被任何 AI 应用调用。

```
传统的工具集成（N×M 问题）：
N 个 AI 应用 × M 个工具 = N×M 种集成方式

MCP 方案（N+M 问题）：
N 个 AI 应用 → 统一 MCP 协议 ← M 个 MCP Server
只需 N+M 种集成方式
```

#### 📖 详细学习内容

**MCP 架构**：

```
┌─────────────────────────────────────────┐
│              MCP 架构                     │
│                                          │
│  ┌──────────┐         ┌──────────────┐  │
│  │ AI 应用   │ ←─────→ │ MCP Client    │  │
│  │(Claude/   │  标准化  │ (协议客户端)   │  │
│  │ Copilot/  │  通信    └──────┬───────┘  │
│  │ 本项目)   │                 │          │
│  └──────────┘          ┌──────┼──────┐   │
│                        │      │      │   │
│                   ┌────▼──┐ ┌▼────┐ ┌▼──┐│
│                   │MCP    │ │MCP  │ │MCP ││
│                   │Server │ │Server│ │Svr││
│                   │文件系统│ │数据库│ │搜索││
│                   └───────┘ └─────┘ └───┘│
└─────────────────────────────────────────┘
```

**MCP 三大概念**：

| 概念 | 说明 | 类比 |
|------|------|------|
| **Resources** | Server 暴露的**数据**（文件内容、数据库记录、API响应） | "USB 设备里存储的文件" |
| **Tools** | Server 暴露的**可执行操作**（创建文件、查询数据库、发邮件） | "USB 设备的功能按钮" |
| **Prompts** | Server 提供的**预定义 Prompt 模板** | "USB 设备附带的使用说明书" |

**MCP 对本项目的意义**：

当前项目直接调用 OpenAI API，功能相对封闭。引入 MCP 后：
- AI 可以直接**读取用户指定的文件夹**来搜索参考资料（而不只是配置的 RAG 目录）
- AI 可以**查询外部 API**（如 Confluence、SharePoint）获取最新文档
- 用户可以通过标准化的方式**扩展项目功能**（安装新的 MCP Server）

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [MCP 官方文档](https://modelcontextprotocol.io/) | 📖 官方 | 协议规范、快速入门 |
| [MCP GitHub](https://github.com/modelcontextprotocol) | 📖 GitHub | 官方 Server 和 SDK |
| [Anthropic MCP 介绍](https://www.anthropic.com/news/model-context-protocol) | 📖 博客 | MCP 的设计背景和动机 |
| [MCP Server 市场](https://github.com/modelcontextprotocol/servers) | 🛠️ 索引 | 社区开发的 MCP Server 合集 |

---

## 2.9 Skill 系统（1h）

#### 📌 为什么需要了解这个？

在 AI 编程助手（如 GitHub Copilot）的语境下，**Skill** 是一个预定义的专业能力包——告诉 AI "遇到某种类型的任务时，应该怎么思考、用什么工具、遵循什么流程"。

| 概念 | 粒度 | 示例 |
|------|------|------|
| **Tool** | 原子操作 | `read_file()`, `search_code()` |
| **Agent** | 自主决策实体 | "FileParserAgent 负责解析文件" |
| **Skill** | 知识 + 流程模板 + 工具权限 | "遇到 Python 代码问题，按这个分析方法排查" |

**对本项目的启发**：可以设计文档类型 Skill 系统——"API 文档 Skill"、"用户指南 Skill"、"故障排除 Skill"——每个 Skill 包含专属 System Prompt + 输出模板 + 质量检查清单。Tech Writer 可创建和分享 Skill，无需改代码。

---

## 2.10 Loop Engineering（2h）

#### 📌 为什么需要了解这个？

**Loop（循环）** 是 Agent 系统的核心运行机制。如果 Prompt Engineering 解决"一次交互的质量"，Context Engineering 解决"信息环境的组织"，那么 **Loop Engineering 解决的是"多步任务怎么串联、怎么控制、怎么纠错"**。

#### 📝 三大 Engineering 对比

| 维度 | Prompt Engineering | Context Engineering | Loop Engineering |
|------|-------------------|-------------------|-----------------|
| **关注点** | 单个 Prompt 措辞 | 上下文构建和传递 | Agent 决策执行流程 |
| **层次** | 战术层 | 战役层 | 战略层 |
| **产出** | System Prompt 文本 | RAG 策略、压缩方案 | 工作流、状态机、纠错逻辑 |
| **举例** | "你是技术文档专家" | 动态注入相关文档 | ReAct 循环、Plan-Execute |

#### 📖 Agentic Loop 核心循环

```
┌─────────────────────────────────────────────┐
│              Agentic Loop                    │
│                                              │
│   ┌──────────┐                               │
│   │  PLAN    │  分析目标，制定计划             │
│   └────┬─────┘                               │
│        ▼                                      │
│   ┌──────────┐                               │
│   │  ACT     │  执行一个具体步骤               │
│   └────┬─────┘                               │
│        ▼                                      │
│   ┌──────────┐                               │
│   │ OBSERVE  │  观察执行结果                   │
│   └────┬─────┘                               │
│        ▼                                      │
│   ┌──────────┐      ┌─────────────┐          │
│   │ REFLECT  │ ──→  │ 目标达成？   │──是──→ 结束│
│   └──────────┘      └─────┬───────┘          │
│        │                  │ 否                │
│        └──────────────────┘                   │
│            调整计划，回到 PLAN                  │
└─────────────────────────────────────────────┘
```

**Loop Engineering 核心设计维度**：

| 设计维度 | 说明 | 本项目实现 |
|---------|------|-----------|
| **终止条件** | 什么情况下停止？ | 所有 Stage 执行完 → COMPLETED |
| **最大步数** | 防止无限循环 | 20 个固定 Stage |
| **错误恢复** | 失败后怎么处理？ | FAILED + goBackToStage() |
| **人工介入点** | 何时等人类确认？ | 7 个 PAUSE_STAGES |
| **状态追踪** | 每步做了什么？ | WorkflowLogEntry + LogViewer |

**本项目为什么用固定流水线？** 文档生成是确定性任务，不需要 Agent 自由探索。固定流水线更可控、可预测、可审计。每个步骤有明确的输入输出契约。

#### 📚 推荐资源

| 资源 | 类型 | 说明 |
|------|------|------|
| [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents) | 📖 博客 | Agent 设计的权威指南 |
| [LangGraph - Agent Architecture](https://langchain-ai.github.io/langgraph/concepts/high_level/) | 📖 文档 | Agent 架构模式和最佳实践 |

---

## 2.11 AI 业界补充概念（1.5h）

### Fine-tuning vs RAG vs Prompt Engineering

| 方法 | 成本 | 灵活性 | 时效性 | 适用场景 |
|------|------|--------|--------|---------|
| **Prompt Engineering** | 💰 极低 | ⭐⭐⭐ 最高 | 实时 | 通用任务、快速迭代、探索 |
| **RAG** | 💰💰 中 | ⭐⭐ 中 | 实时 | 需要外部知识库 |
| **Fine-tuning** | 💰💰💰 高 | ⭐ 低 | 训练时固定 | 特定风格/格式/术语 |

### AI Safety 关键概念

| 概念 | 说明 |
|------|------|
| **Guardrails** | 输入/输出内容过滤（如 NeMo Guardrails） |
| **Red Teaming** | 模拟攻击者测试模型安全性 |
| **RLHF** | 用人类反馈训练模型对齐人类偏好 |
| **Constitutional AI** | Claude 的训练方法——模型用规则自我约束 |

### Evaluation（评估）

AI 输出质量不能只靠"感觉"。需要建立评估体系：
- **自动评估**：BLEU/ROUGE（翻译）、BERTScore（语义）、LLM-as-Judge（用 GPT-4 打分）
- **人工评估**：盲测、A/B 对比、评分量表
- **任务特定**：事实准确率、格式符合率、术语一致性

#### 📚 AI 业界资源汇总

| 资源 | 类型 | 说明 |
|------|------|------|
| [The Batch (Andrew Ng)](https://www.deeplearning.ai/the-batch/) | 📧 周刊 | 每周 AI 新闻和技术解读 |
| [Hugging Face Daily Papers](https://huggingface.co/papers) | 📖 每日 | 每日 AI 论文精选 |
| [Arxiv Sanity](http://www.arxiv-sanity.com/) | 🛠️ 工具 | AI 论文发现工具 |
| [Papers With Code](https://paperswithcode.com/) | 🛠️ 工具 | 论文+代码+排行榜 |
| [Simon Willison's Blog](https://simonwillison.net/) | 📖 博客 | AI 工程实践的第一手经验 |
| [Chip Huyen's Blog](https://huyenchip.com/blog/) | 📖 博客 | ML/AI 系统设计深度文章 |

---

## 2.12 板块二学习检查点

进入板块三之前，确认能回答：
- [ ] Token 是什么？中英文 Token 消耗为何不同？
- [ ] GPT-4o、Claude、DeepSeek 各有什么特点？怎么选？
- [ ] CRISP 五要素分别是什么？
- [ ] Prompt Engineering / Context Engineering / Loop Engineering 的区别？
- [ ] `await` 干什么的？Streaming 和普通调用的区别？
- [ ] RAG 三个步骤？本项目怎么实现？
- [ ] Agent 和普通 LLM 调用的核心区别？
- [ ] MCP 解决了什么问题？
- [ ] Agentic Loop 的核心循环是什么？


---

# 板块三：项目工程 — Smart Tech Writer 深度解析

> **目标**：完整理解项目架构与设计思想，能本地跑起来，能改 Prompt，能追踪调试  
> **学时**：约 24h  
> **注意**：基于当前代码版本编写，项目演进后部分细节可能变化。核心设计思想相对稳定。

---

## 3.1 项目架构总览（3h）

### 3.1.1 为什么选择 Electron 架构？

#### 🎯 设计动机

Smart Tech Writer 需要一个**桌面应用**而非网页应用，原因是：
1. **本地文件处理**：需要读写用户电脑上的 PDF、Word、EML 文件
2. **本地数据库**：项目数据存储在用户电脑上（隐私 + 离线可用）
3. **系统级能力**：托盘通知、原生文件对话框、系统菜单
4. **离线优先**：虽然 AI 调用需要网络，但项目管理和历史记录可离线使用

Electron 是满足这些需求的最佳选择：用 Web 技术（HTML/CSS/JS）写 UI，用 Node.js 访问系统能力，一套代码跨 Windows/Mac/Linux。

#### 🏗️ Electron 三层架构

```
┌──────────────────────────────────────────────────────────┐
│                     Electron App                           │
│                                                            │
│  ┌─────────────────────┐          ┌────────────────────┐  │
│  │  Renderer Process    │  IPC →   │  Main Process       │  │
│  │  (src/renderer/)     │  ← IPC   │  (src/main/)        │  │
│  │                      │          │                     │  │
│  │  运行环境：Chromium    │          │  运行环境：Node.js    │  │
│  │  能力：DOM/BOM API    │          │  能力：fs/path/os/   │  │
│  │  不能：fs, path, os   │          │       child_process │  │
│  │                      │          │                     │  │
│  │  React 19 + TS        │          │  OpenAI SDK          │  │
│  │  Tailwind CSS          │          │  better-sqlite3      │  │
│  │  Zustand               │          │  pdf-parse/mammoth   │  │
│  │  react-markdown        │          │  electron-log        │  │
│  └──────────┬───────────┘          └──────────┬─────────┘  │
│             │                                  │            │
│             └────── src/preload/ ──────────────┘            │
│                    (contextBridge)                          │
│                    安全暴露有限 API                          │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  src/shared/types/ — 两端共享的 TypeScript 类型定义     │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

#### 📖 关键设计决策

**为什么 Renderer 不能直接访问 Node.js？**
- **安全性**：Renderer 加载的 UI 代码如果被 XSS 攻击，攻击者无法直接操作文件系统
- **隔离性**：即使前端崩溃，后端服务仍然运行，不会丢失数据
- **职责清晰**：UI 只管展示和交互，数据处理全部在后端

**为什么用 IPC 而不是 HTTP？**
- Electron 内置 IPC，零配置、零延迟
- 不需要启动 HTTP 服务器
- 类型安全：通过 `ipc.types.ts` 定义通道和载荷类型

### 3.1.2 技术分层架构

```
┌──────────────────────────────────────────────────┐
│            UI 层（src/renderer/）                  │
│  React Components → Zustand Stores → API Layer    │
│  职责：用户交互、状态展示、流式渲染                  │
├──────────────────────────────────────────────────┤
│           通信层（src/preload/ + src/main/ipc/）    │
│  contextBridge 暴露 API → ipcMain 处理请求          │
│  职责：安全桥接、通道注册、载荷校验                  │
├──────────────────────────────────────────────────┤
│          业务逻辑层（src/main/modules/）            │
│  WorkflowEngine → Pipeline → Agents → Providers    │
│  职责：工作流调度、AI 调用、文档生成                 │
├──────────────────────────────────────────────────┤
│          基础设施层（src/main/modules/）            │
│  Database · FileStorage · FileReaders · RAG       │
│  职责：数据持久化、文件 I/O、知识检索                │
└──────────────────────────────────────────────────┘
```

#### 📖 完整数据流（一次文档生成的全过程）

```
1. 用户点击"开始"按钮
   Renderer: DocGeneratorTab → useWorkflow().start({ files, projectId })
   → workflow.api.ts → window.electronAPI.workflow.start(payload)
   → IPC: 'workflow:start'
   → Main: workflow.ipc.ts → workflowEngine.startWorkflow(projectId, files)

2. AI 开始处理（以 upload_parse 阶段为例）
   Main: WorkflowEngine.runPipeline() → runUploadParseStage(state, config)
   → FileReader.read(filePath) → 提取文本
   → FileParserAgent.execute(state) → agent.callLLM(userPrompt)
   → OpenAIProvider.stream(messages) → AI 逐 Token 返回

3. 流式输出到前端
   Main: WorkflowEngine.emitStream(projectId, 'upload_parse', chunk)
   → IPC: 'workflow:stream'
   → Renderer: workflow.store.appendStreamChunk(stage, chunk)
   → AIStreamViewer 组件实时渲染

4. 暂停等待人工确认
   Main: Pipeline 检测到 PAUSE_STAGE → emitProgress('PAUSED:REVIEW_UPLOAD')
   → Renderer: workflow.store.setStatus('PAUSED:REVIEW_UPLOAD')
   → DocGeneratorTab 渲染审核界面（parsed files + continue 按钮）

5. 用户确认后继续
   Renderer: 用户点击"继续" → useWorkflow().reviewContinue(payload)
   → IPC: 'workflow:reviewContinue'
   → Main: workflowEngine.resumeFromHumanInput(projectId, payload)
   → Pipeline 继续下一阶段...
```

---

## 3.2 目录结构详解（2h）

#### 🎯 设计动机

项目的目录结构遵循**按职责分层、按功能分模块**的原则。每个文件夹只包含同一职责的代码，不同职责严格分离。这样新人只需要关注自己关心的部分——Tech Writer 主要关注 `agents/` 中的 Prompt，前端开发者关注 `renderer/`。

#### 📖 完整目录树与设计说明

```
smart-tech-writter/
│
├── package.json              ← 项目身份证：名称、版本、依赖、脚本
│                               npm start → electron-forge start
│                               npm run make → 打包为可分发的安装包
│
├── tsconfig.json             ← TS 编译配置：严格模式、路径别名、输出目录
├── forge.config.ts           ← Electron Forge 打包配置：平台、格式、签名
├── vite.main.config.ts       ← Vite 主进程构建：入口、输出、外部依赖
├── vite.renderer.config.ts   ← Vite 渲染进程构建：React 插件、CSS 处理
├── vite.preload.config.ts    ← Vite Preload 构建：入口、输出
├── tailwind.config.js        ← Tailwind 配置：主题色、自定义 class
├── postcss.config.js         ← PostCSS：Tailwind 编译 + Autoprefixer
│
├── src/
│   ├── main/                 ← ===== 主进程（"后端"）=====
│   │   ├── index.ts          ← 入口文件：app.whenReady() → createWindow() → initializeServices()
│   │   │                       创建 BrowserWindow，加载 React 前端
│   │   │                       初始化数据库、AI Provider、RAG、WorkflowEngine
│   │   │                       注册所有 IPC 处理器
│   │   │
│   │   ├── ipc/              ← IPC 通信层（"前后端的电话线"）
│   │   │   ├── index.ts      ← 统一注册入口：调用各个子模块的 register 函数
│   │   │   ├── workflow.ipc.ts ← 工作流控制：start / stream / reviewContinue / goBack / aiEditDraft
│   │   │   ├── file.ipc.ts   ← 文件操作：readFile / saveDita / exportAll
│   │   │   ├── settings.ipc.ts ← 设置读写：getSetting / setSetting
│   │   │   └── rag.ipc.ts    ← RAG 搜索：search
│   │   │
│   │   └── modules/          ← 核心业务模块（按领域分包）
│   │       │
│   │       ├── agents/       ← AI Agent 集合（"五个 AI 员工"）
│   │       │   ├── base.agent.ts       ← Agent 基类：定义统一接口
│   │       │   │                         每个 Agent 必须实现：systemPrompt + execute(state)
│   │       │   │                         基类提供：callLLM() + setStreamCallback()
│   │       │   ├── file-parser.agent.ts ← "文件解析员"：非结构化文本 → 结构化 JSON
│   │       │   ├── analyzer.agent.ts    ← "内容分析员"：提取主题、技术要点、关键词
│   │       │   ├── writer.agent.ts      ← "文档撰写员"：基于分析结果写文档草稿
│   │       │   ├── reviewer.agent.ts    ← "质量审查员"：多模式审查（AI 审查 / DITA 审查）
│   │       │   ├── localizer.agent.ts   ← "本地化专员"：简中/繁中/港繁翻译
│   │       │   └── index.ts             ← 统一导出所有 Agent 类
│   │       │
│   │       ├── ai-providers/  ← AI 提供商封装（"AI 供应商管理层"）
│   │       │   ├── base.provider.ts    ← AIProvider 接口定义
│   │       │   │                         complete() — 普通调用
│   │       │   │                         stream()   — 流式调用
│   │       │   │                         embed()    — 向量化
│   │       │   ├── openai.provider.ts  ← OpenAI 兼容实现
│   │       │   │                        支持任意 baseURL（DeepSeek/Qwen/etc）
│   │       │   └── index.ts            ← createProvider() 工厂函数
│   │       │
│   │       ├── workflow/      ← 工作流引擎（"整个工厂的生产线调度"）
│   │       │   ├── index.ts           ← WorkflowEngine 主类
│   │       │   │                         runPipeline() — 执行流水线主循环
│   │       │   │                         emitProgress() — 推送进度到前端
│   │       │   │                         emitStream() — 推送 AI 流式输出
│   │       │   │                         resumeFromHumanInput() — 用户确认后恢复
│   │       │   │                         goBackToStage() — 回退到指定步骤
│   │       │   ├── pipeline.ts        ← 各 Stage 的具体实现
│   │       │   │                        runUploadParseStage() / runAnalyzeStage() / ...
│   │       │   │                        每个函数：创建 Agent → 执行 → 返回 Partial<DocGenState>
│   │       │   └── state-machine.ts   ← 状态机和阶段定义
│   │       │                            STAGE_ORDER — 20 个阶段的执行顺序
│   │       │                            PAUSE_STAGES — 哪些阶段等人工确认
│   │       │                            nextStage() / previousStage() / getFieldsToResetAfterStage()
│   │       │
│   │       ├── rag/           ← 知识检索（"参考资料库"）
│   │       │   ├── local-search.service.ts ← 本地文件关键词搜索
│   │       │   └── index.ts
│   │       │
│   │       ├── storage/       ← 数据持久化（"档案室"）
│   │       │   ├── database.ts         ← SQLite 数据库：建表、迁移、CRUD
│   │       │   ├── file-storage.ts     ← 文件读写：项目文件、导出的文档
│   │       │   └── index.ts
│   │       │
│   │       ├── document-builder/← 文档生成器（"印刷厂"）
│   │       │   ├── docx.builder.ts     ← Markdown → DOCX（使用 docx 库）
│   │       │   ├── dita.builder.ts     ← Markdown → DITA 1.3 XML
│   │       │   └── index.ts
│   │       │
│   │       └── file-readers/  ← 文件格式解析（"翻译官"）
│   │           ├── base.reader.ts      ← BaseReader 接口
│   │           ├── pdf.reader.ts       ← PDF → 纯文本（pdf-parse）
│   │           ├── word.reader.ts      ← .docx → Markdown（mammoth）
│   │           ├── text.reader.ts      ← .txt/.md → 纯文本
│   │           ├── code.reader.ts      ← 代码文件 → 纯文本 + 语言检测
│   │           ├── email.reader.ts     ← .eml → 纯文本 + 元数据（mailparser）
│   │           └── index.ts            ← createReader() 工厂：根据扩展名选择 Reader
│   │
│   ├── preload/               ← ===== Preload 桥接 =====
│   │   ├── index.ts           ← contextBridge.exposeInMainWorld('electronAPI', {...})
│   │   │                       暴露 workflow / file / settings / rag 四个模块
│   │   └── api.types.ts       ← ElectronAPI 类型定义（前端 import 用）
│   │
│   ├── renderer/              ← ===== 渲染进程（"前端"）=====
│   │   ├── index.html         ← HTML 入口：<div id="root">
│   │   ├── main.tsx           ← React 入口：createRoot → render(<App />)
│   │   ├── App.tsx            ← 根组件：路由、布局
│   │   ├── index.css          ← 全局样式：@tailwind base/components/utilities
│   │   │
│   │   ├── api/               ← API 调用层：封装 IPC 调用为前端可用的 Promise 函数
│   │   │   └── workflow.api.ts← workflow API：start / stream / reviewContinue / goBack / etc
│   │   │
│   │   ├── stores/            ← Zustand 全局状态
│   │   │   ├── workflow.store.ts  ← 核心 Store：status, currentStage, drafts, logs, streamChunks
│   │   │   └── settings.store.ts  ← 设置 Store：apiKey, baseURL, model, ragDirectory
│   │   │
│   │   ├── components/        ← 通用组件
│   │   │   └── Layout/AppLayout.tsx ← 整体布局（侧边栏 + 主内容区）
│   │   │
│   │   └── features/          ← 功能模块
│   │       ├── doc-generator/ ← 核心功能：文档生成器
│   │       │   ├── index.tsx           ← 主页面组件（~800 行，包含所有 Stage 的 UI 分支）
│   │       │   ├── hooks/useWorkflow.ts← 工作流 Hook（封装 store + API 调用）
│   │       │   └── components/
│   │       │       ├── InputPanel.tsx          ← 文件上传 + 项目信息填写
│   │       │       ├── StageNavigation.tsx     ← 顶部 20 阶段进度条
│   │       │       ├── WorkflowProgress.tsx    ← 工作流运行状态指示
│   │       │       ├── DraftViewer.tsx         ← 草稿查看器（Markdown 渲染）
│   │       │       ├── ReviewPanel.tsx         ← 审查面板（接受/拒绝/手动编辑）
│   │       │       ├── ReviewCommentsView.tsx  ← 审查意见卡片列表
│   │       │       ├── AIStreamViewer.tsx      ← AI 流式输出实时展示
│   │       │       ├── AiDraftEditor.tsx       ← AI 辅助编辑面板（Prompt 驱动）
│   │       │       ├── MarkdownRenderer.tsx    ← Markdown 渲染器（react-markdown）
│   │       │       ├── CollapsibleSection.tsx  ← 可折叠区域（多处复用）
│   │       │       ├── FilePreviewModal.tsx    ← 文件预览弹窗
│   │       │       ├── LogViewer.tsx           ← 底部日志面板
│   │       │       └── OutputPanel.tsx         ← 导出面板（保存/导出全部）
│   │       │
│   │       └── settings/      ← 设置页
│   │           └── SettingsTab.tsx ← API Key 配置、模型选择、RAG 目录
│   │
│   └── shared/                ← ===== 前后端共享 =====
│       └── types/
│           ├── workflow.types.ts  ← StageName, WorkflowStatus, DocGenState, WorkflowLogEntry
│           ├── document.types.ts  ← UploadedFile, AnalysisResult, DocumentDraft, ReviewComment
│           └── ipc.types.ts       ← IPC 通道名称常量 + 载荷类型定义
│
├── test/
│   └── mock-case-01/          ← 测试用例
│       ├── esp32-pwm-dita-input.txt  ← 纯文本测试输入
│       └── esp32-pwm-dita-input.eml  ← 邮件格式测试输入
│
└── docs/
    └── learning-plan.md       ← 本学习计划书
```

---

## 3.3 核心模块深度解析（8h）

### 3.3.1 工作流引擎 — WorkflowEngine（2h）⭐

#### 🎯 为什么需要 WorkflowEngine？

AI 文档生成不是"调一次 API 就出结果"那么简单。它需要：
1. 解析上传的文件（多种格式）
2. AI 分析文档主题和技术要点
3. 检索本地参考资料
4. AI 撰写文档草稿
5. AI 审查草稿质量
6. 人类审核 AI 的建议
7. 本地化翻译
8. 生成 DITA XML / DOCX

这些步骤有先后顺序、有依赖关系、有些步骤需要等待人类确认。**WorkflowEngine 就是管理这个复杂流程的"总指挥"**。

#### 🏗️ 架构设计

```typescript
// WorkflowEngine 的核心设计
class WorkflowEngine {
  // ===== 对外 API =====
  startWorkflow(projectId, inputFiles)  // 启动一个新的文档生成任务
  resumeFromHumanInput(projectId, data) // 人工审核确认后恢复执行
  goBackToStage(projectId, targetStage) // 回退到之前的某个步骤重做
  aiEditDraft(projectId, content, inst) // AI 辅助编辑草稿

  // ===== 内部机制 =====
  private runPipeline(state)   // 流水线主循环
  private emitProgress(...)    // 通过 IPC 推送进度到前端
  private emitStream(...)      // 通过 IPC 推送 AI 流式输出
}
```

**设计思想 — Resume Promise 模式**：

当流水线遇到需要人工确认的阶段时，WorkflowEngine 不是"忙等"（那会阻塞整个进程），而是：
1. 记录当前状态到数据库
2. 创建一个 Promise，将它的 `resolve` 函数保存起来
3. 向前端发送暂停通知
4. 等待用户操作
5. 用户操作触发 `resumeFromHumanInput()` → 调用保存的 `resolve` → 流水线继续

```typescript
// 简化示意
private pausePromiseResolve: ((data: any) => void) | null = null;

private async waitForHumanInput(): Promise<any> {
  return new Promise((resolve) => {
    this.pausePromiseResolve = resolve;  // 保存 resolve，等用户操作时调用
  });
}

async resumeFromHumanInput(projectId: string, data: any): Promise<void> {
  if (this.pausePromiseResolve) {
    this.pausePromiseResolve(data);  // 唤醒等待的流水线
    this.pausePromiseResolve = null;
  }
}
```

#### 📖 执行流程详解

```
startWorkflow(projectId, inputFiles)
  │
  ├── 1. 从数据库加载/创建项目
  ├── 2. 构建初始 DocGenState
  ├── 3. 更新数据库状态为 RUNNING
  ├── 4. 调用 runPipeline(state)
  │
  ▼
runPipeline(state)
  │
  ┌─ while (status === RUNNING) ───────────────────────┐
  │                                                      │
  │  currentStage = state.currentStage                   │
  │                                                      │
  │  // 根据当前阶段执行对应的处理函数                       │
  │  switch (currentStage) {                             │
  │    case 'upload_parse':                              │
  │      partial = await runUploadParseStage(state, config)│
  │      break                                           │
  │    case 'analyze':                                   │
  │      partial = await runAnalyzeStage(state, config)   │
  │      break                                           │
  │    // ... 共 20 个 case ...                          │
  │  }                                                   │
  │                                                      │
  │  // 合并执行结果到 state                              │
  │  Object.assign(state, partial)                       │
  │                                                      │
  │  // 判断是否需要暂停                                   │
  │  if (PAUSE_STAGES.includes(currentStage)) {          │
  │    status = PAUSED:{STAGE}                           │
  │    emitProgress('PAUSED', ...)                       │
  │    await waitForHumanInput()  // ← 等用户确认         │
  │    status = RUNNING                                  │
  │  }                                                   │
  │                                                      │
  │  // 前进到下一阶段                                    │
  │  state.currentStage = nextStage(currentStage)        │
  │                                                      │
  │  if (currentStage === 'export') {                    │
  │    status = COMPLETED                                │
  │    break                                             │
  │  }                                                   │
  │                                                      │
  └──────────────────────────────────────────────────────┘
  │
  ▼
更新数据库，发送完成通知
```

### 3.3.2 状态机 — State Machine（1h）

#### 🎯 为什么需要状态机？

20 个阶段的顺序、哪些阶段需要暂停、回退时哪些数据要清除——这些规则如果散落在代码各处，维护起来会是一场灾难。**状态机把所有阶段转换规则集中管理**，一目了然。

#### 📖 20 个阶段的设计逻辑

```typescript
export const STAGE_ORDER: StageName[] = [
  // === 输入处理（3 步）===
  'upload_parse',      // 0.  上传文件 + AI 解析
  'review_upload',     // 0a. 审核解析结果 ← PAUSE
  'ingest',            // 1.  汇总结构化数据

  // === 分析阶段（2 步）===
  'analyze',           // 2.  AI 分析主题和技术要点
  'review_analyze',    // 2a. 审核分析结果 ← PAUSE

  // === 写作阶段（4 步）===
  'draft',             // 3.  AI 撰写文档草稿
  'review_draft',      // 3a. 审核草稿 ← PAUSE（可在此 AI 辅助编辑）
  'ai_review',         // 4.  AI 审查草稿质量
  'human_review',      // 5.  人工审核 AI 审查意见 ← PAUSE

  // === 编辑确认（2 步）===
  'post_edit_review',  // 6.  AI 编辑后再次审查
  'human_confirm',     // 6b. 人工最终确认 ← PAUSE

  // === 本地化（4 步）===
  'localize',          // 7.  AI 翻译/本地化
  'review_localize',   // 7a. 审核翻译 ← PAUSE
  'localize_ai_review',// 7b. AI 审查翻译质量
  'human_localize_review', // 7c. 人工审核翻译审查 ← PAUSE

  // === 输出生成（4 步）===
  'dita_build',        // 8.  生成 DITA XML
  'review_dita',       // 8a. 审核 DITA ← PAUSE
  'dita_ai_review',    // 8b. AI 审查 DITA
  'human_dita_review', // 8c. 人工审查 DITA ← PAUSE
  'export',            // 9.  导出文件
];
```

**设计原则**：
- 每个 AI 处理步骤后都跟一个"审核点"（AI 也会犯错，必须人类把关）
- 7 个 PAUSE_STAGES 形成 7 道质量门（Gating）
- 关键决策点（草稿、审查、翻译、DITA）都有人工介入

**回退时的数据清除逻辑**：
```typescript
// 回退到 analyze（第 2 步）：需要清除第 3-9 步的所有产出
getFieldsToResetAfterStage('analyze') → ['drafts', 'aiReviewComments', ...]
// 回退到 draft（第 3 步）：只需清除第 4-9 步的产出
getFieldsToResetAfterStage('draft') → ['aiReviewComments', 'humanEdits', ...]
```

### 3.3.3 Pipeline（1h）

#### 🎯 设计思想

每个 Stage 的处理逻辑封装为独立的 `runXxxStage()` 函数。这些函数遵循**统一的模式**（Template Method 的变体），便于理解和维护：

```typescript
export async function runXxxStage(
  state: DocGenState,
  config: PipelineConfig
): Promise<Partial<DocGenState>> {

  // 1. 发送进度通知
  config.onProgress?.('xxx_stage', '🚀 开始处理...');

  // 2. 创建 Agent 实例
  const agent = new XxxAgent(config.provider);

  // 3. 设置流式回调（AI 输出实时推送到前端）
  if (config.onStream) {
    agent.setStreamCallback((chunk) => config.onStream?.('xxx_stage', chunk));
  }

  // 4. 执行 Agent（调用 AI）
  const result = await agent.execute(state);

  // 5. 发送完成通知
  config.onProgress?.('xxx_stage', '✅ 处理完成');

  // 6. 返回本阶段新增/修改的状态
  return result;
}
```

**为什么每个函数返回 Partial<DocGenState>？**

这是**增量状态更新**模式。每个 Stage 只声明自己修改了哪些字段，WorkflowEngine 负责合并：

```typescript
// upload_parse 只改 inputFiles
runUploadParseStage → { inputFiles: updatedFiles }

// analyze 只改 analysisResults 和 referenceSearchResults
runAnalyzeStage → { analysisResults: [...], referenceSearchResults: [...] }

// draft 只改 drafts
runDraftStage → { drafts: [...] }

// Engine 自动合并
Object.assign(state, partialResult);
```

### 3.3.4 Agent 体系（1.5h）

#### 🎯 为什么设计为 Agent 体系而非单个函数？

1. **关注点分离**：解析、分析、写作、审查、翻译 → 5 个独立的专业能力
2. **Prompt 独立性**：每个 Agent 有自己的 System Prompt，可以独立优化
3. **可扩展性**：新增一个"术语管理 Agent"不影响现有 Agent
4. **可测试性**：每个 Agent 可以独立测试其 Prompt 效果

#### 📖 BaseAgent 设计详解

```typescript
export abstract class BaseAgent {
  // ===== 子类必须实现 =====
  abstract get systemPrompt(): string;
  // ↑ 每个 Agent 的"角色设定"和"工作准则"
  // 这是 Tech Writer 最核心的修改点！

  abstract execute(state: DocGenState): Promise<Partial<DocGenState>>;
  // ↑ 每个 Agent 的"工作流程"
  // 通常：构建 userPrompt → callLLM() → 解析 AI 返回 → 返回更新的 State

  // ===== 基类提供的通用能力 =====
  protected async callLLM(userPrompt: string, model?: string): Promise<string> {
    const messages = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // 自动选择流式或普通模式
    if (this._streamCallback) {
      let full = '';
      for await (const chunk of this.provider.stream(messages, { model })) {
        full += chunk;
        this._streamCallback(chunk);  // 实时推送给前端
      }
      return full;
    }

    return this.provider.complete(messages, { model });
  }
}
```

**各 Agent 职责速览**：

| Agent | 输入 | 处理 | 输出 | 对 Tech Writer 的价值 |
|-------|------|------|------|---------------------|
| **FileParserAgent** | 原始文本 | AI 提取结构化信息 | `inputFiles[].extractedText` + 结构化 JSON | 调整提取字段、JSON Schema |
| **AnalyzerAgent** | 结构化数据 | AI 分析核心主题/技术要点/关键词 | `analysisResults[]` | 调整分析维度、新增分析类别 |
| **WriterAgent** | 分析结果 + RAG 参考 | AI 撰写文档草稿 | `drafts[]` | **⭐ 核心！调整写作风格/结构/语气** |
| **ReviewerAgent** | 文档草稿 | AI 审查质量（多模式） | `reviewComments[]` | 增加审查规则、调整评分标准 |
| **LocalizerAgent** | 文档草稿 + 目标语言 | AI 翻译/本地化 | `localizedDrafts[]` | 维护术语表、调整本地化策略 |

### 3.3.5 AI Provider 封装（0.5h）

#### 🎯 设计思想

通过**接口抽象 + 工厂模式**，让项目不绑定任何特定 AI 提供商：

```typescript
// 接口定义 — 任何 AI 提供商只要实现这 3 个方法即可接入
export interface AIProvider {
  readonly providerName: string;
  complete(messages, options?): Promise<string>;       // 普通调用
  stream(messages, options?): AsyncIterable<string>;   // 流式调用
  embed(text): Promise<number[]>;                       // 向量化
}

// 工厂函数 — 根据配置创建对应的 Provider
export function createProvider(config: ProviderConfig): AIProvider {
  switch (config.type) {
    case 'openai':
      return new OpenAIProvider(config);  // 支持任意 OpenAI 兼容 API
    // 未来扩展：
    // case 'anthropic': return new AnthropicProvider(config);
    // case 'local': return new LocalLLMProvider(config);
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}
```

**OpenAIProvider 的关键设计 — baseURL**：

```typescript
constructor(config: ProviderConfig) {
  this.client = new OpenAI({
    apiKey: config.apiKey || 'NOT_CONFIGURED',
    baseURL: config.baseURL || undefined,  // ← 这就是切换模型的关键！
  });
}
```

通过修改 `baseURL`，同一个 `OpenAIProvider` 可以调用任何 OpenAI 兼容的 API：OpenAI 官方、DeepSeek、Qwen、Kimi、本地 Ollama、302.ai 代理...

### 3.3.6 前端架构（1h）

#### 🎯 设计思想

前端采用 **"状态驱动 UI"** 的 React 模式：

```
用户操作 → 更新 Store → React 自动重渲染受影响的组件
```

不需要手动操作 DOM，不需要手动同步数据。只需关心"状态是什么"，React 自动处理"UI 应该长什么样"。

#### 📖 核心数据流

```
用户点击"开始"
  → useWorkflow().start()                     // Hook 封装
  → workflowApi.start(payload)                // API 层封装
  → window.electronAPI.workflow.start(payload) // Preload 暴露
  → IPC: 'workflow:start'                     // 到达主进程
  → Main 处理...
  → IPC: 'workflow:progress' / 'workflow:stream' / 'workflow:status'
  → workflowStore.setStatus() / appendLog() / appendStreamChunk()
  → React 自动重渲染相关组件
```

**主页面组件（index.tsx）的设计模式**：

```tsx
// 简化版 — 状态驱动的 Stage UI 切换
function DocGeneratorTab() {
  const { status, currentStage } = useWorkflowStore();

  // 根据状态决定显示什么
  if (status === 'IDLE') {
    return <InputPanel />;
  }

  if (status === 'RUNNING') {
    return <RunningView currentStage={currentStage} />;
  }

  if (status.startsWith('PAUSED:')) {
    return <PausedView status={status} currentStage={currentStage} />;
  }

  if (status === 'COMPLETED') {
    return <CompletedView />;
  }
}
```

---

## 3.4 动手实操（6h）

### 3.4.1 环境搭建 + 首次运行（1.5h）

#### 步骤详解

**1. 安装 Node.js**
- 下载地址：https://nodejs.org/ （选择 LTS 版本，当前 22.x）
- 安装后验证：`node -v` 和 `npm -v`

**2. 安装 Git**
- 下载地址：https://git-scm.com/
- 验证：`git --version`

**3. Clone 项目**
```bash
git clone <项目仓库地址>
cd smart-tech-writter
```

**4. 安装依赖**
```bash
npm install
# 可能需要 3-5 分钟
# 如果 better-sqlite3 编译失败 → npm install -g windows-build-tools（Windows）
```

**5. 配置 API**
- 启动项目：`npm start`
- 进入设置页面
- 填入 API Key、Base URL（如使用 302.ai：`https://api.302ai.cn/v1`）
- 选择默认模型（推荐 `gpt-4o` 或 `deepseek-chat`）

**6. 测试流程**
- 用 `test/mock-case-01/esp32-pwm-dita-input.txt` 作为测试输入
- 点击"新建项目" → 上传文件 → 点击"开始"
- 观察整个 20 阶段流程

#### 常见问题及解决

| 问题 | 原因 | 解决方法 |
|------|------|---------|
| `better-sqlite3` 编译失败 | Windows 缺少 C++ 编译工具 | `npm install -g windows-build-tools` |
| Electron 下载慢/失败 | 网络问题 | 设置镜像：`set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` |
| `npm start` 报 TS 错误 | 类型定义缺失 | `npm install` 重新安装依赖 |
| API 调用返回 401 | API Key 未配置/过期 | 检查设置页的 API Key |
| 文件解析失败 | 文件格式不支持或损坏 | 尝试用 `test/` 目录下的测试文件 |
| 前端空白页 | Vite 开发服务器未启动 | 检查终端是否有报错信息 |

### 3.4.2 修改 System Prompt（2h）⭐ 核心实操

#### 实操任务一：改变文档风格

**目标**：修改 WriterAgent 的 System Prompt，将输出从"正式技术文档"改为"面向初学者的教程风格"

**步骤**：
1. 打开 `src/main/modules/agents/writer.agent.ts`
2. 找到 `get systemPrompt()` 方法
3. 在 Role 部分添加："请使用亲切、易懂的语言，假设读者是第一次接触这个主题"
4. 在 Style 部分添加："每个概念之后请添加一个'💡 小提示'段落"
5. 保存 → 重启项目 → 用同样的输入跑一次
6. 对比修改前后的输出

#### 实操任务二：增加审查规则

**目标**：给 ReviewerAgent 增加一条审查规则

**步骤**：
1. 打开 `src/main/modules/agents/reviewer.agent.ts`
2. 找到 `get systemPrompt()` 方法
3. 在审查维度列表中添加："5. 代码示例检查：所有代码示例是否包含必要的注释？代码是否可以直接运行？"
4. 在输出格式部分确保新维度有对应的输出字段
5. 保存 → 重启 → 测试

#### 实操任务三：调整术语翻译

**目标**：在 LocalizerAgent 中修改/新增术语翻译映射

**步骤**：
1. 打开 `src/main/modules/agents/localizer.agent.ts`
2. 找到术语表部分（通常在 System Prompt 中）
3. 修改或添加术语映射，例如：`"PWM" → "脉冲宽度调制（PWM）"`（首次出现时保留英文缩写）
4. 测试简中/繁中不同目标语言的输出

#### 实操任务四：A/B 对比测试

**目标**：建立 Prompt 修改的评估方法

**步骤**：
1. 准备一个测试输入（如 `test/mock-case-01/` 中的文件）
2. 用原始 Prompt 跑一次，保存输出为 `output_v1.md`
3. 修改 Prompt
4. 用新 Prompt 跑一次，保存输出为 `output_v2.md`
5. 对比两个输出：可读性、完整性、准确性、格式规范性
6. 记录修改了什么 Prompt 要素、产生了什么效果

### 3.4.3 追踪调试（1.5h）

#### 使用 LogViewer 追踪流程

1. 启动项目，开始一个文档生成任务
2. 观察 LogViewer（底部面板）的实时日志
3. 注意日志格式：`[时间] [Stage] [级别] 消息`
4. 每个 AI 阶段的日志会显示处理进度

#### 在代码中添加日志

```typescript
// 在 pipeline.ts 的任意 Stage 函数中添加
log.info(`当前处理的文件数量: ${state.inputFiles.length}`);
log.info(`分析结果数量: ${state.analysisResults.length}`);
```

#### 使用 VS Code 调试器

1. 在 VS Code 中打开项目
2. 在关键位置设置断点（F9），例如：
   - `workflow/index.ts` 的 `runPipeline()` 方法
   - `agents/writer.agent.ts` 的 `execute()` 方法
3. 按 F5 启动调试（需要配置 `.vscode/launch.json`）
4. 触发工作流，观察变量值、调用栈

#### 追踪数据流练习

**任务**：追踪一条"用户点击开始 → DraftViewer 显示内容"的链路

```
起点：index.tsx 中的 onClick handler
  → useWorkflow().start()
  → workflow.api.ts 中的 start()
  → preload/index.ts 中的 ipcRenderer.invoke('workflow:start')
  → main/ipc/workflow.ipc.ts 中的 ipcMain.handle('workflow:start')
  → WorkflowEngine.startWorkflow()
  → Pipeline.runDraftStage()
  → WriterAgent.execute()
  → BaseAgent.callLLM()
  → OpenAIProvider.stream()
  → emitStream() → IPC → workflowStore
  → AIStreamViewer 实时显示
  → 最终 drafts 存入 store
  → DraftViewer 读取并渲染
```

### 3.4.4 实战小项目（1h）

选择一个适合你当前水平的任务：

**入门级**：给 LogViewer 修改一段阶段标签文本（如把"upload_parse"改为"文件上传解析"）

**进阶级**：在 ReviewerAgent 的 System Prompt 中增加一个新的审查维度，并验证 AI 确实会按新规则输出审查意见

**挑战级**：按照现有 Agent 的模式，创建一个新的 `GlossaryAgent`（术语表管理 Agent），只写 System Prompt 和 execute 方法骨架，不需要接入工作流

---

## 3.5 项目演进注意事项

本部分基于 2026-07 版本编写。项目可能的演进方向及对学习计划的影响：

| 可能的演进 | 影响的学习部分 | 应对策略 |
|-----------|--------------|---------|
| 新增 Agent | 3.3.4 Agent 体系 | 参照现有 Agent 模式即可 |
| 新增 Stage | 3.3.2 状态机 + 3.3.3 Pipeline | 更新 STAGE_ORDER 和 PAUSE_STAGES |
| 引入 MCP | 2.8 MCP + 3.3.5 Provider | 新增 MCPClient 模块 |
| 升级 RAG（向量搜索） | 2.6 RAG | 替换 LocalSearchService |
| Web 版本 | 3.1 架构 | IPC → HTTP API，Renderer 独立部署 |
| 多模型路由 | 3.3.5 Provider | 不同 Stage 使用不同模型 |

---

# 板块四：AI 辅助开发

> **目标**：学会用 AI 工具加速学习和开发效率  
> **学时**：约 14h  
> **这是"元技能"—— 用 AI 学 AI，用 AI 写代码，用 AI 加速一切**

---

## 4.1 为什么要学 AI 辅助开发？

AI 辅助开发不是"偷懒"，而是**把时间花在更高层次的工作上**：
- 不再纠结语法细节 → 专注架构和设计
- 不再手动写重复代码 → 专注业务逻辑
- 不再逐行排查错误 → 专注根本原因分析
- 不再闭门造车 → 随时有 AI 导师答疑

对 Tech Writer 来说，AI 辅助开发意味着：**不需要成为程序员，也能修改代码**。

---

## 4.2 AI IDE 与编程助手（4h）

### 4.2.1 GitHub Copilot ⭐ 本项目使用

GitHub Copilot 是 GitHub（微软）推出的 AI 编程助手，深度集成在 VS Code 中。

#### 核心功能详解

| 功能 | 快捷键 | 说明 | 使用场景 |
|------|--------|------|---------|
| **代码补全** | Tab（接受建议） | 写代码时自动建议后续内容 | 日常编码，效率提升 30-50% |
| **Chat** | `Ctrl+Shift+I` | 在侧边栏与 AI 对话 | 提问、解释、生成代码 |
| **Agent Mode** | Chat 中选择 | AI 自主规划多步任务 | 复杂任务（多文件修改） |
| **Inline Chat** | `Ctrl+I` | 在代码中直接对话 | 修改选中代码、添加功能 |
| **/explain** | `Ctrl+I` → `/explain` | 解释选中代码 | 理解陌生代码 |
| **/fix** | `Ctrl+I` → `/fix` | 自动修复问题 | 快速修复 lint 错误 |
| **/tests** | `Ctrl+I` → `/tests` | 生成单元测试 | 为函数添加测试 |
| **/doc** | `Ctrl+I` → `/doc` | 生成文档注释 | 为函数添加 JSDoc |
| **@workspace** | Chat 中 `@workspace` | 搜索整个工作区 | 跨文件理解项目 |
| **#editor** | Chat 中 `#editor` | 引用当前编辑器内容 | 基于当前代码提问 |

#### 对 Tech Writer 的最佳使用方式

1. **理解代码**：选中不懂的代码 → `Ctrl+I` → `/explain`
2. **修改 Prompt**：打开 Agent 文件 → `Ctrl+I` → "帮我在这个 Prompt 中添加一条关于术语一致性的检查规则"
3. **解决报错**：复制错误信息 → Chat → "这个错误是什么原因？怎么修？"
4. **学习概念**：Chat → "用通俗的语言解释 TypeScript 的 interface"
5. **写脚本**：Chat → "写一个 Node.js 脚本，读取 test 目录下的 txt 文件，统计词频"

#### 使用技巧

```
✅ 好的提问方式：
- "在 writer.agent.ts 的 systemPrompt 中添加对代码示例注释的检查"
- "这段代码在做什么？请逐行解释"（选中代码后使用）
- "这个函数接受什么参数？返回什么？"（选中函数签名后使用）

❌ 不好的提问方式：
- "帮我写一个程序"（太模糊）
- "这里有个 bug"（不提供上下文）
```

#### 📚 Copilot 资源

| 资源 | 说明 |
|------|------|
| [GitHub Copilot 官方文档](https://docs.github.com/en/copilot) | 完整功能介绍 |
| [Copilot Chat Cookbook](https://code.visualstudio.com/docs/copilot/copilot-chat-cookbook) | 实用场景和技巧 |
| [Copilot 最佳实践](https://github.blog/developer-skills/github/10-things-about-github-copilot/) | GitHub 官方博客 |

### 4.2.2 Cursor

Cursor 是一个基于 VS Code 的 **AI-first IDE**（AI 优先的代码编辑器）。与 Copilot（插件）不同，Cursor 从底层就为 AI 编程设计。

#### 核心功能

| 功能 | 快捷键 | 与 Copilot 对比 |
|------|--------|----------------|
| **Tab 补全** | Tab | 比 Copilot 更长的预测，支持多行同时补全 |
| **Cmd+K** | `Cmd+K`（Mac）/ `Ctrl+K`（Win） | 选中代码用自然语言编辑，Copilot 的 Inline Chat 对标 |
| **Composer** | `Cmd+I` | 多文件同时生成/编辑，Copilot Agent Mode 对标 |
| **Agent** | Composer 中选择 | 可运行终端命令、搜索代码库 |
| **.cursorrules** | 项目根目录 | 定义项目级 AI 行为规则（比 Copilot Instructions 更灵活） |
| **Context** | `@` 符号 | @Files, @Folders, @Code, @Docs, @Web, @Git |
| **Notepad** | - | 草稿本，保存常用 Prompt 和上下文 |

#### 与 Copilot 的选择建议

| 场景 | 推荐 |
|------|------|
| 日常编码、代码补全 | 两者差不多 |
| 多文件重构 | Cursor Composer 更强 |
| 项目级上下文理解 | Cursor Agent 更灵活 |
| VS Code 深度集成 | Copilot 更原生 |
| 价格 | Copilot 含 GitHub Pro，Cursor Pro $20/月 |
| Tech Writer 入门 | **先学 Copilot**（本项目已用 VS Code），再了解 Cursor |

#### 📚 Cursor 资源

| 资源 | 说明 |
|------|------|
| [Cursor 官方文档](https://docs.cursor.com/) | 完整使用指南 |
| [Cursor 入门教程](https://www.youtube.com/watch?v=oKjueqFfnYc) | 官方视频教程 |
| [.cursorrules 示例](https://cursor.directory/) | 社区分享的规则模板 |

### 4.2.3 其他 AI 编程工具

#### OpenCode

开源命令行 AI 编程工具，在终端中直接使用：
```bash
npm install -g @opencode-ai/opencode
opencode "解释这个项目的架构"
opencode "在 src/ 中搜索所有包含 'Agent' 的文件"
```

**特点**：开源免费、终端原生、支持多种 AI 模型

#### Claude Code（Anthropic 官方）

Anthropic 推出的命令行 AI Agent：
```bash
claude "帮我在这个项目中找到所有的 System Prompt，并分析它们的设计模式"
```

**特点**：Agent 能力极强，可自主搜索、编辑、执行命令，适合复杂任务

#### 其他值得关注的工具

| 工具 | 类型 | 特点 | 适合谁 |
|------|------|------|--------|
| **Windsurf** | IDE | AI-first，免费版功能丰富 | 不想付费 Cursor 的用户 |
| **Cline** | VS Code 扩展 | 开源、高度自主、支持多种 API | 喜欢开源和自定义的用户 |
| **Aider** | 命令行 | 专注代码编辑，支持多模型 | 终端爱好者 |
| **Codeium** | 多 IDE 扩展 | 超快代码补全，免费 | 只要补全不要 Chat 的用户 |
| **Amazon Q Developer** | 多 IDE 扩展 | AWS 生态深度集成 | AWS 用户 |
| **Tabnine** | 多 IDE 扩展 | 企业级代码补全，可私有部署 | 企业用户 |

---

## 4.3 Spec Coding（2.5h）

### 📌 什么是 Spec Coding？

> **Spec Coding = 先写规格说明书，再让 AI 生成代码**

传统开发：需求（脑子里）→ 边想边写代码 → 重构 → 再写 → ...
Spec Coding：需求 → 写详细的 Spec → AI 生成代码 → 人工审查修改 → 完成

### 📖 Spec 怎么写？

一个高质量的 Spec 包含以下要素：

```markdown
# Spec: 添加"术语一致性检查"审查规则

## 背景与动机（Why）
当前 ReviewerAgent 检查技术准确性、格式规范性，但不检查术语一致性。
例如：同一文档中 "PWM" 有时写 "PWM"，有时写 "pwm"，有时写 "脉冲宽度调制"。

## 目标（What）
在 ReviewerAgent 的审查维度中增加术语一致性检查。

## 具体需求（How）
### 后端改动
1. 修改 `reviewer.agent.ts` 的 System Prompt，添加：
   - 审查维度："术语一致性：检查技术术语在同一文档中的写法是否统一"
   - 输出格式：{ "type": "术语不一致", "termA": "...", "termB": "...", "location": "..." }

### 前端改动
2. 在 `ReviewCommentsView.tsx` 中添加对"术语不一致"类型的特殊渲染
   - 高亮显示不一致的术语
   - 提供"统一替换"建议

## 约束条件
- 不修改已有审查规则
- 术语检查只针对技术术语（不在通用词汇词典中的词）
- 输出保持与现有 ReviewComment 格式兼容

## 验收标准
- 输入一份含术语不一致的文档 → AI 输出中应包含术语不一致的审查意见
- 前端能正确展示术语不一致的卡片
```

### 📖 Spec Coding 工作流

```
1. 写 Spec（花 30% 时间）
   └→ 用上面模板，越详细越好

2. 把 Spec 交给 AI（花 5% 时间）
   └→ 在 Copilot Chat / Cursor Composer 中贴入 Spec

3. AI 生成代码（花 5% 时间）
   └→ AI 自动修改相关文件

4. 人工审查（花 40% 时间）
   └→ 逐文件确认修改是否正确
   └→ 运行测试验证

5. 迭代优化（花 20% 时间）
   └→ 不对的地方补充 Spec，回到第 2 步
```

### 📚 相关资源

| 资源 | 说明 |
|------|------|
| [Spec Coding 方法论](https://www.latent.space/p/spec-coding) | Spec Coding 提出者的深度文章 |
| [PRD 模板](https://www.atlassian.com/software/confluence/templates/product-requirements) | Atlassian 的 PRD 模板，可借鉴 |
| [Cursor Rules 模板](https://cursor.directory/) | 用作项目级 Spec 的起点 |

---

## 4.4 Vibe Coding（2h）

### 📌 什么是 Vibe Coding？

> **Vibe Coding = 通过自然语言对话让 AI 写代码，你只管"审"不管"写"**

这个术语由 Andrej Karpathy（OpenAI 联合创始人）在 2025 年提出：

> "There's a new kind of coding I call 'vibe coding', where you fully give in to the vibes, embrace exponentials, and forget that the code even exists."

### 📖 Vibe Coding 的核心理念

```
传统编程：你写代码 → 编译器检查 → 运行测试 → 调试
Vibe Coding：你描述需求 → AI 写代码 → 你审查 → 运行测试 → 描述修改 → AI 修改
```

**你不需要与代码细节斗争，你只需要：**
1. 清楚描述你想要什么
2. 审查 AI 输出的质量
3. 测试是否真的满足需求

### 📖 适合 vs 不适合

```
✅ 极度适合 Vibe Coding：
  - "帮我创建一个 React 组件，显示一个带搜索框的文件列表"
  - "把这个按钮从蓝色改成绿色，加个圆角和 hover 效果"
  - "给这个函数添加错误处理，如果文件不存在返回 null"
  - "把这个 500 行的函数拆成 3 个小函数"
  - "帮我写一个统计项目文件行数的脚本"

⚠️ Vibe Coding 但需要更多审查：
  - 修改跨多个文件的核心逻辑
  - 添加数据库迁移
  - 修改 IPC 通信协议

❌ 不适合 Vibe Coding：
  - 安全相关代码（加密、认证）
  - 性能关键路径（需要精确优化）
  - 你完全不了解的领域（无法审查质量）
  - "帮我重写整个项目"（太大，AI 会迷失）
```

### 📖 Vibe Coding 最佳实践

1. **小步快跑**：一次描述一个小的改动，确认后再继续
2. **描述结果，不描述过程**："让按钮在点击后显示 loading 状态并禁用" ✅ vs "在按钮上添加一个 state，在 onClick 里先 setState..." ❌
3. **提供上下文**：@file、@folder 告诉 AI 当前在哪个文件
4. **频繁提交 Git**：每完成一个小功能就 commit 一次，方便回滚
5. **AI 代码 = 第一稿**：你永远是最终负责人
6. **不理解就追问**：让 AI 解释它生成的代码，确保你理解了

### 📚 相关资源

| 资源 | 说明 |
|------|------|
| [Andrej Karpathy on Vibe Coding](https://x.com/karpathy/status/1886192184808149383) | Vibe Coding 概念提出者的原帖 |
| [Vibe Coding 101](https://www.youtube.com/watch?v=HfZESiAEdtc) | 入门视频教程 |
| [Prompting Guide for AI Coding](https://www.promptingguide.ai/zh/applications/coding) | AI 编程 Prompt 指南 |

---

## 4.5 AI 时代的超级学习法（3h）

### 4.5.1 AI 辅助学习

```
传统学习路径：看书 → 不理解 → 搜 StackOverflow → 试错 → 放弃
AI 辅助学习：遇到不懂 → 问 AI → AI 解释 → 追问 → 举例 → 理解 → 练习
```

**实用技巧**：

| 技巧 | 示例 Prompt |
|------|-----------|
| **概念类比** | "用餐厅点餐的流程解释 async/await" |
| **逐行解释** | "请逐行解释这段代码在做什么"（选中代码） |
| **我学我练** | "出 5 道 async/await 的练习题，从简单到困难" |
| **模拟面试** | "假装你是面试官，问我 5 个关于 React 的问题" |
| **纠错导师** | "这段代码有什么问题？怎么改进？" |
| **概念地图** | "帮我画一张 AI Agent 相关概念的关系图" |

### 4.5.2 AI 辅助调试

```
传统调试：看不懂报错 → Google → 试 5 个方案 → 可能修好
AI 调试：复制完整错误 → 贴给 AI → 分析 + 方案 + 预防建议
```

**调试加速技巧**：
- 复制**完整**错误堆栈，不是最后一行
- 告诉 AI **运行环境**（Node 版本、OS、框架版本）
- 告诉 AI **你已经试过什么**（避免重复建议）

### 4.5.3 AI 辅助 Prompt 开发

**Tech Writer 的终极超级工作流**：

```
1. 写初版 Prompt（发挥你作为 Tech Writer 的语言专业能力）
2. 用 AI 审查你的 Prompt：
   "你是一个 Prompt Engineering 专家。请审查这个 System Prompt，
    指出可以改进的地方，并给出优化后的版本"
3. A/B 测试：原版 vs AI 优化版，对比输出质量
4. 用不同模型测试（GPT-4o vs Claude vs DeepSeek）
5. 收集输出样本，建立评估标准
6. 迭代优化，持续改进
```

### 4.5.4 建立 AI 开发习惯

| 习惯 | 为什么重要 |
|------|-----------|
| **每 30 分钟 commit 一次** | AI 可能改坏，小步提交便于精确回滚 |
| **AI 代码 = 第一稿，你 = 主编** | 审查后再合入，你是最终负责人 |
| **不理解就追问到底** | 别让 AI 帮你积累了技术债 |
| **保存高质量 Prompt** | 好的 Prompt 是可复用资产，建立自己的 Prompt Library |
| **记录 AI 表现好/坏的场景** | 建立直觉：什么让 AI 做、什么自己做 |
| **每周回顾** | 这周用 AI 完成了什么？有什么可以改进的？ |

### 📚 AI 辅助开发资源汇总

| 资源 | 类型 | 说明 |
|------|------|------|
| [GitHub Copilot 文档](https://docs.github.com/en/copilot) | 📖 官方 | Copilot 完整使用指南 |
| [Cursor 官方文档](https://docs.cursor.com/) | 📖 官方 | Cursor IDE 完整指南 |
| [Vibe Coding 视频教程](https://www.youtube.com/results?search_query=vibe+coding+tutorial) | 🎬 视频 | YouTube 搜索 vibe coding |
| [AI Coding 最佳实践](https://github.com/features/copilot) | 📖 GitHub | GitHub 官方的 Copilot 使用技巧 |
| [Prompt Engineering for Coding](https://www.promptingguide.ai/zh/applications/coding) | 📖 指南 | AI 编程 Prompt 编写指南 |
| [Latent Space - Spec Coding](https://www.latent.space/) | 📖 播客/博客 | AI 工程前沿讨论 |
| [r/cursor](https://www.reddit.com/r/cursor/) | 💬 社区 | Cursor 使用经验和技巧分享 |
| [r/githubcopilot](https://www.reddit.com/r/githubcopilot/) | 💬 社区 | Copilot 使用经验 |

---

# 附录

## A. 学习资源汇总

| 类别 | 资源 | 类型 | 说明 |
|------|------|------|------|
| JS | [MDN JavaScript](https://developer.mozilla.org/zh-CN/docs/Learn/JavaScript) | 📖 | 最权威的免费教程（中文版） |
| JS | [现代 JavaScript 教程](https://zh.javascript.info/) | 📖 | 中文社区最推荐的 JS 教材 |
| JS | [You Don't Know JS Yet](https://github.com/getify/You-Dont-Know-JS) | 📖 | 深入理解 JS（进阶） |
| TS | [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) | 📖 | 官方手册，前 5 章 |
| TS | [TypeScript 入门教程](https://ts.xcatliu.com/) | 📖 | 国人写的通俗 TS 教程 |
| React | [React 官方教程](https://react.dev/learn) | 📖 | 新版官方教程，非常友好 |
| React | [Thinking in React](https://react.dev/learn/thinking-in-react) | 📖 | 理解 React 思维模式（必读） |
| Git | [Git 官方教程（中文）](https://git-scm.com/book/zh/v2) | 📖 | 前 3 章 |
| Git | [Learn Git Branching](https://learngitbranching.js.org/) | 🎮 | 交互式游戏 |
| Node.js | [Node.js 官方入门](https://nodejs.org/en/learn) | 📖 | 基础概念 |
| Tailwind | [Tailwind CSS Docs](https://tailwindcss.com/docs) | 📖 | 查 class 名用 |
| Zustand | [Zustand 官方文档](https://docs.pmnd.rs/zustand/getting-started/introduction) | 📖 | 10 分钟学会 |
| LLM | [Karpathy - Intro to LLMs](https://www.youtube.com/watch?v=zjkBMFhNj_g) | 🎬 | 1h 讲透 LLM |
| LLM | [The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) | 📖 | Transformer 图解 |
| Prompt | [OpenAI Prompt Engineering](https://platform.openai.com/docs/guides/prompt-engineering) | 📖 | 必读 |
| Prompt | [Anthropic Prompt Library](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview) | 📖 | 对比学习 |
| Prompt | [Prompt Engineering Guide](https://www.promptingguide.ai/zh) | 📖 | 最全面的中文 Prompt 指南 |
| Agent | [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | 📖 | Anthropic Agent 设计哲学 |
| Agent | [LLM Powered Autonomous Agents](https://lilianweng.github.io/posts/2023-06-23-agent/) | 📖 | Lilian Weng 的 Agent 综述 |
| MCP | [MCP 官方文档](https://modelcontextprotocol.io/) | 📖 | 协议规范 |
| AI 工具 | [Cursor 官方文档](https://docs.cursor.com/) | 📖 | AI-first IDE |
| AI 工具 | [GitHub Copilot 文档](https://docs.github.com/en/copilot) | 📖 | AI 编程助手 |
| 视频 | B站「技术胖」「coderwhy」 | 📺 | 前端入门 |
| 模型 | [Artificial Analysis](https://artificialanalysis.ai/) | 🛠️ | 独立模型评测 |
| 模型 | [OpenRouter](https://openrouter.ai/) | 🛠️ | 200+ 模型统一接入 |

## B. 学习节奏建议

```
Week 1-2：板块一为主（约 30h）
  ├── 每天 2h JS/TS 基础（跟着敲代码）
  ├── 穿插 Git + Node.js + 终端使用
  └── 周末集中学软件设计概念 + React

Week 3：板块一收尾 + 板块二开始（约 20h）
  ├── 完成 React 和设计思想部分
  ├── 开始 LLM 基础概念 + 模型介绍
  └── 周末：Prompt Engineering 入门

Week 4：板块二为主（约 28h）
  ├── Prompt Engineering（4h，最重要！）
  ├── OpenAI API 编程（3h，动手写脚本）
  ├── RAG + Agent 设计（5h）
  ├── Context/Loop Engineering + MCP + Skill（4h）
  └── 使用 AI Playground 测试 Prompt

Week 5：板块三（约 24h）
  ├── 项目架构精读（3h）
  ├── 目录结构详解（2h）
  ├── 核心模块深度解析（8h）
  ├── 环境搭建 + 首次运行（2h）
  ├── 修改 Prompt 实操（3h）
  └── 追踪调试 + 理解数据流（3h）

Week 6：板块三收尾 + 板块四（约 20h）
  ├── 更多动手实操（3h）
  ├── AI IDE 工具安装和体验（4h）
  ├── Spec Coding 练习（2h）
  ├── Vibe Coding 体验（2h）
  ├── AI 辅助学习技巧实践（2h）
  └── 整理学习笔记 + 速查手册（4h）
```

## C. 学习检查清单

### 板块一完成标志
- [ ] 能用 Git clone/pull/commit/push/log
- [ ] 能用终端 cd/ls/npm install/npm start
- [ ] 能看懂 JS 的变量声明、函数定义、async/await、数组方法
- [ ] 能读懂 TS 的 interface、type、?可选、|联合类型
- [ ] 能解释前后端分离的核心理念和好处
- [ ] 能说出模块化开发的 3 个黄金法则
- [ ] 能解释 React 的组件、props、state 是什么
- [ ] 能说出项目技术栈中 8 个以上技术及其作用

### 板块二完成标志
- [ ] 能解释 Token、Context Window、Temperature 的含义
- [ ] 能说出 GPT-4o / Claude / DeepSeek / Qwen 的核心差异
- [ ] 能用 CRISP 框架写好一个结构化 System Prompt
- [ ] 能解释 Prompt / Context / Loop Engineering 的区别和关系
- [ ] 能写一个调 OpenAI API（含 streaming）的 Node.js 脚本
- [ ] 能解释 RAG 三步流程及本项目的简化实现
- [ ] 能说出 Agent 比普通 LLM 调用多了哪几个关键能力
- [ ] 能解释 MCP 是什么和为什么需要它
- [ ] 能画出 Agentic Loop 的核心循环图

### 板块三完成标志
- [ ] 能画出项目的 Electron 三层架构图
- [ ] 能说出 20 个 Stage 的流程和 7 个 PAUSE_STAGES
- [ ] 能说出 5 个 Agent 各自的职责和输入输出
- [ ] 能解释 WorkflowEngine 的 Resume Promise 模式
- [ ] 能本地启动项目并跑通完整的文档生成流程
- [ ] 能修改一个 Agent 的 System Prompt 并验证效果
- [ ] 能追踪"用户点击开始→DraftViewer 显示内容"的完整数据流

### 板块四完成标志
- [ ] 能用 Copilot Chat 的 /explain 解释项目代码
- [ ] 能用 Copilot Inline Chat 修改代码
- [ ] 能按照 Spec Coding 方法写一个功能 Spec
- [ ] 能用 Vibe Coding 方式完成一个简单 UI 调整
- [ ] 能使用 AI 工具加速学习和调试

## D. 后续学习方向

完成本计划后，你可以根据兴趣和项目需要深入：

1. **Agent 进阶**：LangGraph 图状态机、Multi-Agent 协作模式、Agent 评估
2. **RAG 进阶**：向量数据库（Chroma/Milvus）、混合搜索、Graph RAG
3. **前端进阶**：React 性能优化（useMemo/useCallback/memo）、React Query、E2E 测试
4. **后端进阶**：Electron 安全性、进程间通信优化、SQLite 性能调优
5. **DevOps**：CI/CD（GitHub Actions）、自动化测试、Electron 签名和分发
6. **AI 前沿**：Fine-tuning（LoRA/QLoRA）、RLHF/DPO、模型评估体系
7. **Prompt 工程进阶**：DSPy（程序化 Prompt 优化）、自动 Prompt 搜索、Evals 框架

