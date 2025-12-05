# Contributing

Thanks for your interest in contributing to the Adaptive Reasoning Server!

## 🚨 **CRITICAL**: Local-Only Operation Required

**This MCP server MUST remain 100% local with zero external connections.**

All contributions must maintain this security guarantee. Any PR that introduces network dependencies will be **immediately rejected**.

## Quick Start

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes following **local-only requirements** below
4. Build and test: `npm run build`
5. Run security audit: `npm audit`
6. Submit a pull request

## Development Setup

```bash
# Install dependencies
npm install

# Audit dependencies for security issues
npm audit

# Build the project
npm run build

# Watch mode for development
npm run watch

# Test in network-isolated environment (optional but recommended)
sudo unshare --net npm run build  # Linux
```

## 🔒 Local-Only Development Requirements

### ✅ Allowed Dependencies/Features

- File system operations (fs, path)
- SQLite database operations
- Local text processing (NLP, similarity)
- Local data structures and algorithms
- MCP protocol (stdio transport only)

### ❌ Strictly Forbidden

- **Network requests** (http, https, fetch, axios, request)
- **External APIs** (any service requiring internet)
- **Cloud services** (AWS, Google Cloud, Azure SDKs)
- **Analytics/telemetry** (Google Analytics, Mixpanel, etc.)
- **Auto-update mechanisms** (self-updating code)
- **WebSockets** or any real-time external communication
- **Package registries** except npm install-time

### 🔍 Required Security Checks

Before submitting any PR:

```bash
# 1. Dependency audit
npm audit --audit-level high

# 2. Check for network imports
grep -r "import.*http\|require.*http\|fetch\|axios" . --exclude-dir=node_modules

# 3. Verify no external URLs in code
grep -r "http://\|https://" . --exclude-dir=node_modules --exclude="package.json" --exclude="*.md"

# 4. Test offline functionality
# Disconnect from internet and run: npm run build
```

## What We Welcome

- **Performance improvements** - Faster SQLite queries, better algorithms
- **Bug fixes** - Local functionality issues
- **Documentation improvements** - Clearer setup instructions
- **Security enhancements** - Better file permissions, input validation
- **Local features** - New MCP tools, better text processing
- **Testing** - Unit tests, integration tests

## What Requires Discussion First

- **Architecture changes** - Open an issue first
- **New dependencies** - Must be audited for network activity
- **Breaking API changes** - Coordinate with users
- **Large refactors** - Discuss approach in issue

## Code Quality Standards

### Security Guidelines

- Never import network libraries
- Validate all user inputs (file paths, entity names)
- Use parameterized SQLite queries (already implemented)
- Handle file system errors gracefully
- No eval() or dynamic code execution

### Code Style

- Follow existing TypeScript patterns
- Use existing error handling patterns
- Add JSDoc comments for public methods
- Keep functions focused and testable

### Testing Requirements

- Test with various `MEMORY_PATH` configurations
- Test with different file permissions
- Test SQLite edge cases (large datasets, concurrent access)
- Verify no network activity during tests

## Pull Request Process

1. **Security Review**: All PRs undergo security audit
2. **Dependency Check**: New dependencies require explicit approval
3. **Local Testing**: Maintainer tests in network-isolated environment
4. **Documentation Update**: Update relevant docs if needed

## Development Environment Security

### Recommended Setup

```bash
# Create isolated development environment
mkdir ~/adaptive-reasoning-dev
cd ~/adaptive-reasoning-dev
git clone your-fork
cd adaptive-reasoning-server

# Use local npm cache to avoid unnecessary network
npm config set cache ~/.npm-cache
npm install --offline  # After initial install
```

### Network Monitoring (Optional)

```bash
# Monitor network activity during development (macOS)
sudo lsof -i -P | grep node

# Block network during testing (Linux)
sudo unshare --net bash
npm run build  # Should work fine
```

## Questions or Security Concerns?

- **General questions**: Open a GitHub issue
- **Security issues**: Email kai@prismaquatics.io (private)
- **Architecture discussion**: Start a GitHub discussion

---

**Remember: Local-first is not just a feature, it's a security requirement.**
