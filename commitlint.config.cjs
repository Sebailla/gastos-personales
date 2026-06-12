// commitlint configuration
// Extends the conventional config so that commit messages follow
// the Conventional Commits format: <type>(<scope>): <description>.

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'chore',
        'docs',
        'refactor',
        'test',
        'build',
        'ci',
        'perf',
        'revert',
        'style',
      ],
    ],
  },
};
