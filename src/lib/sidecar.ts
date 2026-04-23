// Tauri sidecar（バックエンドサーバー）のライフサイクル管理
// Tauri 環境でのみ使用される

import { isTauri } from "./platform";

const HEALTH_URL = "http://localhost:3001/api/health";
const MAX_RETRIES = 20;
const RETRY_INTERVAL_MS = 500;

type SidecarChild = {
  kill: () => Promise<void>;
};

export type SidecarStatus = "idle" | "starting" | "ready" | "failed";

export type SidecarState = {
  status: SidecarStatus;
  lastError: string | null;
  lastErrorAt: number | null;
};

let sidecarProcess: SidecarChild | null = null;
let recentLogLines: string[] = [];
const RECENT_LOG_LIMIT = 20;

const state: SidecarState = {
  status: "idle",
  lastError: null,
  lastErrorAt: null,
};

type Listener = (s: SidecarState) => void;
const listeners = new Set<Listener>();

function setState(patch: Partial<SidecarState>): void {
  Object.assign(state, patch);
  for (const l of listeners) l({ ...state });
}

function recordLog(line: string): void {
  recentLogLines.push(line);
  if (recentLogLines.length > RECENT_LOG_LIMIT) {
    recentLogLines = recentLogLines.slice(-RECENT_LOG_LIMIT);
  }
}

/** 現在の sidecar 状態を取得 */
export function getSidecarState(): SidecarState {
  return { ...state };
}

/** sidecar 起動失敗時の直近ログ（spawn の stderr/stdout） */
export function getRecentSidecarLog(): string[] {
  return [...recentLogLines];
}

/** 状態変化を購読する。返り値は解除関数 */
export function subscribeSidecarState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** sidecar サーバーのヘルスチェック */
async function waitForHealth(): Promise<boolean> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) return true;
    } catch {
      // まだ起動していない
    }
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
  }
  return false;
}

/** sidecar サーバーを起動する */
export async function startSidecar(): Promise<boolean> {
  if (!isTauri()) return false;

  setState({ status: "starting", lastError: null, lastErrorAt: null });
  recentLogLines = [];

  // 既にサーバーが動いている場合はスキップ（dev モードで別途起動済みなど）
  try {
    const res = await fetch(HEALTH_URL);
    if (res.ok) {
      console.log("[sidecar] Backend already running");
      setState({ status: "ready" });
      return true;
    }
  } catch {
    // 起動されていない → sidecar を起動する
  }

  try {
    const { Command } = await import("@tauri-apps/plugin-shell");
    const { documentDir, join: pathJoin } = await import("@tauri-apps/api/path");
    // データディレクトリを明示的に指定（process.cwd() の不安定さを回避）
    const docsDir = await documentDir();
    const dataDir = await pathJoin(docsDir, "Graphium", "server-data");

    const command = Command.sidecar("binaries/graphium-server", [], {
      env: {
        PORT: "3001",
        CORS_ORIGINS: "http://localhost:5174,tauri://localhost,http://tauri.localhost,https://tauri.localhost",
        DATA_DIR: dataDir,
      },
    });

    command.stdout.on("data", (line: string) => {
      console.log(`[sidecar] ${line}`);
      recordLog(line);
    });
    command.stderr.on("data", (line: string) => {
      console.error(`[sidecar] ${line}`);
      recordLog(line);
    });

    const child = await command.spawn();
    sidecarProcess = child;

    console.log("[sidecar] Starting backend server...");
    const healthy = await waitForHealth();
    if (healthy) {
      console.log("[sidecar] Backend server is ready");
      setState({ status: "ready" });
    } else {
      console.warn("[sidecar] Backend server failed to start");
      setState({
        status: "failed",
        lastError: "ヘルスチェックがタイムアウトしました（10 秒以内に応答なし）",
        lastErrorAt: Date.now(),
      });
    }
    return healthy;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[sidecar] Failed to spawn:", e);
    setState({ status: "failed", lastError: message, lastErrorAt: Date.now() });
    return false;
  }
}

/** sidecar サーバーが生きているか確認し、死んでいたら再起動 */
export async function ensureSidecar(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const res = await fetch(HEALTH_URL);
    if (res.ok) {
      setState({ status: "ready" });
      return true;
    }
  } catch {
    // 応答なし → 再起動を試みる
  }
  console.warn("[sidecar] Backend not responding, attempting restart...");
  sidecarProcess = null;
  return startSidecar();
}

/** sidecar を明示的に再起動する（UI からのトリガー用） */
export async function restartSidecar(): Promise<boolean> {
  if (!isTauri()) return false;
  await stopSidecar();
  return startSidecar();
}

/** sidecar サーバーを停止する */
export async function stopSidecar(): Promise<void> {
  if (sidecarProcess) {
    try {
      await sidecarProcess.kill();
      console.log("[sidecar] Backend server stopped");
    } catch (e) {
      console.error("[sidecar] Failed to stop:", e);
    }
    sidecarProcess = null;
  }
  setState({ status: "idle" });
}
