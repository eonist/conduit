/**
 * Advanced Export Plugin Entry Point
 * 
 * Registers the advanced export command with the plugin system
 * and provides the main entry point for server communication.
 */

import { AdvancedExportController } from './AdvancedExportController.js';

/**
 * Register advanced export command handler
 */
figma.ui.onmessage = async (msg: any) => {
  if (msg.type === 'advanced_export') {
    try {
      const result = await AdvancedExportController.handleExport(msg.params);
      
      figma.ui.postMessage({
        type: 'advanced_export_result',
        id: msg.id,
        result
      });
    } catch (error) {
      figma.ui.postMessage({
        type: 'advanced_export_error', 
        id: msg.id,
        error: error instanceof Error ? error.message : 'Unknown export error'
      });
    }
  }
};

/**
 * Initialize plugin for advanced export
 */
figma.showUI(__html__, { 
  visible: false, // Hidden UI for MCP communication
  width: 1,
  height: 1
});

// Keep plugin alive
figma.ui.postMessage({ type: 'plugin_ready' });

export { AdvancedExportController };
