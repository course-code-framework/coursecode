/**
 * Unified logging and error handling for the CourseCode framework.
 * 
 * This is the ONE system for all logging and error reporting.
 * 
 * Levels:
 *   logger.debug(msg, ctx)  — console only, DEV only
 *   logger.info(msg, ctx)   — console only, DEV only
 *   logger.warn(msg, ctx)   — console + emits 'log:warn' event
 *   logger.error(msg, ctx)  — console + emits 'log:error' event
 *   logger.fatal(msg, ctx)  — console + emits 'log:error' + throws in DEV, degrades in PROD
 * 
 * Context shape (optional):
 *   { domain: 'scorm', operation: 'SetValue', ...anyExtraData }
 * 
 * Event payload shape (for warn/error/fatal):
 *   { level, domain, operation, message, stack?, context, recoverable? }
 * 
 * Subscribers (like error-reporter.js) listen on 'log:error' and 'log:warn'.
 */

/* eslint-disable no-console */

import { eventBus } from '../core/event-bus.js';

const isDev = import.meta.env.DEV;

/**
 * Build a structured event payload and emit it on the eventBus.
 * @param {'warn'|'error'|'fatal'} level
 * @param {string} message
 * @param {object} context
 */
function _emit(level, message, context = {}) {
    const eventName = level === 'warn' ? 'log:warn' : 'log:error';

    eventBus.emit(eventName, {
        level,
        domain: context.domain || 'unknown',
        operation: context.operation || 'unknown',
        message: typeof message === 'string' ? message : String(message),
        stack: context.stack,
        context,
        recoverable: level === 'fatal' ? true : undefined,
        userFacing: context.userFacing,
    });
}

export const logger = {
    /** Log debug information (DEV only, console only) */
    debug: (...args) => {
        if (isDev) console.log('[DEBUG]', ...args);
    },

    /** Log general information (DEV only, console only) */
    info: (...args) => {
        if (isDev) console.log('[INFO]', ...args);
    },

    /** Log warnings (all envs, emits 'log:warn' event) */
    warn: (message, context) => {
        console.warn('[WARN]', message, ...(context ? [context] : []));
        _emit('warn', message, context);
    },

    /** Log errors (all envs, emits 'log:error' event) */
    error: (message, context) => {
        console.error('[ERROR]', message, ...(context ? [context] : []));
        _emit('error', message, context);
    },

    /**
     * Recoverable framework error — the frameworkError() replacement.
     * DEV: emits event + throws (fail fast, fail loud)
     * PROD: emits event + logs warning (graceful degradation)
     * 
     * IMPORTANT: Always follow with `return;` since PROD does not throw.
     */
    fatal: (message, context = {}) => {
        if (isDev) {
            const error = new Error(message);
            context.stack = error.stack;
            console.error('[FATAL]', message, context);
            _emit('fatal', message, context);
            throw error;
        }

        // Production: log + emit, don't throw
        console.warn('[FATAL]', message, context);
        _emit('fatal', message, context);
    },
};
