/**
 * Advanced Export Controller - Plugin Side
 * 
 * Handles plugin-side orchestration for advanced code export:
 * - getCSSAsync integration for accurate CSS extraction
 * - Position normalization for issue #162 compliance 
 * - Design token collection from Variables API
 * - Asset export with SVG preference
 * - Semantic HTML structure generation
 */

interface AdvancedExportParams {
  nodeId?: string;
  output: 'css' | 'html' | 'htmlAndCss';
  selectorStrategy: 'id' | 'name' | 'path' | 'bem';
  units: 'px' | 'rem' | 'em';
  includeTokens: boolean;
  vectorStrategy: 'svg' | 'png-fallback';
  fileNaming?: {
    cssFileName?: string;
    htmlFileName?: string;
    tokensFileName?: string;
  };
}

interface ExportContent {
  css?: string;
  html?: string;
  tokens?: {
    css: string;
    json: string;
  };
  assets?: {
    id: string;
    name: string;
    type: string;
    data: string; // base64
    mimeType: string;
  }[];
}

interface ExportResult {
  success: boolean;
  content?: ExportContent;
  metadata?: {
    exportTime: number;
    nodeCount: number;
    assetCount: number;
  };
  error?: string;
  warnings?: string[];
}

/**
 * Main controller for advanced export operations
 */
export class AdvancedExportController {
  private static warnings: string[] = [];

  /**
   * Main export handler called from plugin
   */
  static async handleExport(params: AdvancedExportParams): Promise<ExportResult> {
    const startTime = Date.now();
    this.warnings = [];

    try {
      // Get target nodes
      const nodes = await this.getTargetNodes(params.nodeId);
      if (nodes.length === 0) {
        throw new Error('No nodes found to export. Please select some elements or provide a valid nodeId.');
      }

      // Initialize extractors
      const cssExtractor = new CSSExtractor();
      const htmlBuilder = new HTMLBuilder();
      const tokenCollector = new TokenCollector();
      const assetExporter = new AssetExporter();

      // Extract content based on output format
      const content: ExportContent = {};
      
      if (params.output === 'css' || params.output === 'htmlAndCss') {
        content.css = await cssExtractor.extractCSS(nodes, params);
      }
      
      if (params.output === 'html' || params.output === 'htmlAndCss') {
        content.html = await htmlBuilder.buildHTML(nodes, params);
      }
      
      if (params.includeTokens) {
        content.tokens = await tokenCollector.collectTokens();
      }
      
      // Export assets
      content.assets = await assetExporter.exportAssets(nodes, params.vectorStrategy);

      const exportTime = Date.now() - startTime;
      
      return {
        success: true,
        content,
        metadata: {
          exportTime,
          nodeCount: nodes.length,
          assetCount: content.assets?.length || 0
        },
        warnings: this.warnings.length > 0 ? this.warnings : undefined
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown export error',
        metadata: {
          exportTime: Date.now() - startTime,
          nodeCount: 0,
          assetCount: 0
        },
        warnings: this.warnings.length > 0 ? this.warnings : undefined
      };
    }
  }

  /**
   * Get nodes to export (selection or specific node)
   */
  private static async getTargetNodes(nodeId?: string): Promise<SceneNode[]> {
    if (nodeId) {
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) {
        throw new Error(`Node with ID ${nodeId} not found`);
      }
      if (!('children' in node) && !this.isSceneNode(node)) {
        throw new Error('Target node must be a scene node');
      }
      return [node as SceneNode];
    }

    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      throw new Error('No nodes selected and no nodeId provided');
    }

    return selection;
  }

  /**
   * Type guard for scene nodes
   */
  private static isSceneNode(node: BaseNode): node is SceneNode {
    return 'x' in node && 'y' in node;
  }

  /**
   * Add warning message
   */
  static addWarning(message: string) {
    this.warnings.push(message);
  }
}

/**
 * CSS Extractor using getCSSAsync
 */
class CSSExtractor {
  async extractCSS(nodes: SceneNode[], params: AdvancedExportParams): Promise<string> {
    const cssRules: string[] = [];
    const processedNodes = new Set<string>();

    for (const node of nodes) {
      await this.processNode(node, cssRules, processedNodes, params, null);
    }

    return this.formatCSS(cssRules);
  }

