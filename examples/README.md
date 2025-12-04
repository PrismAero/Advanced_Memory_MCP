# Configuration Examples

This directory contains example configuration files for using the Adaptive Reasoning Server with different MCP clients.

## Cursor IDE

Configuration file: `.cursor/mcp.json` in your workspace root

See: [cursor-mcp.json](cursor-mcp.json)

## Claude Desktop

Configuration file location varies by platform:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

See: [claude-desktop-config.json](claude-desktop-config.json)

## VS Code with Cline/Roo-Cline

Configuration in VS Code settings (`.vscode/settings.json`):

See: [vscode-settings.json](vscode-settings.json)

## Environment Variables

All configurations support these environment variables:

- **`MEMORY_PATH`** (required): **Your project root directory**
  - **Important:** Set this to your project root, NOT to a `.memory` folder
  - The `.memory/` folder will be automatically created at this location
  - Example macOS/Linux: `/Users/yourusername/your-project-folder`
    - Creates: `/Users/yourusername/your-project-folder/.memory/`
  - Example Windows: `C:\Users\yourusername\your-project-folder`
    - Creates: `C:\Users\yourusername\your-project-folder\.memory\`

- **`LOG_LEVEL`** (optional): Logging verbosity
  - Options: `debug`, `info`, `warn`, `error`
  - Default: `info`

## Quick Start

1. Choose the configuration file for your client
2. Copy it to the appropriate location
3. Update `MEMORY_PATH` to point to your project directory
   - **Windows users**: Use forward slashes (`/`) or double backslashes (`\\`)
   - **macOS/Linux users**: Use standard Unix paths
4. Restart your IDE/client
5. The server will automatically start when needed

## Testing Your Configuration

After setting up, try these commands with your AI:

```
"Can you store a note that we use TypeScript for this project?"
"What do you remember about this project?"
"Create a branch called 'authentication' for auth-related notes"
```

## Troubleshooting

- **Server not starting**: Check that `npx` is available in your PATH
- **Permission errors**: Ensure the `MEMORY_PATH` directory is writable
- **Connection issues**: Check the IDE/client logs for MCP connection errors
- **Path issues on Windows**: Use forward slashes or escape backslashes in JSON configs

## Cross-Platform Notes

The Adaptive Reasoning Server uses Node.js path utilities to ensure compatibility across:
- **Windows** (using backslashes internally)
- **macOS** (using forward slashes)
- **Linux** (using forward slashes)

All paths are automatically normalized for your operating system.
