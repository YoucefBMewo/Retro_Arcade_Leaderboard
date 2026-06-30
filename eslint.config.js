// eslint.config.js
import tseslint from 'typescript-eslint';

export default tseslint.config(
  tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // your custom rule overrides here
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  }
);