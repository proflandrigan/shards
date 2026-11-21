# 0007. No model names in agents

Status: Accepted (2026-11-14)

## Context

Every agent currently hardcodes `model: opus-4.8` in its frontmatter (15 files). This ties the agents to one model and makes model changes a source edit.

## Decision

- Agents use the model of the session they run in.
- Tier hints take effect only when the user maps them to a model.

## Consequences

- Removing the hardcoded model lets the same agents run on any model the host provides.
- Cost and capability are chosen by the user, not by the agent definitions.
- Tier hints in `agent.yaml` (`model_tier?`) have no effect until the user configures a mapping, so behavior without a mapping is the session default.
- Changing the default model requires no change to agent source.
