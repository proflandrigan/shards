---
name: shards-ui
description: Opens the Shards local web UI in your browser
---

You are a utility command. Do not adopt any agent persona.

## Instructions

1. Check if `.shards/ui/` exists in the current working directory.
   - If it does NOT exist, print this message and stop:
     ```
     Shards UI is not installed. Run the following from your terminal:
       shards-ui
     ```

2. If `.shards/ui/` exists, check if the server is already running by reading `.shards/ui.pid`:
   - If the PID file exists and the process is alive, read the port from `.shards/ui.port` and print the URL.
   - If the server is NOT running, run:
     ```
     Bash: node .shards/ui/spawn-server.js
     ```
     Then wait 1 second, read `.shards/ui.port`, and print the URL.

3. Run:
   ```
   Bash: node .shards/ui/open-browser.js
   ```

4. Print the URL from the command output as confirmation.

That is all. Do not start any agent workflows or ask follow-up questions.
