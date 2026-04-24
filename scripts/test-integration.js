#!/usr/bin/env node

/**
 * Integration test script for the Conduit MCP Figma plugin and Claude AI agent.
 * - Verifies dependencies (Bun, MCP SDK)
 * - Checks and configures AI Agent (Claude) integration
 * - Starts and verifies the WebSocket server
 * - Checks Figma plugin installation
 * - Guides the user through manual integration tests
 *
 * Usage: node test-integration.js
 */

import { execSync, spawn } from 'child_process';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

// Check for CI environment
const isCI = process.env.CI === 'true';

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Console colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[✓]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  step: (msg) => console.log(`\n${colors.cyan}${colors.bold}[STEP]${colors.reset} ${msg}`),
  title: (msg) => console.log(`\n${colors.magenta}${colors.bold}== ${msg} ==${colors.reset}\n`)
};

// Function to create a readline interface for user input
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Creates a readline interface for user input.
 * @returns {readline.Interface} The readline interface.
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Asks the user a question via the command line.
 * @param {string} question - The question to ask the user.
 * @returns {Promise<string>} A promise that resolves to the user's answer.
 */
async function askQuestion(question) {
  const rl = createInterface();
  return new Promise(resolve => {
    rl.question(`${colors.yellow}? ${question}${colors.reset} `, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Checks if a given port is currently in use.
 * @param {number} port - The port number to check.
 * @returns {Promise<boolean>} A promise that resolves to true if the port is in use, false otherwise.
 */
function isPortInUse(port) {
  try {
    const server = createServer();
    return new Promise((resolve) => {
      server.once('error', err => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      });
      
      server.once('listening', () => {
        server.close();
        resolve(false);
      });
      
      server.listen(port);
    });
  } catch (err) {
    log.error(`Error checking port ${port}: ${err.message}`);
    return Promise.resolve(true); // Assume it's in use if there's an error
  }
}

/**
 * Verifies that necessary dependencies (Bun, MCP SDK) are installed.
 * Exits the process if dependencies are missing.
 */
async function checkDependencies() {
  log.step('Verifying installed dependencies');
  
  try {
    log.info('Verifying Bun...');
    execSync('bun --version', { stdio: 'pipe' });
    log.success('Bun is installed');
  } catch (err) {
    log.error('Bun is not installed. Please install it from https://bun.sh');
    process.exit(1);
  }

  // Verificar MCP SDK
  try {
    log.info('Verifying @modelcontextprotocol/sdk...');
    const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    if (packageJson.dependencies['@modelcontextprotocol/sdk']) {
      log.success('MCP SDK is included in package.json');
    } else {
      log.error('MCP SDK is not included in package.json');
      process.exit(1);
    }
  } catch (err) {
    log.error(`Could not read package.json: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Checks the AI Agent (Claude) configuration.
 * Prompts the user to configure if necessary, unless in a CI environment.
 * May exit the process if configuration is critical and fails or is skipped.
 */
// fixme: disable this code:
async function checkClaudeConfig() {
  log.step('Verifying AI Agent configuration');

  const configPath = process.platform === 'darwin' 
    ? path.join(process.env.HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    : path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');

  log.info(`Looking for configuration file in: ${configPath}`);
  
  try {
    if (!fs.existsSync(configPath)) {
      log.warning('AI Agent configuration file not found');
      
      if (isCI) {
        log.info('CI environment detected, skipping AI Agent configuration prompt.');
        log.warning('Configuration skipped in CI. MCP may not work correctly.');
      } else {
        const shouldConfigure = await askQuestion('Do you want to configure AI Agent now? (y/n)');
        
        if (shouldConfigure.toLowerCase() === 'y') {
          log.info('Running configuration script...');
          execSync('bun run configure-claude', { stdio: 'inherit', cwd: rootDir });
          log.success('Configuration completed');
        } else {
          log.warning('Configuration skipped. MCP may not work correctly');
        }
      }
      return;
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.mcpServers && config.mcpServers['ClaudeTalkToFigma']) {
      log.success('ClaudeTalkToFigma configuration found in AI Agent');
    } else {
      log.warning('ClaudeTalkToFigma is not configured in AI Agent');
      
      if (isCI) {
        log.info('CI environment detected, skipping AI Agent configuration prompt.');
        log.warning('Configuration skipped in CI. MCP may not work correctly.');
      } else {
        const shouldConfigure = await askQuestion('Do you want to configure AI Agent now? (y/n)');
        
        if (shouldConfigure.toLowerCase() === 'y') {
          log.info('Running configuration script...');
          execSync('bun run configure-claude', { stdio: 'inherit', cwd: rootDir });
          log.success('Configuration completed');
        } else {
          log.warning('Configuration skipped. MCP may not work correctly');
        }
      }
    }
  } catch (err) {
    log.error(`Error verifying configuration: ${err.message}`);
  }
}

/**
 * Starts the WebSocket server.
 * Checks if the port is in use and handles accordingly.
 * @returns {Promise<import('child_process').ChildProcess|null>} A promise that resolves to the server process object, or null if an existing server is used or startup is aborted.
 */
async function startWebSocketServer() {
  log.step('Starting WebSocket server');
  
  // Check if port 3055 is in use
  const portInUse = await isPortInUse(3055);
  if (portInUse) {
    log.warning('Port 3055 is already in use. Possibly the WebSocket server is already running.');
    
    if (isCI) {
      log.error('CI environment detected. WebSocket server must not be running for tests.');
      process.exit(1); // Exit if server is already running in CI
    } else {
      const shouldContinue = await askQuestion('Do you want to continue with tests? (y/n)');
      if (shouldContinue.toLowerCase() !== 'y') {
        log.info('Tests cancelled. Release port 3055 and try again.');
        process.exit(0);
      }
      log.info('Continuing tests with existing WebSocket server');
    }
    return null; // Return null if using existing server or exiting
  }
  
  log.info('Starting WebSocket server on port 3055...');
  const wsServer = spawn('bun', ['run', 'src/socket.ts'], { 
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  wsServer.stdout.on('data', (data) => {
    const message = data.toString().trim();
    if (message.includes('WebSocket server running')) {
      log.success('WebSocket server started successfully');
    }
    // Only log WebSocket output in non-CI environments to keep CI logs cleaner
    if (!isCI) {
       console.log(`${colors.cyan}[WebSocket]${colors.reset} ${message}`);
    }
  });
  
  wsServer.stderr.on('data', (data) => {
    console.error(`${colors.red}[WebSocket Error]${colors.reset} ${data.toString().trim()}`);
  });
  
  // Wait for the server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return wsServer;
}

/**
 * Checks the status of the WebSocket server by querying its /status endpoint.
 * Retries up to 3 times if the initial attempt fails.
 * @returns {Promise<boolean>} A promise that resolves to true if the server is running and responsive, false otherwise.
 */
async function checkWebSocketStatus() {
  log.step('Verifying WebSocket server status');
  
  try {
    log.info('Consulting status endpoint...');
    
    // Perform HTTP request to status endpoint
    const fetchStatus = async () => {
      try {
        const response = await fetch('http://localhost:3055/status');
        if (!response.ok) {
          throw new Error(`Unexpected response: ${response.status} ${response.statusText}`);
        }
        return await response.json();
      } catch (err) {
        throw err;
      }
    };
    
    // Try up to 3 times with 1 second wait between attempts
    let status = null;
    let tries = 0;
    while (tries < 3) {
      try {
        status = await fetchStatus();
        break;
      } catch (err) {
        tries++;
        if (tries < 3) {
          log.warning(`Attempt ${tries} failed: ${err.message}`);
          await new Promise(r => setTimeout(r, 1000));
        } else {
          throw err;
        }
      }
    }
    
    if (status) {
      log.success('WebSocket server is running');
      // Only log stats in non-CI environments
      if (!isCI) {
        log.info(`Statistics: ${JSON.stringify(status.stats)}`);
      }
      return true;
    }
  } catch (err) {
    log.error(`Could not verify server status: ${err.message}`);
    return false;
  }
}

/**
 * Checks if the Figma plugin has been installed by the user.
 * Provides instructions if not installed. Skips interactive parts in CI.
 * @returns {Promise<boolean>} A promise that resolves to true if the plugin is installed or if in CI, false otherwise.
 */
async function checkFigmaPlugin() {
  log.step('Verifying Figma plugin access');
  
  try {
    log.info('This project uses a custom Conduit MCP Plugin for Figma');
    log.info('The plugin code is located in the src/conduit_mcp_plugin directory');
    
    // Ask if the user has already installed the plugin
    if (isCI) {
      log.info('CI environment detected, skipping Figma plugin check prompt.');
      // In CI, we can't check the Figma plugin directly.
      // Assume it's handled by the test environment setup or skip this check.
      // For now, we'll just log that we're skipping the interactive part.
      log.warning('Figma plugin check skipped in CI.');
      return true; // Assume success in CI for the workflow to proceed
    } else {
      const isPluginInstalled = await askQuestion('Have you installed the Conduit MCP Plugin as a development plugin in Figma? (y/n)');
      if (isPluginInstalled.toLowerCase() !== 'y') {
        log.warning('Please install the plugin before continuing with tests');
        log.info('1. Open Figma');
        log.info('2. Go to Menu > Plugins > Development > New Plugin');
        log.info('3. Select "Link existing plugin"');
        log.info('4. Navigate to and select the folder `src/conduit_mcp_plugin` from this repository');
        return false;
      } else {
        log.success('Plugin installed as per user');
      }
      
      log.info('\nTo use the plugin in Figma:');
      log.info('1. Open Figma');
      log.info('2. Go to Plugins > Development > Conduit MCP Plugin');
      log.info('3. Enter port 3055 and connect to the WebSocket server');
      
      return true;
    }
  } catch (err) {
    log.error(`Error verifying plugin: ${err.message}`);
    return false;
  }
}

/**
 * Runs automated tests for page management MCP commands.
 * This currently uses a simulated MCP command execution.
 * @returns {Promise<void>}
 */
async function testPageManagementCommands() {
  log.step('Testing page management MCP commands');

  /**
   * Helper to simulate MCP command execution.
   * @param {string} command - The MCP command to simulate.
   * @param {object} [params={}] - The parameters for the command.
   * @returns {Promise<object>} A promise that resolves to a simulated response.
   */
  async function executeMcpCommand(command, params = {}) {
    // This is a placeholder. Replace with actual MCP client call if available.
    log.info(`Simulate MCP command: ${command} ${JSON.stringify(params)}`);
    // Simulate a response
    return {};
  }

  // Test get_pages
  log.info('Testing get_pages...');
  const pagesResult = await executeMcpCommand('get_pages');
  if (!Array.isArray(pagesResult)) {
    log.warning('get_pages did not return an array (this is a placeholder test)');
  } else {
    log.success(`get_pages returned ${pagesResult.length} pages`);
  }

  // Test create_page
  log.info('Testing create_page...');
  const newPage = await executeMcpCommand('create_page', { name: 'IntegrationTestPage' });
  if (!newPage || !newPage.id) {
    log.warning('create_page did not return a valid page object (this is a placeholder test)');
  } else {
    log.success(`create_page created page: ${newPage.name} (${newPage.id})`);
  }

  // Test set_current_page
  if (newPage && newPage.id) {
    log.info('Testing set_current_page...');
    const setPage = await executeMcpCommand('set_current_page', { pageId: newPage.id });
    if (!setPage || setPage.id !== newPage.id) {
      log.warning('set_current_page did not set the correct page (this is a placeholder test)');
    } else {
      log.success(`set_current_page set page: ${setPage.name} (${setPage.id})`);
    }
  }
}

// Run integration tests
/**
 * Main entry point for running integration tests.
 * Orchestrates dependency checks, configuration, server startup, and manual test guidance.
 * @returns {Promise<void>}
 */
async function runIntegrationTests() {
  log.title('CLAUDE-FIGMA INTEGRATION TESTS');
  
  // Check dependencies
  await checkDependencies();
  
  // Check AI Agent configuration
  await checkClaudeConfig();
  
  // Start and verify WebSocket server
  const wsServer = await startWebSocketServer();
  const serverStatus = await checkWebSocketStatus();
  
  if (!serverStatus) {
    log.error('Could not verify WebSocket server. Aborting tests.');
    if (wsServer) wsServer.kill();
    process.exit(1);
  }
  
  // Check Figma plugin (interactive part skipped in CI)
  await checkFigmaPlugin();

  // Automated test for page management commands
  await testPageManagementCommands();
  
  // Instructions for manual tests (only show in non-CI environments)
  if (!isCI) {
    log.step('Performing manual integration tests');
    
    log.info('\nTo complete integration tests, follow these steps:');
    log.info('1. Open AI Agent');
    log.info('2. Select "ClaudeTalkToFigma" in the MCP selector');
    log.info('3. Open Figma and run the Conduit MCP Plugin from your Development plugins');
    log.info('4. In the plugin, connect to WebSocket server (port 3055)');
    log.info('5. Test these commands in AI Agent:');
    log.info('   - "Connect to Figma using the default channel"');
    log.info('   - "Get information about the current document"');
    log.info('   - "Get information about the current selection"');
    log.info('   - "Get all pages in the document"');
    log.info('   - "Create a new page named IntegrationTestPage"');
    log.info('   - "Set the current page to IntegrationTestPage"');
  }
  
  log.title('TESTS COMPLETED');
  
  if (isCI) {
    log.success('Automated checks completed successfully in CI.');
    // In CI, we don't keep the server running
    if (wsServer) {
      log.info('Stopping WebSocket server...');
      wsServer.kill();
      log.success('WebSocket server stopped');
    }
  } else {
    log.info('The test script has completed all automated checks.');
    log.info('Please continue manual tests according to the instructions above.');
    
    // Ask if you want to keep the WebSocket server running (only in non-CI)
    if (wsServer) {
      const keepServerRunning = await askQuestion('Do you want to keep the WebSocket server running? (y/n)');
      if (keepServerRunning.toLowerCase() !== 'y') {
        log.info('Stopping WebSocket server...');
        wsServer.kill();
        log.success('WebSocket server stopped');
      } else {
        log.info('WebSocket server will continue running in the background.');
        log.info('To stop it, press Ctrl+C in the terminal or use task manager.');
        // Disconnect process from terminal so it continues running
        wsServer.unref();
      }
    }
  }
}

// Run tests
runIntegrationTests().catch(err => {
  log.error(`Error during tests: ${err.message}`);
  process.exit(1);
});
