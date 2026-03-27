# Shards UI Glassmorphic Aesthetic Update

## Context

The Shards web UI currently uses an opaque dark-panel design. The goal is to introduce a "crystalline/prismatic" glassmorphism design language that makes overlays, chat messages, and pinned context feel like translucent shards of data floating over the workspace. This is informed by four HTML mocks: `glassmorphism-mock.html`, `shards-chat-unified-mock.html`, `gathering-mock.html`, and `anxious-ui-mock.html`.

## Files to Modify

| File | Changes |
|------|---------|
| `src/ui/css/base.css` | CSS variables, shimmer keyframe, glassmorphic context menu |
| `src/ui/css/layout.css` | Glassmorphic overlay panel/backdrop/items |
| `src/ui/css/chat.css` | Glass messages, gathering animation, pinboard glass, AI Engineer personality, accent sync |
| `src/ui/css/theme-light.css` | Light theme overrides for all glass elements |
| `src/ui/js/agents.js` | Set `--current-accent` CSS var + `data-agent` attr in `activateAgent()` |
| `src/ui/js/chat.js` | Add `.gathering` class to new assistant messages + AI Engineer glitch trigger |

---

## P0 -- Glassmorphic Overlays [DONE]

### Task P0.1: Add CSS custom properties and shimmer keyframe [DONE]

**File:** `src/ui/css/base.css` -- add after the `* { box-sizing... }` reset

```css
:root {
  --glass-bg: rgba(15, 15, 30, 0.6);
  --glass-border: rgba(255, 255, 255, 0.1);
  --glass-blur: 20px;
  --glass-gradient-border: linear-gradient(135deg, rgba(255,255,255,0.12), transparent 50%, rgba(255,255,255,0.12));
  --shard-clip: polygon(2% 0%, 100% 0%, 98% 100%, 0% 100%);
  --shimmer-opacity: 0.04;
  --current-accent: #3860c0;
}

@property --current-accent {
  syntax: '<color>';
  inherits: true;
  initial-value: #3860c0;
}

@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

### Task P0.2: Glassmorphic overlay panel [DONE]

**File:** `src/ui/css/layout.css` -- modify existing `.overlay-*` selectors (lines 181-253)

Replace `.overlay-backdrop` background:
```css
.overlay-backdrop {
  /* existing positioning unchanged */
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
```

Replace `.overlay-panel`:
```css
.overlay-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  width: 520px;
  max-width: 90vw;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
  clip-path: var(--shard-clip);
  overflow: hidden;
  position: relative;
}
```

Add shimmer pseudo-element:
```css
.overlay-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(45deg, transparent 40%, rgba(255,215,0, var(--shimmer-opacity)) 50%, transparent 60%);
  background-size: 200% 100%;
  animation: shimmer 8s infinite linear;
  pointer-events: none;
  z-index: 1;
}
```

Update `.overlay-input`:
- Background: `rgba(10, 10, 20, 0.4)` (was `#0a0a14`)
- Border-bottom: `1px solid rgba(255,255,255,0.06)` (was `#1e1e32`)
- `:focus` border color: `var(--current-accent)` (was `#3860c0`)

Update `.overlay-item:hover, .overlay-item.active`:
- Background: `rgba(255, 215, 0, 0.08)` (was `#151528`)
- Add: `border-left: 2px solid var(--current-accent)`
- Add `padding-left: 14px` to compensate (was 16px total, now 14px + 2px border)

Add to `.overlay-item` base:
- `border-left: 2px solid transparent`
- `transition: all 0.15s ease`

### Task P0.3: Glassmorphic context menu [DONE]

**File:** `src/ui/css/base.css` -- modify `.ctx-menu` (lines 21-31) and `.ctx-item:hover` (line 40)

`.ctx-menu` changes:
- Background: `var(--glass-bg)` (was `#0e0e1a`)
- Add: `backdrop-filter: blur(var(--glass-blur))` + webkit prefix
- Border: `1px solid var(--glass-border)` (was `#1e1e32`)
- Add: `clip-path: var(--shard-clip)`

