// Crucible Registry からのサーバー・ツール自動検出

export type RegistryServer = {
  name: string;
  display_name: string;
  description?: string;
  tool_type: string;
  status: string;
  port?: number;
  endpoint_path?: string;
  icon?: string;
};

/**
 * Crucible Registry に登録された全サーバー/ツールを取得する
 */
export async function fetchRegistryServers(
  registryUrl: string,
  apiKey?: string,
): Promise<RegistryServer[]> {
  if (!registryUrl) return [];

  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers["X-API-Key"] = apiKey;

    const res = await fetch(`${registryUrl.replace(/\/$/, "")}/api/servers`, {
      headers,
    });
    if (!res.ok) return [];

    // Registry は配列を直接返す
    const data = await res.json() as RegistryServer[] | { servers?: RegistryServer[] };
    const servers: RegistryServer[] = Array.isArray(data) ? data : (data.servers ?? []);
    return servers;
  } catch {
    // Registry に接続できない場合はツールなしで動作する
    return [];
  }
}

/**
 * MCP サーバー（SSE 接続可能なもの）のみフィルタする
 */
export function filterMCPServers(servers: RegistryServer[]): RegistryServer[] {
  return servers.filter(
    (s) => s.tool_type === "mcp_server" && s.status === "running",
  );
}

/**
 * MCP サーバーの SSE URL を構築する
 */
export function buildSSEUrl(server: RegistryServer, registryUrl: string): string {
  // Registry と同じホスト上で port と endpoint_path から URL を構築
  const host = new URL(registryUrl).hostname;
  const port = server.port ?? 8100;
  const path = server.endpoint_path ?? "/sse";
  return `http://${host}:${port}${path}`;
}
