# learn-langchain.js

LangChain.js 学习项目，通过实践掌握 LangChain.js 的核心概念与使用方式。

## 安装

```bash
npm install
```

## 环境变量

在项目根目录下创建 `.env` 文件，填入 API Key：

```
QWEN_API_KEY=your-api-key-here
```

## 运行示例

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 创建大模型对象 |
| `npm run demo:invoke` | 非流式调用 |
| `npm run demo:messages` | 标准消息格式调用 |
| `npm run demo:stream` | 流式调用 |
| `npm run demo:batch` | 批量调用 |
| `npm run demo:structured` | 结构化输出 |

## 5 种调用方式对比

| 对比项 | invoke | messages | stream | batch | structuredOutput |
| --- | --- | --- | --- | --- | --- |
| 方法 | `llm.invoke()` | `llm.invoke()` | `llm.stream()` | `llm.batch()` | `llm.withStructuredOutput()` |
| 消息格式 | 原始对象 `{ role, content }` | 标准类 `SystemMessage` 等 | 字符串或消息数组 | 字符串数组 | 字符串或消息数组 |
| 返回方式 | 一次性返回 | 一次性返回 | 逐块流式返回 | 一次性批量返回 | 一次性返回 |
| 返回类型 | `AIMessage` | `AIMessage` | `IterableReadableStream` | `AIMessage[]` | `z.infer<typeof Schema>` |
| 类型安全 | 无 | 有 | 无 | 无 | 有（Zod 校验） |
| 适用场景 | 快速测试 | 多轮对话开发 | 聊天界面实时输出 | 高并发批量处理 | 程序消费结构化数据 |
| 源文件 | `1-invoke.ts` | `2-messages.ts` | `3-stream.ts` | `4-batch.ts` | `5-structured-output.ts` |

## 构建与类型检查

```bash
npm run build
npm run typecheck
```
