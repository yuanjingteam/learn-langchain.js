/**
 * 案例二：条件路由与 Agent 循环
 *
 * 在案例一线性图的基础上，引入：
 *   - addConditionalEdges：条件边，根据状态动态决定下一节点
 *   - MessagesAnnotation：内置的消息状态（带 reducer，自动追加消息）
 *   - ToolNode：内置的工具执行节点
 *   - toolsCondition：内置的路由函数（有 tool_calls → tools，否则 → END）
 *
 * 形成 agent ↔ tools 循环，构成 ReAct 风格的 Tool Calling Agent。
 */

import dotenv from "dotenv";
dotenv.config();

import {
  StateGraph,
  START,
  MessagesAnnotation,
} from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

const apiKey = process.env.QWEN_API_KEY;
if (!apiKey) {
  throw new Error("QWEN_API_KEY environment variable is not set");
}

// ============================================================
// 1. 定义工具
//    使用 zod 描述参数，LLM 会自动按 schema 生成调用
// ============================================================
const getCurrentTime = tool(
  async () => {
    const now = new Date();
    return now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  },
  {
    name: "get_current_time",
    description: "获取当前的北京时间。当用户问到时间、日期、今天等时调用。",
    schema: z.object({}),
  }
);

const calculator = tool(
  async ({ expression }) => {
    // 仅允许数字与基础运算符，避免 eval 注入
    if (!/^[\d+\-*/().\s]+$/.test(expression)) {
      return "表达式包含非法字符，仅支持数字与 + - * / ( )";
    }
    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${expression})`)();
      return `计算结果：${result}`;
    } catch (err) {
      return `计算失败：${(err as Error).message}`;
    }
  },
  {
    name: "calculator",
    description: "数学计算器，支持加减乘除和括号。expression 为合法的数学表达式字符串。",
    schema: z.object({
      expression: z.string().describe("数学表达式，如 (3 + 5) * 2"),
    }),
  }
);

const tools = [getCurrentTime, calculator];
const toolNode = new ToolNode(tools);

// ============================================================
// 2. 绑定工具到 LLM
//    bindTools 让模型知道有哪些工具可用，并按需输出 tool_calls
// ============================================================
const llm = new ChatOpenAI({
  model: "qwen-plus",
  apiKey,
  temperature: 0,
  configuration: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
}).bindTools(tools);

// ============================================================
// 3. 定义 agent 节点
//    输入消息历史，调用 LLM，返回新的 AIMessage（可能包含 tool_calls）
// ============================================================
async function callAgent(state: typeof MessagesAnnotation.State) {
  console.log(`\n🧠 [agent] 思考中... (消息数: ${state.messages.length})`);
  const response = await llm.invoke(state.messages);
  const toolCalls = response.tool_calls ?? [];
  if (toolCalls.length > 0) {
    console.log(
      `   → 决定调用工具:`,
      toolCalls.map((tc) => `${tc.name}(${JSON.stringify(tc.args)})`).join(", ")
    );
  } else {
    console.log(`   → 输出最终回答`);
  }
  // 借助 MessagesAnnotation 的 reducer，返回的消息会自动 append 到 state.messages
  return { messages: [response] };
}

// ============================================================
// 4. 构图：agent ↔ tools 循环
//    toolsCondition 是 prebuilt 路由函数：
//      最后一条消息有 tool_calls → "tools"，否则 → END
// ============================================================
const workflow = new StateGraph(MessagesAnnotation)
  .addNode("agent", callAgent)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", toolsCondition)
  .addEdge("tools", "agent"); // 工具执行后回到 agent，形成循环

const app = workflow.compile();

// ============================================================
// 5. 运行：观察可能的多轮工具调用
// ============================================================
const question = "现在几点？以及 (128 + 256) * 3 等于多少？";
console.log(`\n❓ 用户提问: ${question}`);
console.log("─".repeat(60));

const finalState = await app.invoke({
  messages: [new HumanMessage(question)],
});

console.log("─".repeat(60));
console.log("\n📜 完整消息轨迹:");
finalState.messages.forEach((msg, i) => {
  const content =
    typeof msg.content === "string"
      ? msg.content
      : JSON.stringify(msg.content);
  console.log(`  [${i}] (${msg.type}) ${content.slice(0, 120)}`);
});

const lastMessage = finalState.messages[finalState.messages.length - 1];
console.log("\n🤖 最终回答:", lastMessage?.content);
