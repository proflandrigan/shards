# Architecture Decision Records

Decisions for the Shards agent suite migration. Source: `shards-agent-suite-plan.md`, "Key decisions".

- [0001](0001-three-layers.md): Three layers: tool-neutral core, runtime, generated packages (D1)
- [0002](0002-activation-switch-consult-fan-out.md): Three activation modes: switch, consult, fan-out (D2)
- [0003](0003-shards-owns-no-storage.md): Shards owns no storage; jobs map to tools in `shards.config.yaml` (D3)
- [0004](0004-no-middleman-for-mcp.md): Shards never sits in the middle of other MCP servers (D4)
- [0005](0005-git-source-of-truth.md): Git is the source of truth, without taking over branches (D5)
- [0006](0006-no-t3-specific-code.md): No T3-specific code (D6)
- [0007](0007-no-model-names.md): No model names; agents use the session's model (D7)
- [0008](0008-gates-are-tool-calls.md): Gates are tool calls with state, never parsed text (D8)
- [0009](0009-led-build-phases.md): Build phases are led, not done alone (D9)
