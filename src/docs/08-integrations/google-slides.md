# Google Slides (Syn Slides Mode)

Syn's `[SL]` Slides Mode builds Google Slides decks directly. It's a Syn-native
mode (no specialist handoff) that drafts a slide-by-slide outline, polls the
relevant specialists for content gut-checks at two checkpoints, and uses a
Google Slides MCP to create and iterate on the deck.

This is the first **Integrations** page — a section reserved for Shards modes
that depend on external MCP servers.

---

## What it does

Slides Mode is for readout-style decks: exec briefings, study findings,
post-project demos, technical peer reviews. It is not for training material
or book-length presentations (slides over 40 hard-escalate; over 25 soft-warn).

Eight steps in the mode body, two gates:

1. **Intake** — audience, purpose, source material, scope, tone, MCP availability
2. **Outline draft** — Syn writes slide-by-slide outline directly into the spec doc
3. **Outline review** — parallel Task calls to relevant specialists (BI Engineer, Data Analyst, ML Engineer, etc., depending on source material), each returning GOOD / CAUTION / TOO COMPLEX
4. **Plan & gate** — show user the revised outline + verdicts; gate before any MCP write
5. **Build** — call the MCP's `create_presentation` and `batch_update_presentation` tools
6. **Build review** — second polling round; BI Engineer always, plus the Step 3 specialist for fidelity check
7. **Iterate (optional)** — if Step 6 flagged issues, gate before applying revisions
8. **Wrap** — finalize spec doc, optionally append a `## Presentation` block to the source project's `project-specs.md`

Each polling round is a single message with multiple parallel `Task` blocks,
mirroring Brainstorm Mode's pattern. Each specialist response is appended
verbatim to the spec doc as it returns.

The mode is **MCP-agnostic** — Syn detects available Slides tools by suffix
(`create_presentation`, `batch_update_presentation`, `get_presentation`)
regardless of which server's namespace they live under.

---

## Setup

Slides Mode requires a Google Slides MCP configured in your **user-level**
`~/.claude/settings.json`, not the project-level `.claude/settings.json`.
Shards manages project settings for hooks and permissions; MCPs are a
per-user concern.

### Recommended servers

| Server | Notes |
|---|---|
| **Google's official Workspace MCP** | First-party, most durable choice. Supports Slides, Docs, Sheets, Drive, Gmail, Calendar in one server. |
| `taylorwilsdon/google_workspace_mcp` | Comprehensive community MCP covering all of Workspace. |
| `matteoantoci/google-slides-mcp` | Slides-only, leaner footprint. |
| Composio / StackOne | Hosted options that handle OAuth and token refresh for you. |

Slides Mode does not care which one you pick — it discovers tools at runtime.
Pick whichever fits your auth posture and breadth needs.

### Example configuration

Add an `mcpServers` block to `~/.claude/settings.json` (substitute the
command, args, and env for your chosen server's docs):

```json
{
  "mcpServers": {
    "google_workspace": {
      "command": "uvx",
      "args": ["google-workspace-mcp"],
      "env": {
        "GOOGLE_OAUTH_CLIENT_ID": "...",
        "GOOGLE_OAUTH_CLIENT_SECRET": "..."
      }
    }
  }
}
```

First-time use will trigger a Google OAuth flow in your browser. Slides Mode
detects auth-not-authenticated errors and surfaces the auth flow URL clearly
rather than failing silently.

---

## Specialist polling routing

Step 3 (outline review) routes to specialists based on source material:

| Source / topic | Always poll | Add when |
|---|---|---|
| ML model / training run | ml-engineer, data-scientist | + academic if user-facing |
| Data analysis / EDA | data-analyst, researcher | + data-scientist if includes modelling claims |
| Dashboard / BI tool | bi-engineer, data-analyst | — |
| Pipeline / infra / mart | data-engineer or analytics-engineer, mlops-engineer | + data-modeller if grain/schema in scope |
| LLM / RAG / agent system | ai-engineer | + academic for ethics; + researcher for eval methodology |
| DL architecture / novel framework | deep-learning-engineer, applied-ml-scientist | — |
| **Always optionally poll** | **academic** | for cognitive load, audience fit, message clarity |

The academic shard is worth pulling in any time the audience is non-technical
or external — it specializes in cognitive load and message clarity.

Step 6 (build review) is lighter: BI Engineer always (visual layout, density),
plus the Step 3 domain specialist for a fidelity check.

### Trivial-deck exception

≤5 slides AND internal status / agenda format → both polling rounds skip.
Syn announces "Light enough I don't need a domain gut-check — going straight
to build" and proceeds directly to the gate.

---

## Output

Each deck lives in `presentations/<deck_slug>/`:

| File | Contents |
|---|---|
| `presentation-spec.md` | The single decision document — intake, outline v1, review round 1, approved outline, build log, review round 2, wrap. Gate-bearing artifact. |
| `slides-url.txt` | Plain text URL of the created deck (one line, easy re-open). |
| `iterations.md` | Optional. Created on the first Step 7 revision pass. Each `## Pass N — <date>` block lists what changed and which feedback drove it. |

`<deck_slug>` is slug-cased from the deck purpose (e.g., `q1-churn-readout`,
`rag-prototype-demo`).

If the deck originated from an existing Shards project, Step 8 offers to
append a `## Presentation` block to that project's `project-specs.md` with
the slides URL and date — closes the loop between specialist work and
stakeholder readout.

---

## Limitations (v1)

- **No image / chart insertion.** Where the outline references a chart, Syn
  inserts `[CHART: <description>]` placeholder text. Build Log lists the slide
  numbers that need manual chart drops. Most Slides MCPs support text but
  image-insert APIs vary; v2 may add screenshot-based chart embedding.
- **No theme / template selection beyond defaults.** Syn does not currently
  pick brand templates. v2 candidate.
- **Slide count cap.** >40 slides hard-escalates (split into multiple decks);
  >25 slides soft-warns. Slides Mode is for readout decks, not training
  material.

---

## Troubleshooting

**"I don't see a Google Slides MCP configured"** — Slides Mode could not find
a tool with `create_presentation` in its name. Confirm your MCP is in
`~/.claude/settings.json` (not the project-level settings.json), and restart
Claude Code so it picks up the new server. If still missing, run a `/mcp`
diagnostic to see what's loaded.

**OAuth flow loops** — most MCPs cache auth tokens locally. If the OAuth flow
keeps prompting, delete the local token cache (path varies per server) and
retry.

**Quota errors** — Google Slides API has per-project quotas. If you hit a
quota mid-build, Slides Mode logs partial state to `iterations.md` and asks
how to proceed.

**Tool name mismatch** — Slides Mode matches by suffix. If your MCP exposes
something nonstandard like `mcp__foo__createSlidesDeck` instead of
`create_presentation`, you may need to use the official MCP or a server that
follows the standard naming. Open an issue if you hit this with a major
server.

---

## How to invoke

From a `/shards` session, type `SL` to enter Slides Mode. There is no
separate `/slides` command — Syn-native modes (Fixer, PM, Slides) are
accessed via the menu, consistent with the rest of the suite.
