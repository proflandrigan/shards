'use strict';
// E7.2: utility skills (thin, deterministic). Single source for skills/<name>/SKILL.md bodies other than
// per-agent switch skills. Bodies carry no persona text; they point at content/ files and runtime tools.
const YAML = require('yaml');
const { CLAUDE_TOOL_PREFIX, CODEX_TOOL_PREFIX, contentPath } = require('./render');

const fm = (obj) => `---\n${YAML.stringify(obj, { lineWidth: 0 }).trimEnd()}\n---\n`;
const prefixOf = (target) => (target === 'claude' ? CLAUDE_TOOL_PREFIX : target === 'codex' ? CODEX_TOOL_PREFIX : '');

// DEFERRED(Stage 6): connect, sync, doctor, publish-knowledge
const DEFERRED_SKILLS = ['connect', 'doctor', 'publish-knowledge', 'sync'];

// Content files (under content/) that utility skills tell the model to read.
const MODE_FILES = {
  brainstorm: ['agents/syn/modes/brainstorm.md'],
  'review-pr': ['agents/syn/modes/pr_review.md'],
  'notebook-walkthrough': [
    'agents/data-scientist/modes/notebook_walkthrough.md',
    'agents/ml-engineer/modes/notebook_walkthrough.md',
    'agents/syn/modes/notebook_walkthrough.md',
    'protocols/notebook_walkthrough.md',
  ],
};

function agentsSkill(target) {
  const pre = prefixOf(target);
  const description = 'List the available Shards agents with role, modes, description, switch command and consult subagent names.';
  const hostT = target === 'codex' ? 'codex' : 'claude';
  const profileNote = hostT === 'codex' ? ' Also show `activate.codex.profile` (start with `codex --profile <profile>`).' : '';
  const body = `# Shards agents\n\nCall \`${pre}list_agents\`() (no arguments). Print the result as a table with the columns id, role, modes, description, switch command, consult subagents (one row per agent; modes = the \`modes\` field joined with commas; switch command = \`activate.${hostT}.switch\`, or - when null; consult subagents = \`activate.${hostT}.consult\` joined with commas, or - when empty).${profileNote} If an entry has an \`error\` field, show its id with the error in the description column. Do not call any other tool and do not start an agent.\n`;
  return fm({ name: 'agents', description }) + '\n' + body;
}

function directModeSkill(name, description, title, agent, file, target, start) {
  const pre = prefixOf(target);
  const body = `# ${title}\n\n1. Call \`${pre}activate\`(agent="${agent}", mode="switch"). Adopt the returned \`persona_summary\`.\n2. Do not show the activation menu. Read ${contentPath(target, file)} in full and follow it exactly, starting from ${start}.\n3. Load phases with \`${pre}load_phase\` only when the mode file says to. Leave with \`${pre}return\` when the session is done.\n`;
  return fm({ name, description }) + '\n' + body;
}

function notebookSkill(target) {
  const pre = prefixOf(target);
  const description = 'Start an interactive cell-by-cell walkthrough of a Jupyter notebook with a Shards agent. Needs Shards Studio (the browser UI) running.';
  const body = `# Notebook walkthrough\n\nInteractive only: no phases, no gates, no project-specs.md.\n\nBefore any other output, ask the user:\n\n1. Which notebook? A path to a \`.ipynb\` file. If they name only a project or study, look for \`.ipynb\` files under shards/, studies/, models/, services/, analysis/, research/ and dashboards/ and offer the matches.\n2. Which agent? \`data-scientist\` (analysis, methodology, anything under studies/ or analysis/, or a shards/ analysis project), \`ml-engineer\` (training, evaluation, anything under models/, services/ or research/, or a shards/ modelling project) or \`syn\` (neutral guide). Suggest one; the user picks.\n\nThen call \`${pre}activate\`(agent=<choice>, mode="switch"), adopt the returned \`persona_summary\`, and read that agent's walkthrough mode in full and follow it:\n\n- data-scientist: ${contentPath(target, 'agents/data-scientist/modes/notebook_walkthrough.md')}\n- ml-engineer: ${contentPath(target, 'agents/ml-engineer/modes/notebook_walkthrough.md')}\n- syn: ${contentPath(target, 'agents/syn/modes/notebook_walkthrough.md')}\n\nShared protocol: ${contentPath(target, 'protocols/notebook_walkthrough.md')}. Where it describes the kernel helper, use the notebook tools instead: \`${pre}notebook_start\` (once, with notebook and session), \`${pre}notebook_exec\` (one cell by session and cell), \`${pre}notebook_run_all\`, and \`${pre}notebook_stop\` at the end. Never run notebook code through ad-hoc Bash or direct Python. If \`notebook_start\` returns an install hint, the user needs \`pip install jupyter_client ipykernel\` in their Python environment.\n\nNever change cells without explicit user confirmation. The walkthrough needs Shards Studio (the browser UI) for its panel. Before step 1, tell the user to run \`npx @proflandrigan/shards-studio\` in the project directory if it is not already open.\n`;
  return fm({ name: 'notebook-walkthrough', description }) + '\n' + body;
}

