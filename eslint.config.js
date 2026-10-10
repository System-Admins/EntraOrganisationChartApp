import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** A layer may only import the layers further in; only src/bootstrap sees every layer. */
const layers = {
  domain: ['application', 'infrastructure', 'presentation', 'bootstrap'],
  application: ['infrastructure', 'presentation', 'bootstrap'],
  infrastructure: ['presentation', 'bootstrap'],
  presentation: ['infrastructure', 'bootstrap'],
};

const frameworkFreeLayers = ['domain', 'application'];

const layerBoundaries = Object.entries(layers).map(([layer, forbidden]) => ({
  files: [`src/${layer}/**/*.{ts,tsx}`],
  rules: {
    // no-restricted-imports only sees static imports; this covers import() with the same paths.
    'no-restricted-syntax': [
      'error',
      {
        selector: `ImportExpression[source.value=/(?:^@|\\.\\.)\\/(?:${forbidden.join('|')})\\//]`,
        message: `The ${layer} layer must not depend on ${forbidden.join(', ')}.`,
      },
    ],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          ...forbidden.map((target) => ({
            group: [`@/${target}/*`, `**/${target}/*`],
            message: `The ${layer} layer must not depend on ${target}.`,
          })),
          ...(frameworkFreeLayers.includes(layer)
            ? [
                {
                  group: ['react', 'react-dom', 'react-dom/*', '@azure/*', '@microsoft/*'],
                  message: `The ${layer} layer must stay framework-free.`,
                },
              ]
            : []),
        ],
      },
    ],
  },
}));

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'node_modules', 'teams/build', 'sharepoint']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      reactHooks.configs.flat['recommended-latest'],
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  ...layerBoundaries,
]);
