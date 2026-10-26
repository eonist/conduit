/**
 * Main entry point for the Conduit MCP Figma plugin (main.ts or equivalent in Figma's plugin context).
 * This module is responsible for:
 * 1. Displaying the plugin's UI (defined in `ui-template.html` and styled with CSS).
 * 2. Initializing command handlers available to the UI (via `initializeCommands`).
 * 3. Handling messages received from the UI (through `figma.ui.onmessage`).
 * 4. Mediating communication between the Figma plugin environment and the Model Context Protocol (MCP) server.
 *
 * Messages sent from the UI to this plugin backend:
 * - `update-settings`: Updates and persists plugin settings (e.g., port, auto-connect preferences).
 *   - `params`: The settings object to update.
 * - `notify`: Displays a Figma notification message.
 *   - `message`: The string to display in the notification.
 * - `close-plugin`: Closes the plugin panel.
 * - `execute-command`: Requests execution of a registered command on the MCP server.
 *   - `id`: A unique identifier for the command request, used to correlate with the result.
 *   - `command`: The name of the command to execute.
 *   - `params`: Parameters for the command.
 *
 * Messages sent from this plugin backend to the UI:
 * - `command-result`: Contains the successful result of an `execute-command` request.
 * - `command-error`: Contains error details if an `execute-command` request fails.
 * - `auto-connect`: Sent when the plugin is run, instructing the UI to attempt connection.
 * - `settings-updated`: Confirms settings have been updated (potentially with the full settings object).
 * - `progress-update`: (If used) Sends progress information for long-running operations.
 *
 * @module PluginIndex
 * @example
 * import './index.js';
 * // The plugin UI is shown automatically and commands are ready to execute
 */

import { initializeCommands, handleCommand } from './modules/commands.js';
import {
  sendProgressUpdate,
  initializePlugin,
  updateSettings
} from './modules/utils/plugin.js';

// Show the plugin UI with fixed dimensions and enable theme colors
figma.showUI(__html__, { 
  width: 350, 
  height: 450,
  themeColors: true  // Enable Figma's theme variables
});

// Register all available command handlers
initializeCommands();

/**
 * Handles incoming messages from the plugin's UI (HTML/JavaScript frontend).
 * This function acts as a router, delegating actions based on the `msg.type`.
 *
 * Supported message types from the UI:
 * - `update-settings`: Persists plugin settings. Expects `msg.params` with settings data.
 * - `notify`: Shows a Figma notification. Expects `msg.message` with the notification text.
 * - `close-plugin`: Closes the plugin window.
 * - `execute-command`: Executes a command via `handleCommand`. Expects `msg.id` (for tracking),
 *   `msg.command` (command name), and `msg.params` (command arguments).
 *   It sends back `command-result` or `command-error` to the UI.
 *
 * @param {object} msg - The message object received from the UI.
 * @param {string} msg.type - The type of the message, determining the action to take.
 * @param {string} [msg.id] - Optional unique ID for messages that expect a response (e.g., `execute-command`).
 * @param {string} [msg.command] - Optional command name, typically for `execute-command`.
 * @param {any} [msg.params] - Optional parameters associated with the message, e.g., settings object or command parameters.
 * @param {string} [msg.message] - Optional message string, typically for `notify`.
 * @returns {void}
 * @example
 * // In UI JavaScript:
 * // parent.postMessage({ pluginMessage: { type: 'notify', message: 'Hello from UI!' } }, '*');
 * // parent.postMessage({ pluginMessage: { type: 'execute-command', id: 'cmd1', command: 'get_selection', params: {} } }, '*');
 */
figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case 'update-settings':
      updateSettings(msg);
      break;
    case 'notify':
      figma.notify(msg.message);
      break;
    case 'close-plugin':
      figma.closePlugin();
      break;
    // Theme detection is now handled directly by Figma's themeColors
    case 'execute-command':
      try {
        console.log(`Executing command with ID: ${msg.id}`, msg.command, msg.params);
        
        // Store command ID in the params to preserve it
        if (!msg.params) msg.params = {};
        
        // Clone params using Object.assign instead of spread operator
        const paramsWithId = Object.assign({}, msg.params || {}, {
          _originalCommandId: msg.id, // Store original ID
          commandType: msg.command    // Store command type for recovery
        });
        
        const result = await handleCommand(msg.command, paramsWithId);
        
        // Add command type to result for better ID recovery
        let enhancedResult = result;
        if (typeof result === 'object' && result !== null) {
          enhancedResult = Object.assign({}, result, {
            command: msg.command
          });
        }
        
        console.log(`Command execution complete. Sending result with ID: ${msg.id}`);
        
        figma.ui.postMessage({
          type: 'command-result',
          id: msg.id,
          command: msg.command, // Include command type in the response
          result: enhancedResult
        });
      } catch (error) {
        console.error(`Error executing command ${msg.command} with ID ${msg.id}:`, error);
        
        figma.ui.postMessage({
          type: 'command-error',
          id: msg.id,
          command: msg.command,
          error: error.message || 'Error executing command'
        });
      }
      break;
    default:
      console.warn('Unhandled UI message type:', msg.type);
  }
};

/**
 * Event listener triggered when the plugin is launched or re-launched from the Figma menu
 * or via a quick launch command.
 * Its primary role here is to send an 'auto-connect' message to the UI,
 * prompting the UI to attempt a WebSocket connection to the MCP server if auto-connect is enabled,
 * or to display the connection panel.
 *
 * @param {object} runEvent - The event object provided by Figma when the plugin is run.
 * @param {string} runEvent.command - If the plugin was run via a command defined in the manifest,
 *                                    this is the command string. Otherwise, it's an empty string.
 * @returns {void}
 * @example
 * // In manifest.json, if you have a specific run command:
 * // { "main": "dist/index.js", "ui": "dist/ui.html", "id": "123", "name": "MyPlugin",
 * //   "menu": [{ "name": "Open MyPlugin", "command": "open" }] }
 * // When "Open MyPlugin" is clicked, figma.on('run', ({ command }) => { ... }) is called with command === "open".
 */
figma.on('run', ({ command }) => {
  // The 'command' parameter here refers to commands defined in manifest.json for 'menu' or 'quicklaunch'.
  // For a general plugin run (e.g., clicking its icon in the sidebar), 'command' might be empty.
  // Regardless, we always want to signal the UI to check its connection status or attempt auto-connect.
  figma.ui.postMessage({ type: 'auto-connect' });
});

// Perform initial plugin setup and notify the UI of current settings
initializePlugin();

// Theme detection is now handled by Figma's built-in themeColors feature
// No need to manually detect and send theme information
