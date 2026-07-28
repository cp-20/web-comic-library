---
id: 086
title: fresh VPSへ一時復旧するdrillを実施する
type: quality
status: review
priority: P3
execution: human
review_required: true
review_status: pending
reviewed_at: null
depends_on: [006]
umbrella: 064
---

# fresh VPSへ一時復旧するdrillを実施する

## 人が操作する理由

一時VPS、DNSを切り替えない隔離経路、Secretを管理し、復旧後にresourceを確実に破棄する必要がある。

## Codexでは実行できない理由

CodexにはVPS契約、Secret、backup、請求resourceへの権限がなく、外部infraを作成・破棄できない。

## 目的と利用場面

初期リリース後、Asterionを利用できない場合に、運営者がfresh VPSへbackupからWeb、API、worker、
Tunnelを4時間以内に一時復旧し、test hostnameから疎通できることを実証する。未完了でも初期リリースを
阻害しない。

## 背景と現状の問題

database restoreだけではfirewall、container image、migration、worker、Tunnel credentialを組み合わせた
service復旧を保証しない。既存VPSへの上書きは依存物とcleanupを隠すためfresh VMが必要である。

## 実施判断と代替案

- fresh VPS、test用backup/R2 prefix、候補SHA固定image、test hostnameだけを使う。
- production DNSを切り替えず、PostgreSQLと管理endpointをpublic networkへ公開しない。
- `docs/operations.md`のphysical restore手順をこのdrill内で実施し、別の事前drillを必須にしない。

## 変更対象

| file                                     | 操作            | 変更内容                                                                      |
| ---------------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| `operations/drills/fresh-vps-restore.md` | 作成            | VPS、backup、image、restore、疎通、RTO、rotation、cleanup、reviewを記録する。 |
| `issues/086-fresh-vps-restore-drill.md`  | 変更            | report linkと結果を追記し、`done`へ進める。                                   |
| `audit.md`                               | 変更・非Git管理 | VPS、firewall、Secret、Tunnel、restore、cleanupを記録する。                   |

## 実施手順

1. 候補SHA、image digest、backup ID、test hostname、復旧開始時刻を記録する。
2. fresh VPSのfirewallを設定し、PostgreSQLと管理endpointが外部から到達不能なことを確認する。
3. `docs/operations.md`の手順でdatabaseを復元し、migration、API、worker、Web、Tunnelの順に候補imageを
   起動する。
4. test hostnameからWeb/API health、worker metrics、主要table件数を確認する。
5. 開始から疎通確認までが4時間以内か判定する。
6. test credentialをrotationし、VPS、hostname route、Secret、volume、R2 test prefixを削除する。

## 受け入れ条件

- fresh VPSでWeb、API、worker、Tunnelが4時間以内に疎通する。
- PostgreSQL portと管理endpointがpublic networkへ公開されない。
- 候補SHA、image digest、backup ID、主要件数、RTOをreportから確認できる。
- cleanup後にVPS、route、Secret、volume、test prefixが残らない。

## テスト

- firewall外部到達拒否
- physical restore、migration、health、metrics、外形疎通
- `bun run check`
- `bun test`
- `bun run build:web`

## 対象外

- production DNS切替、既存VPSへの上書き、restore方式・applicationの修正。

## 禁止する代替

production DNS切替、本番PVC mount、既存VPS上書き、Secret値の記録、cleanup省略を禁止する。
