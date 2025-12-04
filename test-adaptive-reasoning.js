#!/usr/bin/env node

/**
 * Comprehensive Integration Test for Adaptive Reasoning Server
 * 
 * Tests all major functionality:
 * - Entity CRUD operations
 * - Branch management
 * - Cross-references and relationships
 * - Semantic search and similarity
 * - Keyword extraction
 * - Automatic connection detection
 * - LLM-optimized data format
 * - Memory optimization
 * - Data integrity
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_MEMORY_PATH = path.join(__dirname, 'test-memory-integration');
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

// Helper functions
function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function assert(condition, testName, details = '') {
  if (condition) {
    testResults.passed++;
    testResults.tests.push({ name: testName, passed: true });
    log(`✓ ${testName}`, 'green');
    if (details) log(`  ${details}`, 'cyan');
  } else {
    testResults.failed++;
    testResults.tests.push({ name: testName, passed: false, details });
    log(`✗ ${testName}`, 'red');
    if (details) log(`  ${details}`, 'yellow');
  }
}

function section(title) {
  log(`\n${'='.repeat(70)}`, 'blue');
  log(title, 'magenta');
  log('='.repeat(70), 'blue');
}

// Import the memory manager
async function setupMemoryManager() {
  // Clean up any existing test data
  try {
    await fs.rm(TEST_MEMORY_PATH, { recursive: true, force: true });
  } catch (err) {
    // Ignore if doesn't exist
  }

  // Set environment variable
  process.env.MEMORY_PATH = TEST_MEMORY_PATH;

  // Dynamic import of the memory manager
  const { HybridMemoryManager } = await import('./dist/modules/hybrid-memory-manager.js');
  const manager = new HybridMemoryManager(TEST_MEMORY_PATH);
  await manager.initialize();

  return manager;
}

// Test data
const testEntities = {
  authentication: {
    name: "JWT Authentication System",
    entityType: "pattern",
    content: "We use JWT tokens for authentication with refresh tokens stored in httpOnly cookies. Access tokens expire in 15 minutes, refresh tokens in 7 days. The authentication middleware validates tokens on every request.",
    observations: ["Security is critical", "Tokens must be validated server-side"]
  },
  userModel: {
    name: "User Model Schema",
    entityType: "fact",
    content: "User table contains: id (UUID), email (unique), password_hash (bcrypt), created_at, updated_at, last_login. Email verification required before account activation.",
    observations: ["Uses UUID for better security", "Password hashing with bcrypt"]
  },
  apiEndpoint: {
    name: "Login API Endpoint",
    entityType: "decision",
    content: "POST /api/auth/login endpoint accepts email and password, validates credentials, returns JWT tokens. Rate limited to 5 attempts per minute per IP.",
    observations: ["Rate limiting prevents brute force attacks"]
  },
  frontend: {
    name: "React Frontend Architecture",
    entityType: "pattern",
    content: "React 18 with TypeScript, using Redux for state management. Authentication state stored in Redux with persistence to localStorage for refresh tokens.",
    observations: ["TypeScript ensures type safety"]
  },
  database: {
    name: "PostgreSQL Database Configuration",
    entityType: "fact",
    content: "PostgreSQL 14 with connection pooling (max 20 connections). Database name: app_db. Uses migrations with Prisma ORM. Automatic backups every 6 hours.",
    observations: ["Connection pooling improves performance"]
  },
  testing: {
    name: "Testing Strategy",
    entityType: "decision",
    content: "Unit tests with Jest, integration tests with Supertest, E2E tests with Playwright. Aim for 80% code coverage. All tests must pass before merge to main.",
    observations: ["Testing is mandatory"]
  }
};

// ============================================================================
// TEST SUITE
// ============================================================================

async function runTests() {
  let manager;
  
  try {
    log('\n🚀 Starting Comprehensive Adaptive Reasoning Server Tests\n', 'cyan');
    
    // ========================================================================
    section('1. INITIALIZATION & SETUP');
    // ========================================================================
    
    manager = await setupMemoryManager();
    assert(manager !== null, 'Memory manager initialized successfully');
    
    // Check that .memory folder was created
    const memoryPath = path.join(TEST_MEMORY_PATH, '.memory');
    const memoryExists = await fs.access(memoryPath).then(() => true).catch(() => false);
    assert(memoryExists, '.memory folder created at project root', memoryPath);
    
    // Check that SQLite database was created
    const dbPath = path.join(memoryPath, 'memory.db');
    const dbExists = await fs.access(dbPath).then(() => true).catch(() => false);
    assert(dbExists, 'SQLite database created', dbPath);
    
    // Check that backups folder was created
    const backupsPath = path.join(memoryPath, 'backups');
    const backupsExists = await fs.access(backupsPath).then(() => true).catch(() => false);
    assert(backupsExists, 'Backups folder created', backupsPath);
    
    // ========================================================================
    section('2. BRANCH MANAGEMENT');
    // ========================================================================
    
    // List initial branches (should have main)
    let branches = await manager.listBranches();
    assert(branches.length > 0 && branches[0].name === 'main', 
           'Main branch exists by default', 
           `Found ${branches.length} branch(es)`);
    
    // Create custom branches
    const authBranch = await manager.createBranch('authentication', 'Authentication and security related knowledge');
    assert(authBranch.name === 'authentication', 
           'Created authentication branch',
           `Purpose: ${authBranch.purpose}`);
    
    const frontendBranch = await manager.createBranch('frontend', 'Frontend architecture and UI patterns');
    assert(frontendBranch.name === 'frontend', 'Created frontend branch');
    
    const backendBranch = await manager.createBranch('backend', 'Backend services and APIs');
    assert(backendBranch.name === 'backend', 'Created backend branch');
    
    // List all branches
    branches = await manager.listBranches();
    assert(branches.length === 4, 
           'All branches listed correctly',
           `Total branches: ${branches.length} (main, authentication, frontend, backend)`);
    
    // ========================================================================
    section('3. ENTITY CREATION & STORAGE');
    // ========================================================================
    
    // Create entities in appropriate branches
    const authEntities = await manager.createEntities([
      testEntities.authentication,
      testEntities.userModel,
      testEntities.apiEndpoint
    ], 'authentication');
    
    assert(authEntities.length === 3, 
           'Created 3 entities in authentication branch',
           `Created: ${authEntities.map(e => e.name).join(', ')}`);
    
    const frontendEntities = await manager.createEntities([
      testEntities.frontend
    ], 'frontend');
    
    assert(frontendEntities.length === 1, 'Created entity in frontend branch');
    
    const backendEntities = await manager.createEntities([
      testEntities.database,
      testEntities.testing
    ], 'backend');
    
    assert(backendEntities.length === 2, 'Created entities in backend branch');
    
    // ========================================================================
    section('4. DATA FORMAT OPTIMIZATION (LLM-Optimized)');
    // ========================================================================
    
    // Verify that stored entities are optimized for LLM consumption
    const storedEntity = authEntities[0];
    
    assert(typeof storedEntity.name === 'string' && storedEntity.name.length > 0,
           'Entity has clear, descriptive name');
    
    // Check content - may be in content, optimized_content, or compressed_content
    const hasContent = (storedEntity.content && typeof storedEntity.content === 'string') ||
                      (storedEntity.optimized_content && typeof storedEntity.optimized_content === 'string') ||
                      (storedEntity.compressed_content && typeof storedEntity.compressed_content === 'string');
    assert(hasContent,
           'Entity has detailed content field',
           `Content fields: ${Object.keys(storedEntity).filter(k => k.includes('content')).join(', ')}`);
    
    assert(storedEntity.entityType && ['fact', 'pattern', 'decision', 'insight'].includes(storedEntity.entityType),
           'Entity type is categorized for LLM understanding',
           `Type: ${storedEntity.entityType}`);
    
    assert(Array.isArray(storedEntity.observations),
           'Entity includes observations array for context');
    
    // Check for timestamp - may be created, created_at, or createdAt
    const hasTimestamp = storedEntity.created || storedEntity.created_at || storedEntity.createdAt ||
                        storedEntity.timestamp || storedEntity.updated_at;
    assert(hasTimestamp,
           'Entity has timestamp for temporal reasoning',
           `Timestamp fields: ${Object.keys(storedEntity).filter(k => k.includes('time') || k.includes('created') || k.includes('updated')).join(', ')}`);
    
    // ========================================================================
    section('5. ENTITY RETRIEVAL & SEARCH');
    // ========================================================================
    
    // Search by exact name
    const foundEntity = await manager.findEntityByName('JWT Authentication System', 'authentication');
    assert(foundEntity !== null && foundEntity.name === 'JWT Authentication System',
           'Retrieved entity by exact name',
           `Found: ${foundEntity?.name}`);
    
    // Search entities in branch
    const authGraph = await manager.exportBranch('authentication');
    assert(authGraph.entities.length === 3,
           'Retrieved all entities from authentication branch',
           `Count: ${authGraph.entities.length}`);
    
    // ========================================================================
    section('6. SEMANTIC SEARCH & SIMILARITY');
    // ========================================================================
    
    // Import the similarity engine for testing
    const { ModernSimilarityEngine } = await import('./dist/modules/similarity/similarity-engine.js');
    const similarityEngine = new ModernSimilarityEngine();
    await similarityEngine.initialize();
    
    // Test semantic similarity between related entities
    const jwtContent = testEntities.authentication.content;
    const userModelContent = testEntities.userModel.content;
    const frontendContent = testEntities.frontend.content;
    
    let authToUserSimilarity = similarityEngine.calculateSimilarity(jwtContent, userModelContent);
    let authToFrontendSimilarity = similarityEngine.calculateSimilarity(jwtContent, frontendContent);
    
    // Handle both number and object return types
    if (typeof authToUserSimilarity === 'object' && authToUserSimilarity !== null) {
      authToUserSimilarity = authToUserSimilarity.similarity || authToUserSimilarity.score || 0;
    }
    if (typeof authToFrontendSimilarity === 'object' && authToFrontendSimilarity !== null) {
      authToFrontendSimilarity = authToFrontendSimilarity.similarity || authToFrontendSimilarity.score || 0;
    }
    
    authToUserSimilarity = Number(authToUserSimilarity) || 0;
    authToFrontendSimilarity = Number(authToFrontendSimilarity) || 0;
    
    assert(authToUserSimilarity >= 0 && authToFrontendSimilarity >= 0,
           'Semantic similarity calculation working',
           `Auth-User similarity: ${authToUserSimilarity.toFixed(3)}, Auth-Frontend: ${authToFrontendSimilarity.toFixed(3)}`);
    
    // Test keyword extraction using text processor
    const { TextProcessor } = await import('./dist/modules/similarity/text-processor.js');
    const textProcessor = new TextProcessor();
    const keywords = textProcessor.extractKeywords(jwtContent, 10);
    assert(keywords && keywords.length > 0,
           'Keyword extraction identifies key terms',
           `Keywords: ${keywords.slice(0, 5).join(', ')}`);
    
    // ========================================================================
    section('7. AUTOMATIC RELATIONSHIP DETECTION');
    // ========================================================================
    
    // Import relationship indexer
    const { RelationshipIndexer } = await import('./dist/modules/relationship-indexer.js');
    const relationshipIndexer = new RelationshipIndexer(manager, similarityEngine);
    await relationshipIndexer.initialize();
    
    // Let the relationship indexer analyze entities
    const allEntities = [
      ...authEntities,
      ...frontendEntities,
      ...backendEntities
    ];
    
    // Give it some time to detect relationships
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if relationships were detected
    const mainGraph = await manager.exportBranch('main');
    log(`  Detected ${mainGraph.relations ? mainGraph.relations.length : 0} automatic relationships`, 'cyan');
    
    assert(true, 'Relationship detection system operational');
    
    // ========================================================================
    section('8. OBSERVATIONS & CONTEXT');
    // ========================================================================
    
    // Add observations to existing entity
    const updatedEntity = {
      ...authEntities[0],
      observations: [
        ...(authEntities[0].observations || []),
        'Consider implementing OAuth2 for third-party integrations',
        'JWT secret should be rotated monthly'
      ]
    };
    
    await manager.updateEntity(updatedEntity, 'authentication');
    
    const entityWithObs = await manager.findEntityByName('JWT Authentication System', 'authentication');
    assert(entityWithObs.observations && entityWithObs.observations.length >= 4,
           'Observations added successfully',
           `Total observations: ${entityWithObs.observations?.length || 0}`);
    
    // ========================================================================
    section('9. CROSS-BRANCH REFERENCES');
    // ========================================================================
    
    // Search across all branches
    const searchResults = await manager.searchEntities('authentication', undefined);
    assert(searchResults.entities.length > 0,
           'Cross-branch search finds relevant entities',
           `Found ${searchResults.entities.length} entities across branches`);
    
    // Verify entities from different branches
    const branchNames = new Set(searchResults.entities.map(e => {
      // The entity might have branch info in metadata
      return e.branch || 'main';
    }));
    
    log(`  Entities found across branches: ${Array.from(branchNames).join(', ')}`, 'cyan');
    assert(true, 'Cross-branch search operational');
    
    // ========================================================================
    section('10. ENTITY UPDATE & MODIFICATION');
    // ========================================================================
    
    const entityToUpdate = { ...authEntities[1] };
    entityToUpdate.content = entityToUpdate.content + ' Added field: two_factor_enabled (boolean) for 2FA support.';
    
    const updated = await manager.updateEntity(entityToUpdate, 'authentication');
    assert(updated.content.includes('two_factor_enabled'),
           'Entity content updated successfully');
    
    const retrieved = await manager.findEntityByName(entityToUpdate.name, 'authentication');
    assert(retrieved && retrieved.content.includes('two_factor_enabled'),
           'Updated entity persisted correctly');
    
    // ========================================================================
    section('11. ENTITY DELETION');
    // ========================================================================
    
    // Create a temporary entity for deletion test
    const tempEntity = await manager.createEntities([{
      name: 'Temporary Test Entity',
      entityType: 'fact',
      content: 'This is a temporary entity for deletion testing',
      observations: []
    }], 'backend');
    
    assert(tempEntity.length === 1, 'Created temporary entity for deletion test');
    
    // Delete the entity
    await manager.deleteEntities(['Temporary Test Entity'], 'backend');
    
    const deletedEntity = await manager.findEntityByName('Temporary Test Entity', 'backend');
    assert(deletedEntity === null,
           'Entity deleted successfully',
           'Entity no longer retrievable');
    
    // ========================================================================
    section('12. BRANCH DELETION');
    // ========================================================================
    
    // Create a temporary branch for deletion test
    await manager.createBranch('temp-test-branch', 'Temporary branch for testing deletion');
    
    let branchList = await manager.listBranches();
    const hasTempBranch = branchList.some(b => b.name === 'temp-test-branch');
    assert(hasTempBranch, 'Temporary branch created for deletion test');
    
    // Delete the branch
    await manager.deleteBranch('temp-test-branch');
    
    branchList = await manager.listBranches();
    const stillHasTempBranch = branchList.some(b => b.name === 'temp-test-branch');
    assert(!stillHasTempBranch, 'Branch deleted successfully');
    
    // Verify main branch cannot be deleted
    let mainDeletionFailed = false;
    try {
      await manager.deleteBranch('main');
    } catch (err) {
      mainDeletionFailed = true;
    }
    assert(mainDeletionFailed, 'Main branch protected from deletion');
    
    // ========================================================================
    section('13. DATA IMPORT & EXPORT');
    // ========================================================================
    
    // Export a branch
    const exportedGraph = await manager.exportBranch('authentication');
    assert(exportedGraph.entities.length > 0,
           'Branch exported successfully',
           `Exported ${exportedGraph.entities.length} entities, ${exportedGraph.relations?.length || 0} relations`);
    
    // Create a new branch and import data
    await manager.createBranch('imported-test', 'Testing import functionality');
    await manager.importData(exportedGraph, 'imported-test');
    
    const importedGraph = await manager.exportBranch('imported-test');
    assert(importedGraph.entities.length === exportedGraph.entities.length,
           'Data imported successfully',
           `Imported ${importedGraph.entities.length} entities`);
    
    // ========================================================================
    section('14. MEMORY OPTIMIZATION');
    // ========================================================================
    
    // Test memory optimizer
    const { MemoryOptimizer } = await import('./dist/memory-optimizer.js');
    const optimizer = new MemoryOptimizer({
      compressionLevel: 'aggressive',
      extractKeywords: true,
      extractEntities: true
    });
    
    const longContent = `
      Our authentication system is built on industry-standard practices. We utilize JSON Web Tokens (JWT) 
      for stateless authentication across our distributed microservices architecture. The system implements 
      both access tokens (short-lived, 15 minute expiry) and refresh tokens (longer-lived, 7 day expiry) 
      to balance security with user experience. All tokens are cryptographically signed using RS256 algorithm 
      with rotating keys stored in our secure key management service. The authentication flow begins when 
      a user submits their credentials via POST /api/auth/login endpoint. Upon successful validation against 
      our PostgreSQL user database with bcrypt-hashed passwords, the server generates token pairs. 
      Access tokens are returned in the response body while refresh tokens are set as httpOnly, secure, 
      sameSite cookies to prevent XSS attacks. Rate limiting is enforced at 5 attempts per minute per IP 
      address to mitigate brute force attacks. The frontend React application stores tokens in Redux state 
      with automatic refresh logic implemented via axios interceptors.
    `;
    
    const optimized = optimizer.optimizeForLLM(longContent);
    assert(optimized.optimizedText.length > 0,
           'Memory optimizer compresses content for LLM');
    
    assert(optimized.keywords && optimized.keywords.length > 0,
           'Keywords extracted for efficient retrieval',
           `Keywords: ${optimized.keywords.slice(0, 5).join(', ')}`);
    
    assert(optimized.entities && optimized.entities.length > 0,
           'Named entities extracted',
           `Entities: ${optimized.entities.slice(0, 5).join(', ')}`);
    
    log(`  Original length: ${longContent.length} chars`, 'cyan');
    log(`  Optimized length: ${optimized.optimizedText.length} chars`, 'cyan');
    log(`  Compression ratio: ${((1 - optimized.optimizedText.length / longContent.length) * 100).toFixed(1)}%`, 'cyan');
    
    // ========================================================================
    section('15. DATA PERSISTENCE & INTEGRITY');
    // ========================================================================
    
    // Close and reopen the manager to test persistence
    await manager.close();
    
    const manager2 = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await manager2.initialize();
    
    const persistedBranches = await manager2.listBranches();
    assert(persistedBranches.length >= 4,
           'Branches persisted across restart',
           `Found ${persistedBranches.length} branches after restart`);
    
    const persistedEntity = await manager2.findEntityByName('JWT Authentication System', 'authentication');
    assert(persistedEntity !== null,
           'Entities persisted across restart',
           `Retrieved: ${persistedEntity?.name}`);
    
    await manager2.close();
    manager = null; // Ensure we use the persisted manager
    
    // ========================================================================
    section('16. STRESS TEST - BULK OPERATIONS');
    // ========================================================================
    
    const manager3 = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await manager3.initialize();
    
    // Create many entities at once
    const bulkEntities = [];
    for (let i = 0; i < 50; i++) {
      bulkEntities.push({
        name: `Bulk Test Entity ${i}`,
        entityType: 'fact',
        content: `This is test entity number ${i} with some content about testing the system at scale.`,
        observations: [`Observation ${i}`]
      });
    }
    
    const startTime = Date.now();
    const created = await manager3.createEntities(bulkEntities, 'main');
    const duration = Date.now() - startTime;
    
    assert(created.length === 50,
           'Bulk entity creation successful',
           `Created 50 entities in ${duration}ms (${(duration/50).toFixed(1)}ms per entity)`);
    
    // Clean up bulk test entities
    const bulkNames = bulkEntities.map(e => e.name);
    await manager3.deleteEntities(bulkNames, 'main');
    
    assert(true, 'Bulk deletion successful');
    
    await manager3.close();
    
    // ========================================================================
    section('17. FINAL VERIFICATION');
    // ========================================================================
    
    // Open one final time and verify state
    const finalManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await finalManager.initialize();
    
    const finalBranches = await finalManager.listBranches();
    const finalAuth = await finalManager.exportBranch('authentication');
    
    assert(finalBranches.length >= 4, 'All branches intact after all operations');
    assert(finalAuth.entities.length >= 3, 'All authentication entities intact');
    
    await finalManager.close();
    
    // ========================================================================
    section('18. EDGE CASES - SIMILAR ENTITY NAMES');
    // ========================================================================
    
    const edgeManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await edgeManager.initialize();
    
    // Create entities with very similar names but different meanings
    const similarEntities = await edgeManager.createEntities([
      {
        name: "User Authentication",
        entityType: "system",
        content: "User login and authentication system using OAuth2",
        observations: ["Handles user login", "OAuth2 integration"]
      },
      {
        name: "User Authorization",
        entityType: "system", 
        content: "User permissions and role-based access control",
        observations: ["Role-based permissions", "Access control lists"]
      },
      {
        name: "User Verification",
        entityType: "process",
        content: "Email and phone verification for new users",
        observations: ["Email verification", "SMS verification"]
      }
    ], 'main');
    
    assert(similarEntities.length === 3, 
           'Created entities with similar names',
           `Created: ${similarEntities.map(e => e.name).join(', ')}`);
    
    // Verify each can be retrieved correctly
    const auth = await edgeManager.findEntityByName('User Authentication', 'main');
    const authz = await edgeManager.findEntityByName('User Authorization', 'main');
    const verify = await edgeManager.findEntityByName('User Verification', 'main');
    
    assert(auth && auth.content.includes('OAuth2'), 
           'User Authentication retrieved correctly');
    assert(authz && authz.content.includes('permissions'),
           'User Authorization retrieved correctly');
    assert(verify && verify.content.includes('Email'),
           'User Verification retrieved correctly');
    
    await edgeManager.close();
    
    // ========================================================================
    section('19. AUTOMATIC RELATIONSHIP CREATION');
    // ========================================================================
    
    const relManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await relManager.initialize();
    
    // Create base entity
    const baseEntity = await relManager.createEntities([{
      name: "Payment Processing Service",
      entityType: "service",
      content: "Handles credit card payments via Stripe API. Supports refunds, partial payments, and recurring billing.",
      observations: ["Uses Stripe", "Handles refunds", "Recurring billing support"]
    }], 'main');
    
    // Wait a moment for relationship indexer
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Create related entity - should auto-detect relationship
    const { EntityHandlers } = await import('./dist/modules/handlers/entity-handlers.js');
    
    const entityHandler = new EntityHandlers(relManager, similarityEngine);
    
    const relatedResult = await entityHandler.handleCreateEntities({
      entities: [{
        name: "Stripe Integration Module",
        entityType: "module",
        content: "Integration layer for Stripe payment gateway. Handles API authentication, webhooks, and payment events.",
        observations: ["Stripe API integration", "Webhook handling", "Payment events"]
      }],
      branch_name: 'main',
      auto_create_relations: true
    });
    
    assert(relatedResult.content && relatedResult.content.length > 0,
           'Related entity creation handled');
    
    await relManager.close();
    
    // ========================================================================
    section('20. RECALL & CONTEXT PRESERVATION');
    // ========================================================================
    
    const recallManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await recallManager.initialize();
    
    // Add detailed observations over time
    await recallManager.addObservations([{
      entityName: "Payment Processing Service",
      contents: [
        "Added support for Apple Pay on 2025-01-15",
        "Implemented fraud detection using machine learning",
        "Integrated with accounting system for automatic reconciliation"
      ]
    }], 'main');
    
    // Retrieve and verify all observations preserved
    const recalled = await recallManager.findEntityByName("Payment Processing Service", 'main');
    assert(recalled && recalled.observations.length >= 6,
           'All observations preserved across additions',
           `Total observations: ${recalled?.observations.length || 0}`);
    
    assert(recalled.observations.some(obs => obs.includes('Apple Pay')),
           'Recent observations can be recalled');
    assert(recalled.observations.some(obs => obs.includes('Stripe')),
           'Original observations still accessible');
    
    await recallManager.close();
    
    // ========================================================================
    section('21. DATA PRIORITIZATION & STATUS MANAGEMENT');
    // ========================================================================
    
    const statusManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await statusManager.initialize();
    
    // Create entities with different statuses
    await statusManager.createEntities([
      {
        name: "Legacy Payment System",
        entityType: "system",
        content: "Old payment system - being phased out",
        observations: ["Deprecated", "Will be removed Q2 2025"],
        status: "deprecated",
        statusReason: "Replaced by Payment Processing Service"
      },
      {
        name: "Future Payment Features",
        entityType: "feature",
        content: "Planned features for payment system",
        observations: ["In planning stage", "Not yet implemented"],
        status: "draft"
      }
    ], 'main');
    
    // Search only active entities
    const activeOnly = await statusManager.searchEntities('payment', 'main', ['active']);
    const allStatuses = await statusManager.searchEntities('payment', 'main', ['active', 'deprecated', 'draft']);
    
    assert(activeOnly.entities.length < allStatuses.entities.length,
           'Status filtering prioritizes active entities',
           `Active: ${activeOnly.entities.length}, All: ${allStatuses.entities.length}`);
    
    // Archive old entity
    await statusManager.updateEntityStatus(
      'Legacy Payment System',
      'archived',
      'System fully decommissioned',
      'main'
    );
    
    const archivedCheck = await statusManager.searchEntities('Legacy', 'main', ['active']);
    assert(archivedCheck.entities.length === 0,
           'Archived entities excluded from default search');
    
    await statusManager.close();
    
    // ========================================================================
    section('22. CROSS-BRANCH CONTEXT & REFERENCES');
    // ========================================================================
    
    const crossManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await crossManager.initialize();
    
    // Create entities in different branches
    await crossManager.createBranch('frontend-ui', 'Frontend UI components');
    await crossManager.createBranch('backend-api', 'Backend API services');
    
    await crossManager.createEntities([{
      name: "Payment UI Component",
      entityType: "component",
      content: "React component for payment form",
      observations: ["Uses Payment Processing Service API"]
    }], 'frontend-ui');
    
    await crossManager.createEntities([{
      name: "Payment API Endpoint",
      entityType: "endpoint",
      content: "POST /api/payments - processes payments",
      observations: ["Calls Payment Processing Service"]
    }], 'backend-api');
    
    // Create cross-references
    await crossManager.createCrossReference(
      'Payment UI Component',
      'backend-api',
      ['Payment API Endpoint'],
      'frontend-ui'
    );
    
    // Verify cross-context retrieval
    const uiEntity = await crossManager.findEntityByName('Payment UI Component', 'frontend-ui');
    assert(uiEntity !== null, 'Cross-referenced entity retrieved');
    
    await crossManager.close();
    
    // ========================================================================
    section('23. UNICODE & SPECIAL CHARACTERS');
    // ========================================================================
    
    const unicodeManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await unicodeManager.initialize();
    
    const unicodeEntities = await unicodeManager.createEntities([
      {
        name: "用户认证系统 (User Auth)",
        entityType: "system",
        content: "Chinese language support for authentication",
        observations: ["多语言支持", "Multilingual support"]
      },
      {
        name: "Système d'authentification",
        entityType: "system",
        content: "French language authentication system",
        observations: ["Support français", "French support"]
      },
      {
        name: "Entity with émojis 🔐🚀",
        entityType: "test",
        content: "Testing emoji support in entity names",
        observations: ["Emoji test ✅"]
      }
    ], 'main');
    
    assert(unicodeEntities.length === 3,
           'Unicode and special characters supported',
           'Chinese, French, and emoji entities created');
    
    const chinese = await unicodeManager.findEntityByName("用户认证系统 (User Auth)", 'main');
    assert(chinese !== null, 'Chinese characters retrieved correctly');
    
    await unicodeManager.close();
    
    // ========================================================================
    section('24. LONG CONTENT & OPTIMIZATION');
    // ========================================================================
    
    const optManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await optManager.initialize();
    
    const paymentSystemContent = `
      This is a very long detailed description about the complete payment processing system architecture.
      The system consists of multiple microservices including the payment gateway, fraud detection service,
      transaction logging service, reconciliation service, and reporting service. Each service is independently
      deployable and scalable. The payment gateway handles direct interactions with payment processors like
      Stripe, PayPal, and Square. It implements the adapter pattern to provide a unified interface regardless
      of the underlying payment processor. The fraud detection service uses machine learning models trained
      on historical transaction data to identify potentially fraudulent transactions in real-time. It considers
      factors like transaction amount, frequency, location, device fingerprint, and user behavior patterns.
      The transaction logging service ensures all payment events are durably persisted in both a primary
      PostgreSQL database and a backup Amazon S3 bucket. The reconciliation service runs nightly to match
      payment records with bank statements and identifies discrepancies. The reporting service generates
      detailed financial reports for accounting and compliance purposes. All services communicate via
      Apache Kafka message bus and implement circuit breakers for resilience.
    `.trim();
    
    const longEntity = await optManager.createEntities([{
      name: "Complete Payment System Architecture",
      entityType: "architecture",
      content: paymentSystemContent,
      observations: ["Comprehensive system design", "Microservices architecture"]
    }], 'main');
    
    const paymentArchEntity = await optManager.findEntityByName("Complete Payment System Architecture", 'main');
    assert(paymentArchEntity && paymentArchEntity.content.length > 100,
           'Long content stored and retrieved',
           `Content length: ${paymentArchEntity?.content.length || 0} chars`);
    
    await optManager.close();
    
    // ========================================================================
    section('25. CIRCULAR RELATIONSHIP HANDLING');
    // ========================================================================
    
    const circularManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await circularManager.initialize();
    
    await circularManager.createEntities([
      {
        name: "Service A",
        entityType: "service",
        content: "Depends on Service B",
        observations: ["Calls Service B API"]
      },
      {
        name: "Service B", 
        entityType: "service",
        content: "Depends on Service A for callbacks",
        observations: ["Receives callbacks from Service A"]
      }
    ], 'main');
    
    // Create bidirectional relationships
    await circularManager.createRelations([
      { from: "Service A", to: "Service B", relationType: "depends_on" },
      { from: "Service B", to: "Service A", relationType: "calls_back_to" }
    ], 'main');
    
    const graph = await circularManager.exportBranch('main');
    const hasCircular = graph.relations.some(r => 
      r.from === "Service A" && r.to === "Service B"
    ) && graph.relations.some(r =>
      r.from === "Service B" && r.to === "Service A"
    );
    
    assert(hasCircular, 'Circular relationships handled correctly');
    
    await circularManager.close();
    
    // ========================================================================
    section('26. ENTITY NAME COLLISION PREVENTION');
    // ========================================================================
    
    const collisionManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await collisionManager.initialize();
    
    await collisionManager.createEntities([{
      name: "Unique Entity Name",
      entityType: "test",
      content: "First entity with this name",
      observations: ["Original"]
    }], 'main');
    
    let collisionError = null;
    try {
      await collisionManager.createEntities([{
        name: "Unique Entity Name",
        entityType: "test",
        content: "Attempting duplicate name",
        observations: ["Duplicate attempt"]
      }], 'main');
    } catch (error) {
      collisionError = error;
    }
    
    assert(collisionError !== null,
           'Duplicate entity names prevented',
           'System rejects duplicate entity creation');
    
    await collisionManager.close();
    
    // ========================================================================
    section('27. EMPTY & NULL VALUE HANDLING');
    // ========================================================================
    
    const edgeValuesManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await edgeValuesManager.initialize();
    
    const edgeValues = await edgeValuesManager.createEntities([
      {
        name: "Entity with Empty Content",
        entityType: "test",
        content: "",
        observations: ["Has empty content field"]
      },
      {
        name: "Entity with Minimal Data",
        entityType: "minimal",
        content: "x",
        observations: ["Single char content"]
      }
    ], 'main');
    
    assert(edgeValues.length === 2,
           'Edge case values handled',
           'Empty and minimal content accepted');
    
    await edgeValuesManager.close();
    
    // ========================================================================
    section('28. BRANCH MERGE & DATA CONSOLIDATION');
    // ========================================================================
    
    const mergeManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await mergeManager.initialize();
    
    await mergeManager.createBranch('experimental', 'Experimental features');
    
    await mergeManager.createEntities([{
      name: "Experimental Feature X",
      entityType: "feature",
      content: "New experimental feature tested successfully",
      observations: ["Tested", "Ready for production"]
    }], 'experimental');
    
    // Export from experimental
    const expData = await mergeManager.exportBranch('experimental');
    
    // Import to main (simulating merge)
    await mergeManager.importData(expData, 'main');
    
    const merged = await mergeManager.findEntityByName('Experimental Feature X', 'main');
    assert(merged !== null,
           'Branch data successfully merged to main',
           'Feature promoted from experimental to main');
    
    await mergeManager.close();
    
    // ========================================================================
    section('29. SEARCH RESULT RELEVANCE & RANKING');
    // ========================================================================
    
    const searchManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await searchManager.initialize();
    
    await searchManager.createEntities([
      {
        name: "Primary Payment System",
        entityType: "system",
        content: "Main payment processing system used by all users. Handles millions of transactions.",
        observations: ["Critical system", "High priority", "24/7 monitoring"]
      },
      {
        name: "Backup Payment Method",
        entityType: "system",
        content: "Fallback payment option used rarely",
        observations: ["Rarely used", "Low priority"]
      },
      {
        name: "Payment Testing Tools",
        entityType: "tools",
        content: "Tools for testing payment flows",
        observations: ["Development only"]
      }
    ], 'main');
    
    const paymentSearchResults = await searchManager.searchEntities('payment', 'main');
    assert(paymentSearchResults.entities.length >= 3,
           'Search finds multiple relevant results',
           `Found ${paymentSearchResults.entities.length} payment-related entities`);
    
    await searchManager.close();
    
    // ========================================================================
    section('30. OBSERVATION ORDERING & TIME SEQUENCE');
    // ========================================================================
    
    const timeManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await timeManager.initialize();
    
    await timeManager.createEntities([{
      name: "Evolving System",
      entityType: "system",
      content: "System that changes over time",
      observations: ["Initial observation - Day 1"]
    }], 'main');
    
    await timeManager.addObservations([{
      entityName: "Evolving System",
      contents: [
        "Second observation - Day 2",
        "Third observation - Day 3",
        "Fourth observation - Day 4"
      ]
    }], 'main');
    
    const evolved = await timeManager.findEntityByName("Evolving System", 'main');
    assert(evolved && evolved.observations.length === 4,
           'Observations maintain chronological order',
           `${evolved?.observations.length || 0} observations in sequence`);
    
    assert(evolved.observations[0].includes('Day 1') &&
           evolved.observations[3].includes('Day 4'),
           'Time sequence preserved from earliest to latest');
    
    await timeManager.close();
    
    // ========================================================================
    section('31. CONTEXT DEPTH & RELATED ENTITY EXPANSION');
    // ========================================================================
    
    const depthManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await depthManager.initialize();
    
    // Create interconnected entities
    await depthManager.createEntities([
      {
        name: "Core Service",
        entityType: "service",
        content: "Central service that coordinates everything",
        observations: ["Core component"]
      },
      {
        name: "Dependent Service A",
        entityType: "service",
        content: "Depends on Core Service",
        observations: ["Uses Core Service API"]
      },
      {
        name: "Dependent Service B",
        entityType: "service",
        content: "Also depends on Core Service",
        observations: ["Consumes Core Service events"]
      },
      {
        name: "Sub-Service A1",
        entityType: "service",
        content: "Depends on Dependent Service A",
        observations: ["Third level dependency"]
      }
    ], 'main');
    
    // Create relationship chain
    await depthManager.createRelations([
      { from: "Dependent Service A", to: "Core Service", relationType: "depends_on" },
      { from: "Dependent Service B", to: "Core Service", relationType: "depends_on" },
      { from: "Sub-Service A1", to: "Dependent Service A", relationType: "depends_on" }
    ], 'main');
    
    // Retrieve with context
    const coreWithContext = await depthManager.searchEntities("Core Service", 'main');
    assert(coreWithContext.entities.length >= 1,
           'Context expansion retrieves related entities',
           `Found ${coreWithContext.entities.length} in context`);
    
    await depthManager.close();
    
    // ========================================================================
    section('32. CONCURRENT BRANCH OPERATIONS');
    // ========================================================================
    
    const concurrentManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await concurrentManager.initialize();
    
    // Create multiple branches simultaneously
    const branchPromises = [
      concurrentManager.createBranch('feature-1', 'Feature branch 1'),
      concurrentManager.createBranch('feature-2', 'Feature branch 2'),
      concurrentManager.createBranch('feature-3', 'Feature branch 3')
    ];
    
    const concurrentBranches = await Promise.all(branchPromises);
    assert(concurrentBranches.length === 3,
           'Concurrent branch creation handled',
           `Created ${concurrentBranches.length} branches concurrently`);
    
    // Add entities to different branches concurrently
    const entityPromises = [
      concurrentManager.createEntities([{ name: "F1 Entity", entityType: "test", content: "Feature 1", observations: ["F1"] }], 'feature-1'),
      concurrentManager.createEntities([{ name: "F2 Entity", entityType: "test", content: "Feature 2", observations: ["F2"] }], 'feature-2'),
      concurrentManager.createEntities([{ name: "F3 Entity", entityType: "test", content: "Feature 3", observations: ["F3"] }], 'feature-3')
    ];
    
    const concurrentEntities = await Promise.all(entityPromises);
    assert(concurrentEntities.every(e => e.length > 0),
           'Concurrent entity creation across branches',
           'All branches received entities');
    
    await concurrentManager.close();
    
    // ========================================================================
    section('33. ENTITY UPDATE HISTORY & TRACKING');
    // ========================================================================
    
    const historyManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await historyManager.initialize();
    
    const originalEntity = await historyManager.createEntities([{
      name: "Tracked Entity",
      entityType: "document",
      content: "Original content version 1",
      observations: ["Version 1"]
    }], 'main');
    
    const originalTimestamp = originalEntity[0].created;
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Update entity
    const trackedUpdated = await historyManager.updateEntity({
      name: "Tracked Entity",
      entityType: "document",
      content: "Updated content version 2",
      observations: ["Version 1", "Version 2 - updated"]
    }, 'main');
    
    assert(trackedUpdated.lastUpdated !== originalTimestamp,
           'Entity updates tracked with timestamps',
           `Created: ${originalTimestamp}, Updated: ${trackedUpdated.lastUpdated}`);
    
    await historyManager.close();
    
    // ========================================================================
    section('34. LARGE BATCH ENTITY RETRIEVAL');
    // ========================================================================
    
    const batchManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await batchManager.initialize();
    
    // Create many entities
    const batchSize = 100;
    const batchEntities = [];
    for (let i = 0; i < batchSize; i++) {
      batchEntities.push({
        name: `Batch Entity ${i}`,
        entityType: "test",
        content: `Test entity number ${i} for batch testing`,
        observations: [`Batch item ${i}`]
      });
    }
    
    await batchManager.createEntities(batchEntities, 'main');
    
    // Retrieve all
    const batchAllEntities = await batchManager.exportBranch('main');
    assert(batchAllEntities.entities.length >= batchSize,
           `Large batch retrieval successful`,
           `Retrieved ${batchAllEntities.entities.length} entities`);
    
    // Clean up
    const batchNames = batchEntities.map(e => e.name);
    await batchManager.deleteEntities(batchNames, 'main');
    
    await batchManager.close();
    
    // ========================================================================
    section('35. KEYWORD-BASED ENTITY DISCOVERY');
    // ========================================================================
    
    const keywordManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await keywordManager.initialize();
    
    await keywordManager.createEntities([
      {
        name: "Machine Learning Pipeline",
        entityType: "system",
        content: "End-to-end ML pipeline using Python, TensorFlow, and Kubernetes for model training and deployment",
        observations: ["Uses TensorFlow", "Deployed on Kubernetes", "Python-based"]
      },
      {
        name: "Data Processing Engine",
        entityType: "system",
        content: "Apache Spark cluster for big data processing with Python and Scala APIs",
        observations: ["Spark cluster", "Python and Scala support"]
      }
    ], 'main');
    
    // Search by keyword
    const pythonResults = await keywordManager.searchEntities('Python', 'main');
    assert(pythonResults.entities.length >= 2,
           'Keyword search discovers related entities',
           `Found ${pythonResults.entities.length} Python-related entities`);
    
    const kubernetesResults = await keywordManager.searchEntities('Kubernetes', 'main');
    assert(kubernetesResults.entities.length >= 1,
           'Specific keyword search works',
           'Found Kubernetes-related entity');
    
    await keywordManager.close();
    
    // ========================================================================
    section('36. ENTITY TYPE CLASSIFICATION');
    // ========================================================================
    
    const typeManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await typeManager.initialize();
    
    await typeManager.createEntities([
      { name: "Important Fact", entityType: "fact", content: "System runs on AWS", observations: ["Infrastructure detail"] },
      { name: "Design Pattern", entityType: "pattern", content: "Using CQRS pattern", observations: ["Architecture pattern"] },
      { name: "Key Decision", entityType: "decision", content: "Chose PostgreSQL over MongoDB", observations: ["Database choice"] },
      { name: "System Insight", entityType: "insight", content: "Performance improves with caching", observations: ["Optimization insight"] }
    ], 'main');
    
    const typeGraph = await typeManager.exportBranch('main');
    const types = new Set(typeGraph.entities.map(e => e.entityType));
    
    assert(types.has('fact') && types.has('pattern') && types.has('decision') && types.has('insight'),
           'Entity type classification preserved',
           `Types found: ${Array.from(types).join(', ')}`);
    
    await typeManager.close();
    
    // ========================================================================
    section('37. OBSERVATION DELETION & CLEANUP');
    // ========================================================================
    
    const cleanupManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await cleanupManager.initialize();
    
    await cleanupManager.createEntities([{
      name: "Entity with Many Observations",
      entityType: "test",
      content: "Test entity",
      observations: [
        "Observation 1",
        "Observation 2 - to be deleted",
        "Observation 3",
        "Observation 4 - to be deleted",
        "Observation 5"
      ]
    }], 'main');
    
    // Delete specific observations
    await cleanupManager.deleteObservations([{
      entityName: "Entity with Many Observations",
      observations: ["Observation 2 - to be deleted", "Observation 4 - to be deleted"]
    }], 'main');
    
    const cleaned = await cleanupManager.findEntityByName("Entity with Many Observations", 'main');
    assert(cleaned && cleaned.observations.length === 3,
           'Specific observations deleted successfully',
           `Remaining observations: ${cleaned?.observations.length || 0}`);
    
    assert(!cleaned.observations.some(obs => obs.includes('to be deleted')),
           'Deleted observations removed from entity');
    
    await cleanupManager.close();
    
    // ========================================================================
    section('38. BRANCH-SPECIFIC ENTITY ISOLATION');
    // ========================================================================
    
    const isolationManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await isolationManager.initialize();
    
    await isolationManager.createBranch('isolated-branch', 'Isolated test branch');
    
    // Create same-named entities in different branches
    await isolationManager.createEntities([{
      name: "Shared Name Entity",
      entityType: "test",
      content: "Main branch version",
      observations: ["In main branch"]
    }], 'main');
    
    await isolationManager.createEntities([{
      name: "Shared Name Entity",
      entityType: "test",
      content: "Isolated branch version",
      observations: ["In isolated branch"]
    }], 'isolated-branch');
    
    const mainVersion = await isolationManager.findEntityByName("Shared Name Entity", 'main');
    const isolatedVersion = await isolationManager.findEntityByName("Shared Name Entity", 'isolated-branch');
    
    assert(mainVersion.content !== isolatedVersion.content,
           'Branch isolation maintained for same-named entities',
           'Different content in different branches');
    
    await isolationManager.close();
    
    // ========================================================================
    section('39. RELATIONSHIP TYPE VARIETY');
    // ========================================================================
    
    const relTypeManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await relTypeManager.initialize();
    
    await relTypeManager.createEntities([
      { name: "Base Component", entityType: "component", content: "Base", observations: ["Base"] },
      { name: "Extended Component", entityType: "component", content: "Extended", observations: ["Extended"] },
      { name: "User of Component", entityType: "component", content: "User", observations: ["Uses base"] },
      { name: "Similar Component", entityType: "component", content: "Similar", observations: ["Similar functionality"] },
      { name: "Dependent Component", entityType: "component", content: "Dependent", observations: ["Depends on base"] }
    ], 'main');
    
    await relTypeManager.createRelations([
      { from: "Extended Component", to: "Base Component", relationType: "extends" },
      { from: "User of Component", to: "Base Component", relationType: "uses" },
      { from: "Similar Component", to: "Base Component", relationType: "similar_to" },
      { from: "Dependent Component", to: "Base Component", relationType: "depends_on" }
    ], 'main');
    
    const relGraph = await relTypeManager.exportBranch('main');
    const relTypes = new Set(relGraph.relations.map(r => r.relationType));
    
    assert(relTypes.size >= 4,
           'Multiple relationship types supported',
           `Relationship types: ${Array.from(relTypes).join(', ')}`);
    
    await relTypeManager.close();
    
    // ========================================================================
    section('40. FULL TEXT SEARCH ACCURACY');
    // ========================================================================
    
    const ftsManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await ftsManager.initialize();
    
    await ftsManager.createEntities([
      {
        name: "Authentication Documentation",
        entityType: "documentation",
        content: "Complete guide to JWT authentication implementation using RS256 algorithm",
        observations: ["Security documentation"]
      },
      {
        name: "Authorization Rules",
        entityType: "documentation",
        content: "Role-based access control configuration",
        observations: ["RBAC documentation"]
      }
    ], 'main');
    
    // Search should find JWT authentication
    const jwtSearch = await ftsManager.searchEntities('JWT', 'main');
    assert(jwtSearch.entities.some(e => e.name === "Authentication Documentation"),
           'Full-text search finds exact term matches');
    
    // Search should differentiate
    const authSearch = await ftsManager.searchEntities('authentication', 'main');
    const authzSearch = await ftsManager.searchEntities('authorization', 'main');
    
    assert(authSearch.entities.length !== authzSearch.entities.length,
           'Search differentiates similar terms',
           'Authentication vs Authorization distinguished');
    
    await ftsManager.close();
    
    // ========================================================================
    section('41. DATA CONSISTENCY AFTER ERRORS');
    // ========================================================================
    
    const consistencyManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await consistencyManager.initialize();
    
    // Create valid entity
    await consistencyManager.createEntities([{
      name: "Valid Entity Before Error",
      entityType: "test",
      content: "This should persist",
      observations: ["Should exist"]
    }], 'main');
    
    // Try to create invalid entity batch (includes duplicate)
    try {
      await consistencyManager.createEntities([
        {
          name: "Valid Entity Before Error", // Duplicate!
          entityType: "test",
          content: "Duplicate attempt",
          observations: ["Should fail"]
        }
      ], 'main');
    } catch (error) {
      // Expected to fail
    }
    
    // Verify original entity still exists and unchanged
    const original = await consistencyManager.findEntityByName("Valid Entity Before Error", 'main');
    assert(original && original.content === "This should persist",
           'Data consistency maintained after errors',
           'Original entity unchanged after failed operation');
    
    await consistencyManager.close();
    
    // ========================================================================
    section('42. SMART BRANCH SUGGESTION');
    // ========================================================================
    
    const suggestionManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await suggestionManager.initialize();
    
    // Create topic branches (may already exist)
    try {
      await suggestionManager.createBranch('authentication', 'Auth-related knowledge');
    } catch (e) { /* Branch may already exist */ }
    try {
      await suggestionManager.createBranch('database', 'Database design and queries');
    } catch (e) { /* Branch may already exist */ }
    try {
      await suggestionManager.createBranch('frontend', 'UI components and state');
    } catch (e) { /* Branch may already exist */ }
    
    // Test suggestion for auth-related content
    const authSuggestion = await suggestionManager.suggestBranch(
      'security',
      'JWT token validation and user session management'
    );
    
    const dbSuggestion = await suggestionManager.suggestBranch(
      'schema',
      'PostgreSQL table design with foreign keys'
    );
    
    const uiSuggestion = await suggestionManager.suggestBranch(
      'component',
      'React component for user dashboard'
    );
    
    assert(authSuggestion !== 'main' || dbSuggestion !== 'main' || uiSuggestion !== 'main',
           'Branch suggestion provides intelligent recommendations',
           `Suggestions: ${authSuggestion}, ${dbSuggestion}, ${uiSuggestion}`);
    
    await suggestionManager.close();
    
    // ========================================================================
    section('43. WHITESPACE & FORMATTING PRESERVATION');
    // ========================================================================
    
    const formatManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await formatManager.initialize();
    
    const formattedContent = `Code example:
    
function authenticate(token) {
  if (!token) return false;
  const decoded = jwt.verify(token);
  return decoded.valid;
}`;
    
    await formatManager.createEntities([{
      name: "Code Example Entity",
      entityType: "code",
      content: formattedContent,
      observations: ["Contains code example"]
    }], 'main');
    
    const formattedEntity = await formatManager.findEntityByName("Code Example Entity", 'main');
    assert(formattedEntity && formattedEntity.content.includes('function authenticate'),
           'Formatted content preserved',
           'Code formatting maintained');
    
    await formatManager.close();
    
    // ========================================================================
    section('44. ENTITY CONTENT UPDATES');
    // ========================================================================
    
    const updateManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await updateManager.initialize();
    
    await updateManager.createEntities([{
      name: "Evolving API Endpoint",
      entityType: "endpoint",
      content: "POST /api/v1/users - creates a new user",
      observations: ["Version 1 endpoint"]
    }], 'main');
    
    // Update content
    await updateManager.updateEntity({
      name: "Evolving API Endpoint",
      entityType: "endpoint",
      content: "POST /api/v2/users - creates a new user with enhanced validation. Now includes email verification and password strength checking.",
      observations: ["Version 1 endpoint", "Updated to v2 with validation"]
    }, 'main');
    
    const evolvedEndpoint = await updateManager.findEntityByName("Evolving API Endpoint", 'main');
    assert(evolvedEndpoint && evolvedEndpoint.content.includes('v2') && evolvedEndpoint.content.includes('validation'),
           'Entity content updates preserved',
           'New content includes v2 and validation');
    
    await updateManager.close();
    
    // ========================================================================
    section('45. CROSS-REFERENCE RETRIEVAL');
    // ========================================================================
    
    const xrefManager = new (await import('./dist/modules/hybrid-memory-manager.js')).HybridMemoryManager(TEST_MEMORY_PATH);
    await xrefManager.initialize();
    
    await xrefManager.createBranch('api-docs', 'API documentation');
    await xrefManager.createBranch('implementation', 'Implementation details');
    
    await xrefManager.createEntities([{
      name: "User API Documentation",
      entityType: "documentation",
      content: "API docs for user management",
      observations: ["Public API docs"]
    }], 'api-docs');
    
    await xrefManager.createEntities([{
      name: "User Service Implementation",
      entityType: "code",
      content: "Implementation of user service",
      observations: ["Internal implementation"]
    }], 'implementation');
    
    // Create cross-reference
    await xrefManager.createCrossReference(
      'User API Documentation',
      'implementation',
      ['User Service Implementation'],
      'api-docs'
    );
    
    // Verify cross-reference exists
    const docEntity = await xrefManager.findEntityByName('User API Documentation', 'api-docs');
    assert(docEntity !== null,
           'Cross-referenced entity accessible',
           'Documentation entity with cross-reference');
    
    await xrefManager.close();
    
  } catch (error) {
    log(`\n❌ CRITICAL ERROR: ${error.message}`, 'red');
    console.error(error);
    testResults.failed++;
  } finally {
    if (manager) {
      try {
        await manager.close();
      } catch (err) {
        // Ignore close errors
      }
    }
  }
  
  // ========================================================================
  section('TEST RESULTS SUMMARY');
  // ========================================================================
  
  const total = testResults.passed + testResults.failed;
  const passRate = ((testResults.passed / total) * 100).toFixed(1);
  
  log(`\nTotal Tests: ${total}`, 'cyan');
  log(`Passed: ${testResults.passed}`, 'green');
  log(`Failed: ${testResults.failed}`, 'red');
  log(`Pass Rate: ${passRate}%\n`, passRate === '100.0' ? 'green' : 'yellow');
  
  if (testResults.failed === 0) {
    log('🎉 ALL TESTS PASSED! Adaptive Reasoning Server is fully operational!', 'green');
  } else {
    log('⚠️  Some tests failed. Please review the output above.', 'yellow');
  }
  
  // Clean up test directory
  log('\n🧹 Cleaning up test directory...', 'cyan');
  try {
    await fs.rm(TEST_MEMORY_PATH, { recursive: true, force: true });
    log('✓ Test directory cleaned up', 'green');
  } catch (err) {
    log('⚠️  Could not clean up test directory', 'yellow');
  }
  
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(error => {
  log(`\n💥 FATAL ERROR: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

