---
id: 095
title: account deletion開始時に利用者dataの公開とdeliveryを停止する
type: feature
status: unpolished
priority: P1
execution: agent
review_required: true
review_status: not_requested
reviewed_at: null
depends_on: []
umbrella: null
---

# account deletion開始時に利用者dataの公開とdeliveryを停止する

Codex Review PR #067 の所見。30日後のpurgeを待つ間も削除要求済みaccountが利用・公開・通知されないようにする。

## 取り込んだ所見

- `pending_deletion` accountの感想をlist、reveal、reactionから除外する。
- deletion transactionでextension tokenと未使用pairing codeを無効化する。
- email digestとWeb Pushの新規deliveryを停止する。
- moderation actionを持つaccountのpurgeでaudit referenceを失わず、他accountのpurgeもrollbackしないようにする。
- 公約した30日以内にpurgeされるscheduleへ見直す。
