---
id: 094
title: moderation actionを通報対象へ束縛する
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

# moderation actionを通報対象へ束縛する

Codex Review PR #062 の所見。通報IDと手入力targetの不一致で別のactivityやprofileを処理しないようにする。

## 取り込んだ所見

- reportを指定するactionでは、保存済みreportの`targetKind`と`targetId`を唯一の対象にする。
- profileに`hide`を選んだとき、no-opのままreportをresolvedにしない。実装可能なactionだけをUI・schemaで選べるようにする。
- report queueの状態遷移、block/muteの解除、form submit失敗時の入力保持を再確認する。
- report対象の型と存在確認をAPI境界で揃える。
