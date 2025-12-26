/**
 * @file WebSocket Server for AI Agent to Figma Communication.
 * @module SocketServer
 *
 * This module implements a WebSocket server using Bun. The server facilitates real-time
 * communication by allowing clients (e.g., Figma plugins, AI agents) to connect,
 * join named channels, and broadcast messages within those channels. It also supports
 * broadcasting progress updates.
 *
 * Additionally, it exposes an HTTP `/status` endpoint to provide server statistics
 * and uptime information.
 *
 * Key functionalities include:
 * - Managing WebSocket connections and client lifecycle.
 * - Organizing clients into channels for targeted communication.
 * - Broadcasting messages and progress updates to clients within the same channel.
 * - Tracking server statistics (connections, messages, errors).
 * - Providing a simple logging mechanism.
 */

import { Server, ServerWebSocket } from "bun";

/**
 * A simple logger object with methods for different log levels.
 * Messages are prepended with log level tags (e.g., `[INFO]`, `[DEBUG]`).
 */
const logger = {
  /** Logs informational messages. */
  info: (message: string, ...args: any[]) => {
    console.log(`[INFO] ${message}`, ...args);
  },
  /** Logs debug messages. */
  debug: (message: string, ...args: any[]) => {
    console.log(`[DEBUG] ${message}`, ...args);
  },
  /** Logs warning messages. */
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  /** Logs error messages. */
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  }
};

/**
 * Stores connected WebSocket clients, organized by channel name.
 * Each key is a channel name (string), and the value is a `Set` of
 * `ServerWebSocket` instances subscribed to that channel.
 * @type {Map<string, Set<ServerWebSocket<any>>>}
 */
const channels = new Map<string, Set<ServerWebSocket<any>>>();

/**
 * An object holding various server statistics.
 * @type {object}
 * @property {number} totalConnections - Total number of WebSocket connections ever made.
 * @property {number} activeConnections - Current number of active WebSocket connections.
 * @property {number} messagesSent - Total number of messages sent by the server.
 * @property {number} messagesReceived - Total number of messages received by the server.
 * @property {number} errors - Total number of errors encountered by the server (e.g., failed sends, message parsing errors).
 */
const stats = {
  totalConnections: 0,
  activeConnections: 0,
  messagesSent: 0,
  messagesReceived: 0,
  errors: 0
};

/**
 * Handles a new WebSocket connection established via the `websocket.open` handler.
 *
 * Responsibilities:
 * - Increments `stats.totalConnections` and `stats.activeConnections`.
 * - Generates a unique `clientId` (e.g., `client_timestamp_randomString`) and stores it in `ws.data.clientId` for tracking.
 * - Sends a welcome message to the newly connected client, prompting them to join a channel.
 * - **Important**: This function redefines the `ws.close` method for the given WebSocket instance.
 *   The redefined `ws.close` handles decrementing `stats.activeConnections` and removing the client
 *   from any channels it might have joined, notifying other clients in those channels.
 *   This is an instance-specific override and differs from the global `websocket.close` handler
 *   provided to `Bun.serve`, which also performs cleanup. Care should be taken to ensure
 *   these cleanup routines are complementary and not conflicting.
 *
 * @param {ServerWebSocket<any>} ws - The WebSocket connection object provided by Bun.
 *                                  The `ws.data` property is used to store `{ clientId: string }`.
 * @example
 * // This function is typically used as the `open` handler in `Bun.serve`:
 * // Bun.serve({ websocket: { open: handleConnection, ... } });
 *
 * // Client-side connection example:
 * const ws = new WebSocket("ws://localhost:3055");
 * ws.addEventListener("open", () => { // The 'open' event triggers handleConnection on server
 *   // Client then sends a "join" message as prompted by the server's welcome message
 *   ws.send(JSON.stringify({ type: "join", channel: "main", id: "someUniqueId" }));
 * });
 */
