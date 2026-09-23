module.exports = {
  forbidden: [
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'domain-is-independent',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '^src/(application|infrastructure|desktop|renderer)' },
    },
    {
      name: 'application-uses-ports',
      severity: 'error',
      from: { path: '^src/application' },
      to: { path: '^src/(infrastructure|desktop|renderer)' },
    },
    {
      name: 'renderer-cannot-access-host',
      severity: 'error',
      from: { path: '^src/renderer' },
      to: { path: '^src/(application|infrastructure|desktop)' },
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
    { name: 'no-unresolved', severity: 'error', from: {}, to: { couldNotResolve: true } },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
