/**
 * Upgrade command - upgrade framework in current project
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(__dirname, '..');

/**
 * Copy directory recursively
 */
function copyDir(src, dest, options = {}) {
  const { exclude = [] } = options;

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (exclude.some(pattern => entry.name.match(pattern))) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, options);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Remove directory recursively
 */
function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Compare semantic versions
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareVersions(a, b) {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (partsA[i] > partsB[i]) return 1;
    if (partsA[i] < partsB[i]) return -1;
  }
  return 0;
}

/**
 * Copy a single file, creating backup if it exists and differs
 */
function copyFileWithBackup(src, dest) {
  if (fs.existsSync(dest)) {
    const srcContent = fs.readFileSync(src, 'utf-8');
    const destContent = fs.readFileSync(dest, 'utf-8');

    if (srcContent !== destContent) {
      // Create backup
      const backupPath = dest + '.backup';
      fs.copyFileSync(dest, backupPath);
      fs.copyFileSync(src, dest);
      return { updated: true, backup: backupPath };
    }
    return { updated: false, reason: 'identical' };
  }

  fs.copyFileSync(src, dest);
  return { updated: true, backup: null };
}

export async function upgrade(options = {}) {
  const cwd = process.cwd();
  const rcPath = path.join(cwd, '.coursecoderc.json');
  const frameworkDir = path.join(cwd, 'framework');
  const schemasDir = path.join(cwd, 'schemas');

  // Check for .coursecoderc.json
  if (!fs.existsSync(rcPath)) {
    console.error(`
❌ No .coursecoderc.json found in current directory.

   This doesn't appear to be a CourseCode project created with the CLI.
   
   To create a new project:
   coursecode create my-course
`);
    process.exit(1);
  }

  // Read current version
  const rcConfig = JSON.parse(fs.readFileSync(rcPath, 'utf-8'));
  const currentVersion = rcConfig.frameworkVersion;

  // Get CLI version (this is the version we'll upgrade to)
  const cliPkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf-8'));
  const targetVersion = cliPkg.version;

  console.log(`
📦 CourseCode Upgrade

   Current version:  ${currentVersion}
   Available version: ${targetVersion}
`);

  // Check if upgrade needed
  const comparison = compareVersions(targetVersion, currentVersion);

  if (comparison === 0 && !options.force) {
    console.log('   ✅ Already on latest version. Use --force to reinstall.\n');
    return;
  }

  if (comparison < 0 && !options.force) {
    console.log('   ⚠️  CLI version is older than project. Use --force to downgrade.\n');
    return;
  }

  // Dry run mode
  if (options.dryRun) {
    let dryRunMsg = `   Dry run mode - no changes will be made.
   
   Would update:
   - framework/     (replace entirely)
   - schemas/       (replace entirely)
   - lib/manifest/  (replace entirely)
   - .coursecoderc.json  (update version)`;

    if (options.configs) {
      dryRunMsg += `
   - vite.config.js (replace, backup original)
   - eslint.config.js (replace, backup original)`;
    }

    dryRunMsg += `
   
   Would NOT touch:
   - course/        (your content)${!options.configs ? '\n   - vite.config.js\n   - eslint.config.js' : ''}
   - package.json
   - .env
`;
    console.log(dryRunMsg);
    return;
  }

  // Perform upgrade
  console.log('   Upgrading framework...');

  // Backup check - warn user
  console.log(`
   ⚠️  This will replace the framework/ directory.
   
   Your course/ directory will NOT be modified.
`);

  // Remove old framework
  if (fs.existsSync(frameworkDir)) {
    console.log('   Removing old framework...');
    removeDir(frameworkDir);
  }

  // Copy new framework
  console.log('   Installing new framework...');
  const frameworkSrc = path.join(PACKAGE_ROOT, 'framework');
  copyDir(frameworkSrc, frameworkDir, {
    exclude: [/^\.DS_Store$/, /^dist$/]
  });

  // Update schemas
  if (fs.existsSync(schemasDir)) {
    console.log('   Updating LMS schemas...');
    removeDir(schemasDir);
  }
  const schemasSrc = path.join(PACKAGE_ROOT, 'schemas');
  if (fs.existsSync(schemasSrc)) {
    copyDir(schemasSrc, schemasDir);
  }

  // Update manifest generation lib (used by vite.config.js)
  const manifestDir = path.join(cwd, 'lib', 'manifest');
  console.log('   Updating manifest generators...');
  if (fs.existsSync(manifestDir)) {
    removeDir(manifestDir);
  }
  const manifestSrc = path.join(PACKAGE_ROOT, 'lib', 'manifest');
  fs.mkdirSync(path.join(cwd, 'lib'), { recursive: true });
  copyDir(manifestSrc, manifestDir);

  // Update config files if --configs flag is set
  const configUpdates = [];
  if (options.configs) {
    console.log('   Updating config files...');

    const templateDir = path.join(PACKAGE_ROOT, 'template');
    const configFiles = ['vite.config.js', 'eslint.config.js'];

    for (const file of configFiles) {
      const src = path.join(templateDir, file);
      const dest = path.join(cwd, file);

      if (fs.existsSync(src)) {
        const result = copyFileWithBackup(src, dest);
        if (result.updated) {
          if (result.backup) {
            configUpdates.push(`   - ${file} (backup: ${path.basename(result.backup)})`);
          } else {
            configUpdates.push(`   - ${file} (created)`);
          }
        }
      }
    }
  }

  // Update .coursecoderc.json
  rcConfig.frameworkVersion = targetVersion;
  rcConfig.upgradedAt = new Date().toISOString();
  rcConfig.upgradedFrom = currentVersion;
  fs.writeFileSync(rcPath, JSON.stringify(rcConfig, null, 2));

  let successMsg = `
✅ Upgrade complete!

   ${currentVersion} → ${targetVersion}

   Your course/ directory was not modified.`;

  if (configUpdates.length > 0) {
    successMsg += `

   Config files updated:
${configUpdates.join('\n')}
   
   Review the changes and delete .backup files when satisfied.`;
  }

  successMsg += `
   
   Review the changelog for breaking changes:
   https://github.com/course-code-framework/coursecode/releases
`;

  console.log(successMsg);
}
