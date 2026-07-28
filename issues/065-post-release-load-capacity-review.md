---
id: 065
title: release後の継続負荷とcapacityを確認する
type: quality
status: blocked
priority: P3
execution: human
review_required: true
review_status: pending
reviewed_at: null
depends_on: [018, 025, 027, 035, 074]
umbrella: 043
---

# release後の継続負荷とcapacityを確認する

## 人が操作する理由

本番の利用状況と費用を確認し、許容するcapacityと増強判断を運用責任者が確定する必要がある。

## Codexでは実行できない理由

Codexには本番monitoring、請求情報、組織の予算判断へ自律的にアクセスして決裁する権限がない。

## 目的と利用場面

運営者が初期リリース後に、production相当の隔離環境へ24時間の固定負荷を与え、API latency、error、
job backlog、CPU、memory、disk、追加費用のcapacity条件を確認する。結果は後続の規模拡大判断に使い、
初期リリースは阻害しない。

## 背景と現状の問題

#035の短いCI benchmarkは回帰を早く検出するが、memory leak、queue蓄積、disk増加、通知retry、
connectorとのresource競合を検出できない。#074の固定k6 scenarioとfixture sourceでrelease後に再現する。

## 実施判断と代替案

- 負荷生成は#074のk6 scriptを使う。継続時間、virtual user、threshold、summaryを標準機能で固定でき、
  24時間runnerを自前実装するより操作と証跡が少ないためである。
- productionではなく同じresource limitの隔離Namespaceを使う。実利用者と外部sourceへ負荷を
  与えないためである。
- thresholdは開始前にreportへ固定し、結果を見て変更しない。

## スコープと変更対象

| file                                              | 操作            | 変更内容                                                                           |
| ------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------- |
| `operations/drills/post-release-load.md`          | 作成            | 候補SHA、k6設定、threshold、時系列query、結果、resource、費用、cleanupを記録する。 |
| `issues/065-post-release-load-capacity-review.md` | 変更            | report linkと結果を追記し、`done`へ進める。                                        |
| `audit.md`                                        | 変更・非Git管理 | 隔離Namespace、fixture、負荷開始・停止、cleanupを記録する。                        |

## 実施手順

1. 候補SHAとimage digestを固定し、隔離NamespaceのCPU/memory limitをproductionと一致させる。
2. reportへAPI p95 1.5秒以下、HTTP error率1％未満、PVC/node disk 70％未満、Pod restart 0、
   試験後10分以内のjob backlog回復、CPU 1 core・memory 2GiB以上の余力を転記する。
3. fixture connector、通常巡回、backfill、通知consumerを起動し、#074のk6 scenarioを24時間実行する。
4. 1分ごとのAPI latency、error、CPU、memory、disk、restart、job backlog、通知失敗と追加費用を記録する。
5. k6終了後10分間観測し、backlogとresourceが開始前baselineへ戻ることを確認する。
6. threshold未達ならagent修正issueを作り、新しい候補SHAで24時間を最初から再実施する。
7. Namespace、fixture、test account、Secretを削除し、残存resourceを確認する。

## 受け入れ条件

- 24時間すべてのk6 thresholdを満たす。
- Pod restartがなく、disk使用率が70％未満で、公開後の余力条件を満たす。
- job backlogが試験終了後10分以内に開始値へ戻る。
- 通知の重複送信とconnectorの外部requestがなく、fixtureだけを使う。
- reportから候補SHA、k6設定、時系列値、費用、cleanupを再確認できる。

## テスト

- #074のk6 scenario
- 24時間soak
- Prometheus、SQL、resource、費用の記録

## 対象外

- release後のfield data。
- k6 script、application、manifest、alertの修正。

## Blocker

2026-07-28時点で#018、#035、#074が未完了で、固定scenarioとrelease候補がない。

## 解除条件

全`depends_on`が`done`で、productionと同じresource limitの隔離Namespaceを利用できること。

## 解除後の着手点

`operations/drills/post-release-load.md`を作成し、候補SHAと試験前thresholdを固定する。

## 禁止する代替

productionへの負荷、実accountや外部漫画siteの利用、試験後のthreshold変更、12時間などへの短縮、
cleanup前の完了を禁止する。
