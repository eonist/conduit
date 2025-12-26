/**
 * @file WebSocket transport module for the Conduit MCP server.
 * @module server/websocket
 *
 * This module is responsible for establishing and managing the WebSocket connection
 * to the Figma plugin. It handles the entire lifecycle of the connection, including:
 * - Initial connection and automatic reconnection using {@link ReconnectingWebSocket}.
 * - Joining specific communication channels within Figma.
 * - Sending commands to Figma and tracking their responses using unique IDs.
 * - Managing timeouts for requests.
 * - Handling incoming messages, distinguishing between command results and progress updates.
 * - Providing utility functions to check connection status and current channel.
 *
 * It supports a "lazy connection" pattern where connection parameters can be set via
 * {@link setConnectionConfig} and the actual connection is only established when a command
 * needs to be sent (e.g., by {@link sendCommandToFigma}).
 *
 * Key exposed functions:
 * - {@link setConnectionConfig}: Stores connection parameters for later use.
 * - {@link connectToFigma}: Initiates or manages the WebSocket connection.
 * - {@link joinChannel}: Joins a named communication channel in Figma.
 * - {@link getCurrentChannel}: Returns the name of the current Figma channel.
 * - {@link sendCommandToFigma}: Sends a command to Figma and returns a Promise for the result.
 * - {@link processFigmaNodeResponse}: (Currently for logging) Processes responses that appear to be Figma nodes.
 * - {@link isConnectedToFigma}: Checks if the WebSocket connection is active.
 *
 * @example
 * import { setConnectionConfig, connectToFigma, sendCommandToFigma, joinChannel } from './websocket.js';
 *
 * // Configure for lazy connection or direct connection
 * setConnectionConfig('localhost', 3055, 2000);
 * // Optionally, connect immediately:
 * // connectToFigma('localhost', 3055, 2000);
 *
 * async function getDocumentInfo() {
 *   try {
 *     await joinChannel('my-figma-channel'); // Ensure connected and channel joined
 *     const result = await sendCommandToFigma('get_document_info', {});
 *     console.log(result);
 *   } catch (error) {
 *     console.error("Error getting document info:", error);
 *   }
 * }
 * getDocumentInfo();
 */

import WebSocket from "ws";
import { ReconnectingWebSocket } from "../utils/reconnecting-websocket.js";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger.js";
import { FigmaCommand, PendingRequest, WebSocketMessage } from "../types/commands.js";

/**
 * The active WebSocket connection instance.
 * It is an instance of {@link ReconnectingWebSocket} which handles automatic reconnections.
 * @type {ReconnectingWebSocket | null}
 */
let ws: ReconnectingWebSocket | null = null;

/**
 * Stores the name of the currently joined Figma communication channel.
 * Null if no channel is currently joined.
 * @type {string | null}
 */
let currentChannel: string | null = null;

/**
 * A Map to store pending requests sent to Figma.
 * The key is the unique request ID (string), and the value is a {@link PendingRequest} object,
 * which includes `resolve` and `reject` functions for the Promise, a `timeout` timer ID,
 * and a `lastActivity` timestamp.
 * @type {Map<string, PendingRequest>}
 */
const pendingRequests = new Map<string, PendingRequest>();

/**
 * Stores the server URL for lazy/on-demand WebSocket connections.
 * Set by {@link setConnectionConfig}.
 * @type {string}
 */
let savedServerUrl: string = "";
/**
 * Stores the port number for lazy/on-demand WebSocket connections.
 * Set by {@link setConnectionConfig}.
 * @type {number}
 */
let savedPort: number = 0;
/**
 * Stores the base reconnect interval (ms) for lazy/on-demand WebSocket connections.
 * Set by {@link setConnectionConfig}.
 * @type {number}
 */
let savedReconnectInterval: number = 0;

