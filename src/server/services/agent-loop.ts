// エージェントループ
// Vercel AI SDK の generateText + stepCountIs でマルチステップ実行する

import { generateText, stepCountIs, type ModelMessage, type LanguageModel } from "ai";

export type AgentRunParams = {
  model: LanguageModel;
  modelId: string;
  systemPrompt: string;
  messages: ModelMessage[];
  tools?: Record<string, unknown>;
  maxSteps?: number;
};

export type AgentRunResult = {
  message: string;
  toolCalls: ToolCallRecord[];
  tokenUsage: { input_tokens: number; output_tokens: number; total_tokens: number };
  model: string | null;
};

export type ToolCallRecord = {
  tool_name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  duration_ms: number;
};

/**
 * エージェントループを実行して最終テキストを返す
 */
export async function runAgentLoop(params: AgentRunParams): Promise<AgentRunResult> {
  const { model, modelId, systemPrompt, messages, tools, maxSteps = 10 } = params;

  const result = await generateText({
    model,
    system: systemPrompt,
    messages,
    // tools が空の場合は undefined にする
    ...(tools && Object.keys(tools).length > 0 ? { tools: tools as any } : {}),
    stopWhen: stepCountIs(maxSteps),
  });

  // ツール呼び出しの記録を収集
  const toolCalls: ToolCallRecord[] = [];
  for (const step of result.steps) {
    for (const tc of step.toolCalls ?? []) {
      toolCalls.push({
        tool_name: tc.toolName,
        input: tc.input as Record<string, unknown>,
        output: {},
        duration_ms: 0,
      });
    }
  }

  // トークン使用量を集計
  const usage = result.usage;

  return {
    message: result.text,
    toolCalls,
    tokenUsage: {
      input_tokens: usage?.inputTokens ?? 0,
      output_tokens: usage?.outputTokens ?? 0,
      total_tokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
    },
    model: modelId,
  };
}
