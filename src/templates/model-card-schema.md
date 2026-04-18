# Shards Model Card Schema

The authoritative schema is `templates/model-card-schema.json` (JSON Schema, draft 2020-12). This file is a companion for humans and for LLM agents that need inline guidance.

## Annotated example

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "<ISO-8601>",
  "generatedBy": "<ml-engineer | ai-engineer>",
  "projectName": "<project_name>",
  "modelDetails": {
    "name": "<model/system name>",
    "version": "<version>",
    "type": "<LightGBM classifier | XGBoost regressor | LLM prompt chain | RAG pipeline | AI agent | etc.>",
    "owner": "<owner>",
    "date": "<YYYY-MM-DD>",
    "framework": "<scikit-learn | LightGBM | PyTorch | LangChain | etc.>",
    "license": "<license or N/A>",
    "references": ["<urls or citations>"]
  },
  "intendedUse": {
    "primaryUse": "<what the model predicts/ranks/classifies/generates>",
    "primaryUsers": "<who consumes the model output>",
    "outOfScopeUses": ["<uses this model should NOT be used for>"]
  },
  "factors": {
    "relevantFactors": ["<groups, segments, environments>"],
    "evaluationFactors": ["<factors evaluated>"]
  },
  "metrics": {
    "performanceMeasures": [
      { "name": "<metric>", "value": "<value>", "description": "<what it measures>", "rationale": "<why chosen>" }
    ],
    "decisionThresholds": [
      { "name": "<threshold>", "threshold": "<value>", "rationale": "<why>" }
    ]
  },
  "evaluationData": {
    "datasets": ["<eval set description>"],
    "preprocessing": "<how prepared>",
    "size": "<N examples>",
    "motivation": "<why this eval set>"
  },
  "trainingData": {
    "datasets": ["<training data description>"],
    "preprocessing": "<feature engineering summary or N/A>",
    "size": "<N examples or N/A>",
    "motivation": "<why this data>"
  },
  "quantitativeAnalyses": {
    "unitaryResults": [
      { "metric": "<metric>", "value": "<value>", "subset": "<subset>" }
    ],
    "intersectionalResults": []
  },
  "ethicalConsiderations": {
    "risks": ["<from Academic shard>"],
    "mitigations": ["<from Academic shard>"],
    "academicReview": "<Academic shard's full response>"
  },
  "caveatsAndRecommendations": {
    "caveats": ["<limitations>"],
    "recommendations": ["<deployment recommendations>"]
  },
  "evalSummary": {
    "overallVerdict": "<PASS | FAIL | PARTIAL>",
    "dimensions": [
      { "dimension": "<name>", "metric": "<metric>", "target": "<target>", "actual": "<actual>", "verdict": "<pass | fail>" }
    ],
    "cost": {
      "perRequest": "<$X or null>",
      "per1kTokens": "<$X or null>",
      "monthlyProjected": "<$X or null>",
      "budget": "<$X or null>"
    }
  }
}
```

## Field notes

- **`generatedBy`** — agent slug of the producer: `"ml-engineer"` or `"ai-engineer"`.
- **`evalSummary.cost.per1kTokens`** — leave `null` for non-LLM models (traditional ML); populate with a numeric or string value for any LLM-backed system.
- **`trainingData`** — use `"N/A"` or `"Not applicable — prompt-based"` for pure prompt/RAG systems; populate fully for fine-tuned models.
- **`modelDetails.type`** — free-form (examples: `LightGBM classifier`, `XGBoost regressor`, `LLM prompt chain`, `RAG pipeline`, `AI agent`).
- **`intersectionalResults`** — may be `[]` if intersectional analysis was not performed; document why in `caveatsAndRecommendations.caveats`.
