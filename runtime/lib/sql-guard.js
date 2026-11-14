// SELECT-only SQL guard for warehouse-CLI invocations.
//
// Default-deny posture: this module returns true ONLY for invocations it can
// fully parse and confirm consist exclusively of SELECT/WITH statements. Any
// ambiguity (unknown CLI, unparseable quoting, comment-smuggled DDL, etc.)
// returns false and the call falls through to the normal permission prompt.
'use strict';

// ─── Step 1: extract the SQL argument from a CLI invocation ──────────────────

// Recognized CLI invocation patterns. Each entry returns the SQL string or
// null if the invocation isn't recognized / can't be parsed cleanly.
function extractSql(command) {
  if (typeof command !== 'string') return null;
  const cmd = command.trim();
  if (!cmd) return null;

  // bq query — the SQL is whatever comes after the flags. Format:
  //   bq query --use_legacy_sql=false 'SELECT ...'
  //   bq query --nouse_legacy_sql --format=json "SELECT ..."
  // We accept it only if the last token is a single quoted string and the
  // command doesn't have --destination_table / write flags.
  if (/^bq\s+query\b/.test(cmd)) {
    if (/--destination_table\b/i.test(cmd)) return null;
    if (/--replace\b/i.test(cmd)) return null;
    if (/--append_table\b/i.test(cmd)) return null;
    return extractTrailingQuoted(cmd);
  }

  // psql -c "SELECT ..."  or  psql --command="SELECT ..."
  if (/^psql\b/.test(cmd)) {
    return extractFlagValue(cmd, ['-c', '--command']);
  }

  // snowsql -q "SELECT ..."  or  snowsql --query "SELECT ..."
  if (/^snowsql\b/.test(cmd)) {
    return extractFlagValue(cmd, ['-q', '--query']);
  }

  // clickhouse-client --query "SELECT ..."  or  -q
  if (/^clickhouse-client\b/.test(cmd)) {
    return extractFlagValue(cmd, ['-q', '--query']);
  }

  // duckdb db.duckdb -c "SELECT ..."
  if (/^duckdb\b/.test(cmd)) {
    return extractFlagValue(cmd, ['-c', '--command']);
  }

  // mysql -e "SELECT ..."
  if (/^mysql\b/.test(cmd)) {
    return extractFlagValue(cmd, ['-e', '--execute']);
  }

  return null;
}

// Extract the value following one of the named flags. Handles both
// --flag=value and --flag value forms, with single or double quoted values.
// Returns null if it can't find a clean match.
function extractFlagValue(command, flags) {
  for (const flag of flags) {
    // --flag="..."
    const eqRe = new RegExp(`${escapeRegex(flag)}=(['"])([\\s\\S]*?)\\1(?:\\s|$)`);
    const eq = command.match(eqRe);
    if (eq) return eq[2];

    // --flag '...'  or  --flag "..."
    const spRe = new RegExp(`${escapeRegex(flag)}\\s+(['"])([\\s\\S]*?)\\1(?:\\s|$)`);
    const sp = command.match(spRe);
    if (sp) return sp[2];
  }
  return null;
}

// Extract the last quoted argument in the command. Used for `bq query '...'`.
function extractTrailingQuoted(command) {
  const m = command.match(/(['"])([\s\S]*?)\1\s*$/);
  return m ? m[2] : null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Step 2: strip SQL comments ──────────────────────────────────────────────
//
// Strips both `-- line comments` and `/* block comments */` so that:
// (a) a comment containing "DROP" doesn't trigger the deny check, and
// (b) a comment can't smuggle a real DDL after a `;` (e.g. `SELECT 1; -- \n DROP TABLE x`)
function stripComments(sql) {
  if (typeof sql !== 'string') return '';
  let out = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;

  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];

    if (!inSingle && !inDouble) {
      if (c === '-' && next === '-') {
        // Line comment — skip to newline
        const nl = sql.indexOf('\n', i);
        if (nl === -1) return out;
        i = nl + 1;
        out += '\n';
        continue;
      }
      if (c === '/' && next === '*') {
        // Block comment — skip to */
        const end = sql.indexOf('*/', i + 2);
        if (end === -1) return out; // unterminated block comment — bail
        i = end + 2;
        continue;
      }
    }

    if (c === "'" && !inDouble) {
      // Handle escaped quote ''
      if (inSingle && next === "'") { out += "''"; i += 2; continue; }
      inSingle = !inSingle;
    } else if (c === '"' && !inSingle) {
      inDouble = !inDouble;
    }

    out += c;
    i++;
  }
  return out;
}

// ─── Step 3: split on ; respecting quotes ────────────────────────────────────

function splitStatements(sql) {
  const out = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" && !inDouble) {
      if (inSingle && sql[i + 1] === "'") { cur += "''"; i++; continue; }
      inSingle = !inSingle;
    } else if (c === '"' && !inSingle) {
      inDouble = !inDouble;
    }
    if (c === ';' && !inSingle && !inDouble) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}

// ─── Step 4: classify a statement ────────────────────────────────────────────

const FORBIDDEN = [
  'INTO', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'DROP', 'ALTER',
  'TRUNCATE', 'GRANT', 'REVOKE', 'COPY', 'CALL', 'EXECUTE', 'EXPORT', 'LOAD',
  'REPLACE', 'RENAME', 'COMMENT', 'ANALYZE', 'VACUUM', 'CLUSTER', 'REFRESH',
];

function isReadOnlyStatement(stmt) {
  if (!stmt) return false;
  const head = stmt.replace(/^\(+/, '').match(/^\s*(\w+)/);
  if (!head) return false;
  const verb = head[1].toUpperCase();
  if (verb !== 'SELECT' && verb !== 'WITH') return false;

  // Check for forbidden keywords as whole words. We strip string literals
  // first so a literal value like 'INSERT INTO logs' doesn't trigger.
  const stripped = stripStringLiterals(stmt);
  for (const kw of FORBIDDEN) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(stripped)) return false;
  }
  return true;
}

function stripStringLiterals(sql) {
  let out = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" && !inDouble) {
      if (inSingle && sql[i + 1] === "'") { i++; continue; }
      inSingle = !inSingle;
      continue;
    }
    if (c === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle || inDouble) continue;
    out += c;
  }
  return out;
}

// ─── Public API ──────────────────────────────────────────────────────────────

// isReadOnlyCliInvocation(command) → true only if:
//   1. We recognize the CLI shape and can extract the SQL cleanly
//   2. Every statement in the SQL starts with SELECT or WITH
//   3. No statement contains any forbidden DDL/DML keyword (after stripping
//      comments and string literals)
function isReadOnlyCliInvocation(command) {
  const sql = extractSql(command);
  if (!sql) return false;
  const stripped = stripComments(sql);
  const statements = splitStatements(stripped);
  if (statements.length === 0) return false;
  return statements.every(isReadOnlyStatement);
}

module.exports = {
  isReadOnlyCliInvocation,
  // exported for tests
  _extractSql: extractSql,
  _stripComments: stripComments,
  _splitStatements: splitStatements,
  _isReadOnlyStatement: isReadOnlyStatement,
};
