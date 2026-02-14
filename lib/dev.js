/**
 * Dev command - start Vite development server
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateProject } from './project-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function dev(options = {}) {
  validateProject({ warnMissingRc: true });

  console.log(`
🚀 Starting CourseCode development build...

   Building in watch mode - changes will auto-rebuild
   Output: dist/
   Press Ctrl+C to stop
`);

  // Run vite build in watch mode
  // Pass LMS_FORMAT if specified via --format flag
  const env = { ...process.env };
  // Signal to framework reporters that this is a local dev build
  env.VITE_COURSECODE_LOCAL = 'true';
  if (options.format) {
    env.LMS_FORMAT = options.format;
    console.log(`   📦 Format: ${options.format}\n`);
  }

  const viteBuild = spawn('npx', ['vite', 'build', '--mode', 'development', '--watch'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
    env
  });

  viteBuild.on('error', (error) => {
    console.error('❌ Failed to start dev server:', error.message);
    process.exit(1);
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log('\n\n👋 Stopping development server...\n');
    viteBuild.kill();
    process.exit(0);
  });
}
