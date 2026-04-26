// Keep TensorFlow.js compatibility behavior identical to the production entrypoint.
import "../modules/node-compat.js";

process.env.LOG_LEVEL ??= "error";
