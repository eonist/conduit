/**
 * @file Message Handler for the Conduit MCP Figma plugin UI.
 * @module MessageHandler
 * This script is responsible for the bi-directional flow of messages between:
 * 1. The plugin UI (this JavaScript environment).
 * 2. The Figma plugin's main execution thread (src/conduit_mcp_plugin/src/index.js).
 * 3. The WebSocket server (src/conduit_mcp_server/server/websocket.ts).
 *
 * It manages command request-response cycles, including attempts to correlate
 * responses with original request IDs, which can sometimes be missing or ambiguous.
 */

/**
 * Global map to store command types and their associated request IDs, timestamps, and parameters.
 * This is crucial for tracking responses, especially when the original request ID might be missing
 * from a response originating from the Figma plugin's main thread or when the WebSocket server
 * initiates a command. The timestamp helps in retrieving the most recent command ID for a type,
 * and params can be useful for debugging or providing context.
 *
 * Each key is a command name (string), and the value is an array of objects,
 * where each object represents a command invocation.
 *
 * @global
 * @type {Map<string, Array<{id: string, timestamp: number, params: any}>>}
 * @property {string} id - The unique ID of the command request.
 * @property {number} timestamp - The time the command was recorded (ms since epoch).
 * @property {any} params - The parameters sent with the command.
 */
if (!window.commandIdMap) {
  window.commandIdMap = new Map();
}


/**
 * Handles messages received from the WebSocket server.
 * These messages can be:
 * 1. Responses to commands initiated by this plugin UI (e.g., a call to `sendFigmaCommand`).
 *    In this case, the message will have an `id` that matches a pending request,
 *    and the corresponding Promise is resolved or rejected.
 * 2. New commands initiated by the WebSocket server, intended for the Figma plugin.
 *    These are logged in `window.commandIdMap` and then posted to the Figma plugin's
 *    main thread for execution.
 *
 * @async
 * @param {object} payload - The raw payload object from the WebSocket `onmessage` event.
 * @param {object} payload.message - The actual message data from the server.
 * @param {string} [payload.message.id] - The ID of the message, used for correlating responses.
 * @param {string} [payload.message.command] - The command name, if the server is initiating a command.
 * @param {any} [payload.message.params] - Parameters for the command.
 * @param {any} [payload.message.result] - The result of a command, if it's a response.
 * @param {string} [payload.message.error] - An error message, if a command failed.
 * @returns {Promise<void>} Resolves once the message has been processed.
 */
async function handleSocketMessage(payload) {
  const data = payload.message;
  console.log("handleSocketMessage", data);

  // If it's a response to a previous request
  if (data.id && pluginState.connection.pendingRequests.has(data.id)) {
    const { resolve, reject } = pluginState.connection.pendingRequests.get(data.id);
    pluginState.connection.pendingRequests.delete(data.id);

    if (data.error) {
      reject(new Error(data.error));
    } else {
      resolve(data.result);
    }
    return;
  }

  // If it's a new command
  if (data.command) {
    try {
      // Store the command type and ID for later lookup
      // Storing the full command along with the ID ensures we can match responses properly
      if (!window.commandIdMap.has(data.command)) {
        window.commandIdMap.set(data.command, []);
      }
      var entry = {
        id: data.id,
        timestamp: Date.now(),
        params: data.params
      };
      window.commandIdMap.get(data.command).push(entry);
      
      // Limit the stored commands to the most recent 10 for each command type
      if (window.commandIdMap.get(data.command).length > 10) {
        window.commandIdMap.get(data.command).shift();
      }
      
      console.log(`Stored command ID mapping for ${data.command}: ${data.id}`);

      // Send the command to the plugin code
      parent.postMessage(
        {
          pluginMessage: {
            type: "execute-command",
            id: data.id,
            command: data.command,
            params: data.params,
          },
        },
        "*"
      );
    } catch (error) {
      // Send error back to WebSocket
      sendErrorResponse(
        data.id,
        error.message || "Error executing command"
      );
    }
  }
}


/**
 * Finds the most recent command ID recorded for a given command type.
 * This is used to correlate responses from the Figma plugin's main thread when the original
 * request ID might be missing. It sorts the recorded command entries by timestamp
 * in descending order and returns the ID of the most recent one.
 *
 * @param {string} commandType - The command type (e.g., 'get_selection', 'create_rectangle') to search for.
 * @returns {string|null} The most recent command ID if found, otherwise null.
 */
function findCommandId(commandType) {
  if (!window.commandIdMap || !window.commandIdMap.has(commandType)) {
    console.warn(`No stored command IDs found for command type: ${commandType}`);
    return null;
  }
  
  const commandEntries = window.commandIdMap.get(commandType);
  if (commandEntries.length === 0) {
    console.warn(`Command entries array is empty for command type: ${commandType}`);
    return null;
  }
  
  // Sort by timestamp in descending order (most recent first)
  commandEntries.sort((a, b) => b.timestamp - a.timestamp);
  
  // Return the most recent command ID
  return commandEntries[0].id;
}


