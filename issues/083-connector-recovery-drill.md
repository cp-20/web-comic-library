---
id: 083
title: connector停止・再開drillを実施する
type: quality
status: blocked
priority: P3
execution: human
review_required: true
review_status: pending
reviewed_at: null
depends_on: [018, 061]
umbrella: 063
---

# connector停止・再開drillを実施する

## 人が操作する理由

隔離した運用環境で意図的にconnectorを停止し、影響範囲を監視しながら復旧判断を行う必要がある。

## Codexでは実行できない理由

Codexには運用環境とmonitoringへの権限がなく、外部serviceへ影響し得る障害注入を独断で実行できない。

## 目的と利用場面

運営者が初期リリース後にconnectorの連続失敗による自動停止からrunbookだけで安全に再開し、停止中の
catalogとcheckpointを変えず、再開batchを一回だけcommitできることを確認する。未完了でも初期
リリースを阻害しない。

## 背景と現状の問題

unit testは停止gateとcheckpointを検証できるが、配備済みworker、fixture source、Prometheus、
alert配送を通した復旧操作は保証しない。worker process停止は原因と証跡が異なるため#084へ分離する。

## 実施判断と代替案

- production相当の隔離Namespaceとfixture HTTP sourceを使い、外部漫画siteへ障害requestを送らない。
- DBを直接更新せず、公開されたconnector taskと`docs/operations.md`のresume commandだけを使う。
- 3連続失敗、停止、alert、明示再開、次batch成功を順番に行い、別障害を同時に起こさない。

## 変更対象

| file                                      | 操作            | 変更内容                                                                  |
| ----------------------------------------- | --------------- | ------------------------------------------------------------------------- |
| `operations/drills/connector-recovery.md` | 作成            | 候補SHA、失敗、停止、alert、checkpoint、再開、cleanup、reviewを記録する。 |
| `issues/083-connector-recovery-drill.md`  | 変更            | report linkと結果を追記し、`done`へ進める。                               |
| `audit.md`                                | 変更・非Git管理 | fixture source、test policy、resume、Secret、cleanupを記録する。          |

## 実施手順

1. 候補SHA、source、開始前checkpoint、catalog件数、外部request件数を記録する。
2. fixture sourceを3回連続で失敗させ、connector statusが`stopped`になりalertが届くことを確認する。
3. 30分間、外部request 0件、checkpoint/catalog不変をSQLとmetricsで確認する。
4. runbookのresume commandを一回実行し、次の成功batchが一回だけcommitされalertがresolveすることを確認する。
5. fixture policy、test data、Secretを削除し、残存jobとresourceがないことを確認する。

## 受け入れ条件

- 3連続失敗後にrequestが止まり、checkpointとcatalogが変わらない。
- 明示再開後の成功batchが一回だけcommitされ、重複releaseがない。
- alertのfiring、配送、resolve時刻とcleanupをreportから追跡できる。
- productionと外部漫画siteへ試験trafficを送らない。

## テスト

- connector 3連続失敗・停止・resume drill
- SQL、Prometheus、alert配送の比較
- `bun run check`
- `bun test`

## 対象外

- worker process停止、code・manifest・runbook修正。

## Blocker

2026-07-28時点で#018と#061が未完了で、対象connectorと候補runtimeがそろっていない。

## 解除条件

全`depends_on`が`done`で、隔離Namespaceへ同じ候補SHAを配備できること。

## 解除後の着手点

`operations/drills/connector-recovery.md`へ候補SHAと開始前checkpointを記録する。

## 禁止する代替

外部siteへの障害注入、DBの停止状態直接書換え、worker同時停止を禁止する。
