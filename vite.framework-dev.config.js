

/**
 * Vite config for framework development
 * 
 * This config is used when developing the framework itself.
 * It uses template/course as the test course content.
 * 
 * Usage: 
 *   npm run dev              - Dev server with watch
 *   npm run build:cmi5       - Build without zip (for preview server)
 *   npm run package:cmi5     - Build with zip (for LMS testing)
 */

import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { generateManifest } from './lib/manifest/manifest-factory.js';
import contentDiscoveryPlugin from './lib/vite-plugin-content-discovery.js';
import { lintCourse, formatLintResults } from './lib/build-linter.js';
import {
  createStandardPackage,
  createExternalPackagesForClients,
  validateExternalHostingConfig,
  loadExternalAccessConfig
} from './lib/build-packaging.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname);
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const COURSE_DIR = path.join(ROOT_DIR, 'template', 'course');
const SUPPORTED_BROWSER_TARGETS = ['chrome111', 'edge111', 'firefox114', 'safari16.4'];

// Check if we should create a zip package (for testing full packages)
const SHOULD_PACKAGE = process.env.PACKAGE === 'true';

/**
 * Load course config async using dynamic import
 * Vite's defineConfig supports async functions, so no regex needed
 * Uses cache-busting query param to ensure fresh config on every load
 */
async function loadCourseConfig() {
  const configPath = path.join(COURSE_DIR, 'course-config.js');
  if (!fs.existsSync(configPath)) {
    throw new Error('course-config.js not found');
  }

  // Cache-bust the import to always get fresh config
  const configUrl = 'file://' + configPath + '?t=' + Date.now();
  const configModule = await import(configUrl);
  const config = configModule.courseConfig || configModule.default;
  
  const masteryScore = config.lms?.masteryScore;
  if (masteryScore !== undefined && (!Number.isFinite(masteryScore) || masteryScore < 0 || masteryScore > 100)) {
    throw new Error('lms.masteryScore must be a number between 0 and 100');
  }

  const lmsFormat = process.env.LMS_FORMAT || config.format || 'cmi5';
  return {
    title: config.metadata?.title || 'SCORM Course',
    description: config.metadata?.description || 'SCORM 2004 4th Edition Course',
    version: config.metadata?.version || '1.0.0',
    author: config.metadata?.author || 'Unknown',
    language: config.metadata?.language || 'en',
    lmsFormat,
    externalUrl: process.env.LTI_EXTERNAL_URL || config.externalUrl || (lmsFormat === 'lti' ? 'http://localhost:4173' : null),
    masteryScore: masteryScore ?? null,
    moveOn: config.lms?.moveOn || null,
    accessControl: loadExternalAccessConfig(ROOT_DIR, config),
    galleryConfig: config.navigation?.documentGallery || null
  };
}


/**
 * Scan dist directory for all files
 */
function scanDistFiles() {
  const files = [];

  function scanDir(dir, relativePath = '') {
    if (!fs.existsSync(dir)) return;

    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relPath = relativePath ? `${relativePath}/${item}` : item;

      if (fs.statSync(fullPath).isDirectory()) {
        scanDir(fullPath, relPath);
      } else {
        files.push(relPath);
      }
    }
  }

  scanDir(DIST_DIR);
  return files;
}

function removeHiddenBuildArtifacts(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeHiddenBuildArtifacts(fullPath);
    } else if (entry.name === '.DS_Store' || entry.name === '.gitkeep' || entry.name.startsWith('._')) {
      fs.rmSync(fullPath, { force: true });
    }
  }
}

function assertNoAuthoringSourceInDist() {
  const forbiddenCoursePaths = [
    'course/course-config.js',
    'course/references',
    'course/slides',
    'course/assessments',
    'course/theme.css'
  ];
  const leaked = forbiddenCoursePaths.filter(relativePath => fs.existsSync(path.join(DIST_DIR, relativePath)));
  if (leaked.length > 0) {
    throw new Error(`Authoring source leaked into package: ${leaked.join(', ')}`);
  }

  const invalidCopyLayouts = [
    '.vite',
    'schemas',
    'common/schemas',
    'course/course',
    'course/template',
    'js/vendor/framework'
  ];
  const nested = invalidCopyLayouts.filter(relativePath => fs.existsSync(path.join(DIST_DIR, relativePath)));
  if (nested.length > 0) {
    throw new Error(`Static-copy output has unexpected nested source paths: ${nested.join(', ')}`);
  }
}

/**
 * SCORM post-build plugin for dev
 */
