import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            // @xapi/cmi5 has 'module' but no 'main' — Vite can't resolve its entry
            '@xapi/cmi5': path.resolve('node_modules/@xapi/cmi5/dist/Cmi5.esm.js'),
            // @slides is used by course-helpers.js import.meta.glob — needs resolution
            // even when the module is mocked, Vite's transform plugin still processes it
            '@slides': path.resolve('template/course/slides')
        }
    },
    test: {
        include: [
            'tests/**/*.test.js',
        ],
        exclude: [
            'tests/cloud-integration.test.js',
            'tests/e2e/**',           // E2E tests have their own config
        ],
        testTimeout: 10000,
        coverage: {
            provider: 'v8',
            include: ['framework/js/**/*.js', 'lib/**/*.js'],
            exclude: [
                '**/vendor/**',
                'lib/stub-player/**',
                'lib/mcp-server.js',
                'lib/mcp-prompts.js',
                'lib/headless-browser.js',
                'lib/proxy-templates/**'
            ],
            reporter: ['text', 'html', 'json-summary'],
            reportsDirectory: './coverage'
        }
    }
});
