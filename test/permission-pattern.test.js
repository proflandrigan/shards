import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { permissionPattern } = require('../src/ui/permission-pattern.js');

describe('permissionPattern', () => {
  describe('single-token commands', () => {
    it('emits cmd:* glob for a bare invocation', () => {
      expect(permissionPattern('python3 foo.py')).toBe('Bash(python3:*)');
    });

    it('covers a command with no args at all', () => {
      expect(permissionPattern('pwd')).toBe('Bash(pwd:*)');
    });

    it('preserves absolute paths in the prefix', () => {
      expect(permissionPattern('/usr/local/bin/python foo.py')).toBe('Bash(/usr/local/bin/python:*)');
    });

    it('preserves tilde-expanded paths', () => {
      expect(permissionPattern('~/.pyenv/versions/seti-app/bin/python run.py'))
        .toBe('Bash(~/.pyenv/versions/seti-app/bin/python:*)');
    });

    it('preserves relative script invocations', () => {
      expect(permissionPattern('./bin/my-script.sh foo bar')).toBe('Bash(./bin/my-script.sh:*)');
    });
  });

  describe('launcher + subcommand commands', () => {
    it('includes the subcommand for git', () => {
      expect(permissionPattern('git status --short')).toBe('Bash(git status:*)');
    });

    it('includes the subcommand for dbt', () => {
      expect(permissionPattern('dbt run --select model_a')).toBe('Bash(dbt run:*)');
    });

    it('includes the subcommand for npm', () => {
      expect(permissionPattern('npm install lodash')).toBe('Bash(npm install:*)');
    });

    it('includes the subcommand for docker', () => {
      expect(permissionPattern('docker ps -a')).toBe('Bash(docker ps:*)');
    });

    it('includes the subcommand for pip', () => {
      expect(permissionPattern('pip install requests')).toBe('Bash(pip install:*)');
    });

    it('treats an absolute-path launcher as a launcher if the basename matches', () => {
      expect(permissionPattern('/usr/local/bin/git log --oneline'))
        .toBe('Bash(/usr/local/bin/git log:*)');
    });

    it('falls back to single-token when the launcher has no subcommand', () => {
      expect(permissionPattern('git')).toBe('Bash(git:*)');
    });
  });

  describe('edge cases', () => {
    it('falls back to literal for empty string (matching pre-fix behavior)', () => {
      expect(permissionPattern('')).toBe('Bash()');
    });

    it('falls back to literal for whitespace-only input', () => {
      expect(permissionPattern('   ')).toBe('Bash(   )');
    });

    it('falls back to literal for non-string input', () => {
      expect(permissionPattern(null)).toBe('Bash(null)');
      expect(permissionPattern(undefined)).toBe('Bash(undefined)');
    });

    it('handles multiple whitespace between tokens', () => {
      expect(permissionPattern('git   status')).toBe('Bash(git status:*)');
    });

    it('handles leading/trailing whitespace', () => {
      expect(permissionPattern('  python3 foo.py  ')).toBe('Bash(python3:*)');
    });

    it('does not treat a non-launcher command as one', () => {
      expect(permissionPattern('ls -la /tmp')).toBe('Bash(ls:*)');
    });

    it('does not treat python as a launcher (users expect python:* to cover scripts)', () => {
      expect(permissionPattern('python3 -c "print(1)"')).toBe('Bash(python3:*)');
    });
  });

  describe('regression: Always Allow glob bug', () => {
    it('clicking Always Allow on one python script should cover others', () => {
      const pattern1 = permissionPattern('python3 foo.py');
      const pattern2 = permissionPattern('python3 bar.py');
      expect(pattern1).toBe(pattern2);
    });

    it('clicking Always Allow on git status should not authorize git push', () => {
      const statusPattern = permissionPattern('git status');
      const pushPattern = permissionPattern('git push origin main');
      expect(statusPattern).not.toBe(pushPattern);
      expect(statusPattern).toBe('Bash(git status:*)');
      expect(pushPattern).toBe('Bash(git push:*)');
    });
  });
});
