# Project-Aware Tool Filtering

The Advanced Memory MCP Server now automatically detects your project type and enables only relevant tools, reducing clutter and improving user experience.

## How It Works

When the server starts, it analyzes your workspace to detect:

- **Primary language** (TypeScript, C++, Python, Rust, etc.)
- **Secondary languages** (for polyglot projects)
- **Frameworks & features** (Qt, React, Vue, etc.)
- **Confidence level** of the detection

Based on this analysis, language-specific tools are automatically enabled or disabled.

## Supported Project Types

### TypeScript/JavaScript Projects

- **Detected by**: `tsconfig.json`, `package.json`, `.ts` files
- **Disabled tools**: Qt/QML-specific tools (6 tools)
- **Frameworks detected**: React, Vue, Angular, Next.js

### C++/Qt Projects

- **Detected by**: `CMakeLists.txt`, `.qml` files, `.cpp` files
- **Enabled tools**: All Qt/QML analysis tools
- **Features**: Qt framework, QML UI

### Python Projects

- **Detected by**: `pyproject.toml`, `requirements.txt`, `.py` files
- **Future**: Python-specific tools (when added)

### Other Languages

- **Rust**: Detected via `Cargo.toml`
- **Go**: Detected via `go.mod`
- **Java**: Detected via `pom.xml`, `build.gradle`
- **C#**: Detected via `.csproj`, `.sln` files

## Qt/QML Tools (Conditionally Available)

These tools are **only available in C++/Qt projects**:

1. **`analyze_qml_bindings`** - Analyze Q_PROPERTY and Q_INVOKABLE in C++ classes
2. **`find_qt_controllers`** - Find all QML-registered C++ controllers
3. **`analyze_layer_architecture`** - Analyze Service → Controller → UI architecture
4. **`find_qml_usage`** - Find QML files using a C++ controller
5. **`list_q_properties`** - List all Q_PROPERTY declarations
6. **`list_q_invokables`** - List all Q_INVOKABLE methods

## Environment Variables

### `MCP_ENABLE_ALL_TOOLS`

Force enable all tools regardless of project type.

```bash
export MCP_ENABLE_ALL_TOOLS=true
```

Use cases:

- Polyglot projects with multiple languages
- Testing or development
- Manual override when detection is incorrect

### `MEMORY_PATH`

Set the project path for analysis (already existing).

```bash
export MEMORY_PATH=/path/to/your/project
```

## Examples

### TypeScript Project

```bash
cd /path/to/typescript-project
# Server automatically detects TypeScript
# Qt/QML tools are disabled (31/37 tools available)
```

### C++/Qt Project

```bash
cd /path/to/qt-project
# Server automatically detects C++/Qt
# All Qt/QML tools are enabled (37/37 tools available)
```

### Force Enable All Tools

```bash
export MCP_ENABLE_ALL_TOOLS=true
# All 37 tools available regardless of project type
```

## Detection Confidence

The detector reports confidence levels:

- **High (>70%)**: Strong indicators (config files + source files)
- **Medium (40-70%)**: Some indicators present
- **Low (<40%)**: Weak indicators, all tools enabled by default

Low confidence projects automatically get all tools enabled to avoid missing functionality.

## Testing Detection

Run the test script to see how your project is detected:

```bash
npm run build
node dist/test-project-detection.js
```

Output example:

```
Detection Results:
  Primary Language: typescript
  Secondary Languages: javascript
  Features: none
  Confidence: 100%

Tool Filtering:
  Total tools: 37
  Available tools: 31
  Filtered out: 6

Qt/QML Tools Status:
  analyze_qml_bindings: ✗ disabled
  find_qt_controllers: ✗ disabled
  ...
```

## Benefits

1. **Cleaner Tool Lists**: See only tools relevant to your project
2. **Better Performance**: Reduced tool initialization overhead
3. **Improved UX**: Less confusion from irrelevant tools
4. **Automatic**: No manual configuration needed
5. **Override Available**: Can force enable all tools if needed

## Architecture

- **ProjectTypeDetector** (`modules/project-type-detector.ts`)

  - Scans workspace for config files
  - Counts source file extensions
  - Detects frameworks and features
  - Returns confidence score

- **filterToolsByProjectType** (`modules/smart-memory-tools.ts`)

  - Takes detected project type
  - Returns filtered tool list
  - Categorizes tools by language/framework

- **Dynamic Tool Registration** (`index.ts`)
  - Runs detection on first `ListTools` request
  - Caches result for subsequent requests
  - Respects `MCP_ENABLE_ALL_TOOLS` override
