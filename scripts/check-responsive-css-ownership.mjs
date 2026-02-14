import fs from 'node:fs';
import path from 'node:path';

const targetPath = path.resolve('framework/css/responsive.css');
const source = fs.readFileSync(targetPath, 'utf8');
const lines = source.split('\n');

// High-risk selectors belong in framework/css/responsive-structure.css or
// layout/component DATA-LAYOUT responsive blocks, not generic responsive.css.
const forbiddenPatterns = [
  { label: '#app shell', re: /\b#app\b/ },
  { label: 'header chrome', re: /\bheader\b/ },
  { label: 'brand chrome', re: /#brand\b/ },
  { label: 'header progress chrome', re: /\.header-progress\b/ },
  { label: 'breadcrumbs chrome', re: /\.breadcrumbs\b/ },
  { label: 'footer shell', re: /\.app-footer\b/ },
  { label: 'nav controls shell', re: /\.nav-controls\b/ },
  { label: 'nav button group shell', re: /\.nav-nav-buttons\b/ },
  { label: 'nav exit shell', re: /\.nav-exit-button\b/ },
  { label: 'audio shell', re: /#audio-player\b/ },
  { label: 'audio controls shell', re: /\.audio-player-controls\b/ }
];

const allowLinePatterns = [
  /responsive-structure\.css/i,
  /MAINTAINER NOTE/i,
  /High-risk generic selectors/i
];

const violations = [];

lines.forEach((line, idx) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('*/')) {
    return;
  }
  if (!trimmed.includes('{')) return;
  if (allowLinePatterns.some((re) => re.test(line))) return;

  for (const pattern of forbiddenPatterns) {
    if (pattern.re.test(line)) {
      violations.push({
        line: idx + 1,
        label: pattern.label,
        text: trimmed
      });
      break;
    }
  }
});

if (violations.length > 0) {
  console.error('Responsive CSS ownership check failed.');
  console.error(`Found ${violations.length} structural selector(s) in framework/css/responsive.css:\n`);
  for (const v of violations) {
    console.error(`  ${v.line}: [${v.label}] ${v.text}`);
  }
  console.error('\nMove shell/header/footer/nav/audio responsive rules to framework/css/responsive-structure.css.');
  process.exit(1);
}

console.log('Responsive CSS ownership check passed.');
