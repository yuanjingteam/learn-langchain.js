import dotenv from 'dotenv';
dotenv.config();

import { AlibabaTongyiEmbeddings } from "@langchain/community/embeddings/alibaba_tongyi";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const apiKey = process.env.QWEN_API_KEY;
if (!apiKey) {
  throw new Error("QWEN_API_KEY environment variable is not set");
}

const embeddings = new AlibabaTongyiEmbeddings({
  apiKey: apiKey,
  modelName: "text-embedding-v4",
});

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

let vectorStore: Awaited<ReturnType<typeof FaissStore.fromDocuments>> | null = null;

const batchSize = 10;
for (let i = 0; i < splitDocs.length; i += batchSize) {
  const batch = splitDocs.slice(i, i + batchSize);
  console.log(`  处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(splitDocs.length / batchSize)}...`);

  if (!vectorStore) {
    vectorStore = await FaissStore.fromDocuments(batch, embeddings);
  } else {
    await vectorStore.addDocuments(batch);
  }
}
console.log("✓ 向量存储创建成功！\n");

console.log("💾 保存向量索引到本地...");
await vectorStore!.save("./faiss_index");
console.log("✓ 保存成功！\n");

console.log("🔬 测试检索效果（使用 Retriever）...\n");

const retriever = vectorStore!.asRetriever({
  k: 4,
  searchType: "similarity",
});

const queries = [
  "前端开发技能",
  "项目经验",
  "教育背景",
  "用户入学时间",
  "学校和专业",
  "AI Agent能力",
  "实习经历",
  "技术栈",
];

for (const query of queries) {
  console.log(`查询: "${query}"`);
  const results = await retriever.invoke(query);
  results.forEach((doc, i) => {
    console.log(`  结果${i + 1} [${doc.metadata?.loc?.pageNumber || 'N/A'}页, ${doc.pageContent.length}字符]:`);
    console.log(`    ${doc.pageContent.substring(0, 150)}...\n`);
  });
}

console.log("🎉 完成！");
