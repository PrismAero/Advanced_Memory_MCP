# Adaptive Reasoning Server

**An advanced MCP server that gives AI persistent memory with machine learning-powered semantic understanding.**

## 100% Local Operation

**This server runs completely locally with ZERO external connections.** Your data never leaves your machine.

- **No network requests** - All processing happens locally
- **No telemetry** - No usage tracking or analytics
- **No cloud sync** - Data stays in your `.memory/` folder
- **Privacy-first** - Your conversations and data remain private

## Overview

The Adaptive Reasoning Server provides AI assistants with a sophisticated persistent memory system combining SQLite storage with TensorFlow.js machine learning. Store facts, decisions, patterns, and insights that persist across conversations, automatically organized with semantic relationships and vector embeddings for intelligent retrieval.

## Key Features

### Core Memory System

- **Branching Memory**: Organize knowledge by topic, project, or domain
- **Entity Management**: Store facts, decisions, patterns, insights, and more
- **Automatic Relationships**: ML-powered detection of related entities
- **Status Tracking**: Mark entities as active, deprecated, archived, or draft

### Machine Learning & Semantic Search

- **TensorFlow.js Integration**: 512-dimensional embeddings using Universal Sentence Encoder
- **Vector Database**: High-performance vector storage with cosine similarity search
- **Semantic Search**: Find related information by meaning, not just keywords
- **Code Understanding**: Specialized embeddings for interfaces, functions, and patterns

### Project Analysis

- **Automatic File Monitoring**: Watches project files for changes (3-minute intervals)
- **Interface Detection**: Analyzes TypeScript/JavaScript interfaces and relationships
- **Dependency Mapping**: Tracks imports, exports, and project dependencies
- **Embedding Backfill**: Automatically generates embeddings for existing data

### Intelligent Context

- **Working Context**: Track current work and related entities
- **Decision History**: Trace decision chains and rationale
- **Dependency Analysis**: Find missing context and prerequisites
- **Project Patterns**: Detect and suggest organizational patterns

## Installation

### Via npx (Recommended)

```bash
npx @prism.enterprises/adaptive-reasoning-server
```

### Global Installation

```bash
npm install -g @prism.enterprises/adaptive-reasoning-server
```

### Local Development

```bash
git clone https://github.com/PrismAero/Advanced_Memory_MCP.git
cd Advanced_Memory_MCP
npm install
npm run build
```

## Configuration

