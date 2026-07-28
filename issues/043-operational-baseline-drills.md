---
id: 043
title: release後の運用品質drillを追跡する
type: umbrella
status: review
priority: P3
execution: tracking
review_required: true
review_status: pending
reviewed_at: null
depends_on: []
umbrella: null
---

# release後の運用品質drillを追跡する

## 目的

database restore、application・worker・connector復旧、継続負荷を、初期リリース後に人が独立して
実施・reviewできる単位で追跡する。このumbrellaと全子issueは初期リリースの依存にしない。

## 子issue

- [078 logical backup restore](./078-logical-restore-drill.md)
- [063 worker・connector復旧drill](./063-worker-connector-recovery-drill.md)
- [064 application・VPS復旧drill](./064-application-failover-drill.md)
- [074 k6継続負荷scenario](./074-k6-post-release-load-scenario.md)
- [065 継続負荷・capacity確認](./065-post-release-load-capacity-review.md)

## 完了条件

- 全子issueが`done`である。
- `operations/drills/README.md`に次回due dateと各reportへのlinkがある。
- 実施したproduction操作がSecretを含めず`audit.md`へ記録されている。

## 対象外

- application、manifest、alert ruleの修正。発見事項は別のagent issueへ分離する。
- 初期リリースのgo/no-go判定。
