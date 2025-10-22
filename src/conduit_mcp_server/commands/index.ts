import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FigmaClient } from "../clients/figma-client/index.js";
import { registerChannelCommand } from "./channel.js";
import { CommandResult, MCP_COMMANDS } from "../types/commands.js";
import { logger } from "../utils/logger.js";
// register
import { registerComponentCommands } from "./figma/component/index.js";
import { registerDocumnentCommands } from "./figma/document/index.js";
import { registerExportCommands } from "./figma/export/index.js";
import { registerImageCommands } from "./figma/image/index.js";
import { registerLayoutCommands } from "./figma/layout/index.js";
import { registerMiscCommands } from "./figma/misc/index.js";
import { registerNodeCommands } from "./figma/node/index.js";
import { registerPageCmds } from "./figma/page/index.js";
import { registerShapeCommands } from "./figma/shape/index.js";
import { registerStyleCommands } from "./figma/style/index.js";
import { registerSVGCommands } from "./figma/svg/index.js";
import { registerTextCommands } from "./figma/text/index.js";
import { registerVectorCommands } from "./figma/vector/index.js";
// Advanced code export tool registration
import { registerAdvancedCodeExportTool } from "../server/tools/advanced_code_export/index.js";
/** 
 * Registers all tool commands with the given MCP server.
 *
 * Sets up:
 * - Read operations: get_document_info, get_selection, get_node_info, etc.
 * - Create operations: create_rectangle, create_text, etc.
 * - Modify operations: move_node, resize_node, set_style, etc.
 * - Rename operations: rename_layer, rename_layers, ai_rename_layers, etc.
 * - Channel operations: join_channel
 * - Advanced export tool: advanced_code_export
 *
 * @param {McpServer} server - The MCP server instance
 */
export function registerAllCommands(server: McpServer): void {
  try {
    logger.info("Registering all commands...");
    // Instantiate Figma client to pass into each command group
    // Note: Using explicit FigmaClient type instead of 'any' to prevent type issues
    const figmaClient: FigmaClient = new FigmaClient();
    // Register command categories
    registerChannelCommand(server, figmaClient);// Register channel commands (communication channel management)
    registerComponentCommands(server, figmaClient);
    registerDocumnentCommands(server, figmaClient);
    registerExportCommands(server, figmaClient);
    registerImageCommands(server, figmaClient);
    registerLayoutCommands(server, figmaClient);
    registerMiscCommands(server, figmaClient);
    registerNodeCommands(server, figmaClient);
    registerPageCmds(server, figmaClient);
    registerShapeCommands(server, figmaClient);
    registerStyleCommands(server, figmaClient);
    registerSVGCommands(server, figmaClient);
    registerTextCommands(server, figmaClient);
    registerVectorCommands(server, figmaClient);
    // Register advanced code export tool so it appears in tools/list and can be called
    registerAdvancedCodeExportTool(server);
    logger.info(MCP_COMMANDS.SET_CORNER_RADIUS);
    logger.info("All commands registered successfully");
  } catch (error) {
    logger.error(`Error registering commands: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
