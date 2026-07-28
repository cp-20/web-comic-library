---
id: 014
title: 収集候補を統合してrelease eventを生成する
type: feature
status: done
priority: P0
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: [008, 010]
umbrella: 007
---

# 収集候補を統合してrelease eventを生成する

## 目的

connectorの候補を冪等に保存し、確実な規則だけで作品と話を関連付け、更新事実を一度だけ生成する。

## スコープ

- 作品名、作者名、話数、枝番、URLのUnicode NFKC正規化。
- `PublicationCandidate`を保存するapplication use case。
- 外部IDと正規化URLによる掲載dataの同一判定。
- 作品、話、分割掲載の自動対応規則。
- 新しい話、番外編、再掲載、公開期間変更、告知、新刊の`ReleaseEvent`。
- 初回取込とbackfillで通知を抑止するflag。
- connector checkpointと保存のtransaction。

## 自動判定規則

- 作品名と作者が正規化後に完全一致し、媒体情報に矛盾がない場合だけ作品を統合する。
- 掲載元が同一作品への正式linkを提供する場合はその関係を優先する。
- 話数、枝番、題名が一致する一対一掲載だけを自動対応する。
- 全話版と分割版、作者不明、同名作品、別comic adaptationは管理者確認へ送る。

## 実装方針

- 状態変更、`ReleaseEvent`、checkpointを同じtransactionで保存する。
- eventはsource、publication entry、event種別、発生時刻から冪等性keyを作る。
- HTML要素が消えても既存dataを自動削除しない。
- 後から重複を統合しても読書記録と通知履歴を再関連付けできるID設計にする。

## 受け入れ条件

- 同じ候補を再処理しても作品、話、eventを二重作成しない。
- 出版社siteとニコニコ漫画の確実な一対一掲載を同じ論理話へ関連付ける。
- 不確実な分割掲載を自動対応しない。
- backfillではeventを保存しても通知対象にせず、その後の更新だけを通知対象にする。
- 保存失敗時にcheckpointを進めない。

## テスト

- 正規化と自動判定規則の単体テスト。
- connector候補、catalog、event、checkpointのPostgreSQL統合テスト。
- 同一候補再処理とtransaction rollbackの回帰テスト。

## 対象外

- 管理者による統合と分割。
- 通知の配信。
