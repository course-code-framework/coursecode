/**
 * Create command - scaffold a new CourseCode project
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(__dirname, '..');
const REQUIRED_PROJECT_DIRECTORIES = [
  {
    path: path.join('course', 'references'),
    placeholder: '# Place source documents here (docx, pptx, pdf)\n# Run `coursecode convert` to convert them to markdown\n'
  },
  {
    path: path.join('course', 'references', 'converted'),
    placeholder: '# Converted markdown files will be placed here\n# These can be used as source material for AI-assisted course creation\n'
  }
];

export function toProjectDirectoryName(name) {
  return String(name || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function directoryNameWords(name) {
  return String(name || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/['’]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function toCurrentDirectoryCourseTitle(name) {
  return directoryNameWords(name)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function toCurrentDirectoryPackageName(name) {
  return directoryNameWords(name)
    .map(word => word.toLowerCase())
    .join('-');
}

function escapeSingleQuotedValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function stampCourseTitle(configContent, title) {
  const titleValue = escapeSingleQuotedValue(title);
  let nextContent = configContent.replace(
    /^(\s*)title\s*:\s*['"`][^'"`]*['"`](\s*,?)/m,
    `$1title: '${titleValue}'$2`
  );

  nextContent = nextContent.replace(
    /^(\s*)courseTitle\s*:\s*['"`][^'"`]*['"`](\s*,?)/m,
    `$1courseTitle: '${titleValue}'$2`
  );

  return nextContent;
}

function writeCourseTitle(projectDir, title) {
  const configPath = path.join(projectDir, 'course', 'course-config.js');
  if (!fs.existsSync(configPath)) return;

  const current = fs.readFileSync(configPath, 'utf-8');
  fs.writeFileSync(configPath, stampCourseTitle(current, title), 'utf-8');
}

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

function ensureRequiredProjectDirectories(projectDir) {
  for (const directory of REQUIRED_PROJECT_DIRECTORIES) {
    const directoryPath = path.join(projectDir, directory.path);
    const placeholderPath = path.join(directoryPath, '.gitkeep');
    fs.mkdirSync(directoryPath, { recursive: true });

    if (!fs.existsSync(placeholderPath)) {
      fs.writeFileSync(placeholderPath, directory.placeholder, 'utf-8');
    }
  }
}

function mergeProjectControlFile(sourcePath, destinationPath) {
  const source = fs.readFileSync(sourcePath, 'utf-8').trimEnd();
  if (!fs.existsSync(destinationPath)) {
    fs.writeFileSync(destinationPath, `${source}\n`, 'utf-8');
    return;
  }

  const current = fs.readFileSync(destinationPath, 'utf-8');
  const existingLines = new Set(current.split(/\r?\n/).map(line => line.trim()));
  const missingRules = source
    .split(/\r?\n/)
    .filter(line => line.trim() && !line.trim().startsWith('#') && !existingLines.has(line.trim()));

  if (missingRules.length === 0) return;

  const separator = current.endsWith('\n') ? '\n' : '\n\n';
  fs.appendFileSync(
    destinationPath,
    `${separator}# CourseCode project defaults\n${missingRules.join('\n')}\n`,
    'utf-8'
  );
}

function assertCurrentDirectoryCanBeInitialized(targetDir, templateDir) {
  const managedPaths = fs.readdirSync(templateDir)
    .filter(name => !['.DS_Store', 'gitignore', 'gitattributes'].includes(name))
    .concat(['framework', 'schemas', 'lib', '.coursecoderc.json']);
  const conflicts = managedPaths.filter(name => fs.existsSync(path.join(targetDir, name)));

  if (conflicts.length > 0) {
    throw new Error(
      `Cannot initialize the current directory because CourseCode-managed paths already exist: ${conflicts.join(', ')}`
    );
  }
}

/**
 * Run npm install in directory
 */
