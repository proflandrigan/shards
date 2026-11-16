---
title: days_since_last_login
domain: [churn, engagement]
source_project: models/churn
contributed_by: ml-engineer
date: 2025-04-01
type: features
confidence: high
sql_snippet: |
  DATEDIFF(CURRENT_DATE, last_login_at)
feature_type: numeric
grain: one row per user-day
verified_by: ml-engineer in models/churn — AUC: +3.2%
---

Captures recency of engagement. Caveat: null for never-logged-in users.
