// React 19 测试环境声明 + react-test-renderer 弃用告警静音。
// rtr 在 React 19 已弃用，但仍是当前 UI 测试载体的最低成本方案（保持零 DOM 依赖
// 的 node --test 架构）；act() 需要显式声明 act 环境才能免告警。
// 若未来迁移 @testing-library/react 或浏览器化验证，删除本文件与各处 import 即可。
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const originalError = console.error.bind(console);
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('react-test-renderer is deprecated')) return;
  originalError(...args);
};
