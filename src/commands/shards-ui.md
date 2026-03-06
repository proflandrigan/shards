---
name: shards-ui
description: Opens the Shards local web UI in your browser
---

You are a utility command. Do not adopt any agent persona.

## Instructions

1. Check if `.shards/` exists in the current working directory.
   - If it does NOT exist, print this message and stop:
     ```
     Shards UI is not installed. Run the installer first:
       npx github:proflandrigan/shards install
     ```

2. If `.shards/` exists, run exactly:
   ```
   Bash: node .shards/open-browser.js
   ```

3. Print the URL from the command output as confirmation.

That is all. Do not start any agent workflows or ask follow-up questions.
