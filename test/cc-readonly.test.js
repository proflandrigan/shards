import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  isReadOnlyTool,
  isCcReadOnlyBash,
  isCcReadOnlyAutoApprovable,
} = require('../src/ui/cc-readonly.js');

describe('isCcReadOnlyBash', () => {
  describe('bare read-only commands auto-approve', () => {
    it('auto-approves ls', () => {
      expect(isCcReadOnlyBash('ls')).toBe(true);
    });

    it('auto-approves ls with flags and args', () => {
      expect(isCcReadOnlyBash('ls -la /tmp')).toBe(true);
    });

    it('auto-approves cat', () => {
      expect(isCcReadOnlyBash('cat package.json')).toBe(true);
    });

    it('auto-approves grep', () => {
      expect(isCcReadOnlyBash('grep foo file.txt')).toBe(true);
    });

    it('auto-approves find', () => {
      expect(isCcReadOnlyBash('find . -name "*.py"')).toBe(true);
    });

    it('auto-approves pwd', () => {
      expect(isCcReadOnlyBash('pwd')).toBe(true);
    });

    it('auto-approves wc', () => {
      expect(isCcReadOnlyBash('wc -l file.txt')).toBe(true);
    });

    it('auto-approves which', () => {
      expect(isCcReadOnlyBash('which python3')).toBe(true);
    });

    it('auto-approves diff', () => {
      expect(isCcReadOnlyBash('diff a.txt b.txt')).toBe(true);
    });

    it('auto-approves stat', () => {
      expect(isCcReadOnlyBash('stat file.txt')).toBe(true);
    });

    it('auto-approves du', () => {
      expect(isCcReadOnlyBash('du -sh .')).toBe(true);
    });

    it('auto-approves cd', () => {
      expect(isCcReadOnlyBash('cd src')).toBe(true);
    });
  });

  describe('read-only git forms auto-approve', () => {
    it('auto-approves git status', () => {
      expect(isCcReadOnlyBash('git status --short')).toBe(true);
    });

    it('auto-approves git log', () => {
      expect(isCcReadOnlyBash('git log --oneline')).toBe(true);
    });

    it('auto-approves git diff', () => {
      expect(isCcReadOnlyBash('git diff HEAD')).toBe(true);
    });

    it('auto-approves git stash list', () => {
      expect(isCcReadOnlyBash('git stash list')).toBe(true);
    });
  });

  describe('non-read-only commands do NOT auto-approve', () => {
    it('does not auto-approve git push', () => {
      expect(isCcReadOnlyBash('git push origin main')).toBe(false);
    });

    it('does not auto-approve python3', () => {
      expect(isCcReadOnlyBash('python3 foo.py')).toBe(false);
    });

    it('does not auto-approve npm install', () => {
      expect(isCcReadOnlyBash('npm install lodash')).toBe(false);
    });

    it('does not auto-approve dbt run', () => {
      expect(isCcReadOnlyBash('dbt run')).toBe(false);
    });
  });

  describe('destructive commands are vetoed', () => {
    it('vetoes rm', () => {
      expect(isCcReadOnlyBash('rm -rf node_modules')).toBe(false);
    });

    it('vetoes mv', () => {
      expect(isCcReadOnlyBash('mv a b')).toBe(false);
    });

    it('vetoes cp with flags', () => {
      expect(isCcReadOnlyBash('cp -r a b')).toBe(false);
    });

    it('vetoes sudo', () => {
      expect(isCcReadOnlyBash('sudo ls')).toBe(false);
    });

    it('vetoes curl', () => {
      expect(isCcReadOnlyBash('curl https://example.com')).toBe(false);
    });

    it('vetoes shell redirects', () => {
      expect(isCcReadOnlyBash('cat file > out.txt')).toBe(false);
    });
  });

  describe('compound commands are vetoed', () => {
    it('vetoes && chains', () => {
      expect(isCcReadOnlyBash('ls && rm -rf x')).toBe(false);
    });

    it('vetoes ; separators', () => {
      expect(isCcReadOnlyBash('cat a; cat b')).toBe(false);
    });

    it('vetoes pipes', () => {
      expect(isCcReadOnlyBash('pwd | grep home')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for empty string', () => {
      expect(isCcReadOnlyBash('')).toBe(false);
    });

    it('returns false for whitespace-only input', () => {
      expect(isCcReadOnlyBash('   ')).toBe(false);
    });

    it('returns false for null', () => {
      expect(isCcReadOnlyBash(null)).toBe(false);
    });
  });
});

describe('isReadOnlyTool', () => {
  it('returns true for Read', () => {
    expect(isReadOnlyTool('Read')).toBe(true);
  });

  it('returns true for Glob', () => {
    expect(isReadOnlyTool('Glob')).toBe(true);
  });

  it('returns true for Grep', () => {
    expect(isReadOnlyTool('Grep')).toBe(true);
  });

  it('returns true for WebSearch', () => {
    expect(isReadOnlyTool('WebSearch')).toBe(true);
  });

  it('returns false for Bash', () => {
    expect(isReadOnlyTool('Bash')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isReadOnlyTool(undefined)).toBe(false);
  });
});

describe('isCcReadOnlyAutoApprovable', () => {
  it('auto-approves read-only tools', () => {
    expect(isCcReadOnlyAutoApprovable('Read', {})).toBe(true);
  });

  it('auto-approves read-only Bash commands', () => {
    expect(isCcReadOnlyAutoApprovable('Bash', { command: 'pwd' })).toBe(true);
  });

  it('auto-approves read-only Bash commands with flags', () => {
    expect(isCcReadOnlyAutoApprovable('Bash', { command: 'ls -la' })).toBe(true);
  });

  it('does not auto-approve non-read-only Bash commands', () => {
    expect(isCcReadOnlyAutoApprovable('Bash', { command: 'python3 foo.py' })).toBe(false);
  });

  it('returns false when Bash input has no command', () => {
    expect(isCcReadOnlyAutoApprovable('Bash', {})).toBe(false);
  });

  it('returns false for non-read-only non-Bash tools', () => {
    expect(isCcReadOnlyAutoApprovable('Edit', { file_path: 'x' })).toBe(false);
  });

  it('returns false for null tool name', () => {
    expect(isCcReadOnlyAutoApprovable(null, {})).toBe(false);
  });
});