function scormDevPostBuild({ isWatchBuild }) {
  let initialBuild = true;
  return {
    name: 'scorm-dev-post-build',
    buildStart() {
      // Vite watch mode intentionally preserves output between rebuilds, but
      // the first build must start clean so stale manifests/chunks from a
      // different LMS format cannot leak into the next package.
      if (initialBuild && isWatchBuild && fs.existsSync(DIST_DIR)) {
        fs.rmSync(DIST_DIR, { recursive: true, force: true });
      }
      initialBuild = false;
      console.log('🔨 Building...');
    },
    closeBundle: async () => {
      try {
        // Run course linter before any packaging
        const configPath = path.join(COURSE_DIR, 'course-config.js');
        if (fs.existsSync(configPath)) {
          const configUrl = `file://${path.resolve(configPath)}?t=${Date.now()}`;
          const configModule = await import(configUrl);
          const courseConfig = configModule.courseConfig || configModule.default;
          if (courseConfig) {
            const { errors, warnings } = await lintCourse(courseConfig, COURSE_DIR);
            if (errors.length > 0 || warnings.length > 0) {
              console.log(formatLintResults({ errors, warnings }));
            }
            if (errors.length > 0) {
              throw new Error(`Course linting failed with ${errors.length} error(s)`);
            }
          }
        }

        // Ensure dist directory exists
        if (!fs.existsSync(DIST_DIR)) {
          fs.mkdirSync(DIST_DIR, { recursive: true });
        }

        removeHiddenBuildArtifacts(DIST_DIR);
        assertNoAuthoringSourceInDist();

        // Move index.html to root
        const indexSource = path.join(DIST_DIR, 'framework', 'index.html');
        const indexDest = path.join(DIST_DIR, 'index.html');

        // Load course config once for meta tag injection and manifest generation
        const config = await loadCourseConfig();

        if (fs.existsSync(indexSource)) {
          fs.renameSync(indexSource, indexDest);

          let indexContent = fs.readFileSync(indexDest, 'utf-8');
          indexContent = indexContent
            .replace(/(src|href)="\.\.\/(assets|course)\//g, '$1="./$2/')
            .replace(/(src|href)="\.\.\/template\/course\//g, '$1="./course/');

          // Stamp LMS format meta tag for runtime driver selection
          indexContent = indexContent.replace(
            '<meta charset="UTF-8" />',
            `<meta charset="UTF-8" />\n  <meta name="lms-format" content="${config.lmsFormat}" />`
          );

          fs.writeFileSync(indexDest, indexContent, 'utf-8');

          const frameworkDir = path.join(DIST_DIR, 'framework');
          if (fs.existsSync(frameworkDir) && fs.readdirSync(frameworkDir).length === 0) {
            fs.rmdirSync(frameworkDir);
          }
        }

        // Generate manifest based on format
        const files = scanDistFiles();
        const isProxyFormat = config.lmsFormat.endsWith('-proxy');
        const isRemoteFormat = config.lmsFormat.endsWith('-remote');
        
        if (isProxyFormat || isRemoteFormat) validateExternalHostingConfig(config);

        // Generate manifest with options
        const manifestOptions = { externalUrl: config.externalUrl };
        const { filename, content } = generateManifest(config.lmsFormat, config, files, manifestOptions);
        fs.writeFileSync(path.join(DIST_DIR, filename), content, 'utf-8');
        console.log(`✅ Build complete (${config.lmsFormat})`);

        // For proxy/remote formats, create client-specific package(s)
        if (isProxyFormat || isRemoteFormat) {
          await createExternalPackagesForClients({ rootDir: ROOT_DIR, config });
        }

        // Create full zip package if requested (standard builds)
        if (SHOULD_PACKAGE && !isProxyFormat && !isRemoteFormat) {
          await createStandardPackage({ rootDir: ROOT_DIR, distDir: DIST_DIR, config });
        }

        console.log('');
      } catch (error) {
        console.error('❌ Post-processing failed:', error.message);
        throw error;
      }
    }
  };
}

export default defineConfig(async ({ mode: _mode }) => {
  const config = await loadCourseConfig();
  const lmsFormat = config.lmsFormat;
  const isWatchBuild = process.argv.includes('--watch');

  return {
    root: '.',
    base: './',

    define: {
      // Inject LMS format at build time for driver selection
      'import.meta.env.LMS_FORMAT': JSON.stringify(lmsFormat),
      // Dev mode flag - always true for framework development
      __DEV__: true
    },

    resolve: {
      alias: [
        // Map @slides alias for glob imports
        { find: '@slides', replacement: path.resolve(__dirname, 'template/course/slides') },
        { find: '@course', replacement: path.resolve(__dirname, 'template/course') },
        // Map @lib to the repo's lib/ directory
        { find: '@lib', replacement: path.resolve(__dirname, 'lib') },
        // Map relative framework imports from template/course/slides/ to actual framework/
        // Template slides use "../../framework/..." which needs to resolve to the repo's framework/
        { find: /^\.\.\/\.\.\/framework/, replacement: path.resolve(__dirname, 'framework') },
        // Map relative course imports from framework/ to template/course/
        { find: /^\.\.\/\.\.\/\.\.\/course/, replacement: path.resolve(__dirname, 'template/course') },
        { find: /^\.\.\/\.\.\/course/, replacement: path.resolve(__dirname, 'template/course') }
      ]
    },

    build: {
      outDir: 'dist',
      emptyOutDir: !isWatchBuild,
      target: SUPPORTED_BROWSER_TARGETS,
      // LMS environments (SCORM/cmi5) can be restrictive with dynamic imports,
      // so we intentionally keep main.js as a single chunk
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
        input: {
          main: path.resolve(__dirname, 'framework/index.html')
        },
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      }
    },

    plugins: [
      // The published/generated layout has framework/ and course/ as siblings.
      // Framework development keeps its sample course under template/course.
      {
        name: 'framework-dev-course-paths',
        transformIndexHtml: {
          order: 'pre',
          handler(html) {
            return html.replace('../course/theme.css', '../template/course/theme.css');
          }
        }
      },

      // Content discovery - generates manifest at build time
      contentDiscoveryPlugin({ coursePath: COURSE_DIR, slidesDir: path.join(COURSE_DIR, 'slides'), galleryConfig: config.galleryConfig }),

      viteStaticCopy({
        targets: [
          { src: 'schemas/*.{xml,xsd,dtd}', dest: '.', rename: { stripBase: 1 } },
          { src: 'schemas/common/*', dest: 'common', rename: { stripBase: 2 } },
          // Only publish learner-facing runtime assets. Authoring source,
          // references, configuration, answers, and hidden files stay out of dist/.
          { src: 'template/course/assets', dest: 'course', rename: { stripBase: 2 } },
          { src: 'framework/js/vendor/**/*', dest: 'js/vendor', rename: { stripBase: 3 } }
        ],
        watch: { rerun: true }
      }),

      scormDevPostBuild({ isWatchBuild })
    ]
  };
});