`.ctx-item:hover` changes:
- Background: `rgba(255, 215, 0, 0.08)` (was `#161628`)

### Task P0.4: Light theme glass overrides [DONE]

**File:** `src/ui/css/theme-light.css`

Add at the top (line 2, after `[data-theme="light"] { color-scheme: light; }`):
```css
[data-theme="light"] {
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-border: rgba(0, 0, 0, 0.08);
  --glass-gradient-border: linear-gradient(135deg, rgba(0,0,0,0.06), transparent 50%, rgba(0,0,0,0.06));
  --shimmer-opacity: 0.03;
}
```

Update existing light overlay overrides (lines 273-282):
- `.overlay-backdrop` background: `rgba(0,0,0,0.15)`
- `.overlay-panel` box-shadow: `0 8px 32px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.5)`
- `.overlay-input` background: `rgba(245, 245, 248, 0.5)`
- `.overlay-item:hover/.active` background: `rgba(56, 96, 192, 0.08)`

Update light context menu override (line 222):
- `.ctx-item:hover` background: `rgba(56, 96, 192, 0.08)`

---

## P1 -- Glassmorphic Chat Messages

### Task P1.1: Glass assistant & user message bubbles

**File:** `src/ui/css/chat.css`

Replace `.message.assistant .message-bubble` (line 109):
```css
.message.assistant .message-bubble {
  background: rgba(20, 20, 35, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.08);
  border-left: 3px solid #2a2a40; /* overridden inline by JS with agent color */
  color: #c0c0d0;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  position: relative;
}
```

Replace `.message.user .message-bubble` (line 103):
```css
.message.user .message-bubble {
  background: rgba(19, 19, 32, 0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #a0a0b8;
  border: 1px solid rgba(255,255,255,0.06);
  white-space: pre-wrap;
}
```

**Note:** Intentionally NOT adding `clip-path` to chat messages to avoid content clipping on long messages. The glass effect alone (backdrop-filter + semi-transparent background) is sufficient. Clip-path is reserved for overlays and pin chips where content is short and predictable.

### Task P1.2: Gathering animation for new messages

**File:** `src/ui/css/chat.css` -- add near the thinking-indicator section (~line 160)

```css
/* ─── Gathering animation for new messages ─────────────── */
@keyframes gather-msg {
  0%   { transform: translateX(-30px) scale(0.95); opacity: 0; filter: blur(8px); }
  100% { transform: translateX(0) scale(1); opacity: 1; filter: blur(0); }
}
.message.assistant.gathering .message-bubble {
  animation: gather-msg 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

### Task P1.3: Apply `.gathering` class in JS

**File:** `src/ui/js/chat.js`

In the function that creates a new assistant message DOM element (search for where `div.className = 'message ' +` is set for assistant messages in `addMessageDirect`), add `gathering` to the class:
```js
div.className = 'message ' + (role === 'user' ? 'user' : 'assistant gathering');
```

After the message is appended to the DOM, remove the class after animation completes:
```js
if (role !== 'user') {
  setTimeout(function() { div.classList.remove('gathering'); }, 600);
}
```

Also apply this in the streaming path -- wherever a pending assistant bubble is first created in the DOM.

### Task P1.4: Glass pinboard and pin chips

**File:** `src/ui/css/chat.css`

Modify `#pinboard` (line 1028):
- Background: `rgba(255, 255, 255, 0.03)` (was `#0a0a16`)
- Add: `backdrop-filter: blur(10px)` + webkit prefix
- Border: `1px solid rgba(255,255,255,0.06)` (was `#1e1e32`)

Modify `.pin-chip` (line 1107):
- Background: `rgba(19, 19, 32, 0.6)` (was `#131320`)
- Border: `1px solid rgba(255,255,255,0.08)` (was `#1e1e32`)
- Add: `clip-path: polygon(3% 0%, 100% 0%, 97% 100%, 0% 100%)` (subtle shear on small chips)

