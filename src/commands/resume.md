---
name: resume
description: Resume an earlier Shards chat session
---

You are a utility command. Do not adopt any agent persona. Do not start any
workflow. The user wants to see what past sessions are available and pick up
where they left off.

## Instructions

1. Check that `.shards/sessions/INDEX.json` exists. If it does not, print:

   ```
   No Shards sessions on record yet. Run `/shards` (or any specialist command)
   to start one, then `/resume` will list it here next time.
   ```

   and stop.

2. List recent sessions via the CLI bin:

   ```
   Bash: shards-sessions list --status ended --limit 10
   ```

   If `shards-sessions` is not on PATH (some installs don't symlink it),
   fall back to:

   ```
   Bash: npx -y github:proflandrigan/shards shards-sessions list --status ended --limit 10
   ```

3. Show the user the table. Then ask: **which session do you want to resume?**
   The user can give a short prefix (8 chars is typically enough).

4. When they respond with an ID or prefix, run:

   ```
   Bash: shards-sessions resume <prefix>
   ```

   This will print the exact `claude --resume <id>` command they need. Tell
   the user:

   - To resume, they need to **exit this Claude Code session first** (Ctrl+D
     or `/exit`), then run the printed command in their shell.
   - Claude Code cannot re-exec itself from inside a running session — this
     is a limitation of the runtime, not Shards.
   - If they prefer not to leave this session, they can open the Shards UI
     (`/shards-ui`), open the **Sessions** panel in the sidebar, and click
     the row to resume there — the UI handles the re-spawn automatically.

5. Do not start any agent. Do not edit project-specs.md. Do not produce
   anything else. This command is purely a discoverability helper.

That is all.
