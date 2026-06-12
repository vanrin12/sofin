import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/node_modules', '**/webpack.config.js'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      // Encodes the DDD context rules from .claude/rules/api.md:
      //   - apps may only depend on libraries (type:lib), never on other apps
      //   - each context scope may only reach the shared kernel (scope:shared),
      //     never another context — "contexts must not import each other".
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:lib'] },
            { sourceTag: 'type:lib', onlyDependOnLibsWithTags: ['type:lib'] },
            { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
            { sourceTag: 'scope:gateway', onlyDependOnLibsWithTags: ['scope:shared'] },
            { sourceTag: 'scope:auth-sso', onlyDependOnLibsWithTags: ['scope:shared'] },
            { sourceTag: 'scope:lms', onlyDependOnLibsWithTags: ['scope:shared'] },
            { sourceTag: 'scope:crm', onlyDependOnLibsWithTags: ['scope:shared'] },
            { sourceTag: 'scope:notification', onlyDependOnLibsWithTags: ['scope:shared'] },
          ],
        },
      ],
    },
  },
];
