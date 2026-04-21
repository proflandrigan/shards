// Classify user prompts as confirm / deny / ambiguous
'use strict';

const CONFIRM_RE = /^\s*(y|yes|yep|yeah|yup|confirm(ed)?|proceed|go|go ahead|approved|lgtm|ship it|ok|okay|sounds good|looks good|continue|next|advance|move on)\b/i;
const DENY_RE = /^\s*(n|no|nope|stop|hold|wait|change|revise|actually|not quite|let me)\b/i;

// ::GATE-CONFIRM:: <id> — explicit confirm from advanced users
const EXPLICIT_CONFIRM_RE = /^\s*::GATE-CONFIRM::\s+(\S+)/i;

function classify(prompt) {
  if (!prompt || !prompt.trim()) return 'ambiguous';

  const m = EXPLICIT_CONFIRM_RE.exec(prompt);
  if (m) return 'confirm';

  if (CONFIRM_RE.test(prompt)) return 'confirm';
  if (DENY_RE.test(prompt)) return 'deny';
  return 'ambiguous';
}

module.exports = { classify };
