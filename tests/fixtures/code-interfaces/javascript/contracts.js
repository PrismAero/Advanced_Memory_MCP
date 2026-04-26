/**
 * @typedef {Object} JobPayload
 * @property {string} id
 * @property {number} priority
 */

/**
 * @callback JobHandler
 * @param {JobPayload} payload
 * @returns {Promise<void>}
 */

export class QueueWorker {
  constructor(handler) {
    this.handler = handler;
  }

  async run(payload) {
    return this.handler(payload);
  }
}

export function createWorker(handler) {
  return new QueueWorker(handler);
}
