/**
 * Fixed JSX Import Handler for Figma MCP Plugin
 * 
 * This fixes the critical issues identified in the JSX round-trip functionality:
 * 1. Properties not being correctly set during import (layoutMode, itemSpacing, padding, fills)
 * 2. Direct property application after createNodeFromJSXAsync
 * 3. Proper font weight and color handling
 */

/**
 * Enhanced JSX Import Handler with direct property application
 * @class
 */
export class JsxImportHandlerFixed {
  /**
   * Main handler for JSX import - applies properties directly after node creation
   */
  static async handle(params) {
    console.log('JsxImportHandlerFixed: handle: Entry point. Received params:', JSON.stringify(params));
    
    try {
      const { jsx, position } = params;
      
      // Transform JSX to Figma format
      const transformedJsx = this.transformJsxNode(jsx);
      console.log('JsxImportHandlerFixed: Transformed JSX:', JSON.stringify(transformedJsx));
      
      // Create Figma JSX element
      const figmaJsxElement = this.convertJsonToFigmaJSX(transformedJsx);
      console.log('JsxImportHandlerFixed: Figma JSX before creation:', JSON.stringify(figmaJsxElement));
      
      // Create node using Figma's API
      const createdNode = await figma.createNodeFromJSXAsync(figmaJsxElement);
      
      // CRITICAL FIX: Apply properties directly after creation
      await this.applyPropertiesDirectly(createdNode, transformedJsx);
      
      // Position the node
      if (position) {
        createdNode.x = position.x || 0;
        createdNode.y = position.y || 0;
      }
      
      // Add to current page and select
      figma.currentPage.appendChild(createdNode);
      figma.currentPage.selection = [createdNode];
      figma.viewport.scrollAndZoomIntoView([createdNode]);
      
      console.log('JsxImportHandlerFixed: Successfully created node with ID:', createdNode.id);
      
      return {
        success: true,
        nodeIds: [createdNode.id],
        message: `Successfully imported JSX structure with 1 nodes`
      };
      
    } catch (error) {
      console.error('JsxImportHandlerFixed: Error during JSX import:', error);
      return {
        success: false,
        error: error.message || String(error)
      };
    }
  }
  
  /**
   * CRITICAL FIX: Apply properties directly to nodes after creation
   * This bypasses the limitations of createNodeFromJSXAsync
   */
  static async applyPropertiesDirectly(node, jsxData) {
    console.log(`JsxImportHandlerFixed: Applying properties directly to node ${node.id}, type: ${node.type}`);
    
    if (node.type === 'FRAME' && jsxData.type === 'AutoLayout') {
      const frameNode = node;
      const props = jsxData.props || {};
      
      // Apply AutoLayout properties directly
      if (props.layoutMode) {
        frameNode.layoutMode = props.layoutMode; // VERTICAL or HORIZONTAL
        console.log(`JsxImportHandlerFixed: Set layoutMode to: ${props.layoutMode}`);
      }
      
      if (props.itemSpacing !== undefined) {
        frameNode.itemSpacing = props.itemSpacing;
        console.log(`JsxImportHandlerFixed: Set itemSpacing to: ${props.itemSpacing}`);
      }
      
      // Apply padding properties
      if (props.paddingTop !== undefined) frameNode.paddingTop = props.paddingTop;
      if (props.paddingRight !== undefined) frameNode.paddingRight = props.paddingRight;
      if (props.paddingBottom !== undefined) frameNode.paddingBottom = props.paddingBottom;
      if (props.paddingLeft !== undefined) frameNode.paddingLeft = props.paddingLeft;
      
      // Apply fills directly
      if (props.fills && Array.isArray(props.fills)) {
        frameNode.fills = props.fills;
        console.log(`JsxImportHandlerFixed: Set fills to: ${JSON.stringify(props.fills)}`);
      }
      
      // Apply stroke properties
      if (props.strokes && Array.isArray(props.strokes)) {
        frameNode.strokes = props.strokes;
      }
      if (props.strokeWeight !== undefined) {
        frameNode.strokeWeight = props.strokeWeight;
      }
      
      // Apply corner radius
      if (props.cornerRadius !== undefined) {
        frameNode.cornerRadius = props.cornerRadius;
      }
      
      // Apply alignment properties
      if (props.primaryAxisAlignItems) {
        frameNode.primaryAxisAlignItems = props.primaryAxisAlignItems;
      }
      if (props.counterAxisAlignItems) {
        frameNode.counterAxisAlignItems = props.counterAxisAlignItems;
      }
    }
    
    // Apply Text properties if it's a Text node
    if (node.type === 'TEXT') {
      const textNode = node;
      const props = jsxData.props || {};
      
      if (props.fontName) {
        await figma.loadFontAsync(props.fontName);
        textNode.fontName = props.fontName;
        console.log(`JsxImportHandlerFixed: Set fontName to: ${JSON.stringify(props.fontName)}`);
      }
      
      if (props.fills && Array.isArray(props.fills)) {
        textNode.fills = props.fills;
        console.log(`JsxImportHandlerFixed: Set text fills to: ${JSON.stringify(props.fills)}`);
      }
      
      if (props.fontSize !== undefined) {
        textNode.fontSize = props.fontSize;
      }
    }
    
    // Recursively apply to children
    if ('children' in node && Array.isArray(node.children) && jsxData.children) {
      const nodeChildren = node.children;
      const jsxChildren = Array.isArray(jsxData.children) ? jsxData.children : [jsxData.children];
      
      for (let i = 0; i < Math.min(nodeChildren.length, jsxChildren.length); i++) {
        if (typeof jsxChildren[i] === 'object') {
          await this.applyPropertiesDirectly(nodeChildren[i], jsxChildren[i]);
        }
      }
    }
  }
  