### Task P1.5: Light theme glass messages and pinboard

**File:** `src/ui/css/theme-light.css`

Update existing overrides (lines 77-78):
```css
[data-theme="light"] .message.assistant .message-bubble {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border-color: rgba(0,0,0,0.08);
  border-left-color: #c0c0d0;
  color: #333;
  box-shadow: 0 4px 16px rgba(0,0,0,0.06);
}
[data-theme="light"] .message.user .message-bubble {
  background: rgba(232, 234, 246, 0.6);
  backdrop-filter: blur(6px);
  color: #333;
  border-color: rgba(0,0,0,0.06);
}
```

Update pinboard overrides (lines 389-399):
```css
[data-theme="light"] #pinboard {
  background: rgba(255,255,255,0.5);
  backdrop-filter: blur(10px);
  border-color: rgba(0,0,0,0.08);
}
[data-theme="light"] .pin-chip {
  background: rgba(255,255,255,0.7);
  border-color: rgba(0,0,0,0.1);
  color: #333;
}
```

---

## P2 -- Agent Persona Color Sync

### Task P2.1: Set `--current-accent` in `activateAgent()`

**File:** `src/ui/js/agents.js` -- modify `activateAgent()` (line 23)

```js
function activateAgent(agentKey) {
  currentAgent = agentKey;
  var info = AGENTS[agentKey] || { color: '#3860c0' };
  document.documentElement.style.setProperty('--current-accent', info.color);
  document.documentElement.setAttribute('data-agent', agentKey || '');
}
```

The `data-agent` attribute enables CSS-only personality rules (used by P3).

### Task P2.2: Chat input focus uses `--current-accent`

**File:** `src/ui/css/chat.css` -- modify `#chat-input:focus` (line 576)

```css
#chat-input:focus {
  border-color: var(--current-accent);
}
```

### Task P2.3: Pinboard label uses `--current-accent`

**File:** `src/ui/css/chat.css` -- modify `.pinboard-label` (line 1083)

```css
.pinboard-label {
  /* ... existing size/spacing rules ... */
  color: var(--current-accent);
  opacity: 0.7;
}
```

---

## P3 -- AI Engineer "Anxious" Personality Cues (Stretch)

### Task P3.1: Jitter and glitch CSS

**File:** `src/ui/css/chat.css` -- add at bottom

```css
/* ─── AI Engineer anxious personality ──────────────────── */
@keyframes text-jitter {
  0%, 94% { transform: translate(0); }
  95% { transform: translate(-0.5px, 0.5px); }
  97% { transform: translate(0.5px, -0.3px); }
  99% { transform: translate(-0.3px, 0); }
  100% { transform: translate(0); }
}

@keyframes chromatic-split {
  0%, 100% { text-shadow: none; }
  50% { text-shadow: 1px 0 rgba(255,0,50,0.2), -1px 0 rgba(0,100,255,0.2); }
}

[data-agent="ai-engineer"] .message.assistant:last-child .message-bubble {
  animation: text-jitter 5s step-end infinite;
}

.message-bubble.glitch-active {
  animation: chromatic-split 0.3s ease 1 !important;
}
```

Note: Only the last assistant message jitters (`:last-child`) to avoid distracting old messages.

### Task P3.2: Micro-glitch trigger in JS

**File:** `src/ui/js/chat.js` -- in `addMessageDirect`, after appending the assistant message div

```js
if (role !== 'user' && currentAgent === 'ai-engineer' && Math.random() < 0.3) {
  var bubble = div.querySelector('.message-bubble');
  if (bubble) {
    setTimeout(function() {
      bubble.classList.add('glitch-active');
      setTimeout(function() { bubble.classList.remove('glitch-active'); }, 300);
    }, 800 + Math.random() * 2000);
  }
}
```

30% chance of a brief chromatic glitch, 0.8-2.8s after render.

---

## Implementation Order

