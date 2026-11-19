// SELECT-only SQL guard for warehouse-CLI invocations.
//
// Default-deny posture: this module returns true ONLY for invocations it can
// fully parse and confirm consist exclusively of SELECT/WITH statements. Any
// ambiguity (unknown CLI, unparseable quoting, comment-smuggled DDL, etc.)
// returns false and the call falls through to the normal permission prompt.
'use strict';

// ─── Step 1: extract the SQL argument from a CLI invocation ──────────────────

// Recognized CLI invocation patterns. Each returns the SQL string or null if the
// invocation isn't recognized / can't be parsed cleanly. The whole command line is
// tokenised and every token must be accounted for: the SQL flag exactly once, other
// flags only from a small per-CLI allowlist (no -f/--file, -o/--output, --init-command,
// -cmd, ...), and a bounded number of positionals. Anything else -> null.
//
// spec: {sql: [flags], bool: [flags without a value], value: [flags taking a value],
//        positionals: max count, sqlPositional: SQL is the single positional (bq)}
const CLI_SPECS = {
  psql: {
    sql: ['-c', '--command'],
    bool: ['-A', '--no-align', '-t', '--tuples-only', '-X', '--no-psqlrc', '-q', '--quiet', '--csv', '-H', '--html',
      '-x', '--expanded', '-w', '--no-password', '-W', '--password', '-e', '--echo-queries', '-a', '--echo-all', '-b', '--echo-errors'],
    value: ['-h', '--host', '-p', '--port', '-U', '--username', '-d', '--dbname', '-F', '--field-separator', '-R', '--record-separator'],
    positionals: 2,
  },
  snowsql: {
    sql: ['-q', '--query'],
    bool: ['--noup', '-M', '--mfa-passcode-in-password'],
    value: ['-a', '--accountname', '-u', '--username', '-d', '--dbname', '-s', '--schemaname', '-w', '--warehouse', '-r', '--rolename',
      '-c', '--connection', '-h', '--host', '-p', '--port', '--region', '--authenticator'],
    positionals: 0,
  },
  'clickhouse-client': {
    sql: ['-q', '--query'],
    bool: ['-s', '--secure', '-m', '--multiline', '-n', '--multiquery', '-t', '--time', '--stacktrace', '-V', '--vertical'],
    value: ['-h', '--host', '--port', '-u', '--user', '--password', '-d', '--database', '-f', '--format'],
    positionals: 0,
  },
  duckdb: {
    sql: ['-c'],
    bool: ['-readonly', '-json', '-csv', '-line', '-list', '-box', '-markdown', '-table', '-header', '-noheader', '-column',
      '-html', '-ascii', '-batch', '-bail', '-echo', '-no-stdin', '-unsigned'],
    value: ['-separator', '-nullvalue'],
    positionals: 1,
  },
  mysql: {
    sql: ['-e', '--execute'],
    bool: ['-B', '--batch', '-N', '--skip-column-names', '-s', '--silent', '-t', '--table', '-r', '--raw', '-E', '--vertical', '-X', '--xml',
      '-H', '--html', '-n', '--unbuffered', '--no-auto-rehash', '-A', '--safe-updates', '--no-defaults'],
    value: ['-h', '--host', '-P', '--port', '-u', '--user', '-D', '--database', '--protocol', '-S', '--socket', '--default-character-set'],
    positionals: 1,
  },
  'bq query': {
    sql: [],
    bool: ['--nouse_legacy_sql', '--use_legacy_sql', '--dry_run', '--nouse_cache', '--use_cache', '--batch', '-q', '--quiet', '--headless', '--nosync', '--sync'],
    value: ['--use_legacy_sql', '--format', '--max_rows', '-n', '--project_id', '--location', '--maximum_bytes_billed', '--parameter', '--job_id', '--label'],
    positionals: 1,
    sqlPositional: true,
  },
};

