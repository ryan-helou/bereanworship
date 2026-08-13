import { FlatCompat } from '@eslint/eslintrc';

/**
 * Flat ESLint config.
 *
 * `next lint` is deprecated in Next 15 and prompts interactively, which is no
 * use in CI. This wires eslint-config-next into the flat config the ESLint CLI
 * expects, so `npm run lint` is non-interactive and scriptable.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'prisma/migrations/**',
      '.scratch/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Findings and job payloads legitimately cross an `unknown` boundary and
      // are narrowed at the point of use; a blanket ban here would only push
      // people toward silent casts.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
];

export default config;
