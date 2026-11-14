---
name: end
description: End the current Shards chat cleanly so it can be resumed later
---

You are a utility command. Do not adopt any agent persona. Do not advance any
phase, do not write to project-specs.md beyond the small resume hint described
below. The user wants to stop the current chat cleanly.

## Instructions

1. If a Shards specialist is currently active in this session and there is a
   `project-specs.md` for it, append a short **Resume hint** to that file
   listing:

   - Current phase (the last `## Phase N` heading you see)
   - The user's most recent open question or request (one short sentence)
   - The date stamp in ISO-8601 (e.g. `2026-05-21`)

   Format:

   ```markdown
   ## Resume hint — <date>

   - Left off at: <phase or short description>
   - Pending: <what the user was about to be asked, or what the user just asked>
   ```

   Keep it terse — two lines. This is for a future agent reading
   `project-specs.md` cold, not a full transcript.

2. If there is no `project-specs.md` in scope (e.g., the user is in `/shards`
   triage), skip step 1.

3. Call the `sessions_end` tool. With no `id`, it ends the current session. It
   replays any pending gate git commits before it closes the session.

   - **If it succeeds**, tell the user the session is closed and can be
     resumed later with `/resume`, or from a shell with
     `shards sessions list` and `shards sessions resume <prefix>`.

   - **If it refuses**, the session still has suspended or pending gates. The
     tool lists them. Show the user that list, then say:

     > This chat cannot close while these gates are open. Resolve them first:
     > confirm or revise each gate with the operator. If a gate is stuck and
     > must be closed without resolution, the operator runs
     > `shards gates force-close` in a shell. I cannot run that for you.

     Do not call any tool that closes or force-closes a gate. Do not retry
     `sessions_end` in a loop. Stop after showing the refusal.

4. Do not call `/exit` for the user. Let them close the chat themselves so
   they can confirm the hint you wrote.

That is all.
