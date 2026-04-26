# Configuration Examples

Drop-in configuration files for using the Adaptive Reasoning Server with every major MCP client. Copy the relevant file to the path listed in the matrix below, replace `MEMORY_PATH` with your project root, and restart the client.

## Install variants

You can launch the server three ways. Pick one based on how much control you want over the version. Side-by-side reference: [`install-variants.json`](install-variants.json).

### 1. npx (no install, recommended)

Zero install. The first run pulls the package via `npx`; subsequent runs are cached by npm. The `-y` flag keeps `npx` non-interactive when the client spawns it.

```json
{
  "mcpServers": {
    "adaptive-reasoning": {
      "command": "npx",
      "args": ["-y", "@prism.enterprises/adaptive-reasoning-server"],
      "env": {
        "MEMORY_PATH": "/absolute/path/to/your/project",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### 2. Global install (faster startup, pinned version)

```bash
npm install -g @prism.enterprises/adaptive-reasoning-server
```

Then call the binary directly:

```json
{
  "mcpServers": {
    "adaptive-reasoning": {
      "command": "adaptive-reasoning-server",
      "args": [],
      "env": {
        "MEMORY_PATH": "/absolute/path/to/your/project",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

On Windows the binary is `adaptive-reasoning-server.cmd`; `command: "adaptive-reasoning-server"` resolves it without a `.cmd` extension. If the client cannot find it on `PATH`, use the absolute path printed by `npm root -g` plus `/.bin/adaptive-reasoning-server`.

### 3. Local clone (development)

For hacking on the server itself or running from a local fork:

```bash
git clone https://github.com/PrismAero/Advanced_Memory_MCP.git
cd Advanced_Memory_MCP
npm install
npm run build
```

Then point the client at the built `dist/index.js`:

```json
{
  "mcpServers": {
    "adaptive-reasoning": {
      "command": "node",
      "args": ["/absolute/path/to/Advanced_Memory_MCP/dist/index.js"],
      "env": {
        "MEMORY_PATH": "/absolute/path/to/your/project",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

Windows path example:

```json
{
  "mcpServers": {
    "adaptive-reasoning": {
      "command": "node",
      "args": ["C:/Users/yourusername/code/Advanced_Memory_MCP/dist/index.js"],
      "env": {
        "MEMORY_PATH": "C:/Users/yourusername/projects/your-project",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

VS Code uses `servers` instead of `mcpServers`, and Zed uses a nested `context_servers` shape - see "Shape reference" below. The same three install variants apply: only the `command` and `args` change.

## Client matrix

| Client | Config path | Example file | Format key |
|---|---|---|---|
| Cursor (project) | `<workspace>/.cursor/mcp.json` | [`cursor-mcp.json`](cursor-mcp.json) | `mcpServers` |
| Cursor (global) | `~/.cursor/mcp.json` (Windows: `%USERPROFILE%\.cursor\mcp.json`) | [`cursor-mcp.json`](cursor-mcp.json) | `mcpServers` |
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` | [`claude-desktop-config.json`](claude-desktop-config.json) | `mcpServers` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` | [`claude-desktop-config.json`](claude-desktop-config.json) | `mcpServers` |
| Claude Desktop (Linux) | `~/.config/Claude/claude_desktop_config.json` | [`claude-desktop-config.json`](claude-desktop-config.json) | `mcpServers` |
| VS Code (native MCP) | `<workspace>/.vscode/mcp.json` | [`vscode-mcp.json`](vscode-mcp.json) | `servers` |
| Cline (VS Code extension) | open the Cline panel -> MCP Servers -> Edit, or `cline_mcp_settings.json` from the extension storage | [`cline-mcp-settings.json`](cline-mcp-settings.json) | `mcpServers` |
| Windsurf (Codeium) | `~/.codeium/windsurf/mcp_config.json` | [`windsurf-mcp-config.json`](windsurf-mcp-config.json) | `mcpServers` |
| Continue.dev | `~/.continue/config.yaml` | [`continue-config.yaml`](continue-config.yaml) | `mcpServers:` (YAML) |
| Zed | `~/.config/zed/settings.json` | [`zed-settings.json`](zed-settings.json) | `context_servers` |

If your client speaks MCP but is not listed, copy the shape that matches the JSON keys it expects (`mcpServers`, `servers`, or `context_servers`) and you should be set.

## Shape reference

Three formats cover every client above.

### `mcpServers` (most clients)

Used by Cursor, Claude Desktop, Cline, Windsurf, and Continue.dev (in YAML).

```json
{
  "mcpServers": {
    "adaptive-reasoning": {
      "command": "npx",
      "args": ["@prism.enterprises/adaptive-reasoning-server"],
      "env": {
        "MEMORY_PATH": "/absolute/path/to/your/project",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### `servers` (VS Code native MCP)

```json
{
  "servers": {
    "adaptive-reasoning": {
      "command": "npx",
      "args": ["@prism.enterprises/adaptive-reasoning-server"],
      "env": {
        "MEMORY_PATH": "/absolute/path/to/your/project",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### `context_servers` (Zed)

```json
{
  "context_servers": {
    "adaptive-reasoning": {
      "command": {
        "path": "npx",
        "args": ["@prism.enterprises/adaptive-reasoning-server"],
        "env": {
          "MEMORY_PATH": "/absolute/path/to/your/project",
          "LOG_LEVEL": "info"
        }
      },
      "settings": {}
    }
  }
}
```

## Environment variables

All configurations support the same set of variables.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MEMORY_PATH` | yes | - | **Absolute path to your project root.** The `.memory/` folder is created here. Do not point this at an existing `.memory/` folder. |
| `LOG_LEVEL` | no | `info` | One of `debug`, `info`, `warn`, `error`. |
| `DISABLE_BASELINE_SEED` | no | unset | Set to `1` to skip loading the curated software-engineering baseline into the trainer on first run. |
| `ENABLE_QT_TOOLS` | no | unset | Set to `1` to expose the six Qt/QML analysis tools. Off by default to keep the tool surface lean. |

### Path examples

| Platform | Example `MEMORY_PATH` | Created at |
|---|---|---|
| macOS / Linux | `/Users/yourusername/projects/your-project` | `/Users/yourusername/projects/your-project/.memory/` |
| Windows (forward slashes) | `C:/Users/yourusername/projects/your-project` | `C:\Users\yourusername\projects\your-project\.memory\` |
| Windows (escaped backslashes) | `C:\\Users\\yourusername\\projects\\your-project` | same as above |

A Windows-specific reference is in [`windows-paths.json`](windows-paths.json). On Windows you must either use forward slashes or double every backslash inside JSON strings - JSON does not allow bare `\` escapes.

## Quick start

1. Pick the example file for your client from the matrix above.
2. Copy it to the path the client expects.
3. Replace `MEMORY_PATH` with your project root.
4. Restart the client.
5. The first invocation will download the npm package via `npx` and load the Universal Sentence Encoder model (~30-60 s on first run, cached afterward).

## Verifying the server is wired up

Once the client is restarted, ask the assistant something like:

> Can you list the memory branches?

If the connection is healthy you will see at least the `main` branch. Other quick smoke tests:

> Store a note that this project uses TypeScript and Node 20.

> Create a branch called `auth` for authentication-related notes.

> What do you remember about this project?

## Troubleshooting

- **Server does not start** - confirm `npx` is on `PATH` and that Node 18+ is installed.
- **Permission errors** - confirm the directory at `MEMORY_PATH` is writable.
- **Connection issues** - check the client's MCP / agent logs for the actual stderr from the server process.
- **Path issues on Windows** - JSON strings cannot contain bare backslashes; use forward slashes (`C:/Users/...`) or escape them (`C:\\Users\\...`).
- **First request is slow** - the Universal Sentence Encoder model is loaded lazily and cached under `.memory/`. Subsequent runs are fast.

## Cross-platform notes

The server uses Node's `path` module internally, so paths are normalized for the host OS. The configuration file just has to be valid JSON / YAML for the client.
