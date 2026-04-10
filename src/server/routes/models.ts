// モデル管理 API
// GET /api/models — 一覧
// POST /api/models — 追加
// PUT /api/models/:id — 更新
// DELETE /api/models/:id — 削除
// POST /api/models/available — プロバイダーのモデル一覧取得

import { Hono } from "hono";
import { listModels, addModel, updateModel, removeModel, getDefaultModel } from "../config/models.js";
import { fetchAvailableModels } from "../services/llm.js";

const app = new Hono();

// 登録済みモデル一覧
app.get("/", (c) => {
  const models = listModels();
  const defaultModel = getDefaultModel();
  return c.json({
    models: models.map((m) => ({
      name: m.name,
      provider: m.provider,
      model_id: m.modelId,
      api_base: m.apiBase ?? "",
      supports_function_calling: true,
      id: m.id,
    })),
    default: defaultModel?.name ?? "",
  });
});

// モデル追加
app.post("/", async (c) => {
  const body = await c.req.json<{
    model_name: string;
    provider: string;
    model_id: string;
    api_key: string;
    api_base?: string;
  }>();

  if (!body.model_name || !body.provider || !body.model_id || !body.api_key) {
    return c.json({ error: "必須フィールドが不足しています" }, 400);
  }

  const model = addModel({
    name: body.model_name,
    provider: body.provider,
    modelId: body.model_id,
    apiKey: body.api_key,
    apiBase: body.api_base ?? null,
  });

  return c.json({ message: `Model '${model.name}' added`, id: model.id }, 201);
});

// モデル更新
app.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    model_name?: string;
    provider?: string;
    model_id?: string;
    api_key?: string;
    api_base?: string;
  }>();

  const updated = updateModel(id, {
    ...(body.model_name ? { name: body.model_name } : {}),
    ...(body.provider ? { provider: body.provider } : {}),
    ...(body.model_id ? { modelId: body.model_id } : {}),
    ...(body.api_key ? { apiKey: body.api_key } : {}),
    ...(body.api_base !== undefined ? { apiBase: body.api_base || null } : {}),
  });

  if (!updated) {
    return c.json({ error: "モデルが見つかりません" }, 404);
  }
  return c.json({ message: `Model '${updated.name}' updated` });
});

// モデル削除
app.delete("/:id", (c) => {
  const id = c.req.param("id");
  const removed = removeModel(id);
  if (!removed) {
    return c.json({ error: "モデルが見つかりません" }, 404);
  }
  return c.json({ message: "Model deleted" });
});

// プロバイダーのモデル一覧を取得
app.post("/available", async (c) => {
  const body = await c.req.json<{
    provider: string;
    api_key: string;
    api_base?: string;
  }>();

  if (!body.provider || !body.api_key) {
    return c.json({ error: "provider と api_key は必須です" }, 400);
  }

  try {
    const models = await fetchAvailableModels(
      body.provider,
      body.api_key,
      body.api_base,
    );
    return c.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return c.json({ error: message }, 502);
  }
});

export default app;
