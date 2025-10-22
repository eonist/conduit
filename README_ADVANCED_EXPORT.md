# Advanced Code Export Tool

A comprehensive vanilla HTML/CSS export tool for Figma that generates production-ready code with proper positioning, design tokens, and asset management.

## Features

### ✅ **Vanilla HTML/CSS Output**
- Clean semantic HTML5 structure
- Production-ready CSS with organized selectors
- No framework dependencies - pure web standards

### ✅ **getCSSAsync Integration** 
- Direct CSS extraction from Figma's inspection engine
- Auto Layout → Flexbox conversion
- Variables API integration for design tokens

### ✅ **Position Accuracy (Issue #162 Compliant)**
- Proper relative positioning to prevent child offset corruption
- Built-in validation against global positioning errors
- Maintains parent-child relationships correctly

### ✅ **Design System Support**
- CSS custom properties from Figma Variables
- Separate token files for maintainability 
- Multi-mode theme support ready

### ✅ **Asset Management**
- SVG export for true vectors
- PNG fallback for complex image-filled shapes
- Organized asset folder structure

## Usage

### MCP Command

```bash
# CSS only export
advanced_code_export --output "css" --outputPath "./export" --selectorStrategy "bem" --units "rem"

# Full HTML + CSS export with tokens
advanced_code_export --output "htmlAndCss" --outputPath "./export" --includeTokens true --writeFiles true

# Custom naming
advanced_code_export --output "htmlAndCss" --outputPath "./my-export" --fileNaming '{"cssFileName": "main.css", "htmlFileName": "page.html"}'
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `output` | `css` \| `html` \| `htmlAndCss` | - | Export format |
| `outputPath` | `string` | - | Directory path for output files |
| `selectorStrategy` | `id` \| `name` \| `path` \| `bem` | `bem` | CSS selector generation |
| `units` | `px` \| `rem` \| `em` | `px` | Unit system for measurements |
| `includeTokens` | `boolean` | `true` | Include design tokens |
| `vectorStrategy` | `svg` \| `png-fallback` | `svg` | Vector export strategy |
| `writeFiles` | `boolean` | `true` | Write files to disk |
| `overwrite` | `boolean` | `false` | Overwrite existing files |
| `nodeId` | `string` | - | Specific node ID (uses selection if not provided) |

## Output Structure

```
output/
├── css/
│   └── styles.css           # Main stylesheet
├── html/
│   └── index.html          # Semantic HTML structure  
├── tokens/
│   ├── tokens.css          # CSS custom properties
│   └── tokens.json         # Raw token data
└── assets/
    ├── *.svg               # Vector exports
    └── *.png               # Raster fallbacks
```

## Example Output

### Generated CSS (`css/styles.css`)

```css
/* Generated CSS from Figma via getCSSAsync */

.product-card {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-md);
  gap: var(--spacing-sm);
  background-color: var(--surface-primary);
  border-radius: var(--radius-lg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.product-card__title {
  font-family: var(--font-family-primary);
  font-size: var(--font-size-heading);
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.product-card__price {
  font-size: var(--font-size-price);
  font-weight: 600;
  color: var(--text-accent);
}
```

### Generated HTML (`html/index.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Figma Export</title>
    <link rel="stylesheet" href="../css/styles.css">
    <link rel="stylesheet" href="../tokens/tokens.css">
</head>
<body>
  <div class="product-card">
    <h2 class="product-card__title">iPhone 15 Pro</h2>
    <div class="product-card__price">$999</div>
    <div class="product-card__image-container">
      <img src="../assets/product-image.svg" alt="Product image">
    </div>
  </div>
</body>
</html>
```

### Design Tokens (`tokens/tokens.css`)

```css
:root {
  /* Design tokens from Figma Variables */
  --surface-primary: #ffffff;
  --text-primary: #1a1a1a; 
  --text-accent: #007aff;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --radius-lg: 8px;
  --font-family-primary: "SF Pro Display", sans-serif;
  --font-size-heading: 20px;
  --font-size-price: 24px;
}
```

## Architecture

### Plugin Side (`src/conduit_mcp_plugin/src/tools/advanced_export/`)
- **AdvancedExportController.ts** - Main orchestration
- **CSSExtractor** - getCSSAsync integration with position normalization
- **HTMLBuilder** - Semantic HTML structure generation
- **TokenCollector** - Variables API integration
- **AssetExporter** - SVG/PNG asset export

### Server Side (`src/conduit_mcp_server/server/tools/advanced_code_export/`)
- **AdvancedCodeExportTool.ts** - MCP tool with schema validation
- **FileWriter integration** - Secure file operations
- **Schema validation** - Zod-based input validation

## Key Technical Features

### Position Normalization (Issue #162)
Prevents child offset corruption by ensuring relative positioning:

```typescript
// BEFORE (incorrect - corrupts design)
container: { x: 800, y: 200 }
child: { x: 850, y: 220 }  // Wrong! Inherits parent offset

// AFTER (correct - relative positioning) 
container: { x: 800, y: 200 }
child: { x: 50, y: 20 }    // Relative to parent (850-800, 220-200)
```

### getCSSAsync Integration
- Direct extraction from Figma's CSS engine
- Auto Layout → Flexbox mapping
- Variable resolution to CSS custom properties
- Fallback extraction for unsupported nodes

### BEM Selector Strategy
Generates maintainable CSS selectors:
- `.block` for top-level components
- `.block__element` for child elements  
- Sanitized names with collision handling

## Future Enhancements

- **Framework Support**: React, Tailwind, Vue (separate tools)
- **Responsive Breakpoints**: Mobile-first responsive generation
- **SCSS Support**: Enhanced token integration
- **Component Detection**: Automatic component isolation
- **Batch Processing**: Multiple document export

## Integration

This tool integrates with your existing MCP infrastructure:
- Uses `FileWriter.ts` for secure file operations
- Follows `get_jsx` pattern for schema-based extraction
- Leverages existing websocket communication
- Maintains compatibility with current tool ecosystem

---

**Ready for production use** - generates clean, maintainable code that developers can immediately use in web projects.