function handleConnection(ws: ServerWebSocket<any>) {
  // Track connection statistics
  stats.totalConnections++;
  stats.activeConnections++;
  
  // Assign a unique client ID for better tracking
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  ws.data = { clientId };
  
  // Don't add to clients immediately - wait for channel join
  logger.info(`☎️ New client connected: ${clientId}`);

  // Send welcome message to the new client
  try {
    ws.send(JSON.stringify({
      type: "system",
      message: "Please join a channel to start communicating with Figma",
    }));
  } catch (error) {
    logger.error(`Failed to send welcome message to client ${clientId}:`, error);
    stats.errors++;
  }

  ws.close = () => {
    logger.info(`Client disconnected: ${clientId}`);
    stats.activeConnections--;

    // Remove client from their channel
    channels.forEach((clients, channelName) => {
      if (clients.has(ws)) {
        clients.delete(ws);
        logger.debug(`Removed client ${clientId} from channel: ${channelName}`);

        // Notify other clients in same channel
        try {
          clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "system",
                message: "A client has left the channel",
                channel: channelName
              }));
              stats.messagesSent++;
            }
          });
        } catch (error) {
          logger.error(`Error notifying channel ${channelName} about client disconnect:`, error);
          stats.errors++;
        }
      }
    });
  };
}

/**
 * Starts an HTTP/WebSocket server on port 3055.
 *
 * HTTP Endpoint:
 *   GET /status
 *     Response: {
 *       status: string, // "running"
 *       uptime: number, // seconds since start
 *       stats: {
 *         totalConnections: number,
 *         activeConnections: number,
 *         messagesSent: number,
 *         messagesReceived: number,
 *         errors: number
 *       }
 *     }
 *
 * WebSocket Message Formats:
 *   To server:
 *     - join: { type: "join", channel: string, id?: any }
 *     - message: { type: "message", channel: string, message: string }
 *     - progress_update: { type: "progress_update", channel: string, id: string, message: { data: { status: string, progress: number } } }
 *
 *   From server:
 *     - system: { type: "system", message: string | object, channel?: string }
 *     - broadcast: { type: "broadcast", message: string, sender: string, channel: string }
 *     - error: { type: "error", message: string }
 *
 * @example
 * // Check server status:
 * fetch("http://localhost:3055/status").then(res => res.json()).then(console.log);
 *
 * // Connect via WebSocket:
 * const ws = new WebSocket("ws://localhost:3055");
 * ws.addEventListener("message", ({ data }) => console.log("Received:", JSON.parse(data)));
 * ws.addEventListener("open", () => {
 *   ws.send(JSON.stringify({ type: "join", channel: "main", id: 42 }));
 * });
 */
