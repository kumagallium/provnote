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

  for (const server of servers) {
    try {
      const client = await createMCPClient({
        transport: {
          type: "sse",
          url: server.url,
        },
      });
      clients.push(client);

      const serverTools = await client.tools();
      tools = { ...tools, ...serverTools };
    } catch (err) {
      console.warn(`MCP サーバー ${server.name} への接続に失敗:`, err);
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