  private async processNode(
    node: SceneNode, 
    cssRules: string[], 
    processedNodes: Set<string>,
    params: AdvancedExportParams,
    parent: SceneNode | null
  ) {
    if (processedNodes.has(node.id)) return;
    processedNodes.add(node.id);

    try {
      // Extract CSS using getCSSAsync when available
      let css: Record<string, string> = {};
      
      if ('getCSSAsync' in node && typeof node.getCSSAsync === 'function') {
        css = await node.getCSSAsync();
      } else {
        // Fallback for unsupported nodes
        css = this.fallbackCSSExtraction(node);
      }

      // Apply position normalization (Issue #162)
      css = this.normalizePositioning(css, node, parent);

      // Generate selector
      const selector = this.generateSelector(node, params.selectorStrategy);
      
      // Convert units if needed
      if (params.units !== 'px') {
        css = this.convertUnits(css, params.units);
      }

      // Format CSS rule
      if (Object.keys(css).length > 0) {
        cssRules.push(this.formatCSSRule(selector, css));
      }

      // Process children
      if ('children' in node) {
        for (const child of node.children) {
          if (this.isSceneNode(child)) {
            await this.processNode(child, cssRules, processedNodes, params, node);
          }
        }
      }

    } catch (error) {
      AdvancedExportController.addWarning(`Failed to process node ${node.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Critical: Position normalization to prevent offset corruption (Issue #162)
   */
  private normalizePositioning(css: Record<string, string>, node: SceneNode, parent: SceneNode | null): Record<string, string> {
    if (!parent) return css;

    // CRITICAL: Ensure children use relative positioning
    // If parent is at x:800, child at x:0 stays x:0 (not x:800)
    const normalizedCSS = { ...css };
    
    if ('left' in normalizedCSS || 'top' in normalizedCSS) {
      const nodeX = node.x;
      const nodeY = node.y;
      const parentX = parent.x;
      const parentY = parent.y;
      
      // Calculate relative position
      const relativeX = nodeX - parentX;
      const relativeY = nodeY - parentY;
      
      // Update positioning to be relative
      if (relativeX !== 0) {
        normalizedCSS.left = `${relativeX}px`;
      }
      if (relativeY !== 0) {
        normalizedCSS.top = `${relativeY}px`;
      }
    }

    return normalizedCSS;
  }

  private fallbackCSSExtraction(node: SceneNode): Record<string, string> {
    const css: Record<string, string> = {};
    
    // Basic positioning
    css.position = 'absolute';
    css.left = `${node.x}px`;
    css.top = `${node.y}px`;
    
    // Dimensions
    if ('width' in node && 'height' in node) {
      css.width = `${node.width}px`;
      css.height = `${node.height}px`;
    }
    
    return css;
  }

  private generateSelector(node: SceneNode, strategy: string): string {
    switch (strategy) {
      case 'id':
        return `#${this.sanitizeName(node.id)}`;
      case 'name':
        return `.${this.sanitizeName(node.name || 'unnamed')}`;
      case 'bem':
        return `.${this.generateBEMSelector(node)}`;
      case 'path':
        return `.${this.generatePathSelector(node)}`;
      default:
        return `.${this.sanitizeName(node.name || 'unnamed')}`;
    }
  }

  private generateBEMSelector(node: SceneNode): string {
    const name = this.sanitizeName(node.name || 'block');
    // Simple BEM: block__element
    return name.toLowerCase().replace(/\s+/g, '-');
  }

  private generatePathSelector(node: SceneNode): string {
    // Generate hierarchical path selector
    const parts: string[] = [];
    let current: BaseNode | null = node;
    
    while (current && current.type !== 'PAGE') {
      if ('name' in current && current.name) {
        parts.unshift(this.sanitizeName(current.name));
      }
      current = current.parent;
    }
    
    return parts.join('-').toLowerCase();
  }

  private sanitizeName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-')
      .toLowerCase();
  }

  private convertUnits(css: Record<string, string>, targetUnit: string): Record<string, string> {
    const converted = { ...css };
    const pxRegex = /(\d+(?:\.\d+)?)px/g;
    
    for (const [key, value] of Object.entries(converted)) {
      if (typeof value === 'string' && value.includes('px')) {
        converted[key] = value.replace(pxRegex, (match, px) => {
          const num = parseFloat(px);
          if (targetUnit === 'rem') {
            return `${(num / 16).toFixed(3)}rem`; // Assuming 16px base
          } else if (targetUnit === 'em') {
            return `${(num / 16).toFixed(3)}em`;
          }
          return match;
        });
      }
    }
    
    return converted;
  }

  private formatCSSRule(selector: string, css: Record<string, string>): string {
    const declarations = Object.entries(css)
      .map(([property, value]) => `  ${this.camelToKebab(property)}: ${value};`)
      .join('\n');
      
    return `${selector} {\n${declarations}\n}`;
  }

