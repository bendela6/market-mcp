import boundaries from 'eslint-plugin-boundaries';

export default [
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/*' },
        { type: 'vendor-core', pattern: 'packages/vendors/core' },
        { type: 'vendor', pattern: 'packages/vendors/*' },
        { type: 'contracts', pattern: 'packages/contracts' },
        { type: 'ui', pattern: 'packages/ui' },
        { type: 'env', pattern: 'packages/env' },
        { type: 'config', pattern: 'packages/config' },
      ],
      'boundaries/include': ['apps/**/*', 'packages/**/*'],
      'boundaries/ignore': ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts'],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'app', allow: ['contracts', 'ui', 'vendor', 'vendor-core', 'env', 'config'] },
            { from: 'vendor', allow: ['vendor-core', 'config'] },
            { from: 'vendor-core', allow: ['config'] },
            { from: 'ui', allow: ['config'] },
            { from: 'contracts', allow: ['config'] },
            { from: 'env', allow: ['config'] },
          ],
        },
      ],
    },
  },
];
