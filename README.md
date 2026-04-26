# Adaptive Reasoning Server

An advanced Model Context Protocol (MCP) server that gives AI assistants persistent memory with machine-learning-powered semantic understanding.

## 100% Local Operation

This server runs completely locally with zero external connections. Your data never leaves your machine.

- No network requests - all processing happens locally
- No telemetry - no usage tracking or analytics
- No cloud sync - data stays in your `.memory/` folder
- Privacy-first - your conversations and code remain private

## Overview

The Adaptive Reasoning Server provides AI assistants with a persistent memory system combining SQLite storage with TensorFlow.js machine learning. Store facts, decisions, patterns, and insights that persist across conversations, automatically organized with semantic relationships and vector embeddings for intelligent retrieval.

## Key Features

### Core Memory System

- **Branching memory** - organize knowledge by topic, project, or domain
- **Entity management** - store facts, decisions, patterns, components, and more
- **Automatic relationships** - ML-powered detection of related entities (deferred to a background indexer by default for fast writes)
- **Status tracking** - mark entities as active, deprecated, archived, or draft
- **Working context** - flag the current focus set so retrieval biases toward it

### Machine Learning and Semantic Search

- **TensorFlow.js integration** - 512-dimensional embeddings using the Universal Sentence Encoder
- **Vector search** - cosine-similarity search over stored embeddings
- **Semantic search** - find related information by meaning, not just keywords
- **Code understanding** - specialized embeddings for interfaces, functions, and patterns
- **Language-aware baseline** - the model ships with a curated software-engineering seed covering C, C++ (modern C++17/20/23), Go (1.18+), TypeScript, and language-agnostic concepts so a fresh install produces sensible results without any training data
- **Adaptive fine-tuning** - the trainer picks up confirmed relationships, search successes, and interface usage as new training data and incrementally fine-tunes the embedding model

### Project Analysis

- **File monitoring** - watches project files for changes (3-minute interval by default)
- **Interface detection** - analyzes TypeScript / JavaScript interfaces and relationships
- **Dependency mapping** - tracks imports, exports, and project dependencies
- **Embedding backfill** - automatically generates embeddings for previously-stored data

### Intelligent Context

- **Working context** - track current work and related entities
- **Decision history** - trace decision chains and rationale
- **Dependency analysis** - find missing context and prerequisites
- **Project patterns** - detect and suggest organizational patterns

## Installation

Three install variants are supported. All three produce the same runtime behavior - the only difference is how the client launches the server. Side-by-side configs: [`examples/install-variants.json`](examples/install-variants.json).

### 1. npx (no install, recommended)

Nothing to install up front. The client config calls `npx` directly:

```json
"command": "npx",
"args": ["-y", "@prism.enterprises/adaptive-reasoning-server"]
```

You can also smoke-test it from a shell:

```bash
npx @prism.enterprises/adaptive-reasoning-server
```

### 2. Global install (faster startup, pinned version)

```bash
npm install -g @prism.enterprises/adaptive-reasoning-server
```

Then point the client at the binary directly:

```json
"command": "adaptive-reasoning-server",
"args": []
```

### 3. Local clone (development)

```bash
git clone https://github.com/PrismAero/Advanced_Memory_MCP.git
cd Advanced_Memory_MCP
npm install
npm run build
```

Point the client at the built entry point:

```json
"command": "node",
"args": ["/absolute/path/to/Advanced_Memory_MCP/dist/index.js"]
```

## Configuration

The server speaks standard MCP over stdio, so it works with any MCP-aware client. Concrete config files for each major client live in [`examples/`](examples/). The most common ones are:

| Client | Config file | Format key |
|---|---|---|
| Cursor (project) | `.cursor/mcp.json` | `mcpServers` |
| Cursor (global) | `~/.cursor/mcp.json` | `mcpServers` |
| Claude Desktop | `claude_desktop_config.json` | `mcpServers` |
| VS Code | `.vscode/mcp.json` | `servers` |
| Cline (VS Code) | `cline_mcp_settings.json` | `mcpServers` |
| Continue.dev | `~/.continue/config.yaml` | `mcpServers:` (YAML) |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |
| Zed | `settings.json` | `context_servers` |