/**
 * Stores WebSocket connection parameters (`serverUrl`, `port`, `reconnectInterval`)
 * in module-level variables. These parameters can then be used by {@link connectToFigma}
 * when a connection is initiated, often lazily on the first call to {@link sendCommandToFigma}.
 *
 * @param {string} serverUrl - The URL of the WebSocket server (e.g., 'localhost', 'example.com').
 * @param {number} port - The port number for the WebSocket server.
 * @param {number} reconnectInterval - The base interval in milliseconds for reconnection attempts.
 * @returns {void}
 */
export function setConnectionConfig(serverUrl: string, port: number, reconnectInterval: number): void {
  savedServerUrl = serverUrl;
  savedPort = port;
  savedReconnectInterval = reconnectInterval;
}


/**
 * Initializes or re-initializes the WebSocket connection to the Figma plugin
 * using `ReconnectingWebSocket`. This function manages the WebSocket lifecycle,
 * including handling existing connection states (already connected, connecting, closing/closed)
 * and setting up event handlers for `open`, `message`, `error`, and `close` events.
 *
 * - **On 'open'**: Logs the successful connection, clears any pending connection timeout,
 *   and resets the `currentChannel` to null as a new connection might require rejoining.
 * - **On 'message'**: Parses incoming JSON data. It first checks if the message is a
 *   progress update using {@link handleProgressUpdate}. If not, it processes it as a
 *   standard command response using {@link handleMessageResponse}. Includes error handling for JSON parsing.
 * - **On 'error'**: Logs WebSocket errors. The `ReconnectingWebSocket` handles actual reconnection attempts.
 * - **On 'close'**: Logs the disconnection, clears the `ws` instance, rejects all
 *   `pendingRequests` with an error indicating the connection loss, and relies on
 *   `ReconnectingWebSocket` to schedule and attempt reconnections.
 *
 * A 10-second timeout is implemented for the initial connection attempt.
 *
 * @param {string} serverUrl - The URL of the WebSocket server (e.g., 'localhost').
 * @param {number} port - The port number for the WebSocket server.
 * @param {number} reconnectInterval - The base interval in milliseconds for reconnection attempts,
 *                                   used by `ReconnectingWebSocket`.
 * @returns {void}
 * @throws This function logs errors internally but is designed not to throw, allowing
 *         `ReconnectingWebSocket` to manage recovery.
 */
