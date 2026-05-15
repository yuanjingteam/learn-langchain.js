/**
 * 案例四：Self-RAG 自我修正工作流
 *
 * 综合运用前三个案例的能力，构建一个会"自我反思"的 RAG：
 *   retrieve         → 从向量库检索文档
 *   grade_documents  → LLM 评估每个文档是否与问题相关
 *   ↓ 条件路由：有相关文档？
 *     有  → generate
 *     无  → transform_query（重写问题，回到 retrieve）
 *   generate         → 基于相关文档生成答案
 *   grade_generation → 评估答案：是否有幻觉、是否回答了问题
 *   ↓ 条件路由：
 *     useful        → END（输出回答）
 *     not_supported → generate（重新生成）
 *     not_useful    → transform_query（重写问题）
 *
 * 复用 7.0 分支生成的 ./faiss_index 向量索引。首次运行前请先在 7.0 分支
 * 下执行 `npm start` 构建好索引，再回到本分支运行 `npm run dev`。
 */

import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import {
  Annotation,
  StateGraph,
  START,
  END,
} from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { AlibabaTongyiEmbeddings } from "@langchain/community/embeddings/alibaba_tongyi";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { Document } from "@langchain/core/documents";
import { z } from "zod";

const apiKey = process.env.QWEN_API_KEY;
if (!apiKey) {
  throw new Error("QWEN_API_KEY environment variable is not set");
}

// ============================================================
// 1. 加载向量库（沿用 7.0 的 FaissStore 索引）
// ============================================================
const indexPath = "./faiss_index";
if (!fs.existsSync(indexPath)) {
  throw new Error(
    `未找到向量索引 ${indexPath}。请先切换到 7.0 分支运行 \`npm start\` 构建索引，或将本案例的检索源换成你自己的向量库。`
  );
}

const embeddings = new AlibabaTongyiEmbeddings({
  apiKey,
  modelName: "text-embedding-v4",
});

console.log("📂 加载向量索引...");
const vectorStore = await FaissStore.load(indexPath, embeddings);
const retriever = vectorStore.asRetriever({ k: 4, searchType: "similarity" });
console.log("✓ 加载完成\n");

// ============================================================
// 2. 共享 LLM
// ============================================================
const llm = new ChatOpenAI({
  model: "qwen-plus",
  apiKey,
  temperature: 0,
  configuration: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
});

const parser = new StringOutputParser();

