/**
 * Baseline Knowledge Seed for the Adaptive Model
 *
 * The fine-tuning model in `AdaptiveModelTrainer` sits on top of the
 * Universal Sentence Encoder and is trained on user interactions
 * (search successes, confirmed relationships, interface usage, etc.).
 * On a fresh install there is *no* training data, so the fine-tuning
 * layer is uninitialized and the trainer refuses to run (it requires
 * 50+ data points). That means new users get raw USE embeddings and
 * no project-aware adaptation until they have generated hundreds of
 * interactions.
 *
 * This module ships a curated set of canonical software-engineering
 * concept pairs that we feed into the trainer at first-run so the
 * baseline model starts with sensible opinions about the domain it
 * will see most often: auth, databases, APIs, components, infra,
 * testing, etc.
 *
 * Format follows `TrainingDataPoint` so it can be passed directly to
 * `AdaptiveModelTrainer.addBatchTrainingData()`.
 *
 * To opt out, set the environment variable `DISABLE_BASELINE_SEED=1`.
 */

import { TrainingDataPoint } from "./adaptive-model-trainer.js";

/**
 * Canonical languages used by the seed. "any" means
 * language-agnostic (e.g. architecture, testing concepts that apply
 * across languages). The language token is prepended to each
 * generated training text so the embedding space naturally clusters
 * by language - when an agent later embeds C++ code, the leading
 * `[LANG: cpp]` marker pulls the nearest-neighbor results toward
 * other C++ embeddings instead of unrelated JS/TS look-alikes.
 */
export type SeedLanguage = "any" | "c" | "cpp" | "go" | "javascript" | "typescript" | "python";

/**
 * A canonical concept paired with semantically-related concepts. The
 * trainer will ingest both:
 *   - the concept itself (single-text data point), and
 *   - each `concept ||| related` pairing (relationship-style data
 *     point, matching the format `TrainingDataCollector` uses for
 *     confirmed relationships).
 *
 * `language` defaults to "any" when omitted.
 */
interface SeedConcept {
  concept: string;
  related: string[];
  domain: string;
  language?: SeedLanguage;
}

