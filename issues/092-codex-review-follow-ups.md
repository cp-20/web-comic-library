---
id: 092
title: 全PRのCodex Review所見を整理する
type: quality
status: unpolished
priority: P1
execution: agent
review_required: true
review_status: not_requested
reviewed_at: null
depends_on: []
umbrella: null
---

# 全PRのCodex Review所見を整理する

全72 PR（closed・mergedを含む）のCodex Reviewから、現行`main`で未解決かを確認する候補を集めた。
まだ重複確認、現状照合、設計判断、変更対象、受け入れ条件は整理していない。

## 分割した候補

- [093 感想の可視性と利用者操作](./093-review-visibility-and-controls.md)
- [094 moderation actionのtarget整合性](./094-moderation-target-integrity.md)
- [095 account deletionの停止境界](./095-account-deletion-boundaries.md)
- [096 account data exportとrate limit](./096-account-export-and-rate-limits.md)
- [097 公開pageとfrontend運用規則](./097-public-page-and-frontend-governance.md)
- [098 E2E・accessibility・性能検査の実効性](./098-e2e-accessibility-performance-soundness.md)
- [099 issue workflowの永続化invariant](./099-issue-workflow-persistence-invariants.md)
- [100 PR #002〜#059のCodex Review解決状況](./100-historical-review-disposition.md)

## 次にやること

- #093〜#099を現行仕様と照合し、実装可能な本文へpolishする。
- #100で過去PRの所見を解決済み・再確認・新規issueに仕分ける。
