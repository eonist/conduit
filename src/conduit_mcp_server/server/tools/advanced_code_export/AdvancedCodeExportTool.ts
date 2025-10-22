/**
 * Advanced Code Export MCP Tool
 * 
 * Exports vanilla HTML/CSS code from Figma with advanced features including:
 * - getCSSAsync integration for accurate CSS extraction
 * - Design token collection from Variables API
 * - Proper relative positioning (issue #162 compliance)
 * - Schema-based file extraction following get_jsx pattern
 * - Asset export with SVG/PNG support
 */

import { z } from 'zod';
import { sendCommandToFigma } from '../../websocket.js';
import { FileWriter } from '../../../utils/file-writer.js';
import { logger } from '../../../utils/logger.js';

// Schema Definition (following get_jsx pattern)
const AdvancedCodeExportSchema = z.object({
  // Core export options
  output: z.enum(['css', 'html', 'htmlAndCss']).describe('Export format - css only, html only, or both'),
  outputPath: z.string().describe('Output directory path where files will be written'),
  
  // Vanilla-specific options  
  selectorStrategy: z.enum(['id', 'name', 'path', 'bem']).default('bem').describe('CSS selector generation strategy'),
  units: z.enum(['px', 'rem', 'em']).default('px').describe('Unit system for CSS measurements'),
  includeTokens: z.boolean().default(true).describe('Whether to include design tokens from Variables API'),
  
  // Asset options
  vectorStrategy: z.enum(['svg', 'png-fallback']).default('svg').describe('Strategy for exporting vector graphics'),
  
  // File extraction options (like get_jsx)
  writeFiles: z.boolean().default(true).describe('Write files to disk using FileWriter'),
  createDirectories: z.boolean().default(true).describe('Create output directories if they do not exist'),
  overwrite: z.boolean().default(false).describe('Whether to overwrite existing files'),
  
  // Optional node targeting
  nodeId: z.string().optional().describe('Specific node ID to export, uses selection if not provided'),
  
  // Custom naming
  fileNaming: z.object({
    cssFileName: z.string().optional().describe('Custom CSS filename (default: styles.css)'),
    htmlFileName: z.string().optional().describe('Custom HTML filename (default: index.html)'),
    tokensFileName: z.string().optional().describe('Custom tokens filename (default: tokens)')
  }).optional().describe('Custom file naming options')
});

type AdvancedCodeExportArgs = z.infer<typeof AdvancedCodeExportSchema>;

interface ExportResult {
  success: boolean;
  files?: {
    path: string;
    absolutePath: string;
    type: 'css' | 'html' | 'tokens' | 'asset';
    size: number;
    created: boolean;
  }[];
  metadata?: {
    exportTime: number;
    nodeCount: number;
    assetCount: number;
  };
  error?: string;
  warnings?: string[];
}

/**
 * Advanced Code Export Tool Handler
 */
export class AdvancedCodeExportTool {
  static readonly name = 'advanced_code_export';
  static readonly description = 'Export vanilla HTML/CSS code from Figma with advanced features including design tokens, proper positioning, and asset management';
  static readonly schema = AdvancedCodeExportSchema;

  /**
   * Main export handler following MCP tool pattern
   */
  static async handle(args: unknown): Promise<ExportResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      // Validate arguments using schema
      const validatedArgs = AdvancedCodeExportSchema.parse(args);
      logger.info(`Starting advanced code export with format: ${validatedArgs.output}`);

      // Validate output path security
      await this.validateOutputPath(validatedArgs.outputPath);

      // Send command to Figma plugin
      const pluginResult = await this.executePluginCommand(validatedArgs);
      
      if (!pluginResult.success) {
        throw new Error(pluginResult.error || 'Plugin command failed');
      }

      // Write files if requested
      let writtenFiles: any[] = [];
      if (validatedArgs.writeFiles && pluginResult.content) {
        writtenFiles = await this.writeFilesToDisk(validatedArgs, pluginResult.content);
      }

      const exportTime = Date.now() - startTime;
      logger.info(`Advanced code export completed in ${exportTime}ms`);

