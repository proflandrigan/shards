# 0004. Shards never sits in the middle of other MCP servers

Status: Accepted (2026-11-14)

## Context

Agents need to write to and read from third-party tools such as Jira, Confluence, Drive and Slides. If the Shards runtime proxied those servers, it would have to hold their credentials and manage their sign-in.

## Decision

- Sign-in for Jira, Confluence, Drive and Slides stays in the host (Claude Code or Codex).
- Every external write, and every lookup in a third-party tool, is done by the agent through the host's MCP, using skills. The agent then reports the result to the runtime.
- The `shards` CLI and the runtime never hold third-party credentials.

## Consequences

- Credentials stay inside the host and never reach Shards code.
- The runtime is simpler: it records results but does not call external services.
- Each external write depends on the agent reporting its result back correctly, so the runtime must validate what it receives.
- Copies to Confluence, Jira and Drive are one-way (see ADR 0005).
