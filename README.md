# learn-langchain.js

> LangChain.js RAG 系统教学演示：从向量索引到知识库问答服务

## 课程目标

通过 4 个递进的案例，掌握 **RAG（检索增强生成）** 的核心流程。学完本课程，你将理解：

- 什么是 RAG，为什么需要它（LLM 的知识截止问题）
- 文档加载 → 文本分割 → 向量化 → 检索 → 生成 的完整链路
- 如何从脚本逐步演进到一个完整的 RAG Web 服务

## 学习路线图

```
案例一 ──→ 案例二 ──→ 案例三 ──→ 案例四
向量索引    基础RAG    RAG Chain   RAG服务

PDF加载     直接拼接    Prompt模板   Express
文本分割    LLM调用    Chain编排    流式输出
向量存储    手动检索    自动流水线   对话历史
检索测试                               MMR检索

── 理解度递增，工程复杂度递增 ──>
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
npm start           # 案例一：构建向量索引 + 检索测试
npm run rag-basic   # 案例二：基础 RAG（直接调用 LLM）
npm run rag-chain   # 案例三：RAG Chain（LangChain 流水线）
npm run dev         # 案例四：RAG Web 服务（Express + 流式 + 对话历史）
```

---

## 案例一：构建向量索引

> 源文件：[vector-store.ts](vector-store.ts) · 运行：`npm start`

### 学习目标

掌握 RAG 的基础能力 — **将 PDF 文档向量化并存储**，然后通过语义检索验证效果。

### 核心流程

```
PDF 文档
   │
   ▼
PDFLoader 加载 ──→ RecursiveCharacterTextSplitter 分割
                        │
                        ▼
                  FaissStore 向量化存储（分批处理）
                        │
                        ▼
                  保存到本地 ./faiss_index
                        │
                        ▼
                  Retriever 检索测试
```

### 关键实现要点

| 要点 | 说明 |
|---|---|
| 文档加载 | `PDFLoader` 解析 PDF 为 Document 对象 |
| 文本分割 | `chunkSize: 300`，`chunkOverlap: 150`，中文标点作为分隔符 |
| 向量模型 | 阿里通义 `text-embedding-v4` |
| 向量存储 | `FaissStore`（Facebook AI Similarity Search） |
| 分批处理 | 每批 10 个文档，避免 API 限流 |
| 检索验证 | 8 个测试查询，覆盖不同语义维度 |

### 观察重点

- 文本分割后产生了多少个 chunk？每个 chunk 大约多长？
- 检索结果是否与查询语义相关？

---

## 案例二：基础 RAG

> 源文件：[rag-basic.ts](rag-basic.ts) · 运行：`npm run rag-basic`

### 学习目标

在案例一的基础上，**加入 LLM 生成回答** — 检索相关文档，拼接到 prompt 中，让 LLM 根据上下文回答问题。

### 与案例一的对比

| 对比 | 案例一 | 案例二 |
|---|---|---|
| 检索 | 检索 + 打印 | 检索 + 作为上下文 |
| 生成 | 无 | LLM 根据上下文回答 |
| 向量索引 | 每次重新构建 | 优先加载本地索引 |

### 核心流程

```
用户问题
   │
   ▼
FaissStore.load() 加载本地索引（如已存在）
   │
   ▼
Retriever 检索最相关的文档
   │
   ▼
拼接 prompt = "请根据上下文回答：" + 检索结果 + 用户问题
   │
   ▼
ChatOpenAI（qwen-plus）生成回答
```

### 关键实现要点

```ts
// 优先加载本地索引，避免重复构建
if (fs.existsSync(indexPath)) {
  vectorStore = await FaissStore.load(indexPath, embeddings);
} else {
  // 首次运行：从 PDF 构建索引
}

// 检索 + 拼接上下文
const retrievedDocs = await retriever.invoke(question);
const ragContext = retrievedDocs[0].pageContent;

// 调用 LLM
const response = await llm.invoke([
  questionMessage,
  new HumanMessage(`请根据上下文回答问题：${ragContext}`),
]);
```

### 观察重点

- LLM 的回答是否基于检索到的上下文？还是自己「编造」的？
- 如果问一个 PDF 中不存在的问题，LLM 会怎么回答？

---

## 案例三：RAG Chain

> 源文件：[rag-chain.ts](rag-chain.ts) · 运行：`npm run rag-chain`

### 学习目标

使用 LangChain 的 **Chain 编排能力** 重构案例二 — 将检索、prompt、LLM、输出解析串联为一条自动化流水线。

### 与案例二的对比

| 对比 | 案例二 | 案例三 |
|---|---|---|
| 检索方式 | 手动调用 retriever | Chain 自动调用 |
| Prompt | 字符串拼接 | `PromptTemplate` 模板化 |
| 调用方式 | 分步手动执行 | `chain.invoke()` 一行完成 |
| 输出 | 直接取 `response.content` | `StringOutputParser` 解析 |

### 核心流程

```
chain = RunnablePassthrough.assign({ context: 检索 })
          .pipe(ragPrompt)      // PromptTemplate
          .pipe(llm)            // ChatOpenAI
          .pipe(parser);        // StringOutputParser

const response = await chain.invoke({ question });
```

