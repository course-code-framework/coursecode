/**
 * Build command - build course package for LMS deployment
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateProject } from './project-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function snapshotZipFiles(directory) {
  const snapshot = new Map();
  if (!fs.existsSync(directory)) return snapshot;

  for (const filename of fs.readdirSync(directory)) {
    if (!filename.endsWith('.zip')) continue;
    const stats = fs.statSync(path.join(directory, filename));
    snapshot.set(filename, { mtimeMs: stats.mtimeMs, size: stats.size });
  }

  return snapshot;
}

export function findProducedZipFiles(directory, before = new Map()) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory)
    .filter(filename => filename.endsWith('.zip'))
    .map(filename => {
      const stats = fs.statSync(path.join(directory, filename));
      return { filename, mtimeMs: stats.mtimeMs, size: stats.size };
    })
    .filter(file => {
      const previous = before.get(file.filename);
      return !previous || previous.mtimeMs !== file.mtimeMs || previous.size !== file.size;
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.filename.localeCompare(b.filename))
    .map(file => file.filename);
}

export function detectBuiltFormat(distDirectory, requestedFormat) {
  const indexPath = path.join(distDirectory, 'index.html');

  if (fs.existsSync(indexPath)) {
    const html = fs.readFileSync(indexPath, 'utf8');
    const match = html.match(/<meta\s+name=["']lms-format["']\s+content=["']([^"']+)["']/i);
    if (match?.[1]) return match[1];
  }

  if (fs.existsSync(path.join(distDirectory, 'cmi5.xml'))) return 'cmi5';
  if (fs.existsSync(path.join(distDirectory, 'lti-tool-config.json'))) return 'lti';

  return requestedFormat || 'scorm2004';
}

export function formatBuildOutput(format, zipFiles = []) {
  const normalizedFormat = format || 'scorm2004';
  const displayNames = {
    scorm2004: 'SCORM 2004',
    'scorm1.2': 'SCORM 1.2',
    cmi5: 'cmi5',
    lti: 'LTI 1.3',
    'scorm2004-proxy': 'SCORM 2004 proxy',
    'scorm1.2-proxy': 'SCORM 1.2 proxy',
    'cmi5-remote': 'cmi5 remote'
  };
  const displayName = displayNames[normalizedFormat] || normalizedFormat;
  const archives = zipFiles.map(filename => `   - ${filename}   Ready for LMS upload`).join('\n');

  return `   Output:\n   - dist/           ${displayName} package files${archives ? `\n${archives}` : ''}\n\n   To test locally, launch dist/ or the archive in a ${displayName}-compatible LMS or conformance tool.`;
}

/**
 * Run a command and return a promise
 */
function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: process.platform === 'win32',
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
  const zipSnapshot = snapshotZipFiles(process.cwd());

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

    const zipFiles = findProducedZipFiles(process.cwd(), zipSnapshot);
    const builtFormat = detectBuiltFormat(path.join(process.cwd(), 'dist'), options.format);
    const output = formatBuildOutput(builtFormat, zipFiles);

    console.log(`
✅ Build completed in ${elapsed}s

${output}
`);

  } catch (error) {
    console.error(`
❌ Build failed: ${error.message}

   Check the errors above and try again.
`);
    process.exit(1);
  }
}