A minimal Cursor / Claude Desktop / Cline / Windsurf entry looks like this:

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

VS Code's native MCP integration uses a slightly different shape:

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

See [`examples/README.md`](examples/README.md) for client-specific paths, Windows path conventions, and ready-to-copy files.

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MEMORY_PATH` | yes | - | Absolute path to your project root. The `.memory/` folder is created here. |
| `LOG_LEVEL` | no | `info` | One of `debug`, `info`, `warn`, `error`. |
| `DISABLE_BASELINE_SEED` | no | unset | Set to `1` to skip loading the curated baseline knowledge into the trainer on first run. |
| `ENABLE_QT_TOOLS` | no | unset | Set to `1` to expose the six Qt/QML analysis tools (only useful when entities carry file metadata). |

## Available Tools

The server exposes a deliberately small surface area. Mode/action-dispatched tools (`get_context`, `analyze_workspace`, `embeddings`, `update_status`) replace what used to be 12+ overlapping tools.

### Branch management

| Tool | Purpose |
|---|---|
| `list_memory_branches` | List branches with name, purpose, entity count, last-updated time. |
| `create_memory_branch` | Create a new branch when no existing branch fits the topic. |
| `delete_memory_branch` | Permanently delete a branch (cannot delete `main`). |

### Entity CRUD

| Tool | Purpose |
|---|---|
| `create_entities` | Create new knowledge entities (facts, decisions, components, patterns). Auto-suggests a branch and defers relation detection to the background. |
| `add_observations` | Append observations to an existing entity. |
| `update_entity_status` | Change one entity's status with an optional reason. |
| `delete_entities` | Permanently delete entities and their relations. |

### Search and read

| Tool | Purpose |
|---|---|
| `smart_search` | Default lookup. Name + type + content + observations with relevance ranking and optional semantic expansion. Use `branch_name='*'` for cross-branch search. |
| `read_memory_branch` | Dump every entity and relation in a branch. Heavy - prefer `smart_search` for targeted lookups. |

### Context and project state

| Tool | Modes / purpose |
|---|---|
| `get_context` | `working` / `continuation` / `related` / `project` - unified context retrieval. |
| `get_project_status` | Cross-branch overview at `summary` / `detailed` / `comprehensive` detail levels. |
| `find_dependencies` | Walk the relations graph outward from target entities. |
| `trace_decision_chain` | Surface decisions that shaped an entity, or recent decisions branch-wide. |

### Workflow

| Tool | Purpose |
|---|---|
| `capture_decision` | Record a structured decision with rationale, alternatives, and impact. |
| `mark_current_work` | Flag entities as the active working context. |
| `update_status` | `phase` (bulk pattern updates + branch project_phase) or `archive` (archive completed work, optionally with a summary entity). |
| `check_missing_dependencies` | Scan observations for explicit dependency keywords and report unbound mentions. |

### Workspace integration

| Tool | Modes / purpose |
|---|---|
| `analyze_workspace` | `sync` (folder/file structure entities) / `bridge` (link open files to memory) / `patterns` (detect architecture and suggest branches) / `structure` (start background monitoring). |

### Machine learning

| Tool | Purpose |
|---|---|
| `embeddings` | `generate` / `find_similar` / `backfill` - all embedding operations. |
| `train_project_model` | Trigger an incremental fine-tune over collected interactions + baseline seed. |

### Qt/QML analysis (opt-in)

Set `ENABLE_QT_TOOLS=1` to expose: `analyze_qml_bindings`, `find_qt_controllers`, `analyze_layer_architecture`, `find_qml_usage`, `list_q_properties`, `list_q_invokables`. These require entities to carry file metadata; they are hidden by default to keep the surface area lean.

## Usage Examples

### Capture and recall

```jsonc
// Create entities. Branch is auto-suggested if omitted.
create_entities({
  "entities": [
    {
      "name": "User Authentication System",
      "entityType": "component",
      "observations": [
        "Uses JWT tokens for session management",
        "Refresh tokens stored in httpOnly cookies",
        "Token expiration: 15 minutes for access, 7 days for refresh",
        "Integrates with OAuth2 providers"
      ]
    }
  ]
})

