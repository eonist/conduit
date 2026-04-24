#!/usr/bin/env node
/**
 * MCP/Figma Test Runner: Runs a sequence of scenes (each with steps) and checks responses.
 *
 * Usage:
 *   node scripts/test-runner.js run --channel 9c73ze4s
 */

import WebSocket from 'ws';

let ws;
let channel;

// --- CLI Argument Parsing ---
/**
 * Parses command-line arguments from `process.argv.slice(2)` into a structured options object.
 * It distinguishes between:
 * - Positional arguments (e.g., `run`, `test_scene_1`), which are collected into an array under the `_` key.
 * - Flags (e.g., `--channel`, `--verbose`), which are parsed into key-value pairs.
 *   - If a flag is followed by a value that doesn't start with '--', that value is assigned to the flag's key.
 *   - If a flag is not followed by such a value (or is the last argument), it's treated as a boolean flag with the value `true`.
 * @returns {{_: string[], [key: string]: string|boolean}} An object containing parsed command-line options.
 *   The `_` property holds an array of positional arguments. Other properties correspond to flags.
 * @example
 * // Command: node script.js run --channel abc123 --verbose
 * // Returns: { _: ['run'], channel: 'abc123', verbose: true }
 *
 * // Command: node script.js build my_target --optimize
 * // Returns: { _: ['build', 'my_target'], optimize: true }
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      opts[key] = value;
      if (value !== true) i++;
    } else {
      opts._.push(args[i]);
    }
  }
  return opts;
}

// Import random helpers from helper.js
import { randomColor, randomFontSize, randomFontWeight } from "./helper.js";

// --- Test Step/Scene/Sequence Definitions ---

import { deepEqual, assertEchoedCommand, runStep } from "./test-runner-core.js";

import { shapeScene } from "./scene/shape-scene.js";
import { textScene } from "./scene/text-scene.js";
import { styleScene } from "./scene/style-scene.js";
import { transformScene } from "./scene/transform-scene.js";
import { booleanScene } from './scene/boolean-scene.js';
import { flattenScene } from './scene/flatten-scene.js';
import { effectScene } from './scene/effect-scene.js';
import { svgScene } from './scene/svg-scene.js';
import { imageScene } from './scene/image-scene.js';
import { maskScene } from './scene/mask-scene.js';
import { layoutScene } from './scene/layout-scene.js';
import { layoutATest } from './layout/layout-a.js';
import { layoutBTest } from './layout/layout-b.js';

// --- Container Frame Config ---
const CONTAINER_FRAME_CONFIG = {
  mode: 'HORIZONTAL',
  layoutWrap: 'WRAP',
  itemSpacing: 32,
  counterAxisSpacing: 32, // vertical gap between rows
  paddingLeft: 32,
  paddingRight: 32,
  paddingTop: 32,
  paddingBottom: 32,
  primaryAxisSizing: 'FIXED', // or 'AUTO' if you want horizontal hug
  counterAxisSizing: 'AUTO'   // hug vertically
};

/**
 * Creates the top-level container frame in Figma where all test scenes will be rendered.
 * This frame is configured with specific auto-layout properties defined in `CONTAINER_FRAME_CONFIG`
 * (horizontal, wrap, spacing, padding) to organize the scenes visually.
 * @param {WebSocket} ws - The active WebSocket connection to the Figma plugin.
 * @param {string} channel - The channel ID for the current Figma session.
 * @returns {Promise<string|undefined>} A promise that resolves to the ID of the created container frame,
 * or `undefined` if the frame creation step fails.
 * @throws {Error} Throws an error if the `runStep` for creating the frame or setting its auto-layout fails.
 * @example
 * const containerId = await createContainerFrame(ws, 'channel123');
 * if (containerId) {
 *   // Proceed with tests within this container
 * }
 */
