'use strict';
// Renders a resolved macro model to text for a target (claude | codex | skills). See MACROS.md section 5.

const { formatMeta } = require('./meta');

const TARGETS = ['claude', 'codex', 'skills'];
// Real tool name inside a Claude Code plugin: mcp__plugin_<plugin>_<server>__<tool> (verified live: plugin 'shards', server 'shards').
const CLAUDE_TOOL_PREFIX = 'mcp__plugin_shards_shards__';
const CODEX_TOOL_PREFIX = 'mcp__shards__'; // verified on Codex 0.169.0 (docs/compat.md)

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

// The argument object a macro's rendered instruction passes to its runtime tool (auto_verify start,
// artifact.emit). Placeholders the agent fills in stay as '<...>' strings; meta integer placeholders
// are { placeholder }. Exported so tests can validate it against the tools' inputSchema.
function toolArgs(m) {
  if (m.macro === 'auto_verify' && m.action === 'start') {
    return { agent: m.agent || '<current agent>', phase: m.phase || '<current phase>', tool_budget: Number(m.tool_budget), ttl_s: Number(m.ttl) };
  }
  if (m.macro === 'artifact.emit') return m.meta ? { type: m.type, path: m.path, meta: m.meta } : { type: m.type, path: m.path };
  return null;
}

