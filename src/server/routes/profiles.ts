// プロファイル API
// GET /api/profiles — 一覧

import { Hono } from "hono";
import { listProfiles } from "../config/profiles.js";

const app = new Hono();

app.get("/", (c) => {
  const profiles = listProfiles();
  return c.json({
    profiles: profiles.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
    })),
  });
});

export default app;
