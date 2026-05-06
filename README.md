# learn-langchain.js

> LangChain.js 大模型调用方式教学演示

LangChain.js 是连接大模型与应用的核心框架，用极少量代码即可对接几乎所有主流大模型，无需关心底层接口差异。本项目以千问大模型为例，演示消息调用、工具消息、真实工具调用等核心用法，帮你快速上手。

## 环境要求

- Node.js >= 18

## 安装

```bash
npm install
```

## 环境变量

在项目根目录下创建 `.env` 文件，填入 API Key（该文件已被 `.gitignore` 忽略，不会提交到仓库）：

```
QWEN_API_KEY=your-api-key-here
```

## 实战演示

### 2.1 导入相关依赖模块

```ts
import dotenv from "dotenv"; // 加载环境变量中的模型 API 密钥
import { ChatOpenAI } from "@langchain/openai";
dotenv.config();
```

### 2.2 创建模型对象

```bash
npm run dev
```

源文件：[0-create-model.ts](src/0-create-model.ts)

### 2.3 消息的基本使用

将多种类型的消息一并发送给模型，模型会根据消息的类型和内容进行响应。一般用于有记忆的多轮对话场景中，模型会根据之前的消息内容进行上下文理解和回复。

```bash
npm run demo:messages
```

源文件：[1-messages.ts](src/1-messages.ts)

### 2.4 工具消息 ToolMessage

工具消息用于将工具执行的结果传递回模型。本示例通过手动构造 `AIMessage`（带 `tool_calls`）和 `ToolMessage`，展示工具消息的结构和用法，帮助理解：

- `AIMessage` 中 `tool_calls` 的结构（工具名、参数、调用ID）
- `ToolMessage` 中 `tool_call_id` 如何与 `tool_calls` 关联
- 消息组装顺序：用户提问 → 模型决定调工具 → 工具结果 → 模型生成回复

```bash
npm run demo:tool-message
```

源文件：[2-tool-message.ts](src/2-tool-message.ts)

### 2.5 完整工具调用示例

基于 2.4 中理解的消息结构，本示例使用 `tool()` + `zod` 定义工具，通过 `bindTools` 绑定到模型，实现完整的工具调用流程。支持通过命令行参数指定查询城市：

```bash
npm run demo:tool-calling
# 也可以指定城市
tsx src/3-tool-calling.ts 北京
```

源文件：[3-tool-calling.ts](src/3-tool-calling.ts)

### 2.6 真实 API 工具调用示例

在 2.5 的基础上，将工具的内部实现从硬编码数据替换为真实的天气 API 调用（[wttr.in](https://wttr.in)），无需 API Key，开箱即用。演示工具如何接入外部 API 获取实时数据：

```bash
npm run demo:tool-calling-api
# 也可以指定城市
tsx src/4-tool-calling-api.ts 北京
```

源文件：[4-tool-calling-api.ts](src/4-tool-calling-api.ts)

## 关于工具调用

大模型虽然强大，但只能生成文本，无法：

- 查询实时数据（天气、股价、新闻）
- 操作外部系统（数据库、文件系统）
- 执行精确计算（数学公式验证）

**工具调用（Tool Calling）** 让模型从"文本生成器"升级为"任务执行器"，以上举得就是天气的例子

## 构建与类型检查

```bash
npm run build
npm run typecheck
```