const SEED_CONCEPTS: SeedConcept[] = [
  // ---------- Authentication & Authorization ----------
  {
    concept: "user authentication and login flow",
    related: [
      "JWT token issuance and verification",
      "OAuth2 authorization code grant",
      "session cookie management",
      "password hashing with bcrypt or argon2",
    ],
    domain: "auth",
  },
  {
    concept: "role based access control",
    related: [
      "permission checks in middleware",
      "policy enforcement on API endpoints",
      "user roles and groups",
    ],
    domain: "auth",
  },
  {
    concept: "single sign on with SAML or OIDC",
    related: [
      "identity provider integration",
      "federated authentication",
      "claims and identity tokens",
    ],
    domain: "auth",
  },

  // ---------- Database & Persistence ----------
  {
    concept: "relational database schema design",
    related: [
      "primary keys and foreign key constraints",
      "table normalization and joins",
      "SQL migration scripts",
      "indexes for query performance",
    ],
    domain: "database",
  },
  {
    concept: "ORM model definitions",
    related: [
      "entity classes mapped to tables",
      "lazy loading of related records",
      "query builder fluent interface",
    ],
    domain: "database",
  },
  {
    concept: "database connection pooling",
    related: [
      "max pool size configuration",
      "connection lifetime and idle timeout",
      "transaction isolation levels",
    ],
    domain: "database",
  },
  {
    concept: "key value store and caching layer",
    related: ["Redis cache for hot data", "cache invalidation strategy", "TTL based eviction"],
    domain: "database",
  },
  {
    concept: "document database queries",
    related: [
      "MongoDB aggregation pipeline",
      "indexed JSON field lookup",
      "schema-less data modeling",
    ],
    domain: "database",
  },

  // ---------- HTTP / API ----------
  {
    concept: "REST API endpoint design",
    related: [
      "resource based URL routes",
      "HTTP status codes 2xx 4xx 5xx",
      "request validation and response serialization",
      "pagination of list endpoints",
    ],
    domain: "api",
  },
  {
    concept: "GraphQL schema and resolvers",
    related: [
      "type definitions and query fields",
      "N+1 query problem with dataloader",
      "mutation and subscription operations",
    ],
    domain: "api",
  },
  {
    concept: "API gateway and request routing",
    related: [
      "rate limiting per client",
      "request authentication middleware",
      "service discovery and load balancing",
    ],
    domain: "api",
  },
  {
    concept: "webhook delivery and retries",
    related: [
      "signed payload verification",
      "exponential backoff retry policy",
      "idempotency keys",
    ],
    domain: "api",
  },

  // ---------- UI / Components ----------
  {
    concept: "React functional component with hooks",
    related: [
      "useState for local state",
      "useEffect for side effects",
      "memoization with useMemo and useCallback",
      "controlled form inputs",
    ],
    domain: "ui",
    language: "typescript",
  },
  {
    concept: "component prop typing and validation",
    related: [
      "TypeScript prop interfaces",
      "default props and optional fields",
      "render props and children composition",
    ],
    domain: "ui",
    language: "typescript",
  },
  {
    concept: "global UI state management",
    related: ["Redux store and reducers", "Zustand atomic state", "context provider pattern"],
    domain: "ui",
    language: "typescript",
  },
  {
    concept: "accessible form controls",
    related: [
      "ARIA labels and roles",
      "keyboard navigation and focus order",
      "client side validation messaging",
    ],
    domain: "ui",
  },
  {
    concept: "responsive layout and styling",
    related: [
      "CSS flexbox and grid",
      "breakpoint based media queries",
      "design tokens and theme variables",
    ],
    domain: "ui",
  },

  // ---------- Architecture / Patterns ----------
  {
    concept: "service layer separation of concerns",
    related: [
      "controller invokes service",
      "service depends on repository",
      "domain logic isolated from transport",
    ],
    domain: "architecture",
  },
  {
    concept: "dependency injection container",
    related: [
      "interface based abstractions",
      "constructor injection of services",
      "lifetime scopes singleton transient scoped",
    ],
    domain: "architecture",
  },
  {
    concept: "event driven architecture",
    related: [
      "publish subscribe message bus",
      "event sourcing and replay",
      "asynchronous handlers and queues",
    ],
    domain: "architecture",
  },
  {
    concept: "microservice boundaries",
    related: [
      "bounded context per service",
      "service to service communication",
      "shared contracts versus duplication",
    ],
    domain: "architecture",
  },

  // ---------- Async / Concurrency ----------
  {
    concept: "async await and promise chains",
    related: [
      "error propagation through await",
      "Promise.all for parallel work",
      "cancellation with AbortController",
    ],
    domain: "concurrency",
    language: "typescript",
  },
  {
    concept: "background job queue",
    related: [
      "worker process consuming tasks",
      "retry on failure with backoff",
      "scheduled and cron triggered jobs",
    ],
    domain: "concurrency",
  },

  // ---------- Errors / Reliability ----------
  {
    concept: "structured error handling",
    related: [
      "typed error classes",
      "error boundary at module edge",
      "graceful degradation on failure",
    ],
    domain: "reliability",
  },
  {
    concept: "observability with logs metrics traces",
    related: [
      "structured JSON logging",
      "request correlation id propagation",
      "distributed tracing spans",
    ],
    domain: "reliability",
  },
  {
    concept: "circuit breaker and bulkhead",
    related: [
      "fail fast on downstream outage",
      "retry budget and timeout policy",
      "fallback response when degraded",
    ],
    domain: "reliability",
  },

  // ---------- Testing ----------
  {
    concept: "unit test for pure function",
    related: [
      "arrange act assert pattern",
      "test fixtures and factories",
      "mocking external dependencies",
    ],
    domain: "testing",
  },
  {
    concept: "integration test against real database",
    related: [
      "ephemeral test database per run",
      "transactional rollback after each test",
      "seed data for deterministic state",
    ],
    domain: "testing",
  },
  {
    concept: "end to end browser test",
    related: ["headless browser automation", "page object model", "flaky test detection and retry"],
    domain: "testing",
  },

  // ---------- Build / Tooling ----------
  {
    concept: "TypeScript compilation and type checking",
    related: [
      "tsconfig strict mode",
      "module resolution and path aliases",
      "declaration files for libraries",
    ],
    domain: "tooling",
    language: "typescript",
  },
  {
    concept: "bundler and build pipeline",
    related: [
      "tree shaking unused exports",
      "code splitting by route",
      "source maps for debugging",
    ],
    domain: "tooling",
  },
  {
    concept: "package management and lockfile",
    related: [
      "semver version ranges",
      "transitive dependency resolution",
      "monorepo workspace linking",
    ],
    domain: "tooling",
  },

  // ---------- Infra / Deployment ----------
  {
    concept: "container image build and push",
    related: ["multi stage Dockerfile", "image layer caching", "container registry tagging"],
    domain: "infra",
  },
  {
    concept: "Kubernetes deployment and service",
    related: [
      "pod replicas and rolling update",
      "service discovery via cluster DNS",
      "config maps and secrets injection",
    ],
    domain: "infra",
  },
  {
    concept: "infrastructure as code",
    related: [
      "Terraform modules and state",
      "CloudFormation stack templates",
      "drift detection and plan review",
    ],
    domain: "infra",
  },
  {
    concept: "CI CD pipeline",
    related: [
      "build test deploy stages",
      "branch based environments",
      "artifact promotion through environments",
    ],
    domain: "infra",
  },

  // ---------- Security ----------
  {
    concept: "input validation and sanitization",
    related: [
      "schema based request validation",
      "SQL injection prevention",
      "cross site scripting escaping",
    ],
    domain: "security",
  },
  {
    concept: "secret management",
    related: [
      "environment variables for credentials",
      "vault and KMS for sensitive material",
      "rotation of API keys",
    ],
    domain: "security",
  },
  {
    concept: "transport encryption",
    related: [
      "TLS certificates and renewal",
      "mutual TLS between services",
      "HSTS and secure cookie flags",
    ],
    domain: "security",
  },

  // ---------- Performance ----------
  {
    concept: "query performance tuning",
    related: [
      "explain plan analysis",
      "covering index for hot query",
      "denormalization for read load",
    ],
    domain: "performance",
  },
  {
    concept: "frontend rendering performance",
    related: [
      "virtual list for long collections",
      "lazy loading of below fold images",
      "memoization to avoid rerenders",
    ],
    domain: "performance",
  },
  {
    concept: "memory leak investigation",
    related: [
      "heap snapshot diffing",
      "retained event listeners and closures",
      "object pool reuse",
    ],
    domain: "performance",
  },

  // ---------- Code organization ----------
  {
    concept: "module exports and imports",
    related: [
      "named versus default exports",
      "barrel index files",
      "circular dependency avoidance",
    ],
    domain: "code-organization",
  },
  {
    concept: "interface and type definitions",
    related: [
      "structural typing with interfaces",
      "discriminated union for variants",
      "generic type parameters",
    ],
    domain: "code-organization",
    language: "typescript",
  },
  {
    concept: "configuration object pattern",
    related: [
      "default options merged with overrides",
      "environment specific config files",
      "validated config schema",
    ],
    domain: "code-organization",
  },

  // ---------- ML / Embeddings ----------
  {
    concept: "vector embedding for semantic search",
    related: [
      "cosine similarity between embeddings",
      "approximate nearest neighbor index",
      "embedding dimensionality and pooling",
    ],
    domain: "ml",
  },
  {
    concept: "model fine tuning on domain data",
    related: [
      "training data quality and labels",
      "validation split and early stopping",
      "checkpoint saving during epochs",
    ],
    domain: "ml",
  },

  // ====================================================
  // C language
  // ====================================================
  {
    concept: "C manual memory management with malloc and free",
    related: [
      "heap allocation lifetime ownership",
      "memory leak detection with valgrind",
      "double free and use after free bugs",
      "calloc realloc reallocarray sizing",
    ],
    domain: "c-memory",
    language: "c",
  },
  {
    concept: "C pointer arithmetic and array decay",
    related: [
      "pointer to first element of array",
      "const correctness on pointers",
      "void pointer for generic data",
      "pointer to pointer indirection",
    ],
    domain: "c-pointers",
    language: "c",
  },
  {
    concept: "C struct and union definitions",
    related: [
      "typedef struct for opaque handles",
      "padding and alignment of struct fields",
      "tagged union for variant types",
      "flexible array member at end of struct",
    ],
    domain: "c-types",
    language: "c",
  },
  {
    concept: "C string handling and null termination",
    related: [
      "strlen strcpy strncpy bounds safety",
      "snprintf formatted string output",
      "buffer overflow prevention",
      "string interning and length-prefixed strings",
    ],
    domain: "c-strings",
    language: "c",
  },
  {
    concept: "C preprocessor and header guards",
    related: [
      "include guard with ifndef define endif",
      "macro definition with parameters",
      "conditional compilation with ifdef",
      "pragma once directive",
    ],
    domain: "c-build",
    language: "c",
  },
  {
    concept: "C standard library headers",
    related: [
      "stdio.h for printf and file IO",
      "stdlib.h for malloc and exit",
      "string.h for memcpy and strcmp",
      "stdint.h for fixed width integers",
    ],
    domain: "c-stdlib",
    language: "c",
  },
  {
    concept: "POSIX threads with pthread_create",
    related: [
      "mutex lock and unlock for shared state",
      "condition variable wait and signal",
      "thread join and detach lifetime",
      "thread local storage with __thread",
    ],
    domain: "c-concurrency",
    language: "c",
  },
  {
    concept: "C11 atomics and memory ordering",
    related: [
      "atomic_load and atomic_store relaxed",
      "memory_order_acquire and memory_order_release",
      "lock free single producer single consumer queue",
      "compare and exchange CAS loop",
    ],
    domain: "c-concurrency",
    language: "c",
  },
  {
    concept: "C file IO and system calls",
    related: [
      "open read write close descriptor",
      "fopen fread fwrite buffered streams",
      "errno and perror reporting",
      "fseek and ftell positioning",
    ],
    domain: "c-io",
    language: "c",
  },
  {
    concept: "C network sockets",
    related: [
      "socket bind listen accept",
      "TCP versus UDP datagram",
      "select poll epoll readiness",
      "non blocking IO with O_NONBLOCK",
    ],
    domain: "c-networking",
    language: "c",
  },
  {
    concept: "C build with make and gcc clang",
    related: [
      "compile and link separate translation units",
      "object file and static library archive",
      "shared library and dlopen runtime loading",
      "compiler warnings with Wall Wextra Werror",
    ],
    domain: "c-build",
    language: "c",
  },
  {
    concept: "C error handling with return codes and errno",
    related: [
      "negative return value on failure",
      "goto cleanup label pattern",
      "assert for invariants in debug builds",
      "setjmp longjmp non local jumps",
    ],
    domain: "c-errors",
    language: "c",
  },
  {
    concept: "C unit testing with Unity or Check",
    related: [
      "test fixture setup and teardown",
      "TEST_ASSERT macros for expectations",
      "mocking with CMock generated stubs",
      "code coverage with gcov",
    ],
    domain: "c-testing",
    language: "c",
  },
  {
    concept: "C embedded systems programming",
    related: [
      "memory mapped IO registers volatile",
      "interrupt service routine ISR",
      "fixed point arithmetic without FPU",
      "linker script for flash and RAM regions",
    ],
    domain: "c-embedded",
    language: "c",
  },
  {
    concept: "C library glibc and musl",
    related: [
      "POSIX API portability",
      "dynamic versus static linking",
      "libcurl HTTP client integration",
      "OpenSSL crypto and TLS",
    ],
    domain: "c-libraries",
    language: "c",
  },

  // ====================================================
  // C++ (modern C++17 / C++20 / C++23)
  // ====================================================
  {
    concept: "C++ RAII and smart pointers",
    related: [
      "std::unique_ptr exclusive ownership",
      "std::shared_ptr reference counted ownership",
      "std::weak_ptr to break cycles",
      "make_unique and make_shared factories",
    ],
    domain: "cpp-memory",
    language: "cpp",
  },
  {
    concept: "C++ move semantics and rvalue references",
    related: [
      "std::move to transfer ownership",
      "perfect forwarding with std::forward",
      "rule of five copy move constructor destructor",
      "noexcept move operations for container growth",
    ],
    domain: "cpp-semantics",
    language: "cpp",
  },
  {
    concept: "C++ templates and generic programming",
    related: [
      "function template parameter deduction",
      "class template with type and non type parameters",
      "variadic template parameter pack expansion",
      "template specialization for type traits",
    ],
    domain: "cpp-templates",
    language: "cpp",
  },
  {
    concept: "C++20 concepts for template constraints",
    related: [
      "requires clause on template parameters",
      "std::integral and std::floating_point concepts",
      "concept based overload resolution",
      "improving template error messages",
    ],
    domain: "cpp-templates",
    language: "cpp",
  },
  {
    concept: "C++ STL containers",
    related: [
      "std::vector contiguous dynamic array",
      "std::unordered_map hash table lookup",
      "std::map ordered red black tree",
      "std::array fixed size compile time",
    ],
    domain: "cpp-stl",
    language: "cpp",
  },
  {
    concept: "C++ STL algorithms",
    related: [
      "std::sort with custom comparator",
      "std::transform with projection",
      "std::accumulate fold over range",
      "std::find_if predicate search",
    ],
    domain: "cpp-stl",
    language: "cpp",
  },
  {
    concept: "C++20 ranges and views",
    related: [
      "ranges::filter view lazy predicate",
      "ranges::transform view lazy projection",
      "pipe operator for view composition",
      "range based for loop over view",
    ],
    domain: "cpp-stl",
    language: "cpp",
  },
  {
    concept: "C++ lambda expressions and closures",
    related: [
      "capture by value and by reference",
      "generic lambda with auto parameters",
      "mutable lambda for stateful closure",
      "std::function type erasure",
    ],
    domain: "cpp-functional",
    language: "cpp",
  },
  {
    concept: "C++20 coroutines",
    related: [
      "co_await for asynchronous resumption",
      "co_yield for generator patterns",
      "promise type and coroutine handle",
      "task and generator coroutine library",
    ],
    domain: "cpp-async",
    language: "cpp",
  },
  {
    concept: "C++ multithreading with std::thread",
    related: [
      "std::mutex and std::lock_guard scope",
      "std::condition_variable wait and notify",
      "std::atomic lock free primitives",
      "std::async and std::future for results",
    ],
    domain: "cpp-concurrency",
    language: "cpp",
  },
  {
    concept: "C++ exception handling and error types",
    related: [
      "throw catch hierarchy of std::exception",
      "noexcept specifier and stack unwinding",
      "std::expected for value or error C++23",
      "std::optional for nullable value",
    ],
    domain: "cpp-errors",
    language: "cpp",
  },
  {
    concept: "C++ object lifetime and constructors",
    related: [
      "default and deleted special member functions",
      "explicit constructor to prevent conversions",
      "delegating constructor chain",
      "destructor virtual for polymorphic base",
    ],
    domain: "cpp-oop",
    language: "cpp",
  },
  {
    concept: "C++ inheritance and polymorphism",
    related: [
      "virtual function override",
      "abstract class with pure virtual",
      "final to prevent further overriding",
      "CRTP curiously recurring template pattern",
    ],
    domain: "cpp-oop",
    language: "cpp",
  },
  {
    concept: "C++20 modules replacing headers",
    related: [
      "import declaration for module unit",
      "export module declaration",
      "module partition for splitting interface",
      "binary module interface BMI",
    ],
    domain: "cpp-build",
    language: "cpp",
  },
  {
    concept: "CMake build system for C++",
    related: [
      "add_executable and add_library targets",
      "target_link_libraries dependency graph",
      "find_package and Config modules",
      "FetchContent for source dependencies",
    ],
    domain: "cpp-build",
    language: "cpp",
  },
  {
    concept: "Qt framework for C++",
    related: [
      "QObject signal slot mechanism",
      "QML declarative UI integration",
      "Qt event loop and QApplication",
      "QString implicit sharing copy on write",
    ],
    domain: "cpp-frameworks",
    language: "cpp",
  },
  {
    concept: "Boost C++ libraries",
    related: [
      "boost::asio asynchronous IO",
      "boost::filesystem path manipulation pre std::filesystem",
      "boost::optional and boost::variant",
      "Boost.Test unit testing",
    ],
    domain: "cpp-frameworks",
    language: "cpp",
  },
  {
    concept: "C++ unit testing with Catch2 or GoogleTest",
    related: [
      "TEST_CASE and SECTION style",
      "TEST and EXPECT_EQ macros",
      "fixture class with SetUp and TearDown",
      "death tests and parametrized tests",
    ],
    domain: "cpp-testing",
    language: "cpp",
  },
  {
    concept: "C++ networking with gRPC and Protocol Buffers",
    related: [
      "proto schema and generated stubs",
      "unary and streaming RPC",
      "ServerBuilder and async completion queue",
      "deadline propagation and cancellation",
    ],
    domain: "cpp-frameworks",
    language: "cpp",
  },
  {
    concept: "C++ filesystem and chrono utilities",
    related: [
      "std::filesystem::path manipulation",
      "directory_iterator and recursive_directory_iterator",
      "std::chrono::duration time arithmetic",
      "steady_clock and system_clock",
    ],
    domain: "cpp-stl",
    language: "cpp",
  },

  // ====================================================
  // Go (modern Go 1.18+ with generics)
  // ====================================================
  {
    concept: "Go goroutine for concurrent execution",
    related: [
      "go keyword to spawn lightweight thread",
      "channel for safe communication between goroutines",
      "select statement for multiplexed channel ops",
      "sync.WaitGroup to await goroutine completion",
    ],
    domain: "go-concurrency",
    language: "go",
  },
  {
    concept: "Go context for cancellation and deadlines",
    related: [
      "context.WithCancel parent child propagation",
      "context.WithTimeout deadline propagation",
      "ctx.Done channel for cancellation signal",
      "request scoped values with context.Value",
    ],
    domain: "go-concurrency",
    language: "go",
  },
  {
    concept: "Go channels and pipelines",
    related: [
      "buffered versus unbuffered channels",
      "directional channels send only receive only",
      "fan out fan in worker pool pattern",
      "closing a channel to signal completion",
    ],
    domain: "go-concurrency",
    language: "go",
  },
  {
    concept: "Go error handling idioms",
    related: [
      "explicit error return value pattern",
      "errors.Is and errors.As wrap chain",
      "fmt.Errorf with percent w verb wrapping",
      "sentinel error values and typed errors",
    ],
    domain: "go-errors",
    language: "go",
  },
  {
    concept: "Go generics with type parameters",
    related: [
      "func with bracketed type parameters",
      "constraint interface with type set",
      "comparable and any predeclared constraints",
      "generic data structure like List of T",
    ],
    domain: "go-generics",
    language: "go",
  },
  {
    concept: "Go interfaces and structural typing",
    related: [
      "implicit interface satisfaction",
      "empty interface any for dynamic typing",
      "type assertion and type switch",
      "io.Reader io.Writer composition",
    ],
    domain: "go-types",
    language: "go",
  },
  {
    concept: "Go struct with methods and tags",
    related: [
      "value receiver versus pointer receiver",
      "struct field tags for json and db mapping",
      "embedded struct for composition",
      "exported versus unexported by capitalization",
    ],
    domain: "go-types",
    language: "go",
  },
  {
    concept: "Go modules and dependency management",
    related: [
      "go.mod and go.sum lock file",
      "go get to add a dependency",
      "module path and semantic versioning",
      "go work multi module workspace",
    ],
    domain: "go-build",
    language: "go",
  },
  {
    concept: "Go HTTP server with net/http",
    related: [
      "http.HandlerFunc adapter",
      "http.ServeMux request routing",
      "middleware via handler wrapping",
      "context propagation through request",
    ],
    domain: "go-web",
    language: "go",
  },
  {
    concept: "Go web framework gin",
    related: [
      "gin.Engine with route groups",
      "context binding for request payloads",
      "middleware chain with c.Next",
      "JSON response with c.JSON",
    ],
    domain: "go-frameworks",
    language: "go",
  },
  {
    concept: "Go web framework echo",
    related: [
      "echo.Echo instance and route registration",
      "Bind for request payload parsing",
      "middleware ordering and groups",
      "JSON XML response helpers",
    ],
    domain: "go-frameworks",
    language: "go",
  },
  {
    concept: "Go database access with database/sql",
    related: [
      "sql.DB connection pool",
      "Query QueryRow Exec patterns",
      "prepared statements and arguments",
      "scanning rows into struct fields",
    ],
    domain: "go-database",
    language: "go",
  },
  {
    concept: "Go ORM with GORM",
    related: [
      "model struct with gorm tags",
      "AutoMigrate to sync schema",
      "Where Find First chained queries",
      "associations with belongs to and has many",
    ],
    domain: "go-frameworks",
    language: "go",
  },
  {
    concept: "Go gRPC server and client",
    related: [
      "protobuf service definition",
      "generated stubs with protoc gen go grpc",
      "interceptors for auth and logging",
      "streaming RPC with bidirectional streams",
    ],
    domain: "go-frameworks",
    language: "go",
  },
  {
    concept: "Go testing with the testing package",
    related: [
      "TestXxx functions with testing.T",
      "table driven tests with subtests",
      "testify assert and require helpers",
      "go test race detector flag",
    ],
    domain: "go-testing",
    language: "go",
  },
  {
    concept: "Go CLI tooling with cobra and viper",
    related: [
      "cobra Command tree with subcommands",
      "viper config from env file flag",
      "persistent flags shared across commands",
      "command auto generated help text",
    ],
    domain: "go-frameworks",
    language: "go",
  },
  {
    concept: "Go logging with slog and zap",
    related: [
      "slog structured logger standard library",
      "zap.Logger high performance encoder",
      "log levels debug info warn error",
      "log context fields for correlation",
    ],
    domain: "go-observability",
    language: "go",
  },
  {
    concept: "Go Kubernetes client-go",
    related: [
      "kubernetes.Clientset typed clients",
      "informer and lister for watch cache",
      "controller pattern reconcile loop",
      "custom resource definition CRD",
    ],
    domain: "go-frameworks",
    language: "go",
  },
  {
    concept: "Go build and cross compilation",
    related: [
      "go build with GOOS GOARCH env vars",
      "build tags for conditional compilation",
      "embed package for static assets",
      "linker flags ldflags for version info",
    ],
    domain: "go-build",
    language: "go",
  },
  {
    concept: "Go memory model and synchronization",
    related: [
      "sync.Mutex for mutual exclusion",
      "sync.RWMutex for reader writer split",
      "sync.Once lazy single initialization",
      "sync.Map for concurrent map access",
    ],
    domain: "go-concurrency",
    language: "go",
  },
];

