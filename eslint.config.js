import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'src-tauri/**', '.test-tmp-*/**', '.test-safety-*/**', '.test-gitee-ui/**', '.test-*/**', 'test-results/**', 'playwright-report/**'] },
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
  // JSX 可访问性防线：recommended 全量接入（接入时修复存量，防止新代码回退）。
  // 注：插件 peer 声明只到 eslint 9，实际与 eslint 10 兼容（legacy-peer-deps 安装）。
  // 四条规则按本代码库既定可访问性约定调档（每条都有量化依据，接入审计结论）：
  // - 交互三规则（click-events/static-element/noninteractive-element）：行内键盘处理经
  //   keyboardRowProps 展开提供，规则看不见 spread（24 处误报）；弹层包装器的 stopPropagation、
  //   终端聚焦代理、diff 标尺/ResizeHandle 等指针面按设计即指针交互，键盘路径由对话框
  //   Escape/聚焦约定承担。真实缺口已在接入时修复（键盘滚动区 region 标注等）。
  // - no-autofocus：对话框打开即聚焦主输入是既定 UX 约定（Radix Dialog 亦自动管理焦点）。
  // - no-noninteractive-tabindex：roles 放行 region（键盘滚动区）/separator（ResizeHandle）/listitem（键盘行）。
  {
    files: ['src/**/*.tsx'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
      'jsx-a11y/no-autofocus': 'off',
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['region', 'separator', 'listitem'] }],
      // 文本嵌套在 label>span>span 三层（默认 depth 2 扫不到），加深让规则准确扫描嵌套文本。
      'jsx-a11y/label-has-associated-control': ['error', { depth: 4 }],
    },
  },
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // TypeScript checks unused symbols; legacy API responses are intentionally untyped.
      'no-unused-vars': 'off',
      // ignoreRestSiblings: 放行「解构剔除敏感字段」惯用法（如 settingsStore 剔除 apiKey）。
      // argsIgnorePattern: `_` 前缀是既有的「占位参数」惯例（dev 夹具、域方法里
      // 平台用不到的 owner/repo 形参），显式承认而不是逼出 void 消费。
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }],
      // Error.cause 需要 ES2022，target 已升级，恢复 recommended 默认检查。
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
