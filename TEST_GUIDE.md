# Adaptive Reasoning Server - Test Guide

## Comprehensive Integration Test Suite

This repository includes a thorough integration test that validates **every aspect** of the Adaptive Reasoning Server.

## What Gets Tested

### 1. **Initialization & Setup**
- ✅ Memory manager initialization
- ✅ `.memory` folder created at project root (not nested)
- ✅ SQLite database creation
- ✅ Backup folder structure

### 2. **Branch Management**
- ✅ Default main branch exists
- ✅ Custom branch creation
- ✅ Branch listing
- ✅ Branch deletion (with main branch protection)

### 3. **Entity Operations**
- ✅ Entity creation in specific branches
- ✅ Entity retrieval by name
- ✅ Entity updates
- ✅ Entity deletion
- ✅ Bulk operations (50+ entities)

### 4. **LLM-Optimized Data Format**
- ✅ Clear, descriptive names
- ✅ Detailed content fields
- ✅ Categorized entity types (fact, pattern, decision, insight)
- ✅ Observations array for context
- ✅ Timestamps for temporal reasoning
- ✅ Structured format optimized for LLM parsing

### 5. **Semantic Search & Similarity**
- ✅ Exact name matching
- ✅ Semantic similarity calculation
- ✅ Keyword extraction
- ✅ Related entity detection

### 6. **Automatic Relationship Detection**
- ✅ Cross-entity relationship analysis
- ✅ Similarity-based connection creation
- ✅ Relationship indexing

### 7. **Cross-Branch Operations**
- ✅ Search across multiple branches
- ✅ Cross-branch references
- ✅ Entity discovery across contexts

### 8. **Observations & Context**
- ✅ Adding observations to entities
- ✅ Context accumulation
- ✅ Contextual metadata

### 9. **Data Import/Export**
- ✅ Branch export to JSON
- ✅ Data import from JSON
- ✅ Format preservation

### 10. **Memory Optimization**
- ✅ Content compression for LLMs
- ✅ Keyword extraction
- ✅ Named entity recognition
- ✅ Compression ratio measurement

### 11. **Data Persistence & Integrity**
- ✅ Data survives restart
- ✅ Branch persistence
- ✅ Entity persistence
- ✅ Relationship persistence

### 12. **Cross-Platform Compatibility**
- ✅ Path operations work on Windows
- ✅ Path operations work on macOS/Linux
- ✅ File system operations are normalized

## Running the Tests

### Full Test Suite (with rebuild)

```bash
npm test
```

This will:
1. Rebuild the entire project
2. Run all integration tests
3. Generate detailed output
4. Clean up test data

### Quick Test (skip rebuild)

```bash
npm run test:quick
```

Use this if you've already built the project and just want to run tests.

### Manual Test

```bash
# Build first
npm run build

# Run test directly
node test-adaptive-reasoning.js
```

## Test Output

The test suite provides colored, detailed output:

```
🚀 Starting Comprehensive Adaptive Reasoning Server Tests

======================================================================
1. INITIALIZATION & SETUP
======================================================================
✓ Memory manager initialized successfully
✓ .memory folder created at project root
  C:\your-project\test-memory-integration\.memory
✓ SQLite database created
  C:\your-project\test-memory-integration\.memory\memory.db
✓ Backups folder created
  C:\your-project\test-memory-integration\.memory\backups

... (continues through all 17 test sections)

======================================================================
TEST RESULTS SUMMARY
======================================================================

Total Tests: 65
Passed: 65
Failed: 0
Pass Rate: 100.0%

🎉 ALL TESTS PASSED! Adaptive Reasoning Server is fully operational!
```

## Test Data

The test creates realistic scenarios:

- **Authentication Branch**: JWT system, user models, login endpoints
- **Frontend Branch**: React architecture, state management
- **Backend Branch**: Database config, testing strategies

All test data is automatically cleaned up after tests complete.

## What Makes This Test Comprehensive

### 1. **Real-World Scenarios**
Tests use realistic project data (authentication systems, user models, API endpoints) that mirror actual usage.

### 2. **Complete Coverage**
Every public API method is tested, including:
- CRUD operations
- Search and retrieval
- Branch management
- Relationship detection
- Data optimization

### 3. **Integration Testing**
Tests the entire system working together, not just isolated units:
- Manager → SQLite → File System
- Manager → Similarity Engine → Relationships
- Manager → Optimizer → LLM Format

### 4. **LLM Optimization Verification**
Specifically validates that data is stored in formats optimized for LLM consumption:
- Structured entity types
- Rich contextual observations
- Keyword extraction
- Named entity recognition
- Compression analysis

### 5. **Cross-Platform Validation**
Ensures path operations work correctly on:
- Windows (backslash paths)
- macOS (forward slash paths)
- Linux (forward slash paths)

### 6. **Persistence Testing**
Verifies data survives:
- Manager restart
- Process restart
- Database reopening

### 7. **Stress Testing**
Tests system under load:
- Bulk creation (50+ entities)
- Bulk deletion
- Performance measurement

### 8. **Error Handling**
Validates proper error handling:
- Main branch deletion protection
- Invalid entity operations
- Missing data scenarios

## Interpreting Results

### All Green (100% Pass Rate)
✅ **System is production-ready**
- All features working
- Data integrity confirmed
- Cross-platform compatible

### Some Yellow/Red
⚠️ **Issues detected**
- Review failed test output
- Check error messages
- Fix issues before deployment

## Adding Your Own Tests

To extend the test suite, add new test sections to `test-adaptive-reasoning.js`:

```javascript
// ========================================================================
section('18. YOUR NEW TEST');
// ========================================================================

// Your test code here
const result = await manager.yourNewMethod();
assert(result === expected, 'Your test description', 'Optional details');
```

## Continuous Testing

Run tests:
- ✅ Before committing changes
- ✅ After pulling updates
- ✅ Before deploying
- ✅ After configuration changes

## Troubleshooting

### Tests won't run
```bash
# Ensure you've built the project
npm run build

# Check Node.js version (requires 18+)
node --version
```

### Tests fail on paths
- Check that `MEMORY_PATH` is not set globally
- Ensure write permissions in test directory

### Tests timeout
- Check for long-running processes
- Ensure database isn't locked by another process

## Performance Benchmarks

The test suite measures performance for key operations:

- **Entity Creation**: ~10-50ms per entity
- **Semantic Search**: ~100-300ms per query
- **Bulk Operations**: ~2-5s for 50 entities
- **Relationship Detection**: ~500ms-2s depending on corpus size

---

**Run the tests and ensure 100% pass rate before using the server in production!**