/**
 * Format a language tag prefix that gets prepended to every seed
 * training text. The leading token gives the embedding model a
 * strong language signal so e.g. "channel for safe communication"
 * tagged `[LANG: go]` does not collide with unrelated TS code.
 *
 * Exported so callers (project-embedding-engine, similarity engine)
 * can use the *same* prefix at query time and benefit from the
 * language clustering we trained for here.
 */
export function languageTag(language: SeedLanguage | string | undefined): string {
  const lang = (language ?? "any").toString().toLowerCase().trim();
  return `[LANG:${lang}]`;
}

/**
 * Build the full set of seed `TrainingDataPoint` records from
 * `SEED_CONCEPTS`. Each concept becomes one single-text point and
 * one paired point per related concept, which gives the trainer
 * both individual embeddings and contrastive-style pairs.
 *
 * Every text is prefixed with a `[LANG:<language>]` token so the
 * embedding space clusters by language - a query embedded with the
 * same prefix at lookup time will pull toward training points in
 * the same language and away from look-alikes in other languages.
 *
 * Confidence is held above the trainer's internal cutoff (0.3) and
 * default `min_confidence_threshold` (0.4) so every seed point
 * actually flows through training.
 */
export function buildBaselineSeedData(now: Date = new Date()): TrainingDataPoint[] {
  const points: TrainingDataPoint[] = [];

  for (let conceptIdx = 0; conceptIdx < SEED_CONCEPTS.length; conceptIdx++) {
    const seed = SEED_CONCEPTS[conceptIdx];
    const lang = seed.language ?? "any";
    const tag = languageTag(lang);

    // Single-concept point. Anchors the embedding for the base term.
    points.push({
      id: `seed_concept_${conceptIdx}`,
      input_text: `${tag} ${seed.concept}`,
      context: `baseline_seed_${seed.domain}_${lang}`,
      source_type: "interface_usage",
      confidence: 0.7,
      timestamp: now,
      metadata: {
        session_id: "baseline_seed",
        language: lang,
        domain: seed.domain,
      },
    });

    // Relationship-style pairs. Mirrors the format used by
    // TrainingDataCollector for confirmed relationships, so the
    // trainer learns "these two phrases belong together".
    for (let relIdx = 0; relIdx < seed.related.length; relIdx++) {
      const related = seed.related[relIdx];
      points.push({
        id: `seed_pair_${conceptIdx}_${relIdx}`,
        input_text: `${tag} ${seed.concept} ||| ${tag} ${related}`,
        context: `baseline_seed_pair_${seed.domain}_${lang}`,
        source_type: "relationship_discovery",
        confidence: 0.75,
        timestamp: now,
        metadata: {
          session_id: "baseline_seed",
          language: lang,
          domain: seed.domain,
        },
      });
    }
  }

  return points;
}

