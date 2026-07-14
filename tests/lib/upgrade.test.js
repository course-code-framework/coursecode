import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import {
    addMissingRuntimeDependencies,
    syncCoursecodeCliDependency,
    syncManagedBuildTooling
} from '../../lib/upgrade.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageVersion = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8')).version;

describe('upgrade package dependency migration', () => {
    it('adds missing runtime dependencies from the current template', () => {
        const projectPkg = {
            dependencies: {
                'marked': '^16.0.0'
            },
            devDependencies: {
                'vite': '~7.2.2'
            }
        };
        const templatePkg = {
            dependencies: {
                '@xapi/cmi5': '^1.4.0',
                'marked': '^17.0.6'
            }
        };

        const added = addMissingRuntimeDependencies(projectPkg, templatePkg);

        expect(added).toEqual(['@xapi/cmi5']);
        expect(projectPkg.dependencies).toEqual({
            '@xapi/cmi5': '^1.4.0',
            'marked': '^16.0.0'
        });
    });

    it('moves required runtime dependencies out of dev dependencies', () => {
        const projectPkg = {
            devDependencies: {
                'jose': '^6.1.0',
                'vite': '~7.2.2'
            }
        };
        const templatePkg = {
            dependencies: {
                'jose': '^6.2.2'
            }
        };

        const added = addMissingRuntimeDependencies(projectPkg, templatePkg);

        expect(added).toEqual(['jose']);
        expect(projectPkg.dependencies).toEqual({ 'jose': '^6.1.0' });
        expect(projectPkg.devDependencies).toEqual({ 'vite': '~7.2.2' });
    });

    it('updates the project-local CourseCode CLI to the upgraded framework version', () => {
        const projectPkg = {
            devDependencies: {
                'coursecode': '^0.1.58',
                'vite': '~8.1.4'
            }
        };

        const change = syncCoursecodeCliDependency(projectPkg, '0.1.59');

        expect(change).toEqual({ updated: true, from: '^0.1.58', to: '^0.1.59' });
        expect(projectPkg.devDependencies).toEqual({
            'coursecode': '^0.1.59',
            'vite': '~8.1.4'
        });
    });

    it('adds a missing CourseCode CLI dependency during upgrade', () => {
        const projectPkg = { devDependencies: { 'vite': '~8.1.4' } };

        const change = syncCoursecodeCliDependency(projectPkg, '0.1.59');

        expect(change).toEqual({ updated: true, from: null, to: '^0.1.59' });
        expect(projectPkg.devDependencies.coursecode).toBe('^0.1.59');
    });

    it('synchronizes the CLI dependency through the upgrade command', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coursecode-upgrade-test-'));

        try {
            fs.writeFileSync(
                path.join(tempDir, '.coursecoderc.json'),
                JSON.stringify({ frameworkVersion: '0.1.0' })
            );
            fs.writeFileSync(
                path.join(tempDir, 'package.json'),
                JSON.stringify({
                    name: 'upgrade-test-course',
                    private: true,
                    devDependencies: { coursecode: '^0.1.0' }
                })
            );

            const output = execFileSync(
                process.execPath,
                [path.join(packageRoot, 'bin/cli.js'), 'upgrade'],
                { cwd: tempDir, encoding: 'utf-8' }
            );
            const upgradedPackage = JSON.parse(
                fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8')
            );

            expect(upgradedPackage.devDependencies.coursecode).toBe(`^${packageVersion}`);
            expect(output).toContain('CourseCode CLI dependency updated');
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('synchronizes Vite 8 tooling and removes the retired legacy plugin for --configs upgrades', () => {
        const projectPkg = {
            engines: { node: '>=18.0.0' },
            devDependencies: {
                '@vitejs/plugin-legacy': '~7.2.1',
                'custom-plugin': '^1.0.0',
                'vite': '~7.3.6',
                'vite-plugin-static-copy': '^3.4.0'
            }
        };
        const templatePkg = {
            engines: { node: '>=20.19.0' },
            devDependencies: {
                'eslint': '^9.39.4',
                'vite': '~8.1.4',
                'vite-plugin-static-copy': '^4.1.1'
            }
        };

        const changes = syncManagedBuildTooling(projectPkg, templatePkg);

        expect(changes.removed).toEqual(['@vitejs/plugin-legacy']);
        expect(changes.updated).toEqual([
            'eslint@^9.39.4',
            'vite@~8.1.4',
            'vite-plugin-static-copy@^4.1.1'
        ]);
        expect(changes.engineUpdated).toBe(true);
        expect(projectPkg.devDependencies).toEqual({
            'custom-plugin': '^1.0.0',
            'eslint': '^9.39.4',
            'vite': '~8.1.4',
            'vite-plugin-static-copy': '^4.1.1'
        });
        expect(projectPkg.engines.node).toBe('>=20.19.0');
    });
});