function npmInstall(cwd) {
  return new Promise((resolve, reject) => {
    const npmCli = process.env.COURSECODE_NPM_CLI;
    const command = npmCli ? process.execPath : 'npm';
    const args = npmCli ? [npmCli, 'install'] : ['install'];
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: !npmCli
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
  const requestedName = String(name || '').trim();
  const currentDirectory = options.currentDirectory === true || requestedName === '.';
  const inferFromCurrentDirectory = currentDirectory && requestedName === '.';
  const currentDirectoryName = path.basename(process.cwd());
  const displayName = inferFromCurrentDirectory
    ? toCurrentDirectoryCourseTitle(currentDirectoryName)
    : requestedName;
  const directoryName = inferFromCurrentDirectory
    ? toCurrentDirectoryPackageName(currentDirectoryName)
    : toProjectDirectoryName(displayName);

  if (!displayName) {
    console.error('\n❌ Course name is required.\n');
    process.exit(1);
  }

  if (!directoryName) {
    console.error('\n❌ Course name must include letters or numbers.\n');
    process.exit(1);
  }

  const targetDir = currentDirectory ? path.resolve(process.cwd()) : path.resolve(process.cwd(), directoryName);
  const templateDir = path.join(PACKAGE_ROOT, 'template');

  if (currentDirectory) {
    assertCurrentDirectoryCanBeInitialized(targetDir, templateDir);
  } else if (fs.existsSync(targetDir)) {
    console.error(`\n❌ Directory "${directoryName}" already exists.\n`);
    process.exit(1);
  }

  console.log(`\n🚀 Creating CourseCode project: ${displayName}\n`);
  if (!currentDirectory && directoryName !== displayName) {
    console.log(`   Project folder: ${directoryName}`);
  }

  // Create project directory
  fs.mkdirSync(targetDir, { recursive: true });

  // Copy template files (course directory and vite config)
  console.log('   Copying template files...');
  copyDir(templateDir, targetDir, {
    exclude: [/^\.DS_Store$/, /^node_modules$/, /^gitignore$/, /^gitattributes$/]
  });
  mergeProjectControlFile(path.join(templateDir, 'gitignore'), path.join(targetDir, '.gitignore'));
  mergeProjectControlFile(path.join(templateDir, 'gitattributes'), path.join(targetDir, '.gitattributes'));
  ensureRequiredProjectDirectories(targetDir);

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

  // Read and customize package.json. Pin the authoring/build CLI to the
  // version that created the project so an isolated checkout can build.
  const frameworkPkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf-8'));
  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkg.name = directoryName;
  pkg.devDependencies = {
    ...pkg.devDependencies,
    coursecode: `^${frameworkPkg.version}`
  };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  // Create .coursecoderc.json to track framework version
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
    clean({ basePath: targetDir, blank: true });
  }

  writeCourseTitle(targetDir, displayName);

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
  if (fs.existsSync(path.join(targetDir, '.git'))) {
    console.log('\n   ✅ Existing Git repository preserved');
  } else {
    console.log('\n   Initializing git repository...');
    try {
      await gitInit(targetDir);
      console.log('   ✅ Git repository initialized');
    } catch (_error) {
      console.warn('   ⚠️  Git init failed. You can run "git init" manually.');
    }
  }

  // Print success message
  if (options.blank) {
    console.log(`
✅ CourseCode project "${displayName}" created (blank starter)!

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
✅ CourseCode project "${displayName}" created successfully!

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
    const npxCli = process.env.COURSECODE_NPX_CLI;
    const command = npxCli ? process.execPath : 'npx';
    const args = npxCli ? [npxCli, 'coursecode', 'dev'] : ['coursecode', 'dev'];
    const child = spawn(command, args, {
      cwd: targetDir,
      stdio: 'inherit',
      shell: !npxCli
    });

    child.on('error', () => {
      console.warn('   ⚠️  Failed to start dev server. Run manually:');
      console.log(`      cd ${directoryName} && coursecode dev\n`);
    });
  } else {
    const changeDirectory = currentDirectory ? '' : `cd ${directoryName}\n      `;
    console.log(`\n   To start developing:\n\n      ${changeDirectory}coursecode dev\n`);
  }

  return {
    displayName,
    directoryName,
    targetDir,
    currentDirectory
  };
}
