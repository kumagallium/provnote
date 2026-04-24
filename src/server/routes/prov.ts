// PROV API ルート
// POST /api/prov/ingest-url — URL から PROV ラベル付きブロック構造を生成
//
// 処理の流れ:
//   1. URL を fetch してテキスト抽出（url-fetcher 共通処理）
//   2. PROV ingester プロンプトで LLM に投げる
//   3. 構造化 JSON を返す（フロント側で BlockNote ブロックに組み立て）

import { Hono } from "hono";
import { createModel } from "../services/llm.js";
import { resolveModelConfig } from "../services/header-model.js";
import { runAgentLoop } from "../services/agent-loop.js";
import {
  buildProvIngesterSystemPrompt,
  buildProvIngesterUserMessage,
  parseProvIngesterOutput,
  type ProvIngesterOutput,
} from "../services/prov-ingester.js";
import { fetchPageAsText, type FetchPageError } from "../services/url-fetcher.js";

const app = new Hono();

// URL から PROV 構造化ブロックを生成
app.post("/ingest-url", async (c) => {
  const body = await c.req.json<{
    url: string;
    language?: string;
    model?: string;
  }>();

  if (!body.url) {
    return c.json({ error: "url は必須です" }, 400);
  }

  // モデル解決: ヘッダー → body.model → デフォルト
  const modelConfig = resolveModelConfig(c, { modelName: body.model });

  if (!modelConfig) {
    return c.json(
      { error: "モデルが登録されていません。Settings → AI Setup からモデルを追加してください。" },
      400,
    );
  }

  // URL fetch
  let page;
  try {
    page = await fetchPageAsText(body.url);
  } catch (err) {
    const e = err as FetchPageError;
    if (typeof e?.status === "number" && typeof e?.message === "string") {
      return c.json({ error: e.message }, e.status as 400 | 500);
    }
    const message = err instanceof Error ? err.message : "不明なエラー";
    return c.json({ error: message }, 500);
  }

  if (!page.text || page.text.length < 50) {
    return c.json(
      { error: "ページから十分なテキストを取得できませんでした。" },
      400,
    );
  }

  // LLM 呼び出し
  const systemPrompt = buildProvIngesterSystemPrompt(body.language || "en");
  const userMessage = buildProvIngesterUserMessage({
    url: page.url,
    title: page.title || body.url,
    description: page.description,
    text: page.text,
  });

  try {
    const model = createModel(modelConfig);
    const result = await runAgentLoop({
      model,
      modelId: modelConfig.modelId,
      systemPrompt,
      messages: [{ role: "user" as const, content: userMessage }],
      maxSteps: 1,
    });

    const parsed: ProvIngesterOutput = parseProvIngesterOutput(result.message);

    if (parsed.blocks.length === 0) {
      return c.json(
        { error: "LLM が有効な PROV 構造を生成できませんでした。" },
        502,
      );
    }

    return c.json({
      title: parsed.title || page.title || body.url,
      blocks: parsed.blocks,
      sourceUrl: page.url,
      sourceTitle: page.title,
      sourceFetchedAt: page.fetchedAt,
      tokenUsage: result.tokenUsage,
      model: result.model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    console.error("PROV ingest-url error:", err);
    return c.json({ error: message }, 500);
  }
});

export default app;
