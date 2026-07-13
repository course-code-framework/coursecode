import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';

let generateManifest;
let contentDiscoveryPlugin;
let createStandardPackage;
let createExternalPackagesForClients;
let validateExternalHostingConfig;
let loadExternalAccessConfig;
let createPortableHtmlPlugin;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname);
const BUILD_OUTPUT = process.env.COURSECODE_OUT_DIR || 'dist';
const DIST_DIR = path.resolve(ROOT_DIR, BUILD_OUTPUT);
const PORTABLE_HTML = process.env.COURSECODE_PORTABLE_HTML === 'true';
const SUPPORTED_BROWSER_TARGETS = ['chrome111', 'edge111', 'firefox114', 'safari16.4'];

function directoryContainsFiles(directory) {
  if (!fs.existsSync(directory)) return false;
  return fs.readdirSync(directory, { withFileTypes: true }).some(entry => (
    entry.isFile() || (entry.isDirectory() && directoryContainsFiles(path.join(directory, entry.name)))
  ));
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function loadBuildUtils() {
  if (
    generateManifest &&
    contentDiscoveryPlugin &&
    createStandardPackage &&
    createExternalPackagesForClients &&
    validateExternalHostingConfig &&
    loadExternalAccessConfig &&
    createPortableHtmlPlugin
  ) {
    return;
  }

  try {
    ({ generateManifest } = await import('coursecode/manifest'));
    ({
      createStandardPackage,
      createExternalPackagesForClients,
      validateExternalHostingConfig,
      loadExternalAccessConfig
    } = await import('coursecode/build-packaging'));
    ({ default: contentDiscoveryPlugin } = await import('coursecode/vite-plugin-content-discovery'));
    ({ createPortableHtmlPlugin } = await import('coursecode/portable-html'));
  } catch {
    // Fallback for npm link / local dev — preview-server provides COURSECODE_LIB_DIR
    const libDir = process.env.COURSECODE_LIB_DIR;
    if (!libDir) throw new Error('Cannot resolve coursecode package. Run: npm install coursecode');
    const toUrl = (f) => pathToFileURL(path.join(libDir, f)).href;
    ({ generateManifest } = await import(toUrl('manifest/manifest-factory.js')));
    ({
      createStandardPackage,
      createExternalPackagesForClients,
      validateExternalHostingConfig,
      loadExternalAccessConfig
    } = await import(toUrl('build-packaging.js')));
    ({ default: contentDiscoveryPlugin } = await import(toUrl('vite-plugin-content-discovery.js')));
    ({ createPortableHtmlPlugin } = await import(toUrl('portable-html.js')));
  }
}

/**
 * Validate package structure based on format.
 * @param {string} format - 'scorm2004' | 'scorm1.2' | 'cmi5' | 'lti'
 */
function validatePackage(format = 'scorm2004') {
  const errors = [];
  const warnings = [];

  // Get required files based on format
  let requiredFiles;
  if (format === 'cmi5') {
    requiredFiles = ['cmi5.xml', 'index.html'];
  } else if (format === 'lti') {
    requiredFiles = ['lti-tool-config.json', 'index.html'];
  } else if (format === 'scorm1.2') {
    requiredFiles = [
      'imsmanifest.xml',
      'index.html',
      'imscp_rootv1p1p2.xsd',
      'adlcp_rootv1p2.xsd',
      'ims_xml.xsd'
    ];
  } else {
    // SCORM 2004 default
    requiredFiles = [
      'imsmanifest.xml',
      'index.html',
      'imscp_v1p1.xsd',
      'adlcp_v1p3.xsd',
      'imsss_v1p0.xsd'
    ];
  }

  requiredFiles.forEach(file => {
    const filePath = path.join(DIST_DIR, file);
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing required file: ${file}`);
    }
  });

  const assetsDir = path.join(DIST_DIR, 'assets');
  if (!fs.existsSync(assetsDir)) {
    warnings.push('No assets directory found');
  }

  // Authoring inputs must never be published with the learner runtime.
  const forbiddenCoursePaths = [
    'course/course-config.js',
    'course/references',
    'course/slides',
    'course/assessments',
    'course/theme.css'
  ];
  for (const relativePath of forbiddenCoursePaths) {
    if (fs.existsSync(path.join(DIST_DIR, relativePath))) {
      errors.push(`Authoring source leaked into package: ${relativePath}`);
    }
  }

  const invalidCopyLayouts = [
    '.vite',
    'schemas',
    'common/schemas',
    'course/course',
    'course/template',
    'js/vendor/framework'
  ];
  for (const relativePath of invalidCopyLayouts) {
    if (fs.existsSync(path.join(DIST_DIR, relativePath))) {
      errors.push(`Static-copy output has an unexpected nested source path: ${relativePath}`);
    }
  }

  // Validate manifest/tool config content by format
  if (format === 'cmi5') {
    // cmi5: Validate cmi5.xml structure
    const cmi5Path = path.join(DIST_DIR, 'cmi5.xml');
    if (fs.existsSync(cmi5Path)) {
      const cmi5Content = fs.readFileSync(cmi5Path, 'utf-8');
      if (!cmi5Content.includes('<courseStructure')) {
        errors.push('Generated cmi5.xml missing root <courseStructure> element');
      }
    }
  } else if (format === 'lti') {
    const ltiPath = path.join(DIST_DIR, 'lti-tool-config.json');
    if (fs.existsSync(ltiPath)) {
      try {
        const toolConfig = JSON.parse(fs.readFileSync(ltiPath, 'utf-8'));
        const ltiSpec = toolConfig['https://purl.imsglobal.org/spec/lti-tool-configuration'];
        if (!toolConfig.client_name || !ltiSpec?.target_link_uri) {
          errors.push('Generated lti-tool-config.json missing required fields (client_name, target_link_uri)');
        }
      } catch {
        errors.push('Generated lti-tool-config.json is not valid JSON');
      }
    }
  } else {
    const manifestPath = path.join(DIST_DIR, 'imsmanifest.xml');
    if (fs.existsSync(manifestPath)) {
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');

      if (!manifestContent.includes('<?xml version="1.0"')) {
        errors.push('Generated manifest missing XML declaration');
      }
      if (!manifestContent.includes('<manifest')) {
        errors.push('Generated manifest missing root <manifest> element');
      }
    }
  }

  return { errors, warnings };
}

/**
 * Load course-config.js using module import to support nested structures.
 */
async function loadCourseConfig() {
  const configPath = path.join(ROOT_DIR, 'course', 'course-config.js');
  if (!fs.existsSync(configPath)) {
    throw new Error('course-config.js not found');
  }

  const configUrl = `${pathToFileURL(configPath).href}?t=${Date.now()}`;
  const module = await import(configUrl);
  const config = module.courseConfig || module.default || {};

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
    windowWidth: config.environment?.window?.width || 1024,
    windowHeight: config.environment?.window?.height || 768,
    // LMS format: CLI override (env var) takes precedence over config file
    lmsFormat,
    externalUrl: process.env.LTI_EXTERNAL_URL || config.externalUrl || null,
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

/**
 * SCORM post-build plugin
 */
function scormPostBuild(isDev, { isWatchBuild }) {
  let initialBuild = true;
  return {
    name: 'scorm-post-build',
    enforce: 'post',
    buildStart() {
      if (initialBuild && isWatchBuild && fs.existsSync(DIST_DIR)) {
        fs.rmSync(DIST_DIR, { recursive: true, force: true });
      }
      initialBuild = false;
      if (isDev) console.log('🔨 Building...');
    },
    closeBundle: async () => {
      try {
        // Move index.html to root
        const indexSource = path.join(DIST_DIR, 'framework', 'index.html');
        const indexDest = path.join(DIST_DIR, 'index.html');
        removeHiddenBuildArtifacts(DIST_DIR);

        // Load course config once for meta tag injection and manifest generation
        const config = await loadCourseConfig();

        if (fs.existsSync(indexSource)) {
          fs.renameSync(indexSource, indexDest);

          let indexContent = fs.readFileSync(indexDest, 'utf-8');
          indexContent = indexContent.replace(/(src|href)="\.\.\/(assets|course)\//g, '$1="./$2/');

          // Stamp LMS format meta tag for runtime driver selection
          indexContent = indexContent.replace(
            '<meta charset="UTF-8" />',
            `<meta charset="UTF-8" />\n  <meta name="lms-format" content="${config.lmsFormat}" />\n  <meta name="coursecode-id" content="${escapeHtmlAttribute(`${config.title}:${config.version}`)}" />`
          );

          fs.writeFileSync(indexDest, indexContent, 'utf-8');

          const frameworkDir = path.join(DIST_DIR, 'framework');
          if (fs.existsSync(frameworkDir) && fs.readdirSync(frameworkDir).length === 0) {
            fs.rmdirSync(frameworkDir);
          }
        }

        if (PORTABLE_HTML) {
          if (!isDev) console.log('✓ Portable runtime assembled (LMS package files omitted)');
          return;
        }

        // Generate manifest using factory
        const files = isDev ? ['index.html'] : scanDistFiles();
        const manifestOptions = { externalUrl: config.externalUrl };
        const { filename, content } = generateManifest(config.lmsFormat, config, files, manifestOptions);
        fs.writeFileSync(path.join(DIST_DIR, filename), content, 'utf-8');

        if (!isDev) {
          console.log(`✓ Generated ${filename}`);

          const isProxyFormat = config.lmsFormat.endsWith('-proxy');
          const isRemoteFormat = config.lmsFormat.endsWith('-remote');
          const isExternalFormat = isProxyFormat || isRemoteFormat;

          if (!isExternalFormat) {
            const validationResults = validatePackage(config.lmsFormat);
            if (validationResults.errors.length > 0) {
              console.error('\n✗ Validation failed:');
              validationResults.errors.forEach(err => console.error(`  - ${err}`));
              throw new Error('Package validation failed');
            }

            console.log('✓ Package structure valid');
            console.log('\n📦 Creating package archive...');
            await createStandardPackage({ rootDir: ROOT_DIR, distDir: DIST_DIR, config });
          } else {
            validateExternalHostingConfig(config);
            console.log('\n📦 Creating external hosting package archives...');
            await createExternalPackagesForClients({ rootDir: ROOT_DIR, config });
          }
          console.log('\n✓ Package archive created');
        } else {
          console.log('✅ Build complete\n');
        }
      } catch (error) {
        console.error('❌ Post-processing failed:', error.message);
        throw error;
      }
    }
  };
}

export default defineConfig(async ({ mode }) => {
  await loadBuildUtils();
  const isDev = mode === 'development';
  const isWatchBuild = process.argv.includes('--watch');
  const courseConfig = await loadCourseConfig();
  const staticCopyTargets = [
    ...(!PORTABLE_HTML ? [
      { src: 'schemas/*.{xml,xsd,dtd}', dest: '.', rename: { stripBase: 1 } },
      { src: 'schemas/common/*', dest: 'common', rename: { stripBase: 2 } },
      { src: 'framework/js/vendor/**/*', dest: 'js/vendor', rename: { stripBase: 3 } }
    ] : []),
    // Publish runtime assets only. Authoring source stays out of every output.
    ...(directoryContainsFiles(path.join(ROOT_DIR, 'course', 'assets'))
      ? [{ src: 'course/assets', dest: 'course', rename: { stripBase: 1 } }]
      : [])
  ];

  return {
    root: '.',
    base: './',

    define: {
      // Build timestamp for cache-busting static assets (audio, images)
      __BUILD_TIMESTAMP__: JSON.stringify(Date.now().toString()),
      // Inject LMS format for driver selection at runtime
      'import.meta.env.LMS_FORMAT': JSON.stringify(courseConfig.lmsFormat),
      // Dev mode flag for tree-shaking dev-only code (CourseLinter, etc.)
      __DEV__: isDev
    },

    resolve: {
      alias: {
        '@slides': path.resolve(__dirname, 'course/slides'),
        // COURSECODE_LIB_DIR is set by preview-server; falls back to installed package path
        '@lib': process.env.COURSECODE_LIB_DIR || path.resolve(__dirname, 'node_modules/coursecode/lib')
      }
    },

    build: {
      outDir: BUILD_OUTPUT,
      emptyOutDir: !isWatchBuild,
      // Stable browser contract for LMS launches. SCORM defines the LMS API,
      // not an obsolete browser requirement; IE11/SystemJS is unsupported.
      target: SUPPORTED_BROWSER_TARGETS,
      // LMS environments (SCORM/cmi5) can be restrictive with dynamic imports,
      // so we intentionally keep main.js as a single chunk
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
        input: {
          main: path.resolve(__dirname, 'framework/index.html')
        },
        // All drivers are bundled as lazy chunks in the universal build.
        // LTI OIDC/JWT validation remains server-side, so no browser crypto
        // verification dependency is required here.
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      }
    },

    plugins: [
      // Content discovery - generates manifest at build time
      contentDiscoveryPlugin({ galleryConfig: courseConfig.galleryConfig }),

      ...(PORTABLE_HTML ? [createPortableHtmlPlugin()] : []),

      ...(staticCopyTargets.length > 0 ? [viteStaticCopy({
        targets: staticCopyTargets,
        watch: isDev ? { rerun: true } : undefined
      })] : []),

      scormPostBuild(isDev, { isWatchBuild })
    ]
  };
});