function resumeSkill(target) {
  const pre = prefixOf(target);
  const description = 'Resume an earlier Shards chat session.';
  const body = `# Resume a Shards session\n\nUtility only: adopt no persona, start no workflow, edit nothing. Runs on the Shards runtime tools; the UI server is not needed.\n\n1. Call \`${pre}sessions_list\` with status "ended" and limit 10. If there are none, say "No Shards sessions on record yet. Start one with any agent skill and it will be listed here next time." and stop.\n2. Show the sessions as a table and ask which one to resume (a short id prefix, about 8 characters, is enough).\n3. Call \`${pre}sessions_resume\` with \`id\` set to the answer. Find the hint for the current host in the result: Claude Code \`claude --resume <id>\`; Codex \`codex resume <id>\` (unverified, say so on Codex); T3 Code uses the thread link in the app (host-side, see docs/compat.md T3-4). Tell the user to exit this session first, then run the command in a shell; a running session cannot re-exec itself.\n4. If \`sessions_resume\` returns an error, show it as given and do not retry with a different id.\n5. Do not start any agent and do not edit project-specs.md.\n`;
  return fm({ name: 'resume', description }) + '\n' + body;
}

function endSkill(target) {
  const pre = prefixOf(target);
  const description = 'End the current Shards chat cleanly so it can be resumed later.';
  const body = `# End the Shards session\n\nUtility only: adopt no persona, advance no phase, and write nothing to project-specs.md beyond the resume hint below.\n\n1. If a specialist is active and a \`project-specs.md\` exists for it, append a terse resume hint:\n\n\`\`\`markdown\n## Resume hint - <ISO date>\n\n- Left off at: <last phase heading or short description>\n- Pending: <the user's most recent open question or request, one sentence>\n\`\`\`\n\n2. If there is no \`project-specs.md\` in scope, skip step 1.\n3. Call \`${pre}sessions_end\` (no \`id\` ends the current session; it replays pending gate git commits first).\n   - On success, say the session is closed and can be resumed with the resume skill, or from a shell with \`shards sessions list\` and \`shards sessions resume <prefix>\`.\n   - If it refuses, the session still has suspended or pending gates. Show the list it returns, then say: "This chat cannot close while these gates are open. Resolve them first: confirm or revise each gate with the operator. If a gate is stuck and must be closed without resolution, the operator runs \`shards gates force-close\` in a shell. I cannot run that for you." Stop; do not retry \`sessions_end\` in a loop.\n4. NEVER call \`${pre}gate_force_close\` or \`${pre}gate_advance\` (or any tool that closes or advances a gate) from this skill.\n5. Do not exit for the user; let them close the chat after reading the hint.\n`;
  return fm({ name: 'end', description }) + '\n' + body;
}

// Map of 'skills/<name>/SKILL.md' -> text. Deterministic. shards-conventions: claude only.
function utilitySkills(target) {
  const m = new Map();
  m.set('skills/agents/SKILL.md', agentsSkill(target));
  m.set('skills/brainstorm/SKILL.md', directModeSkill('brainstorm', 'Start a Shards brainstorm session: Syn gathers context, polls the relevant specialists and synthesizes ideas.', 'Brainstorm', 'syn', MODE_FILES.brainstorm[0], target, 'Phase 0'));
  m.set('skills/review-pr/SKILL.md', directModeSkill('review-pr', 'Walk through GitHub PR review comments with guided fixes: Syn reads each comment, proposes a change and applies it with your approval.', 'PR review', 'syn', MODE_FILES['review-pr'][0], target, 'Step 0'));
  m.set('skills/notebook-walkthrough/SKILL.md', notebookSkill(target));
  m.set('skills/resume/SKILL.md', resumeSkill(target));
  m.set('skills/end/SKILL.md', endSkill(target));
  if (target === 'claude') m.set('skills/shards-conventions/SKILL.md', require('./conventions').conventionsSkill());
  return m;
}

// Content paths (relative to the output root) that utility skills reference.
function referencedContent() {
  return [...new Set(Object.values(MODE_FILES).flat())].map((p) => `content/${p}`).sort();
}

module.exports = { utilitySkills, agentsSkill, referencedContent, DEFERRED_SKILLS };
