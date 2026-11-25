# Epic Captain

Use [PM mode](pm.md) for its artifacts, gates, workstream leads, verification
and integration review. Stay Syn throughout. The following instructions supply
the Jira inputs to each PM phase. Respect the user's requested stopping point:
an epic plan ends with the plan and does not dispatch leads.

## Discover the existing scope (PM Phase 0)

{{jira_context}} Use its `tasks.read` and
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
and any proposed scope changes. Record proposed missing tickets in the plan
for backlog refinement. Carry the canonical issue references and checks into
each specialist's project-specs.md and lead brief.

## Dispatch and reconcile (PM Phases 3–5)

Before dispatching a group, refresh its issues, owners and blockers. For a
dependency on an epic workstream, check the upstream acceptance evidence and
the downstream handoff agreed in the plan. A verified handoff can satisfy a
local dependency while Jira is still open. When the dependency requires an
external approval, deployment or Jira transition, wait for that observed
event. An inaccessible external prerequisite remains blocked.

Dispatch at the workstream boundary. If one child in a grouped lead brief is
blocked, changed, removed or taken by another owner, hold the entire workstream.
To run its remaining tickets separately, amend the plan and split the brief,
ownership, dependencies and acceptance checks before launching a lead. Continue
independent ready workstreams. Each ready workstream has one lead. Use PM's
lead launch, scoped task lists, worker verification and revision cycle. Leads
return evidence against each assigned key. Syn owns Jira communication.

On resume, open the existing epic plan and workstreams.json, refresh the
child list, and inspect each workstream's project-specs.md, validation evidence
and scoped task_status. Check the original session for live leads or leases.
Rejoin a live lead. If another person owns the work, confirm the handoff before
taking over. An in-progress Jira status alone neither proves a lead is running
nor prevents an agreed continuation. Resolve uncertain ownership before dispatch.

Give a returning lead its original workstream scope. If a manifest is already
registered, continue from its verified results and ready cards without calling
tasks_set again. Re-registering resets task state. If the original session
state is unavailable, reconcile the recorded evidence and ownership before
planning the remaining work. Preserve previously verified results and their
artifacts, and record externally completed issues with their source.

For a material change to the approved scope or dependencies, follow the
amendment procedure. {{protocol plan_drift}} Syn records the proposed change
by issue key and requests a fresh phase gate with id `syn-amend-<n>`, using
the next unused number. The original PM plan gate cannot approve new scope.
Wait for the user's decision on this amendment before applying changes or
dispatching affected work. After approval, update the affected workstream
specs, groups and briefs. When a started manifest must be replaced, the lead
uses its original scope and the confirmed amendment_gate for the remaining
cards. Preserve the prior verification evidence in the project record.

Update the ticket mapping after each group with validation results and artifact
paths, keeping local implementation status separate from observed Jira status.

At integration review, check every included child's acceptance criteria and the
epic's cross-workstream outcome. Report verified, externally completed, blocked
and outstanding work by key. A finished lead alone does not satisfy an epic.
When the user authorizes a progress comment and `jira_context` reports
writeback enabled, use `tasks.update` after a confirmed gate and follow
the external writes protocol. {{protocol external_writes}} Report the
observed result separately from verification. Leave open issues visible even if
the local execution group has finished.
