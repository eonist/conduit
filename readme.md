⚠️️ This project has been moved here: ⚠️️ [https://github.com/conduit-design](https://github.com/conduit-design)

[![version](https://img.shields.io/badge/version-0.9.8-blue.svg)](https://github.com/eonist/conduit/releases) [![Publish Package to npm](https://github.com/eonist/conduit/actions/workflows/publish.yml/badge.svg)](https://github.com/eonist/conduit/actions/workflows/publish.yml) ![License](https://img.shields.io/badge/license-MIT-green)

<img width="100" alt="img" src="logo.svg">

### Conduit

> Design at the speed of thought

https://github.com/user-attachments/assets/27fb8080-a4f6-46d4-a016-60ba3f0208e8

### What is MCP?

Model Context Protocol (MCP) is the framework that allows an AI agent to communicate with external applications. This implementation enables any AI agent to send commands to and receive information from Figma in real-time.

## How it works

```
+------------+     +-----+     +------------------------+     +--------------+
| AI Agent   | <-> | MCP | <-> | Local WebSocket Server | <-> | Figma Plugin |
+------------+     +-----+     +------------------------+     +--------------+

```

## Table of Contents

- [Features](#features)
- [Compatibility](#compatibility)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Step 1: Install the server and plugin](#step-1-install-the-server-and-plugin)
  - [Step 2: Install the Figma Plugin](#step-2-install-the-figma-plugin)
  - [Step 3: Configure Agent](#step-3-configure-agent)
- [Quick Example](#quick-example)
- [Docs](#docs)
- [Troubleshooting](#troubleshooting)
- [Testing](#testing)
- [Contributions](#contributions)
- [License](#license)
- [Authors](#authors)
- [Acknowledgments](#acknowledgments)

### Features:

- ✍️ **Text manipulation** – Add, edit, and style text elements, including advanced controls for font, size, weight, case, decoration, spacing, and paragraph/line height.
- 🎨 **Gradient & color support** – Create and apply solid colors, gradients, and color variables (design tokens) to any element.
- 🔤 **Font support** – Access and apply a diverse range of fonts, including bulk font operations.
- 📐 **AutoLayout** – Automatically create responsive and adaptive layouts, including hug/fill sizing and all Figma auto-layout properties.
- ⚙️ **Batch operations** – Perform actions on multiple Figma elements simultaneously for efficient workflows.
- 🔷 **Geometric shapes** – Generate rectangles, circles, ellipses, polygons, lines, and star shapes.
- 🌀 **Vector & SVG support** – Create, insert, and manipulate vector shapes and SVG graphics.
- 🖼️ **Image support** – Import, export, and manage raster images within Figma designs.
- 🗂️ **Frame, Group, Component** – Structure designs with frames, groups, reusable components, and component instances.
- 🧩 **Component variants & properties** – Create, manage, and organize component variants and their properties.
- 🏷️ **Rename layers** – Programmatically rename layers, including AI-powered renaming.
- 📄 **Page management** – Create, duplicate, and set the current page in your Figma document.
- 🔄 **Node management** – Clone, delete, lock/unlock, show/hide, insert, flatten, reorder, move, and resize nodes.
- ✂️ **Boolean operations** – Union, subtract, intersect, and exclude shapes for complex vector editing.
- 📏 **Grids, guides, and constraints** – Create and manage layout grids, guides, and responsive constraints.
- ✨ **Effect styles** – Create, set, and apply effect styles (drop shadow, blur, etc.).
- 🧬 **Figma Variables (Design Tokens)** – Create, update, delete, and apply variables for color, number, string, and boolean; switch between variable modes (e.g., light/dark theme).
- 💾 **Export & code generation** – Export nodes as images (PNG, JPG, SVG, PDF), generate HTML structure, and extract CSS from Figma nodes.
- 📝 **Annotation support** – Get, set, update, and delete annotations on nodes.
- 🔔 **Event subscription** – Subscribe and unsubscribe to Figma events (e.g., selection change, document change). This essentially allows turn-by-turn multi-agent collaboration.

### Compatibility

- VSCode w/ GitHub Copilot agent (Sonnet 4.0) (50 free Sonnet 3.5 requests per month)
- VSCode w/ Cline (Multiple LLM's available, Gemini has $300 free credits)
- Claude Desktop Application (Sonnet 4.0)
- Cursor agent (Sonnet 4.0 / GPT 4.1 / Gemini 2.5 pro)

## Prerequisites

- macOS/Linux:  
```bash
curl -fsSL https://bun.sh/install | bash
```
- Windows:  
```powershell
irm bun.sh/install.ps1 | iex
```

## Installation

### Step 1: Install the server and plugin

1. Clone this repository:
   ```bash
   git clone https://github.com/eonist/conduit.git
   ```
2. Terminal: `cd path-to-conduit`  
3. Terminal: `npm install` -> Builds dependencies  
4. Terminal: `bun run build:all` -> Builds the Server and Plugin  
5. Terminal: `bun socket` -> Starts the Server   

<img width="286" alt="img" src="https://s14.gifyu.com/images/bsAnX.gif">

### Step 2: Install the Figma Plugin

1. Open Figma Desktop App
2. Go to `Plugins > Development > Import plugin from manifest...`
3. Navigate to conduit folder and select `conduit/src/plugin/manifest.json`
4. Start Figma plugin: Plugin -> Development -> Conduit
   
### Step 3: Configure Agent

1. Open Agent App (GitHub Copilot Agent, Cline, Cursor, Claude desktop)
2. Find MCP settings in your agent app of choice. `~/.app-name/mcp.json`
3. Add a new MCP connection with this config:   
```yaml
{
  "mcpServers": {
    "ConduitMCPServer": {
      "command": "bunx",
      "args": ["conduit-design@latest"]
    }
  }
}
```
4. AI Agent app: Ensure MCP “Conduit” is enabled.  
5. AI Agent app: "Talk to Figma on channel: (unique channel id copied from plugin)"  


### Quick Example

```
User: Talk to figma on channel "xxxxxxx"
Agent: Connecting to Figma. Connected on channel "xxxxxxxx"
User: "Create a responsive navigation bar with our brand color #3366FF and add 5 menu items"
Agent: [executes commands in Figma and displays the results]
```

### Docs:
- [Available_MCP_Commands.md](https://github.com/eonist/conduit/blob/main/Available_MCP_Commands.md) 
- [Server doc](https://github.com/eonist/conduit/blob/main/src/conduit_mcp_server/README.md)
- [Plugin doc](https://github.com/eonist/conduit/blob/main/src/conduit_mcp_plugin/README.md)

## Troubleshooting

- **Connection Error:** Ensure the WebSocket server is running (`bun socket`).  
- **Plugin Not Appearing:** Verify the plugin import in Figma Development settings.  
- **Execution or Font Loading Errors:** Check Figma’s development console for details.  

> [!TIP]
> In VSCode command pallet: `> Reload Window` this restarts cline and refreshes your MCP servers (To get new updates)

## Testing

To run integration tests:
```bash
bun run test
```
See [TESTING.md](TESTING.md) for more details.

> [!NOTE]
> There is also Unit-tests in the `/tests/` path

## Contributions

1. Fork the repository.  
2. Create a branch (e.g., `feature/amazing-feature`).  
3. Commit your changes.  
4. Push to your branch.  
5. Open a Pull Request.  

See MCP protocol design best pratice: https://gist.github.com/eonist/eb8d5628aad07fc57ce339e518158c20

## License

MIT License – see the [LICENSE](LICENSE) file for details.
 
## Authors

- **Sonny Lazuardi** – Original implementation | [GitHub](https://github.com/sonnylazuardi)  
- **Xúlio Zé** – Adaptation for Claude | [GitHub](https://github.com/arinspunk)  
- **André J** – Adoption for any agent with new features | [GitHub](https://github.com/eonist)

## Acknowledgments

- Anthropic team for Claude and the Model Context Protocol.  
- Figma community for their excellent plugin API.  
- Sonny Lazuardi for the original implementation.  
- Bun team for providing a fast JavaScript runtime.