function extractSql(command) {
  if (typeof command !== 'string') return null;
  const tokens = tokenize(command.trim());
  if (!tokens || !tokens.length) return null;
  let spec; let rest;
  if (tokens[0] === 'bq' && tokens[1] === 'query') { spec = CLI_SPECS['bq query']; rest = tokens.slice(2); }
  else if (Object.prototype.hasOwnProperty.call(CLI_SPECS, tokens[0]) && tokens[0] !== 'bq query') { spec = CLI_SPECS[tokens[0]]; rest = tokens.slice(1); }
  else return null;

  let sql = null; let sqlCount = 0; const positionals = [];
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (!tok.startsWith('-') || tok === '-') { positionals.push(tok); continue; }
    const eq = tok.indexOf('=');
    const name = tok.startsWith('--') && eq > 0 ? tok.slice(0, eq) : tok;
    const inline = name !== tok ? tok.slice(eq + 1) : null;
    if (spec.sql.includes(name)) {
      const v = inline !== null ? inline : rest[++i];
      if (v === undefined) return null;
      sql = v; sqlCount++;
      continue;
    }
    if (inline === null && spec.bool.includes(name)) continue;
    if (spec.value.includes(name)) {
      if (inline !== null) continue;
      const v = rest[++i];
      if (v === undefined || v.startsWith('-')) return null;
      continue;
    }
    return null; // unknown / dangerous flag (-f, --file, -o, --output, --init-command, -cmd, --destination_table, ...)
  }
  if (spec.sqlPositional) {
    if (sqlCount || positionals.length !== 1) return null;
    return positionals[0];
  }
  if (sqlCount !== 1 || positionals.length > spec.positionals) return null;
  return sql;
}

// Shell-ish tokenizer for a single simple command. Returns null on anything that a
// shell would expand or that we can't tokenise with certainty: unquoted metacharacters
// ($ ` \ < > ( ) ; & | * ? [ ] { } #), `$`/backtick/backslash inside double quotes,
// and unterminated quotes.
function tokenize(cmd) {
  const out = [];
  let cur = ''; let has = false;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === "'") {
      const j = cmd.indexOf("'", i + 1);
      if (j < 0) return null;
      cur += cmd.slice(i + 1, j); has = true; i = j; continue;
    }
    if (c === '"') {
      const j = cmd.indexOf('"', i + 1);
      if (j < 0) return null;
      const span = cmd.slice(i + 1, j);
      if (/[$`\\]/.test(span)) return null;
      cur += span; has = true; i = j; continue;
    }
    if (/\s/.test(c)) { if (has) out.push(cur); cur = ''; has = false; continue; }
    if (/[$`\\<>()&;|*?[\]{}#!]/.test(c)) return null;
    cur += c; has = true;
  }
  if (has) out.push(cur);
  return out;
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

// Functions callable from a SELECT that have side effects (remote/arbitrary SQL execution,
// server file I/O, backend signalling, config/sequence mutation). Matched as a call
// `name(` on the statement with single-quoted literals removed and double quotes dropped
// (so a quoted identifier "dblink_exec"(...) still matches).
const SIDE_EFFECT_FUNCTIONS = /\b(?:dblink\w*|lo_(?:export|import|unlink|from_bytea|put|create|creat|truncate)|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|pg_file_\w+|pg_switch_wal|pg_promote|pg_create_restore_point|pg_(?:create|drop)_\w*replication_slot|pg_replication_origin_\w+|set_config|setval|nextval|query_to_xml\w*|cursor_to_xml\w*|pg_advisory\w*|pg_notify)\s*\(/i;

function hasSideEffectCall(stmt) {
  let out = ''; let inSingle = false;
  for (let i = 0; i < stmt.length; i++) {
    const c = stmt[i];
    if (c === "'") {
      if (inSingle && stmt[i + 1] === "'") { i++; continue; }
      inSingle = !inSingle; continue;
    }
    if (inSingle || c === '"') continue;
    out += c;
  }
  return SIDE_EFFECT_FUNCTIONS.test(out);
}

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
  if (hasSideEffectCall(stmt)) return false;
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
  // Backslash escapes (MySQL strings, Postgres E'...') and dollar quoting ($$...$$) change
  // where string literals end, which would let the quote-aware checks below be fooled.
  if (/\\/.test(sql) || /\$\w*\$/.test(sql)) return false;
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
