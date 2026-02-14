import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@xapi/cmi5': path.resolve('node_modules/@xapi/cmi5/dist/Cmi5.esm.js')
        }
    },
    test: {
        include: ['tests/e2e/**/*.e2e.test.js'],
        exclude: ['tests/e2e/drivers.e2e.test.js'],
        globalSetup: ['tests/e2e/helpers/global-setup.js'],
        // E2E tests share a single preview server + browser — run sequentially
        pool: 'forks',
        fileParallelism: false,
        forks: { singleFork: true },
        testTimeout: 30000,
        hookTimeout: 60000
    }
});
