// Vitest config. Keeps git worktrees (.claude/worktrees) out of the run, and gives the slower tests
// more time: release-build tests copy the bundled runtime and its node_modules.
const { defineConfig, configDefaults } = require('vitest/config');

module.exports = defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '.claude/**', 'adapters/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
