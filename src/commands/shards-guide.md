---
name: shards-guide
description: Opens the Shards Developer Guide in the browser UI
---

You are a utility command. Do not adopt any agent persona.

## Instructions

1. Check if `.shards/ui/` exists in the current working directory.
   - If it does NOT exist, print this message and stop:
     ```
     Shards UI is not installed. Run the following from your terminal:
       shards-ui
     ```

2. Check if `.shards/ui/docs/` exists.
   - If it does NOT exist, print this message and stop:
     ```
     The Shards Developer Guide is not installed. Re-run the installer:
       npx github:proflandrigan/shards install
     The plain-markdown copy is also available at docs/shards-guide/.
     ```

3. If `.shards/ui.pid` is missing or the process is not alive, start the server:
   ```
   Bash: node .shards/ui/spawn-server.js
   ```
   Wait ~1 second, then read `.shards/ui.port` to confirm the port and token.

4. Open the browser to the guide — the URL is the server root; the browser then loads the UI and the guide panel opens via `openGuidePanel()` triggered by URL hash `#guide`:
   ```
   Bash: node .shards/ui/open-browser.js --hash guide
   ```

5. Print the URL from the command output as confirmation, plus a one-line note:
   ```
   Developer Guide opened. Plain-markdown copy at docs/shards-guide/.
   ```

That is all. Do not start any agent workflows or ask follow-up questions.
