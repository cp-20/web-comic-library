---
id: 084
title: worker停止・再開drillを実施する
type: quality
status: blocked
priority: P3
execution: human
review_required: true
review_status: pending
reviewed_at: null
depends_on: [018, 027, 061]
umbrella: 063
---

# worker停止・再開drillを実施する

## 人が操作する理由

隔離した運用環境でworkerを停止し、queueと再開後の処理を監視しながら復旧を確認する必要がある。

## Codexでは実行できない理由

Codexには運用環境、queue、monitoringへの権限がなく、障害注入と復旧操作を独断で実行できない。

## 目的と利用場面

運営者が初期リリース後にworkerを30分停止して再開し、通常巡回、backfill、通知jobを優先度どおり
処理しながら、idempotency key、catalog release、通知を重複させないことを確認する。未完了でも初期
リリースを阻害しない。

## 背景と現状の問題

unit testはtaskごとのretryを検証できるが、Graphile Worker queueに複数種のjobが蓄積した後の実際の
優先度、backlog解消、alert配送を保証しない。connector固有の停止gateは#083で別に確認する。

## 実施判断と代替案

- 隔離Namespaceとfixture dataを使い、worker Deploymentだけを0 replicaにして30分停止する。
- job tableを直接書き換えず、通常のscheduler、outbox、connector taskからqueueを作る。
- 通常巡回、通知、backfillの開始・完了件数を停止前後で比較し、同時にconnector障害を起こさない。

## 変更対象

| file                                   | 操作            | 変更内容                                                                 |
| -------------------------------------- | --------------- | ------------------------------------------------------------------------ |
| `operations/drills/worker-recovery.md` | 作成            | 候補SHA、停止、job件数、優先度、重複、alert、cleanup、reviewを記録する。 |
| `issues/084-worker-recovery-drill.md`  | 変更            | report linkと結果を追記し、`done`へ進める。                              |
| `audit.md`                             | 変更・非Git管理 | worker停止・再開、fixture、Secret、cleanupを記録する。                   |

## 実施手順

1. 候補SHA、queue種別ごとの件数、idempotency key、release/notification件数を記録する。
2. workerを0 replicaにして30分待ち、通常巡回、通知、backfillのbacklogとalertを確認する。
3. workerを既定replicaへ戻し、通常巡回がbackfillより先に開始することを時刻で確認する。
4. backlogが解消するまで観測し、job、release、通知の重複とdead-letterを比較する。
5. fixture data、test account、Secret、残存jobをcleanupする。

## 受け入れ条件

- 30分停止中にjobが失われず、alertが配送される。
- 再開後に通常巡回がbackfillより先に進み、backlogが解消する。
- idempotency key、catalog release、通知の重複が0件である。
- alert resolveとcleanupをreportから再確認できる。

## テスト

- worker 30分停止・再開drill
- queue、idempotency、release、通知件数比較
- `bun run check`
- `bun test`

## 対象外

- connector停止gate、worker code・manifest・priority修正。

## Blocker

2026-07-28時点で#018と#061が未完了で、全taskを持つ候補runtimeがそろっていない。

## 解除条件

全`depends_on`が`done`で、隔離Namespaceへ同じ候補SHAを配備できること。

## 解除後の着手点

`operations/drills/worker-recovery.md`へ候補SHAとqueue開始件数を記録する。

## 禁止する代替

job tableの直接書換え、停止時間短縮、connector障害の同時注入を禁止する。
