// Read last assistant message from a Claude Code transcript (JSONL)
'use strict';

const fs = require('fs');

function readLastAssistantMessage(transcriptPath) {
  if (!transcriptPath) return '';

  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return '';
  }

  const lines = raw.split('\n').filter(Boolean);
  let lastAssistantText = '';

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.role === 'assistant' && Array.isArray(entry.content)) {
        const text = entry.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('');
        if (text) lastAssistantText = text;
      }
    } catch {
      // malformed line — skip
    }
  }

  return lastAssistantText;
}

module.exports = { readLastAssistantMessage };
