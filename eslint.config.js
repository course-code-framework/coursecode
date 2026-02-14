import globals from 'globals';

export default [
    {
        ignores: [
            'dist/**',
            'framework/dist/**',
            'node_modules/**',
            '*.min.js',
            '**/vendor/**',
            'docs/**',
            'template/**'  // Template has its own eslint config
        ]
    },
    {
        // Build scripts and configs can use console.log for progress output
        files: ['vite.framework-dev.config.js', 'eslint.config.js', 'lib/**/*.js', 'bin/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node
            }
        },
        rules: {
            'no-console': 'off',
            'semi': ['error', 'always'],
            'quotes': ['error', 'single', { avoidEscape: true }],
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
        }
    },
    {
        // Framework browser code
        files: ['framework/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser
            }
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
            'no-console': ['error', { allow: ['warn', 'error'] }],
            'semi': ['error', 'always'],
            'quotes': ['error', 'single', { avoidEscape: true }]
        }
    }
];
