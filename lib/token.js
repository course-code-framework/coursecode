/**
 * Token generator CLI - generate secure access tokens for multi-tenant deployment
 * 
 * Usage:
 *   coursecode token                    # Generate random token
 *   coursecode token --add client-name  # Add client to course-config
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

    // If --add specified, add to course-config
    if (options.add) {
        const clientId = options.add;
        const courseDir = path.join(process.cwd(), 'course');
        const configPath = path.join(courseDir, 'course-config.js');

        if (!fs.existsSync(configPath)) {
            console.error('\n❌ No course-config.js found. Run from a CourseCode project directory.\n');
            process.exit(1);
        }

        let content = fs.readFileSync(configPath, 'utf-8');

        // Check if accessControl already exists
        if (content.includes('accessControl:')) {
            // Add to existing clients object
            const clientsMatch = content.match(/accessControl:\s*\{[\s\S]*?clients:\s*\{/);
            if (clientsMatch) {
                const insertPos = clientsMatch.index + clientsMatch[0].length;
                const newClient = `\n            '${clientId}': { token: '${newToken}' },`;
                content = content.slice(0, insertPos) + newClient + content.slice(insertPos);
            }
        } else {
            // Add accessControl section before closing brace
            const accessControlBlock = `
    accessControl: {
        enabled: true,
        clients: {
            '${clientId}': { token: '${newToken}' }
        }
    },`;
            // Find the last closing brace of courseConfig
            const lastBrace = content.lastIndexOf('};');
            if (lastBrace !== -1) {
                content = content.slice(0, lastBrace) + accessControlBlock + '\n' + content.slice(lastBrace);
            }
        }

        fs.writeFileSync(configPath, content, 'utf-8');

        console.log(`
✅ Added client '${clientId}' to accessControl

   Token: ${newToken}

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
