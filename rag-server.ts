import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { AlibabaTongyiEmbeddings } from "@langchain/community/embeddings/alibaba_tongyi";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";
import type { Document } from "@langchain/core/documents";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const apiKey = process.env.QWEN_API_KEY;
if (!apiKey) {
  throw new Error("QWEN_API_KEY environment variable is not set");
}

// ============================================================
// 1. 多格式文档加载（PDF / Markdown / 文本）
// ============================================================
function collectFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

const TEXT_EXTENSIONS = new Set([
  ".md", ".markdown", ".txt", ".csv", ".json",
  ".xml", ".html", ".htm", ".log", ".yaml", ".yml",
  ".py", ".js", ".ts", ".java", ".c", ".cpp", ".h",
]);

// ============================================================
// 2. 文档加载函数
// ============================================================
async function loadDocuments(docsDir: string): Promise<Document[]> {
  const allDocs: Document[] = [];
  const files = collectFiles(docsDir);

  for (const filePath of files) {
    const file = path.relative(docsDir, filePath);
    const ext = path.extname(file).toLowerCase();

    try {
      if (ext === ".pdf") {
        console.log(`  📄 加载 PDF: ${file}`);
        const loader = new PDFLoader(filePath);
        const docs = await loader.load();
        allDocs.push(...docs);
      } else if (ext === ".docx") {
        console.log(`  📝 加载 Word: ${file}`);
        const { DocxLoader } = await import("@langchain/community/document_loaders/fs/docx");
        const loader = new DocxLoader(filePath);
        const docs = await loader.load();
        allDocs.push(...docs);
      } else if (ext === ".pptx") {
        console.log(`  📊 加载 PPT: ${file}`);
        const { PPTXLoader } = await import("@langchain/community/document_loaders/fs/pptx");
        const loader = new PPTXLoader(filePath);
        const docs = await loader.load();
        allDocs.push(...docs);
      } else if (ext === ".csv") {
        console.log(`  📊 加载 CSV: ${file}`);
        const { CSVLoader } = await import("@langchain/community/document_loaders/fs/csv");
        const loader = new CSVLoader(filePath);
        const docs = await loader.load();
        allDocs.push(...docs);
      } else if (ext === ".epub") {
        console.log(`  📚 加载 EPUB: ${file}`);
        const { EPubLoader } = await import("@langchain/community/document_loaders/fs/epub");
        const loader = new EPubLoader(filePath);
        const docs = await loader.load();
        allDocs.push(...docs);
      } else if (ext === ".md" || ext === ".markdown" || ext === ".txt" || TEXT_EXTENSIONS.has(ext)) {
        console.log(`  📃 加载文本: ${file}`);
        const loader = new TextLoader(filePath);
        const docs = await loader.load();
        allDocs.push(...docs);
      } else {
        console.log(`  ⏭️  跳过不支持的文件类型: ${file}`);
      }
    } catch (err) {
      console.error(`  ⚠️ 加载 ${file} 失败:`, err);
    }
  }

  return allDocs;
}

// ============================================================
// 2. 文本分割（RecursiveCharacterTextSplitter）
// ============================================================
function createTextSplitter() {
  return new RecursiveCharacterTextSplitter({
    chunkSize: 300,
    chunkOverlap: 150,
    separators: ["\n\n", "\n", "。", "！", "？", "，", "、", "；", " "],
    lengthFunction: (text) => text.length,
  });
}

// ============================================================
// 3. 向量存储构建（MemoryVectorStore）
// ============================================================

async function buildVectorStore(
  docs: Document[],
  embeddings: AlibabaTongyiEmbeddings,
): Promise<MemoryVectorStore> {
  const textSplitter = createTextSplitter();
  const splitDocs = await textSplitter.splitDocuments(docs);
  console.log(`  ✓ 分割完成: ${splitDocs.length} 个文本块`);

  console.log("  🔍 正在构建向量索引...");
  const store = new MemoryVectorStore(embeddings);
  const batchSize = 10;
  
  for (let i = 0; i < splitDocs.length; i += batchSize) {
    const batch = splitDocs.slice(i, i + batchSize);
    await store.addDocuments(batch);
    console.log(`  🔍 已处理 ${Math.min(i + batchSize, splitDocs.length)}/${splitDocs.length} 个文本块`);
  }
  
  console.log("  ✓ 向量索引创建成功！");
  return store;
}

