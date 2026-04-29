import path from "node:path";

/**
 * Shared exclusion patterns used by ProjectIndexer (regex) and
 * FileWatcher (chokidar globs). Keeping them in one place avoids
 * drift between scan and watch behaviour, and prevents large
 * codebases from polluting the database with generated/vendor files.
 */

/**
 * Directory names we never descend into. Match anywhere in the
 * relative path so nested copies (e.g. packages/x/node_modules) are
 * still ignored.
 */
export const EXCLUDED_DIRECTORIES: string[] = [
  // Internal database directory — must never be reindexed.
  ".memory",
  // Common version control / IDE
  ".git",
  ".hg",
  ".svn",
  ".vscode",
  ".idea",
  // JS / TS ecosystems
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
  ".parcel-cache",
  ".docusaurus",
  ".sass-cache",
  // Python
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  ".venv",
  "venv",
  "env",
  "site-packages",
  // Rust / Go
  "target",
  // C / C++ build outputs
  "out",
  "Out",
  "Build",
  "Builds",
  "Debug",
  "Release",
  "RelWithDebInfo",
  "MinSizeRel",
  "x64",
  "x86",
  "Win32",
  "ARM64",
  "CMakeFiles",
  "_deps",
  "cmake-build-debug",
  "cmake-build-release",
  "cmake-build-relwithdebinfo",
  ".ccls-cache",
  ".clangd",
  // Vendored / third-party trees
  "vendor",
  "third_party",
  "third-party",
  "thirdparty",
  "external",
  "externals",
  "deps",
  "Pods",
  "DerivedData",
  // Misc tooling
  "tmp",
  "temp",
  ".terraform",
  "_codeql",
  ".github",
  ".gitlab",
  "public/build",
];

/**
 * File-name suffixes / patterns that should always be skipped, even
 * if they live in an otherwise-watched directory. These are usually
 * generated, binary, or otherwise un-useful for code analysis.
 */
export const EXCLUDED_FILE_PATTERNS: RegExp[] = [
  // Logs and editor scratch
  /\.log$/i,
  /\.swp$/i,
  /\.swo$/i,
  /\.bak$/i,
  /\.tmp$/i,
  /^\.DS_Store$/,
  /^Thumbs\.db$/,
  // Lockfiles (we still detect them at the project level for
  // package-manager identification, but they're huge JSON/TOML
  // blobs that don't deserve per-line analysis).
  /(^|[\\/])package-lock\.json$/,
  /(^|[\\/])yarn\.lock$/,
  /(^|[\\/])pnpm-lock\.yaml$/,
  /(^|[\\/])poetry\.lock$/,
  /(^|[\\/])Cargo\.lock$/,
  /(^|[\\/])Pipfile\.lock$/,
  /(^|[\\/])composer\.lock$/,
  /(^|[\\/])Gemfile\.lock$/,
  // Native build artefacts
  /\.(o|obj|a|lib|so|dll|dylib|exe|pdb|ilk|exp|map|res)$/i,
  // Java/.NET artefacts
  /\.(class|jar|war|ear|nupkg)$/i,
  // Python compiled
  /\.pyc$/i,
  /\.pyo$/i,
  // Images / fonts / video / archives
  /\.(png|jpg|jpeg|gif|bmp|tiff|tif|ico|webp|heic|svg|psd|ai|eps)$/i,
  /\.(mp3|mp4|wav|ogg|flac|webm|mov|avi|mkv|m4a)$/i,
  /\.(woff|woff2|ttf|otf|eot)$/i,
  /\.(zip|tar|tgz|gz|bz2|xz|7z|rar|iso|dmg)$/i,
  /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i,
  // Generated C/C++ files (Qt MOC, UIC, RCC; protobuf; flatbuffers; bison/flex)
  /(^|[\\/])moc_[^\\/]+\.(cpp|cxx|cc)$/i,
  /(^|[\\/])ui_[^\\/]+\.h$/i,
  /(^|[\\/])qrc_[^\\/]+\.(cpp|cxx|cc)$/i,
  /\.pb\.(cc|h|cxx|hpp)$/i,
  /\.pb-c\.(c|h)$/i,
  /_pb2(_grpc)?\.py$/i,
  /\.generated\.(h|cpp|hpp|cxx|cc|c)$/i,
  /\.gen\.(h|cpp|hpp|cxx|cc|c|go|ts|js)$/i,
  /\.g\.(cs|dart|h|cpp)$/i,
  /\.designer\.cs$/i,
  /(^|[\\/])flatbuffers_generated[^\\/]*$/i,
  // SourceMaps / minified bundles
  /\.min\.(js|css|map)$/i,
  /\.map$/i,
  /\.bundle\.js$/i,
  // Database / SQLite files (including our own)
  /\.(sqlite|sqlite3|db|db-wal|db-shm)$/i,
];

