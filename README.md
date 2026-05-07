# learn-langchain.js

> LangChain.js 决策系统教学演示：从 ReAct 到 Plan & Execute

## 课程目标

通过 5 个递进的 Agent 案例，掌握 AI Agent 的核心能力 — **自主决策**。学完本课程，你将理解：

- Agent 如何自主选择工具并完成任务
- 从手写实现到框架封装的演进路径
- 单步推理（ReAct）与多步规划（Plan & Execute）的适用场景

## 学习路线图

```
案例一 ──→ 案例二 ──→ 案例三     案例四 ──→ 案例五
 ReAct    Tool Calling  createAgent  Plan & Execute  Plan & Execute
（手写）   （手写）     （框架）     （手写）         （LangGraph）

 Prompt    Function     框架自动     while 循环       StateGraph
 解析      Calling      封装         手动管理状态     声明式定义图
    ↓          ↓           ↓            ↓                ↓
 理解       理解        一行代码      理解规划         声明式
 循环       机制        搞定         逻辑             流程控制

 ─── 工具调用方式的演进 ───>    ─── 流程控制方式的演进 ───>
```

## 环境准备

```bash
# 安装依赖
npm install

# 配置 API Key（在项目根目录创建 .env 文件）
echo "QWEN_API_KEY=your-api-key-here" > .env
```

## 运行案例

```bash
npm run dev:react          # 案例一：ReAct（手写）
npm run dev:tool-calling   # 案例二：Tool Calling（手写）
npm run dev:react-plus     # 案例三：createAgent（框架）
npm run dev:plan           # 案例四：Plan & Execute（手写）
npm run dev:plan-graph     # 案例五：Plan & Execute（LangGraph）
```

---

## 案例一：ReAct 模式（手写实现）

> 源文件：[src/react-agent.ts](src/react-agent.ts) · 运行：`npm run dev:react`

### 学习目标

理解 Agent 的最基本工作方式 — **Thought → Action → Observation 循环**。这是所有 Agent 的底层逻辑。

### 核心思想

ReAct = **Re**asoning + **Act**ing。模型每一步先思考该做什么（Thought），再执行动作（Action），观察结果（Observation），然后继续推理。

```
Question: 北京今天天气怎么样？
  ↓
Thought: 我需要查询北京的天气信息
  ↓
Action: search[北京天气]
  ↓
Observation: 北京今天晴，25°C，微风          ← 工具返回的真实结果
  ↓
Thought: 我已经获取到天气信息，可以回答用户了
  ↓
Final Answer: 北京今天晴，25°C，微风
```

### 关键实现要点

| 要点 | 说明 |
|---|---|
| Prompt 引导 | 通过模板强制模型按 `Thought/Action/Observation` 格式输出 |
| 正则解析 | 用 `/Action:\s*(\w+)\[(.*?)\]/` 从文本中提取工具名和参数 |
| 上下文拼接 | 将 Observation 注入上下文，让模型在下一步"看到"工具结果 |

### 观察重点

运行后观察模型的输出格式 — 模型是否严格按 `Thought → Action → Observation` 的格式输出？如果不按格式输出会怎样？这正是手写解析的**脆弱性**。

### 局限性

- 依赖文本解析，模型输出格式不稳定时容易出错
- 工具调用结果通过文本拼接注入，无法利用 LLM 原生结构化能力
- 上下文越长成本越高

---

## 案例二：Tool Calling Agent（手写实现）

> 源文件：[src/tool-calling-agent.ts](src/tool-calling-agent.ts) · 运行：`npm run dev:tool-calling`

### 学习目标

理解 LLM 的 **原生 Function Calling** 能力 — 这是案例一中"文本解析"的**进化替代方案**，模型直接输出结构化的工具调用 JSON。

### 与案例一的关键区别

| 对比 | 案例一 ReAct | 案例二 Tool Calling |
|---|---|---|
| 工具调用方式 | Prompt 引导 → 正则解析文本 | LLM 原生 Function Calling |
| 输出格式 | 自然语言，格式不稳定 | 结构化 JSON，格式可靠 |
| 多工具并行 | 不支持 | 支持（单次返回多个 tool_calls） |
| 核心依赖 | `PromptTemplate` + 正则 | `bindTools` + `ToolMessage` |

### 执行流程

```
用户: 北京今天天气怎么样？适合出门吗？
  ↓
LLM 分析 → 输出 tool_calls: [{ name: "search", args: { query: "北京天气" } }]
  ↓
代码执行工具 → 将结果封装为 ToolMessage 放回 messages
  ↓
LLM 再次处理 → 基于工具结果生成自然语言回答
```

### 关键实现要点

