import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import { AlibabaTongyiEmbeddings } from "@langchain/community/embeddings/alibaba_tongyi";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnablePassthrough } from "@langchain/core/runnables";

const apiKey = process.env.QWEN_API_KEY;
if (!apiKey) {
  throw new Error("QWEN_API_KEY environment variable is not set");
}

const embeddings = new AlibabaTongyiEmbeddings({
  apiKey: apiKey,
  modelName: "text-embedding-v4",
});

const indexPath = "./faiss_index";

let vectorStore: Awaited<ReturnType<typeof FaissStore.load>>;

if (fs.existsSync(indexPath)) {
  console.log("📂 检测到本地向量索引，直接加载...\n");
  vectorStore = await FaissStore.load(indexPath, embeddings);
  console.log("✓ 向量索引加载成功！\n");
} else {
  console.log("📄 未检测到本地向量索引，正在从 PDF 创建...\n");

  console.log("📄 正在加载 PDF 文档...");
  const pdfLoader = new PDFLoader("./library/reference.pdf");
  const docs = await pdfLoader.load();
  console.log(`✓ 加载完成: ${docs.length} 页\n`);

  docs.forEach((doc, i) => {
    console.log(`页 ${i + 1} 字符数: ${doc.pageContent.length}`);
    console.log(`预览: ${doc.pageContent.substring(0, 200)}...\n`);
  });

  console.log("📝 开始文本分割（优化配置）...\n");

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 300,
    chunkOverlap: 150,
    separators: ["\n\n", "\n", "。", "！", "？", "，", "、", "；", " "],
    lengthFunction: (text) => text.length,
  });

  const splitDocs = await textSplitter.splitDocuments(docs);
  console.log(`✓ 分割完成: ${splitDocs.length} 个文本块\n`);

  splitDocs.forEach((doc, i) => {
    console.log(`块 ${i + 1} [${doc.metadata.loc?.pageNumber || 'N/A'}页, ${doc.pageContent.length}字符]:`);
    console.log(`  ${doc.pageContent.substring(0, 100)}...\n`);
  });

  console.log("🔍 创建向量存储（分批处理）...\n");

  const batchSize = 10;
  let store: Awaited<ReturnType<typeof FaissStore.fromDocuments>> | null = null;

  for (let i = 0; i < splitDocs.length; i += batchSize) {
    const batch = splitDocs.slice(i, i + batchSize);
    console.log(`🔍 处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(splitDocs.length / batchSize)}...`);

    if (!store) {
      store = await FaissStore.fromDocuments(batch, embeddings);
    } else {
      await store.addDocuments(batch);
    }
  }

  vectorStore = store!;
  console.log("✓ 向量存储创建成功！\n");

  console.log("💾 保存向量索引到本地...");
  await vectorStore.save(indexPath);
  console.log("✓ 保存成功！\n");
}

const retriever = vectorStore!.asRetriever({
  k: 4,
  searchType: "similarity",
});

const llm = new ChatOpenAI({
  model: "qwen-plus",
  apiKey: apiKey,
  temperature: 0.7,
  configuration: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  }
});

const parser = new StringOutputParser();

const ragPrompt = PromptTemplate.fromTemplate(`
你是一个知识库问答助手。请根据提供的上下文回答用户问题。

上下文：
{context}

用户问题：{question}

请仅根据上述上下文回答。如果上下文中没有相关信息，请回答"抱歉，知识库中没有相关内容"。
`);

const ragChain = RunnablePassthrough.assign({
  context: (input: { question: string }) => {
    return retriever.invoke(input.question).then((docs) =>
      docs.map((doc) => doc.pageContent).join("\n")
    );
  }
}).pipe(ragPrompt).pipe(llm).pipe(parser);

const question = "李元静的邮箱是什么？";

console.log(`🔍 查询: "${question}"\n`);

const response = await ragChain.invoke({
  question: question
});

console.log("🤖 RAG系统回答：", response);
