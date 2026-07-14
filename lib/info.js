/**
 * Info command - show info about current project
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(__dirname, '..');

export function findLatestCoursePackage(directory) {
  const packages = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.zip'))
    .map(entry => ({
      name: entry.name,
      modifiedAt: fs.statSync(path.join(directory, entry.name)).mtimeMs
    }))
    .sort((a, b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name));

  return packages[0]?.name || null;
}

export async function info() {
  const cwd = process.cwd();

  // CLI info
  const cliPkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf-8'));

  console.log(`
📦 CourseCode CLI v${cliPkg.version}
`);

  // Check if in a project
  const rcPath = path.join(cwd, '.coursecoderc.json');
  const courseConfigPath = path.join(cwd, 'course', 'course-config.js');

  if (!fs.existsSync(rcPath) && !fs.existsSync(path.join(cwd, 'course'))) {
    console.log(`   Not in a CourseCode project directory.
   
   Create a new project:
   coursecode create my-course
`);
    return;
  }

  console.log(`   Project directory: ${cwd}`);

  // Read .coursecoderc.json if exists
  if (fs.existsSync(rcPath)) {
    const rcConfig = JSON.parse(fs.readFileSync(rcPath, 'utf-8'));
    console.log(`   Framework version: ${rcConfig.frameworkVersion}`);
    if (rcConfig.createdAt) {
      console.log(`   Created: ${new Date(rcConfig.createdAt).toLocaleDateString()}`);
    }
    if (rcConfig.upgradedAt) {
      console.log(`   Last upgraded: ${new Date(rcConfig.upgradedAt).toLocaleDateString()}`);
    }
  }

  // Read course config for metadata
  if (fs.existsSync(courseConfigPath)) {
    const configContent = fs.readFileSync(courseConfigPath, 'utf-8');

    // Extract metadata with regex
    const titleMatch = configContent.match(/title:\s*["']([^"']+)["']/);
    const versionMatch = configContent.match(/version:\s*["']([^"']+)["']/);

    if (titleMatch || versionMatch) {
      console.log('');
      console.log('   Course info:');
      if (titleMatch) console.log(`     Title: ${titleMatch[1]}`);
      if (versionMatch) console.log(`     Version: ${versionMatch[1]}`);
    }
  }

  // Check for dist
  const distDir = path.join(cwd, 'dist');
  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir);
    console.log(`\n   Build output: dist/ (${files.length} files)`);
  }

  // Check for ZIP
  const latestPackage = findLatestCoursePackage(cwd);
  if (latestPackage) {
    console.log(`   Course package: ${latestPackage}`);
  }

  console.log('');
}
