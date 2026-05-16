# learn-langchain.js

> LangChain.js 大模型应用开发教学项目 — 从基础调用到 LangGraph 工作流，8 个分支逐步掌握核心概念

LangChain.js 是连接大模型与应用的核心框架，用极少量代码即可对接几乎所有主流大模型，无需关心底层接口差异。本项目通过 8 个递进分支，帮助你系统学习 LangChain.js 的核心用法。

## 学习路线

- [X] [**v1.0** 大模型基础调用](https://github.com/yuanjingteam/learn-langchain.js/tree/v1.0)  | invoke、messages、stream、batch、structuredOutput 5 种调用方式
- [X] [**2.0** 消息与工具调用](https://github.com/yuanjingteam/learn-langchain.js/tree/2.0)    | 消息类型、ToolMessage、完整工具调用流程
- [X] [**3.0** 提示词与链式调用](https://github.com/yuanjingteam/learn-langchain.js/tree/3.0) | PromptTemplate、LCEL、AI 面试助手案例
- [X] [**4.0** 多链编排](https://github.com/yuanjingteam/learn-langchain.js/tree/4.0)               | RunnableSequence、任务拆解、数据接力
- [X] [**5.0** 决策系统](https://github.com/yuanjingteam/learn-langchain.js/tree/5.0)               | ReAct 模式、Tool Calling Agent、Plan & Execute
- [X] [**6.0** 记忆系统](https://github.com/yuanjingteam/learn-langchain.js/tree/6.0)                | 对话历史管理、上下文窗口、长期记忆存储
- [X] [**7.0** RAG 全流程](https://github.com/yuanjingteam/learn-langchain.js/tree/7.0)           | 文档加载、向量存储、检索增强生成、知识库问答
- [X] [**8.0** LangGraph 工作流](https://github.com/yuanjingteam/learn-langchain.js/tree/8.0)         | StateGraph、条件路由、Checkpoint、多 Agent 协作

## 环境要求

- Node.js >= 18

## 安装

```bash
npm install
```

## 环境变量

在项目根目录下创建 `.env` 文件，填入 API Key（该文件已被 `.gitignore` 忽略，不会提交到仓库）：

```
QWEN_API_KEY=your-api-key-here
```

## 切换分支学习

```bash
# 切换到对应分支
git checkout v1.0   # 大模型基础调用
git checkout 2.0    # 消息与工具调用
git checkout 3.0    # 提示词与链式调用
git checkout 4.0    # 多链编排
git checkout 5.0  # 决策系统
git checkout 6.0  # 记忆系统
git checkout 7.0  # RAG 全流程
git checkout 8.0  # LangGraph 工作流
```

## 各分支详解

### v1.0 — 大模型基础调用

通过 5 个示例快速掌握对接千问、DeepSeek 等主流大模型的核心调用方式。

| 命令                        | 说明             |
| --------------------------- | ---------------- |
| `npm run dev`             | 创建大模型对象   |
| `npm run demo:invoke`     | 非流式调用       |
| `npm run demo:messages`   | 标准消息格式调用 |
| `npm run demo:stream`     | 流式调用         |
| `npm run demo:batch`      | 批量调用         |
| `npm run demo:structured` | 结构化输出       |

**5 种调用方式对比：**

| 对比项   | invoke           | messages         | stream           | batch           | structuredOutput               |
| -------- | ---------------- | ---------------- | ---------------- | --------------- | ------------------------------ |
| 方法     | `llm.invoke()` | `llm.invoke()` | `llm.stream()` | `llm.batch()` | `llm.withStructuredOutput()` |
| 返回方式 | 一次性返回       | 一次性返回       | 逐块流式返回     | 一次性批量返回  | 一次性返回                     |
| 适用场景 | 快速测试         | 多轮对话开发     | 聊天界面实时输出 | 高并发批量处理  | 程序消费结构化数据             |

---

### 2.0 — 消息与工具调用

演示消息调用、工具消息、真实工具调用等核心用法。

| 命令                          | 说明                 |
| ----------------------------- | -------------------- |
| `npm run dev`               | 创建模型对象         |
| `npm run demo:messages`     | 消息的基本使用       |
| `npm run demo:tool-message` | 工具消息 ToolMessage |
| `npm run demo:tool-calling` | 完整工具调用示例     |

**学习要点：**

- 消息类型：SystemMessage、HumanMessage、AIMessage、ToolMessage
- AIMessage 中 `tool_calls` 的结构（工具名、参数、调用ID）
- ToolMessage 中 `tool_call_id` 如何与 `tool_calls` 关联
- 完整工具调用流程：用户提问 → 模型决定调工具 → 工具结果 → 模型生成回复

---

### 3.0 — 提示词与链式调用

演示工程化提示词（PromptTemplate）、链式调用（LCEL）、案例：AI 面试助手等。

| 命令                             | 说明                    |
| -------------------------------- | ----------------------- |
| `npm run dev`                  | 创建模型对象            |
| `npm run demo:prompt-template` | PromptTemplate 基础用法 |
| `npm run demo:chain`           | LCEL 链式调用           |
| `npm run demo:interview`       | AI 面试助手案例         |
| `npm run demo:lcel`            | LCEL 三节点链           |

**学习要点：**

- **PromptTemplate**：将 Prompt 拆成模板（结构）+ 参数（数据），解决字符串拼接的可维护性问题
- **LCEL 链式调用**：使用 `.pipe()` 将模板和模型串联，一次 `invoke` 自动完成数据注入和模型调用
- **三节点链**：prompt → model → parser，理解"一切皆可拼接"的设计思想

---

### 4.0 — 多链编排

通过"前端知识卡片生成器"案例，演示多链编排与任务拆解。

| 命令            | 说明         |
| --------------- | ------------ |
| `npm run dev` | 运行完整案例 |

**案例目标：** 输入一个前端概念（如"闭包"），自动生成详细解释、精简要点、JSON 结构。

**数据流全景：**

```
输入 { topic: "闭包" }
  ↓
[任务A] explainChain → 详细解释文本
  ↓
[任务B] summaryChain → 3 个核心要点
  ↓
[任务C] formatChain → JSON 结构化结果
```

**关键概念：**

| 概念               | 说明                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Task Decomposition | 一个 Prompt 同时做多件事会"注意力分散"，拆成多个单一任务效果更好                          |
| Runnable           | LangChain 中所有组件都实现了 Runnable 接口，拥有 `invoke` / `stream` / `batch` 方法 |
| `.pipe()`        | 把两个 Runnable 串联，上游的输出自动传给下游的输入                                        |
| RunnableSequence   | 把多个 Runnable 按顺序串成一条流水线，数据自动接力                                        |

---

### 5.0 — 决策系统

构建具备自主决策能力的 AI Agent，实现多步骤任务的自动规划与执行。

**计划内容：**

- **ReAct 模式**：Reasoning + Acting 循环，模型先思考再行动，观察结果后继续推理
- **Tool Calling Agent**：基于工具调用的 Agent，自动选择合适的工具完成任务
- **Plan & Execute**：先制定执行计划，再逐步执行，适合复杂多步骤任务

**核心概念：**

| 概念           | 说明                                     |
| -------------- | ---------------------------------------- |
| Agent          | 能够自主决策、选择工具、执行任务的智能体 |
| ReAct          | 思考→行动→观察→思考的循环模式         |
| Plan & Execute | 先规划后执行，适合复杂任务分解           |

---

### 6.0 — 记忆系统

为 AI 应用添加记忆能力，实现多轮对话和上下文理解。

**计划内容：**

- **对话历史管理**：BufferMemory、WindowMemory、SummaryMemory
- **上下文窗口**：滑动窗口策略、Token 计数与截断
- **长期记忆存储**：向量存储对话历史、基于检索的记忆召回

**核心概念：**

| 概念          | 说明                                 |
| ------------- | ------------------------------------ |
| BufferMemory  | 完整保存所有对话历史                 |
| WindowMemory  | 只保留最近 K 轮对话                  |
| SummaryMemory | 将历史对话压缩为摘要                 |
| 向量记忆      | 将对话向量化存储，按语义检索相关记忆 |

---

### 7.0 — RAG 全流程

通过 4 个递进案例，掌握 RAG（检索增强生成）的核心流程：文档加载 → 文本分割 → 向量化 → 检索 → 生成。

| 命令                | 说明                                |
| ------------------- | ----------------------------------- |
| `npm start`         | 案例一：构建向量索引 + 检索测试     |
| `npm run rag-basic` | 案例二：基础 RAG（直接调用 LLM）    |
| `npm run rag-chain` | 案例三：RAG Chain（LangChain 流水线）|
| `npm run dev`       | 案例四：RAG Web 服务（Express）     |

**学习路线：**

```
案例一 ──→ 案例二 ──→ 案例三 ──→ 案例四
向量索引    基础RAG    RAG Chain   RAG服务

PDF加载     直接拼接    Prompt模板   Express
文本分割    LLM调用    Chain编排    流式输出
向量存储    手动检索    自动流水线   对话历史
检索测试                               MMR检索

── 理解度递增，工程复杂度递增 ──>
```

**案例一：构建向量索引** — 将 PDF 文档向量化存储，验证语义检索效果。使用 `PDFLoader` 加载文档，`RecursiveCharacterTextSplitter` 分割文本，`FaissStore` 构建向量索引。

**案例二：基础 RAG** — 在案例一基础上加入 LLM 生成回答。检索相关文档拼接到 prompt，让 LLM 根据上下文回答问题，优先加载本地索引避免重复构建。

**案例三：RAG Chain** — 使用 LangChain Chain 编排重构案例二。`RunnablePassthrough.assign` 自动检索，`PromptTemplate` 模板化 prompt，`StringOutputParser` 解析输出，一行 `chain.invoke()` 完成全流程。

**案例四：RAG Web 服务** — 封装为完整的 Web 服务。支持多格式文档加载（PDF/Word/PPT/CSV/EPUB/Markdown），SSE 流式输出，对话历史管理，Similarity 和 MMR 两种检索模式。

**核心概念：**

| 概念               | 说明                                                         |
| ------------------ | ------------------------------------------------------------ |
| Document Loader    | 将文件加载为 Document 对象（PDFLoader、TextLoader 等）       |
| Text Splitter      | 将长文档分割为适合向量化的小块                               |
| Embedding          | 将文本转换为高维向量，用于计算语义相似度                     |
| Vector Store       | 存储和检索向量的数据库（FaissStore / MemoryVectorStore）     |
| Retriever          | 根据查询从 Vector Store 中检索相关文档                       |
| Prompt Template    | 可复用的 prompt 模板，支持变量替换                           |
| Chain              | LangChain 的流水线编排，将多个步骤串联执行                   |
| Similarity 检索    | 返回与查询最相似的 Top-K 个文档                              |
| MMR 检索           | Maximum Marginal Relevance，兼顾相关性和多样性               |

**数据流全景：**

```
文档 → 分割 → 嵌入 → 向量存储
                         ↓
用户问题 → 嵌入 → 相似度检索 → 相关文档片段
                                   ↓
              用户问题 + 相关文档 → LLM → 回答
```

---

### 8.0 — LangGraph 工作流

通过 4 个递进案例，突破 LCEL 单向链的局限，使用 LangGraph 构建支持循环、分支、状态持久化的复杂工作流，是构建生产级 Agent 应用的关键一步。

| 命令                    | 说明                                       |
| ----------------------- | ------------------------------------------ |
| `npm start`             | 案例一：StateGraph 基础（线性图）          |
| `npm run agent-loop`    | 案例二：条件路由与 Agent 循环              |
| `npm run checkpoint`    | 案例三：Checkpoint 持久化与人工审批        |
| `npm run dev`           | 案例四：Self-RAG 自我修正工作流            |

**学习路线：**

```
案例一 ──→ 案例二 ──→ 案例三 ──→ 案例四
StateGraph   条件路由    Checkpoint    Self-RAG
线性图      Agent循环    持久化       自我修正

State定义   MessagesAnnotation  MemorySaver   向量检索
Node函数    ToolNode           interrupt     相关性评分
Edge连接    toolsCondition     时间旅行      答案评估
                                Human-in-loop 问题重写

── 理解度递增，工程复杂度递增 ──>
```

**案例一：StateGraph 基础** — 演示 LangGraph 三大要素：State（通过 Annotation 定义共享状态）、Node（执行任务并返回状态更新的函数）、Edge（节点间的连接）。场景为前端知识卡片生成器（与 4.0 的多链编排做对比），流程：explain（详细解释） → summarize（3 个要点） → format（JSON）。

**案例二：条件路由与 Agent 循环** — 在案例一线性图的基础上引入条件边：`addConditionalEdges` 根据状态动态决定下一节点，使用内置的 `MessagesAnnotation`（带 reducer，自动追加消息）、`ToolNode`（工具执行节点）、`toolsCondition`（路由函数），形成 agent ↔ tools 循环，构成 ReAct 风格的 Tool Calling Agent。

**案例三：Checkpoint 持久化与 Human-in-the-loop** — 在案例二基础上引入 `MemorySaver`（内存版 checkpointer）、`thread_id`（会话标识，同一 thread 多次调用状态自动累积）、`interruptBefore`（执行某节点前暂停等待人工审批）、`getState` / `getStateHistory`（查看当前状态与历史 checkpoint，实现时间旅行）。

**案例四：Self-RAG 自我修正工作流** — 综合运用前三个案例的能力，构建会"自我反思"的 RAG：retrieve → grade_documents → 有相关文档则 generate，否则 transform_query 重写问题回到 retrieve → grade_generation 评估答案 → useful 则输出，not_supported（幻觉）则重新生成，not_useful 则重写问题。复用 7.0 分支的 FaissStore 向量索引。

**核心概念：**

| 概念              | 说明                                                       |
| ----------------- | ---------------------------------------------------------- |
| StateGraph        | 以状态图方式编排工作流，支持循环、分支、并行               |
| Node              | 图中的节点，执行具体任务并返回状态更新                     |
| Edge              | 节点间的连接，分为普通边和条件边（Conditional Edge）       |
| State             | 贯穿整个图的共享状态，由 Annotation 定义结构与 reducer     |
| Checkpoint        | 状态快照机制，支持持久化、恢复与时间旅行                   |
| Human-in-the-loop | 在关键节点暂停执行，等待人工审批后继续                     |
| Multi-Agent       | 多个 Agent 协作完成任务，常见模式有 Supervisor、Swarm      |

**边的类型：**

| 类型   | 说明                                        |
| ------ | ------------------------------------------- |
| 普通边 | `addEdge(from, to)`，固定的下一节点       |
| 条件边 | `addConditionalEdges(from, fn)`，动态路由  |
| 入口边 | `addEdge(START, node)`，定义图的起点       |
| 出口边 | `addEdge(node, END)`，定义图的终点         |

**LCEL vs LangGraph 对比：**

| 对比项   | LCEL（Chain）        | LangGraph              |
| -------- | -------------------- | ---------------------- |
| 结构     | 单向流水线           | 有向图（支持循环）     |
| 状态     | 数据沿管道流动       | 全局共享状态           |
| 适用场景 | 线性任务、简单编排   | Agent 循环、复杂工作流 |
| 持久化   | 无内置支持           | 内置 Checkpoint        |
| 人工干预 | 难以实现             | 原生支持               |

**数据流全景：**

```
案例一：线性图
  { topic } → explain → summarize → format → JSON

案例二：Agent 循环
  question → agent ⇄ tools → answer
                 ↑ tool_calls    ↓ tool_results

案例三：持久化 + 人工审批
  question → [interrupt] → 人工审批 → agent ⇄ tools → answer
                               ↓
                          checkpoint 保存/恢复/时间旅行

案例四：Self-RAG 自我修正循环
  question → retrieve → grade_documents ─┬─ 有相关 → generate → grade_evaluation ─┬─ useful → END
                                         └─ 无相关 → transform_query ──┘          ├─ not_supported → generate
                                                   ↑                                └─ not_useful → transform_query
                                                   └────────────────────────────────────────────┘
```

## 构建与类型检查

```bash
npm run build
npm run typecheck
```
