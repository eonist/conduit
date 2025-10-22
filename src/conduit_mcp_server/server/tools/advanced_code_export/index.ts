/**
 * Advanced Code Export Tool Registry
 * 
 * Registers the advanced code export tool with the MCP server
 * following the existing tool registration pattern.
 */

import { AdvancedCodeExportTool } from './AdvancedCodeExportTool.js';

/**
 * Register advanced code export tool with MCP server
 */
export function registerAdvancedCodeExportTool(server: any) {
  server.setRequestHandler('tools/call', async (request: any) => {
    const { name, arguments: args } = request.params;
    
    if (name === AdvancedCodeExportTool.name) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(await AdvancedCodeExportTool.handle(args), null, 2)
          }
        ]
      };
    }
    
    // Let other tools handle their requests
    return null;
  });
  
  // Register tool in tools list
  server.setRequestHandler('tools/list', async () => {
    return {
      tools: [
        {
          name: AdvancedCodeExportTool.name,
          description: AdvancedCodeExportTool.description,
          inputSchema: AdvancedCodeExportTool.schema._def
        }
      ]
    };
  });
}

export { AdvancedCodeExportTool };
