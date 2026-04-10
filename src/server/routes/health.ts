// ヘルスチェック API
// GET /api/health — バックエンド + Registry の接続状態

import { Hono } from "hono";

const app = new Hono();

app.get("/", async (c) => {
  const registryUrl = process.env.CRUCIBLE_API_URL ?? "";
  let registryStatus: "ok" | "unavailable" = "unavailable";

  if (registryUrl) {
    try {
      const res = await fetch(`${registryUrl.replace(/\/$/, "")}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) registryStatus = "ok";
    } catch {
      // 接続失敗
    }
  }

  return c.json({
    status: registryStatus === "ok" ? "healthy" : "degraded",
    components: {
      backend: "ok",
      registry: registryStatus,
    },
    version: "1.0.0",
  });
});

export default app;