      return {
        success: true,
        files: writtenFiles,
        metadata: {
          exportTime,
          nodeCount: pluginResult.metadata?.nodeCount || 0,
          assetCount: pluginResult.metadata?.assetCount || 0
        },
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Advanced code export failed: ${errorMessage}`);
      
      return {
        success: false,
        error: errorMessage,
        metadata: {
          exportTime: Date.now() - startTime,
          nodeCount: 0,
          assetCount: 0
        },
        warnings: warnings.length > 0 ? warnings : undefined
      };
    }
  }

  /**
   * Execute plugin command with proper parameter mapping
   */
  private static async executePluginCommand(args: AdvancedCodeExportArgs) {
    const pluginParams = {
      command: 'advanced_code_export',
      nodeId: args.nodeId,
      output: args.output,
      selectorStrategy: args.selectorStrategy,
      units: args.units,
      includeTokens: args.includeTokens,
      vectorStrategy: args.vectorStrategy,
      fileNaming: args.fileNaming
    };

    logger.debug(`Sending plugin command:`, pluginParams);
    
    // Use existing websocket communication
    const result = await sendCommandToFigma('advanced_export', pluginParams, 120000); // 2 minute timeout
    
    return result as any;
  }

  /**
   * Write generated files to disk using FileWriter
   */
  private static async writeFilesToDisk(args: AdvancedCodeExportArgs, content: any) {
    const files: any[] = [];
    
    try {
      // Ensure output directory exists
      if (args.createDirectories) {
        await FileWriter.ensureDirectory(args.outputPath);
      }

      // Write CSS file
      if (content.css && (args.output === 'css' || args.output === 'htmlAndCss')) {
        const cssFileName = args.fileNaming?.cssFileName || 'styles.css';
        const cssPath = `${args.outputPath}/css/${cssFileName}`;
        
        await FileWriter.ensureDirectory(`${args.outputPath}/css`);
        const cssResult = await FileWriter.writeFile(cssPath, content.css, {
          overwrite: args.overwrite,
          encoding: 'utf8'
        });
        
        files.push({
          path: `css/${cssFileName}`,
          absolutePath: cssPath,
          type: 'css' as const,
          size: Buffer.byteLength(content.css, 'utf8'),
          created: cssResult.created || false
        });
      }

      // Write HTML file
      if (content.html && (args.output === 'html' || args.output === 'htmlAndCss')) {
        const htmlFileName = args.fileNaming?.htmlFileName || 'index.html';
        const htmlPath = `${args.outputPath}/html/${htmlFileName}`;
        
        await FileWriter.ensureDirectory(`${args.outputPath}/html`);
        const htmlResult = await FileWriter.writeFile(htmlPath, content.html, {
          overwrite: args.overwrite,
          encoding: 'utf8'
        });
        
        files.push({
          path: `html/${htmlFileName}`,
          absolutePath: htmlPath,
          type: 'html' as const,
          size: Buffer.byteLength(content.html, 'utf8'),
          created: htmlResult.created || false
        });
      }

      // Write token files
      if (content.tokens && args.includeTokens) {
        const tokensBaseName = args.fileNaming?.tokensFileName || 'tokens';
        
        await FileWriter.ensureDirectory(`${args.outputPath}/tokens`);
        
        // Write CSS tokens
        if (content.tokens.css) {
          const tokensCssPath = `${args.outputPath}/tokens/${tokensBaseName}.css`;
          const tokensCssResult = await FileWriter.writeFile(tokensCssPath, content.tokens.css, {
            overwrite: args.overwrite,
            encoding: 'utf8'
          });
          
          files.push({
            path: `tokens/${tokensBaseName}.css`,
            absolutePath: tokensCssPath,
            type: 'tokens' as const,
            size: Buffer.byteLength(content.tokens.css, 'utf8'),
            created: tokensCssResult.created || false
          });
        }

        // Write JSON tokens
        if (content.tokens.json) {
          const tokensJsonPath = `${args.outputPath}/tokens/${tokensBaseName}.json`;
          const tokensJsonResult = await FileWriter.writeFile(tokensJsonPath, content.tokens.json, {
            overwrite: args.overwrite,
            encoding: 'utf8'
          });
          
          files.push({
            path: `tokens/${tokensBaseName}.json`,
            absolutePath: tokensJsonPath,
            type: 'tokens' as const,
            size: Buffer.byteLength(content.tokens.json, 'utf8'),
            created: tokensJsonResult.created || false
          });
        }
      }

      // Write assets
      if (content.assets && Array.isArray(content.assets)) {
        await FileWriter.ensureDirectory(`${args.outputPath}/assets`);
        
        for (const asset of content.assets) {
          const assetPath = `${args.outputPath}/assets/${asset.name}`;
          const assetBuffer = Buffer.from(asset.data, 'base64');
          
          const assetResult = await FileWriter.writeFile(assetPath, assetBuffer, {
            overwrite: args.overwrite,
            encoding: 'binary'
          });
          
          files.push({
            path: `assets/${asset.name}`,
            absolutePath: assetPath,
            type: 'asset' as const,
            size: assetBuffer.length,
            created: assetResult.created || false
          });
        }
      }

      return files;
      
    } catch (error) {
      logger.error(`File writing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`Failed to write files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate output path for security
   */
  private static async validateOutputPath(outputPath: string) {
    if (!outputPath || typeof outputPath !== 'string') {
      throw new Error('Output path must be a non-empty string');
    }

    // Basic path traversal protection
    if (outputPath.includes('..') || outputPath.includes('~')) {
      throw new Error('Output path contains potentially dangerous characters');
    }

    // Ensure path is within reasonable bounds
    if (outputPath.length > 260) {
      throw new Error('Output path is too long');
    }
  }
}
