// ツール一覧 API
// GET /api/tools — Crucible Registry 経由で取得

import { Hono } from "hono";
import { fetchRegistryServers } from "../services/registry.js";

const app = new Hono();

app.get("/", async (c) => {
  const registryUrl = process.env.CRUCIBLE_API_URL ?? "";
  const registryKey = process.env.CRUCIBLE_API_KEY ?? "";

  const servers = await fetchRegistryServers(registryUrl, registryKey);

  return c.json({
    tools: servers.map((s) => ({
      name: s.name,
      display_name: s.display_name,
      description: s.description ?? "",
      tool_type: s.tool_type,
      status: s.status,
      icon: s.icon ?? "",
    })),
    sources: {
      crucible: {
        url: registryUrl,
        status: servers.length > 0 ? "connected" : registryUrl ? "degraded" : "not_configured",
        server_count: servers.length,
      },
    },
  });
});

export default app;
