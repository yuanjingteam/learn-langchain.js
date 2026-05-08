# learn-langchain.js

> LangChain.js 记忆系统教学演示：从 Buffer 到向量记忆

## 课程目标

通过 4 个递进的记忆案例，掌握 AI 应用的 **记忆管理** 核心能力。学完本课程，你将理解：

- 为什么 LLM 需要记忆系统（每次调用都是无状态的）
- 4 种记忆策略的原理、优缺点和适用场景
- 如何在 LangChain.js 中实现每种记忆策略

## 学习路线图

```
案例一 ──→ 案例二 ──→ 案例三 ──→ 案例四
Buffer     Window     Summary    Vector
Memory     Memory     Memory     Memory

完整保留   滑动窗口   摘要压缩   语义检索
全部历史   最近K轮    关键信息   相关对话
    ↓          ↓          ↓          ↓
 简单直接   Token可控  信息保留   按需召回
 成本最高   信息丢失   细节丢失   最灵活

 ─── 信息密度递增，实现复杂度递增 ───>
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
npm run dev:buffer    # 案例一：Buffer Memory（完整对话历史）
npm run dev:window    # 案例二：Window Memory（滑动窗口）
npm run dev:summary   # 案例三：Summary Memory（对话摘要）
npm run dev:vector    # 案例四：Vector Memory（向量记忆）
```

---

## 案例一：Buffer Memory（完整对话历史）

> 源文件：[src/buffer-memory.ts](src/buffer-memory.ts) · 运行：`npm run dev:buffer`

### 学习目标

理解最简单的记忆策略 — **把所有对话消息原封不动地保存下来**，每次调用 LLM 时将全部历史拼接到 prompt 中。

### 核心思想

```
用户输入 → 取出全部历史 → 拼接为 messages → 发送给 LLM
        → LLM 回复 → 存入历史 → 返回给用户

对话轮次    发送消息数
  第1轮         2（user + ai）
  第2轮         4
  第3轮         6
  第4轮         8  ← 线性增长
```

### 关键实现要点

| 要点 | 说明 |
|---|---|
| 存储方式 | `InMemoryChatMessageHistory` 保存所有消息 |
| 拼接策略 | 每次将 `[systemPrompt, ...全部历史]` 发送给 LLM |
| Token 消耗 | 随对话轮次线性增长 |
| 信息保留 | 100% 保留，无信息丢失 |

### 观察重点

- 运行后观察每轮对话的「发送消息数」— 是否线性增长？
- 对比后续案例：Window 和 Summary 会怎样控制这个数字？

### 局限性

- Token 成本线性增长，长对话成本高
- 超过模型上下文窗口后会截断或报错
- 长对话中早期信息被「遗忘在噪音里」，效果反而下降

---

## 案例二：Window Memory（滑动窗口）

> 源文件：[src/window-memory.ts](src/window-memory.ts) · 运行：`npm run dev:window`

### 学习目标

理解 **滑动窗口策略** — 只保留最近 K 轮对话，超出窗口的历史消息被丢弃。

### 与 Buffer Memory 的对比

| 对比 | Buffer Memory | Window Memory |
|---|---|---|
| 保留范围 | 全部历史 | 最近 K 轮 |
| Token 消耗 | 线性增长 | 固定上限（≤ 2K） |
| 早期信息 | 完全保留 | 完全丢失 |
| 实现复杂度 | 极简 | 简单（切片操作） |

### 执行流程

```
窗口大小 K = 3

第1轮：你好，我叫张三        → 保存 [消息1, 消息2]
第2轮：我是一名前端工程师     → 保存 [消息1, 消息2, 消息3, 消息4]
第3轮：我喜欢打篮球           → 保存 [消息1~6]，发送最近6条
第4轮：你还记得我叫什么？     → 丢弃消息1~2，发送消息3~8
                               ↑ 早期信息丢失！
```

### 关键实现要点

```ts
const WINDOW_SIZE = 3;  // 保留最近3轮对话

function getRecentMessages(allMessages, windowSize) {
  const maxMessages = windowSize * 2;  // 每轮 = user + ai = 2条
  if (allMessages.length <= maxMessages) return allMessages;
  return allMessages.slice(allMessages.length - maxMessages);
}
```

### 观察重点

- 发送给 LLM 的消息数是否有上限？上限是多少？
- 当问「你还记得我叫什么名字吗？」时，模型能回答吗？为什么？

### 局限性

- 早期对话内容被完全丢弃，不是「遗忘」而是「删除」
- 关键信息如果在早期对话中，模型会「失忆」

---

## 案例三：Summary Memory（对话摘要）

> 源文件：[src/summary-memory.ts](src/summary-memory.ts) · 运行：`npm run dev:summary`

### 学习目标

理解 **摘要压缩策略** — 当对话历史超过阈值时，用 LLM 将旧历史压缩为摘要，再将「摘要 + 最近几轮原始对话」拼接后发给 LLM。

### 与前两种策略的对比

| 对比 | Buffer | Window | Summary |
|---|---|---|---|
| 保留方式 | 全部原文 | 最近K轮原文 | 旧历史压缩为摘要 + 最近原文 |
| Token 消耗 | 线性增长 | 固定上限 | 缓慢增长（摘要远短于原文） |
| 早期信息 | 100%保留 | 完全丢失 | 关键信息保留，细节丢失 |
| 额外成本 | 无 | 无 | 每次压缩需调用 LLM |

### 执行流程

