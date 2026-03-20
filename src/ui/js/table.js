// ═══════════════════════════════════════════════════════════════
// Tabulator.js integration
// ═══════════════════════════════════════════════════════════════

function destroyTabulator() {
  if (activeTabulatorInstance) {
    try { activeTabulatorInstance.destroy(); } catch(e) {}
    activeTabulatorInstance = null;
    activeTabularColumns = null;
  }
}

function initTabulator(relPath, tableData) {
  destroyTabulator();

  var f = openFiles[relPath];
  var editable = isEditableTabular(relPath);

  // Store columns for serialization
  activeTabularColumns = tableData.columns;

  var columns = tableData.columns.map(function(col) {
    return {
      title: col,
      field: col,
      headerFilter: 'input',
      sorter: 'string',
      resizable: true,
      editor: editable ? 'input' : false,
    };
  });

  if (editable) {
    columns.unshift({
      formatter: 'rowSelection',
      titleFormatter: 'rowSelection',
      headerSort: false,
      resizable: false,
      width: 30,
      cssClass: 'tabulator-row-select',
    });
  }

  var container = document.getElementById('table-container');
  container.innerHTML = '';

  activeTabulatorInstance = new Tabulator(container, {
    data: tableData.data,
    columns: columns,
    layout: 'fitDataFill',
    height: '100%',
    virtualDom: true,
    selectableRows: editable ? true : false,
    placeholder: 'No data',
    cellEdited: editable ? function(cell) {
      if (f) {
        f.modified = true;
        renderWsTabs();
      }
    } : undefined,
  });

  // Update row count
  activeTabulatorInstance.on('dataLoaded', function(data) {
    document.getElementById('table-row-count').textContent = data.length + ' rows';
  });
  activeTabulatorInstance.on('dataFiltered', function(filters, rows) {
    document.getElementById('table-row-count').textContent = rows.length + ' rows';
  });

  // Show/hide edit buttons
  var editBtns = document.getElementById('table-edit-btns');
  editBtns.className = editable ? 'visible' : '';

  // Wire up global search
  var searchInput = document.getElementById('table-search');
  searchInput.value = '';
  searchInput.oninput = function() {
    var term = searchInput.value.toLowerCase();
    if (!term) {
      activeTabulatorInstance.clearFilter();
    } else {
      activeTabulatorInstance.setFilter(function(data) {
        return Object.values(data).some(function(v) {
          return v != null && String(v).toLowerCase().includes(term);
        });
      });
    }
  };

  // Store tabular data on file state
  f.tabularData = tableData;
  f.tabulatorInstance = activeTabulatorInstance;
}

function tableAddRow() {
  if (!activeTabulatorInstance || !activeTabularColumns) return;
  var empty = {};
  for (var i = 0; i < activeTabularColumns.length; i++) empty[activeTabularColumns[i]] = '';
  activeTabulatorInstance.addRow(empty);
  var key = getCurrentFileKey();
  if (key && openFiles[key]) {
    openFiles[key].modified = true;
    renderWsTabs();
  }
}

function tableDeleteSelectedRows() {
  if (!activeTabulatorInstance) return;
  var selected = activeTabulatorInstance.getSelectedRows();
  if (selected.length === 0) { alert('Select rows first (click the checkbox column)'); return; }
  selected.forEach(function(row) { row.delete(); });
  var key = getCurrentFileKey();
  if (key && openFiles[key]) {
    openFiles[key].modified = true;
    renderWsTabs();
  }
}

function tableAddColumn() {
  if (!activeTabulatorInstance || !activeTabularColumns) return;
  var name = prompt('Column name:');
  if (!name || !name.trim()) return;
  var colName = name.trim();
  activeTabularColumns.push(colName);
  activeTabulatorInstance.addColumn({
    title: colName,
    field: colName,
    headerFilter: 'input',
    sorter: 'string',
    resizable: true,
    editor: 'input',
  });
  var key = getCurrentFileKey();
  if (key && openFiles[key]) {
    openFiles[key].modified = true;
    renderWsTabs();
  }
}

function tableDeleteColumn() {
  if (!activeTabulatorInstance || !activeTabularColumns) return;
  var name = prompt('Column name to delete:');
  if (!name || !name.trim()) return;
  var colName = name.trim();
  if (!activeTabularColumns.includes(colName)) { alert('Column not found: ' + colName); return; }
  activeTabulatorInstance.deleteColumn(colName);
  activeTabularColumns = activeTabularColumns.filter(function(c) { return c !== colName; });
  var key = getCurrentFileKey();
  if (key && openFiles[key]) {
    openFiles[key].modified = true;
    renderWsTabs();
  }
}

function getTabulatorSerializedContent(relPath) {
  if (!activeTabulatorInstance || !activeTabularColumns) return null;
  var data = activeTabulatorInstance.getData();
  var delimiter = getTabularDelimiter(relPath);
  return serializeToDelimited(activeTabularColumns, data, delimiter);
}