```ts
// 1. 用 tool() + Zod schema 定义工具（LLM 能理解参数结构）
const searchTool = tool(async ({ query }) => { ... }, {
  name: "search",
  description: "搜索网络信息",
  schema: z.object({ query: z.string().describe("搜索关键词") }),
});

// 2. 将工具绑定到 LLM
const llmWithTools = llm.bindTools(tools);

// 3. Agent 循环：调用 LLM → 检查 tool_calls → 执行工具 → 结果回传 → 再次调用 LLM
const response = await llmWithTools.invoke(messages);
if (response.tool_calls?.length) {
  for (const toolCall of response.tool_calls) {
    const result = await toolsByName[toolCall.name].invoke(toolCall.args);
    messages.push(new ToolMessage({ content: result, tool_call_id: toolCall.id }));
  }
  // 继续循环，直到 LLM 不再请求工具调用
}
```

### 观察重点

- 对比案例一：这里**没有正则解析**，工具调用请求是 LLM 原生返回的结构化对象
- 注意 `messages` 数组的角色 — 它是 Agent 的"记忆"，所有对话历史都在里面
- 尝试把问题改为 `"你好"`，观察模型是否直接回答而不调用工具

---

## 案例三：createAgent（LangChain v1 框架实现）

> 源文件：[src/react-agent-plus.ts](src/react-agent-plus.ts) · 运行：`npm run dev:react-plus`

### 学习目标

了解 LangChain v1 的标准 Agent 构建方式 — 框架**自动完成**案例二中你手写的所有逻辑。

### 与案例二的对比

| 对比 | 案例二（手写） | 案例三（框架） |
|---|---|---|
| 循环管理 | 手写 for 循环 | 框架自动管理（基于 LangGraph StateGraph） |
| 消息处理 | 手动维护 messages 数组 | 框架内部自动处理 |
| 错误处理 | 需手动编写 | 框架内置 |
| 代码量 | ~50 行 Agent 循环 | ~10 行配置 |

### 核心代码

```ts
import { createAgent, tool } from "langchain";

// 配置 → 完成
const agent = createAgent({
  model: llm,                                    // 语言模型
  tools: [searchTool, calculatorTool],           // 工具数组
  systemPrompt: "你是一个智能助手，善于使用工具来回答用户的问题。",
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "北京今天天气怎么样？" }],
});
```

### 观察重点

- 跑完案例二后再跑案例三，对比输出结果 — 核心逻辑一致，但代码量大幅减少
- 思考：`createAgent` 内部做了什么？→ 就是案例二的那套循环 + 消息管理

---

## 案例四：Plan & Execute（手写实现）

> 源文件：[src/plan-and-execute.ts](src/plan-and-execute.ts) · 运行：`npm run dev:plan`

### 学习目标

理解 **多步骤规划** 模式 — 当任务太复杂，Agent 无法一步完成时，先制定计划再逐步执行。

### 三个核心角色

```
Planner（规划者）         Executor（执行者）         Replanner（重规划者）
  分析任务，制定计划   →    逐个执行计划步骤    →     评估结果，调整计划
                                                    ↑___________↓（循环）
```

### 与 ReAct 的对比

| 对比 | ReAct | Plan & Execute |
|---|---|---|
| 决策方式 | 每步独立决策 | 先全局规划，再逐步执行 |
| 适用场景 | 简单问答、单步工具调用 | 复杂多步骤任务 |
| 计划能力 | 无 | 有，支持动态重规划 |
| 可追溯性 | 低 | 高（计划可审查） |

### 执行流程

```
📋 任务：了解北京的美食文化，包括历史背景和推荐餐厅

📝 初始计划：
  1. 搜索北京美食的基本信息
  2. 了解北京美食的历史背景
  3. 推荐值得去的餐厅

🔄 执行步骤 [1/3]：搜索北京美食的基本信息
  ✅ 结果：北京著名美食：烤鸭、炸酱面、豆汁焦圈...
  📋 继续执行剩余计划...

🔄 执行步骤 [2/3]：了解北京美食的历史背景
  ✅ 结果：北京烤鸭起源于南北朝...
  📋 继续执行剩余计划...

🔄 执行步骤 [3/3]：推荐值得去的餐厅
  ✅ 结果：全聚德创立于1864年，大董以酥不腻烤鸭闻名...

🎉 任务完成！
```

### 关键实现要点

```ts
// 主循环：逐步执行计划，每步后检查是否需要重规划
let steps = await planTask(task);
let currentStepIndex = 0;

while (currentStepIndex < steps.length) {
  const currentStep = steps[currentStepIndex];
  const result = await executeStep(currentStep);
  currentStepIndex++;

  // Replanner 评估剩余计划是否还有必要继续
  const replanResult = await shouldReplan(task, completed, steps.slice(currentStepIndex));

  if (replanResult.status === "complete") {
    return replanResult.result;       // 任务完成
  }
  // 否则继续执行下一步
}
```

### 观察重点

- 对比案例五：两者 Planner、Executor、Replanner 的 Prompt 完全相同，唯一区别是流程控制方式
- 案例四用 `while` 循环 + `currentStepIndex` 手动管理状态流转
- 思考：当流程变复杂（比如需要分支、并行），手写循环会变得很困难 → 这就是案例五要解决的问题

---

