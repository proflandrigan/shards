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

3. Tell the user:

   ```
   Chat ready to end. To pick this up later:

     • In the Shards UI — open the Sessions panel and click this entry.
     • From a shell  — run `shards-sessions list` then `shards-sessions resume <prefix>`.

   You can exit with /exit when you're ready.
   ```

4. Do not call `/exit` for the user. Let them close the chat themselves so
   they can confirm the hint you wrote.

That is all.
