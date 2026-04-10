'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Ensures the Claude Code hooks for the Shards UI relay are configured
 * in the project's .claude/settings.json.
 *
 * This is the same logic as setupHooks() in tools/shards-ui.js,
 * extracted so Electron can call it on window creation.
 */
function setupHooksForProject(projectDir) {
  const claudeDir = path.join(projectDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const settingsPath = path.join(claudeDir, 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {}
  }

  // Relay script lives in the project's .shards/ui/ directory
  const relayScript = path.join(projectDir, '.shards', 'ui', 'relay.js');

  const requiredHooks = {
    UserPromptSubmit: { matcher: '', hooks: [{ type: 'command', command: `node ${relayScript} user-prompt` }] },
    Stop: { matcher: '', hooks: [{ type: 'command', command: `node ${relayScript} stop` }] },
    PostToolUse: { matcher: '', hooks: [{ type: 'command', command: `node ${relayScript} post-tool-use` }] },
    PreToolUse: { matcher: 'Bash', hooks: [{ type: 'command', command: `node ${relayScript} pre-tool-use` }] },
  };

  if (!settings.hooks) settings.hooks = {};

  let updated = false;

  for (const [hookName, hookDef] of Object.entries(requiredHooks)) {
    if (!settings.hooks[hookName]) {
      settings.hooks[hookName] = [];
    }

    const exists = settings.hooks[hookName].some(entry =>
      entry.hooks && entry.hooks.some(h => h.command && h.command.includes('relay.js'))
    );
    if (!exists) {
      settings.hooks[hookName].push(hookDef);
      updated = true;
    }
  }

  // Add Bash permission for ui-push.js
  if (!settings.permissions) settings.permissions = {};
  if (!settings.permissions.allow) settings.permissions.allow = [];

  const uiPushPermission = 'Bash(node .shards/ui/ui-push.js:*)';
  if (!settings.permissions.allow.includes(uiPushPermission)) {
    settings.permissions.allow.push(uiPushPermission);
    updated = true;
  }

  const relayPreToolPermission = 'Bash(node .shards/ui/relay.js pre-tool-use*)';
  if (!settings.permissions.allow.includes(relayPreToolPermission)) {
    settings.permissions.allow.push(relayPreToolPermission);
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }

  return updated;
}

module.exports = { setupHooksForProject };
