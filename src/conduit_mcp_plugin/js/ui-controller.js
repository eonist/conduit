/**
 * @file UI Controller for the Conduit MCP Figma plugin.
 * @module UIController
 * This script is responsible for initializing and managing the User Interface elements
 * of the Figma plugin. It bridges the HTML elements with the JavaScript logic by:
 * - Obtaining references to key UI elements from the DOM.
 * - Setting up event listeners for user interactions (e.g., button clicks, toggle changes).
 * - Updating the UI display based on the application's state (e.g., connection status, progress updates).
 * It relies on functions from `connection.js` (like `connectToServer`, `disconnectFromServer`)
 * and interacts with the global `pluginState` defined in `state.js`.
 */


/**
 * Reference to the port input HTML element.
 * Initialized by {@link initUIElements}.
 * @global
 * @type {HTMLInputElement|undefined}
 */
let portInput;

/**
 * Reference to the connect/disconnect button HTML element.
 * Initialized by {@link initUIElements}.
 * @global
 * @type {HTMLButtonElement|undefined}
 */
let connectButton;

/**
 * Reference to the copy channel ID button HTML element.
 * Initialized by {@link initUIElements}.
 * @global
 * @type {HTMLButtonElement|undefined}
 */
let copyChannelButton;

/**
 * Reference to the connection status display HTML element.
 * Initialized by {@link initUIElements}.
 * @global
 * @type {HTMLElement|undefined}
 */
let connectionStatus;

/**
 * Reference to the auto-reconnect toggle (checkbox) HTML element.
 * Initialized by {@link initUIElements}.
 * @global
 * @type {HTMLInputElement|undefined}
 */
let autoReconnectToggle;

/**
 * Reference to the progress container HTML element.
 * Initialized by {@link initUIElements}.
 * @global
 * @type {HTMLElement|undefined}
 */
let progressContainer;

/**
 * Reference to the progress bar fill HTML element (the inner bar that shows percentage).
 * Initialized by {@link initUIElements}.
 * @global
 * @type {HTMLElement|undefined}
 */
let progressBar;

/**
 * Reference to the progress message display HTML element.
 * Initialized by {@link initUIElements}.
 * @global
 * @type {HTMLElement|undefined}
 */
let progressMessage;

/**
 * Reference to the progress status text HTML element (e.g., "Started", "In Progress", "Completed").
 * Initialized by {@link initUIElements}.
 * @global
 * @type {HTMLElement|undefined}
 */
let progressStatus;

/**
 * Reference to the progress percentage display HTML element.
 * Initialized by {@link initUIElements}.
 * @global
 * @type {HTMLElement|undefined}
 */
let progressPercentage;

/**
 * Initializes references to UI elements from the DOM and sets up core event listeners.
 *
 * This function performs the following setup tasks:
 * - Populates global variables (e.g., `portInput`, `connectButton`, `progressContainer`)
 *   with their corresponding DOM element references using `document.getElementById`.
 * - Attaches an event listener to `connectButton`:
 *   - If connected, it calls `disconnectFromServer()`.
 *   - If disconnected, it calls `connectToServer()` with the port from `portInput`.
 *   - Updates UI status messages accordingly during these operations.
 * - Attaches an event listener to `copyChannelButton`:
 *   - Copies the current `pluginState.connection.channel` ID to the clipboard.
 *   - Sends a "notify" message to the Figma plugin backend to show a confirmation.
 * - Attaches an event listener to `autoReconnectToggle`:
 *   - Updates `pluginState.connection.autoReconnect` based on the toggle's checked state.
 *   - If toggled on and not connected, attempts to connect.
 *   - If toggled off, clears any pending reconnection timers.
 *   - Updates the `connectButton`'s disabled state.
 * - Initializes the `autoReconnectToggle`'s checked state from `pluginState.connection.autoReconnect`.
 * - Initializes the `connectButton`'s disabled state based on the auto-reconnect setting.
 * - If auto-reconnect is enabled at startup and the plugin is not connected, it triggers
 *   an initial connection attempt.
 *
 * @returns {void}
 */