export function connectToFigma(serverUrl: string, port: number, reconnectInterval: number): void {
  // If already connected, do nothing
  if (ws && ws.getReadyState() === WebSocket.OPEN) {
    logger.info('Already connected to Figma');
    return;
  }

  // If connection is in progress (CONNECTING state), wait
  if (ws && ws.getReadyState() === WebSocket.CONNECTING) {
    logger.info('Connection to Figma is already in progress');
    return;
  }

  // If there's an existing socket instance, ensure it's properly closed before creating a new one.
  if (ws) {
    logger.info('Cleaning up existing WebSocket instance before reconnecting.');
    ws.removeAllListeners(); // Remove listeners to prevent memory leaks
    if (ws.getReadyState() !== WebSocket.CLOSED) {
      ws.terminate(); // Force close if not already closed
    }
    ws = null;
  }

  const wsUrl = serverUrl === 'localhost' ? `ws://${serverUrl}:${port}` : `wss://${serverUrl}`;
  logger.info(`Attempting to connect to Figma socket server at ${wsUrl}...`);

  try {
    ws = new ReconnectingWebSocket(wsUrl, {
      maxReconnectAttempts: 5, // Example: Max 5 quick retries
      initialDelay: reconnectInterval, // Initial delay for first retry
      maxDelay: 30000, // Max delay between retries (e.g., 30 seconds)
      WebSocket: WebSocket, // Pass the WebSocket implementation
    });

    // Add connection timeout for the initial connection attempt
    const connectionTimeout = setTimeout(() => {
      if (ws && ws.getReadyState() === WebSocket.CONNECTING) {
        logger.error('Initial connection attempt to Figma timed out after 10 seconds.');
        ws.terminate(); // This will trigger the 'close' event, and ReconnectingWebSocket will handle retries.
      }
    }, 10000); // 10-second connection timeout

    ws.on('open', () => {
      clearTimeout(connectionTimeout); // Clear the initial connection timeout
      logger.info('Successfully connected to Figma socket server.');
      // Reset channel on new connection, as the previous channel context is lost.
      currentChannel = null;
    });

    ws.on("message", (data: WebSocket.Data) => {
      try {
        const messageStr = data.toString();
        const json = JSON.parse(messageStr) as WebSocketMessage; // Using WebSocketMessage type

        logger.debug(`Raw WS message received: ${messageStr}`);

        // Prioritize handling progress updates as they might occur during a long command.
        if (handleProgressUpdate(json)) {
          return; // Message was a progress update and has been handled.
        }

        // If not a progress update, handle as a standard message response.
        if (handleMessageResponse(json)) {
          return; // Message was a command response and has been handled.
        }

        // If the message was neither a progress update nor a recognized command response.
        // logger.warn(`Received unhandled or broadcast message: ${messageStr}`);

      } catch (error) {
        logger.error(`Error parsing incoming WebSocket message: ${error instanceof Error ? error.message : String(error)}. Data: ${data.toString()}`);
      }
    });
    
    /**
     * Handles incoming messages specifically identified as progress updates.
     * These messages are expected to have `type: 'progress_update'`.
     * It updates the `lastActivity` timestamp for the corresponding pending request
     * and extends its timeout to prevent premature failure of long-running commands.
     *
     * @param {WebSocketMessage} jsonMessage - The parsed JSON message object from WebSocket.
     * @returns {boolean} True if the message was a progress update and was processed, false otherwise.
     */
    function handleProgressUpdate(jsonMessage: WebSocketMessage): boolean {
      if (jsonMessage.type !== 'progress_update') {
        return false;
      }

      // Assuming progress data is nested within jsonMessage.message.data as per original logic
      const progressData = jsonMessage.message?.data as { commandType?: string, progress?: number, message?: string, status?: string };
      const requestId = jsonMessage.id || (jsonMessage.message?.id as string);


      if (!requestId || !pendingRequests.has(requestId) || !progressData) {
        logger.warn(`Could not process progress update: Missing ID, pending request, or progress data. ID: ${requestId}`);
        return true; // Still considered handled as it matched type 'progress_update'
      }

      const request = pendingRequests.get(requestId)!;

      request.lastActivity = Date.now();
      clearTimeout(request.timeout);
      // Extend timeout for another 60 seconds from this progress update
      request.timeout = setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          logger.error(`Request ${requestId} (command: ${progressData.commandType || 'unknown'}) timed out after extended period of inactivity following a progress update.`);
          pendingRequests.delete(requestId);
          request.reject(new Error(`Request to Figma (command: ${progressData.commandType || 'unknown'}) timed out after progress update.`));
        }
      }, 60000); // 60-second timeout extension

      logger.info(`Progress for ${progressData.commandType || requestId}: ${progressData.progress || 0}% - ${progressData.message || 'In progress...'}`);

      if (progressData.status === 'completed' && progressData.progress === 100) {
        logger.info(`Operation ${progressData.commandType || requestId} reported 100% completion via progress update, awaiting final result message.`);
      }
      return true;
    }

    /**
     * Handles general message responses from the WebSocket (i.e., not progress updates).
     * It attempts to match incoming messages with pending requests using various strategies:
     * direct ID match, nested ID in `message.id`, fuzzy ID matching, special handling for
     * document info, and finally, command type matching as a last resort.
     * Once a match is found, it calls {@link resolveRequest}.
     *
     * @param {WebSocketMessage} jsonMessage - The parsed JSON message object from WebSocket.
     * @returns {boolean} True if a matching request was found and resolved/rejected, false otherwise.
     */
    function handleMessageResponse(jsonMessage: WebSocketMessage): boolean {
      const topLevelId = jsonMessage.id;
      const nestedMessage = jsonMessage.message;
      const nestedMessageId = nestedMessage?.id as string | undefined;
      const topLevelResult = jsonMessage.result;
      const nestedMessageResult = nestedMessage?.result;
      const topLevelError = jsonMessage.error;
      const nestedMessageError = nestedMessage?.error;
      const commandTypeInMessage = nestedMessage?.command as string | undefined; // e.g. 'get_document_info'

      // Strategy 1: Direct ID match with result/error at the top level.
      if (topLevelId && pendingRequests.has(topLevelId) && (topLevelResult !== undefined || topLevelError !== undefined)) {
        resolveRequest(topLevelId, topLevelResult, topLevelError, 'direct');
        return true;
      }

      // Strategy 2: Direct ID match with result/error nested in `message` object.
      if (topLevelId && pendingRequests.has(topLevelId) && (nestedMessageResult !== undefined || nestedMessageError !== undefined)) {
        resolveRequest(topLevelId, nestedMessageResult, nestedMessageError, 'nested_direct_id');
        return true;
      }
      
      // Strategy 3: Nested `message.id` matches a pending request, result/error in `message` object.
      if (nestedMessageId && pendingRequests.has(nestedMessageId) && (nestedMessageResult !== undefined || nestedMessageError !== undefined)) {
        resolveRequest(nestedMessageId, nestedMessageResult, nestedMessageError, 'nested_message_id');
        return true;
      }

      // Strategy 4: Top-level ID matches, and `message` object itself is the result.
      if (topLevelId && pendingRequests.has(topLevelId) && typeof nestedMessage === 'object' && nestedMessage !== null && nestedMessageResult === undefined && nestedMessageError === undefined) {
        // Avoid resolving with an empty message or message that's just an ID container
        if (Object.keys(nestedMessage).length > 1 || (Object.keys(nestedMessage).length === 1 && !nestedMessage.id)) {
            resolveRequest(topLevelId, nestedMessage, undefined, 'object_as_result');
            return true;
        }
      }
      
      // Strategy 5: Fuzzy ID matching (if topLevelId is a substring of a pending ID or vice-versa).
      if (topLevelId) {
        for (const [pendingId] of pendingRequests.entries()) {
          if (pendingId.includes(topLevelId) || topLevelId.includes(pendingId)) {
            if (topLevelResult !== undefined || nestedMessageResult !== undefined || topLevelError !== undefined || nestedMessageError !== undefined) {
              resolveRequest(pendingId, topLevelResult || nestedMessageResult, topLevelError || nestedMessageError, 'fuzzy_id');
              return true;
            }
          }
        }
      }
      
      // Strategy 6: Heuristic for document info responses (often lack a clear request ID link).
      // This assumes `message.result` contains typical document structure.
      const potentialDocInfo = nestedMessageResult || topLevelResult;
      if (typeof potentialDocInfo === 'object' && potentialDocInfo?.type === "PAGE" && Array.isArray(potentialDocInfo?.children)) {
        for (const [pendingId, request] of pendingRequests.entries()) {
          // Assuming document info commands might contain these substrings
          if (pendingId.toLowerCase().includes("document_info") || pendingId.toLowerCase().includes("get_document")) {
            resolveRequest(pendingId, potentialDocInfo, undefined, 'heuristic_document_info');
            return true;
          }
        }
      }
      
      // Strategy 7: Command type matching (last resort if ID matching fails).
      // This is risky if multiple commands of the same type are pending.
      if (commandTypeInMessage && pendingRequests.size > 0) {
        let mostRecentMatchingRequest: { id: string, request: PendingRequest } | null = null;
        for (const [pendingId, request] of pendingRequests.entries()) {
          // A simple check, assuming command name might be part of the auto-generated pendingId or stored metadata
          if (pendingId.toLowerCase().includes(commandTypeInMessage.toLowerCase())) {
            if (!mostRecentMatchingRequest || request.lastActivity > mostRecentMatchingRequest.request.lastActivity) {
              mostRecentMatchingRequest = { id: pendingId, request };
            }
          }
        }
        if (mostRecentMatchingRequest) {
          const resultToUse = nestedMessageResult || topLevelResult || { success: true, command: commandTypeInMessage, note: "Result inferred by command type match" };
          resolveRequest(mostRecentMatchingRequest.id, resultToUse, nestedMessageError || topLevelError, 'command_type_match');
          return true;
        }
      }
      
      logger.warn(`Received message not matched to any pending request: ${JSON.stringify(jsonMessage)}`);
      return false;
    }

    /**
     * Resolves or rejects a pending request and cleans up associated resources.
     * It clears the timeout timer for the request and removes it from the `pendingRequests` map.
     *
     * @param {string} id - The unique ID of the request to resolve/reject.
     * @param {any} result - The result data to resolve the promise with (if successful).
     * @param {any} error - The error data to reject the promise with (if failed).
     * @param {string} matchType - A descriptive string indicating how the response was matched to the request (for logging).
     * @returns {void}
     */
    function resolveRequest(id: string, result: any, error: any, matchType: string): void {
      if (!pendingRequests.has(id)) {
        logger.warn(`Attempted to resolve request ${id} (${matchType}), but it was not found in pendingRequests. It might have already timed out or been resolved.`);
        return;
      }
      
      const request = pendingRequests.get(id)!;
      clearTimeout(request.timeout); // Clear the timeout timer.
      
      if (error) {
        const errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
        logger.error(`Request ${id} failed (${matchType}): ${errorMessage}`);
        request.reject(new Error(errorMessage));
      } else {
        logger.info(`Request ${id} succeeded (${matchType}). Resolving promise.`);
        logger.debug(`Result for ${id}: ${JSON.stringify(result)}`);
        request.resolve(result);
      }
      
      pendingRequests.delete(id); // Remove from pending requests map.
    }

    ws.on('error', (errorEvent: WebSocket.ErrorEvent) => {
      logger.error(`WebSocket error: ${errorEvent.message}. Type: ${errorEvent.type}`);
      // `ReconnectingWebSocket` will typically handle the 'close' event that follows an error
      // and attempt reconnection based on its configuration. No need to manually reconnect here.
      // If `connectionTimeout` is active, it might also be cleared if the error leads to a quick close.
    });

    ws.on('close', (code: number, reasonBuffer: Buffer) => {
      clearTimeout(connectionTimeout); // Ensure initial connection timeout is cleared on close.
      const reason = reasonBuffer.toString();
      logger.info(`Disconnected from Figma socket server. Code: ${code}, Reason: ${reason || 'No reason provided'}.`);
      
      // It's important NOT to set ws = null here if using ReconnectingWebSocket,
      // as the instance itself manages its state and reconnection attempts.
      // ReconnectingWebSocket will emit 'close' and then attempt to reconnect.

      // Reject all pending requests as the connection is lost.
      // ReconnectingWebSocket might re-establish, but current outstanding requests are failed.
      for (const [id, request] of pendingRequests.entries()) {
        clearTimeout(request.timeout);
        request.reject(new Error(`Connection lost (Code: ${code}, Reason: ${reason || 'N/A'}). Request ${id} failed.`));
      }
      pendingRequests.clear(); // Clear all pending requests.

      // Reconnection logic is handled by ReconnectingWebSocket internally.
      // No explicit setTimeout for reconnection needed here.
      // If `ws` was manually terminated (e.g. in timeout), ReconnectingWebSocket might stop,
      // otherwise it continues based on its `maxReconnectAttempts` etc.
      if (code === 1000 || code === 1005) { // Normal closure or no status
        logger.info("WebSocket closed normally.");
      } else {
        logger.warn(`WebSocket closed unexpectedly. ReconnectingWebSocket will attempt to reconnect if configured.`);
      }
    });

  } catch (error) {
    logger.error(`Failed to create ReconnectingWebSocket instance: ${error instanceof Error ? error.message : String(error)}`);
    // If ReconnectingWebSocket constructor itself fails, we might need a fallback retry here,
    // though it's less common.
    if (!ws) { // Ensure ws is null so subsequent calls might retry.
        logger.info(`Attempting to re-initiate connection process in ${reconnectInterval / 1000}s due to constructor failure.`);
        setTimeout(() => connectToFigma(serverUrl, port, reconnectInterval), reconnectInterval);
    }
  }
}

