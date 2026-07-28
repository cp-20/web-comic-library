---
id: 021
title: 読書状態とWeb話の既読を管理する
type: feature
status: done
priority: P0
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: [008, 020]
umbrella: 019
---

# 読書状態とWeb話の既読を管理する

## 目的

利用者が作品の手動状態、論理的な話の既読、実際に読んだ掲載ページを別々に記録できるようにする。

## スコープ

- `LibraryEntry`、`ContentReadRecord`、`PublicationReadRecord`のmodelとtable。
- 読みたい、読んでいる、一時中断、読むのをやめた、読み切ったの状態遷移。
- 最新の通常話まで読んだかを示す追いつき状態。
- 一話、一部分、指定話までの一括既読、既読取消。
- 読んだ掲載先の記録。
- Hono RPC routeと作品ページ上の操作UI。
- 読書状態と記録単位の公開範囲。

## 不変条件

- 手動の読書状態と自動計算する追いつき状態を混在させない。
- 作品の連載状態を利用者の読書状態へ流用しない。
- 確認済みの`EntryContentMapping`だけを別掲載先の既読へ反映する。
- mapping未確認時は掲載先ごとの記録を保持する。
- 告知、再掲載、公開期間変更、不明を追いつき対象へ含めない。

## 実装方針

- 状態変更はdomain methodを通す。
- 一括既読と取消は一transactionで処理する。
- write modelと作品画面用read modelを分ける。
- WebはHono RPCからcommandとqueryを呼ぶ。
- 活動を作るかどうかはcommand入力で明示し、標準では作らない。

## 受け入れ条件

- 五つの状態を設定し、状態履歴を失わず変更できる。
- 指定話までを既読にし、一部または全部を取り消せる。
- 読んだ掲載ページを記録できる。
- 同一内容と確認済みの別掲載先へだけ既読を反映する。
- 新しい通常話の追加で追いつき状態が自動的に解除される。
- 非公開記録を第三者向けqueryへ返さない。

## テスト

- 状態遷移、追いつき計算、一括既読、取消のdomain単体テスト。
- 多対多mappingと既読反映のPostgreSQL統合テスト。
- Hono RPCと作品ページ操作のE2E。

## 対象外

- 通知方式。
- 単行本の既読。
