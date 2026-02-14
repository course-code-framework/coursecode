import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.min.js',
      '**/vendor/**',
      'docs/**'
    ]
  },
  {
    // Build scripts and lib helpers can use console.log for progress output
    files: ['vite.config.js', 'eslint.config.js', 'lib/**/*.js'],
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
      'quotes': ['error', 'single', { avoidEscape: true }]
    }
  },
  {
    files: ['**/*.js'],
    ignores: ['vite.config.js', 'eslint.config.js', 'lib/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
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
