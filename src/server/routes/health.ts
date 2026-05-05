// ヘルスチェック API
// GET /api/health — バックエンド + Registry の接続状態

import { Hono } from "hono";
import { getRegistryUrl } from "../services/env.js";

const app = new Hono();

// sidecar 自身を識別するための情報。index.ts から起動時に注入される。
// バンドル版アプリが port 3001 で他人 sidecar（消えた worktree の幽霊など）を
// 検知できるよう、/api/health に pid と dataDir を返す。
let sidecarIdentity: { pid: number; dataDir: string } = {
  pid: typeof process !== "undefined" ? process.pid : 0,
  dataDir: "",
};

export function setSidecarIdentity(info: { pid: number; dataDir: string }): void {
  sidecarIdentity = info;
}

app.get("/", async (c) => {
  const registryUrl = getRegistryUrl(c);
  let registryStatus: "ok" | "unavailable" = "unavailable";

  if (registryUrl) {
    try {
      const res = await fetch(`${registryUrl.replace(/\/$/, "")}/api/servers`, {
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
    pid: sidecarIdentity.pid,
    dataDir: sidecarIdentity.dataDir,
  });
});

export default app;
