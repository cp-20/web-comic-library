---
id: 052
title: 許可されたマガポケmetadata APIを接続する
type: feature
status: blocked
priority: P2
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: [009, 010, 014, 061, 068]
umbrella: 018
---

# 許可されたマガポケmetadata APIを接続する

## 目的と利用場面

マガポケの作品と公開話を、権利者がこのservice向けに許可した公式metadata APIからcatalogへ取り込み、
利用者が横断検索、follow、更新通知に使えるようにする。

## 背景と現状の問題

現在の対応元は5 siteで、公開ベータの10 site目標に足りない。しかし2026-07-28に確認した
[公式の利用規約改定告知](https://pocket.shonenmagazine.com/article/entry/2026/06/03)は、情報収集bot、
robot、crawler、spider、scraper等の自動化手段によるserviceへのaccessとcontentの収集・処理を
明示的に禁止している。robots.txtの`Allow`はこの禁止を上書きしない。

## 実装判断と代替案

- 一般規約に優先する個別の書面許可と、権利者が提供する認証不要HTTPS JSON metadata APIが
  両方そろった場合だけ実装する。許可文書には保存・公開field、host/path、rate、失効時処理を含める。
- 公開HTML scraping、browser操作、mobile appや内部APIの解析、proxyは規約を迂回するため使わない。
- RSS/Atomは履歴、公開終了、年齢区分を欠く可能性があるため、このissueの手段にしない。公式feedだけが
  将来提供された場合は別issueで権利範囲と完全性を決める。
- `ConnectorHttpClient`、`JSON.parse`、Valibotで実装する。SDK、別HTTP client、headless browserは
  追加しない。
- APIがstable work/episode ID、updated-at、cursor、公開状態、title、author、canonical URL、
  年齢区分を保証しなければ実装せず、題名や配列位置から推測しない。

## スコープと変更対象

| file                                                            | 操作 | 変更内容                                                            |
| --------------------------------------------------------------- | ---- | ------------------------------------------------------------------- |
| `packages/connectors/src/magapoke.ts`                           | 作成 | API schema、pure parser、URL正規化、checkpoint、factoryを実装する。 |
| `packages/connectors/src/magapoke.test.ts`                      | 作成 | pagination、公開終了、構造変更、request範囲を検証する。             |
| `packages/connectors/fixtures/magapoke-discovery-first.json`    | 作成 | 最初のpageとcursorの匿名fixture。                                   |
| `packages/connectors/fixtures/magapoke-discovery-last.json`     | 作成 | 最終pageとwatermarkのfixture。                                      |
| `packages/connectors/fixtures/magapoke-publication-active.json` | 作成 | 一作品と公開話の最小fixture。                                       |
| `packages/connectors/fixtures/magapoke-publication-ended.json`  | 作成 | 公開終了の最小fixture。                                             |
| `packages/connectors/fixtures/magapoke-structure-changed.json`  | 作成 | 必須field欠落のfixture。                                            |
| `packages/connectors/src/index.ts`                              | 変更 | config、type、parser、factoryをexportする。                         |
| `apps/worker/src/connector-registry.ts`                         | 変更 | `magapoke` source keyをfactoryへ登録する。                          |
| `apps/worker/src/connector-registry.test.ts`                    | 変更 | policy gateとfactory解決を検証する。                                |
| `docs/connectors.md`                                            | 変更 | 個別許可のrevision、API mapping、rate、停止条件を記録する。         |
| `docs/operations.md`                                            | 変更 | policy登録、backfill、停止、permission失効時の手順を書く。          |

fileの削除、DB schema変更、新しいruntime dependencyはない。production policyを変更する場合は
`audit.md`へ記録する。

## component間の契約

`magapokeConfig`は`key: 'magapoke'`、公式名、個別許可済みbase/discovery/publication URL、
allowlist hostをreadonly値で持つ。HTTPS、user infoなし、許可host/path一致を必須にし、query keyは
`cursor`と`updatedAfter`だけにする。

API fieldは、workのstable ID/title/ordered authors/canonical URL/updated-at/age rating/public stateと、
episodeのstable ID/title/canonical URL/published-at/kind/public stateへ一対一で対応させる。pageは
opaque `nextCursor | null`を返す。実field名とsemantic mappingを`docs/connectors.md`へ残す。

checkpointは
`{ cursor: string | null, seenIdsAtWatermark: string[], watermark: string }`。途中pageでwatermarkを
変えず、最終pageで最大updated-atへ進める。同時刻IDをsortして保持する。initial/backfill/
incrementalのcheckpoint分離とqueue優先度は#061を使う。

公式作品は`kind: 'official'`とする。未知kind/年齢区分、欠落、重複ID、cursor loop、host外URLは
`ConnectorValidationError`とし、checkpointと既存catalogを維持する。公開終了は#061の
`availability: 'ended'`としてingestionへ渡し、物理削除しない。

## 実装手順

1. 個別許可が一般規約に優先し、解除条件をすべて満たすことを確認してsource policy evidenceを作る。
2. response schemaと5 fixtureを作り、pure parser testを先に固定する。
3. `magapoke.ts`へpagination、checkpoint、URL検証、candidate変換を実装する。
4. #061 registryへfactoryを登録し、local HTTP serverで許可外path、画像、host外redirectをrequest
   しないことを検証する。
5. docsを更新し、stagingでinitial backfill、再実行、incrementalを確認する。外部requestとpolicy
   変更は`audit.md`へ記録する。

## 受け入れ条件

- 一般規約に優先する個別許可の範囲内で、許可host/pathだけをrate以下でrequestする。
- 作品、作者、公開話、日時、URL、年齢区分をcandidateへ変換し、再処理で重複を作らない。
- 公開終了を履歴付きで非公開へ遷移し、schema変更や未知値ではcheckpointを進めない。
- 個別許可またはAPIが提供されない、あるいは権利者が拒否した場合はconnectorを作らずpolicyを
  `rejected`にし、#018を許可済み別siteへ差し替えるissueを作って本issueを`done`にする。

## テスト

- pure parser: 正常、最終page、未知値、欠落、重複、cursor loop、invalid URL。
- local HTTP: allowlist、redirect、content type、5 MiB、429、ETag/304、画像非取得。
- 実PostgreSQL: backfill/incremental、再実行、公開終了、rollback、policy stop。
- `bun run check`
- `bun test`

## 対象外

- HTML scraping、browser操作、app/内部/認証付きAPI、漫画本文、画像、viewer、あらすじ転載。
- permission交渉そのものとAPI契約にない値の推測。

## Blocker

2026-07-28時点で個別permissionは#068で承認済みだが、checkpoint、通常巡回、backfill、公開終了を
実行するworker基盤#061が未完了である。

## 解除条件

#061が`done`で、[利用判断](../docs/source-permissions/magapoke.md)に従うconnector runnerを利用できること。

## 解除後の着手点

`packages/connectors/src/magapoke.ts`へ許可host/pathとresponseのValibot schemaを記述する。

## 禁止する代替

HTMLやapp通信の解析、robots.txtの`Allow`を許可とみなす取得、非公開endpointの推測、個別許可前の
fixture採取や試験requestを行わない。
