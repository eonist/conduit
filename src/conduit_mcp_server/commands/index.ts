/**
 * @file Command Registration Index for Conduit MCP Server.
 * @module CommandRegistry
 *
 * This module serves as the central point for registering all Figma-related commands
 * that the Conduit MCP server will expose and handle. It achieves this by:
 * 1. Importing various specialized command registration functions from subdirectories
 *    (e.g., `./figma/document/`, `./figma/shape/`, `./figma/text/`, etc.).
 * 2. Importing the main `McpServer` class from the Model Context Protocol SDK and the
 *    `FigmaClient` for interacting with the Figma plugin.
 * 3. Providing the main {@link registerAllCommands} function, which orchestrates the
 *    registration of all command categories.
 *
 * The `registerAllCommands` function instantiates a `FigmaClient` and passes it along
 * with the `McpServer` instance to each specific `register...Commands` function.
 * This allows each command group to define its commands and how they interact with
 * Figma via the `FigmaClient`.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FigmaClient } from "../clients/figma-client/index.js"; // Corrected path if figma-client has an index.ts
import { registerChannelCommand } from "./channel.js";
import { CommandResult, MCP_COMMANDS } from "../types/commands.js"; // MCP_COMMANDS might be used for logging or checks
import { logger } from "../utils/logger.js";

// Import all specific command registration functions
import { registerComponentCommands } from "./figma/component/index.js";
import { registerDocumnentCommands } from "./figma/document/index.js"; // Typo: Documnent -> Document
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

/**
 * Registers all available Figma-related commands with the provided MCP server instance.
 *
 * This function orchestrates the command registration process by:
 * 1. Creating a new instance of `FigmaClient`.
 * 2. Calling a series of specialized `register...Commands` functions, each responsible for
 *    a specific category of Figma commands (e.g., document manipulation, shape creation,
 *    text editing, layout adjustments, etc.).
 * 3. Each specialized registration function is passed both the `McpServer` instance (to register
 *    commands with) and the `FigmaClient` instance (to enable command execution against Figma).
 *
 * This setup allows for a modular approach to defining and registering commands.
 *
 * @param {McpServer} server - The MCP server instance (from `@modelcontextprotocol/sdk`)
 *                             to which all commands will be registered.
 * @returns {void}
 * @throws {Error} If any error occurs during the instantiation of `FigmaClient` or
 *                 within any of the individual `register...Commands` functions.
 *                 The error is logged, and then re-thrown to be handled by the caller.
 */
export function registerAllCommands(server: McpServer): void {
  try {
    logger.info("Registering all commands...");
    // Instantiate Figma client to pass into each command group
    const figmaClient: FigmaClient = new FigmaClient();

    // Register command categories, passing both server and figmaClient
    registerChannelCommand(server, figmaClient); // Handles MCP channel operations
    registerComponentCommands(server, figmaClient);
    registerDocumnentCommands(server, figmaClient); // Typo: Documnent -> Document
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

    // Example log to confirm a command constant is accessible (optional)
    if (MCP_COMMANDS && MCP_COMMANDS.SET_CORNER_RADIUS) {
      logger.debug(`Command constant check: SET_CORNER_RADIUS = ${MCP_COMMANDS.SET_CORNER_RADIUS}`);
    } else {
      logger.debug("MCP_COMMANDS.SET_CORNER_RADIUS not found, commands might not be fully typed or imported.");
    }

    logger.info("All command categories processed for registration.");
  } catch (error) {
    logger.error(`Error during command registration process: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
 