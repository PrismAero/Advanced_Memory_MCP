# Adaptive Reasoning Server

**A lightweight MCP server that gives your AI persistent memory capabilities.**

## 🔒 100% Local Operation

**This server runs completely locally with ZERO external connections.** Your data never leaves your machine.

✅ **No network requests** - All processing happens locally  
✅ **No telemetry** - No usage tracking or analytics  
✅ **No cloud sync** - Data stays in your `.memory/` folder  
✅ **Privacy-first** - Your conversations and data remain private

## Overview

The Adaptive Reasoning Server provides your AI assistant with a persistent memory system using SQLite storage. Store facts, decisions, patterns, and insights that persist across conversations, organized in branches by topic or project.

## Features

- **Branching Memory**: Organize knowledge by topic (e.g., "authentication", "database-design")
- **Semantic Search**: Find related information by meaning, not just keywords
- **SQLite Storage**: Fast, reliable database storage
- **Entity Types**: Store facts, decisions, patterns, and insights
- **Cross-References**: Automatic relationship detection between entities

## Installation

Use via `npx` (no installation required):

```bash
npx @prism.enterprises/adaptive-reasoning-server
```

## Configuration

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcp": {
    "servers": {
      "adaptive-reasoning": {
        "command": "npx",
        "args": ["@prism.enterprises/adaptive-reasoning-server"],
        "env": {
          "MEMORY_PATH": "/path/to/your/project"
        }
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "adaptive-reasoning": {
      "command": "npx",
      "args": ["@prism.enterprises/adaptive-reasoning-server"],
      "env": {
        "MEMORY_PATH": "/path/to/your/project"
      }
    }
  }
}
```

### Environment Variables

- **`MEMORY_PATH`**: Your project root directory (`.memory` folder created here)
- **`LOG_LEVEL`**: Optional logging level (`debug`, `info`, `warn`, `error`)

## Usage

Your AI can now:

```typescript
// Store knowledge
create_entities({
  entities: [
    {
      name: "API Authentication",
      entityType: "pattern",
      observations: ["Uses JWT tokens", "Refresh tokens in httpOnly cookies"],
    },
  ],
});

// Search for context
smart_search({
  query: "how does authentication work",
  branch_name: "main",
});

// Organize by topic
create_memory_branch({
  branch_name: "auth-system",
  purpose: "Authentication and security decisions",
});
```

## Available Tools

- `create_entities` - Store new knowledge
- `smart_search` - Semantic search across all knowledge
- `create_memory_branch` / `list_memory_branches` - Branch management
- `add_observations` - Add notes to existing entities
- `update_entity_status` - Modify entity status

## Data Storage

The `.memory` folder is created automatically at your `MEMORY_PATH`:

```
your-project/              ← Set MEMORY_PATH here
├── .memory/               ← Created automatically
│   └── memory.db          ← SQLite database
├── src/                   ← Your project files
└── package.json
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

For security issues, see [SECURITY.md](SECURITY.md).

## License

MIT License - see [LICENSE](LICENSE) for details.
