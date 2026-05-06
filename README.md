# learn-langchain.js

> LangChain.js LCEL 教学演示：从 PromptTemplate 到任务拆解

本项目通过一个完整的"前端知识卡片生成器"案例，演示 LangChain.js 的核心工程思想：

- **PromptTemplate**：把 Prompt 拆成模板 + 参数，解决字符串拼接的可维护性问题
- **LCEL（链式调用）**：用 `.pipe()` 描述数据流，替代命令式的步骤控制
- **任务拆解**：复杂任务拆成多个单一目标，每个子链只做一件事
- **RunnableSequence**：把多个 Runnable 串成一条流水线，实现自动数据接力

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

## 运行

```bash
npm run dev
```

源文件：[src/runnable-sequence.ts](src/runnable-sequence.ts)

## 案例解析

### 案例目标

输入一个前端概念（如"闭包"），自动生成：

1. **详细解释**（给新人看，不超过 300 字）
2. **精简要点**（3 个核心要点，每点不超过 20 字）
3. **JSON 结构**（方便前端渲染）

### 数据流全景

```
输入 { topic: "闭包" }
  ↓
[任务A] explainChain → 详细解释文本
  ↓
[任务B] summaryChain → 3 个核心要点
  ↓
[任务C] formatChain → JSON 结构化结果
```

### 代码结构

| 部分 | 说明 |
|---|---|
| **PromptTemplate** | 三个模板分别负责解释、总结、格式化 |
| **子链** | `explainChain` / `summaryChain` / `formatChain`，每个只做一件事 |
| **RunnableSequence** | 把三个子链串成流水线，数据自动接力 |

### 核心代码片段

```ts
// 每个子链：PromptTemplate → LLM → StringOutputParser
const explainChain = explainPrompt.pipe(llm).pipe(parser);

// 串联成流水线：Step1 → Step2 → Step3
const fullChain = RunnableSequence.from([
  async (input) => {
    const explanation = await explainChain.invoke({ topic: input.topic });
    return { explanation };
  },
  async (data) => {
    const summary = await summaryChain.invoke({ explanation: data.explanation });
    return { explanation: data.explanation, summary };
  },
  async (data) => {
    const json = await formatChain.invoke({
      explanation: data.explanation,
      summary: data.summary,
    });
    return json;
  },
]);

// 一次 invoke，数据自动流过所有步骤
const result = await fullChain.invoke({ topic: "闭包" });
```

### 关键概念

| 概念 | 说明 |
|---|---|
| **Task Decomposition** | 一个 Prompt 同时做多件事会"注意力分散"，拆成多个单一任务效果更好 |
| **Runnable** | LangChain 中所有组件（PromptTemplate、LLM、Parser）都实现了 Runnable 接口，拥有 `invoke` / `stream` / `batch` 方法 |
| **.pipe()** | 把两个 Runnable 串联，上游的输出自动传给下游的输入 |
| **RunnableSequence** | 把多个 Runnable 按顺序串成一条流水线，数据自动接力 |
| **数据接力** | 每一步的输出成为下一步的输入，无需手动传递中间变量 |

## 构建与类型检查

```bash
npm run build
npm run typecheck
```
