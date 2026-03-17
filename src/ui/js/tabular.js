// ═══════════════════════════════════════════════════════════════
// Tabular data viewer (CSV/TSV/JSON/JSONL)
// ═══════════════════════════════════════════════════════════════

var TABULAR_EXTS = ['csv', 'tsv', 'json', 'jsonl'];
var EDITABLE_TABULAR_EXTS = ['csv', 'tsv'];

function isTabularFile(relPath) {
  var ext = relPath.split('.').pop().toLowerCase();
  return TABULAR_EXTS.includes(ext);
}

function isEditableTabular(relPath) {
  var ext = relPath.split('.').pop().toLowerCase();
  return EDITABLE_TABULAR_EXTS.includes(ext);
}

function getTabularDelimiter(relPath) {
  return relPath.split('.').pop().toLowerCase() === 'tsv' ? '\t' : ',';
}

function flattenObject(obj, prefix) {
  var result = {};
  for (var _i = 0, _a = Object.entries(obj); _i < _a.length; _i++) {
    var key = _a[_i][0], val = _a[_i][1];
    var newKey = prefix ? prefix + '.' + key : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenObject(val, newKey));
    } else if (Array.isArray(val)) {
      result[newKey] = JSON.stringify(val);
    } else {
      result[newKey] = val;
    }
  }
  return result;
}

function flattenToTable(arr) {
  var flat = arr.map(function(item) { return flattenObject(item, ''); });
  var colSet = new Set();
  for (var i = 0; i < flat.length; i++) {
    for (var k of Object.keys(flat[i])) colSet.add(k);
  }
  var columns = Array.from(colSet);
  var data = flat.map(function(row) {
    var out = {};
    for (var j = 0; j < columns.length; j++) {
      out[columns[j]] = row[columns[j]] !== undefined ? row[columns[j]] : '';
    }
    return out;
  });
  return { columns: columns, data: data };
}

function serializeToDelimited(columns, data, delimiter) {
  var escape = function(val) {
    var s = val == null ? '' : String(val);
    if (s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  var lines = [columns.map(escape).join(delimiter)];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    lines.push(columns.map(function(col) { return escape(row[col]); }).join(delimiter));
  }
  return lines.join('\n') + '\n';
}

async function loadTabularData(relPath, f) {
  var ext = relPath.split('.').pop().toLowerCase();

  if (ext === 'csv' || ext === 'tsv') {
    var delimiter = ext === 'tsv' ? '\t' : ',';
    var res = await authFetch('/browse/file/parse-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: f.absPath, delimiter: delimiter }),
    });
    var result = await res.json();
    if (result.error) throw new Error(result.error);
    return result;
  }

  // JSON / JSONL — client-side parse + flatten
  if (ext === 'jsonl') {
    var lines = f.content.split('\n').filter(function(l) { return l.trim(); });
    var arr = lines.map(function(l) { return JSON.parse(l); });
    return flattenToTable(arr);
  }

  // JSON
  var parsed = JSON.parse(f.content);
  if (!Array.isArray(parsed)) {
    if (parsed && typeof parsed === 'object') {
      parsed = [parsed];
    } else {
      throw new Error('JSON is not an object or array');
    }
  }
  if (parsed.length > 0 && typeof parsed[0] !== 'object') {
    throw new Error('JSON array does not contain objects');
  }
  return flattenToTable(parsed);
}
