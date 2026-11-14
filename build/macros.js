'use strict';
// Macro scanner/parser. See build/MACROS.md section 1.
const NAME_RE = /^([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*)(?=\s|$)/;

// Split an args string into { positional: [], named: {} }. Throws Error on malformed input.
function parseArgs(str) {
  const positional = [];
  const named = {};
  let i = 0;
  const n = str.length;
  while (i < n) {
    while (i < n && /\s/.test(str[i])) i++;
    if (i >= n) break;
    let key = null;
    let start = i;
    while (i < n && !/[\s="]/.test(str[i])) i++;
    if (str[i] === '=') {
      key = str.slice(start, i);
      if (!key) throw new Error('malformed args: empty key');
      i++;
    } else {
      i = start;
    }
    let value;
    if (str[i] === '"') {
      i++;
      value = '';
      let closed = false;
      while (i < n) {
        if (str[i] === '\\' && str[i + 1] === '"') { value += '"'; i += 2; continue; }
        if (str[i] === '"') { closed = true; i++; break; }
        value += str[i++];
      }
      if (!closed) throw new Error('malformed args: unterminated quote');
    } else {
      start = i;
      while (i < n && !/\s/.test(str[i])) {
        if (str[i] === '"') throw new Error('malformed args: stray quote');
        i++;
      }
      value = str.slice(start, i);
    }
    if (key === null) {
      if (value === '') throw new Error('malformed args');
      positional.push(value);
    } else {
      if (Object.prototype.hasOwnProperty.call(named, key)) throw new Error(`malformed args: duplicate key '${key}'`);
      if (value === '') throw new Error(`malformed args: empty value for '${key}'`);
      named[key] = value;
    }
  }
  return { positional, named };
}

// Scan text; call onMacro({name, args(parsed)|null, argError, raw, line}) for each macro candidate.
// Returns the expanded text. onMacro returns a string replacement.
function expandText(text, onMacro) {
  let out = '';
  let i = 0;
  let line = 1;
  const n = text.length;
  while (i < n) {
    const j = text.indexOf('{{', i);
    if (j === -1) { out += text.slice(i); break; }
    const seg = text.slice(i, j);
    out += seg;
    for (const ch of seg) if (ch === '\n') line++;
    if (j > 0 && text[j - 1] === '\\') {
      // escape: drop the backslash, keep literal {{
      out = out.slice(0, -1) + '{{';
      i = j + 2;
      continue;
    }
    const eol = text.indexOf('\n', j);
    const lineEnd = eol === -1 ? n : eol;
    const close = text.indexOf('}}', j + 2);
    if (close === -1 || close > lineEnd) { out += '{{'; i = j + 2; continue; }
    const body = text.slice(j + 2, close);
    const m = NAME_RE.exec(body);
    if (!m) { out += '{{'; i = j + 2; continue; }
    const name = m[1];
    let args = null;
    let argError = null;
    try { args = parseArgs(body.slice(name.length)); } catch (e) { argError = e.message; }
    out += onMacro({ name, args, argError, raw: text.slice(j, close + 2), line });
    i = close + 2;
  }
  return out;
}

module.exports = { parseArgs, expandText, NAME_RE };
