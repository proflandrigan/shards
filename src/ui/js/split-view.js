// ═══════════════════════════════════════════════════════════════
// Split view
// ═══════════════════════════════════════════════════════════════

function toggleSplit() {
  splitMode = !splitMode;
  var chatPane = document.getElementById('chat-pane');

  if (splitMode) {
    // Enter split mode
    activeTabId = 'chat'; // chat always active in split
    if (!currentFileInPane && fileTabOrder.length > 0) {
      currentFileInPane = fileTabOrder[0];
    }
    chatPane.style.flex = '1';
    document.getElementById('file-pane').style.flex = '1';
  } else {
    // Exit split mode
    chatPane.style.flex = '';
    document.getElementById('file-pane').style.flex = '';
    if (currentFileInPane && openFiles[currentFileInPane]) {
      activeTabId = currentFileInPane;
    } else {
      activeTabId = 'chat';
    }
  }

  renderWsTabs();
  showActiveContent();
}

function initSplitResize() {
  var handle = document.getElementById('split-resize');
  var chatPane = document.getElementById('chat-pane');
  var filePane = document.getElementById('file-pane');
  var startX, chatStartW, fileStartW;

  handle.addEventListener('mousedown', function(e) {
    e.preventDefault();
    startX = e.clientX;
    chatStartW = chatPane.offsetWidth;
    fileStartW = filePane.offsetWidth;
    handle.classList.add('dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  function onMove(e) {
    var delta = e.clientX - startX;
    var totalW = chatStartW + fileStartW;
    var newChatW = Math.max(200, Math.min(totalW - 200, chatStartW + delta));
    var newFileW = totalW - newChatW;
    chatPane.style.flex = 'none';
    filePane.style.flex = 'none';
    chatPane.style.width = newChatW + 'px';
    filePane.style.width = newFileW + 'px';
  }

  function onUp() {
    handle.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
}
