/**
 * @file driver-factory.js
 * @description Factory for creating LMS drivers based on format configuration.
 * 
 * All drivers are included as lazy chunks in the universal build.
 * Only the driver matching the runtime format is loaded (via dynamic import).
 * This enables a single build to serve any LMS format — the format is
 * determined at runtime from a <meta name="lms-format"> tag in index.html.
 */

import { validateDriverInterface } from './driver-interface.js';

// Cached driver instances (drivers are singletons)
let cachedDriver = null;
let cachedFormat = null;

/**
 * Creates the appropriate LMS driver based on format.
 * All drivers exist as lazy chunks; only the matching one is loaded at runtime.
 * @param {string} format - 'cmi5' | 'cmi5-remote' | 'scorm2004' | 'scorm1.2' | 'scorm1.2-proxy' | 'scorm2004-proxy' | 'lti'
 * @returns {Promise<LMSDriver>} The driver instance
 */
export async function createDriver(format = 'cmi5') {
    // Return cached driver if same format
    if (cachedDriver && cachedFormat === format) {
        return cachedDriver;
    }

    let driver;

    switch (format) {
        case 'scorm2004': {
            const { Scorm2004Driver } = await import('./scorm-2004-driver.js');
            driver = new Scorm2004Driver();
            break;
        }

        case 'scorm1.2': {
            const { Scorm12Driver } = await import('./scorm-12-driver.js');
            driver = new Scorm12Driver();
            break;
        }

        case 'scorm1.2-proxy':
        case 'scorm2004-proxy': {
            const { ProxyDriver } = await import('./proxy-driver.js');
            // Extract base format (e.g., 'scorm1.2-proxy' -> 'scorm1.2')
            const baseFormat = format.replace('-proxy', '');
            driver = new ProxyDriver(baseFormat);
            break;
        }

        case 'lti': {
            const { LtiDriver } = await import('./lti-driver.js');
            driver = new LtiDriver();
            break;
        }

        case 'cmi5':
        case 'cmi5-remote':
        default: {
            const { Cmi5Driver } = await import('./cmi5-driver.js');
            driver = new Cmi5Driver();
            break;
        }
    }

    // Validate interface in development
    if (import.meta.env.DEV) {
        validateDriverInterface(driver);
    }

    cachedDriver = driver;
    cachedFormat = format;

    return driver;
}