// Append more facts later.
add_observations({
  "observations": [
    {
      "entityName": "User Authentication System",
      "contents": [
        "Added rate limiting: 5 failed attempts = 15 min lockout",
        "Implemented password strength validation"
      ]
    }
  ]
})

// Find it again by meaning.
smart_search({
  "query": "how does login work",
  "branch_name": "main"
})
```

### Working context and continuation

```jsonc
// Tell the server what you are focused on right now.
mark_current_work({
  "focus_entities": ["User Authentication System"],
  "focus_description": "Adding device-bound refresh tokens"
})

// Get back to it after a break.
get_context({
  "mode": "continuation",
  "branch_name": "main",
  "time_window_hours": 48
})
```

### Decisions and dependencies

```jsonc
capture_decision({
  "decision_title": "Use PostgreSQL for user data",
  "decision_rationale": "Better support for complex queries and ACID compliance",
  "alternatives_considered": ["MongoDB", "DynamoDB"],
  "impact_areas": ["Database Design", "User Service"],
  "related_entities": ["User Authentication System"]
})

// Later: why is this here?
trace_decision_chain({
  "entity_name": "User Authentication System"
})

// What does this depend on before I refactor it?
find_dependencies({
  "entity_names": ["User Authentication System"],
  "dependency_depth": 2
})
```

### Embeddings and code similarity

```jsonc
// Generate embeddings for known interfaces.
embeddings({
  "action": "generate",
  "interface_names": ["UserProfile", "AuthToken"]
})

// Find code with similar shape.
embeddings({
  "action": "find_similar",
  "code_snippet": "interface UserData { id: string; name: string; }",
  "limit": 5
})

// One-shot backfill of missing embeddings.
embeddings({
  "action": "backfill",
  "file_limit": 200,
  "interface_limit": 200
})
```

### Workspace integration

```jsonc
// Materialize folder/file structure entities and link them.
analyze_workspace({
  "mode": "sync",
  "workspace_path": "/path/to/project",
  "create_structure_entities": true,
  "link_existing_entities": true
})

// Bridge currently-open files to memory entities.
analyze_workspace({
  "mode": "bridge",
  "current_files": ["src/auth/login.ts", "src/auth/refresh.ts"],
  "context_radius": 2
})

// Detect project type and suggest organizational branches.
analyze_workspace({
  "mode": "patterns",
  "workspace_path": "/path/to/project",
  "suggest_branches": true
})
```

## Architecture

### Technology stack

- **Storage** - SQLite with FTS5 full-text search and indexed lookups
- **ML framework** - TensorFlow.js Node backend
- **Embeddings** - Universal Sentence Encoder (512-dimensional)
- **Vector search** - in-process cosine similarity over the embedding column
- **Background processing** - file monitoring, interface analysis, relationship detection, relevance scoring

### Data layout

```
your-project/                      <- MEMORY_PATH
  .memory/                         <- auto-created
    memory.db                      <- main SQLite database
    main.json                      <- branch data (JSON backup)
    <branch-name>.json             <- additional per-branch backups
    trained-models/                <- project-specific fine-tuned models
    seed.lock                      <- marker that baseline seed has been loaded
  src/                             <- your project files
  package.json
