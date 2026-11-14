# Model Card: {{MODEL_NAME}}

- **Version:** {{VERSION}}
- **Type:** {{TYPE}}
- **Owner:** {{OWNER}}
- **Date:** {{DATE}}
- **Framework:** {{FRAMEWORK}}

---

## Model Details

{{MODEL_DETAILS}}

**License:** {{LICENSE}}

**References:** {{REFERENCES}}

---

## Intended Use

- **Primary use:** {{PRIMARY_USE}}
- **Primary users:** {{PRIMARY_USERS}}
- **Out-of-scope uses:**
{{OUT_OF_SCOPE_USES}}

---

## Factors

- **Relevant factors:** {{RELEVANT_FACTORS}}
- **Evaluation factors:** {{EVALUATION_FACTORS}}

---

## Metrics

| Measure | Value | Description | Rationale |
|---------|-------|-------------|-----------|
{{METRICS_TABLE}}

### Decision Thresholds

| Threshold | Value | Rationale |
|-----------|-------|-----------|
{{THRESHOLDS_TABLE}}

---

## Evaluation Data

- **Datasets:** {{EVAL_DATASETS}}
- **Size:** {{EVAL_SIZE}}
- **Preprocessing:** {{EVAL_PREPROCESSING}}
- **Motivation:** {{EVAL_MOTIVATION}}

---

## Training Data

- **Datasets:** {{TRAINING_DATASETS}}
- **Size:** {{TRAINING_SIZE}}
- **Preprocessing:** {{TRAINING_PREPROCESSING}}
- **Motivation:** {{TRAINING_MOTIVATION}}

---

## Quantitative Analyses

### Unitary Results

| Metric | Value | Subset |
|--------|-------|--------|
{{UNITARY_TABLE}}

### Intersectional Results

| Metric | Value | Factors |
|--------|-------|---------|
{{INTERSECTIONAL_TABLE}}

---

## Ethical Considerations

{{ETHICAL_RISKS}}

### Mitigations

{{ETHICAL_MITIGATIONS}}

### Academic Review

{{ACADEMIC_REVIEW}}

---

## Caveats and Recommendations

### Caveats

{{CAVEATS}}

### Recommendations

{{RECOMMENDATIONS}}

---

## Evaluation Summary

- **Overall verdict:** {{VERDICT}}

| Dimension | Metric | Target | Actual | Verdict |
|-----------|--------|--------|--------|---------|
{{EVAL_DIMENSIONS_TABLE}}

### Cost Profile

- **Per request:** ${{COST_PER_REQUEST}}
- **Per 1k tokens:** ${{COST_PER_1K_TOKENS}}
- **Monthly projection:** ${{MONTHLY_COST}}
- **Budget:** ${{COST_BUDGET}}
