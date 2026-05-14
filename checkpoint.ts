/**
 * 案例三：Checkpoint 持久化与 Human-in-the-loop
 *
 * 在案例二的 Tool Calling Agent 基础上，引入：
 *   - MemorySaver：内存版 checkpointer（生产环境可换 Sqlite/Postgres 版）
 *   - thread_id：会话标识，同一个 thread 多次调用，状态自动累积
 *   - interruptBefore：在执行某节点前暂停，等待人工审批
 *   - getState / getStateHistory：查看当前状态与历史 checkpoint（时间旅行）
 *   - invoke(null, config)：从断点恢复执行
 */

import dotenv from "dotenv";
dotenv.config();

import {
  StateGraph,
  START,
  MessagesAnnotation,
  MemorySaver,
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
// 1. 定义工具（模拟一个有副作用的「转账」工具，必须人工审批）
// ============================================================
const transferMoney = tool(
  async ({ to, amount }) => {
    // 实际生产中这里会触发真实转账，所以必须人工审批
    return `✅ 已向 ${to} 转账 ${amount} 元（模拟）。`;
  },
  {
    name: "transfer_money",
    description: "向指定账户转账。to 为收款人，amount 为金额（人民币）。",
    schema: z.object({
      to: z.string().describe("收款人名字"),
      amount: z.number().describe("金额，单位元"),
    }),
  }
);

const tools = [transferMoney];
const toolNode = new ToolNode(tools);

const llm = new ChatOpenAI({
  model: "qwen-plus",
  apiKey,
  temperature: 0,
  configuration: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
}).bindTools(tools);

async function callAgent(state: typeof MessagesAnnotation.State) {
  const response = await llm.invoke(state.messages);
  return { messages: [response] };
}

// ============================================================
// 2. 编译时启用 checkpointer + interruptBefore
// ============================================================
const checkpointer = new MemorySaver();

const workflow = new StateGraph(MessagesAnnotation)
  .addNode("agent", callAgent)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", toolsCondition)
  .addEdge("tools", "agent");

const app = workflow.compile({
  checkpointer,
  interruptBefore: ["tools"], // 在执行工具前暂停，等待人工审批
});

// ============================================================
// 3. 演示流程
// ============================================================
const threadId = "user-001";
const config = { configurable: { thread_id: threadId } };

console.log("─".repeat(60));
console.log(`📌 Thread ID: ${threadId}`);
console.log("─".repeat(60));

// ── Step 1：用户发起请求，agent 决定调用 transfer_money，但被 interruptBefore 暂停
console.log("\n🟢 Step 1: 用户发起转账请求");
const firstInput = {
  messages: [new HumanMessage("请帮我向张三转账 500 元。")],
};
const firstResult = await app.invoke(firstInput, config);
console.log(
  "   最后一条消息:",
  firstResult.messages[firstResult.messages.length - 1]?.type
);

// ── Step 2：检查当前 state，查看待审批的工具调用
console.log("\n🟡 Step 2: 检查待审批的工具调用");
const snapshot = await app.getState(config);
const pendingMsg = snapshot.values.messages[snapshot.values.messages.length - 1];
console.log("   next 节点:", snapshot.next); // ["tools"] 表示下一步要进 tools
console.log("   待执行的 tool_calls:", JSON.stringify(pendingMsg?.tool_calls, null, 2));

// ── Step 3：人工"批准"——传 null 表示从断点恢复，不追加新输入
console.log("\n🟢 Step 3: 人工审批通过，恢复执行");
const resumed = await app.invoke(null, config);
console.log(
  "   最终回答:",
  resumed.messages[resumed.messages.length - 1]?.content
);

// ── Step 4：同一 thread 继续对话，状态自动累积
console.log("\n🟢 Step 4: 同一会话中继续提问（状态自动累积）");
const followUp = await app.invoke(
  { messages: [new HumanMessage("刚才我向谁转账了？金额多少？")] },
  config
);
console.log(
  "   最终回答:",
  followUp.messages[followUp.messages.length - 1]?.content
);

// ── Step 5：时间旅行 —— 列出历史 checkpoint
console.log("\n🟣 Step 5: 时间旅行 - 历史 checkpoint");
let count = 0;
for await (const snap of app.getStateHistory(config)) {
  count++;
  const lastMsg = snap.values.messages?.[snap.values.messages.length - 1];
  const preview =
    typeof lastMsg?.content === "string"
      ? lastMsg.content.slice(0, 40)
      : "(non-string)";
  console.log(
    `   [${count}] next=${JSON.stringify(snap.next)} 消息数=${snap.values.messages?.length ?? 0} 最后内容="${preview}"`
  );
  if (count >= 8) break; // 只看前几条
}

console.log("\n💡 提示：把 threadId 换一个值再跑，会看到全新的对话历史。");
