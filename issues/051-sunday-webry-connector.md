---
id: 051
title: 許可されたサンデーうぇぶりmetadata APIを接続する
type: feature
status: blocked
priority: P2
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: [009, 010, 014, 061, 067]
umbrella: 018
---

# 許可されたサンデーうぇぶりmetadata APIを接続する

## 目的と利用場面

サンデーうぇぶりの作品と公開話を、権利者が許可した公式metadata APIからcatalogへ取り込み、
利用者が掲載元をまたいで検索、follow、更新通知に使えるようにする。

## 背景と現状の問題

現在の対応元は5 siteで、公開ベータの10 site目標に足りない。一方、2026-07-28に確認した
[公式利用規約](https://blog.www.sunday-webry.com/terms_of_service)はservice/contentの複製を
制限しており、第三者serviceによるmetadataの自動収集、保存、再公開を明示的に許可していない。
公開pageをbrowserで閲覧できることやrobots.txtの有無はpermissionの代わりにならない。

## 実装判断と代替案

- 権利者が文書で提供・許可する、認証不要のHTTPS JSON metadata APIだけを使う。許可文書には
  保存・公開できるfield、host/path、rate limit、permission失効時の処理を含める。
- HTML scraping、browser自動操作、mobile app通信や内部APIの解析は、閲覧許可を自動再利用の許可へ
  読み替えることになるため採用しない。
- RSS/Atomは履歴、公開終了、年齢区分を欠く可能性があるため、このissueの実装手段にしない。
  公式feedだけが将来提供された場合は、その完全性と権利範囲を決める別issueにする。
- `ConnectorHttpClient`、`JSON.parse`、Valibotを使い、parserはpure functionにする。SDK、別HTTP
  client、headless browserは追加しない。
- stable work/episode ID、updated-at、cursor、公開状態、title、author、canonical URL、年齢区分を
  API contractが保証しない場合は実装せず、題名や順序から補わない。

## スコープと変更対象

| file                                                                | 操作 | 変更内容                                                       |
| ------------------------------------------------------------------- | ---- | -------------------------------------------------------------- |
| `packages/connectors/src/sunday-webry.ts`                           | 作成 | API schema、parser、URL正規化、checkpoint、factoryを実装する。 |
| `packages/connectors/src/sunday-webry.test.ts`                      | 作成 | pagination、公開終了、構造変更、request範囲を検証する。        |
| `packages/connectors/fixtures/sunday-webry-discovery-first.json`    | 作成 | 最初のpageとcursorの匿名fixture。                              |
| `packages/connectors/fixtures/sunday-webry-discovery-last.json`     | 作成 | 最終pageとwatermarkのfixture。                                 |
| `packages/connectors/fixtures/sunday-webry-publication-active.json` | 作成 | 一作品と公開話の最小fixture。                                  |
| `packages/connectors/fixtures/sunday-webry-publication-ended.json`  | 作成 | 公開終了の最小fixture。                                        |
| `packages/connectors/fixtures/sunday-webry-structure-changed.json`  | 作成 | 必須field欠落のfixture。                                       |
| `packages/connectors/src/index.ts`                                  | 変更 | config、type、parser、factoryをexportする。                    |
| `apps/worker/src/connector-registry.ts`                             | 変更 | `sunday-webry` source keyをfactoryへ登録する。                 |
| `apps/worker/src/connector-registry.test.ts`                        | 変更 | policy gateとfactory解決を検証する。                           |
| `docs/connectors.md`                                                | 変更 | 許可revision、API field mapping、rate、停止条件を記録する。    |
| `docs/operations.md`                                                | 変更 | policy登録、backfill、停止、permission失効時の手順を書く。     |

fileの削除、DB schema変更、新しいruntime dependencyはない。production policyを変更する場合は
`audit.md`へ操作を記録する。

## component間の契約

`sundayWebryConfig`は`key: 'sunday-webry'`、公式名、許可済みbase/discovery/publication URL、
allowlist hostをreadonly値で持つ。HTTPS、user infoなし、allowlist hostと許可path一致を必須にし、
query keyは`cursor`と`updatedAfter`だけを許可する。

API文書のfield名を、workのstable ID/title/ordered authors/canonical URL/updated-at/age rating/
public stateと、episodeのstable ID/title/canonical URL/published-at/kind/public stateへ一対一で対応させ、
表を`docs/connectors.md`へ残す。pageはopaque `nextCursor | null`を返すことを必須にする。

checkpointは
`{ cursor: string | null, seenIdsAtWatermark: string[], watermark: string }`。途中pageではwatermarkを
変えず次cursorだけを保存し、最終pageで最大updated-atへ進める。同時刻IDをsortして保持し、再開時の
重複通知を防ぐ。initial/backfill/incrementalの別checkpointとqueue優先度は#061のrunnerを使う。

公式作品は`kind: 'official'`とする。未知のepisode kind/年齢区分、欠落、重複ID、cursor loop、
host外URLは`ConnectorValidationError`にし、checkpointと既存catalogを維持する。公開終了は#061で
定義する`availability: 'ended'`としてingestionへ渡し、物理削除しない。

## 実装手順

1. 許可文書とAPI contractが解除条件を満たすことを確認し、Secretなしのsource policy evidenceを作る。
2. response schemaと5 fixtureを作り、pure parserの正常・異常testを先に書く。
3. `sunday-webry.ts`へpagination、checkpoint、URL検証、candidate変換を実装する。
4. #061のregistryへfactoryを登録し、local HTTP serverで許可path以外・画像・host外redirectを
   requestしないことを検証する。
5. docsを更新し、stagingでinitial backfill、同checkpoint再実行、incrementalを確認する。
   外部requestとpolicy変更は`audit.md`へ記録する。

## 受け入れ条件

- 許可host/pathだけをrate limit以下でrequestし、作品、作者、公開話、日時、URL、年齢区分を変換する。
- 同じresponse/checkpointの再処理で作品、話、release eventを重複させない。
- 公開終了を履歴付きで非公開へ遷移し、schema変更や未知値ではcheckpointを進めない。
- APIが提供されない、または保存・再公開が拒否された場合はconnectorを作らずpolicyを`rejected`にし、
  #018を許可済みの別siteへ差し替えるissueを作って本issueを`done`にする。

## テスト

- pure parser: 正常、最終page、未知値、欠落、重複、cursor loop、invalid URL。
- local HTTP: allowlist、redirect、content type、5 MiB、429、ETag/304、画像非取得。
- 実PostgreSQL: backfill/incremental、再実行、公開終了、rollback、policy stop。
- `bun run check`
- `bun test`

## 対象外

- HTML scraping、browser操作、内部・認証付きAPI、漫画本文、画像、viewer、あらすじ転載。
- permission交渉そのものとAPI契約にない値の推測。

## Blocker

2026-07-28時点でpermissionは#067で承認済みだが、checkpoint、通常巡回、backfill、公開終了を
実行するworker基盤#061が未完了である。

## 解除条件

#061が`done`で、[利用判断](../docs/source-permissions/sunday-webry.md)に従うconnector runnerを
利用できること。

## 解除後の着手点

`packages/connectors/src/sunday-webry.ts`へ許可host/pathとresponseのValibot schemaを記述する。

## 禁止する代替

HTMLやapp通信の解析、robots.txtだけを根拠にした取得、非公開endpointの推測、許可前のfixture採取や
試験requestを行わない。
