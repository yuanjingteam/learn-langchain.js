/**
 * 案例一：StateGraph 基础
 *
 * 演示 LangGraph 的三大要素：
 *   - State：贯穿整个图的共享状态（通过 Annotation 定义）
 *   - Node：执行任务并返回状态更新的函数
 *   - Edge：节点间的连接，最简单的就是 START → ... → END 的线性边
 *
 * 场景：前端知识卡片生成器（与 4.0 的多链编排做对比）
 *   输入：{ topic: "闭包" }
 *   流程：explain（详细解释） → summarize（3个要点） → format（JSON）
 */

import dotenv from "dotenv";
dotenv.config();

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";

const apiKey = process.env.QWEN_API_KEY;
if (!apiKey) {
  throw new Error("QWEN_API_KEY environment variable is not set");
}

// ============================================================
// 1. 定义 State Schema
//    Annotation.Root 描述状态结构，每个字段可以指定 reducer（合并策略）
// ============================================================
const StateAnnotation = Annotation.Root({
  topic: Annotation<string>(), // 输入：{ topic: "闭包" }
  explanation: Annotation<string>(), // 输出：{ explanation: "闭包是一种在函数内部定义的变量，它可以访问函数外部的变量。" }
  summary: Annotation<string>(), // 输出：{ summary: "- 闭包是一种在函数内部定义的变量，它可以访问函数外部的变量。\n- 闭包可以用于封装状态和行为，实现模块化开发。\n- 闭包可以用于实现私有变量，保护数据安全。" }
  formatted: Annotation<string>(), // 输出：{ formatted: JSON.stringify({ topic: "闭包", explanation: "闭包是一种在函数内部定义的变量，它可以访问函数外部的变量。", summary: "- 闭包是一种在函数内部定义的变量，它可以访问函数外部的变量。\n- 闭包可以用于封装状态和行为，实现模块化开发。\n- 闭包可以用于实现私有变量，保护数据安全。 }) }
});

type GraphState = typeof StateAnnotation.State;

// ============================================================
// 2. 共享 LLM 实例
// ============================================================
const llm = new ChatOpenAI({
  model: "qwen-plus",
  apiKey,
  temperature: 0.3,
  configuration: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
});

const parser = new StringOutputParser();

// ============================================================
// 3. 定义节点（Node）
//    每个节点是一个函数：输入 state → 返回部分 state 更新
// ============================================================
async function explainNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`\n🟢 [explain] 收到 topic: "${state.topic}"`);
  const prompt = PromptTemplate.fromTemplate(
    "你是一名资深前端讲师，请用 3-5 句话清楚地解释概念「{topic}」，面向初学者。"
  );
  const chain = prompt.pipe(llm).pipe(parser);
  const explanation = await chain.invoke({ topic: state.topic });
  console.log(`   ✓ 生成解释 (${explanation.length} 字)`);
  return { explanation };
}

async function summarizeNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log("🟡 [summarize] 基于解释提取核心要点");
  const prompt = PromptTemplate.fromTemplate(
    `根据以下解释，提炼 3 个最核心的要点，每条不超过 20 字，用「- 」开头分行列出。

    解释：
    {explanation}`
  );
  const chain = prompt.pipe(llm).pipe(parser);
  const summary = await chain.invoke({ explanation: state.explanation });
  console.log(`   ✓ 生成要点`);
  return { summary };
}

async function formatNode(state: GraphState): Promise<Partial<GraphState>> {
  console.log("🟣 [format] 输出为 JSON 结构");
  const prompt = PromptTemplate.fromTemplate(
    `将下列内容整理为一个 JSON 对象，仅输出 JSON，不要任何解释或代码块标记。
    字段：topic, explanation, keyPoints（数组）。

    主题：{topic}
    解释：{explanation}
    要点：
    {summary}`
  );
  const chain = prompt.pipe(llm).pipe(parser);
  const formatted = await chain.invoke({
    topic: state.topic,
    explanation: state.explanation,
    summary: state.summary,
  });
  console.log(`   ✓ 生成 JSON`);
  return { formatted };
}

// ============================================================
// 4. 构建状态图
//    线性流程：START → explain → summarize → format → END
// ============================================================
const workflow = new StateGraph(StateAnnotation)
  .addNode("explain", explainNode)
  .addNode("summarize", summarizeNode)
  .addNode("format", formatNode)
  .addEdge(START, "explain")
  .addEdge("explain", "summarize")
  .addEdge("summarize", "format")
  .addEdge("format", END);

const app = workflow.compile();

// ============================================================
// 5. 执行：invoke 一次性返回最终状态
// ============================================================
const topic = "闭包";
console.log(`\n📦 输入：{ topic: "${topic}" }`);
console.log("─".repeat(50));

const result = await app.invoke({ topic });

console.log("─".repeat(50));
console.log("\n🎉 最终状态:");
console.log("  topic       :", result.topic);
console.log("  explanation :", result.explanation.slice(0, 60), "...");
console.log("  summary     :\n" + result.summary);
console.log("  formatted   :\n" + result.formatted);

// ============================================================
// 6. 进阶：stream 模式可以逐节点观察中间状态
//    取消注释以查看：
// ============================================================
// console.log("\n─── stream 模式 ───");
// for await (const step of await app.stream({ topic: "Promise" })) {
//   for (const [nodeName, partial] of Object.entries(step)) {
//     console.log(`节点 ${nodeName} 输出:`, partial);
//   }
// }
