/**
 * Access Control compatibility helper for multi-tenant CDN hosting.
 * 
 * Real authorization must happen at the CDN/backend before course files are
 * served. This module deliberately refuses the legacy browser-token design.
 */

import { courseConfig } from '../../../course/course-config.js';

/**
 * Validate access based on URL token
 * @returns {{ valid: boolean, clientId: string | null, error: string | null }}
 */
export function validateAccess() {
    const accessControl = courseConfig.accessControl;

    if (!accessControl) {
        return { valid: true, clientId: null, error: null };
    }

    if (accessControl.clients) {
        return {
            valid: false,
            clientId: null,
            error: 'Legacy browser-side accessControl.clients is insecure and unsupported. Move credentials to .coursecode/access-control.json.'
        };
    }

    if (accessControl.enforcement !== 'server') {
        return {
            valid: false,
            clientId: null,
            error: "External access control must use enforcement: 'server'"
        };
    }

    // Reaching this JavaScript means the server/CDN already authorized delivery.
    return { valid: true, clientId: null, error: null };
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
