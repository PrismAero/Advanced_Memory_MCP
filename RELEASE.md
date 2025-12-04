# Release Guide

## 🎯 **Publishing the Adaptive Reasoning Server**

This guide will be updated when CI/CD workflows are re-established for the single-server repository structure.

## 📦 **Package Information**

**Package Name:** `@prism.enterprises/adaptive-reasoning-server`  
**Current Version:** 3.1.0  
**Registry:** npm (public)

## 🔄 **Manual Publishing (Temporary)**

Until CI/CD is configured, you can publish manually:

```bash
# Build the project
npm run build

# Test that it works
npm run debug

# Publish to npm (requires npm authentication)
npm publish --access public
```

## 🏷️ **Version Strategy**

Following semantic versioning:

- **Major** (4.0.0): Breaking changes
- **Minor** (3.1.0): New features, backwards compatible
- **Patch** (3.0.1): Bug fixes, backwards compatible

## 📋 **Pre-Release Checklist**

- [ ] All tests pass
- [ ] Build completes without errors
- [ ] Documentation is up to date
- [ ] CHANGELOG.md is updated (if exists)
- [ ] Version number is bumped in package.json

## 🚀 **Installation**

Users can install the published package:

```bash
# Global installation
npm install -g @prism.enterprises/adaptive-reasoning-server

# Use with npx (no installation)
npx @prism.enterprises/adaptive-reasoning-server
```

---

**Note:** CI/CD workflows will be re-implemented to support automated testing and publishing for the single-server architecture.
