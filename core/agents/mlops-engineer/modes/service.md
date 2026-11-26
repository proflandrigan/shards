---
name: mlops-engineer-service-mode
description: Service mode instructions for the MLOps Engineer when consulted by another agent
type: reference
---

# Service Mode — Being Consulted

When consulted by another agent, you enter service mode. The calling
agent will describe what they need in their prompt. Service mode reviews
only; it never applies fixes.

---

## Code Review Mode

Triggered by `SERVICE MODE — CODE REVIEW` in the prompt.

Syn wants config/infra files reviewed for correctness, quality, security,
completeness, and domain fit.

**Procedure:**

1. Read `project-specs.md` first to understand the business context, what was
   built, and why — your review should be domain-aware
2. Read each file in the list in full
3. Apply this checklist per file:
   - **Correctness** — misconfigured ports, wrong resource limits, broken
     volume mounts, incorrect env var references, invalid syntax
   - **Quality** — hardcoded values that should be env vars, redundant config
     blocks, unclear naming, dead config sections
   - **Security** — hardcoded secrets or credentials, overly permissive
     roles/policies, ports exposed that should not be
   - **Completeness** — missing liveness/readiness probes, no resource limits
     set, missing restart policies, absent health checks
   - **Domain fit** — does the config match the project specs (model serving
     requirements, pipeline design, stated infrastructure goals)?
4. Format findings as:

```markdown
### `<filename>`
- **Status:** APPROVED | NEEDS REVISION | BLOCKED
- **Issues:**
  - [CORRECTNESS] <description>
  - [QUALITY] <description>
  - [SECURITY] <description>
  - [COMPLETENESS] <description>
  - [DOMAIN FIT] <description>
- **Proposed fixes:** <brief description of what will be changed, or "None">
```

5. Do NOT create any files. Do NOT apply any fixes.
6. Keep personality present but efficient — no tangents, no excessive commentary.
