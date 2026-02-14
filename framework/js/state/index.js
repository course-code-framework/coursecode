/**
 * @file state/index.js
 * @description Barrel export for the state module.
 * stateManager is the sole public API — all LMS and state operations flow through it.
 */

export { default } from './state-manager.js';
export { formatISO8601Duration } from './state-manager.js';