### Cursor

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "mcp": {
    "servers": {
      "adaptive-reasoning": {
        "command": "npx",
        "args": ["@prism.enterprises/adaptive-reasoning-server"],
        "env": {
          "MEMORY_PATH": "/path/to/your/project",
          "LOG_LEVEL": "info"
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
        "MEMORY_PATH": "/path/to/your/project",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Environment Variables

- **`MEMORY_PATH`** (Required): Your project root directory - `.memory` folder created here
- **`LOG_LEVEL`** (Optional): Logging verbosity - `debug`, `info`, `warn`, `error` (default: `info`)

## Usage Examples

### Basic Entity Management

```typescript
// Create entities with automatic relationship detection
create_entities({
  entities: [
    {
      name: "User Authentication System",
      entityType: "component",
      observations: [
        "Uses JWT tokens for session management",
        "Refresh tokens stored in httpOnly cookies",
        "Token expiration: 15 minutes for access, 7 days for refresh",
        "Integrates with OAuth2 providers",
      ],
    },
  ],
  auto_create_relations: true,
});

// Add observations to existing entities
add_observations({
  observations: [
    {
      entityName: "User Authentication System",
      contents: [
        "Added rate limiting: 5 failed attempts = 15 min lockout",
        "Implemented password strength validation",
      ],
    },
  ],
});

// Search with semantic understanding
smart_search({
  query: "how does login work",
  search_type: "smart",
  limit: 10,
});
```

### Project Analysis

```typescript
// Analyze project structure and start monitoring
analyze_project_structure({
  project_path: "/path/to/project",
  analysis_depth: "detailed",
  include_dependencies: true,
  include_interfaces: true,
});

// Find interface usage patterns
find_interface_usage({
  interface_name: "UserProfile",
  include_implementations: true,
  include_related_interfaces: true,
});

// Detect project patterns
detect_project_patterns({
  workspace_path: "/path/to/project",
  analysis_depth: 2,
  suggest_branches: true,
});
```

### Machine Learning Features

```typescript
// Generate embeddings for code interfaces
generate_interface_embedding({
  interface_names: ["UserProfile", "AuthToken"],
  include_context: true,
});

// Find similar code patterns
find_similar_code({
  code_snippet: "interface UserData { id: string; name: string; }",
  search_type: "interface",
  similarity_threshold: 0.7,
  max_results: 5,
});

// Backfill embeddings for existing data
backfill_embeddings({
  file_limit: 100,
  interface_limit: 100,
});
```

### Context & Workflow Management

```typescript
// Capture decisions with context
capture_decision({
  decision: "Use PostgreSQL for user data",
  rationale: "Better support for complex queries and ACID compliance",
  alternatives: ["MongoDB", "DynamoDB"],
  impact: "high",
  related_entities: ["Database Design", "User Service"],
});

// Mark current work
mark_current_work({
  entity_names: ["User Authentication System"],
  work_type: "implementation",
});

// Get continuation context
get_continuation_context({
  session_id: "dev-session-1",
  include_decisions: true,
  include_blockers: true,
});
```

## Available Tools

### Core Memory Operations

- `create_entities` - Create new knowledge entities
- `add_observations` - Add notes to existing entities
- `update_entity_status` - Change entity status
- `delete_entities` - Remove entities
- `smart_search` - Semantic search across knowledge

### Branch Management

- `create_memory_branch` - Create topic-specific branches
- `list_memory_branches` - View all branches with statistics
- `delete_memory_branch` - Remove branches
- `read_memory_branch` - Export branch data

### Project Analysis

- `analyze_project_structure` - Analyze and monitor project
- `detect_project_patterns` - Identify organizational patterns
- `find_interface_usage` - Locate interface implementations
- `navigate_codebase` - Get intelligent navigation suggestions

### Machine Learning

- `generate_interface_embedding` - Create semantic embeddings
- `find_similar_code` - Semantic code similarity search
- `train_project_model` - Train project-specific models
- `backfill_embeddings` - Generate embeddings for existing data

### Context & Workflow

- `recall_working_context` - Retrieve current work context
- `get_project_status` - Project state summary
- `find_dependencies` - Identify prerequisites
- `trace_decision_chain` - Follow decision history
- `capture_decision` - Record decisions with rationale
- `mark_current_work` - Tag active entities
- `update_project_status` - Update project phase
- `archive_completed_work` - Archive finished items
- `check_missing_dependencies` - Detect context gaps
- `get_continuation_context` - Resume work context

### Workspace Integration

- `sync_with_workspace` - Sync with IDE workspace
- `workspace_context_bridge` - Bridge memory and workspace
- `suggest_project_context` - Get intelligent suggestions

## Architecture

### Technology Stack

- **Storage**: SQLite with optimized indexing
- **ML Framework**: TensorFlow.js Node backend
- **Embeddings**: Universal Sentence Encoder (512-dimensional)
- **Vector Search**: Custom implementation with cosine similarity
- **Background Processing**: Automatic monitoring and analysis

### Data Structure

```
your-project/                    <- MEMORY_PATH
├── .memory/                     <- Auto-created
│   ├── memory.db                <- Main SQLite database
│   ├── main.json                <- Branch data (JSON backup)
│   ├── build-config.json        <- Additional branches
│   └── trained-models/          <- Project-specific ML models
├── src/                         <- Your project files
└── package.json
```

### Database Schema

**Entities Table**

- Core entity storage with metadata
- Observations, relationships, status tracking

**Vectors Table**

- 512-dimensional embeddings
- Metadata for entity/file/interface association

**Project Files Table**

- File analysis results
- Language, complexity, documentation metrics

**Code Interfaces Table**

- Interface definitions with embeddings
- Properties, extends, usage tracking

**Dependencies Table**

- Import/export relationships
- Resolution status

## Background Processing

The server automatically:

- **Every 3 minutes**: Monitors project file changes
- **Every 10 minutes**: Analyzes interfaces and backfills embeddings
- **Every 30 minutes**: Updates entity relationships and relevance scores

## Performance Considerations

- **Initial Analysis**: First project scan may take 1-2 minutes for large codebases
- **Embedding Generation**: ~100ms per item (files/interfaces)
- **Vector Search**: Sub-100ms for similarity queries
- **Memory Usage**: ~200-500MB depending on project size
- **Disk Usage**: ~1-5MB per 1000 entities

## Migration & Upgrades

When upgrading from a version without vector embeddings:

1. **Automatic Detection**: Server detects missing embeddings on startup
2. **Background Backfill**: Automatically generates embeddings (50 items per 10-minute cycle)
3. **Manual Backfill**: Use `backfill_embeddings` tool for faster processing

```typescript
// Check and backfill embeddings
backfill_embeddings({
  file_limit: 200, // Process up to 200 files
  interface_limit: 200, // Process up to 200 interfaces
});
```

## Troubleshooting

### Server Won't Start

Check logs for:

- TensorFlow.js initialization errors
- SQLite database permissions
- MEMORY_PATH accessibility

### Missing Embeddings

Run manual backfill:

```typescript
backfill_embeddings({ file_limit: 500, interface_limit: 500 });
```

### High Memory Usage

- Reduce background processing frequency
- Limit the number of entities per branch
- Consider archiving old data

### Slow Searches

- Ensure embeddings are generated (check with `get_project_status`)
- Reduce `limit` parameter in searches
- Archive unused branches

## Development

### Build from Source

```bash
git clone https://github.com/PrismAero/Advanced_Memory_MCP.git
cd Advanced_Memory_MCP
npm install
npm run build
npm test
```

### Run Tests

```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage
```

### Project Structure

```
Advanced_Memory_MCP/
├── modules/
│   ├── handlers/              # MCP tool handlers
│   ├── ml/                    # Machine learning components
│   ├── similarity/            # TensorFlow.js integration
│   ├── sqlite/                # Database operations
│   ├── project-analysis/      # Code analysis
│   └── intelligence/          # Context engine
├── tests/                     # Test suite
├── examples/                  # Configuration examples
└── index.ts                   # Server entry point
```

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Code style guidelines
- Testing requirements
- Pull request process
- Development setup

## Security

For security issues, please see [SECURITY.md](SECURITY.md).

Key security features:

- No external network connections
- Local-only processing
- No data transmission
- Monitored for suspicious activity (debug mode)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- Issues: [GitHub Issues](https://github.com/PrismAero/Advanced_Memory_MCP/issues)
- Discussions: [GitHub Discussions](https://github.com/PrismAero/Advanced_Memory_MCP/discussions)

## Acknowledgments

Built with:

- Model Context Protocol (MCP) by Anthropic
- TensorFlow.js
- SQLite
- Universal Sentence Encoder model
