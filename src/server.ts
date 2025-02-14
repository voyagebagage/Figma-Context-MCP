import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FigmaService } from "./services/figma";
import { PaginationService } from "./services/pagination";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import express, { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { IncomingMessage, ServerResponse } from "http";

export class FigmaMcpServer {
  private readonly server: McpServer;
  private readonly figmaService: FigmaService;
  private sseTransport: SSEServerTransport | null = null;

  constructor(figmaApiKey: string) {
    this.figmaService = new FigmaService(figmaApiKey);
    this.server = new McpServer({
      name: "Figma MCP Server",
      version: "0.1.0",
    });

    this.registerTools();
  }

  private registerTools(): void {
    // Tool to get file information with pagination
    this.server.tool(
      "get-file",
      "Get layout information about an entire Figma file",
      {
        fileKey: z.string().describe("The key of the Figma file to fetch"),
        depth: z.number().optional().describe("How many levels deep to traverse the node tree"),
        page: z.number().optional().describe("Page number for pagination"),
        pageSize: z.number().optional().describe("Number of characters per page")
      },
      async ({ fileKey, depth, page = 1, pageSize }) => {
        try {
          console.log(`Fetching file: ${fileKey} (depth: ${depth ?? "default"})`);
          const file = await this.figmaService.getFile(fileKey, depth);
          console.log(`Successfully fetched file: ${file.name}`);

          // Paginate the response
          const paginatedResponse = PaginationService.paginate(file, page, pageSize);

          return {
            content: [
              { 
                type: "text",
                text: JSON.stringify({
                  data: paginatedResponse.data,
                  pagination: paginatedResponse.metadata
                }, null, 2)
              }
            ],
          };
        } catch (error) {
          console.error(`Error fetching file ${fileKey}:`, error);
          return {
            content: [{ type: "text", text: `Error fetching file: ${error}` }],
          };
        }
      },
    );

    // Tool to get node information with pagination
    this.server.tool(
      "get-node",
      "Get layout information about a specific node in a Figma file",
      {
        fileKey: z.string().describe("The key of the Figma file containing the node"),
        nodeId: z.string().describe("The ID of the node to fetch"),
        depth: z.number().optional().describe("How many levels deep to traverse the node tree"),
        page: z.number().optional().describe("Page number for pagination"),
        pageSize: z.number().optional().describe("Number of characters per page")
      },
      async ({ fileKey, nodeId, depth, page = 1, pageSize }) => {
        try {
          console.log(
            `Fetching node: ${nodeId} from file: ${fileKey} (depth: ${depth ?? "default"})`,
          );
          const node = await this.figmaService.getNode(fileKey, nodeId, depth);
          console.log(
            `Successfully fetched node: ${node.name} (ids: ${Object.keys(node.nodes).join(", ")})`,
          );

          // Paginate the response
          const paginatedResponse = PaginationService.paginate(node, page, pageSize);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  data: paginatedResponse.data,
                  pagination: paginatedResponse.metadata
                }, null, 2)
              }
            ],
          };
        } catch (error) {
          console.error(`Error fetching node ${nodeId} from file ${fileKey}:`, error);
          return {
            content: [{ type: "text", text: `Error fetching node: ${error}` }],
          };
        }
      },
    );
  }

  async connect(transport: Transport): Promise<void> {
    console.log("Connecting to transport...");
    await this.server.connect(transport);
    console.log("Server connected and ready to process requests");
  }

  async startHttpServer(port: number): Promise<void> {
    const app = express();

    app.get("/sse", async (req: Request, res: Response) => {
      console.log("New SSE connection established");
      this.sseTransport = new SSEServerTransport(
        "/messages",
        res as unknown as ServerResponse<IncomingMessage>,
      );
      await this.server.connect(this.sseTransport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
      if (!this.sseTransport) {
        res.sendStatus(400);
        return;
      }
      await this.sseTransport.handlePostMessage(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse<IncomingMessage>,
      );
    });

    app.listen(port, () => {
      console.log(`HTTP server listening on port ${port}`);
      console.log(`SSE endpoint available at http://localhost:${port}/sse`);
      console.log(`Message endpoint available at http://localhost:${port}/messages`);
    });
  }
}
