import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

import headless from '../lib/headless-browser.js';

const DEFAULT_PORT = 4173;
const TIMEOUT_MS = 30000;

function parseArgs(argv) {
  const args = {
    port: DEFAULT_PORT,
    reusePreview: false,
    noScreenshots: false,
    outDir: null,
    profile: 'default'
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--reuse-preview') args.reusePreview = true;
    else if (arg === '--no-screenshots') args.noScreenshots = true;
    else if (arg.startsWith('--profile=')) args.profile = arg.split('=')[1];
    else if (arg.startsWith('--port=')) args.port = Number(arg.split('=')[1]);
    else if (arg.startsWith('--out-dir=')) args.outDir = arg.split('=').slice(1).join('=');
  }

  if (!Number.isFinite(args.port) || args.port <= 0) {
    throw new Error(`Invalid --port value: ${args.port}`);
  }
  return args;
}

function getTestCases(profile) {
  const desktop = { breakpoint: 'desktop' };
  const mobile = { width: 375, height: 812 };

  const baseline = [
    { layout: 'article', slideId: 'example-ui-showcase', desktop, mobile },
    { layout: 'traditional', slideId: 'example-ui-showcase', desktop, mobile },
    { layout: 'focused', slideId: 'example-welcome', desktop, mobile },
    { layout: 'presentation', slideId: 'example-welcome', desktop, mobile }
  ];

  if (profile !== 'expanded') return baseline;

  return [
    ...baseline,
    // Long-scroll / code-heavy content in common layouts
    { layout: 'article', slideId: 'example-course-structure', desktop, mobile },
    { layout: 'traditional', slideId: 'example-course-structure', desktop, mobile },
    // Assessment shell behavior
    { layout: 'article', slideId: 'example-final-exam', desktop, mobile },
    { layout: 'traditional', slideId: 'example-final-exam', desktop, mobile },
    // Extra layout checks beyond the welcome hero
    { layout: 'focused', slideId: 'example-final-exam', desktop, mobile },
    { layout: 'presentation', slideId: 'example-final-exam', desktop, mobile }
  ];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetries(fn, { attempts = 3, delayMs = 1000, label = 'operation' } = {}) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === attempts) break;
      console.warn(`[responsive-smoke] ${label} failed (attempt ${i}/${attempts}): ${err.message}`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

function waitForHttp(port, timeoutMs = TIMEOUT_MS) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Preview server not reachable on port ${port} after ${timeoutMs}ms`));
          return;
        }
        setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

function startPreviewServer(port) {
  const child = spawn('node', ['lib/preview-server.js', '--framework-dev', `--port=${port}`], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  });

  child.stdout.on('data', (d) => process.stdout.write(d.toString()));
  child.stderr.on('data', (d) => process.stderr.write(d.toString()));

  return child;
}

function makeOutDir(customDir) {
  const base = customDir
    ? path.resolve(customDir)
    : path.resolve('artifacts', 'responsive-smoke', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(base, { recursive: true });
  return base;
}

async function setLayout(layout) {
  await headless.evaluate((layoutName) => {
    const root = document.documentElement;
    root.setAttribute('data-layout', layoutName);
    if (!root.hasAttribute('data-sidebar-enabled')) {
      root.setAttribute('data-sidebar-enabled', 'false');
    }
  }, layout);
  await sleep(150);
}

async function inspectViewport({ layout, viewportName }) {
  return headless.evaluate((ctx) => {
    const root = document.documentElement;
    const footer = document.querySelector('footer.app-footer');
    const prev = document.getElementById('prevBtn');
    const next = document.getElementById('nextBtn');
    const body = document.body;
    const docEl = document.documentElement;

    const footerRect = footer?.getBoundingClientRect() ?? null;
    const prevRect = prev?.getBoundingClientRect() ?? null;
    const nextRect = next?.getBoundingClientRect() ?? null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const footerStyle = footer ? window.getComputedStyle(footer) : null;

    const result = {
      context: ctx,
      metrics: {
        viewport: { width: vw, height: vh },
        scrollWidth: Math.max(docEl.scrollWidth, body.scrollWidth),
        clientWidth: docEl.clientWidth
      },
      footer: footer ? {
        display: footerStyle.display,
        position: footerStyle.position,
        bottomPx: footerStyle.bottom,
        rect: footerRect ? {
          top: footerRect.top,
          bottom: footerRect.bottom,
          left: footerRect.left,
          right: footerRect.right,
          width: footerRect.width,
          height: footerRect.height
        } : null
      } : null,
      navButtons: {
        prev: prevRect ? { width: prevRect.width, height: prevRect.height, visible: prevRect.width > 0 && prevRect.height > 0 } : null,
        next: nextRect ? { width: nextRect.width, height: nextRect.height, visible: nextRect.width > 0 && nextRect.height > 0 } : null
      }
    };

    const errors = [];

    if (result.metrics.scrollWidth > result.metrics.clientWidth + 1) {
      errors.push(`Horizontal overflow detected (${result.metrics.scrollWidth}px > ${result.metrics.clientWidth}px)`);
    }

    if (!result.navButtons.prev?.visible || !result.navButtons.next?.visible) {
      errors.push('Prev/Next button not visible');
    }

    if (ctx.layout === 'article' && ctx.viewportName === 'mobile') {
      const minTarget = 44;
      if ((result.navButtons.prev?.width ?? 0) < minTarget || (result.navButtons.prev?.height ?? 0) < minTarget) {
        errors.push(`Prev button touch target below ${minTarget}px`);
      }
      if ((result.navButtons.next?.width ?? 0) < minTarget || (result.navButtons.next?.height ?? 0) < minTarget) {
        errors.push(`Next button touch target below ${minTarget}px`);
      }
      if (result.footer?.position !== 'fixed') {
        errors.push(`Article mobile footer should be fixed (got ${result.footer?.position || 'missing'})`);
      } else if (result.footer?.rect) {
        const distanceFromBottom = Math.abs(vh - result.footer.rect.bottom);
        if (distanceFromBottom > 2) {
          errors.push(`Article mobile footer not pinned to viewport bottom (delta ${distanceFromBottom.toFixed(1)}px)`);
        }
      }
    }

    return { ...result, errors };
  }, { layout, viewportName });
}

async function capture(name, slideId, outDir, options = {}) {
  const shot = await headless.screenshot({ slideId, detailed: true, ...options });
  const file = path.join(outDir, `${name}.jpg`);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  return file;
}

async function run() {
  const args = parseArgs(process.argv);
  const outDir = args.noScreenshots ? null : makeOutDir(args.outDir);
  let previewChild = null;
  let failed = false;
  const failures = [];

  try {
    if (!args.reusePreview) {
      previewChild = startPreviewServer(args.port);
      await waitForHttp(args.port, TIMEOUT_MS);
      // Give the first build a moment to finish loading
      await sleep(1200);
    } else {
      await waitForHttp(args.port, 5000);
    }

    await withRetries(
      async () => {
        if (headless.isRunning()) {
          await headless.shutdown();
        }
        await headless.launch(args.port);
      },
      { attempts: 4, delayMs: 1500, label: 'headless launch' }
    );

    const testCases = getTestCases(args.profile);

    const report = [];

    for (const tc of testCases) {
      await setLayout(tc.layout);
      for (const [viewportName, viewportSpec] of [['desktop', tc.desktop], ['mobile', tc.mobile]]) {
        if (viewportSpec.breakpoint) {
          await headless.setViewport(viewportSpec.breakpoint);
        } else {
          await headless.setViewport(viewportSpec);
        }
        await headless.evaluate((id) => window.CourseCodeAutomation.goToSlide(id), tc.slideId);
        await sleep(500);

        const inspection = await inspectViewport({ layout: tc.layout, viewportName });
        report.push(inspection);
        if (inspection.errors.length) {
          failed = true;
          for (const err of inspection.errors) {
            failures.push(`${tc.layout}/${viewportName}: ${err}`);
          }
        }

        if (!args.noScreenshots) {
          const base = `${tc.layout}-${viewportName}-${tc.slideId}`;
          await capture(base, tc.slideId, outDir);
        }
      }
    }

    const consoleLogs = headless.getConsoleLogs();
    const warnOrErr = consoleLogs.filter(l => l.type === 'warning' || l.type === 'error');
    if (warnOrErr.length) {
      failed = true;
      for (const log of warnOrErr) {
        failures.push(`console ${log.type}: ${log.text}`);
      }
    }

    if (!args.noScreenshots) {
      fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ report, consoleLogs }, null, 2));
    }

    console.log(`\nResponsive visual smoke summary (profile: ${args.profile})`);
    for (const entry of report) {
      console.log(`- ${entry.context.layout}/${entry.context.viewportName}: ${entry.errors.length ? 'FAIL' : 'PASS'}`);
    }
    if (!args.noScreenshots) {
      console.log(`Artifacts: ${outDir}`);
    }

    if (failures.length) {
      console.error('\nFailures:');
      for (const f of failures) console.error(`- ${f}`);
      process.exitCode = 1;
    } else {
      console.log('\nResponsive visual smoke passed.');
    }
  } finally {
    try {
      if (headless.isRunning()) await headless.shutdown();
    } catch (_e) {}

    if (previewChild) {
      previewChild.kill('SIGTERM');
      await Promise.race([
        new Promise(resolve => previewChild.once('exit', resolve)),
        sleep(2000)
      ]);
      if (!previewChild.killed) previewChild.kill('SIGKILL');
    }
  }
}

run().catch((err) => {
  console.error(`Responsive visual smoke failed: ${err.stack || err.message}`);
  process.exit(1);
});
