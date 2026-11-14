> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Phase 3 — Deployment Design

Goal: Design how the model is packaged, served, and versioned.

Design decisions to make:

**Serving framework selection:**
Choose based on model type, team capabilities, and cloud:
- **BentoML** — flexible, framework-agnostic, supports custom pre/post-processing,
  good for teams wanting portability. Operational overhead.
- **TorchServe** — PyTorch-native, well-integrated with PyTorch ecosystem.
  Less flexible for non-PyTorch models.
- **NVIDIA Triton Inference Server** — best for GPU inference, multi-model serving,
  high-throughput. Significant operational overhead.
- **FastAPI + custom** — maximum flexibility, maximum operational overhead.
  Good for simple models, bad for complex serving requirements.
- **SageMaker Endpoints** — fully managed on AWS, excellent scaling, high cost,
  vendor lock-in. Right choice if team lives in AWS.
- **Vertex AI Endpoints** — fully managed on GCP, excellent scaling, high cost,
  vendor lock-in. Right choice if team lives in GCP.
- **Kubernetes + custom** — maximum portability, maximum operational complexity.

**Model packaging strategy:**
- Docker container with model artifacts
- BentoML Service (`.bento` archive)
- ONNX export (framework-agnostic, good for latency)
- TorchScript (PyTorch inference without Python interpreter)
- MLflow Model (standard format, registry-compatible)

**Endpoint design:**
- REST vs. gRPC (gRPC for high-throughput, latency-sensitive; REST for simplicity)
- Real-time (synchronous, low-latency) vs. batch inference (async, high-throughput)
- Streaming predictions (rare but relevant for sequential models)

**Scaling strategy:**
- Horizontal pod autoscaling on Kubernetes
- SageMaker endpoint auto-scaling (target tracking policies)
- Vertex AI autoscaling (min/max replicas, CPU/GPU utilization targets)
- Scale-to-zero for batch inference or low-traffic endpoints (cost optimization)

**Model versioning and deployment strategy:**
- Canary deployment (gradual traffic shift to new version)
- Shadow mode (new model runs in parallel, predictions logged but not served)
- Blue/green deployment (instant cutover with full rollback capability)
- A/B deployment (traffic split for online evaluation)

**Feature serving:**
- Pre-computed features: batch-computed and stored in database / feature store
  (simplest operationally, but staleness risk)
- Real-time feature computation: computed at request time
  (freshest features, latency cost, complexity risk)
- Feature store integration: Feast, Tecton, SageMaker Feature Store,
  Vertex AI Feature Store (adds managed caching and serving with point-in-time
  correctness; overhead only worth it for complex multi-model feature sharing)
- Caching layer: Redis / Memcached for frequently-accessed pre-computed features

**Fallback strategy:**
- What happens when the endpoint is down? (fallback to rule-based, cached
  predictions, or graceful degradation)
- Circuit breaker configuration
- Timeout and retry policy

### Document Phase 3

```markdown
---

## Phase 3: Deployment Design (MLOps Engineer)
- **Serving framework:** <choice> — rationale: <why>
- **Model packaging:** <Docker container | BentoML Service | ONNX | TorchScript | MLflow Model>
- **Endpoint design:**
  - Protocol: REST | gRPC
  - Serving mode: Real-time | Batch | Streaming
  - Endpoint URL pattern: <design>
- **Scaling strategy:**
  - Min instances: <N>
  - Max instances: <N>
  - Scale trigger: CPU <X>% | GPU <X>% | requests/s <N> | custom metric
  - Scale-to-zero: Yes | No
- **Model versioning strategy:** Canary | Shadow | Blue/Green | A/B
  - Traffic shift plan: <description>
- **Feature serving:**
  - Strategy: Pre-computed | Real-time | Feature Store | Cache layer
  - Feature store: <tool or "N/A">
  - Cache: <Redis | Memcached | None> — TTL: <duration>
  - Feature staleness acceptable: <Yes — <X> hours | No — real-time required>
- **Fallback strategy:** <rule-based | cached predictions | graceful degradation>
- **Circuit breaker / timeout:** timeout: <X>s | retries: <N>
- **Cloud lock-in assessment:** <trade-offs for chosen serving approach>
```

::GATE:: id=mlops-engineer-phase-3 phase=3 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/mlops_engineer/phases/phase-4.md` in full and follow its instructions starting from Phase 4. Do not pre-read further phase files.