function render(m, target) {
  const T = (t) => `\`${tool(target, t)}\``;
  switch (m.macro) {
    case 'jira_context':
      return `Call ${T('jira_context')}() for the Jira binding instructions and settings.`;
    case 'switch':
      return `Switch to \`${m.agent}\`: call ${T('activate')}(agent=${q(m.agent)}, mode="switch") and adopt the persona it returns. You stay that agent until you call ${T('return')}.`;
    case 'consult': {
      const file = contentPath(target, `agents/${m.agent}/${m.file}`);
      const task = m.task ? ` Task: ${m.task}.` : '';
      const tail = 'Give it only the task and the record sections it needs. It answers with a verdict (see the reviewer-verdict protocol), holds no gates and consults no one further. Continue with its result.';
      if (target === 'claude') return `Consult \`${m.agent}\` (entry \`${m.entry}\`): run the \`${m.agent}-${m.entry}\` subagent by name. Start its prompt with "Entry ${m.entry}: read ${file} first".${task} ${tail}`;
      if (target === 'codex') return `Consult \`${m.agent}\` (entry \`${m.entry}\`): spawn the \`${m.agent}-${m.entry}\` agent with spawn_agent. Start its message with "Entry ${m.entry}: read ${file} first".${task} ${tail}`;
      return `Consult \`${m.agent}\` (entry \`${m.entry}\`): invoke the \`${m.agent}\` skill in an isolated context if the host supports it; otherwise call ${T('activate')}(agent=${q(m.agent)}, mode="consult") and follow ${file}, then call ${T('return')}.${task} ${tail}`;
    }
    case 'fanout': {
      const file = contentPath(target, `agents/${m.agent}/${m.file}`);
      const how = target === 'claude' ? `launch one \`${m.agent}-${m.entry}\` subagent per slice in a single message`
        : target === 'codex' ? `spawn one \`${m.agent}-${m.entry}\` agent per slice in parallel with spawn_agent`
          : `invoke the \`${m.agent}\` skill once per slice in isolated contexts`;
      const pre = `Precondition (ADR 0011): ${T('fanout_start')} is refused while a gate is pending or suspended, so confirm or close the open gate first; if it is refused, resolve that gate (confirm it, or ${T('gate_force_close')} / ${T('gate_resume')} as appropriate), then call it again.`;
      return `Fan out to \`${m.agent}\` workers (slices: ${m.slices}). ${pre} Call ${T('fanout_start')}(agent=${q(m.agent)}, slices=[{id, paths, acceptance}, ...]) with one object per slice (${m.slices}): \`id\` is the slice name, \`paths\` the non-overlapping paths that slice owns, \`acceptance\` its done check. It returns a lease and one contract card per slice. Then ${how}, giving each worker its own contract card. Each worker starts with "Entry ${m.entry}: read ${file} first" plus its card, calls ${T('fanout_claim')}(lease_id, slice_id) first, writes only inside its owned_paths and returns verdict JSON. Workers hold no gates, do not change the plan and do not delegate. When all workers return, call ${T('fanout_collect')}(lease_id, results) with one result per slice, then verify the merged result before continuing.`;
    }
    case 'lead': {
      const lc = contentPath(target, 'protocols/lead_contract.md');
      const task = m.task ? ` Task: ${m.task}.` : '';
      const how = target === 'claude' ? `run the \`${m.agent}\` subagent by name (the Agent tool) as the workstream lead`
        : target === 'codex' ? `spawn the \`${m.agent}\` agent with spawn_agent as the workstream lead (this nests Syn -> lead -> worker, so Codex needs \`agents.max_depth = 2\` or higher)`
          : `invoke the \`${m.agent}\` skill in an isolated context as the workstream lead if the host supports it`;
      const par = target === 'claude' ? 'launch independent leads in parallel, all in a single message'
        : target === 'codex' ? 'spawn independent leads in parallel with spawn_agent' : 'run independent leads in parallel only if the host supports concurrent isolated skill invocations, otherwise one after another';
      const fb = target === 'skills' ? ' If this host cannot give the lead its own isolated workers, the lead uses the sequential or inline fallback of the delegated build loop and must say so in its report (reason, plus a `Fallback: <sequential|inline> — <reason>` row in the project-specs.md Validation evidence table).' : '';
      return `Launch \`${m.agent}\` as a workstream lead: ${how}. Start its prompt with "Entry lead: read ${lc} first, then follow your own phases as the lead".${task} Give it the brief: the workstream dir (its \`scope\`), its slice of the plan, owned paths, acceptance checks and the report format you want back. The lead holds no gates and does not talk to the user; it runs its build phases through the delegated build loop, passing \`scope=<workstream dir>\` on every ${T('tasks_set')}, ${T('task_dispatch')}, ${T('task_report')}, ${T('task_status')} and ${T('task_verify')} call, and dispatches \`${m.agent}\` workers (entry worker) itself. It returns the structured report the brief asks for. To run several workstreams, ${par}.${fb} Then verify each lead's report before continuing.`;
    }
    case 'review_lead': {
      const rc = contentPath(target, 'protocols/review_lead_contract.md');
      const file = contentPath(target, `agents/${m.agent}/${m.file}`);
      const task = m.task ? ` Task: ${m.task}.` : '';
      const how = target === 'claude' ? `run the \`${m.agent}\` subagent by name (the Agent tool) as the review lead`
        : target === 'codex' ? `spawn the \`${m.agent}\` agent with spawn_agent as the review lead (this nests Syn -> lead -> verifier, so Codex needs \`agents.max_depth = 2\` or higher)`
          : `invoke the \`${m.agent}\` skill in an isolated context as the review lead if the host supports it`;
      const par = target === 'claude' ? 'launch independent review leads in parallel, all in a single message'
        : target === 'codex' ? 'spawn independent review leads in parallel with spawn_agent'
          : 'run independent review leads in parallel only if the host supports concurrent isolated skill invocations, otherwise one after another';
      const fb = target === 'skills' ? ' If this host cannot isolate the lead, the lead reviews inline in this session and says so in its report.' : '';
      return `Launch \`${m.agent}\` as a review lead: ${how}. Start its prompt with "Entry review_lead: read ${rc} first, then ${file}".${task} Give it the brief: the review scope (paths and the question), the \`run_id\`, the \`**Code execution:**\` line (\`approved — allowed commands: ...\` or \`not approved\`) and the report format you want back. The lead holds no gates, never fixes source files and does not talk to the user. It reviews, then verifies its High findings itself through its verifiers (see the review lead contract). To review several specialists, ${par}.${fb} Verify each lead's report (statuses CONFIRMED, PLAUSIBLE, REFUTED) before continuing.`;
    }
    case 'verify': {
      const rc = contentPath(target, 'protocols/review_lead_contract.md');
      const vc = contentPath(target, 'protocols/verifier_contract.md');
      const re = contentPath(target, 'protocols/review_execution.md');
      const how = target === 'claude' ? 'launch one `<your agent id>-verify` subagent per card in a single message'
        : target === 'codex' ? 'spawn one `<your agent id>-verify` agent per card in parallel with spawn_agent (this nests lead -> verifier, so Codex needs `agents.max_depth = 2`)'
          : 'invoke the `<your agent id>` skill once per card in an isolated context if the host supports it; otherwise verify inline, one finding at a time, and say so in your report';
      return `Verify the findings (review lead steps, contract ${rc}). (1) Check the brief's \`**Code execution:**\` line: when it is \`not approved\`, no verifier runs code and every finding stays PLAUSIBLE. (2) Verify every High finding, and Medium ones if budget allows. The \`run_id\` comes from your brief; the caller owns the source snapshot, so do not take one yourself. (3) Call ${T('fanout_start')}(agent=<your agent id>, purpose="review", run_id=<run id>, slices=[{id, paths, acceptance}, ...]) with one slice per finding: \`id\` is \`<your agent id>-<finding id>\` (unique across the leads sharing this run), \`paths\` is \`.shards/review/<run id>/<slice id>/\`, \`acceptance\` the claim the repro must confirm. At most 4 slices per call, 4 per lead in a run (across calls) and 16 per run; the runtime refuses more. It returns a lease and one card per slice. (4) ${how}, each starting with "Entry verify: read ${vc} and ${re} first" plus its card. (5) When all verifiers return, call ${T('fanout_collect')}(lease_id, results) with one result per slice. Verifiers never spawn further.`;
    }
    case 'delegate': {
      const wf = contentPath(target, 'agents/<worker>/modes/worker.md');
      const pd = contentPath(target, 'protocols/plan_drift.md');
      const mode = m.mode || (target === 'skills' ? 'sequential' : 'parallel');
      const hostCap = target === 'claude' ? 'the host background-subagent thread cap'
        : target === 'codex' ? 'the Codex max_threads setting' : 'the host thread cap';
      const cap = m.max_parallel ? `${hostCap} or ${m.max_parallel}, whichever is lower` : hostCap;
      const card = 'followed by the card JSON';
      const par = target === 'claude' ? `launch the specialist's own worker subagent \`<worker>-worker\` (the worker agent id on the card plus \`-worker\`; it has no delegation tool) for every dispatched card as a background subagent in a single message, starting each prompt with "Entry worker: read ${wf} first" ${card}`
        : target === 'codex' ? `spawn the Codex agent \`<worker>-worker\` (the worker agent id on the card plus \`-worker\`) with spawn_agent for every dispatched card (bounded by max_threads), starting each message with "Entry worker: read ${wf} first" ${card}`
          : `invoke the worker skill named on the card in an isolated context for each dispatched card if the host supports concurrent skill invocations`;
      const seq = target === 'claude' ? `run the specialist's own worker subagent \`<worker>-worker\` (the worker agent id on the card plus \`-worker\`) by name, starting its prompt with "Entry worker: read ${wf} first" ${card}, and wait for its result before handing over the next card`
        : target === 'codex' ? `spawn the Codex agent \`<worker>-worker\` (the worker agent id on the card plus \`-worker\`) with spawn_agent, starting its message with "Entry worker: read ${wf} first" ${card}, and wait for its result before spawning the next`
          : `invoke the worker skill named on the card in an isolated context if the host supports it (one card at a time, waiting for each result), otherwise do the card inline in this session under the same owned-path rule`;
      const inl = 'do not hand the card to a worker: do each card yourself inline in this session, writing only inside the card\'s owned paths';
      const fbSeq = 'Only if the host cannot run subagents in parallel, run the ready cards one at a time through the same dispatch/report/verify steps.';
      const fbInl = 'Only if worker subagents cannot be spawned at all on this host, do each card yourself inline under the same owned-path rule; same cards, acceptance checks and evidence rows; only isolation is lost.';
      const fbRule = 'Use a fallback ONLY when worker subagents genuinely cannot be spawned on this host, never for convenience: name the reason in your report to your caller and add a row to the `## Validation` Evidence table of project-specs.md stating `Fallback: <sequential|inline> — <reason>`; never fall back silently, and the cards, acceptance checks, task_verify calls and evidence rows stay identical.';
      let dispatch, hand, fb;
      if (mode === 'parallel') {
        dispatch = `Call ${T('task_dispatch')}(ids=<ready tasks>) for ready tasks only, at most ${cap} at once; it returns task cards`;
        hand = `Hand each card to a worker in parallel: ${par}`;
        fb = `${fbSeq} ${fbInl}`;
      } else if (mode === 'sequential') {
        dispatch = `Call ${T('task_dispatch')}(ids=<ONE ready task>) for a single ready task at a time (never more than one in flight); it returns its task card`;
        hand = `Hand the card to a worker: ${seq}`;
        fb = fbInl;
      } else {
        dispatch = `Call ${T('task_dispatch')}(ids=<ONE ready task>) for a single ready task at a time; it returns its task card`;
        hand = `Inline mode, no worker handoff: ${inl}, then produce the result JSON as a worker would (same card, same acceptance check, same evidence)`;
        fb = 'Inline mode forces this: same cards, acceptance checks and evidence rows as with workers; only isolation is lost.';
      }
      const dflt = m.mode ? '' : (target === 'skills' ? ' This host gives no parallel guarantee, so run cards sequentially by default.' : '');
      return `Run the delegated build loop (mode: ${mode}).${dflt} (1) Call ${T('tasks_set')}(path=${q(m.tasks || '<output_dir>/tasks.yaml')}) with the approved tasks.yaml; it rejects cycles, overlapping owned paths and missing acceptance checks. (2) ${dispatch}. (3) ${hand}. (4) Pass each result JSON to ${T('task_report')}; use ${T('task_status')} to see what is ready. (5) Verify the acceptance check yourself (never accept on the worker's word), then call ${T('task_verify')}(id=<task id>, pass=<true|false>, expected=<what the check requires>, observed=<what you saw>, notes=<optional>) to record the evidence row. A task is done only through ${T('task_verify')}; on a failed check re-dispatch with the failure notes, at most 2 retries, then escalate to the user. Then dispatch the tasks it unblocks. (6) Workers hold no gates, never change the plan and never delegate; if a result has deviations, stop dependent tasks and follow the plan_drift protocol (read ${pd}). (7) Raise the phase gate only when every task is done. If you are a workstream lead, pass the \`scope\` your lead contract gives you on every task tool call. Fallbacks: ${fb} ${fbRule}`;
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
      const v = (m.validates ? `, validates=${q(m.validates)}` : '') + (m.requires_human ? ', requires_human=true' : '');
      const hum = m.requires_human ? ' This gate always needs a human confirmation, under every gate policy (a plan approval never turns it into a notice).' : '';
      const adv = m.advancing ? 'Write the decisions to the project record first.' : 'This is a checkpoint: it does not advance the phase.';
      return `**Gate \`${m.id}\`** (kind \`${m.kind}\`). ${adv} Then call ${T('gate_request')}(id=${q(m.id)}, kind=${q(m.kind)}, phase=${q(m.phase)}, summary=<one short paragraph>, record_ref=<the record section you wrote>${v}) and stop.${hum} Do not continue until the tool reports the gate confirmed; "already confirmed" means continue. Never approve or confirm the gate yourself, and do not write gate fences in text.`;
    }
    case 'auto_verify': {
      if (m.action !== 'start') return `End auto-verify: call ${T('auto_verify_end')}().`;
      const a = toolArgs(m);
      return `Start auto-verify: call ${T('auto_verify_start')}(agent=${q(a.agent)}, phase=${q(a.phase)}, tool_budget=${a.tool_budget}, ttl_s=${a.ttl_s}). Only read-only operations on the allowlist are auto-approved.`;
    }
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
    case 'artifact.emit': {
      const a = toolArgs(m);
      return `Announce the output: call ${T('artifact_emit')}(type=${q(a.type)}, path=${q(a.path)}${a.meta ? `, meta=${formatMeta(a.meta)}` : ''}).${a.meta ? ' Pass meta as an object, not a string.' : ''}`;
    }
    default:
      throw new Error(`no renderer for ${m.macro}`);
  }
}

module.exports = { render, toolArgs, tool, CLAUDE_TOOL_PREFIX, CODEX_TOOL_PREFIX, contentPath, TARGETS };
