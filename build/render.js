'use strict';
// Renders a resolved macro model to text for a target (claude | codex | skills). See MACROS.md section 5.

const TARGETS = ['claude', 'codex', 'skills'];
// Real tool name inside a Claude Code plugin: mcp__plugin_<plugin>_<server>__<tool> (verified live: plugin 'shards', server 'shards').
const CLAUDE_TOOL_PREFIX = 'mcp__plugin_shards_shards__';
const CODEX_TOOL_PREFIX = 'shards.';

function tool(target, t) {
  if (target === 'claude') return `${CLAUDE_TOOL_PREFIX}${t}`;
  if (target === 'codex') return `${CODEX_TOOL_PREFIX}${t}`;
  return t;
}
function contentPath(target, rel) {
  const p = `content/${rel}`;
  return target === 'claude' ? `\${CLAUDE_PLUGIN_ROOT}/${p}` : p;
}
const q = (s) => JSON.stringify(String(s));

function render(m, target) {
  const T = (t) => `\`${tool(target, t)}\``;
  switch (m.macro) {
    case 'switch':
      return `Switch to \`${m.agent}\`: call ${T('activate')}(agent=${q(m.agent)}, mode="switch") and adopt the persona it returns. You stay that agent until you call ${T('return')}.`;
    case 'consult': {
      const file = contentPath(target, `agents/${m.agent}/${m.file}`);
      const task = m.task ? ` Task: ${m.task}.` : '';
      const tail = 'Give it only the task and the record sections it needs. It answers with a verdict (see the reviewer-verdict protocol), holds no gates and consults no one further. Continue with its result.';
      if (target === 'claude') return `Consult \`${m.agent}\` (entry \`${m.entry}\`): run the \`${m.agent}\` subagent by name. Start its prompt with "Entry ${m.entry}: read ${file} first".${task} ${tail}`;
      if (target === 'codex') return `Consult \`${m.agent}\` (entry \`${m.entry}\`): spawn the \`${m.agent}\` agent with spawn_agent. Start its message with "Entry ${m.entry}: read ${file} first".${task} ${tail}`;
      return `Consult \`${m.agent}\` (entry \`${m.entry}\`): invoke the \`${m.agent}\` skill in an isolated context if the host supports it; otherwise call ${T('activate')}(agent=${q(m.agent)}, mode="consult") and follow ${file}, then call ${T('return')}.${task} ${tail}`;
    }
    case 'fanout': {
      const file = contentPath(target, `agents/${m.agent}/${m.file}`);
      const how = target === 'claude' ? `launch one \`${m.agent}\` subagent per slice in a single message`
        : target === 'codex' ? `spawn one \`${m.agent}\` agent per slice in parallel with spawn_agent`
          : `invoke the \`${m.agent}\` skill once per slice in isolated contexts`;
      return `Fan out to \`${m.agent}\` workers (slices: ${m.slices}): call ${T('fanout_start')}(agent=${q(m.agent)}, slices=${q(m.slices)}), then ${how}. Each worker starts with "Entry ${m.entry}: read ${file} first" plus its slice. Workers hold no gates, do not change the plan and do not delegate. Collect and verify every result before continuing.`;
    }
    case 'delegate': {
      const wf = contentPath(target, 'agents/<worker>/modes/worker.md');
      const pd = contentPath(target, 'protocols/plan_drift.md');
      const cap = m.max_parallel ? `the host thread cap or ${m.max_parallel}, whichever is lower` : 'the host thread cap';
      const hand = target === 'claude' ? `run the specialist's own worker subagent (the worker agent id on the card) by name, starting its prompt with "Entry worker: read ${wf} first" followed by the card JSON`
        : target === 'codex' ? `spawn the worker agent named on the card with spawn_agent, starting its message with "Entry worker: read ${wf} first" followed by the card JSON`
          : `invoke the worker skill named on the card in an isolated context if the host supports it, otherwise do the card inline in this session under the same owned-path rule`;
      return `Run the delegated build loop. (1) Call ${T('tasks_set')}(path=${q(m.tasks || '<output_dir>/tasks.yaml')}) with the approved tasks.yaml; it rejects cycles, overlapping owned paths and missing acceptance checks. (2) Call ${T('task_dispatch')}(ids=<ready tasks>) for ready tasks only, at most ${cap} at once; it returns task cards. (3) Hand each card to a worker: ${hand}. (4) Pass each worker's result JSON to ${T('task_report')}; use ${T('task_status')} to see what is ready. (5) Verify the acceptance check yourself (never accept on the worker's word), then dispatch the tasks it unblocks. (6) Workers hold no gates, never change the plan and never delegate; if a result has deviations, stop dependent tasks and follow the plan_drift protocol (read ${pd}). (7) Raise the phase gate only when every task is done.`;
    }
    case 'return':
      return m.to ? `Return to \`${m.to}\`: call ${T('return')}(to=${q(m.to)}). Resolve any pending gate first.` : `Return to the previous agent: call ${T('return')}(). Resolve any pending gate first.`;
    case 'phase': {
      const tr = m.track ? `, track=${q(m.track)}` : '';
      return `Load phase ${m.n}${m.track ? ` (${m.track} track)` : ''}: call ${T('load_phase')}(agent=${q(m.agent)}, n=${q(m.n)}${tr}) and follow the phase text it returns. The tool is refused until the preceding phase's gate is confirmed; do not read phase files directly.`;
    }
    case 'protocol':
      return `Read the \`${m.name}\` protocol now and follow it: ${contentPath(target, `protocols/${m.file}`)}`;
    case 'template':
      return `Copy and fill in the template ${contentPath(target, `templates/${m.file}`)}`;
    case 'gate': {
      const v = m.validates ? `, validates=${q(m.validates)}` : '';
      const adv = m.advancing ? 'Write the decisions to the project record first.' : 'This is a checkpoint: it does not advance the phase.';
      return `**Gate \`${m.id}\`** (kind \`${m.kind}\`). ${adv} Then call ${T('gate_request')}(id=${q(m.id)}, kind=${q(m.kind)}, phase=${q(m.phase)}, summary=<one short paragraph>, record_ref=<the record section you wrote>${v}) and stop. Do not continue until the tool reports the gate confirmed; "already confirmed" means continue. Never approve or confirm the gate yourself, and do not write gate fences in text.`;
    }
    case 'auto_verify':
      return m.action === 'start'
        ? `Start auto-verify: call ${T('auto_verify_start')}(agent=${q(m.agent || '<current agent>')}, phase=${q(m.phase || '<current phase>')}, tool_budget=${m.tool_budget}, ttl=${m.ttl}). Only read-only operations on the allowlist are auto-approved.`
        : `End auto-verify: call ${T('auto_verify_end')}().`;
    case 'record.write':
      return `Write ${q(m.section)} to the project record (\`${m.file}\`) through the \`record\` job configured in shards.config.yaml, and keep the returned reference as \`record_ref\`.`;
    case 'tasks.create':
      return `Create a task through the \`tasks\` job configured in shards.config.yaml: title ${q(m.title)}${m.owns ? `, owned paths ${q(m.owns)}` : ''}${m.accept ? `, acceptance check ${q(m.accept)}` : ''}.`;
    case 'tasks.update':
      return `Through the \`tasks\` job, set task ${q(m.id)} to \`${m.status}\`.`;
    case 'tasks.list':
      return `List tasks through the \`tasks\` job${m.status ? ` with status \`${m.status}\`` : ''}.`;
    case 'tasks.get':
      return `Read task ${q(m.id)} through the \`tasks\` job.`;
    case 'knowledge.search':
      return `Search the knowledge source bound to the \`knowledge\` job for ${q(m.query)}${m.scope ? ` (scope ${q(m.scope)})` : ''}. Treat results as hints to verify.`;
    case 'artifact.emit':
      return `Announce the output: call ${T('artifact_emit')}(type=${q(m.type)}, path=${q(m.path)}${m.meta ? `, meta=${q(m.meta)}` : ''}).`;
    default:
      throw new Error(`no renderer for ${m.macro}`);
  }
}

module.exports = { render, tool, CLAUDE_TOOL_PREFIX, CODEX_TOOL_PREFIX, contentPath, TARGETS };
