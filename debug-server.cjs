#!/usr/bin/env node

/**
 * Debug server runner with log streaming
 * Shows all console.error output from the memory server
 */

const { spawn } = require("child_process");
const path = require("path");

console.log("🚀 Starting Enhanced Memory MCP Server with debug logging...\n");

// Start the server
const server = spawn("node", ["dist/index.js"], {
  cwd: __dirname,
  stdio: ["pipe", "pipe", "pipe"],
});

// Color codes for better log visibility
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

// Log timestamp
function timestamp() {
  return `${colors.cyan}[${new Date().toISOString().substr(11, 8)}]${
    colors.reset
  }`;
}

// Handle server output
server.stdout.on("data", (data) => {
  console.log(
    `${timestamp()} ${colors.green}STDOUT:${colors.reset} ${data.toString()}`
  );
});

server.stderr.on("data", (data) => {
  const message = data.toString().trim();

  // Color-code different types of messages
  let coloredMessage = message;
  if (message.includes("🚀") || message.includes("✅")) {
    coloredMessage = `${colors.green}${message}${colors.reset}`;
  } else if (message.includes("🔍") || message.includes("📝")) {
    coloredMessage = `${colors.blue}${message}${colors.reset}`;
  } else if (message.includes("❌") || message.includes("⚠️")) {
    coloredMessage = `${colors.red}${message}${colors.reset}`;
  } else if (message.includes("🎯") || message.includes("🔗")) {
    coloredMessage = `${colors.magenta}${message}${colors.reset}`;
  }

  console.log(`${timestamp()} ${coloredMessage}`);
});

server.on("close", (code) => {
  console.log(
    `\n${colors.yellow}Server exited with code ${code}${colors.reset}`
  );
});

server.on("error", (err) => {
  console.error(
    `${timestamp()} ${colors.red}Server error: ${err}${colors.reset}`
  );
});

// Handle process termination
process.on("SIGINT", () => {
  console.log(`\n${colors.yellow}Shutting down debug server...${colors.reset}`);
  server.kill("SIGINT");
  process.exit(0);
});

console.log(
  `${colors.bright}Debug server running. Press Ctrl+C to stop.${colors.reset}\n`
);
console.log(`${colors.yellow}Watching for:${colors.reset}`);
console.log(`  🚀 Initialization messages`);
console.log(`  🔍 Relationship detection`);
console.log(`  📝 Background indexing`);
console.log(`  🔗 Auto-relation creation`);
console.log(`  ❌ Errors and warnings\n`);
