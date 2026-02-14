/**
 * Create command - scaffold a new CourseCode project
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

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

    // Check exclusions
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
 * Run npm install in directory
 */
function npmInstall(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['install'], {
      cwd,
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install failed with code ${code}`));
      }
    });
  });
}

/**
 * Initialize git repository
 */
function gitInit(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['init'], {
      cwd,
      stdio: 'pipe',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git init failed with code ${code}`));
      }
    });
  });
}

export async function create(name, options = {}) {
  const targetDir = path.resolve(process.cwd(), name);

  // Check if directory already exists
  if (fs.existsSync(targetDir)) {
    console.error(`\n❌ Directory "${name}" already exists.\n`);
    process.exit(1);
  }

  console.log(`\n🚀 Creating CourseCode project: ${name}\n`);

  // Create project directory
  fs.mkdirSync(targetDir, { recursive: true });

  // Copy template files (course directory and vite config)
  const templateDir = path.join(PACKAGE_ROOT, 'template');
  console.log('   Copying template files...');
  copyDir(templateDir, targetDir, {
    exclude: [/^\.DS_Store$/, /^node_modules$/]
  });

  // Copy framework
  const frameworkSrc = path.join(PACKAGE_ROOT, 'framework');
  const frameworkDest = path.join(targetDir, 'framework');
  console.log('   Copying framework...');
  copyDir(frameworkSrc, frameworkDest, {
    exclude: [/^\.DS_Store$/, /^dist$/]
  });

  // Copy SCORM schemas
  const schemasSrc = path.join(PACKAGE_ROOT, 'schemas');
  const schemasDest = path.join(targetDir, 'schemas');
  console.log('   Copying LMS schemas...');
  copyDir(schemasSrc, schemasDest);

  // Copy manifest generation lib (used by vite.config.js)
  const manifestSrc = path.join(PACKAGE_ROOT, 'lib', 'manifest');
  const manifestDest = path.join(targetDir, 'lib', 'manifest');
  console.log('   Copying manifest generators...');
  copyDir(manifestSrc, manifestDest);

  // Copy shared packaging utilities + proxy templates (used by vite.config.js)
  const packagingSrc = path.join(PACKAGE_ROOT, 'lib', 'build-packaging.js');
  const packagingDest = path.join(targetDir, 'lib', 'build-packaging.js');
  fs.copyFileSync(packagingSrc, packagingDest);

  const proxyTemplatesSrc = path.join(PACKAGE_ROOT, 'lib', 'proxy-templates');
  const proxyTemplatesDest = path.join(targetDir, 'lib', 'proxy-templates');
  console.log('   Copying proxy packaging templates...');
  copyDir(proxyTemplatesSrc, proxyTemplatesDest);

  // Read and customize package.json
  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkg.name = name;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  // Create .coursecoderc.json to track framework version
  const frameworkPkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf-8'));
  const coursecoderc = {
    frameworkVersion: frameworkPkg.version,
    createdAt: new Date().toISOString(),
    createdWith: `coursecode@${frameworkPkg.version}`
  };
  fs.writeFileSync(
    path.join(targetDir, '.coursecoderc.json'),
    JSON.stringify(coursecoderc, null, 2)
  );

  console.log('   ✅ Project files created');

  // If --blank, remove example files and reset config
  if (options.blank) {
    const { clean } = await import('./scaffold.js');
    clean({ basePath: targetDir });
  }

  // Install dependencies
  if (options.install !== false) {
    console.log('\n   Installing dependencies...\n');
    try {
      await npmInstall(targetDir);
      console.log('\n   ✅ Dependencies installed');
    } catch (_error) {
      console.warn('\n   ⚠️  npm install failed. Run it manually.');
    }
  }

  // Initialize git repository
  console.log('\n   Initializing git repository...');
  try {
    await gitInit(targetDir);
    console.log('   ✅ Git repository initialized');
  } catch (_error) {
    console.warn('   ⚠️  Git init failed. You can run "git init" manually.');
  }

  // Print success message
  if (options.blank) {
    console.log(`
✅ CourseCode project "${name}" created (blank starter)!

   Course files:
   - course/course-config.js  - Course metadata & structure (minimal)
   - course/slides/intro.js   - Starter slide
   - course/theme.css         - Custom styling
   - course/assets/           - Images, audio, etc.

   Next steps:
   - Edit course-config.js with your course metadata
   - Create slides with: coursecode new slide <id>
   - Create assessments with: coursecode new assessment <id>
`);
  } else {
    console.log(`
✅ CourseCode project "${name}" created successfully!

   Course files:
   - course/course-config.js  - Course metadata & structure
   - course/slides/           - Slide content (example- files for reference)
   - course/theme.css         - Custom styling
   - course/assets/           - Images, audio, etc.

   The project includes example slides (prefixed with "example-") that
   demonstrate framework features. When ready to build your own course:
   - Run: coursecode clean
   - Or create a blank project: coursecode create <name> --blank
`);
  }

  // --start: auto-start dev server. Otherwise print instructions and exit.
  if (options.start) {
    console.log('\n   Starting development server...\n');
    const child = spawn('npx', ['coursecode', 'dev'], {
      cwd: targetDir,
      stdio: 'inherit',
      shell: true
    });

    child.on('error', () => {
      console.warn('   ⚠️  Failed to start dev server. Run manually:');
      console.log(`      cd ${name} && coursecode dev\n`);
    });
  } else {
    console.log(`\n   To start developing:\n\n      cd ${name}\n      coursecode dev\n`);
  }
}