// ============================================================
// 3. State Schema
// ============================================================
const StateAnnotation = Annotation.Root({
  question: Annotation<string>(),
  documents: Annotation<Document[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  generation: Annotation<string>(),
  attempts: Annotation<number>({
    reducer: (prev, next) => (next === undefined ? prev : next),
    default: () => 0,
  }),
});

type GraphState = typeof StateAnnotation.State;

const MAX_ATTEMPTS = 3; // 防止无限循环

// ============================================================
// 4. 评分用的结构化输出（让 LLM 严格只输出 yes / no）
// ============================================================
const docGradeSchema = z.object({
  binary_score: z.enum(["yes", "no"]).describe("文档是否与问题相关"),
});

const genGradeSchema = z.object({
  supported: z.enum(["yes", "no"]).describe("答案是否完全基于上下文（无幻觉）"),
  useful: z.enum(["yes", "no"]).describe("答案是否回答了用户问题"),
});

const docGrader = llm.withStructuredOutput(docGradeSchema, {
  name: "grade_document",
});
const genGrader = llm.withStructuredOutput(genGradeSchema, {
  name: "grade_generation",
});

// ============================================================
// 5. 节点定义
// ============================================================
async function retrieve(state: GraphState): Promise<Partial<GraphState>> {
  console.log(`\n🔍 [retrieve] 查询: "${state.question}"`);
  const documents = await retriever.invoke(state.question);
  console.log(`   ✓ 检索到 ${documents.length} 个文档`);
  return { documents };
}

async function gradeDocuments(state: GraphState): Promise<Partial<GraphState>> {
  console.log("📝 [grade_documents] 评估文档相关性");
  const prompt = PromptTemplate.fromTemplate(
    `你是文档相关性评分员。判断下面这段文档是否包含回答用户问题所需的信息。
    仅输出 "yes" 或 "no"。

    用户问题：{question}
    文档内容：
    {content}`
  );

  const filtered: Document[] = [];
  for (const doc of state.documents) {
    const formatted = await prompt.format({
      question: state.question,
      content: doc.pageContent,
    });
    const score = await docGrader.invoke(formatted);
    if (score.binary_score === "yes") {
      filtered.push(doc);
      console.log(`   ✓ 相关: ${doc.pageContent.slice(0, 40)}...`);
    } else {
      console.log(`   ✗ 无关: ${doc.pageContent.slice(0, 40)}...`);
    }
  }
  return { documents: filtered };
}

async function generate(state: GraphState): Promise<Partial<GraphState>> {
  console.log("✍️  [generate] 基于相关文档生成答案");
  const context = state.documents.map((d) => d.pageContent).join("\n---\n");
  const prompt = PromptTemplate.fromTemplate(
    `你是问答助手。请仅根据下面的上下文回答问题，禁止编造。

    上下文：
    {context}

    问题：{question}

    要求：简洁、准确、有条理。如果上下文不足以回答，明确说明。`
  );
  const chain = prompt.pipe(llm).pipe(parser);
  const generation = await chain.invoke({
    context,
    question: state.question,
  });
  console.log(`   ✓ 生成回答 (${generation.length} 字)`);
  return { generation };
}

async function transformQuery(state: GraphState): Promise<Partial<GraphState>> {
  console.log("♻️  [transform_query] 重写问题以提升检索效果");
  const prompt = PromptTemplate.fromTemplate(
    `原问题在向量库中检索效果不佳，请改写以提升语义检索召回率。
    保持意图不变，可换用近义词、补充上下文。只输出改写后的问题，不要解释。

    原问题：{question}`
  );
  const chain = prompt.pipe(llm).pipe(parser);
  const rewritten = (await chain.invoke({ question: state.question })).trim();
  console.log(`   原: "${state.question}"`);
  console.log(`   新: "${rewritten}"`);
  return { question: rewritten, attempts: state.attempts + 1 };
}

// ============================================================
// 6. 条件路由
// ============================================================
function decideAfterGrading(state: GraphState): "generate" | "transform_query" {
  if (state.documents.length === 0) {
    if (state.attempts >= MAX_ATTEMPTS) {
      console.log(`   ⚠️  已尝试 ${state.attempts} 次仍无相关文档，直接生成`);
      return "generate";
    }
    return "transform_query";
  }
  return "generate";
}

async function gradeGeneration(
  state: GraphState
): Promise<"useful" | "not_supported" | "not_useful"> {
  console.log("🔎 [grade_generation] 评估答案质量");
  const context = state.documents.map((d) => d.pageContent).join("\n---\n");
  const prompt = `判断下面的答案：
  1) 是否完全基于上下文（supported: yes/no）
  2) 是否真的回答了用户问题（useful: yes/no）

  上下文：
  ${context}

  问题：${state.question}

  答案：
  ${state.generation}`;

  const grade = await genGrader.invoke(prompt);
  console.log(`   supported=${grade.supported}, useful=${grade.useful}`);

  if (state.attempts >= MAX_ATTEMPTS) {
    console.log(`   ⚠️  达到最大尝试次数 ${MAX_ATTEMPTS}，强制结束`);
    return "useful";
  }
  if (grade.supported === "no") return "not_supported";
  if (grade.useful === "no") return "not_useful";
  return "useful";
}

// ============================================================
// 7. 构图
// ============================================================
const workflow = new StateGraph(StateAnnotation)
  .addNode("retrieve", retrieve)
  .addNode("grade_documents", gradeDocuments)
  .addNode("generate", generate)
  .addNode("transform_query", transformQuery)
  .addEdge(START, "retrieve")
  .addEdge("retrieve", "grade_documents")
  .addConditionalEdges("grade_documents", decideAfterGrading, {
    generate: "generate",
    transform_query: "transform_query",
  })
  .addEdge("transform_query", "retrieve")
  .addConditionalEdges("generate", gradeGeneration, {
    useful: END,
    not_supported: "generate",
    not_useful: "transform_query",
  });

const app = workflow.compile();

// ============================================================
// 8. 执行：流式观察每个节点
// ============================================================
const question = "李元静的邮箱是什么？";
console.log(`❓ 问题: ${question}`);
console.log("─".repeat(60));

const finalState = await app.invoke(
  { question },
  { recursionLimit: 20 }
);

console.log("─".repeat(60));
console.log("\n🎉 最终回答:\n");
console.log(finalState.generation);
console.log(
  `\n📊 累计重写次数: ${finalState.attempts}，参考文档数: ${finalState.documents.length}`
);