```
P0.1 (CSS vars)  ─── must be first, all tasks depend on these
  |
  ├── P0.2 (overlay panel)  ──┐
  ├── P0.3 (context menu)     ├── P0.4 (light theme)
  ├── P2.1 (activateAgent JS) │
  │    ├── P2.2 (input accent) │
  │    └── P2.3 (pinboard accent)
  │
  ├── P1.1 (glass messages)  ─┤
  ├── P1.2 (gather keyframe)  ├── P1.5 (light theme messages)
  ├── P1.4 (glass pinboard)  ─┘
  │
  └── P1.3 (gathering JS) ─── depends on P1.2
       │
       └── P3.1 + P3.2 (AI Engineer personality) ─── stretch, do last
```

## Verification

1. Run `node tools/install.js` from the repo root to install updated files
2. Run `node tools/shards-ui.js` to start the UI server
3. Open in browser and verify:
   - **P0:** Press Cmd+P (Quick Open) and Cmd+K (Command Palette) -- panels should have frosted glass background, subtle sheared corners, shimmer sweep, and gold-tinted hover states. Right-click a file for context menu -- same treatment.
   - **P1:** Send a message -- assistant reply should slide in with gathering animation. Message bubbles should have translucent glass backgrounds. Pinboard chips should have subtle sheared shape.
   - **P2:** Switch agents (start a new session with a different agent) -- chat input border focus color should match agent color. Pinboard label tints to agent color.
   - **P3:** Start an AI Engineer session -- last assistant message should have subtle text jitter. ~30% of messages get a brief chromatic flash.
   - **Theme:** Toggle to light theme (Cmd+, > Theme) -- all glass effects should use lighter, more opaque variants. No elements should become invisible or unreadable.

## Performance Notes

- `backdrop-filter: blur()` on chat messages could slow scrolling in very long conversations. If jank is observed, reduce to `blur(6px)` or remove from user messages entirely.
- `clip-path` on overlays is fine (few elements). Skip it on chat messages to avoid content clipping.
- The shimmer animation only runs on overlay panels (hidden when not visible).
# Shards UI Glassmorphic Aesthetic Update

## Context

The Shards web UI currently uses an opaque dark-panel design. The goal is to introduce a "crystalline/prismatic" glassmorphism design language that makes overlays, chat messages, and pinned context feel like translucent shards of data floating over the workspace. This is informed by four HTML mocks: `glassmorphism-mock.html`, `shards-chat-unified-mock.html`, `gathering-mock.html`, and `anxious-ui-mock.html`.

## Files to Modify

| File | Changes |
|------|---------|
| `src/ui/css/base.css` | CSS variables, shimmer keyframe, glassmorphic context menu |
| `src/ui/css/layout.css` | Glassmorphic overlay panel/backdrop/items |
| `src/ui/css/chat.css` | Glass messages, gathering animation, pinboard glass, AI Engineer personality, accent sync |
| `src/ui/css/theme-light.css` | Light theme overrides for all glass elements |
| `src/ui/js/agents.js` | Set `--current-accent` CSS var + `data-agent` attr in `activateAgent()` |
| `src/ui/js/chat.js` | Add `.gathering` class to new assistant messages + AI Engineer glitch trigger |

---

## P0 -- Glassmorphic Overlays [DONE]

### Task P0.1: Add CSS custom properties and shimmer keyframe [DONE]

**File:** `src/ui/css/base.css` -- add after the `* { box-sizing... }` reset