  private camelToKebab(str: string): string {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  private formatCSS(rules: string[]): string {
    return `/* Generated CSS from Figma via getCSSAsync */\n\n${rules.join('\n\n')}`;
  }

  private isSceneNode(node: BaseNode): node is SceneNode {
    return 'x' in node && 'y' in node;
  }
}

/**
 * HTML Builder for semantic structure
 */
class HTMLBuilder {
  async buildHTML(nodes: SceneNode[], params: AdvancedExportParams): Promise<string> {
    const bodyContent = await this.generateBodyContent(nodes, params);
    
    return this.wrapInHTMLDocument(bodyContent, params);
  }

  private async generateBodyContent(nodes: SceneNode[], params: AdvancedExportParams): Promise<string> {
    const elements: string[] = [];
    
    for (const node of nodes) {
      elements.push(await this.generateElementHTML(node, params));
    }
    
    return elements.join('\n');
  }

  private async generateElementHTML(node: SceneNode, params: AdvancedExportParams): Promise<string> {
    const selector = this.generateSelector(node, params.selectorStrategy);
    const className = selector.replace(/^[.#]/, '');
    
    // Determine semantic tag
    const tag = this.getSemanticTag(node);
    
    // Generate content
    let content = '';
    if (node.type === 'TEXT') {
      content = await this.generateTextContent(node as TextNode);
    } else if ('children' in node) {
      // Process children
      const childElements: string[] = [];
      for (const child of node.children) {
        if (this.isSceneNode(child)) {
          childElements.push(await this.generateElementHTML(child, params));
        }
      }
      content = childElements.join('\n    ');
    }
    
    if (content) {
      return `  <${tag} class="${className}">${content}</${tag}>`;
    } else {
      return `  <${tag} class="${className}"></${tag}>`;
    }
  }

  private getSemanticTag(node: SceneNode): string {
    switch (node.type) {
      case 'TEXT':
        const textNode = node as TextNode;
        if (textNode.fontSize > 24) return 'h1';
        if (textNode.fontSize > 20) return 'h2';
        if (textNode.fontSize > 18) return 'h3';
        return 'p';
      case 'FRAME':
      case 'COMPONENT':
      case 'INSTANCE':
        return 'div';
      case 'RECTANGLE':
      case 'ELLIPSE':
        return 'div';
      default:
        return 'div';
    }
  }

  private async generateTextContent(textNode: TextNode): Promise<string> {
    try {
      // Use getStyledTextSegments for rich text if available
      if ('getStyledTextSegments' in textNode) {
        const segments = await textNode.getStyledTextSegments(['fills', 'fontWeight', 'fontSize']);
        return this.processTextSegments(segments);
      }
    } catch (error) {
      AdvancedExportController.addWarning(`Could not process styled text segments for ${textNode.name}`);
    }
    
    // Fallback to plain text
    return textNode.characters || '';
  }

  private processTextSegments(segments: any[]): string {
    return segments.map(segment => {
      const text = segment.characters;
      
      // Apply formatting based on segment properties
      if (segment.fontWeight && segment.fontWeight > 600) {
        return `<strong>${text}</strong>`;
      }
      
      return text;
    }).join('');
  }

  private generateSelector(node: SceneNode, strategy: string): string {
    // Reuse logic from CSSExtractor
    const cssExtractor = new (CSSExtractor as any)();
    return cssExtractor.generateSelector(node, strategy);
  }

  private wrapInHTMLDocument(bodyContent: string, params: AdvancedExportParams): string {
    const cssLink = params.output === 'htmlAndCss' ? 
      '    <link rel="stylesheet" href="../css/styles.css">' : '';
    const tokensLink = params.includeTokens ? 
      '    <link rel="stylesheet" href="../tokens/tokens.css">' : '';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Figma Export</title>
${cssLink}
${tokensLink}
</head>
<body>
${bodyContent}
</body>
</html>`;
  }

  private isSceneNode(node: BaseNode): node is SceneNode {
    return 'x' in node && 'y' in node;
  }
}

/**
 * Token Collector for design tokens from Variables API
 */
class TokenCollector {
  async collectTokens(): Promise<{ css: string; json: string }> {
    try {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const tokens: Record<string, any> = {};
      
      for (const collection of collections) {
        const variables = await figma.variables.getVariablesInCollectionAsync(collection.id);
        
        for (const variable of variables) {
          tokens[variable.name] = this.processVariable(variable);
        }
      }
      
      return {
        css: this.generateTokensCSS(tokens),
        json: JSON.stringify(tokens, null, 2)
      };
    } catch (error) {
      AdvancedExportController.addWarning('Could not collect design tokens - Variables API may not be available');
      return {
        css: '/* No design tokens available */',
        json: '{}'
      };
    }
  }

  private processVariable(variable: Variable): any {
    const modes: Record<string, any> = {};
    
    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
      modes[modeId] = this.processVariableValue(value);
    }
    
    return {
      name: variable.name,
      type: variable.resolvedType,
      modes,
      scopes: variable.scopes
    };
  }

  private processVariableValue(value: any): any {
    if (typeof value === 'object' && value !== null) {
      if ('r' in value && 'g' in value && 'b' in value) {
        // Color value
        const r = Math.round(value.r * 255);
        const g = Math.round(value.g * 255);
        const b = Math.round(value.b * 255);
        const a = value.a !== undefined ? value.a : 1;
        
        if (a === 1) {
          return `rgb(${r}, ${g}, ${b})`;
        } else {
          return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
      }
    }
    
    return value;
  }

  private generateTokensCSS(tokens: Record<string, any>): string {
    const cssVars: string[] = [];
    
    for (const [name, token] of Object.entries(tokens)) {
      const varName = this.tokenNameToCSS(name);
      
      // Use first mode value for CSS
      const modeIds = Object.keys(token.modes);
      if (modeIds.length > 0) {
        const value = token.modes[modeIds[0]];
        cssVars.push(`  --${varName}: ${value};`);
      }
    }
    
    return `:root {\n${cssVars.join('\n')}\n}`;
  }

  private tokenNameToCSS(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

/**
 * Asset Exporter for SVG/PNG assets
 */
class AssetExporter {
  async exportAssets(nodes: SceneNode[], strategy: 'svg' | 'png-fallback'): Promise<any[]> {
    const assets: any[] = [];
    const processedNodes = new Set<string>();
    
    for (const node of nodes) {
      await this.processNodeAssets(node, assets, processedNodes, strategy);
    }
    
    return assets;
  }

  private async processNodeAssets(
    node: SceneNode,
    assets: any[],
    processedNodes: Set<string>,
    strategy: 'svg' | 'png-fallback'
  ) {
    if (processedNodes.has(node.id)) return;
    processedNodes.add(node.id);
    
    // Check if node should be exported as asset
    if (this.shouldExportAsAsset(node)) {
      try {
        const asset = await this.exportSingleAsset(node, strategy);
        if (asset) assets.push(asset);
      } catch (error) {
        AdvancedExportController.addWarning(`Failed to export asset for ${node.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    // Process children
    if ('children' in node) {
      for (const child of node.children) {
        if (this.isSceneNode(child)) {
          await this.processNodeAssets(child, assets, processedNodes, strategy);
        }
      }
    }
  }

  private shouldExportAsAsset(node: SceneNode): boolean {
    // Export images, vectors, and complex shapes
    return (
      node.type === 'RECTANGLE' && this.hasImageFills(node) ||
      node.type === 'ELLIPSE' && this.hasImageFills(node) ||
      node.type === 'VECTOR' ||
      node.type === 'STAR' ||
      node.type === 'POLYGON'
    );
  }

  private hasImageFills(node: any): boolean {
    if (!node.fills || !Array.isArray(node.fills)) return false;
    
    return node.fills.some((fill: any) => fill.type === 'IMAGE');
  }

  private async exportSingleAsset(node: SceneNode, strategy: 'svg' | 'png-fallback'): Promise<any | null> {
    const sanitizedName = this.sanitizeFileName(node.name || `asset-${node.id}`);
    
    try {
      if (strategy === 'svg' && this.canExportAsSVG(node)) {
        // Try SVG export first
        const svgBytes = await node.exportAsync({ format: 'SVG' });
        const svgString = new TextDecoder().decode(svgBytes);
        
        return {
          id: node.id,
          name: `${sanitizedName}.svg`,
          type: 'svg',
          data: Buffer.from(svgString).toString('base64'),
          mimeType: 'image/svg+xml'
        };
      }
    } catch (error) {
      AdvancedExportController.addWarning(`SVG export failed for ${node.name}, falling back to PNG`);
    }
    
    // Fallback to PNG
    try {
      const pngBytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
      
      return {
        id: node.id,
        name: `${sanitizedName}.png`,
        type: 'png',
        data: Buffer.from(pngBytes).toString('base64'),
        mimeType: 'image/png'
      };
    } catch (error) {
      AdvancedExportController.addWarning(`Asset export failed for ${node.name}`);
      return null;
    }
  }

  private canExportAsSVG(node: SceneNode): boolean {
    // SVG works well for vectors and simple shapes
    return (
      node.type === 'VECTOR' ||
      node.type === 'STAR' ||
      node.type === 'POLYGON' ||
      (node.type === 'RECTANGLE' && !this.hasImageFills(node)) ||
      (node.type === 'ELLIPSE' && !this.hasImageFills(node))
    );
  }

  private sanitizeFileName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9-_.]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  private isSceneNode(node: BaseNode): node is SceneNode {
    return 'x' in node && 'y' in node;
  }
}
