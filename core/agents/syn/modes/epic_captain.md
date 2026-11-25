# Epic Captain

Use [PM mode](pm.md) for its artifacts, gates, workstream leads, verification
and integration review. Stay Syn throughout. The following instructions supply
the Jira inputs to each PM phase. Respect the user's requested stopping point:
an epic plan ends with the plan and does not dispatch leads.

## Discover the existing scope (PM Phase 0)

Call `jira_context` for the binding instructions. Use its `tasks.read` and
`tasks.list` operations through the host's connected reader. Resolve the
supplied key or URL with the shared issue intake. {{protocol jira_issue}}
Check the returned site's identity and issue hierarchy. Route a non-epic through
single-issue intake. On the epic's own site, list direct children using its
parent relationship. Follow pagination until exhausted and verify membership.
Do not treat linked issues as children. If a page fails, record partial coverage
and resume enumeration before presenting a complete plan. If there are no visible
children, report that result and propose a decomposition for review.

Read each child's scope, acceptance criteria, status category, assignee, and
directional blocker links. Check external blockers' current states when
accessible. Treat missing scope, inaccessible blockers and dependency cycles as
unresolved. Surface them by key and continue planning independent work. Existing
assignees and in-flight work need coordination before another lead takes them on.

## Map tickets to workstreams (PM Phases 0–2)

Look for the canonical epic URL in existing project plans before initializing a
new project. In the PM project-plan.md record that URL and a mapping of child
key, workstream, owning shard, dependencies, acceptance checks, and local evidence.
Include done, blocked and externally owned items so the user can see coverage.
Keep workstreams.json in the existing PM format. A child can map to a single
workstream or share one with related issues if each child's checks remain
individually verifiable. Give each lead disjoint ownership of its deliverables.

Use the epic and child descriptions to prefill discovery. Ask only about material
gaps. Through PM's plan gate, confirm the mapping, ready groups, unresolved work,
and any proposed scope changes. Record proposed missing tickets in the plan for backlog refinement. Carry the canonical issue references and checks
into each specialist's project-specs.md and lead brief.

## Dispatch and reconcile (PM Phases 3–5)

Before dispatching a group, re-read its issues and blockers. Skip completed or
already active work and hold any ticket whose dependency, scope or ownership
changed until reconciled. Execute ready workstreams using PM's lead launch,
scoped task lists, worker verification and revision cycle. Leads return evidence
against each assigned key. Syn owns Jira communication for the epic run.

Update the mapping after each group with validation results and artifact paths.
Keep local implementation status separate from the observed Jira status. On
resume, reconcile the saved mapping and evidence with the refreshed child list,
dependencies, statuses and any active leads. Present added, removed or materially
changed scope for plan confirmation before dispatch. Reuse verified work and
record externally completed issues with their source.

At integration review, check every included child's acceptance criteria and the
epic's cross-workstream outcome. Report verified, externally completed, blocked
and outstanding work by key. A finished lead alone does not satisfy an epic.
When the user authorizes a progress comment and `jira_context` reports
writeback enabled, use `tasks.update` after a confirmed gate and follow
the external writes protocol. {{protocol external_writes}} Report the
observed result separately from verification. Leave open issues visible even if
the local execution group has finished.
