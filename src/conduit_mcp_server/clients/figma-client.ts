/**
 * @file Client for interacting with the Figma plugin via a WebSocket connection.
 * @module clients/figma-client
 *
 * This client class provides a structured API to abstract the details of sending commands
 * to Figma and receiving responses. It is intended to be the primary interface for any
 * server-side logic that needs to interact with the Figma design environment.
 *
 * Many specific Figma interaction methods (e.g., `createRectangle`, `getPageInfo`)
 * are typically mixed into this client's prototype at runtime from command definition
 * files (often found in `src/conduit_mcp_server/commands/figma/`).
 *
 * @example
 * import { FigmaClient } from './figma-client';
 * // Assuming WebSocket connection is managed externally or by a mixed-in method:
 * const figmaClient = new FigmaClient();
 *
 * async function getDocumentName() {
 *   try {
 *     // Assumes a 'getDocumentInfo' method is mixed in or available
 *     const docInfo = await figmaClient.getDocumentInfo();
 *     return docInfo.name;
 *   } catch (error) {
 *     console.error("Failed to get document info:", error);
 *     return null;
 *   }
 * }
 */
import { logger } from "../utils/logger.js";
import { FigmaCommand } from "../types/commands.js"; // Assuming FigmaCommand is a string literal union or enum
import { sendCommandToFigma } from "../server/websocket.js";

/**
 * A client class for interacting with the Figma plugin over a WebSocket connection.
 *
 * This class primarily uses the {@link executeCommand} method to send commands.
 * Specific command methods (e.g., `createRectangle`, `getDocumentInfo`, `selectNodes`)
 * are typically added to this class's prototype at runtime through mixins.
 * These mixins often originate from command modules located in
 * `src/conduit_mcp_server/commands/figma/` which provide a more semantic API
 * (e.g., `figmaClient.createRectangle({ width: 100, height: 50 })`) that internally
 * calls `executeCommand('create_rectangle', { ... })`.
 *
 * Refer to the source of these mixins or runtime inspection for a full list of available methods.
 */
export class FigmaClient {
  // Note: Many specific Figma interaction methods are mixed into this class at runtime.
  // See module documentation for more details.

  /**
   * Sends a specified command and its parameters to the Figma plugin via the WebSocket connection.
   * This is the core method used by more specific, mixed-in command methods.
   * It relies on the {@link sendCommandToFigma} function from the WebSocket module to handle
   * the actual transmission and response handling.
   *
   * @param {FigmaCommand | string} command - The command name to execute (e.g., 'create_rectangle', 'get_selection').
   *                                       While typed as `string` here for flexibility with mixed-in methods,
   *                                       it often corresponds to a value from the {@link FigmaCommand} type/enum.
   * @param {any} [params={}] - An object containing the parameters for the command. Defaults to an empty object.
   * @returns {Promise<any>} A promise that resolves with the result returned by the Figma plugin
   *                         for the executed command.
   * @throws {Error} If the command execution fails, the WebSocket communication encounters an error,
   *                 or `sendCommandToFigma` throws an error.
   */
  async executeCommand(command: string, params: any = {}): Promise<any> {
    try {
      logger.debug(`Executing Figma command: ${command}`);
      const result = await sendCommandToFigma(command, params);
      return result;
    } catch (error) {
      logger.error(`Error executing Figma command ${command}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