// ============================================================
// 4. 初始化 Embedding 模型 & 向量存储
// ============================================================
const embeddings = new AlibabaTongyiEmbeddings({
  apiKey: apiKey,
  modelName: "text-embedding-v4",
});

const docsDir = path.join(__dirname, "library");
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
  console.log("📁 已创建 library/ 目录，请将知识库文档放入后重启服务");
}

console.log("📄 从 library/ 目录加载文档...");
const docs = await loadDocuments(docsDir);

if (docs.length === 0) {
  throw new Error("未找到任何文档，请在 library/ 目录中添加文档后重启服务");
}

console.log(`  ✓ 共加载 ${docs.length} 个文档`);
const vectorStore = await buildVectorStore(docs, embeddings);

// ============================================================
// 5. 检索器配置（支持 Similarity 和 MMR 两种模式）
// ============================================================
const SIMILARITY_K = 4;
const MMR_K = 4;
const MMR_FETCH_K = 20;

const similarityRetriever = vectorStore.asRetriever({
  k: SIMILARITY_K,
  searchType: "similarity",
});

const mmrRetriever = vectorStore.asRetriever({
  k: MMR_K,
  searchType: "mmr",
  searchKwargs: { fetchK: MMR_FETCH_K },
});

function getRetriever(searchType: "similarity" | "mmr" = "similarity") {
  return searchType === "mmr" ? mmrRetriever : similarityRetriever;
}

// ============================================================
// 6. LLM 配置
// ============================================================
const llm = new ChatOpenAI({
  model: "qwen-plus",
  apiKey: apiKey,
  temperature: 0.7,
  configuration: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  }
});

const streamingLlm = new ChatOpenAI({
  model: "qwen-plus",
  apiKey: apiKey,
  temperature: 0.7,
  streaming: true,
  configuration: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  }
});

const parser = new StringOutputParser();

// ============================================================
// 7. Prompt 模板
// ============================================================
const ragPrompt = PromptTemplate.fromTemplate(
`你是一个知识库问答助手。请根据提供的上下文回答用户问题。

上下文：
{context}

用户问题：{question}

要求：
- 仅根据上述上下文回答，不要编造信息
- 如果上下文中没有相关信息，请回答"抱歉，知识库中没有相关内容"
- 回答要简洁、准确、有条理`
);

const conversationalRagPrompt = PromptTemplate.fromTemplate(
`你是一个知识库问答助手。请根据提供的上下文和对话历史回答用户问题。

上下文：
{context}

对话历史：
{chat_history}

当前用户问题：{question}

要求：
- 仅根据上述上下文回答，不要编造信息
- 如果上下文中没有相关信息，请回答"抱歉，知识库中没有相关内容"
- 结合对话历史理解用户的意图，如果用户追问，要关联前文
- 回答要简洁、准确、有条理`
);

// ============================================================
// 8. RAG Chain（单轮问答）
// ============================================================
const ragChain = RunnablePassthrough.assign({
  context: (input: { question: string }) => {
    return similarityRetriever.invoke(input.question).then((docs) =>
      docs.map((doc) => doc.pageContent).join("\n---\n")
    );
  }
}).pipe(ragPrompt).pipe(llm).pipe(parser);

// ============================================================
// 9. 对话式 RAG Chain（支持聊天历史 + MMR）
// ============================================================
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function formatChatHistory(history: ChatMessage[]): string {
  if (history.length === 0) return "（无对话历史）";
  return history
    .map((msg) => `${msg.role === "user" ? "用户" : "助手"}: ${msg.content}`)
    .join("\n");
}