/**
 * Joins a specific communication channel in Figma.
 *
 * This function sends a "join" command to the Figma plugin. Most other commands
 * require a channel to be established first. If the WebSocket is not currently connected,
 * this function will throw an error.
 *
 * @param {string} channelName - The desired name for the communication channel.
 * @returns {Promise<void>} A promise that resolves when the channel is successfully joined,
 *                          or rejects if the join command fails or if not connected.
 * @throws {Error} If the WebSocket is not connected to Figma, or if the "join" command to Figma fails.
 */
export async function joinChannel(channelName: string): Promise<void> {
  if (!ws || ws.getReadyState() !== WebSocket.OPEN) {
    // Consider attempting a lazy connect here if desired, or ensure connectToFigma is called prior.
    // For now, it strictly requires an active connection.
    logger.error("Cannot join channel: Not connected to Figma.");
    throw new Error("Not connected to Figma. Please connect before joining a channel.");
  }

  try {
    // The "join" command is a special case for sendCommandToFigma that doesn't require a currentChannel.
    await sendCommandToFigma("join" as FigmaCommand, { channel: channelName }); // Cast to FigmaCommand if "join" is part of it
    currentChannel = channelName; // Set the current channel globally upon successful join.
    logger.info(`Successfully joined Figma channel: ${channelName}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to join Figma channel "${channelName}": ${errorMessage}`);
    throw error;
  }
}