```css
:root {
  --glass-bg: rgba(15, 15, 30, 0.6);
  --glass-border: rgba(255, 255, 255, 0.1);
  --glass-blur: 20px;
  --glass-gradient-border: linear-gradient(135deg, rgba(255,255,255,0.12), transparent 50%, rgba(255,255,255,0.12));
  --shard-clip: polygon(2% 0%, 100% 0%, 98% 100%, 0% 100%);
  --shimmer-opacity: 0.04;
  --current-accent: #3860c0;
}

@property --current-accent {
  syntax: '<color>';
  inherits: true;
  initial-value: #3860c0;
}

@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

### Task P0.2: Glassmorphic overlay panel [DONE]

**File:** `src/ui/css/layout.css` -- modify existing `.overlay-*` selectors (lines 181-253)

Replace `.overlay-backdrop` background:
```css
.overlay-backdrop {
  /* existing positioning unchanged */
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
```

Replace `.overlay-panel`:
```css
.overlay-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  width: 520px;
  max-width: 90vw;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
  clip-path: var(--shard-clip);
  overflow: hidden;
  position: relative;
}
```

Add shimmer pseudo-element:
```css
.overlay-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(45deg, transparent 40%, rgba(255,215,0, var(--shimmer-opacity)) 50%, transparent 60%);
  background-size: 200% 100%;
  animation: shimmer 8s infinite linear;
  pointer-events: none;
  z-index: 1;
}
```

Update `.overlay-input`:
- Background: `rgba(10, 10, 20, 0.4)` (was `#0a0a14`)
- Border-bottom: `1px solid rgba(255,255,255,0.06)` (was `#1e1e32`)
- `:focus` border color: `var(--current-accent)` (was `#3860c0`)

Update `.overlay-item:hover, .overlay-item.active`:
- Background: `rgba(255, 215, 0, 0.08)` (was `#151528`)
- Add: `border-left: 2px solid var(--current-accent)`
- Add `padding-left: 14px` to compensate (was 16px total, now 14px + 2px border)

Add to `.overlay-item` base:
- `border-left: 2px solid transparent`
- `transition: all 0.15s ease`

### Task P0.3: Glassmorphic context menu [DONE]

**File:** `src/ui/css/base.css` -- modify `.ctx-menu` (lines 21-31) and `.ctx-item:hover` (line 40)

`.ctx-menu` changes:
- Background: `var(--glass-bg)` (was `#0e0e1a`)
- Add: `backdrop-filter: blur(var(--glass-blur))` + webkit prefix
- Border: `1px solid var(--glass-border)` (was `#1e1e32`)
- Add: `clip-path: var(--shard-clip)`

`.ctx-item:hover` changes:
- Background: `rgba(255, 215, 0, 0.08)` (was `#161628`)

### Task P0.4: Light theme glass overrides [DONE]

**File:** `src/ui/css/theme-light.css`

Add at the top (line 2, after `[data-theme="light"] { color-scheme: light; }`):
```css
[data-theme="light"] {
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-border: rgba(0, 0, 0, 0.08);
  --glass-gradient-border: linear-gradient(135deg, rgba(0,0,0,0.06), transparent 50%, rgba(0,0,0,0.06));
  --shimmer-opacity: 0.03;
}
```

Update existing light overlay overrides (lines 273-282):
- `.overlay-backdrop` background: `rgba(0,0,0,0.15)`
- `.overlay-panel` box-shadow: `0 8px 32px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.5)`
- `.overlay-input` background: `rgba(245, 245, 248, 0.5)`
- `.overlay-item:hover/.active` background: `rgba(56, 96, 192, 0.08)`

Update light context menu override (line 222):
- `.ctx-item:hover` background: `rgba(56, 96, 192, 0.08)`

---

## P1 -- Glassmorphic Chat Messages

### Task P1.1: Glass assistant & user message bubbles

**File:** `src/ui/css/chat.css`

Replace `.message.assistant .message-bubble` (line 109):
```css
.message.assistant .message-bubble {
  background: rgba(20, 20, 35, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.08);
  border-left: 3px solid #2a2a40; /* overridden inline by JS with agent color */
  color: #c0c0d0;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  position: relative;
}
```

Replace `.message.user .message-bubble` (line 103):
```css
.message.user .message-bubble {
  background: rgba(19, 19, 32, 0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #a0a0b8;
  border: 1px solid rgba(255,255,255,0.06);
  white-space: pre-wrap;
}
```

