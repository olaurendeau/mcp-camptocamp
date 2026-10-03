#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { routeToolDefinitions } from "./tools/routes.js";
import { waypointToolDefinitions } from "./tools/waypoints.js";
import { outingToolDefinitions } from "./tools/outings.js";
import { areaToolDefinitions } from "./tools/areas.js";
import { bookToolDefinitions } from "./tools/books.js";

const server = new McpServer({
  name: "mcp-camptocamp",
  version: "1.0.0",
});

const allTools = [
  ...routeToolDefinitions,
  ...waypointToolDefinitions,
  ...outingToolDefinitions,
  ...areaToolDefinitions,
  ...bookToolDefinitions,
];

for (const tool of allTools) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.tool(tool.name, tool.description, tool.inputSchema.shape, async (input: any) => {
    try {
      const text = await tool.handler(input);
      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  });
}

const transport = new StdioServerTransport();
await server.connect(transport);
