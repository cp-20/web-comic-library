---
id: 105
title: catalog writeのtransactionとretired mappingを整える
type: feature
status: unpolished
priority: P1
execution: agent
review_required: true
review_status: not_requested
reviewed_at: null
depends_on: []
umbrella: 007
---

# catalog writeのtransactionとretired mappingを整える

Codex Review PR #010: transaction contextをcatalog writeへ通し、mapping全scanを避け、retired content unitのmappingを除外する。
