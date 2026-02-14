import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@xapi/cmi5': path.resolve('node_modules/@xapi/cmi5/dist/Cmi5.esm.js')
        }
    },
    test: {
        include: ['tests/cloud-integration.test.js'],
        testTimeout: 15000
    }
});