/**
 * Build a list of regexes suitable for ProjectIndexer's path-based
 * exclusion. Combines directory names and file patterns into a
 * single array.
 */
export function buildIndexerExcludePatterns(): RegExp[] {
  const dirPatterns = EXCLUDED_DIRECTORIES.map(
    (name) =>
      // Match the directory anywhere in the relative path,
      // tolerating both `/` and `\` separators (Windows).
      new RegExp(`(^|[\\\\/])${escapeRegex(name)}([\\\\/]|$)`),
  );
  return [...dirPatterns, ...EXCLUDED_FILE_PATTERNS];
}

/**
 * Build the chokidar `ignored` glob list used by FileWatcher.
 */
export function buildWatcherIgnoreGlobs(): string[] {
  const dirGlobs = EXCLUDED_DIRECTORIES.flatMap((name) => [`**/${name}/**`, `**/${name}`]);

  const fileGlobs: string[] = [
    // Logs and editor scratch
    "**/*.log",
    "**/*.swp",
    "**/*.swo",
    "**/*.bak",
    "**/*.tmp",
    "**/.DS_Store",
    "**/Thumbs.db",
    // Lockfiles
    "**/package-lock.json",
    "**/yarn.lock",
    "**/pnpm-lock.yaml",
    "**/poetry.lock",
    "**/Cargo.lock",
    "**/Pipfile.lock",
    "**/composer.lock",
    "**/Gemfile.lock",
    // Native artefacts
    "**/*.o",
    "**/*.obj",
    "**/*.a",
    "**/*.lib",
    "**/*.so",
    "**/*.dll",
    "**/*.dylib",
    "**/*.exe",
    "**/*.pdb",
    "**/*.ilk",
    "**/*.exp",
    "**/*.res",
    // .NET / Java
    "**/*.class",
    "**/*.jar",
    "**/*.war",
    "**/*.nupkg",
    // Python compiled
    "**/*.pyc",
    "**/*.pyo",
    // Media / archives / docs
    "**/*.{png,jpg,jpeg,gif,bmp,tiff,tif,ico,webp,heic,svg,psd,ai,eps}",
    "**/*.{mp3,mp4,wav,ogg,flac,webm,mov,avi,mkv,m4a}",
    "**/*.{woff,woff2,ttf,otf,eot}",
    "**/*.{zip,tar,tgz,gz,bz2,xz,7z,rar,iso,dmg}",
    "**/*.{pdf,doc,docx,xls,xlsx,ppt,pptx}",
    // Generated C/C++ files
    "**/moc_*.{cpp,cxx,cc}",
    "**/ui_*.h",
    "**/qrc_*.{cpp,cxx,cc}",
    "**/*.pb.{cc,h,cxx,hpp}",
    "**/*.pb-c.{c,h}",
    "**/*_pb2.py",
    "**/*_pb2_grpc.py",
    "**/*.generated.{h,cpp,hpp,cxx,cc,c}",
    "**/*.gen.{h,cpp,hpp,cxx,cc,c,go,ts,js}",
    "**/*.g.{cs,dart,h,cpp}",
    "**/*.designer.cs",
    // SourceMaps / minified bundles
    "**/*.min.{js,css,map}",
    "**/*.map",
    "**/*.bundle.js",
    // Database files
    "**/*.{sqlite,sqlite3,db,db-wal,db-shm}",
  ];

  return [...dirGlobs, ...fileGlobs];
}

/**
 * Best-effort heuristic to flag generated source files where the
 * top-of-file banner explicitly says "DO NOT EDIT" or similar. We
 * use this so callers can still record the file's existence but
 * skip expensive parsing/keyword extraction.
 */
export function isLikelyGeneratedSource(headSnippet: string): boolean {
  if (!headSnippet) return false;
  const head = headSnippet.slice(0, 2048).toLowerCase();
  return (
    head.includes("do not edit") ||
    head.includes("do not modify") ||
    head.includes("auto-generated") ||
    head.includes("autogenerated") ||
    head.includes("automatically generated") ||
    head.includes("generated by")
  );
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalise a relative path so the regexes work consistently
 * regardless of which separator the host OS uses.
 */
export function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}
