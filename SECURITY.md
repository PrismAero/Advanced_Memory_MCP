# Security Policy

## 🔒 LOCAL-ONLY OPERATION GUARANTEE

**This MCP server operates 100% locally with ZERO external connections.**

### Security Audit Results (Last Updated: Dec 2025)

✅ **No network requests** - All operations are local file system and SQLite  
✅ **No external APIs** - All dependencies verified as offline-capable  
✅ **No telemetry** - No data leaves your machine  
✅ **No auto-updates** - Explicit version control only

### Dependencies Security Status

| Package                     | Purpose         | Network Activity   | Status  |
| --------------------------- | --------------- | ------------------ | ------- |
| `@modelcontextprotocol/sdk` | MCP protocol    | Local stdio only   | ✅ Safe |
| `sqlite3`                   | Database        | Local file system  | ✅ Safe |
| `natural`                   | Text processing | Offline algorithms | ✅ Safe |
| `sentence-similarity`       | Similarity      | Local computation  | ✅ Safe |
| `tiktoken`                  | Token counting  | Local encoding     | ✅ Safe |

## 🚨 Threat Model & Protections

### Data Security

- **All data stays local** - Stored in `.memory/` folder on your file system
- **No cloud sync** - No automatic backup or synchronization
- **File permissions** - Respects your OS file security model
- **Memory isolation** - Each project gets its own SQLite database

### Attack Vectors Mitigated

- **Supply chain attacks** - All dependencies audited for external connections
- **Data exfiltration** - No network access means no data leakage
- **Remote code execution** - No external input sources
- **Man-in-the-middle** - No network traffic to intercept

## ⚡ Development Security Requirements

**ALL contributions must maintain local-only operation:**

### Forbidden Dependencies/Features

❌ Any package that makes HTTP/HTTPS requests  
❌ Analytics, telemetry, or tracking libraries  
❌ Cloud storage or sync services  
❌ External API integrations  
❌ Auto-update mechanisms

### Required Security Review

- **Dependency audit** - `npm audit` must pass
- **Code review** - No network imports (http, https, fetch, axios)
- **Runtime verification** - Test in network-isolated environment

## 📋 Reporting Vulnerabilities

### Security Issues

If you discover a security vulnerability:

1. **Do not** create a public issue
2. Report via GitHub Security Advisories: https://github.com/PrismAero/Advanced_Memory_MCP/security/advisories/new
3. Include: reproduction steps, potential impact, suggested fix

### Response Timeline

- **Initial response**: Within 48 hours
- **Security patch**: Within 7 days for critical issues
- **Public disclosure**: After fix is released

## 🛡️ User Security Best Practices

### File System Security

```bash
# Set secure permissions for memory folder
chmod 700 ~/.memory/  # Only you can read/write

# Don't store in shared directories
MEMORY_PATH="/users/you/private/project"  # ✅ Good
MEMORY_PATH="/tmp/shared"                 # ❌ Bad
```

### Network Isolation (Optional Extra Security)

```bash
# Run in network namespace (Linux)
sudo unshare --net node adaptive-reasoning-server

# Block network with firewall (macOS)
sudo pfctl -e -f /dev/stdin <<< "block all"
```

### Regular Security Maintenance

- Run `npm audit` monthly to check dependencies
- Keep Node.js updated to latest LTS version
- Monitor `.memory/` folder for unexpected files

## 🔍 Supported Versions

| Version | Security Updates | Local-Only Verified |
| ------- | ---------------- | ------------------- |
| 1.0.x   | ✅ Active        | ✅ Audited          |
| < 1.0   | ❌ Deprecated    | ⚠️ Not verified     |

---

**This server prioritizes your privacy and security by keeping everything local.**
