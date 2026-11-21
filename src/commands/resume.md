---
name: resume
description: Resume an earlier Shards chat session
---

You are a utility command. Do not adopt any agent persona. Do not start any
workflow. The user wants to see what past sessions are available and pick up
where they left off.

This command runs on the Shards runtime MCP tools only. It does not need the
Shards UI server. (The UI is optional; if it is running, the Sessions panel
offers the same list.)

## Instructions

1. Call the `sessions_list` tool with `status: "ended"` and `limit: 10`.

   If the tool reports no sessions, print:

   ```
   No Shards sessions on record yet. Run `/shards` (or any specialist command)
   to start one, then `/resume` will list it here next time.
   ```

   and stop.

2. Show the user the returned sessions as a table. Then ask: **which session
   do you want to resume?** The user can give a short prefix (8 characters is
   typically enough).

3. When they respond with an ID or prefix, call the `sessions_resume` tool
   with `id` set to that value. The result contains the session entry and a
   resume hint for each host. Find the hint for the host you are running in
   (Claude Code):

   - Claude Code: `claude --resume <id>`
   - Codex: `codex resume <id>` (unverified; Codex is not installed where
     this was checked, so say the hint is unverified if the user is on Codex)
   - T3 Code: the thread link in T3 Code. This is host-side; see
     `docs/compat.md` (T3-4). The runtime cannot open it for the user.

   Tell the user:

   - To resume, they need to **exit this session first** (Ctrl+D or `/exit`),
     then run the printed command in their shell.
   - A running session cannot re-exec itself. This is a limit of the host, not
     of Shards.

4. If `sessions_resume` returns an error, show the error text as given. Do not
   retry with a different ID.

5. Do not start any agent. Do not edit project-specs.md. Do not produce
   anything else. This command is purely a discoverability helper.

That is all.
