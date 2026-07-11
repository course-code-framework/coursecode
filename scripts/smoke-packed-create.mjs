import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-packed-smoke-'));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: { ...process.env, ...options.env },
    encoding: 'utf-8',
    stdio: options.capture ? 'pipe' : 'inherit'
  });

  if (result.status !== 0) {
    const details = options.capture ? `\n${result.stdout || ''}${result.stderr || ''}` : '';
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}${details}`);
  }

  return result.stdout?.trim() || '';
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const packOutput = run('npm', ['pack', '--silent', '--pack-destination', tempRoot], { capture: true });
  const tarballName = packOutput.split(/\r?\n/).filter(Boolean).at(-1);
  const tarballPath = path.join(tempRoot, tarballName);
  assert(fs.existsSync(tarballPath), `Packed tarball was not created: ${tarballPath}`);

  const launcherDir = path.join(tempRoot, 'launcher');
  fs.mkdirSync(launcherDir);
  fs.writeFileSync(
    path.join(launcherDir, 'package.json'),
    JSON.stringify({ name: 'coursecode-packed-smoke-launcher', private: true }, null, 2)
  );
  run('npm', ['install', '--silent', tarballPath], { cwd: launcherDir });

  const packedPackageRoot = path.join(launcherDir, 'node_modules', 'coursecode');
  assert(fs.existsSync(path.join(packedPackageRoot, 'template', 'gitignore')), 'Packed template is missing gitignore');
  assert(fs.existsSync(path.join(packedPackageRoot, 'template', 'gitattributes')), 'Packed template is missing gitattributes');

  const projectDir = path.join(tempRoot, 'client-manager-course');
  fs.mkdirSync(projectDir);
  const packedCli = path.join(launcherDir, 'node_modules', '.bin', 'coursecode');
  run(packedCli, ['create', '.', '--blank', '--no-install'], { cwd: projectDir });
  assert(
    fs.existsSync(path.join(projectDir, 'course', 'references', '.gitkeep')),
    'Packed create did not preserve course/references/'
  );
  assert(
    fs.existsSync(path.join(projectDir, 'course', 'references', 'converted', '.gitkeep')),
    'Packed create did not preserve course/references/converted/'
  );

  const existingRepoDir = path.join(tempRoot, 'existing-repository');
  fs.mkdirSync(path.join(existingRepoDir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(existingRepoDir, 'existing-file.txt'), 'preserve me\n');
  fs.writeFileSync(path.join(existingRepoDir, '.gitignore'), 'custom-output/\n');
  run(packedCli, ['init', 'Existing Repository Smoke', '--blank', '--no-install'], {
    cwd: existingRepoDir
  });
  assert(
    fs.readFileSync(path.join(existingRepoDir, 'existing-file.txt'), 'utf-8') === 'preserve me\n',
    'Current-directory initialization did not preserve existing repository content'
  );
  const mergedGitignore = fs.readFileSync(path.join(existingRepoDir, '.gitignore'), 'utf-8');
  assert(
    mergedGitignore.includes('custom-output/') && mergedGitignore.includes('node_modules/'),
    'Current-directory initialization did not merge Git ignore rules'
  );

  const projectPackagePath = path.join(projectDir, 'package.json');
  const projectPackage = JSON.parse(fs.readFileSync(projectPackagePath, 'utf-8'));
  const packedVersion = JSON.parse(
    fs.readFileSync(path.join(packedPackageRoot, 'package.json'), 'utf-8')
  ).version;
  assert(
    projectPackage.devDependencies?.coursecode === `^${packedVersion}`,
    'Generated project does not depend on the creating CourseCode version'
  );
  assert(
    projectPackage.name === 'client-manager-course',
    `create . generated an unexpected npm package name: ${projectPackage.name}`
  );
  const generatedConfig = fs.readFileSync(
    path.join(projectDir, 'course', 'course-config.js'),
    'utf-8'
  );
  assert(
    generatedConfig.includes("title: 'Client Manager Course'"),
    'create . did not derive the expected title-cased course title'
  );

  projectPackage.devDependencies.coursecode = `file:${tarballPath}`;
  fs.writeFileSync(projectPackagePath, `${JSON.stringify(projectPackage, null, 2)}\n`);
  run('npm', ['install', '--silent'], { cwd: projectDir });

  const projectCli = path.join(projectDir, 'node_modules', '.bin', 'coursecode');
  run(projectCli, ['new', 'slide', 'smoke-slide'], { cwd: projectDir });
  run(projectCli, ['new', 'assessment', 'smoke-assessment'], { cwd: projectDir });

  const introSource = fs.readFileSync(path.join(projectDir, 'course', 'slides', 'intro.js'), 'utf-8');
  const slideSource = fs.readFileSync(path.join(projectDir, 'course', 'slides', 'smoke-slide.js'), 'utf-8');
  const assessmentSource = fs.readFileSync(
    path.join(projectDir, 'course', 'slides', 'smoke-assessment.js'),
    'utf-8'
  );
  assert(introSource.includes('render(_root, _context)'), 'Blank intro slide has a lint-unsafe render signature');
  assert(slideSource.includes('render(_root, _context)'), 'Generated slide has a lint-unsafe render signature');
  assert(
    assessmentSource.includes('createAssessment({ ...config, questions })') &&
      assessmentSource.includes('assessment.render(container, context)'),
    'Generated assessment does not use the supported container/config pattern'
  );

  const forbiddenDemoAssets = [
    'course/assets/docs/example_md_1.md',
    'course/assets/docs/example_md_2.md',
    'course/assets/docs/example_pdf_1_thumbnail.png',
    'course/assets/docs/example_pdf_2.pdf',
    'course/assets/images/course-architecture.svg',
    'course/assets/images/logo.svg',
    'course/assets/widgets/counter-demo.html',
    'course/assets/widgets/gravity-painter.html',
    '.narration-cache.json'
  ];
  for (const relativePath of forbiddenDemoAssets) {
    assert(!fs.existsSync(path.join(projectDir, relativePath)), `Blank project retained demo file: ${relativePath}`);
  }

  for (const ignoredPath of ['node_modules/', 'dist/', 'course.zip', '.narration-cache.json', '.env']) {
    run('git', ['check-ignore', '--no-index', '--quiet', ignoredPath], { cwd: projectDir });
  }

  run('npm', ['run', 'lint'], { cwd: projectDir });
  run('npm', ['run', 'build'], { cwd: projectDir });

  const zipCreated = fs.readdirSync(projectDir).some(name => name.endsWith('.zip'));
  assert(zipCreated, 'Packed smoke project did not produce an LMS ZIP');
  console.log('\n✅ Packed CourseCode create . smoke test passed');
} finally {
  if (process.env.COURSECODE_KEEP_SMOKE === '1') {
    console.log(`Smoke workspace retained at ${tempRoot}`);
  } else {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}