/**
 * Initializes the global `window.onmessage` event listener. This listener handles messages
 * sent from the Figma plugin's main execution thread (e.g., `figma.ui.postMessage(...)` in `index.js`).
 * It routes these messages based on their `type` to various UI update functions or
 * forwards command results/errors back to the WebSocket server.
 *
 * @returns {void}
 */
function initMessageListener() {
  /**
   * Global event handler for messages received from the Figma plugin's main thread.
   *
   * Structure of `event.data.pluginMessage`:
   * - `type: "connection-status"`: Updates UI with connection status.
   *   - `connected: boolean`
   *   - `message?: string`
   * - `type: "auto-connect"`: Triggers a click on the connect button.
   * - `type: "auto-disconnect"`: Triggers a click on the disconnect button.
   * - `type: "command-result"`: Forwards successful command results to WebSocket.
   *   - `id?: string` (original request ID, sometimes needs recovery)
   *   - `result: any`
   *   - `command?: string` (sometimes included in result, aids ID recovery)
   * - `type: "command-error"`: Forwards command errors to WebSocket.
   *   - `id?: string` (original request ID, sometimes needs recovery)
   *   - `error: string`
   * - `type: "command_progress"`: Updates UI and forwards progress to WebSocket.
   *   - `id: string` (original request ID)
   *   - `progress?: number` (e.g., 0-100)
   *   - `status?: string` (e.g., 'processing', 'completed')
   *   - `data?: any` (additional progress data)
   *
   * The handler includes logic to recover missing `id` for `command-result` and
   * `command-error` by using `findCommandId` or searching `window.commandIdMap`.
   *
   * @param {MessageEvent} event - The DOM `MessageEvent` object.
   * @param {object} event.data - The data sent from the plugin's main thread.
   * @param {object} event.data.pluginMessage - The actual message payload.
   * @returns {void}
   */
  window.onmessage = (event) => {
    const message = event.data.pluginMessage;
    if (!message) return;

    console.log("Received message from plugin:", message);

    switch (message.type) {
      case "connection-status":
        updateConnectionStatus(message.connected, message.message);
        break;
      case "auto-connect":
        connectButton.click();
        break;
      case "auto-disconnect":
        disconnectButton.click();
        break;
      case "command-result": {
        let responseId = message.id;
        
        // If ID is missing or doesn't look like a proper ID, try to recover it
        if (!responseId || responseId === "undefined") {
          // Try to extract command type from the result data
          let commandType = null;
          
          // Look for properties that might indicate the command type
          if (message.result && typeof message.result === 'object') {
            if (message.result.command) {
              commandType = message.result.command;
            } else if (message.result.type === 'PAGE') {
              commandType = 'get_document_info';
            } else if (message.result.id && message.result.width && message.result.height) {
              // This might be a rectangle or other shape
              const recentCommands = Array.from(window.commandIdMap.keys())
                .filter(cmd => cmd.includes('create_') || cmd.includes('set_'));
              
              if (recentCommands.length > 0) {
                // Use the most recent creation command
                commandType = recentCommands[0];
              }
            }
          }
          
          if (commandType) {
            const originalId = findCommandId(commandType);
            if (originalId) {
              console.log(`Recovered ID ${originalId} for command ${commandType}`);
              responseId = originalId;
            }
          }
        }
        
        console.log(`Sending response with ID: ${responseId}`);
        // Forward the result from plugin code back to WebSocket
        sendSuccessResponse(responseId, message.result);
        break;
      }
      case "command-error": {
        let responseId = message.id;
        
        // Same recovery logic as above
        if (!responseId || responseId === "undefined") {
          // For errors, we'll try the most recent command of any type
          var allCommands = [];
          var entries = Array.from(window.commandIdMap.entries());
          for (var i = 0; i < entries.length; i++) {
            var cmdEntries = entries[i][1];
            for (var j = 0; j < cmdEntries.length; j++) {
              allCommands.push(cmdEntries[j]);
            }
          }
          allCommands.sort(function(a, b) { return b.timestamp - a.timestamp; });
          var mostRecentCommand = allCommands.length > 0 ? allCommands[0] : null;
            
          if (mostRecentCommand) {
            console.log(`Recovered ID ${mostRecentCommand.id} for error response`);
            responseId = mostRecentCommand.id;
          }
        }
        
        // Forward the error from plugin code back to WebSocket
        sendErrorResponse(responseId, message.error);
        break;
      }
      case "command_progress":
        // Update UI with progress information
        updateProgressUI(message);
        // Forward progress update to server
        sendProgressUpdateToServer(message);
        break;
      // Theme case removed - now handled by Figma's built-in themeColors
    }
  };
}
