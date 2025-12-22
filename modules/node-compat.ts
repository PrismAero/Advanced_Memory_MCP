/**
 * Node.js v24+ Compatibility Polyfills for TensorFlow.js
 *
 * CRITICAL: This module MUST be imported before any TensorFlow.js code
 *
 * TensorFlow.js uses deprecated Node.js util functions that were removed in v23+.
 * This module provides polyfills to maintain compatibility.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

let initialized = false;

/**
 * Apply all Node.js compatibility polyfills for TensorFlow.js
 * Safe to call multiple times - will only apply once
 */
export function applyNodeCompatPolyfills(): void {
  if (initialized) {
    return;
  }

  try {
    const util = require("util");

    // Fix util.isNullOrUndefined (removed in Node.js v23+)
    if (!util.isNullOrUndefined) {
      util.isNullOrUndefined = function isNullOrUndefined(arg: any): boolean {
        return arg === null || arg === undefined;
      };
    }

    // Fix util.isArray (deprecated, should use Array.isArray)
    if (!util.isArray || util.isArray !== Array.isArray) {
      util.isArray = Array.isArray;
    }

    // Fix other commonly used deprecated util functions
    if (!util.isBoolean) {
      util.isBoolean = function (arg: any): boolean {
        return typeof arg === "boolean";
      };
    }

    if (!util.isFunction) {
      util.isFunction = function (arg: any): boolean {
        return typeof arg === "function";
      };
    }

    if (!util.isNumber) {
      util.isNumber = function (arg: any): boolean {
        return typeof arg === "number";
      };
    }

    if (!util.isString) {
      util.isString = function (arg: any): boolean {
        return typeof arg === "string";
      };
    }

    if (!util.isObject) {
      util.isObject = function (arg: any): boolean {
        return typeof arg === "object" && arg !== null;
      };
    }

    // Patch Module.prototype.require for dynamic imports within TensorFlow
    const Module = require("module");
    const originalRequire = Module.prototype.require;

    Module.prototype.require = function (id: string) {
      const exportedThing = originalRequire.call(this, id);
      if (id === "util" && exportedThing) {
        // Apply all util compatibility fixes for dynamic requires
        if (!exportedThing.isNullOrUndefined) {
          exportedThing.isNullOrUndefined = function (arg: any) {
            return arg === null || arg === undefined;
          };
        }
        if (!exportedThing.isArray || exportedThing.isArray !== Array.isArray) {
          exportedThing.isArray = Array.isArray;
        }
        if (!exportedThing.isBoolean) {
          exportedThing.isBoolean = (arg: any) => typeof arg === "boolean";
        }
        if (!exportedThing.isFunction) {
          exportedThing.isFunction = (arg: any) => typeof arg === "function";
        }
        if (!exportedThing.isNumber) {
          exportedThing.isNumber = (arg: any) => typeof arg === "number";
        }
        if (!exportedThing.isString) {
          exportedThing.isString = (arg: any) => typeof arg === "string";
        }
        if (!exportedThing.isObject) {
          exportedThing.isObject = (arg: any) =>
            typeof arg === "object" && arg !== null;
        }
      }
      return exportedThing;
    };

    initialized = true;
    console.error(
      "[COMPATIBILITY] TensorFlow.js compatibility shim initialized for Node.js v24+"
    );
  } catch (error) {
    console.error(
      "[COMPATIBILITY] Failed to apply Node.js compatibility polyfills:",
      error
    );
    throw new Error(
      "Failed to initialize Node.js compatibility layer for TensorFlow.js"
    );
  }
}

// Auto-apply on import
applyNodeCompatPolyfills();

