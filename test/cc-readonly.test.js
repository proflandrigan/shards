import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  isReadOnlyTool,
  isCcReadOnlyBash,
  isCcReadOnlyAutoApprovable,
  maskQuotedRegions,
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

describe('find is only read-only when it cannot delete or execute', () => {
  it('vetoes find -delete', () => {
    expect(isCcReadOnlyBash('find . -delete')).toBe(false);
  });

  it('vetoes find with -name and -delete', () => {
    expect(isCcReadOnlyBash('find . -name "*.tmp" -delete')).toBe(false);
  });

  it('vetoes find -exec', () => {
    expect(isCcReadOnlyBash('find . -name "a" -exec rm {} +')).toBe(false);
  });

  it('vetoes find -exec even without rm in the command', () => {
    expect(isCcReadOnlyBash('find . -name "a" -exec touch {} +')).toBe(false);
  });

  it('vetoes find -execdir', () => {
    expect(isCcReadOnlyBash('find . -execdir echo {} +')).toBe(false);
  });

  it('vetoes find -ok', () => {
    expect(isCcReadOnlyBash('find . -ok rm {} \\;')).toBe(false);
  });

  it('vetoes find -okdir', () => {
    expect(isCcReadOnlyBash('find . -okdir touch {} +')).toBe(false);
  });

  it('vetoes find -okdir even without rm in the command', () => {
    expect(isCcReadOnlyBash('find . -name "a" -okdir chmod 777 file {} +')).toBe(false);
  });

  it('vetoes find -fprintf (writes a file)', () => {
    expect(isCcReadOnlyBash("find . -fprintf /tmp/out '%p\\n'")).toBe(false);
  });

  it('vetoes find -fprint (writes a file)', () => {
    expect(isCcReadOnlyBash('find . -name "*.tmp" -fprint /tmp/out')).toBe(false);
  });

  it('vetoes find -fls (writes a file)', () => {
    expect(isCcReadOnlyBash('find . -fls /tmp/out')).toBe(false);
  });

  it('still auto-approves find -printf and -ls (stdout-only forms)', () => {
    expect(isCcReadOnlyBash('find . -printf "%p\\n"')).toBe(true);
    expect(isCcReadOnlyBash('find . -ls')).toBe(true);
  });

  it('still auto-approves quoted name lookups that mention the vetoed actions', () => {
    expect(isCcReadOnlyBash("find . -name '*-okdir*'")).toBe(true);
    expect(isCcReadOnlyBash("find . -name '*-fprintf*'")).toBe(true);
  });

  it('still auto-approves plain find reads', () => {
    expect(isCcReadOnlyBash('find . -name "*.py"')).toBe(true);
  });

  it('still auto-approves find -print', () => {
    expect(isCcReadOnlyBash('find . -name "*.py" -print')).toBe(true);
  });
});

describe('git write forms are vetoed', () => {
  it('vetoes git diff --output=', () => {
    expect(isCcReadOnlyBash('git diff --output=/tmp/out HEAD')).toBe(false);
  });

  it('vetoes git diff -o <file>', () => {
    expect(isCcReadOnlyBash('git diff -o /tmp/out HEAD')).toBe(false);
  });

  it('vetoes git diff -o<file>', () => {
    expect(isCcReadOnlyBash('git diff -o/tmp/out HEAD')).toBe(false);
  });

  it('vetoes git show --output=', () => {
    expect(isCcReadOnlyBash('git show --output=/tmp/out HEAD')).toBe(false);
  });

  it('vetoes bare git branch create', () => {
    expect(isCcReadOnlyBash('git branch feature')).toBe(false);
  });

  it('vetoes git branch -D', () => {
    expect(isCcReadOnlyBash('git branch -D feature')).toBe(false);
  });

  it('vetoes git branch -m', () => {
    expect(isCcReadOnlyBash('git branch -m newname')).toBe(false);
  });

  it('vetoes git tag -d', () => {
    expect(isCcReadOnlyBash('git tag -d v1.0')).toBe(false);
  });

  it('vetoes bare git tag create', () => {
    expect(isCcReadOnlyBash('git tag v1.0')).toBe(false);
  });

  it('vetoes git remote add', () => {
    expect(isCcReadOnlyBash('git remote add origin https://example.com/repo.git')).toBe(false);
  });

  it('vetoes git remote remove', () => {
    expect(isCcReadOnlyBash('git remote remove origin')).toBe(false);
  });

  it('vetoes git remote set-url', () => {
    expect(isCcReadOnlyBash('git remote set-url origin https://example.com/repo.git')).toBe(false);
  });

  it('still auto-approves git branch --list', () => {
    expect(isCcReadOnlyBash('git branch --list')).toBe(true);
  });

  it('still auto-approves git branch -a', () => {
    expect(isCcReadOnlyBash('git branch -a')).toBe(true);
  });

  it('still auto-approves git tag --list', () => {
    expect(isCcReadOnlyBash('git tag --list')).toBe(true);
  });

  it('still auto-approves git remote -v', () => {
    expect(isCcReadOnlyBash('git remote -v')).toBe(true);
  });

  it('still auto-approves plain read-only git forms', () => {
    expect(isCcReadOnlyBash('git status --short')).toBe(true);
    expect(isCcReadOnlyBash('git log --oneline')).toBe(true);
    expect(isCcReadOnlyBash('git diff --stat HEAD')).toBe(true);
    expect(isCcReadOnlyBash('git show HEAD:file.txt')).toBe(true);
    expect(isCcReadOnlyBash('git rev-parse HEAD')).toBe(true);
    expect(isCcReadOnlyBash('git stash list')).toBe(true);
  });
});

