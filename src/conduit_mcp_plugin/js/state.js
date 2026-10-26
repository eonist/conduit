/**
 * @file Global state management for the Conduit MCP Figma plugin's UI.
 * @module StateManager
 * This module provides a central JavaScript object, `pluginState`, for managing shared application
 * state across different UI modules (e.g., connection status, WebSocket object, UI settings).
 * This allows for a decoupled architecture where different parts of the UI can react to
 * changes in state or update the state for other parts to observe.
 *
 * All properties within `pluginState` are mutable and directly reflect the current
 * state of the plugin's UI and its connection to the WebSocket server.
 */


/**
 * Global plugin state object for the Conduit MCP Figma plugin's UI.
 * Stores WebSocket connection details, UI interaction states, and other shared properties.
 *
 * @global
 * @type {object} pluginState
 * @property {object} pluginState.connection - State related to the WebSocket connection.
 * @property {boolean} pluginState.connection.connected - True if the WebSocket is currently connected, false otherwise.
 * @property {WebSocket|null} pluginState.connection.socket - The active WebSocket instance, or null if not connected.
 * @property {number} pluginState.connection.serverPort - The port number the WebSocket server is expected to be on (e.g., 3055).
 * @property {Map<string, {resolve: Function, reject: Function}>} pluginState.connection.pendingRequests - Stores pending requests sent to the WebSocket server, mapping request ID to Promise resolve/reject functions.
 * @property {string|null} pluginState.connection.channel - The current channel ID used for WebSocket communication with Figma.
 * @property {boolean} pluginState.connection.autoReconnect - User's preference for whether the plugin should attempt to automatically reconnect if the connection drops.
 * @property {number} pluginState.connection.reconnectAttempts - Counter for the number of consecutive reconnection attempts made. Resets on successful connection or manual disconnect.
 * @property {number} pluginState.connection.maxReconnectAttempts - The maximum number of quick reconnection attempts (with exponential backoff) before switching to `inPersistentRetryMode`.
 * @property {boolean} pluginState.connection.inPersistentRetryMode - True if the plugin has exceeded `maxReconnectAttempts` and is now trying to reconnect at a slower, fixed interval (`persistentRetryDelay`).
 * @property {number} pluginState.connection.persistentRetryDelay - The delay in milliseconds (e.g., 8000ms) for reconnection attempts when `inPersistentRetryMode` is true.
 * @property {number|null} pluginState.connection.reconnectTimer - Stores the timer ID (from `setTimeout`) for the next scheduled reconnection attempt. Null if no attempt is scheduled.
 * @property {number|null} pluginState.connection.countdownTimer - Stores the timer ID (from `setInterval`) used to update the UI with a countdown to the next reconnection attempt. Null if no countdown is active.
 * @property {number} pluginState.connection.countdownSeconds - The number of seconds remaining until the next reconnection attempt, used for UI display.
 *
 * @property {object} pluginState.ui - Placeholder for UI-specific state properties.
 *   This can be expanded to include states like which panel is open, form inputs, etc.
 *   For example: `pluginState.ui.isSettingsPanelVisible = false;`
 *
 * @example
 * // Reading state:
 * if (pluginState.connection.connected) {
 *   console.log("Already connected to channel:", pluginState.connection.channel);
 * }
 *
 * // Updating state:
 * pluginState.connection.connected = true;
 * pluginState.connection.channel = 'new-channel-abc';
 * pluginState.ui.somePanelOpen = false;
 */
const pluginState = {
  connection: {
    connected: false,
 *   pluginState.ui.somePanelOpen = false;
 */
const pluginState = {
  connection: {
    connected: false,
    socket: null,
    serverPort: 3055,
    pendingRequests: new Map(),
    channel: null,
    autoReconnect: true, // Track auto-reconnect setting, default to true
    reconnectAttempts: 0, // Track reconnection attempts
    maxReconnectAttempts: 5, // Maximum reconnection attempts with backoff
    inPersistentRetryMode: false, // Track if we're in persistent retry mode (8 second interval)
    persistentRetryDelay: 8000, // Persistent retry delay in ms (8 seconds)
    reconnectTimer: null, // Timer for reconnection attempts
    countdownTimer: null, // Timer for updating the countdown display
    countdownSeconds: 0, // Current countdown value in seconds
  },
  ui: {
    // Example: pluginState.ui.activeTab = 'connection';
    // Example: pluginState.ui.isAdvancedSettingsVisible = false;
  },
  // Other shared state properties can be added here as needed.
  // For example, if there's a general settings object not tied to connection:
  // settings: {
  //   theme: 'dark', // (though theme is now auto-detected)
  //   language: 'en'
  // }
};