### 关键实现要点

```ts
// PromptTemplate 定义
const ragPrompt = PromptTemplate.fromTemplate(`
上下文：{context}
用户问题：{question}
请仅根据上述上下文回答。
`);

// Chain 编排：自动完成「检索 → 填充模板 → LLM → 解析」
const ragChain = RunnablePassthrough.assign({
  context: (input) => retriever.invoke(input.question)
    .then(docs => docs.map(d => d.pageContent).join("\n"))
}).pipe(ragPrompt).pipe(llm).pipe(parser);

// 一行调用
const response = await ragChain.invoke({ question });
```

### 观察重点

- 对比案例二：代码量减少了多少？
- `RunnablePassthrough.assign` 做了什么？为什么 context 是一个函数？

---

## 案例四：RAG Web 服务

> 源文件：[rag-server.ts](rag-server.ts) · 运行：`npm run dev`

### 学习目标

将 RAG 能力封装为 **完整的 Web 服务** — 支持多格式文档、流式输出、对话历史、多种检索模式。

### 功能特性

| 特性 | 说明 |
|---|---|
| 多格式文档 | PDF、Word、PPT、CSV、EPUB、Markdown、文本 |
| 向量存储 | `MemoryVectorStore`（内存，启动即构建） |
| 单轮问答 | `POST /api/chat` |
| 对话式问答 | `POST /api/chat/conversational`（流式 + 历史 + MMR） |
| 检索调试 | `POST /api/retrieve` |
| 对话历史 | `GET/DELETE /api/chat/history` |

### API 接口

```bash
# 单轮 RAG 问答
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "李元静的邮箱是什么？"}'

# 对话式 RAG（流式输出 + 聊天历史）
curl -X POST http://localhost:3000/api/chat/conversational \
  -H "Content-Type: application/json" \
  -H "x-session-id: test-001" \
  -d '{"question": "他有哪些技术栈？", "searchType": "mmr"}'

# 检索调试（查看原始检索结果）
curl -X POST http://localhost:3000/api/retrieve \
  -H "Content-Type: application/json" \
  -d '{"question": "前端开发技能", "searchType": "similarity", "k": 4}'
```

### 架构概览

```
library/ 目录（PDF/Word/Markdown...）
        │
        ▼
   loadDocuments() ──→ 多格式加载
        │
        ▼
   RecursiveCharacterTextSplitter ──→ 文本分割
        │
        ▼
   MemoryVectorStore ──→ 向量化存储
        │
   ┌────┴────┐
   ▼         ▼
相似度检索   MMR检索
   │         │
   └────┬────┘
        ▼
   RAG Chain ──→ PromptTemplate + LLM + Parser
        │
   ┌────┴────┐
   ▼         ▼
 单轮问答   对话式问答（流式 + 历史）
```

### 关键实现要点

- **多格式加载**：根据文件扩展名动态选择 loader（PDF/Docx/PPTX/CSV/EPUB/Text）
- **流式输出**：使用 SSE（Server-Sent Events）逐 token 推送
- **对话历史**：内存 Map 存储，每个 session 独立，最多保留 20 条
- **MMR 检索**：Maximum Marginal Relevance，兼顾相关性和多样性

### 观察重点

- 流式输出和非流式的用户体验差异？
- 同一个会话中连续提问，模型是否能利用对话历史？
- similarity 和 mmr 两种检索模式的结果有何不同？

---

## 核心概念速查

### RAG 流程

| 概念 | 说明 |
|---|---|
| **Document Loader** | 将文件（PDF/Word/网页等）加载为 Document 对象 |
| **Text Splitter** | 将长文档分割为适合向量化的小块（chunk） |
| **Embedding** | 将文本转换为高维向量，用于计算语义相似度 |
| **Vector Store** | 存储和检索向量的数据库（FaissStore / MemoryVectorStore） |
| **Retriever** | 根据查询从 Vector Store 中检索相关文档 |
| **Prompt Template** | 可复用的 prompt 模板，支持变量替换 |
| **Chain** | LangChain 的流水线编排，将多个步骤串联执行 |

### 检索模式

| 模式 | 说明 |
|---|---|
| **Similarity** | 返回与查询最相似的 Top-K 个文档 |
| **MMR** | Maximum Marginal Relevance，在相关性基础上去重，增加结果多样性 |

### 选型建议

| 场景 | 推荐方案 |
|---|---|
| 快速验证 RAG 效果 | 案例二 `rag-basic.ts` |
| 学习 LangChain Chain 编排 | 案例三 `rag-chain.ts` |
| 生产级 RAG 服务 | 案例四 `rag-server.ts` |

---

## 项目结构

```
├── vector-store.ts     # 案例一：构建向量索引 + 检索测试
├── rag-basic.ts        # 案例二：基础 RAG（直接调用 LLM）
├── rag-chain.ts        # 案例三：RAG Chain（LangChain 流水线）
├── rag-server.ts       # 案例四：RAG Web 服务（Express）
├── public/
│   └── index.html      # 前端页面（案例四使用）
├── library/
│   └── reference.pdf   # 知识库文档
└── faiss_index/        # 向量索引缓存（案例一生成）
```