**Note:** Intentionally NOT adding `clip-path` to chat messages to avoid content clipping on long messages. The glass effect alone (backdrop-filter + semi-transparent background) is sufficient. Clip-path is reserved for overlays and pin chips where content is short and predictable.

### Task P1.2: Gathering animation for new messages

**File:** `src/ui/css/chat.css` -- add near the thinking-indicator section (~line 160)

```css
/* ─── Gathering animation for new messages ─────────────── */
@keyframes gather-msg {
  0%   { transform: translateX(-30px) scale(0.95); opacity: 0; filter: blur(8px); }
  100% { transform: translateX(0) scale(1); opacity: 1; filter: blur(0); }
}
.message.assistant.gathering .message-bubble {
  animation: gather-msg 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

### Task P1.3: Apply `.gathering` class in JS

**File:** `src/ui/js/chat.js`

In the function that creates a new assistant message DOM element (search for where `div.className = 'message ' +` is set for assistant messages in `addMessageDirect`), add `gathering` to the class:
```js
div.className = 'message ' + (role === 'user' ? 'user' : 'assistant gathering');
```

After the message is appended to the DOM, remove the class after animation completes:
```js
if (role !== 'user') {
  setTimeout(function() { div.classList.remove('gathering'); }, 600);
}
```

Also apply this in the streaming path -- wherever a pending assistant bubble is first created in the DOM.

### Task P1.4: Glass pinboard and pin chips

**File:** `src/ui/css/chat.css`

Modify `#pinboard` (line 1028):
- Background: `rgba(255, 255, 255, 0.03)` (was `#0a0a16`)
- Add: `backdrop-filter: blur(10px)` + webkit prefix
- Border: `1px solid rgba(255,255,255,0.06)` (was `#1e1e32`)

Modify `.pin-chip` (line 1107):
- Background: `rgba(19, 19, 32, 0.6)` (was `#131320`)
- Border: `1px solid rgba(255,255,255,0.08)` (was `#1e1e32`)
- Add: `clip-path: polygon(3% 0%, 100% 0%, 97% 100%, 0% 100%)` (subtle shear on small chips)

### Task P1.5: Light theme glass messages and pinboard

**File:** `src/ui/css/theme-light.css`

Update existing overrides (lines 77-78):
```css
[data-theme="light"] .message.assistant .message-bubble {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border-color: rgba(0,0,0,0.08);
  border-left-color: #c0c0d0;
  color: #333;
  box-shadow: 0 4px 16px rgba(0,0,0,0.06);
}
[data-theme="light"] .message.user .message-bubble {
  background: rgba(232, 234, 246, 0.6);
  backdrop-filter: blur(6px);
  color: #333;
  border-color: rgba(0,0,0,0.06);
}
```

Update pinboard overrides (lines 389-399):
```css
[data-theme="light"] #pinboard {
  background: rgba(255,255,255,0.5);
  backdrop-filter: blur(10px);
  border-color: rgba(0,0,0,0.08);
}
[data-theme="light"] .pin-chip {
  background: rgba(255,255,255,0.7);
  border-color: rgba(0,0,0,0.1);
  color: #333;
}
```

---

## P2 -- Agent Persona Color Sync

### Task P2.1: Set `--current-accent` in `activateAgent()`

**File:** `src/ui/js/agents.js` -- modify `activateAgent()` (line 23)

```js
function activateAgent(agentKey) {
  currentAgent = agentKey;
  var info = AGENTS[agentKey] || { color: '#3860c0' };
  document.documentElement.style.setProperty('--current-accent', info.color);
  document.documentElement.setAttribute('data-agent', agentKey || '');
}
```

The `data-agent` attribute enables CSS-only personality rules (used by P3).

### Task P2.2: Chat input focus uses `--current-accent`

**File:** `src/ui/css/chat.css` -- modify `#chat-input:focus` (line 576)

```css
#chat-input:focus {
  border-color: var(--current-accent);
}
```

### Task P2.3: Pinboard label uses `--current-accent`

**File:** `src/ui/css/chat.css` -- modify `.pinboard-label` (line 1083)

