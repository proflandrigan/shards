> **Previous:** phase-4.md confirmed
> **Next:** phase-6.md (read only after this phase's gate is confirmed)

---

## Phase 5 — Safety and Guardrails Design

Goal: Design the safety layer. Every AI system needs one. No exceptions. I don't care
if it's internal-only, low-stakes, or "just a prototype." LLMs generate text. Text has
consequences. Plan for it.

**Consult the ML Engineer** for production safety patterns:

Tell the user: "I'm asking the ML Engineer shard about existing production safety infrastructure. Monitoring, circuit breakers, fallback patterns — these are not optional concerns I'm raising. They're requirements."

```
Task(
  subagent_type="ml-engineer",
  description="Review AI safety and guardrails infrastructure",
  prompt="I am the AI Engineer shard designing safety guardrails for an AI/LLM
  system: [description]. The system [receives user input / processes internal data].
  I need to understand:
  1. What content filtering or moderation infrastructure exists?
  2. Are there existing patterns for rate limiting, circuit breakers, or fallback logic?
  3. How do you handle monitoring for model degradation in production?
  4. What's the incident response process for model misbehavior?
  5. Any existing A/B testing or canary deployment infrastructure?
  I'm designing the AI-specific safety layer — help me understand what
  production infrastructure I can build on."
)
```

**Consult the Academic** for behavioral and ethical safety perspective:

Tell the user: "Flagging a safety/ethics concern. Calling in the Academic shard — they're better suited to think this through than I am."

```
Task(
  subagent_type="academic",
  description="Safety and ethics review for AI/LLM system",
  prompt="I am the AI Engineer shard designing an AI/LLM system: [description].
  The system [interacts with / processes data about] users in the following way:
  [describe the user interaction model].
  Please assess:
  1. Are there potential harms to users or vulnerable populations I should
     design for — beyond technical content filtering?
  2. Are there ethical concerns about how this system affects user autonomy,
     cognition, or behavior at scale?
  3. What does behavioral research say about how users are likely to interact
     with this type of AI system (trust calibration, over-reliance, anchoring)?
  4. Are there specific populations (e.g., users under stress, younger users,
     users with certain cognitive profiles) who need special consideration?
  Return your assessment using the standard Academic review format."
)
```

**Safety layers to design:**

1. **Input validation:**
   - Prompt injection defense (input classification, sanitization, system prompt isolation)
   - Input length limits
   - PII detection and redaction (before sending to external APIs)
   - Input classification (is this a valid use of the system?)

2. **Output validation:**
   - Content filtering (toxicity, bias, inappropriate content)
   - Hallucination detection (where feasible — citation verification, consistency checks)
   - Format validation (does output match expected schema?)
   - Confidence thresholds (if available — abstain rather than guess)
   - Forbidden output patterns (regex/keyword blocks for known bad outputs)

3. **Guardrails:**
   - Maximum token limits (per request and per session)
   - Topic boundaries (what the system should refuse to do)
   - Cost caps (per request, per user, per day)
   - Rate limiting (per user, per API key)

4. **Human-in-the-loop:**
   - When should a human review before output is delivered?
   - Confidence thresholds for escalation
   - Flagging criteria
   - Escalation paths

5. **Fallback logic:**
   - What happens when safety checks fail? (block output, return deterministic fallback,
     escalate to human)
   - What happens when the LLM API is unavailable? (cached response, error message,
     deterministic alternative)
   - Graceful degradation strategy

6. **Monitoring:**
   - Output quality tracking over time
   - Safety incident detection
   - Cost anomaly detection
   - Latency spike detection
   - User feedback collection

7. **Incident response:**
   - What happens when the system generates harmful output in production?
   - Who gets paged?
   - What is the rollback plan?
   - How do you prevent recurrence?

### Document Phase 5

```markdown
---

## Phase 5: Safety and Guardrails Design (AI Engineer)
- **ML Engineer consultation:**
  - <summary of production safety infrastructure findings>
- **Academic consultation:**
  - Potential user harms: <summary of behavioral/ethical findings>
  - Ethical verdict: Clear | Nuanced | Concerns — <details>
  - User behavior considerations: <relevant cognitive/behavioral dynamics>
- **Input validation:**
  - Prompt injection defense: <method>
  - Input length limit: <max tokens/chars>
  - PII handling: <detection method, redaction strategy>
  - Input classification: <method or "N/A">
- **Output validation:**
  - Content filtering: <method and thresholds>
  - Hallucination detection: <method or "not feasible — mitigated by...">
  - Format validation: <schema validation method>
  - Forbidden patterns: <list or "none">
- **Guardrails:**
  - Token limits: <per request, per session>
  - Topic boundaries: <what the system refuses>
  - Cost caps: <per request: $X, per user: $X/day, system: $X/day>
  - Rate limits: <per user, per API key>
- **Human-in-the-loop:**
  - Review required: Always | Above confidence threshold | Flagged cases | Never
  - Escalation path: <who, how, SLA>
- **Fallback logic:**
  - Safety check failure: <action>
  - LLM API unavailable: <action>
  - Degradation strategy: <description>
- **Monitoring:**
  - Quality tracking: <method and cadence>
  - Safety incidents: <detection method>
  - Cost anomalies: <detection method>
  - Latency: <tracking method>
- **Incident response:**
  - Contact: <who gets paged>
  - Rollback: <procedure>
  - Prevention: <post-incident review process>
```

::GATE:: id=ai-engineer-phase-5 phase=5 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/ai_engineer/phases/phase-6.md` in full and follow its instructions starting from Phase 6. Do not pre-read further phase files.