const server = Bun.serve({
  port: 3055,
/**
 * Main server instance created by `Bun.serve`.
 * This server listens on port 3055 and handles both HTTP requests (for status and WebSocket upgrades)
 * and WebSocket connections.
 *
 * HTTP Endpoint (`/status`):
 *   - Method: GET
 *   - Response: JSON object containing server status, uptime, and connection/message statistics.
 *     Example: `{"status":"running","uptime":123.45,"stats":{...}}`
 *
 * WebSocket Communication:
 *   - Manages client connections, channel subscriptions, and message broadcasting.
 *   - Expected client message types (JSON format):
 *     - `join`: `{ type: "join", channel: string, id?: any }` - Client requests to join a channel.
 *     - `message`: `{ type: "message", channel: string, message: any }` - Client sends a message to a channel.
 *     - `progress_update`: `{ type: "progress_update", channel: string, id: string, message: { data: { status: string, progress: number, ... } } }` - Client sends a progress update for a command.
 *   - Server message types (JSON format):
 *     - `system`: `{ type: "system", message: string | object, channel?: string }` - System messages (e.g., welcome, join confirmation, client left).
 *     - `broadcast`: `{ type: "broadcast", message: any, sender: string, channel: string }` - Message broadcasted from another client in the channel.
 *     - `error`: `{ type: "error", message: string }` - Error message from the server.
 *     - `progress_update`: (Mirrored from client) Forwards progress updates to other clients in the channel.
 */
const server = Bun.serve({
  port: 3055,
  // hostname: "0.0.0.0", // Uncomment for WSL or broader network access
  
  /**
   * Handles incoming HTTP requests.
   * - Responds to CORS preflight (OPTIONS) requests.
   * - Provides server status and statistics at the `/status` endpoint.
   * - Attempts to upgrade valid WebSocket connection requests.
   * - Returns a plain text message for other HTTP requests.
   * @param {Request} req - The incoming HTTP request.
   * @param {Server} serverInstance - The Bun server instance.
   * @returns {Response|undefined} A Response object, or undefined if the request was upgraded to WebSocket.
   */
  fetch(req: Request, serverInstance: Server): Response | undefined {
    const url = new URL(req.url);
    logger.debug(`Received ${req.method} request to ${url.pathname}`);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (url.pathname === "/status") {
      return new Response(JSON.stringify({
        status: "running",
        uptime: process.uptime(),
        stats,
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    try {
      const success = serverInstance.upgrade(req, {
        headers: { "Access-Control-Allow-Origin": "*" }, // Add CORS headers for WebSocket upgrade response
      });
      if (success) {
        return undefined; // Successfully upgraded to WebSocket
      }
    } catch (error) {
      logger.error("Failed to upgrade WebSocket connection:", error);
      stats.errors++;
      return new Response("Failed to upgrade to WebSocket", { status: 500 });
    }

    return new Response("AI Agent to Figma WebSocket server running. Try connecting with a WebSocket client.", {
      headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" },
    });
  },
  /**
   * WebSocket event handlers.
   */
  websocket: {
    /**
     * Called when a new WebSocket connection is successfully established.
     * Delegates to {@link handleConnection} for further processing.
     * @param {ServerWebSocket<any>} ws - The newly opened WebSocket connection.
     *                                   `ws.data` can be used to store per-connection state.
     */
    open: handleConnection,
    /**
     * Called when a message is received from a connected WebSocket client.
     * Handles different message types:
     * - `join`: Adds the client to the specified channel, creating it if necessary. Notifies the client
     *   and other members of the channel.
     * - `message`: Broadcasts the received message to all other clients in the sender's current channel.
     * - `progress_update`: Broadcasts the progress update to all clients in the specified channel.
     *
     * Increments `stats.messagesReceived` and `stats.messagesSent` accordingly.
     * Includes error handling for invalid messages or operations.
     * @param {ServerWebSocket<any>} ws - The WebSocket connection that sent the message.
     * @param {string | Buffer} message - The received message data. Expected to be a JSON string.
     */
    message(ws: ServerWebSocket<any>, message: string | Buffer) {
      try {
        stats.messagesReceived++;
        const clientId = ws.data?.clientId || "unknown_client";
        logger.debug(`Received message from client ${clientId}:`, typeof message === 'string' ? message : '<binary_data>');
        
        const data = JSON.parse(message as string); // Assuming message is always JSON string

        switch (data.type) {
          case "join": {
            const channelName = data.channel;
            if (!channelName || typeof channelName !== "string") {
              logger.warn(`Client ${clientId} sent 'join' without a valid channel name.`);
              ws.send(JSON.stringify({ type: "error", message: "Channel name is required for join." }));
              stats.messagesSent++; stats.errors++;
              return;
            }

            if (!channels.has(channelName)) {
              logger.info(`🛰️☘️ Creating new channel: ${channelName}`);
              channels.set(channelName, new Set());
            }
            const channelClients = channels.get(channelName)!;
            channelClients.add(ws);
            ws.data.channel = channelName; // Store current channel on ws.data
            logger.info(`🛰️⛓️‍💥 Client ${clientId} joined channel: ${channelName}`);

            try {
              ws.send(JSON.stringify({ type: "system", message: `Successfully joined channel: ${channelName}`, channel: channelName, id: data.id }));
              stats.messagesSent++;
              // Notify others in the channel
              channelClients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({ type: "system", message: `Client ${clientId} has joined the channel.`, channel: channelName }));
                  stats.messagesSent++;
                }
              });
            } catch(e) { logger.error("Error sending join notifications:", e); stats.errors++; }
            break;
          }
          case "message": {
            const channelName = data.channel || ws.data?.channel; // Use message's channel or client's current channel
            if (!channelName || typeof channelName !== "string") {
              logger.warn(`Client ${clientId} sent 'message' without a valid channel.`);
              ws.send(JSON.stringify({ type: "error", message: "Channel name is required for message." }));
              stats.messagesSent++; stats.errors++;
              return;
            }
            const channelClients = channels.get(channelName);
            if (!channelClients || !channelClients.has(ws)) {
              logger.warn(`Client ${clientId} attempted to send to unjoined/invalid channel: ${channelName}`);
              ws.send(JSON.stringify({ type: "error", message: "Must join the channel first or provide a valid channel." }));
              stats.messagesSent++; stats.errors++;
              return;
            }
            // Broadcast to all clients in the channel
            channelClients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                try {
                  client.send(JSON.stringify({ type: "broadcast", message: data.message, sender: clientId, channel: channelName }));
                  stats.messagesSent++;
                } catch(e) { logger.error(`Error broadcasting to client ${client.data?.clientId || 'unknown'} in channel ${channelName}:`, e); stats.errors++; }
              }
            });
            logger.info(`Broadcasted message from ${clientId} to ${channelClients.size} clients in channel ${channelName}`);
            break;
          }
          case "progress_update": {
            const channelName = data.channel || ws.data?.channel;
            if (!channelName || typeof channelName !== "string") {
              logger.warn(`Client ${clientId} sent 'progress_update' without valid channel.`);
              return; // Optionally send error back
            }
            const channelClients = channels.get(channelName);
            if (!channelClients) {
              logger.warn(`Progress update for non-existent channel: ${channelName}`);
              return;
            }
            logger.debug(`Progress for command ${data.id} in ${channelName}: ${data.message?.data?.status || 'N/A'} - ${data.message?.data?.progress || 0}%`);
            channelClients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                try {
                  client.send(JSON.stringify(data)); // Forward the whole progress_update message
                  stats.messagesSent++;
                } catch(e) { logger.error(`Error broadcasting progress to client ${client.data?.clientId || 'unknown'} in ${channelName}:`, e); stats.errors++; }
              }
            });
            break;
          }
          default:
            logger.warn(`Received unknown message type '${data.type}' from client ${clientId}.`);
            ws.send(JSON.stringify({ type: "error", message: `Unknown message type: ${data.type}` }));
            stats.messagesSent++; stats.errors++;
        }
      } catch (err) {
        stats.errors++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(`Error handling message from ${ws.data?.clientId || 'unknown_client'}: ${errorMessage}`);
        try {
          ws.send(JSON.stringify({ type: "error", message: `Error processing your message: ${errorMessage}` }));
          stats.messagesSent++;
        } catch (sendError) { logger.error("Critical: Failed to send error message to client:", sendError); stats.errors++; }
      }
    },
    /**
     * Called when a WebSocket connection is closed.
     * Performs cleanup by removing the client from any channels it was subscribed to
     * and decrementing the `stats.activeConnections` counter.
     * This handler complements the instance-specific `ws.close` defined in {@link handleConnection},
     * ensuring cleanup occurs regardless of how the close was initiated.
     * @param {ServerWebSocket<any>} ws - The WebSocket connection that closed.
     * @param {number} code - The WebSocket close code.
     * @param {string} reasonMessage - The reason for closure.
     */
    close(ws: ServerWebSocket<any>, code: number, reasonMessage: string) {
      const clientId = ws.data?.clientId || "unknown_client";
      logger.info(`WebSocket closed for client ${clientId}: Code ${code}, Reason: ${reasonMessage || 'No reason provided'}`);
      
      // Remove client from any channel it might have been in.
      const currentClientChannel = ws.data?.channel;
      if (currentClientChannel && channels.has(currentClientChannel)) {
        channels.get(currentClientChannel)!.delete(ws);
        logger.debug(`Removed client ${clientId} from channel ${currentClientChannel} due to connection close.`);
        // Optionally, notify others in the channel if not handled by the instance-specific ws.close
      } else {
         // Fallback: Iterate all channels if ws.data.channel was not set or client was in multiple (though current logic is single channel)
        channels.forEach((clients, channelName) => {
          if (clients.delete(ws)) {
            logger.debug(`Removed client ${clientId} from channel ${channelName} (fallback cleanup).`);
          }
        });
      }
      
      if (stats.activeConnections > 0) stats.activeConnections--;
    },
    /**
     * Called when a previously busy WebSocket (due to backpressure) can now accept more data.
     * Logs that backpressure has been relieved for the client.
     * @param {ServerWebSocket<any>} ws - The WebSocket connection.
     */
    drain(ws: ServerWebSocket<any>) {
      const clientId = ws.data?.clientId || "unknown_client";
      logger.debug(`WebSocket backpressure relieved for client ${clientId}. More data can be sent.`);
    }
  }
});

logger.info(`AI Agent to Figma WebSocket server running on port ${server.port}`);
logger.info(`Status endpoint available at http://localhost:${server.port}/status`);

/**
 * Interval timer to log server statistics every 5 minutes.
 */
setInterval(() => {
  logger.info("Server stats:", {
    activeChannels: channels.size,
    ...stats
  });
}, 5 * 60 * 1000);
