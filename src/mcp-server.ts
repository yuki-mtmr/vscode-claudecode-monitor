import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { QuotaService } from "./services/quota-service";

const server = new Server(
  {
    name: "claudecode-quota-monitor",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const quotaService = new QuotaService();

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_quota_stats",
        description: "Get the current Claude Code quota and usage statistics",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_quota_stats") {
    const stats = quotaService.getLocalStats();
    const realtime = await quotaService.getRealtimeQuota();
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ stats, realtime }, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Claude Code Quota MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