```css
.pinboard-label {
  /* ... existing size/spacing rules ... */
  color: var(--current-accent);
  opacity: 0.7;
}
```

---

## P3 -- AI Engineer "Anxious" Personality Cues (Stretch)

### Task P3.1: Jitter and glitch CSS

**File:** `src/ui/css/chat.css` -- add at bottom

```css
/* ─── AI Engineer anxious personality ──────────────────── */
@keyframes text-jitter {
  0%, 94% { transform: translate(0); }
  95% { transform: translate(-0.5px, 0.5px); }
  97% { transform: translate(0.5px, -0.3px); }
  99% { transform: translate(-0.3px, 0); }
  100% { transform: translate(0); }
}

@keyframes chromatic-split {
  0%, 100% { text-shadow: none; }
  50% { text-shadow: 1px 0 rgba(255,0,50,0.2), -1px 0 rgba(0,100,255,0.2); }
}

[data-agent="ai-engineer"] .message.assistant:last-child .message-bubble {
  animation: text-jitter 5s step-end infinite;
}

.message-bubble.glitch-active {
  animation: chromatic-split 0.3s ease 1 !important;
}
```

Note: Only the last assistant message jitters (`:last-child`) to avoid distracting old messages.

### Task P3.2: Micro-glitch trigger in JS

**File:** `src/ui/js/chat.js` -- in `addMessageDirect`, after appending the assistant message div

```js
if (role !== 'user' && currentAgent === 'ai-engineer' && Math.random() < 0.3) {
  var bubble = div.querySelector('.message-bubble');
  if (bubble) {
    setTimeout(function() {
      bubble.classList.add('glitch-active');
      setTimeout(function() { bubble.classList.remove('glitch-active'); }, 300);
    }, 800 + Math.random() * 2000);
  }
}
```

30% chance of a brief chromatic glitch, 0.8-2.8s after render.

---

## Implementation Order

```
P0.1 (CSS vars)  ─── must be first, all tasks depend on these
  |
  ├── P0.2 (overlay panel)  ──┐
  ├── P0.3 (context menu)     ├── P0.4 (light theme)
  ├── P2.1 (activateAgent JS) │
  │    ├── P2.2 (input accent) │
  │    └── P2.3 (pinboard accent)
  │
  ├── P1.1 (glass messages)  ─┤
  ├── P1.2 (gather keyframe)  ├── P1.5 (light theme messages)
  ├── P1.4 (glass pinboard)  ─┘
  │
  └── P1.3 (gathering JS) ─── depends on P1.2
       │
       └── P3.1 + P3.2 (AI Engineer personality) ─── stretch, do last
```

## Verification

1. Run `node tools/install.js` from the repo root to install updated files
2. Run `node tools/shards-ui.js` to start the UI server
3. Open in browser and verify:
   - **P0:** Press Cmd+P (Quick Open) and Cmd+K (Command Palette) -- panels should have frosted glass background, subtle sheared corners, shimmer sweep, and gold-tinted hover states. Right-click a file for context menu -- same treatment.
   - **P1:** Send a message -- assistant reply should slide in with gathering animation. Message bubbles should have translucent glass backgrounds. Pinboard chips should have subtle sheared shape.
   - **P2:** Switch agents (start a new session with a different agent) -- chat input border focus color should match agent color. Pinboard label tints to agent color.
   - **P3:** Start an AI Engineer session -- last assistant message should have subtle text jitter. ~30% of messages get a brief chromatic flash.
   - **Theme:** Toggle to light theme (Cmd+, > Theme) -- all glass effects should use lighter, more opaque variants. No elements should become invisible or unreadable.

## Performance Notes

- `backdrop-filter: blur()` on chat messages could slow scrolling in very long conversations. If jank is observed, reduce to `blur(6px)` or remove from user messages entirely.
- `clip-path` on overlays is fine (few elements). Skip it on chat messages to avoid content clipping.
- The shimmer animation only runs on overlay panels (hidden when not visible).
