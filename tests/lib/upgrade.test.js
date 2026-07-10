import { describe, it, expect } from 'vitest';
import { addMissingRuntimeDependencies, syncManagedBuildTooling } from '../../lib/upgrade.js';

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
