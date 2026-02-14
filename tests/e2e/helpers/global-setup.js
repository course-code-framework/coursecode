/**
 * Vitest global setup for E2E tests.
 * 
 * Starts the preview server ONCE before all test files and tears it down after.
 * 
 * Parameterized via env vars so per-format configs can each start their own server:
 *   E2E_PORT        — server port (default: 4199)
 *   E2E_LMS_FORMAT  — LMS format override (default: none → uses course-config.js)
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../../');
const PORT = parseInt(process.env.E2E_PORT || '4199');
const FORMAT = process.env.E2E_LMS_FORMAT || null;

let serverProcess = null;

export async function setup() {
    const args = ['lib/preview-server.js', '--framework-dev', `--port=${PORT}`];

    // The preview server reads LMS_FORMAT from env (not a CLI flag),
    // so we pass the format via the spawned process's environment.
    const env = { ...process.env, CI: 'true', VITE_COURSECODE_LOCAL: 'true' };
    if (FORMAT) env.LMS_FORMAT = FORMAT;

    serverProcess = spawn('node', args, {
        cwd: ROOT_DIR,
        stdio: 'pipe',
        env
    });

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Server start timeout (60s)')), 60000);

        serverProcess.stdout.on('data', (data) => {
            const out = data.toString();
            if (out.includes(`http://localhost:${PORT}`)) {
                clearTimeout(timeout);
                resolve();
            }
        });

        serverProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            if (msg.includes('Error') && !msg.includes('warning')) {
                console.error('[Server Error]', msg);
            }
        });

        serverProcess.on('exit', (code) => {
            if (code !== 0 && code !== null) {
                clearTimeout(timeout);
                reject(new Error(`Server exited with code ${code}`));
            }
        });
    });

    const formatLabel = FORMAT ? ` (${FORMAT})` : '';
    console.log(`✅ Preview server started on port ${PORT}${formatLabel}`);
}

export async function teardown() {
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
        serverProcess = null;
        console.log('🛑 Preview server stopped');
    }
}
