---
id: 085
title: application Podの単一障害復旧を確認する
type: quality
status: review
priority: P3
execution: human
review_required: true
review_status: pending
reviewed_at: null
depends_on: [025, 034]
umbrella: 064
---

# application Podの単一障害復旧を確認する

## 人が操作する理由

対象clusterを特定してPodを停止し、利用者影響と自動復旧を監視しながら安全にdrillを終了する必要がある。

## Codexでは実行できない理由

Codexにはclusterとmonitoringへの権限がなく、稼働環境のPod削除を独断で実行できない。

## 目的と利用場面

運営者が初期リリース後にWeb、API、worker、cloudflaredを一つずつ停止し、probe、Service、外形監視、
alertを通して自動復旧することを確認する。未完了でも初期リリースを阻害しない。

## 背景と現状の問題

container checkの成功だけではKubernetes probe、Service selector、Tunnel、alert resolveの組合せを
保証しない。fresh VPSへのrestoreはbackupと配備の別経路なので#086へ分離する。

## 実施判断と代替案

- `kubectl delete pod`で一つずつ停止し、Readyとalert resolve後に次へ進む。
- 複数Pod・nodeを同時停止せず、単一障害の原因と時間を対象ごとに分離する。
- production DNS、database、persistent dataを変更しない。

## 変更対象

| file                                            | 操作            | 変更内容                                                                |
| ----------------------------------------------- | --------------- | ----------------------------------------------------------------------- |
| `operations/drills/application-pod-failover.md` | 作成            | 候補SHA、Pod、停止、Ready、外形監視、alert、cleanup、reviewを記録する。 |
| `issues/085-application-pod-failover-drill.md`  | 変更            | report linkと結果を追記し、`done`へ進める。                             |
| `audit.md`                                      | 変更・非Git管理 | Pod削除、危険性、保護策、結果を記録する。                               |

## 実施手順

1. 候補SHA、image digest、対象Deployment、開始前Ready数とhealthを記録する。
2. Web Podを一つ削除し、replacement Ready、外形監視、alert firing/resolveを確認する。
3. API、worker、cloudflaredも同じ手順で一つずつ実施する。
4. 各対象の停止からReady、外形回復、resolveまでの時間とrequest/job errorを記録する。
5. 全Deploymentが既定replicaで、進行中alertと一時resourceがないことを確認する。

## 受け入れ条件

- 4対象が単一Pod停止から自動復旧する。
- Web/API/Tunnelの外形疎通とworker metricsが回復する。
- 各対象のalertが発火・配送・resolveし、永続dataの欠落や重複がない。
- production DNSとpersistent dataを変更せず、対象ごとの時間をreportから確認できる。

## テスト

- Web、API、worker、cloudflaredの単一Pod停止
- Ready、health、metrics、alert照合
- `bun run check`
- `bun test`
- `bun run build:web`

## 対象外

- node停止、複数Pod同時停止、fresh VPS、code・manifest修正。

## 禁止する代替

複数Pod同時停止、production DNS変更、alert配送を省略した合格を禁止する。
