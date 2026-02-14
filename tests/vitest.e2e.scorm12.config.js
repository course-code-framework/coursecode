import { defineConfig } from 'vitest/config';
import path from 'path';

process.env.E2E_PORT = '4200';
process.env.E2E_LMS_FORMAT = 'scorm1.2';

export default defineConfig({
    resolve: {
        alias: {
            '@xapi/cmi5': path.resolve('node_modules/@xapi/cmi5/dist/Cmi5.esm.js')
        }
    },
    test: {
        include: ['tests/e2e/drivers.e2e.test.js'],
        globalSetup: ['tests/e2e/helpers/global-setup.js'],
        pool: 'forks',
        forks: { singleFork: true },
        testTimeout: 30000,
        hookTimeout: 60000
    }
});
