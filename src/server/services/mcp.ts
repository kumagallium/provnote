// @ai-sdk/mcp クライアント管理
// Crucible Registry から取得した SSE URL に接続してツールを取得する

import { createMCPClient } from "@ai-sdk/mcp";
type MCPServerInfo = {
  name: string;
  url: string;
  [key: string]: unknown;
};

type MCPClient = Awaited<ReturnType<typeof createMCPClient>>;

/**
 * Registry サーバー一覧から MCP クライアントを生成し、ツールを取得する
 * 接続失敗したサーバーはスキップする（graceful degradation）
 */
export async function connectMCPServers(
  servers: MCPServerInfo[],
): Promise<{ tools: Record<string, unknown>; clients: MCPClient[] }> {
  const clients: MCPClient[] = [];
  let tools: Record<string, unknown> = {};

  // 各サーバーに並列接続し、タイムアウトでハングを防止
  const CONNECTION_TIMEOUT_MS = 10_000;

  const results = await Promise.allSettled(
    servers.map(async (server) => {
      const client = await Promise.race([
        createMCPClient({
          transport: {
            type: "sse",
            url: server.url,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("接続タイムアウト")), CONNECTION_TIMEOUT_MS),
        ),
      ]);
      const serverTools = await client.tools();
      return { client, tools: serverTools, name: server.name };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      clients.push(result.value.client);
      tools = { ...tools, ...result.value.tools };
    } else {
      console.warn(`MCP サーバーへの接続に失敗:`, result.reason);
    }
  }

  return { tools, clients };
}

/**
 * MCP クライアントをすべて閉じる
 */
export async function closeMCPClients(clients: MCPClient[]): Promise<void> {
  await Promise.allSettled(clients.map((c) => c.close()));
}
