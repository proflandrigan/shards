---
title: billing.user_id is string UUID not integer
domain: [billing, joins, types]
source_project: analysis/revenue_audit
contributed_by: data-analyst
date: 2025-03-02
type: entities
confidence: high
---

billing.users.user_id is VARCHAR(36) UUID, not INT. Joins to events.user_id require CAST.
