/**
 * @file Core helper functions for the MCP/Figma Test Runner.
 * @module TestRunnerCore
 *
 * This module provides fundamental utility functions used throughout the test runner scripts.
 * Key functionalities include:
 * - {@link deepEqual}: For performing deep comparisons of objects and arrays.
 * - {@link assertEchoedCommand}: A factory function to generate assertion functions that
 *   verify if a command response correctly reflects the sent command and parameters.
 * - {@link runStep}: A core function to execute a single test step by sending a command
 *   via WebSocket, awaiting a response, and applying an assertion.
 *
 * These helpers are essential for structuring test scenes and validating interactions
 * with the Figma plugin.
 */

/**
 * Performs a deep equality check between two values (objects, arrays, or primitives).
 * It recursively compares properties of objects and elements of arrays.
 *
 * @param {*} a - The first value to compare.
 * @param {*} b - The second value to compare.
 * @returns {boolean} True if the values are deeply equal, false otherwise.
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;
  const keysA = Object.keys(a), keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Generates an assertion function tailored to verify if a command response from Figma
 * correctly "echoes" or reflects the sent command and a specific subset of its parameters.
 *
 * The returned assertion function expects a response object, typically of the structure:
 * `{ command: string, params: object, ... }`.
 * It checks if `response.command` matches `expectedCommand`.
 * It then checks if the properties within `response.params[paramKey]` deeply equal `expectedParams`.
 *
 * @param {string} expectedCommand - The command name that is expected in the response.
 * @param {object} expectedParams - An object containing the key-value pairs that are expected
 *                                  to be found within the `response.params[paramKey]` object.
 * @param {string} paramKey - The key within the `response.params` object where the `expectedParams`
 *                            are anticipated to be located.
 * @returns {function(object): {pass: boolean, reason?: string}} An assertion function.
 *   This function takes a `response` object (received from Figma) and returns an object
 *   with a `pass` boolean property and an optional `reason` string if the assertion fails.
 * @example
 * const assertMyParams = assertEchoedCommand('my_command', { color: 'red' }, 'attributes');
 * const result = assertMyParams({ command: 'my_command', params: { attributes: { color: 'red', size: 10 } } });
 * // result would be { pass: true }
 * const failedResult = assertMyParams({ command: 'my_command', params: { attributes: { color: 'blue' } } });
 * // failedResult would be { pass: false, reason: "Property \"color\" expected red, got blue" }
 */
function assertEchoedCommand(expectedCommand, expectedParams, paramKey) {
  return (response) => {
    if (!response) return { pass: false, reason: 'No response received' };
    if (response.command !== expectedCommand) {
      return { pass: false, reason: `Expected command "${expectedCommand}", got "${response.command || 'unknown'}"` };
    }
    const actualParamsContainer = response.params; // The object expected to contain paramKey
    if (!actualParamsContainer || typeof actualParamsContainer !== 'object') {
        return { pass: false, reason: `Response.params is missing or not an object.` };
    }

    const actual = actualParamsContainer[paramKey];
    if (actual === undefined && expectedParams !== undefined) {
        return { pass: false, reason: `Parameter key "${paramKey}" not found in response.params.`};
    }

    if (expectedParams) { // Only iterate if expectedParams is defined
        if (typeof actual !== 'object' || actual === null) {
            return { pass: false, reason: `Expected params under "${paramKey}" to be an object, but got ${typeof actual}` };
        }
        for (const key of Object.keys(expectedParams)) {
            if (!deepEqual(actual[key], expectedParams[key])) {
                return { pass: false, reason: `Property "${key}" under "${paramKey}" did not match. Expected: ${JSON.stringify(expectedParams[key])}, Got: ${JSON.stringify(actual[key])}` };
            }
        }
    }
    return { pass: true };
  };
}

/**
 * Executes a single test step by sending a command to the Figma plugin via WebSocket.
 * It constructs a message with a unique ID, sends it, and then listens for a response
 * message that has a matching `message.id`. The function handles timeouts (5 seconds)
 * for responses and applies a provided assertion function to the response data.
 *
 * The unique ID for message correlation is generated using a combination of
 * `Date.now()` and a short random string.
 *
 * The `onMessage` handler specifically looks for WebSocket packets where
 * `packet.message.id` matches the sent `id`, and critically, where
 * `packet.message.result` or `packet.message.error` is present. This helps distinguish
 * actual command responses from other message types (e.g., mere echoes of the request).
 *
 * @param {object} options - Configuration options for the test step.
 * @param {WebSocket} options.ws - The active WebSocket instance used for communication.
 * @param {string} options.channel - The channel identifier to include in the message.
 * @param {string} options.command - The name of the command to be sent to Figma.
 * @param {object} options.params - An object containing parameters for the command.
 * @param {function(any): {pass: boolean, reason?: string}} options.assert - An assertion function
 *   that takes the `result` or `error` part of the response from Figma and returns an object
 *   with a `pass` boolean property and an optional `reason` string if the assertion fails.
 *   If no assertion function is provided, the step defaults to passing.
 * @param {string} options.label - A descriptive label for this test step, used in reporting results.
 * @returns {Promise<{label: string, pass: boolean, reason?: string, response: any}>} A promise that
 *   resolves to an object containing the test step's label, a pass/fail status, an optional
 *   reason for failure, and the response received from Figma.
 */
function runStep({ ws, channel, command, params, assert, label }) {
  return new Promise((resolve) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const message = {
      id,
      type: 'message',
      channel,
      message: {
        id,
        command,
        params
      }
    };
    let timeout;
    const onMessage = (data) => {
      try {
        const packet = JSON.parse(data.toString());
        // Only process messages with matching ID that have result or error (ignore echo messages)
        if (packet.message && packet.message.id === id && (packet.message.result || packet.message.error)) {
          ws.off('message', onMessage);
          clearTimeout(timeout);
          // Prefer result, then error
          let resp = packet.message.result ?? packet.message.error;
          const assertion = assert ? assert(resp) : { pass: true };
          resolve({
            label,
            pass: assertion.pass,
            reason: assertion.reason,
            response: resp
          });
        }
      } catch (err) {
        ws.off('message', onMessage);
        clearTimeout(timeout);
        resolve({
          label,
          pass: false,
          reason: 'Error parsing response: ' + err,
          response: null
        });
      }
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify(message));
    timeout = setTimeout(() => {
      ws.off('message', onMessage);
      resolve({
        label,
        pass: false,
        reason: 'Timeout waiting for response',
        response: null
      });
    }, 5000);
  });
}

export {
  deepEqual,
  assertEchoedCommand,
  runStep
};
