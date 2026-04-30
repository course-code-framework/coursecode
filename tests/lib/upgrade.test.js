import { describe, it, expect } from 'vitest';
import { addMissingRuntimeDependencies } from '../../lib/upgrade.js';

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
                'jose': '^6.2.2',
                'marked': '^17.0.6'
            }
        };

        const added = addMissingRuntimeDependencies(projectPkg, templatePkg);

        expect(added).toEqual(['@xapi/cmi5', 'jose']);
        expect(projectPkg.dependencies).toEqual({
            '@xapi/cmi5': '^1.4.0',
            'jose': '^6.2.2',
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
});
