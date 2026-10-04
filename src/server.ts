import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { routeToolDefinitions } from "./tools/routes.js";
import { waypointToolDefinitions } from "./tools/waypoints.js";
import { outingToolDefinitions } from "./tools/outings.js";
import { areaToolDefinitions } from "./tools/areas.js";
import { bookToolDefinitions } from "./tools/books.js";
import { articleToolDefinitions } from "./tools/articles.js";

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.AnyZodObject;
  // `never` accepts every handler whatever its input type; the SDK validates input against inputSchema first
  handler: (input: never) => Promise<string>;
}

export const INSTRUCTIONS =
  "Camptocamp.org data: routes, waypoints (summits, huts), outings (trip reports), areas, books, articles. " +
  "To work in a region, call search_areas first and pass the returned ID as area_id to search_routes, search_waypoints or search_outings. " +
  "Every result carries its Camptocamp ID: pass it to the matching get_* tool; detail results list the IDs of associated documents. " +
  "Text is in French when Camptocamp has a French version, otherwise in another available language. " +
  "Descriptions keep Camptocamp markup as is.";

const TOOL_ANNOTATIONS = { readOnlyHint: true, idempotentHint: true, openWorldHint: true };

const toolDefinitions: ToolDefinition[] = [
  ...routeToolDefinitions,
  ...waypointToolDefinitions,
  ...outingToolDefinitions,
  ...areaToolDefinitions,
  ...bookToolDefinitions,
  ...articleToolDefinitions,
];

export function createServer(): McpServer {
  const server = new McpServer({ name: "mcp-camptocamp", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  for (const tool of toolDefinitions) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema.shape,
        annotations: TOOL_ANNOTATIONS,
      },
      async (input: unknown) => {
        try {
          const text = await tool.handler(input as never);
          return { content: [{ type: "text" as const, text }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text" as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}