## 案例五：Plan & Execute（LangGraph 实现）

> 源文件：[src/plan-and-execute-langgraph.ts](src/plan-and-execute-langgraph.ts) · 运行：`npm run dev:plan-graph`

### 学习目标

用 LangGraph 的 `StateGraph` **声明式地定义** 执行流程 — 同样的业务逻辑，换一种组织方式，代码更清晰、更易维护。

### 与案例四的对比

| 对比 | 案例四（手写） | 案例五（LangGraph） |
|---|---|---|
| 流程控制 | `while` 循环 + `if/else` | `StateGraph` 声明式 |
| 状态管理 | 手动维护变量（steps、completed、iteration） | `Annotation` 自动管理 |
| 分支逻辑 | 嵌套条件判断 | `addConditionalEdges` |
| 可读性 | 命令式，需逐行阅读 | 图结构，一目了然 |
| 可扩展性 | 需修改循环逻辑 | 添加节点/边即可 |

### 图结构

```
[START]
  ↓
[planner] ──→ [executor] ──→ [replanner] ──→ (循环) ──→ [executor]
                                ↓
                         (任务完成) ──→ [END]
```

### 关键实现要点

```ts
// 1. Annotation 定义共享状态（每个节点读写这些字段）
const PlanExecuteState = Annotation.Root({
  task:     Annotation<string>(),
  plan:     Annotation<string[]>({ reducer: (_prev, next) => next }),
  completed:Annotation<string[]>({ reducer: (prev, next) => [...prev, ...next] }),
  currentStepIndex: Annotation<number>({ reducer: (_prev, next) => next }),
  result:   Annotation<string>({ reducer: (_prev, next) => next }),
});

// 2. StateGraph 构建执行图
const graph = new StateGraph(PlanExecuteState)
  .addNode("planner", planNode)
  .addNode("executor", executeNode)
  .addNode("replanner", replanNode)
  .addEdge(START, "planner")
  .addConditionalEdges("planner", shouldContinue)    // plan 后判断下一步
  .addConditionalEdges("executor", () => "replanner") // 执行后总是重规划
  .addConditionalEdges("replanner", afterReplan)      // 重规划后继续或结束
  .compile();

// 3. 一行执行
const result = await graph.invoke({ task: "了解北京美食文化" });
```

### 观察重点

- `Annotation` 中的 `reducer` 是关键 — 它定义了多个节点如何**合并**状态
  - `completed` 用 `[...prev, ...next]` 追加
  - `plan` 用 `next` 替换
- 节点名不能和状态属性名重名（比如状态字段叫 `plan`，节点就不能叫 `"plan"`）
- 条件路由函数返回节点名字符串，LangGraph 据此决定下一步去哪个节点

---

## 核心概念速查

### Agent 基础

| 概念 | 说明 |
|---|---|
| **Agent** | 能自主决策、选择工具、执行任务的智能体 |
| **ReAct** | 思考 → 行动 → 观察的循环推理模式 |
| **Tool Calling** | LLM 原生的 Function Calling，输出结构化工具调用 JSON |
| **bindTools** | 将工具 schema 注册到 LLM，使其具备 Function Calling 能力 |
| **ToolMessage** | 工具执行结果的消息封装，需携带 `tool_call_id` 与请求对应 |
| **createAgent** | LangChain v1 标准 Agent 构建方式，自动管理 ReAct 循环与工具调用 |

### Plan & Execute 规划系统

| 概念 | 说明 |
|---|---|
| **Planner** | 分析任务，制定可执行的步骤计划 |
| **Executor** | 逐步执行计划中的每个步骤 |
| **Replanner** | 根据执行结果评估并动态调整计划 |
| **Plan & Execute** | 先规划后执行的模式，适合复杂多步骤任务 |

### LangGraph 图编排

| 概念 | 说明 |
|---|---|
| **StateGraph** | LangGraph 的核心图构建器，用节点和边声明式定义执行流程 |
| **Annotation** | 状态定义方式，通过 `reducer` 控制节点间的合并逻辑 |
| **addNode** | 向图中添加节点，节点是一个接收 state 并返回更新的函数 |
| **addEdge** | 添加无条件边，从一个节点直接指向另一个节点 |
| **addConditionalEdges** | 添加条件边，根据函数返回值动态决定下一步去哪个节点 |
| **START / END** | 图的入口和出口常量 |

---

## 项目结构

```
src/
├── react-agent.ts               # 案例一：ReAct（手写 Prompt 解析）
├── tool-calling-agent.ts        # 案例二：Tool Calling（手写 Function Calling 循环）
├── react-agent-plus.ts          # 案例三：createAgent（LangChain v1 框架实现）
├── plan-and-execute.ts          # 案例四：Plan & Execute（手写 while 循环）
└── plan-and-execute-langgraph.ts # 案例五：Plan & Execute（LangGraph StateGraph）
```

## 构建与类型检查

```bash
npm run build       # 编译 TypeScript
npm run typecheck   # 仅检查类型，不输出文件
```
