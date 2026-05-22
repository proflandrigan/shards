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
      // Claude Code transcript shape: {type: "assistant", message: {role, content}}
      // Test/legacy shape: {role: "assistant", content: [...]}
      let content = null;
      if (entry.type === 'assistant' && entry.message && Array.isArray(entry.message.content)) {
        content = entry.message.content;
      } else if (entry.role === 'assistant' && Array.isArray(entry.content)) {
        content = entry.content;
      }
      if (!content) continue;

      const text = content
        .filter((c) => c && c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text)
        .join('');
      if (text) lastAssistantText = text;
    } catch {
      // malformed line — skip
    }
  }

  return lastAssistantText;
}

module.exports = { readLastAssistantMessage };