function initUIElements() {
  portInput = document.getElementById("port");
  connectButton = document.getElementById("btn-connect");
  copyChannelButton = document.getElementById("btn-copy-channel");
  connectionStatus = document.getElementById("connection-status");
  autoReconnectToggle = document.getElementById("auto-reconnect-toggle");
  
  // Progress tracking elements
  progressContainer = document.getElementById("progress-container");
  progressBar = document.getElementById("progress-bar");
  progressMessage = document.getElementById("progress-message");
  progressStatus = document.getElementById("progress-status");
  progressPercentage = document.getElementById("progress-percentage");
  
  // Set up event listeners
  connectButton.addEventListener("click", () => {
    if (pluginState.connection.connected) {
      // If connected, disconnect
      updateConnectionStatus(false, "Disconnecting...");
      connectionStatus.className = "status info";
      disconnectFromServer();
    } else {
      // If disconnected, connect
      const port = parseInt(portInput.value, 10) || 3055;
      updateConnectionStatus(false, "Connecting...");
      connectionStatus.className = "status info";
      connectToServer(port);
    }
  });
  
  copyChannelButton.addEventListener("click", () => {
    console.log("Copy channel button clicked");
    
    if (pluginState.connection.channel) {
      const channelId = pluginState.connection.channel;
      console.log(`Attempting to copy channel ID: "${channelId}"`);
      
      // Create temporary textarea element
      const textarea = document.createElement('textarea');
      // Position off-screen
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      // Set value and make read-only to prevent mobile keyboard
      textarea.value = channelId;
      textarea.setAttribute('readonly', '');
      
      // Add to DOM
      document.body.appendChild(textarea);
      
      // Select the text
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length); // For mobile devices
      
      let copySuccess = false;
      try {
        // Execute copy command
        copySuccess = document.execCommand('copy');
        console.log(copySuccess ? "✓ Successfully copied to clipboard using execCommand" : "❌ Copy command failed");
        
        // Send notification to Figma
        console.log("Sending notification to Figma");
        parent.postMessage(
          {
            pluginMessage: {
              type: "notify",
              message: `Copied channel ID: ${channelId}`,
            },
          },
          "*"
        );
      } catch (err) {
        console.error("❌ Failed to copy channel ID:", err);
      }
      
      // Clean up
      document.body.removeChild(textarea);
    } else {
      console.warn("No channel ID available to copy");
    }
  });
  
  // Set up auto-reconnect toggle listener
  autoReconnectToggle.addEventListener("change", () => {
    pluginState.connection.autoReconnect = autoReconnectToggle.checked;
    console.log(`Auto-reconnect ${pluginState.connection.autoReconnect ? 'enabled' : 'disabled'}`);
    
    // Trigger connection/disconnection based on toggle state
    if (autoReconnectToggle.checked) {
      // If auto-connect toggled ON and not connected, connect immediately
      if (!pluginState.connection.connected) {
        const port = parseInt(portInput.value, 10) || 3055;
        updateConnectionStatus(false, "Auto-connecting...");
        connectionStatus.className = "status info";
        connectToServer(port);
      }
    } else {
      // Stop any ongoing reconnection attempts
      if (pluginState.connection.reconnectTimer) {
        clearTimeout(pluginState.connection.reconnectTimer);
        pluginState.connection.reconnectTimer = null;
        
        if (pluginState.connection.countdownTimer) {
          clearInterval(pluginState.connection.countdownTimer);
          pluginState.connection.countdownTimer = null;
        }
        
        pluginState.connection.reconnectAttempts = 0;
        pluginState.connection.inPersistentRetryMode = false;
      }
      
      // Update status message with channel info if connected
      if (pluginState.connection.connected && pluginState.connection.channel) {
        updateConnectionStatus(true, 
          `Connected: Server port ${pluginState.connection.serverPort}, Channel ${pluginState.connection.channel}`);
      } else {
        // Just use the default message for the current connection state
        updateConnectionStatus(pluginState.connection.connected);
      }
    }
    
    // Update connect button state without updating the status message
    connectButton.disabled = autoReconnectToggle.checked;
  });
  
  // Initialize auto-reconnect toggle state from pluginState
  autoReconnectToggle.checked = pluginState.connection.autoReconnect;
  
  // Initialize connect button state based on auto-reconnect setting
  // This ensures the button is properly disabled when auto-reconnect is enabled
  updateConnectionStatus(pluginState.connection.connected);
  
  // If auto-reconnect is enabled at startup, attempt to connect immediately
  if (pluginState.connection.autoReconnect && !pluginState.connection.connected) {
    const port = parseInt(portInput.value, 10) || 3055;
    updateConnectionStatus(false, "Auto-connecting on startup...");
    connectionStatus.className = "status info";
    connectToServer(port);
  }
}

