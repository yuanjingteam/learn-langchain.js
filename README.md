# learn-langchain.js

> LangChain.js 大模型调用方式教学演示

LangChain.js 是连接大模型与应用的核心框架，用极少量代码即可对接几乎所有主流大模型，无需关心底层接口差异。本项目以千问大模型为例，通过案例演示工程化提示词（PromptTemplate）、链式调用（LCEL）、案例：AI 面试助手（Interview Assistant）等核心用法。

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

## 项目结构

```
src/
├── 0-create-model.ts        创建模型对象
├── 1-prompt-template.ts     PromptTemplate 基础用法
├── 2-chain.ts               LCEL 链式调用
├── 3-interview-assistant.ts AI 面试助手示例
└── 6-tool-calling.ts        完整工具调用
```

## 实战演示

### 2.1 导入相关依赖模块

```ts
import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
dotenv.config();
```

### 2.2 创建模型对象

```bash
npm run dev
```

源文件：[0-create-model.ts](src/0-create-model.ts)

### 2.3 PromptTemplate 基础用法

将 Prompt 拆成：模板（结构） + 参数（数据），解决字符串拼接的可维护性问题。

```bash
npm run demo:prompt-template
```

源文件：[1-prompt-template.ts](src/1-prompt-template.ts)

### 2.4 链式调用（LCEL）

使用 `.pipe()` 将模板和模型串联，一次 `invoke` 自动完成数据注入和模型调用：

```bash
npm run demo:chain
```

源文件：[2-chain.ts](src/2-chain.ts)

### 2.5 真实项目示例：AI 面试助手

基于 PromptTemplate + 链式调用，实现多角色面试问答，只需修改模板即可扩展：

```bash
npm run demo:interview
```

源文件：[3-interview-assistant.ts](src/3-interview-assistant.ts)

## 构建与类型检查

```bash
npm run build
npm run typecheck
```