```

### Database tables

- **Entities** - core entity storage with metadata, observations, status
- **Relations** - typed edges between entities (depends_on, affects, decides, etc.)
- **Vectors** - 512-dimensional embeddings keyed by entity / file / interface
- **Project files** - file analysis results (language, complexity, documentation)
- **Code interfaces** - interface definitions with embeddings, properties, usage counts
- **Dependencies** - import/export relationships with resolution status

## Background Processing

The server runs three periodic loops by default:

- **Every 3 minutes** - file change monitoring
- **Every 10 minutes** - interface analysis and embedding backfill
- **Every 30 minutes** - entity relationship detection and relevance score updates

The relationship indexer caches a per-branch signature (entity count + max-last-accessed + max-relation-count) and skips work when nothing has changed.

## Performance

- **Initial analysis** - first project scan can take 1-2 minutes for large codebases
- **Embedding generation** - ~100 ms per item
- **Vector search** - sub-100 ms for similarity queries
- **Memory usage** - ~200-500 MB depending on project size
- **Disk usage** - ~1-5 MB per 1000 entities

## Migration

When upgrading from a version without vector embeddings:

1. **Automatic detection** - the server detects missing embeddings on startup
2. **Background backfill** - up to 50 items per 10-minute cycle
3. **Manual backfill** - `embeddings` tool with `action: "backfill"` for faster processing

```jsonc
embeddings({
  "action": "backfill",
  "file_limit": 200,
  "interface_limit": 200
})
```

## Troubleshooting

### Server will not start

- Check logs for TensorFlow.js initialization errors
- Confirm SQLite database permissions on `MEMORY_PATH/.memory/`
- Confirm `MEMORY_PATH` is an absolute, writable path

### Missing embeddings

```jsonc
embeddings({ "action": "backfill", "file_limit": 500, "interface_limit": 500 })
```

### High memory usage

- Reduce background processing frequency
- Cap entities per branch
- Archive old data with `update_status({ "mode": "archive", ... })`

### Slow searches

- Make sure embeddings are generated (`get_project_status` reports counts)
- Reduce `limit` in searches
- Archive unused branches

## Development

### Build from source

```bash
git clone https://github.com/PrismAero/Advanced_Memory_MCP.git
cd Advanced_Memory_MCP
npm install
npm run build
npm test
```

### Test commands

```bash
npm test              # build + run the aggressive Vitest suite (MCP stdio, handlers, strict regressions, stress)
npm run test:quick    # run MCP/handler Vitest suites without rebuilding
npm run test:legacy   # build + run the previous custom harness
npm run test:coverage # build + run Vitest with V8 coverage
```

The default suite is intentionally aggressive. It exercises the public MCP stdio boundary, handler dispatch, strict regression checks for formerly shallow assertions, similarity quality gates, and SQLite/concurrency stress. Failures in semantic ranking or stress thresholds should be treated as product issues, not hidden behind permissive "handled" checks.

### Project structure

```
Advanced_Memory_MCP/
  modules/
    handlers/           - MCP tool handlers
    ml/                 - machine learning components (trainer, seed, project embeddings)
    similarity/         - TensorFlow.js similarity engine
    sqlite/             - database operations
    project-analysis/   - code analysis
    intelligence/       - context engine
  tests/                - test runner and ML test suite
  examples/             - configuration examples for each MCP client
  index.ts              - server entry point
```

## Contributing

Contributions welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for code style, testing requirements, and the pull request process.

## Security

For security disclosures see [SECURITY.md](SECURITY.md).

Key properties:

- No external network connections in normal operation
- Local-only processing
- No data transmission
- Optional debug-mode monitoring of suspicious activity

## License

MIT - see [LICENSE](LICENSE).

## Support

- Issues: [GitHub Issues](https://github.com/PrismAero/Advanced_Memory_MCP/issues)
- Discussions: [GitHub Discussions](https://github.com/PrismAero/Advanced_Memory_MCP/discussions)

## Acknowledgments

Built with:

- Model Context Protocol (MCP) by Anthropic
- TensorFlow.js
- SQLite
- Universal Sentence Encoder
