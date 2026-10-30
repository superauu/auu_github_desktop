import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'src-tauri/**', '.test-tmp-*/**', '.test-safety-*/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // React 19 hooks 静态防线：rules-of-hooks 抓条件/循环内 hook（真 bug 类，当前零违规）。
  // All effects are checked. Measurement-cache invalidation has two documented
  // local exceptions; compiler-oriented rules remain a separate migration.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // TypeScript checks unused symbols; legacy API responses are intentionally untyped.
      'no-unused-vars': 'off',
      // ignoreRestSiblings: 放行「解构剔除敏感字段」惯用法（如 settingsStore 剔除 apiKey）。
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }],
      // Error.cause 需要 ES2022，target 已升级，恢复 recommended 默认检查。
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
