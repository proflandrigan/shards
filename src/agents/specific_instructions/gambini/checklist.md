# Skeptic Checklist (Gambini)

Use this checklist when conducting adversarial reviews of plans, code, or
architectural designs. Your goal is to find the holes, the risks, and the
failure modes that others have missed.

## 1. Edge Cases & Failure Modes
- **Null & Missing Data:** How does the system handle nulls, empty strings,
  missing keys, or completely missing datasets?
- **Invalid Inputs:** What happens with negative numbers where positives are
  expected? Out-of-range values? Incorrect data types?
- **Timeouts & Latency:** What happens if an API call takes 30 seconds? 5
  minutes? Does the system hang or fail gracefully?
- **Partial Success:** In multi-step pipelines, what happens if step 2
  succeeds but step 3 fails? Is the state left corrupted?
- **Volume Spikes:** Can the system handle a 100x increase in data volume
  without falling over?

## 2. Security & Data Integrity
- **Injection Risks:** Are there SQL, command, or prompt injection
  vulnerabilities?
- **Secrets Management:** Are there any hardcoded API keys, passwords, or
  connection strings? Are they being logged?
- **PII & Sensitive Data:** Is Personally Identifiable Information (PII)
  being handled securely? Is it being logged or exposed to LLMs
  unnecessarily?
- **Access Control:** Are there assumptions about who can access which data?
  Can a user see another user's data?
- **Data Leakage:** In RAG or AI systems, is there a risk of the model
  exposing sensitive data from the retrieval context?

## 3. Scale & Performance
- **N+1 Query Patterns:** Are we making one database or API call per row in a
  large loop?
- **Memory Constraints:** Will the system run out of RAM when processing
  large files or datasets?
- **Latency Bottlenecks:** What is the slowest part of the process? Is it
  acceptable for the user's requirements?
- **Resource Contention:** Are we hitting rate limits? Are we locking
  tables for too long?
- **Inefficient Algorithms:** Are we using O(N^2) or O(2^n) approaches where
  O(N) or O(log N) would suffice?

## 4. Bias & Ethics
- **Sample Bias:** Is the training or evaluation data representative of the
  real-world population the system will serve?
- **Model Fairness:** Does the model perform worse for specific subgroups
  (gender, race, age, geography)?
- **Unintended Consequences:** Does this feature create negative incentives?
  Can it be "gamed" in harmful ways?
- **Automation Bias:** Are we trusting the model's output too much? Is there
  meaningful human oversight?
- **Opacity:** Is the decision-making process of the system explainable, or
  is it a "black box" that could hide errors?

## 5. The "Gambini" Gut Check
- **Complexity:** Is this over-engineered? Are we using a sledgehammer to
  crack a nut?
- **Hidden Assumptions:** What are we assuming to be true that might not be?
- **The "Why":** If we didn't do this at all, what's the worst that would
  happen?
- **Fragility:** If one specific component (e.g., a single LLM provider)
  goes down, does the whole company stop working?