describe('quoted literal text does not trigger vetoes', () => {
  it('grep of the literal word rm', () => {
    expect(isCcReadOnlyBash("grep -rn 'rm' .")).toBe(true);
  });

  it('grep of a literal redirect token', () => {
    expect(isCcReadOnlyBash("grep '>' file.txt")).toBe(true);
  });

  it('find with a quoted name containing rm', () => {
    expect(isCcReadOnlyBash("find . -name 'rm*'")).toBe(true);
  });

  it('echo of a quoted pipe', () => {
    expect(isCcReadOnlyBash("echo 'a|b'")).toBe(true);
  });

  it('echo of a double-quoted pipe', () => {
    expect(isCcReadOnlyBash('echo "a|b"')).toBe(true);
  });

  it('echo of a quoted semicolon', () => {
    expect(isCcReadOnlyBash("echo 'a;b'")).toBe(true);
  });

  it('echo of a quoted redirect', () => {
    expect(isCcReadOnlyBash('echo "a > b"')).toBe(true);
  });
});

describe('quoted text that can still execute is vetoed', () => {
  it('vetoes double-quoted command substitution', () => {
    expect(isCcReadOnlyBash('echo "$(rm -rf /)"')).toBe(false);
  });

  it('vetoes double-quoted backticks', () => {
    expect(isCcReadOnlyBash('echo "`rm`"')).toBe(false);
  });

  it('vetoes double-quoted expansion feeding a redirect', () => {
    expect(isCcReadOnlyBash('cat "$f" > /etc/passwd')).toBe(false);
  });

  it('vetoes unquoted command substitution', () => {
    expect(isCcReadOnlyBash('echo $(pwd)')).toBe(false);
  });
});

describe('maskQuotedRegions', () => {
  it('masks single-quoted spans', () => {
    expect(maskQuotedRegions("grep 'rm' file")).toBe('grep      file');
  });

  it('masks double-quoted spans without expansion tokens', () => {
    expect(maskQuotedRegions('echo "a|b"')).toBe('echo      ');
  });

  it('leaves double-quoted spans with $ unmasked', () => {
    expect(maskQuotedRegions('echo "$HOME"')).toBe('echo "$HOME"');
  });

  it('handles an unclosed single quote by masking through end', () => {
    expect(maskQuotedRegions("grep 'rm")).toBe('grep    ');
  });
});

describe('compound commands with backgrounding or newline are vetoed', () => {
  it('vetoes a backgrounding & chain after a read-only prefix', () => {
    expect(isCcReadOnlyBash('cat a.txt & git reset --hard HEAD')).toBe(false);
  });

  it('vetoes & chaining a destructive git command', () => {
    expect(isCcReadOnlyBash('cat a.txt & git clean -fd')).toBe(false);
  });

  it('vetoes & chaining git push', () => {
    expect(isCcReadOnlyBash('ls & git push origin main')).toBe(false);
  });

  it('vetoes & chaining a file copy', () => {
    expect(isCcReadOnlyBash('cat /etc/passwd & cp /etc/passwd /tmp/x')).toBe(false);
  });

  it('vetoes a trailing backgrounding &', () => {
    expect(isCcReadOnlyBash('cat f &')).toBe(false);
  });

  it('vetoes a newline-separated command after a read-only prefix', () => {
    expect(isCcReadOnlyBash('cat a.txt\nrmdir subdir')).toBe(false);
  });

  it('vetoes a newline chaining a mutating git command', () => {
    expect(isCcReadOnlyBash('cat a.txt\ngit push origin main')).toBe(false);
  });

  it('vetoes & chaining to a mutating wc/touch', () => {
    expect(isCcReadOnlyBash('wc -l f & touch g')).toBe(false);
  });
});

describe('git diff --output-indicator flags stay read-only', () => {
  it('allows git diff --output-indicator-new', () => {
    expect(isCcReadOnlyBash('git diff --output-indicator-new=+ HEAD')).toBe(true);
  });

  it('allows git diff --output-indicator-context', () => {
    expect(isCcReadOnlyBash('git diff --output-indicator-context=x HEAD')).toBe(true);
  });

  it('still vetoes git diff --output=FILE', () => {
    expect(isCcReadOnlyBash('git diff --output=/tmp/out HEAD')).toBe(false);
  });

  it('still vetoes git diff --output FILE (space form)', () => {
    expect(isCcReadOnlyBash('git diff --output /tmp/out HEAD')).toBe(false);
  });
});
