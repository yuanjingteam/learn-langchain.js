import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

dotenv.config();

const llm = new ChatOpenAI({
  model: "qwen-plus",
  apiKey: process.env.QWEN_API_KEY,
  temperature: 0.7,
  streamUsage: false,
  configuration: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
});

const parser = new StringOutputParser();

// ============================================================
// Plan & Execute 模式：先规划，后执行
//
// 与 ReAct 的区别：
//   - ReAct：每一步都是「思考→行动→观察」，逐步推进
//   - Plan & Execute：先制定完整计划，再按计划逐步执行
//   - 更适合复杂的多步骤任务，执行路径更清晰
//
// 三个核心角色：
//   1. Planner（规划者）：分析任务，制定步骤计划
//   2. Executor（执行者）：逐个执行计划中的步骤
//   3. Replanner（重规划者）：根据执行结果决定是否需要调整计划
//
// 执行流程：
//   用户输入 → Planner 制定计划 → Executor 逐步执行
//              ↑ Replanner 评估 ←──┘
// ============================================================

// ---------- 工具定义 ----------
interface Tool {
  name: string;
  description: string;
  execute: (input: string) => Promise<string>;
}

const tools: Tool[] = [
  {
    name: "search",
    description: "搜索网络信息",
    execute: async (query: string) => {
      const results: Record<string, string> = {
        "北京美食": "北京著名美食：烤鸭（全聚德、大董）、炸酱面、豆汁焦圈、涮羊肉",
        "烤鸭历史": "北京烤鸭起源于南北朝，明朝成为宫廷美食，清朝传入民间",
        "北京天气": "北京今天晴，25°C，适合出行",
        "全聚德": "全聚德创立于1864年，是北京最著名的烤鸭店，招牌菜为挂炉烤鸭",
        "大董": "大董烤鸭店以酥不腻烤鸭闻名，创新改良了传统烤鸭工艺",
      };
      const matched = Object.entries(results).find(([key]) => {
        const chars = key.split("");
        return chars.every((c) => query.includes(c));
      });
      console.log(`🔍 搜索 "${query}" → ${matched?.[1] || ""}`);
      return matched ? matched[1] : `未找到关于"${query}"的信息`;
    },
  },
];

// ---------- Planner：制定计划 ----------
const plannerPrompt = PromptTemplate.fromTemplate(`
你是一个任务规划专家。请将用户的请求分解为具体的执行步骤。

可用工具：
{tools}

请输出 JSON 格式的计划，格式如下：
{{"steps": ["步骤1的描述", "步骤2的描述", ...]}}

注意：
- 每个步骤应该是一个具体、可执行的动作
- 步骤之间要有逻辑顺序
- 步骤数量不超过 5 个
- 如果某个步骤需要使用工具，在描述中注明工具名称

用户请求：{task}
`);

async function planTask(task: string): Promise<string[]> {
  const chain = plannerPrompt.pipe(llm).pipe(parser);
  const result = await chain.invoke({
    tools: tools.map((t) => `${t.name}: ${t.description}`).join("\n"),
    task,
  });

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const plan = JSON.parse(jsonMatch[0]);
      return plan.steps;
    }
  } catch {}

  // 如果解析失败，使用默认计划
  return [task];
}

// ---------- Executor：执行单个步骤 ----------
async function executeStep(step: string): Promise<string> {
  const executorPrompt = PromptTemplate.fromTemplate(`
  你是一个任务执行专家。请执行以下步骤，并返回执行结果。

  步骤：{step}

  请直接返回执行结果，简洁明了。
  `);
  const chain = executorPrompt.pipe(llm).pipe(parser);
  return await chain.invoke({ step });
}

// ---------- Replanner：评估和重规划 ----------
const replannerPrompt = PromptTemplate.fromTemplate(`
你是一个任务重规划专家。请评估执行结果，并决定下一步。

原始任务：{task}
已完成的步骤和结果：
{completed}
剩余计划：
{remaining}

请判断：
1. 如果任务已经完成，返回：{{"status": "complete", "result": "最终结果"}}
2. 如果需要继续执行，返回：{{"status": "replan", "steps": ["新步骤1", "新步骤2"]}}

请直接输出 JSON。
`);

async function shouldReplan(
  task: string,
  completed: string[],
  remaining: string[]
): Promise<{ status: string; result?: string; steps?: string[] }> {
  const chain = replannerPrompt.pipe(llm).pipe(parser);
  const result = await chain.invoke({
    task,
    completed: completed
      .map((r, i) => `步骤${i + 1}：${r}`)
      .join("\n"),
    remaining: remaining.map((s, i) => `${i + 1}. ${s}`).join("\n"),
  });

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {}

  return { status: "replan", steps: remaining };
}

// ---------- Plan & Execute 主循环 ----------
async function planAndExecute(task: string, maxIterations: number = 10) {
  console.log(`📋 任务：${task}\n`);

  // 1. 制定初始计划
  let steps = await planTask(task);
  console.log("📝 初始计划：");
  steps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
  console.log("");

  const completedResults: string[] = [];
  let iteration = 0;

  while (steps.length > 0 && iteration < maxIterations) {
    const currentStep = steps.shift()!;
    console.log(`\n🔄 执行步骤：${currentStep}`);

    // 2. 执行当前步骤
    const result = await executeStep(currentStep);
    console.log(`  ✅ 结果：${result}`);
    completedResults.push(result);

    // 3. 检查是否需要重规划
    if (steps.length > 0) {
      const replanResult = await shouldReplan(task, completedResults, steps);

      if (replanResult.status === "complete") {
        console.log("\n🎉 任务完成！");
        console.log(`最终结果：${replanResult.result}`);
        return replanResult.result;
      } else if (replanResult.steps) {
        console.log("\n📋 调整计划：");
        replanResult.steps.forEach((step: string, i: number) =>
          console.log(`  ${i + 1}. ${step}`)
        );
        steps = replanResult.steps;
      }
    }

    iteration++;
  }

  // 4. 生成最终总结
  const summaryPrompt = PromptTemplate.fromTemplate(`
  请根据以下执行结果，生成一个简洁的最终总结。

  任务：{task}
  执行结果：
  {results}

  请用 2-3 句话总结。
  `);

  const summaryChain = summaryPrompt.pipe(llm).pipe(parser);
  const summary = await summaryChain.invoke({
    task,
    results: completedResults.map((r, i) => `步骤${i + 1}：${r}`).join("\n"),
  });

  console.log("\n🎉 任务完成！");
  console.log(`最终结果：${summary}`);
  return summary;
}

// ---------- 执行 ----------
await planAndExecute("我想了解北京的美食文化，包括历史背景和推荐餐厅");