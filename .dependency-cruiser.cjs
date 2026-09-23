// Explicit browser packages keep a new host dependency from silently crossing the ports.
const browserPackages = [
  'react',
  'react-dom',
  'react-i18next',
  'react-markdown',
  'i18next',
  'lucide-react',
  'simple-icons',
  'diff',
  '@radix-ui/react-dialog',
  '@radix-ui/react-tooltip',
  '@tiptap/core',
  '@tiptap/pm',
  '@tiptap/react',
  '@tiptap/starter-kit',
  '@tiptap/suggestion',
  '@hyperframes/player',
  '@fontsource/geist',
  '@fontsource/geist-mono',
  '@fontsource-variable/noto-sans-jp',
  '@fontsource-variable/noto-sans-kr',
];
const browserDependencies = `^node_modules/(?:${browserPackages.join('|')})(?:/|$)`;

module.exports = {
  forbidden: [
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'domain-is-independent',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { pathNot: '^src/domain/' },
    },
    {
      name: 'application-uses-ports',
      severity: 'error',
      from: { path: '^src/application' },
      // Path joining is deterministic; all I/O still belongs to a port.
      to: { pathNot: ['^src/(application|domain)/', '^(node:)?path$'] },
    },
    {
      name: 'renderer-cannot-access-host',
      severity: 'error',
      from: { path: '^src/renderer' },
      to: { pathNot: ['^src/(renderer|domain)/', browserDependencies] },
    },
    {
      name: 'renderer-no-node',
      severity: 'error',
      from: { path: '^src/renderer' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'infrastructure-no-ui',
      severity: 'error',
      from: { path: '^src/infrastructure' },
      to: { path: '^src/(renderer|desktop)' },
    },
    {
      name: 'desktop-independent-of-landing',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^landing/' },
    },
    {
      name: 'landing-only-shares-pure-locales',
      severity: 'error',
      from: { path: '^landing/src/' },
      to: {
        pathNot: ['^landing/', '^src/domain/locales\\.ts$', browserDependencies],
      },
    },
    {
      name: 'landing-no-node',
      severity: 'error',
      from: { path: '^landing/src/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'landing-no-desktop-runtime',
      severity: 'error',
      from: { path: '^landing/src/' },
      to: {
        path: '(^|node_modules/)(electron|electron-vite|hyperframes|exiftool-vendored|@huggingface/transformers)(/|$)',
      },
    },
    { name: 'no-unresolved', severity: 'error', from: {}, to: { couldNotResolve: true } },
  ],
  options: {
    // Keep linked package identities stable in the isolated staged checkout.
    preserveSymlinks: true,
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