```
阈值 = 6 条消息

第1轮：你好，我叫张三        → 直接保存
第2轮：我是一名前端工程师     → 直接保存
第3轮：我喜欢打篮球           → 消息数 = 6，触发压缩！
                               → LLM 将前6条压缩为摘要
                               → 保留「摘要 + 最近4条」
第4轮：你还记得我叫什么？     → 发送「摘要 + 最近消息」给 LLM
                               → 模型从摘要中找到「张三」
```

### 关键实现要点

```ts
const SUMMARIZE_THRESHOLD = 6;    // 消息数超过此值触发压缩
const RECENT_MESSAGES_TO_KEEP = 4; // 压缩后保留最近4条原始消息

// 压缩时：将旧消息 + 之前的摘要 发送给 LLM
const summary = await llm.invoke(`请将以下对话压缩为摘要：${oldMessages}`);
```

### 观察重点

- 什么时候触发摘要压缩？观察控制台的「正在压缩对话历史为摘要...」
- 对比 Window Memory：问「我叫什么名字」时，Summary 能回答，Window 不能
- 摘要中保留了什么？丢失了什么？

### 局限性

- 摘要过程会丢失细节（「他说了什么」变成「他聊了某话题」）
- 每次压缩需要额外调用一次 LLM，增加延迟和成本
- 摘要质量取决于 LLM 的能力

---

## 案例四：Vector Memory（向量记忆）

> 源文件：[src/vector-memory.ts](src/vector-memory.ts) · 运行：`npm run dev:vector`

### 学习目标

理解 **语义检索记忆** — 将每轮对话向量化存储，当用户提问时，通过语义检索找出与当前问题最相关的历史对话。

### 与前三种策略的对比

| 对比 | Buffer | Window | Summary | Vector |
|---|---|---|---|---|
| 检索方式 | 全部 | 最近K轮 | 摘要+最近 | 语义相似度 |
| 信息来源 | 按时间顺序 | 按时间顺序 | 按时间压缩 | 按相关性召回 |
| 长期记忆 | 支持但成本高 | 不支持 | 支持但细节丢失 | 天然支持 |
| 实现复杂度 | 极简 | 简单 | 中等 | 较高 |

### 执行流程

```
第1轮：我叫张三              → 向量化存储
第2轮：我住在北京             → 向量化存储
第3轮：我在学 React           → 向量化存储
第4轮：今天天气真好           → 向量化存储（与技术无关）
第5轮：你还记得我在学什么？   → 语义检索 → 命中第3轮「React」
                               → 将检索结果 + 最近消息 发给 LLM
```

### 关键实现要点

```ts
// 1. 将对话向量化存储
const vector = await embeddings.embedQuery(`用户：${msg}\n助手：${reply}`);
vectorStore.push({ text, vector, metadata });

// 2. 语义检索：计算余弦相似度，返回最相关的 K 条
const queryVector = await embeddings.embedQuery(userInput);
const scored = vectorStore.map(entry => ({
  entry,
  score: cosineSimilarity(queryVector, entry.vector),
}));
scored.sort((a, b) => b.score - a.score);
return scored.slice(0, topK);

// 3. 将检索结果作为上下文注入 prompt
const messages = [systemPrompt, memoryContext, ...recentHistory, userMessage];
```

### 观察重点

- 运行后观察「语义检索到 N 条相关历史」— 检索结果是否与当前问题语义相关？
- 对比 Summary：当问「我之前说我在学什么技术？」时，Vector 能精准召回，而 Summary 可能丢失细节
- 注意中间穿插的「天气」话题 — 它不会干扰技术相关的检索结果

### 局限性

- 需要 Embedding 模型，增加 API 调用成本
- 语义检索可能遗漏上下文（只返回片段，缺乏连贯性）
- 实现复杂度较高，需要维护向量存储和相似度计算

---

## 核心概念速查

### 记忆策略对比

| 概念 | 说明 |
|---|---|
| **BufferMemory** | 完整保存所有对话历史，每次调用 LLM 时全部发送。实现最简单，但 Token 消耗线性增长 |
| **WindowMemory** | 只保留最近 K 轮对话，超出窗口的历史被丢弃。Token 可控，但早期信息完全丢失 |
| **SummaryMemory** | 将旧历史压缩为摘要，保留关键信息。Token 增长缓慢，但压缩过程有细节损失 |
| **向量记忆** | 将对话向量化存储，按语义相似度检索相关历史。最灵活，但实现复杂度最高 |

### 技术概念

| 概念 | 说明 |
|---|---|
| **InMemoryChatMessageHistory** | LangChain 内置的内存消息存储，提供 add/get/clear 接口 |
| **BaseMessage** | 所有消息的基类，子类包括 HumanMessage、AIMessage、SystemMessage |
| **Embedding** | 将文本转换为高维向量，用于计算语义相似度 |
| **余弦相似度** | 衡量两个向量方向的相似程度，值域 [-1, 1]，越接近 1 越相似 |
| **Token** | LLM 处理文本的基本单位，Token 数量直接影响 API 调用成本 |

### 选型建议

| 场景 | 推荐策略 |
|---|---|
| 短对话、单轮问答 | Buffer Memory |
| 闲聊机器人、不需要长期记忆 | Window Memory |
| 客服系统、需要跨多轮保持上下文 | Summary Memory |
| 长期个人助手、知识库问答 | Vector Memory |

---

## 项目结构

```
src/
├── buffer-memory.ts    # 案例一：Buffer Memory（完整对话历史）
├── window-memory.ts    # 案例二：Window Memory（滑动窗口）
├── summary-memory.ts   # 案例三：Summary Memory（对话摘要）
└── vector-memory.ts    # 案例四：Vector Memory（向量记忆）
```