  /**
   * Transform JSX node with correct property mapping
   */
  static transformJsxNode(jsxNode) {
    if (!jsxNode || typeof jsxNode !== 'object') {
      return jsxNode;
    }
    
    const transformed = { ...jsxNode };
    
    if (transformed.type === 'AutoLayout' && transformed.props) {
      const props = { ...transformed.props };
      
      // CRITICAL FIX: Map direction to layoutMode
      if (props.direction) {
        props.layoutMode = props.direction; // VERTICAL or HORIZONTAL
        delete props.direction;
      }
      
      // CRITICAL FIX: Map spacing to itemSpacing
      if (props.spacing !== undefined) {
        props.itemSpacing = props.spacing;
        delete props.spacing;
      }
      
      // CRITICAL FIX: Map padding to individual padding properties
      if (props.padding !== undefined) {
        if (typeof props.padding === 'number') {
          props.paddingTop = props.padding;
          props.paddingRight = props.padding;
          props.paddingBottom = props.padding;
          props.paddingLeft = props.padding;
        } else if (typeof props.padding === 'object') {
          props.paddingTop = props.padding.top || 0;
          props.paddingRight = props.padding.right || 0;
          props.paddingBottom = props.padding.bottom || 0;
          props.paddingLeft = props.padding.left || 0;
        }
        delete props.padding;
      }
      
      // CRITICAL FIX: Map fill to fills array
      if (props.fill) {
        props.fills = [this.hexToFigmaFill(props.fill)];
        delete props.fill;
      }
      
      // CRITICAL FIX: Map stroke to strokes array
      if (props.stroke) {
        props.strokes = [this.hexToFigmaStroke(props.stroke)];
        delete props.stroke;
      }
      
      transformed.props = props;
    }
    
    // Handle Text nodes
    if (transformed.type === 'Text' && transformed.props) {
      const props = { ...transformed.props };
      
      // CRITICAL FIX: Map font properties
      if (props.fontWeight && props.fontFamily) {
        props.fontName = {
          family: props.fontFamily,
          style: this.mapFontWeightToFigmaStyle(props.fontWeight)
        };
        delete props.fontWeight;
        delete props.fontFamily;
      }
      
      // CRITICAL FIX: Map fill to fills array for text
      if (props.fill) {
        props.fills = [this.hexToFigmaFill(props.fill)];
        delete props.fill;
      }
      
      transformed.props = props;
    }
    
    // Recursively transform children
    if (transformed.children) {
      if (Array.isArray(transformed.children)) {
        transformed.children = transformed.children.map(child => 
          typeof child === 'object' ? this.transformJsxNode(child) : child
        );
      } else if (typeof transformed.children === 'object') {
        transformed.children = this.transformJsxNode(transformed.children);
      }
    }
    
    return transformed;
  }
  
  /**
   * Convert hex color to Figma fill object
   */
  static hexToFigmaFill(hex) {
    const rgb = this.hexToRgb(hex);
    return {
      type: 'SOLID',
      color: { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 },
      opacity: 1
    };
  }
  
  /**
   * Convert hex color to Figma stroke object
   */
  static hexToFigmaStroke(hex) {
    const rgb = this.hexToRgb(hex);
    return {
      type: 'SOLID',
      color: { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 },
      opacity: 1
    };
  }
  
  /**
   * Convert hex to RGB values
   */
  static hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }
  
  /**
   * CRITICAL FIX: Map font weight to Figma style
   */
  static mapFontWeightToFigmaStyle(fontWeight) {
    const weightMap = {
      'thin': 'Thin',
      'extralight': 'ExtraLight',
      'light': 'Light',
      'normal': 'Regular',
      'regular': 'Regular',
      'medium': 'Medium',
      'semibold': 'SemiBold',
      'bold': 'Bold',
      'extrabold': 'ExtraBold',
      'black': 'Black'
    };
    
    return weightMap[fontWeight.toLowerCase()] || 'Regular';
  }
  
  /**
   * Convert JSON to Figma JSX format
   */
  static convertJsonToFigmaJSX(jsonNode) {
    if (!jsonNode || typeof jsonNode !== 'object' || !jsonNode.type) {
      throw new Error('Invalid JSON node structure for JSX conversion.');
    }
    
    const { AutoLayout, Text, Rectangle, Ellipse, Frame, Line, Image } = figma.widget;
    const h = figma.widget.h;
    
    let component;
    switch (jsonNode.type) {
      case 'AutoLayout':
        component = AutoLayout;
        break;
      case 'Text':
        component = Text;
        break;
      case 'Rectangle':
        component = Rectangle;
        break;
      case 'Ellipse':
        component = Ellipse;
        break;
      case 'Frame':
        component = Frame;
        break;
      case 'Line':
        component = Line;
        break;
      case 'Image':
        component = Image;
        break;
      default:
        throw new Error(`Unsupported JSX type: ${jsonNode.type}`);
    }
    
    const props = jsonNode.props || {};
    let children = [];
    
    if (jsonNode.children) {
      if (Array.isArray(jsonNode.children)) {
        children = jsonNode.children.map(child => 
          typeof child === 'string' ? child : this.convertJsonToFigmaJSX(child)
        );
      } else if (typeof jsonNode.children === 'string') {
        children = [jsonNode.children];
      } else {
        children = [this.convertJsonToFigmaJSX(jsonNode.children)];
      }
    }
    
    return h(component, props, ...children);
  }
}