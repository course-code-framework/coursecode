/**
 * Access Control - validates client tokens for multi-tenant CDN hosting
 * 
 * Checks URL params (clientId, token) against course config.
 * Used by external hosting modes (scorm*-proxy, cmi5-remote).
 */

import { courseConfig } from '../../../course/course-config.js';

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 * Returns false for mismatched lengths without leaking which byte differs.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
        mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
}

/**
 * Validate access based on URL token
 * @returns {{ valid: boolean, clientId: string | null, error: string | null }}
 */
export function validateAccess() {
    const accessControl = courseConfig.accessControl;

    // If no access control clients configured, allow all
    if (!accessControl?.clients) {
        return { valid: true, clientId: null, error: null };
    }

    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('clientId');
    const token = params.get('token');

    // Missing credentials
    if (!clientId || !token) {
        return {
            valid: false,
            clientId: null,
            error: 'Missing clientId or token'
        };
    }

    // Unknown client
    const client = accessControl.clients?.[clientId];
    if (!client) {
        return {
            valid: false,
            clientId,
            error: `Unknown client: ${clientId}`
        };
    }

    // Invalid token (constant-time comparison)
    if (!timingSafeEqual(client.token, token)) {
        return {
            valid: false,
            clientId,
            error: 'Invalid token'
        };
    }

    // Success
    return { valid: true, clientId, error: null };
}

/**
 * Show unauthorized screen and halt initialization
 * @param {string} error - Error message to display
 */
export function showUnauthorizedScreen(_error) {
    document.body.innerHTML = `
        <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            font-family: system-ui, sans-serif;
            background: #1a1a2e;
            color: #fff;
        ">
            <div style="text-align: center; padding: 2rem;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
                <h1 style="margin: 0 0 0.5rem; font-size: 1.5rem;">Access Denied</h1>
                <p style="margin: 0; opacity: 0.7; font-size: 0.9rem;">
                    This course is not authorized for this deployment.
                </p>
            </div>
        </div>
    `;
}