function buildConversationalRagChain(searchType: "similarity" | "mmr") {
  const retriever = getRetriever(searchType);

  return RunnableSequence.from([
    RunnablePassthrough.assign({
      context: async (input: { question: string; chat_history: string }) => {
        const docs = await retriever.invoke(input.question);
        return docs.map((doc) => doc.pageContent).join("\n---\n");
      },
    }),
    conversationalRagPrompt,
    streamingLlm,
    parser,
  ]);
}

// ============================================================
// 10. Express 服务
// ============================================================
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const chatSessions = new Map<string, ChatMessage[]>();

function getSessionId(req: express.Request): string {
  return (req.headers["x-session-id"] as string) || "default";
}

// 单轮 RAG 问答（兼容旧接口）
app.post("/api/chat", async (req, res) => {
  const { question } = req.body;
  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "请提供有效的问题" });
    return;
  }

  try {
    console.log(`🔍 查询: "${question}"`);
    const answer = await ragChain.invoke({ question });
    console.log(`✓ 回答完成`);
    res.json({ answer });
  } catch (err: unknown) {
    console.error("查询出错:", err);
    res.status(500).json({ error: "查询失败，请稍后重试" });
  }
});

// 对话式 RAG 问答（流式 + 聊天历史 + MMR）
app.post("/api/chat/conversational", async (req, res) => {
  const { question, searchType = "similarity" } = req.body;
  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "请提供有效的问题" });
    return;
  }

  const sessionId = getSessionId(req);
  const history = chatSessions.get(sessionId) || [];

  try {
    console.log(`🔍 [会话 ${sessionId}] 查询: "${question}" (检索模式: ${searchType})`);
    const chain = buildConversationalRagChain(
      searchType === "mmr" ? "mmr" : "similarity"
    );

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await chain.stream({
      question,
      chat_history: formatChatHistory(history),
    });

    let fullAnswer = "";
    for await (const chunk of stream) {
      fullAnswer += chunk;
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }

    history.push({ role: "user", content: question });
    history.push({ role: "assistant", content: fullAnswer });
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }
    chatSessions.set(sessionId, history);

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    console.log(`✓ [会话 ${sessionId}] 回答完成`);
  } catch (err: unknown) {
    console.error("查询出错:", err);
    res.write(`data: ${JSON.stringify({ error: "查询失败，请稍后重试" })}\n\n`);
    res.end();
  }
});

// 获取/清除聊天历史
app.get("/api/chat/history", (req, res) => {
  const sessionId = getSessionId(req);
  res.json({ sessionId, history: chatSessions.get(sessionId) || [] });
});

app.delete("/api/chat/history", (req, res) => {
  const sessionId = getSessionId(req);
  chatSessions.delete(sessionId);
  res.json({ message: "聊天历史已清除" });
});

// 获取检索结果（调试用）
app.post("/api/retrieve", async (req, res) => {
  const { question, searchType = "similarity", k = 4 } = req.body;
  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "请提供有效的问题" });
    return;
  }

  try {
    const retriever = getRetriever(searchType === "mmr" ? "mmr" : "similarity");
    const docs = await retriever.invoke(question);
    const results = docs.slice(0, k).map((doc, i) => ({
      index: i + 1,
      content: doc.pageContent,
      metadata: doc.metadata,
    }));
    res.json({ question, searchType, results });
  } catch (err: unknown) {
    console.error("检索出错:", err);
    res.status(500).json({ error: "检索失败" });
  }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`\n🚀 RAG 知识库问答服务已启动: http://localhost:${PORT}`);
  console.log(`   📌 POST /api/chat              — 单轮 RAG 问答`);
  console.log(`   📌 POST /api/chat/conversational — 对话式 RAG（流式 + 历史 + MMR）`);
  console.log(`   📌 POST /api/retrieve            — 检索调试接口`);
  console.log(`   📌 GET  /api/chat/history         — 查看聊天历史`);
  console.log(`   📌 DELETE /api/chat/history        — 清除聊天历史\n`);
});

function shutdown() {
  console.log('\n🛑 正在关闭服务...');
  server.close(() => {
    console.log('✓ 服务已停止');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 3000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
