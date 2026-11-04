// Lint maintained JavaScript only. The retained template and build outputs are
// generated or third-party code; TypeScript is not parsed by this config.
const globals = names => Object.fromEntries(names.map(name => [name, 'readonly']));
const web = globals([
  'AbortController', 'Blob', 'BroadcastChannel', 'CSS', 'CustomEvent', 'DOMParser',
  'Element', 'Event', 'File', 'FileReader', 'FormData', 'Headers', 'HTMLElement',
  'HTMLImageElement', 'Image', 'IntersectionObserver', 'MutationObserver', 'Node',
  'PopStateEvent', 'ResizeObserver', 'Response', 'TextDecoder', 'TextEncoder',
  'URL', 'URLSearchParams', 'WebSocket', 'addEventListener', 'alert',
  'cancelAnimationFrame', 'clearInterval', 'clearTimeout', 'confirm', 'crypto',
  'document', 'fetch', 'getComputedStyle', 'history', 'innerHeight', 'innerWidth',
  'localStorage', 'location', 'matchMedia', 'navigator', 'performance', 'prompt',
  'queueMicrotask', 'requestAnimationFrame', 'scrollTo', 'scrollX', 'scrollY',
  'sessionStorage', 'setInterval', 'setTimeout', 'structuredClone', 'window'
]);
const node = globals([
  'AbortController', 'Blob', 'Buffer', 'Event', 'FormData', 'Headers', 'Request',
  'Response', 'TextDecoder', 'TextEncoder', 'URL', 'URLSearchParams', 'atob', 'btoa',
  'clearImmediate', 'clearInterval', 'clearTimeout', 'console', 'crypto', 'fetch',
  'performance', 'process', 'queueMicrotask', 'setImmediate', 'setInterval',
  'setTimeout', 'structuredClone'
]);

export default [
  { ignores: ['.agents/**', '.codex/**', '.next/**', '.sites-build/**', '.sites-runtime/**',
    '.vinext/**', '.wrangler/**', 'coverage/**', 'dist/**', 'local-dist/**', 'out/**',
    'outputs/**', 'private-data/**', 'template-source/**', 'vendor/**', 'work/**'] },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-const-assign': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-imports': 'error',
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'valid-typeof': 'error'
    }
  },
  { files: ['**/*.mjs'], languageOptions: { globals: node } },
  { files: ['public/custom/**/*.js', 'admin/**/*.js'], languageOptions: { globals: { ...web, console: 'readonly' } } }
];