/**
 * Updates the UI elements related to the WebSocket connection status.
 * This function modifies the display text, CSS classes, and disabled states of various
 * UI elements like the status message, connect/disconnect button, copy channel button,
 * and port input field based on the provided connection state.
 * It also updates `pluginState.connection.connected`.
 *
 * @param {boolean} isConnected - True if the WebSocket is connected, false otherwise.
 * @param {string} [message] - An optional message to display in the connection status area.
 *                             If not provided, a default message based on `isConnected`
 *                             and `pluginState.connection.channel` will be used.
 * @returns {void}
 */
function updateConnectionStatus(isConnected, message) {
  pluginState.connection.connected = isConnected;
  
  // Create default message based on connection state
  let defaultMessage = "";
  if (isConnected) {
    if (pluginState.connection.channel) {
      // If connected and we have a channel, show detailed information
      defaultMessage = `Connected: Server port ${pluginState.connection.serverPort}, Channel ${pluginState.connection.channel}`;
    } else {
      // If connected but no channel yet, show simple message
      defaultMessage = "Connected";
    }
  } else {
    // Not connected
    defaultMessage = "Not connected";
  }
  
  // Use provided message or default
  connectionStatus.innerHTML = message || defaultMessage;
  connectionStatus.className = `status ${
    isConnected ? "connected" : "disconnected"
  }`;

  // Update connect button text based on connection status
  connectButton.textContent = isConnected ? "Disconnect" : "Connect";
  
  // Update copy channel button text based on connection status
  copyChannelButton.textContent = isConnected ? "Copy channel-id" : "Channel id not available";
  
  // Disable connect button if auto-reconnect is enabled, regardless of connection status
  connectButton.disabled = pluginState.connection.autoReconnect;
  
  copyChannelButton.disabled = !isConnected;
  portInput.disabled = isConnected;
}

/**
 * Updates the UI elements dedicated to displaying the progress of an operation.
 * This includes making the progress container visible, setting the width of the
 * progress bar, and updating text elements for the progress message, percentage, and status.
 * If the `progressData.status` is 'completed', it schedules the progress container to
 * be hidden after a 5-second delay.
 *
 * @param {object} progressData - An object containing progress information.
 * @param {number} [progressData.progress=0] - The progress percentage (0-100), used for the
 *                                             progress bar width and percentage text.
 * @param {string} [progressData.message="Operation in progress"] - A message describing the current operation.
 * @param {'started'|'in_progress'|'completed'|'error'} [progressData.status] - The status of the operation,
 *                               which affects the status text and its styling.
 * @returns {void}
 */
function updateProgressUI(progressData) {
  // Show progress container if hidden
  progressContainer.classList.remove("hidden");
  
  // Update progress bar
  const progress = progressData.progress || 0;
  progressBar.style.width = `${progress}%`;
  progressPercentage.textContent = `${progress}%`;
  
  // Update message
  progressMessage.textContent = progressData.message || "Operation in progress";
  
  // Update status text based on operation state
  if (progressData.status === 'started') {
    progressStatus.textContent = "Started";
    progressStatus.className = "";
  } else if (progressData.status === 'in_progress') {
    progressStatus.textContent = "In Progress";
    progressStatus.className = "";
  } else if (progressData.status === 'completed') {
    progressStatus.textContent = "Completed";
    progressStatus.className = "operation-complete";
    
    // Hide progress container after 5 seconds
    setTimeout(() => {
      progressContainer.classList.add("hidden");
    }, 5000);
  } else if (progressData.status === 'error') {
    progressStatus.textContent = "Error";
    progressStatus.className = "operation-error";
  }
}

/**
 * Resets the progress UI to its initial state (hidden, 0% progress, default messages).
 * @returns {void}
 */
function resetProgressUI() {
  progressContainer.classList.add("hidden");
  progressBar.style.width = "0%";
  progressMessage.textContent = "No operation in progress";
  progressStatus.textContent = "Not started";
  progressStatus.className = "";
  progressPercentage.textContent = "0%";
}

// Theme handling is now managed by Figma's built-in themeColors feature
// which applies CSS variables and classes automatically
