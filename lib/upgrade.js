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

export function addMissingRuntimeDependencies(projectPkg, templatePkg) {
  const requiredDeps = templatePkg.dependencies || {};
  const existingDeps = projectPkg.dependencies || {};
  const existingDevDeps = projectPkg.devDependencies || {};
  const added = [];

  for (const [name, version] of Object.entries(requiredDeps)) {
    if (existingDeps[name]) {
      continue;
    }

    existingDeps[name] = existingDevDeps[name] || version;
    delete existingDevDeps[name];
    added.push(name);
  }

  if (added.length > 0) {
    projectPkg.dependencies = Object.fromEntries(
      Object.entries(existingDeps).sort(([a], [b]) => a.localeCompare(b))
    );
    if (projectPkg.devDependencies) {
      projectPkg.devDependencies = Object.fromEntries(
        Object.entries(existingDevDeps).sort(([a], [b]) => a.localeCompare(b))
      );
    }
  }

  return added;
}

/**
 * Keep the project-local authoring/build CLI aligned with the framework that
 * was just installed. Generated projects rely on this dependency so an
 * isolated checkout can run CourseCode commands without a global install.
 */
export function syncCoursecodeCliDependency(projectPkg, targetVersion) {
  const targetRange = `^${targetVersion}`;
  const currentDevRange = projectPkg.devDependencies?.coursecode;
  const currentRuntimeRange = projectPkg.dependencies?.coursecode;
  const updated = currentDevRange !== targetRange || Boolean(currentRuntimeRange);

  if (!updated) {
    return { updated: false, from: currentDevRange, to: targetRange };
  }

  projectPkg.devDependencies = Object.fromEntries(
    Object.entries({
      ...(projectPkg.devDependencies || {}),
      coursecode: targetRange
    }).sort(([a], [b]) => a.localeCompare(b))
  );

  if (currentRuntimeRange) {
    delete projectPkg.dependencies.coursecode;
  }

  return {
    updated: true,
    from: currentDevRange || currentRuntimeRange || null,
    to: targetRange
  };
}

const OBSOLETE_MANAGED_DEV_DEPENDENCIES = ['@vitejs/plugin-legacy'];

/**
 * Synchronize the build tooling that accompanies a replaced template config.
 * This only runs with `coursecode upgrade --configs`, keeping the default
 * framework-only upgrade from changing a project's custom build stack.
 */
export function syncManagedBuildTooling(projectPkg, templatePkg) {
  const projectDevDeps = { ...(projectPkg.devDependencies || {}) };
  const templateDevDeps = templatePkg.devDependencies || {};
  const updated = [];
  const removed = [];

  for (const [name, version] of Object.entries(templateDevDeps)) {
    if (projectDevDeps[name] !== version) {
      projectDevDeps[name] = version;
      updated.push(`${name}@${version}`);
    }
  }

  for (const name of OBSOLETE_MANAGED_DEV_DEPENDENCIES) {
    if (projectDevDeps[name]) {
      delete projectDevDeps[name];
      removed.push(name);
    }
  }

  projectPkg.devDependencies = Object.fromEntries(
    Object.entries(projectDevDeps).sort(([a], [b]) => a.localeCompare(b))
  );

  const nodeEngine = templatePkg.engines?.node;
  const engineUpdated = Boolean(nodeEngine && projectPkg.engines?.node !== nodeEngine);
  if (engineUpdated) {
    projectPkg.engines = { ...(projectPkg.engines || {}), node: nodeEngine };
  }

  return { updated, removed, engineUpdated };
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
  const templatePkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'template', 'package.json'), 'utf-8'));

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
   - package.json   (sync CourseCode CLI and add missing runtime dependencies)
   - .coursecoderc.json  (update version)`;

    if (options.configs) {
      dryRunMsg += `
   - vite.config.js (replace, backup original)
   - eslint.config.js (replace, backup original)
   - package.json (sync managed Vite/ESLint tooling and remove plugin-legacy)`;
    }

    dryRunMsg += `
   
   Would NOT touch:
   - course/        (your content)${!options.configs ? '\n   - vite.config.js\n   - eslint.config.js' : ''}
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

  // Add any runtime dependencies introduced by the new framework while preserving
  // the project's existing version ranges.
  const pkgPath = path.join(cwd, 'package.json');
  let addedRuntimeDeps = [];
  let cliDependencyChange = null;
  let toolingChanges = null;
  if (fs.existsSync(pkgPath)) {
    const projectPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    addedRuntimeDeps = addMissingRuntimeDependencies(projectPkg, templatePkg);
    cliDependencyChange = syncCoursecodeCliDependency(projectPkg, targetVersion);
    if (options.configs) {
      toolingChanges = syncManagedBuildTooling(projectPkg, templatePkg);
    }
    const packageChanged = cliDependencyChange.updated ||
      addedRuntimeDeps.length > 0 ||
      toolingChanges?.updated.length > 0 ||
      toolingChanges?.removed.length > 0 ||
      toolingChanges?.engineUpdated;
    if (packageChanged) {
      fs.writeFileSync(pkgPath, JSON.stringify(projectPkg, null, 2) + '\n');
    }
  }

  let successMsg = `
✅ Upgrade complete!

   ${currentVersion} → ${targetVersion}

   Your course/ directory was not modified.`;

  if (cliDependencyChange?.updated) {
    const previousRange = cliDependencyChange.from || 'missing';
    successMsg += `

   CourseCode CLI dependency updated:
   - coursecode: ${previousRange} → ${cliDependencyChange.to}`;
  }

  if (addedRuntimeDeps.length > 0) {
    successMsg += `

   Runtime dependencies added to package.json:
   - ${addedRuntimeDeps.join('\n   - ')}`;
  }

  if (toolingChanges && (
    toolingChanges.updated.length > 0 ||
    toolingChanges.removed.length > 0 ||
    toolingChanges.engineUpdated
  )) {
    successMsg += `

   Managed build tooling synchronized for the new config:`;
    if (toolingChanges.updated.length > 0) {
      successMsg += `
   - Updated: ${toolingChanges.updated.join(', ')}`;
    }
    if (toolingChanges.removed.length > 0) {
      successMsg += `
   - Removed: ${toolingChanges.removed.join(', ')}`;
    }
    if (toolingChanges.engineUpdated) {
      successMsg += `
   - Updated Node engine requirement to ${templatePkg.engines.node}`;
    }
  }

  if (configUpdates.length > 0) {
    successMsg += `

   Config files updated:
${configUpdates.join('\n')}
   
   Review the changes and delete .backup files when satisfied.`;
  }

  if (
    cliDependencyChange?.updated ||
    addedRuntimeDeps.length > 0 ||
    toolingChanges?.updated.length > 0 ||
    toolingChanges?.removed.length > 0 ||
    toolingChanges?.engineUpdated
  ) {
    successMsg += `

   Run npm install to update node_modules and your lockfile.`;
  }

  successMsg += `
   
   Review the changelog for breaking changes:
   https://github.com/course-code-framework/coursecode/releases
`;

  console.log(successMsg);
}
