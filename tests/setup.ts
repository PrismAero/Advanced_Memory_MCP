// Keep TensorFlow.js compatibility behavior identical to the production entrypoint.
import "../modules/node-compat.js";

process.env.LOG_LEVEL ??= "error";
process.env.ADVANCED_MEMORY_EMBEDDING_PROVIDER ??= "fake";
process.env.ADVANCED_MEMORY_ALLOW_MODEL_DOWNLOAD ??= "0";