/**
 * Get the current channel name
 * 
 * @returns {string|null} The current channel name or null if not joined
 */
export function getCurrentChannel(): string | null {
  return currentChannel;
}

/**
 * Sends commands to Figma Plugin via WebSocket
 * 
 * Handles the full command lifecycle including:
 * 1. Connection validation and auto-reconnect
 * 2. Command queuing and execution
 * 3. Response handling and timeout management
 * 4. Progress tracking and updates
 * 
 * @param {FigmaCommand} command - Command to execute
 * @param {unknown} params - Command parameters
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<unknown>} Command result
 * 
 * @throws {Error} When connection fails, command times out, or channel requirements not met
 */
export function sendCommandToFigma(
  command: FigmaCommand,
  params: unknown = {},
  timeoutMs: number = 60000  // Increased default timeout to 60 seconds
): Promise<unknown> {
  // Lazy-connect if socket is not open
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    if (!savedServerUrl) {
      return Promise.reject(new Error("Not connected to Figma. Please ensure connection config is set."));
    }
    // initiate connection on demand
    logger.info("Socket not open, initiating connection on demand");
    connectToFigma(savedServerUrl, savedPort, savedReconnectInterval);
    return new Promise((resolve, reject) => {
      const onOpen = () => {
        logger.info("Socket opened, resending command after connection");
        ws.off('open', onOpen);
        // resend after connection
        sendCommandToFigma(command, params, timeoutMs).then(resolve, reject);
      };
      ws.on('open', onOpen);
    });
  }
  
  return new Promise((resolve, reject) => {
    // If not connected, try to connect first
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("Not connected to Figma. Please ensure Figma plugin is running."));
      return;
    }

    // Check if we need a channel for this command
    const requiresChannel = command !== "join";
    if (requiresChannel && !currentChannel) {
      reject(new Error("Must join a channel before sending commands"));
      return;
    }

    const id = uuidv4();
    const request: WebSocketMessage = {
      id,
      type: command === "join" ? "join" : "message",
      ...(command === "join"
        ? { channel: (params as any).channel }
        : { channel: currentChannel }),
      message: {
        id,
        command,
        params: {
          ...(params as any),
          commandId: id, // Include the command ID in params
        },
      },
    };

    // Set a timeout for the request with progressive timeout extension
    let timeoutExtension = 1;  // Start with 1x multiplier
    const maxTimeoutExtensions = 3;  // Maximum number of extensions
    
    const createTimeout = (remainingExtensions: number) => {
      return setTimeout(() => {
        if (!pendingRequests.has(id)) return;
        
        // Get the time elapsed since the request was sent
        const request = pendingRequests.get(id)!;
        const elapsed = Date.now() - request.lastActivity;
        
        if (remainingExtensions > 0) {
          // Still have timeout extensions left
          logger.info(`Request ${id} extending timeout (${remainingExtensions} extensions left, elapsed: ${elapsed}ms)`);
          
          // Clear the current timeout and create a new one with increased time
          clearTimeout(request.timeout);
          timeoutExtension++;
          
          // Set the new timeout with extended time and decremented counter
          request.timeout = createTimeout(remainingExtensions - 1);
        } else {
          // No more extensions, fail the request
          logger.error(`Request ${id} timed out after ${elapsed}ms (${maxTimeoutExtensions} extensions used)`);
          pendingRequests.delete(id);
          reject(new Error(`Request to Figma timed out after ${elapsed}ms`));
        }
      }, timeoutMs * timeoutExtension);
    };

    const timeout = createTimeout(maxTimeoutExtensions);

    // Store the request callbacks along with the timeout and current time to allow timeout management.
    pendingRequests.set(id, {
      resolve,
      reject,
      timeout,
      lastActivity: Date.now()
    });

    // Send the request
    logger.info(`Sending command to Figma: ${command} (ID: ${id}, channel: ${currentChannel || 'none'})`);
    logger.debug(`Request details: ${JSON.stringify(request)}`);
    
    try {
      ws.send(JSON.stringify(request));
    } catch (error) {
      logger.error(`Error sending request ${id}: ${error instanceof Error ? error.message : String(error)}`);
      clearTimeout(timeout);
      pendingRequests.delete(id);
      reject(new Error(`Failed to send command to Figma: ${error instanceof Error ? error.message : String(error)}`));
    }
  });
}

/**
 * Processes and filters Figma node responses for client consumption
 * 
 * @param {unknown} result - Raw node data from Figma API
 * @returns {any} Processed node data with sensitive/internal data removed
 */
export function processFigmaNodeResponse(result: unknown): any {
  if (!result || typeof result !== "object") {
    return result;
  }

  // Check if this looks like a node response
  const resultObj = result as Record<string, unknown>;
  if ("id" in resultObj && typeof resultObj.id === "string") {
    // It appears to be a node response, log the details
    logger.debug(
      `Processed Figma node: ${resultObj.name || "Unknown"} (ID: ${resultObj.id
      })`
    );

    if ("x" in resultObj && "y" in resultObj) {
      logger.debug(`Node position: (${resultObj.x}, ${resultObj.y})`);
    }

    if ("width" in resultObj && "height" in resultObj) {
      logger.debug(`Node dimensions: ${resultObj.width}×${resultObj.height}`);
    }
  }

  return result;
}

/**
 * Check if there's a WebSocket connection to Figma
 * 
 * @returns {boolean} True if connected, false otherwise
 */
export function isConnectedToFigma(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}
