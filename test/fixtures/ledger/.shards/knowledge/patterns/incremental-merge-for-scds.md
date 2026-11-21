---
title: incremental merge for SCDs
domain: [sql, merge]
source_project: data_models/dim_customer
contributed_by: analytics-engineer
date: 2025-03-09
type: patterns
confidence: medium
---

```sql
MERGE dim_customer t USING stg s ON t.id = s.id
WHEN MATCHED THEN UPDATE SET t.name = s.name;
```
