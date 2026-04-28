

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
  validateExternalHostingConfig
} from './lib/build-packaging.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname);
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const COURSE_DIR = path.join(ROOT_DIR, 'template', 'course');

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
  
  return {
    title: config.metadata?.title || 'SCORM Course',
    description: config.metadata?.description || 'SCORM 2004 4th Edition Course',
    version: config.metadata?.version || '1.0.0',
    author: config.metadata?.author || 'Unknown',
    language: config.metadata?.language || 'en',
    lmsFormat: process.env.LMS_FORMAT || config.format || 'cmi5',
    externalUrl: config.externalUrl || null,
    accessControl: config.accessControl || null,
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

/**
 * SCORM post-build plugin for dev
 */
function scormDevPostBuild() {
  return {
    name: 'scorm-dev-post-build',
    buildStart() {
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
      emptyOutDir: false,
      manifest: true,
      // LMS environments (SCORM/cmi5) can be restrictive with dynamic imports,
      // so we intentionally keep main.js as a single chunk
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'framework/index.html')
        },
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name].[ext]'
        }
      }
    },

    plugins: [
      // Content discovery - generates manifest at build time
      contentDiscoveryPlugin({ coursePath: COURSE_DIR, slidesDir: path.join(COURSE_DIR, 'slides'), galleryConfig: config.galleryConfig }),

      viteStaticCopy({
        targets: [
          { src: 'schemas/*.{xml,xsd,dtd}', dest: '.' },
          { src: 'schemas/common/*', dest: 'common' },
          { src: 'template/course', dest: '.' },
          { src: 'framework/js/vendor/**/*', dest: 'js/vendor' }
        ],
        watch: { rerun: true }
      }),

      scormDevPostBuild()
    ]
  };
});
