import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { isAutoApprovable } = require('../tools/gate-hook/auto-allowlist.js');

describe('isAutoApprovable', () => {
  describe('read-only operations still auto-approve', () => {
    it('approves ls', () => {
      expect(isAutoApprovable('Bash', { command: 'ls -la' })).toBe(true);
    });

    it('approves cat', () => {
      expect(isAutoApprovable('Bash', { command: 'cat package.json' })).toBe(true);
    });

    it('approves dbt show', () => {
      expect(isAutoApprovable('Bash', { command: 'dbt show --select my_model' })).toBe(true);
    });

    it('approves git status', () => {
      expect(isAutoApprovable('Bash', { command: 'git status --short' })).toBe(true);
    });

    it('approves psql SELECT', () => {
      expect(isAutoApprovable('Bash', { command: 'psql -c "SELECT count(*) FROM events"' })).toBe(true);
    });

    it('approves read-only tools', () => {
      expect(isAutoApprovable('Grep', { pattern: 'x' })).toBe(true);
    });
  });

  describe('backgrounding / newline compound commands are vetoed', () => {
    it('vetoes a backgrounding & chain', () => {
      expect(isAutoApprovable('Bash', { command: 'cat a.txt & git reset --hard HEAD' })).toBe(false);
    });

    it('vetoes & chaining git clean', () => {
      expect(isAutoApprovable('Bash', { command: 'cat a.txt & git clean -fd' })).toBe(false);
    });

    it('vetoes & chaining git push', () => {
      expect(isAutoApprovable('Bash', { command: 'ls & git push origin main' })).toBe(false);
    });

    it('vetoes a trailing backgrounding &', () => {
      expect(isAutoApprovable('Bash', { command: 'cat f &' })).toBe(false);
    });

    it('vetoes a newline-separated mutating command', () => {
      expect(isAutoApprovable('Bash', { command: 'cat a.txt\nrmdir subdir' })).toBe(false);
    });

    it('vetoes existing && chains', () => {
      expect(isAutoApprovable('Bash', { command: 'dbt show && rm -rf /tmp/foo' })).toBe(false);
    });
  });

  describe('git diff --output forms', () => {
    it('vetoes git diff --output=FILE', () => {
      expect(isAutoApprovable('Bash', { command: 'git diff --output=/tmp/out HEAD' })).toBe(false);
    });

    it('vetoes git diff --output FILE (space form)', () => {
      expect(isAutoApprovable('Bash', { command: 'git diff --output /tmp/out HEAD' })).toBe(false);
    });

    it('allows git diff --output-indicator-new', () => {
      expect(isAutoApprovable('Bash', { command: 'git diff --output-indicator-new=+ HEAD' })).toBe(true);
    });

    it('allows git diff -O orderfile', () => {
      expect(isAutoApprovable('Bash', { command: 'git diff -O /tmp/orderfile HEAD' })).toBe(true);
    });
  });

  describe('destructive commands are still vetoed', () => {
    it('vetoes rm', () => {
      expect(isAutoApprovable('Bash', { command: 'rm -rf node_modules' })).toBe(false);
    });

    it('vetoes find -delete', () => {
      expect(isAutoApprovable('Bash', { command: 'find . -name "*.tmp" -delete' })).toBe(false);
    });

    it('vetoes find -exec', () => {
      expect(isAutoApprovable('Bash', { command: 'find . -exec touch {} +' })).toBe(false);
    });

    it('vetoes find -okdir', () => {
      expect(isAutoApprovable('Bash', { command: 'find . -okdir touch {} +' })).toBe(false);
    });

    it('vetoes find -fprintf and -fprint (file writes)', () => {
      expect(isAutoApprovable('Bash', { command: "find . -fprintf /tmp/out '%p\\n'" })).toBe(false);
      expect(isAutoApprovable('Bash', { command: 'find . -name "*.tmp" -fprint /tmp/out' })).toBe(false);
    });

    it('vetoes find -fprint0 (null-delimited file write)', () => {
      expect(isAutoApprovable('Bash', { command: 'find . -name "*.tmp" -fprint0 /tmp/out' })).toBe(false);
    });

    it('vetoes git branch delete', () => {
      expect(isAutoApprovable('Bash', { command: 'git branch -D feature' })).toBe(false);
    });

    it('vetoes git tag delete', () => {
      expect(isAutoApprovable('Bash', { command: 'git tag -d v1.0' })).toBe(false);
    });
  });

  describe('git branch -v/-vv positional create and git -o attached writes are vetoed', () => {
    it('vetoes git branch -v feature (creates branch)', () => {
      expect(isAutoApprovable('Bash', { command: 'git branch -v feature' })).toBe(false);
    });

    it('vetoes git branch -vv feature', () => {
      expect(isAutoApprovable('Bash', { command: 'git branch -vv feature' })).toBe(false);
    });

    it('still approves a pure git branch -v listing', () => {
      expect(isAutoApprovable('Bash', { command: 'git branch -v' })).toBe(true);
    });

    it('still approves git branch -vv with option args only', () => {
      expect(isAutoApprovable('Bash', { command: 'git branch -vv --merged main' })).toBe(true);
    });

    it('vetoes git diff -oout.txt (attached bare-word value)', () => {
      expect(isAutoApprovable('Bash', { command: 'git diff -oout.txt' })).toBe(false);
    });

    it('vetoes git log -oresult.log', () => {
      expect(isAutoApprovable('Bash', { command: 'git log -oresult.log' })).toBe(false);
    });

    it('vetoes git show -opatch', () => {
      expect(isAutoApprovable('Bash', { command: 'git show -opatch' })).toBe(false);
    });

    it('still allows the uppercase -O orderfile flag', () => {
      expect(isAutoApprovable('Bash', { command: 'git diff -O /tmp/orderfile HEAD' })).toBe(true);
    });
  });
});