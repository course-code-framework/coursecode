import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve('framework/css/responsive-structure.css');
const source = fs.readFileSync(filePath, 'utf8');
const lines = source.split('\n');

// For generic shell selectors in responsive-structure.css, require explicit
// exclusion of article/focused (unless the selector is already layout-scoped).
const highRiskSelectors = [
  /\.app-footer\b/,
  /\.nav-controls\b/,
  /\.nav-nav-buttons\b/,
  /\.nav-exit-button\b/,
  /#audio-player\b/,
  /\.audio-player-controls\b/,
  /\.audio-progress-container\b/,
  /\.audio-time\b/
];

const layoutScoped = /\[data-layout=/;
const requiredExclusion = /:not\(\[data-layout="article"\]\):not\(\[data-layout="focused"\]\)/;

const violations = [];

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('*/')) continue;
  if (!trimmed.includes('{')) continue;

  const isHighRisk = highRiskSelectors.some((re) => re.test(trimmed));
  if (!isHighRisk) continue;

  // Allow explicit layout-owned selectors (traditional/article/focused/presentation)
  if (layoutScoped.test(trimmed)) continue;

  if (!requiredExclusion.test(trimmed)) {
    violations.push({ line: i + 1, text: trimmed });
  }
}

if (violations.length) {
  console.error('Responsive structure scoping check failed.');
  console.error('High-risk generic shell selectors in responsive-structure.css must exclude article/focused:\n');
  for (const v of violations) {
    console.error(`  ${v.line}: ${v.text}`);
  }
  process.exit(1);
}

console.log('Responsive structure scoping check passed.');
