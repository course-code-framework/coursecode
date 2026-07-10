/**
 * Token generator CLI - generate secure access tokens for multi-tenant deployment
 * 
 * Usage:
 *   coursecode token                    # Generate random token
 *   coursecode token --add client-name  # Add client to gitignored access file
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Generate a cryptographically secure token
 * @param {number} length - Token length in bytes (default: 24 = 32 chars base64url)
 * @returns {string} URL-safe token
 */
export function generateToken(length = 24) {
    return crypto.randomBytes(length).toString('base64url');
}

/**
 * Token command handler
 */
export async function token(options = {}) {
    const newToken = generateToken();

    // If --add specified, add to the non-published access file. Credentials
    // must never live in course-config.js because that module is bundled into
    // learner-facing JavaScript.
    if (options.add) {
        const clientId = options.add;
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(clientId)) {
            throw new Error('Client ID must use letters, numbers, dots, underscores, or hyphens');
        }

        const configPath = path.join(process.cwd(), 'course', 'course-config.js');

        if (!fs.existsSync(configPath)) {
            console.error('\n❌ No course-config.js found. Run from a CourseCode project directory.\n');
            process.exit(1);
        }

        const accessDir = path.join(process.cwd(), '.coursecode');
        const accessPath = path.join(accessDir, 'access-control.json');
        fs.mkdirSync(accessDir, { recursive: true });

        let accessConfig = { clients: {} };
        if (fs.existsSync(accessPath)) {
            try {
                accessConfig = JSON.parse(fs.readFileSync(accessPath, 'utf-8'));
            } catch (error) {
                throw new Error(`Cannot parse ${accessPath}: ${error.message}`);
            }
        }
        if (!accessConfig.clients || typeof accessConfig.clients !== 'object') {
            accessConfig.clients = {};
        }
        accessConfig.clients[clientId] = { token: newToken };
        fs.writeFileSync(accessPath, JSON.stringify(accessConfig, null, 2) + '\n', { mode: 0o600 });
        try { fs.chmodSync(accessPath, 0o600); } catch { /* Windows/filesystem may not support chmod */ }

        console.log(`
✅ Added client '${clientId}' to .coursecode/access-control.json

   Token: ${newToken}

   Keep accessControl.enforcement = 'server' in course-config.js.
   Your CDN/backend must validate this token before serving course files.
   Build will generate: ${clientId}_proxy.zip
`);
    } else {
        // Just generate and print token
        console.log(`
🔑 Generated access token:

   ${newToken}

   Use with --add to add a client:
   coursecode token --add client-name
`);
    }
}
