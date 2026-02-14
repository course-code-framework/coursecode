/**
 * Build command - build course package for LMS deployment
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateProject } from './project-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * Run a command and return a promise
 */
function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true,
      env: options.env || process.env,
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(' ')} failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

export async function build(options = {}) {
  validateProject();

  console.log(`
🔨 Building course package...
`);

  const startTime = Date.now();

  try {
    // Build environment — pass lib dir so vite.config.js can resolve coursecode utilities
    const env = { ...process.env, COURSECODE_LIB_DIR: __dirname };
    if (options.format) {
      env.LMS_FORMAT = options.format;
      console.log(`   📦 Format: ${options.format}\n`);
    }

    // Build command varies based on options
    const buildArgs = ['vite', 'build'];

    if (options.lint === false) {
      // Run vite build directly without lint
      await runCommand('npx', buildArgs, { env });
    } else {
      // Run full build with lint (npm run build)
      await runCommand('npm', ['run', 'build'], { env });
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // Check for output
    const zipFiles = fs.readdirSync(process.cwd()).filter(f => f.endsWith('.zip'));

    console.log(`
✅ Build completed in ${elapsed}s

   Output:
   - dist/           SCORM package files
   ${zipFiles.length > 0 ? `- ${zipFiles[zipFiles.length - 1]}   Ready for LMS upload` : ''}

   To test locally, load dist/ directory in a SCORM testing tool.
`);

  } catch (error) {
    console.error(`
❌ Build failed: ${error.message}

   Check the errors above and try again.
`);
    process.exit(1);
  }
}