async function createContainerFrame(ws, channel) {
  const res = await runStep({
    ws, channel,
    command: 'create_frame',
    params: {
      frame: {
        x: 0, y: 0,
        width: 1600, // or a large value, or use 'AUTO' for primaryAxisSizing
        height: 900, // initial height, will hug vertically
        name: 'All Scenes Container',
        fillColor: { r: 0.05, g: 0.05, b: 0.05, a: 1 }
        // Do NOT spread autolayout config here; set it explicitly below
      }
    },
    assert: r => Array.isArray(r.ids) && r.ids.length > 0,
    label: 'create_container_frame'
  });
  const containerFrameId = res.response?.ids?.[0];

  // Explicitly apply autolayout to the container frame
  if (containerFrameId) {
    await runStep({
      ws, channel,
      command: 'set_auto_layout',
      params: {
        layout: {
          nodeId: containerFrameId,
          ...CONTAINER_FRAME_CONFIG
        }
      },
      assert: r => r && r["0"] && r["0"].success === true && r["0"].nodeId === containerFrameId,
      label: 'set_auto_layout (container frame)'
    });
  }

  return containerFrameId;
}

// --- Main Runner ---
/**
 * Main entry point for the test runner script. This asynchronous function orchestrates the entire test execution flow:
 * 1. Parses command-line arguments using `parseArgs` to get the operation (e.g., 'run') and options (e.g., channel).
 * 2. Validates the command; currently, only 'run' is supported.
 * 3. Establishes a WebSocket connection to the Figma plugin backend (defaulting to `ws://localhost:3055`).
 * 4. Sends a 'join' message to the specified Figma channel upon successful connection.
 * 5. Calls `createContainerFrame` to create a dedicated frame in Figma for organizing test scene outputs.
 * 6. Defines a sequence of test scenes (imported from `./scene/` and `./layout/` directories).
 * 7. Iterates through each scene, calling it with the `results` array (for collecting step outcomes)
 *    and the `containerFrameId` (so scenes can place their elements within this container).
 * 8. After all scenes are executed, closes the WebSocket connection.
 * 9. Prints a summary of all test steps, indicating pass/fail status for each.
 * 10. Exits the process with a status code: 0 if all tests passed, 1 if any tests failed or an error occurred.
 * @async
 * @returns {Promise<void>} A promise that resolves when all tests are completed and results are printed,
 *                          or rejects if a critical error occurs during setup or execution.
 * @throws {Error} Can throw an error if WebSocket connection fails, argument parsing is incorrect,
 *                 or any unhandled exception occurs during test scene execution.
 * @example
 * // To run tests: node tests/test-runner.js run --channel myChannelId
 * main().catch(error => {
 *   console.error("Test runner encountered a fatal error:", error);
 *   process.exit(1);
 * });
 */
async function main() {
  const opts = parseArgs();
  if (opts._[0] !== 'run') {
    console.error('Usage: node scripts/test-runner.js run --channel mychannel');
    process.exit(1);
  }
  const port = process.env.PORT || 3055;
  channel = opts.channel || Math.random().toString(36).slice(2, 10);

  ws = new WebSocket(`ws://localhost:${port}`);

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    process.exit(1);
  });

  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      console.log(`Joined channel: ${channel}`);
      ws.send(JSON.stringify({ type: 'join', channel }));
      setTimeout(resolve, 1000); // Increased delay to 1 second for join to process
    });
  });

  // Create the container frame for all scenes
  const containerFrameId = await createContainerFrame(ws, channel);

  // Define the sequence of scenes
  const sequence = [
    //shapeScene,
    //textScene, 
    //styleScene,
    //transformScene,
    //booleanScene,
    //flattenScene,
    //svgScene,
    //imageScene,
    //layoutScene,
    //maskScene,
    // layoutATest,
    layoutBTest
  ];
  const results = [];
  for (const scene of sequence) {
    // Pass containerFrameId as the first argument to each scene
    // Each scene function should accept (results, parentFrameId) and use parentFrameId as parentId for its top-level frame
    await scene(results, containerFrameId);
  }

  ws.close();

  // Print results with visual cues
  let passCount = 0;
  let failCount = 0;
  for (const r of results) {
    if (r.pass) {
      console.log(`[PASS ✅] ${r.label}`);
      passCount++;
    } else {
      console.log(`[FAIL 🚫] ${r.label} - ${r.reason}`);
      failCount++;
    }
  }
  const summary = `Test summary: ${passCount} passed, ${failCount} failed, ${results.length} total.`;
  if (failCount === 0) {
    console.log(`${summary} (All tests succeeded ✅)`);
  } else {
    console.log(`${summary} (Some tests failed 🚫)`);
  }
  if (failCount > 0) process.exit(1);
}

main().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});

export {
  runStep,
  assertEchoedCommand,
  ws,
  channel
};