/**
 * Returns a flat view of (concept, related[], language, domain)
 * tuples - useful for tests and tooling that want to assert
 * semantic ordering against the same canonical pairs the trainer
 * was bootstrapped on, optionally constrained to a single language.
 */
export function getSeedConceptPairs(): Array<{
  concept: string;
  related: string[];
  domain: string;
  language: SeedLanguage;
}> {
  return SEED_CONCEPTS.map((s) => ({
    concept: s.concept,
    related: [...s.related],
    domain: s.domain,
    language: s.language ?? "any",
  }));
}

/**
 * Filter seeds by language. Pass `"any"` to get only the
 * language-agnostic seeds; pass a concrete language to get
 * concepts specific to that language. Used by tests that want to
 * verify the language tagging actually pulls related items
 * together within a language and pushes unrelated items in *other*
 * languages further away.
 */
export function getSeedConceptsByLanguage(language: SeedLanguage): Array<{
  concept: string;
  related: string[];
  domain: string;
  language: SeedLanguage;
}> {
  return getSeedConceptPairs().filter((s) => s.language === language);
}

/**
 * Returns the unique set of languages present in the seed corpus.
 */
export function getSeedLanguages(): SeedLanguage[] {
  const set = new Set<SeedLanguage>();
  for (const seed of SEED_CONCEPTS) {
    set.add(seed.language ?? "any");
  }
  return Array.from(set);
}

/**
 * Total count of seed data points produced by `buildBaselineSeedData`.
 * Cheap to compute and used by both the trainer (logging) and tests
 * (sanity assertions).
 */
export function getSeedDataPointCount(): number {
  let count = 0;
  for (const seed of SEED_CONCEPTS) {
    count += 1 + seed.related.length;
  }
  return count;
}
