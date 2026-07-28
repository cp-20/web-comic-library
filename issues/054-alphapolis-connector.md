---
id: 054
title: 許可されたアルファポリスmetadata APIを接続する
type: feature
status: blocked
priority: P2
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: [009, 010, 014, 061, 070]
umbrella: 018
---

# 許可されたアルファポリスmetadata APIを接続する

## 目的と利用場面

アルファポリスの漫画作品と公開話を、権利者が許可した公式metadata APIからcatalogへ取り込み、
利用者が横断検索、follow、更新通知に使えるようにする。

## 背景と現状の問題

現在の対応元は5 siteで、公開ベータの10 site目標に足りない。2026-07-28時点で
[公式利用規約](https://www.alphapolis.co.jp/pages/terms_of_service)から、
第三者serviceが漫画metadataを自動収集、保存、再公開してよいという明示許可や収集用APIを確認できない。
robots.txtや公開pageの閲覧可否は、権利者のcontentを別serviceで再利用する許可にはならない。

## 実装判断と代替案

- 権利者が文書で提供・許可する、認証不要のHTTPS JSON metadata APIだけを使う。文書には漫画だけを
  対象にするfilter、保存・公開field、host/path、rate limit、失効時処理を含める。
- 同service内の小説、投稿作品、画像を誤収集しないため、APIの明示的なcontent typeが`comic`の
  recordだけを受け入れる。題名やURLから漫画か推測しない。
- HTML scraping、browser操作、mobile app/内部API解析は閲覧許可を再利用許可へ読み替えるため使わない。
- RSS/Atomはcontent type、履歴、公開終了、年齢区分を欠く可能性があるため採用しない。
- `ConnectorHttpClient`、`JSON.parse`、Valibotでpure parserを作る。SDK、別HTTP client、
  headless browserは追加しない。
- stable work/episode ID、updated-at、cursor、public state、content type、title、author、canonical URL、
  年齢区分をcontractが保証しない場合は実装せず、欠落値を推測しない。

## スコープと変更対象

| file                                                              | 操作 | 変更内容                                                                   |
| ----------------------------------------------------------------- | ---- | -------------------------------------------------------------------------- |
| `packages/connectors/src/alphapolis.ts`                           | 作成 | API schema、漫画filter、parser、URL正規化、checkpoint、factoryを実装する。 |
| `packages/connectors/src/alphapolis.test.ts`                      | 作成 | pagination、小説除外、公開終了、構造変更、request範囲を検証する。          |
| `packages/connectors/fixtures/alphapolis-discovery-first.json`    | 作成 | 漫画と非漫画を含む最初のpageの匿名fixture。                                |
| `packages/connectors/fixtures/alphapolis-discovery-last.json`     | 作成 | 最終pageとwatermarkのfixture。                                             |
| `packages/connectors/fixtures/alphapolis-publication-active.json` | 作成 | 一漫画作品と公開話の最小fixture。                                          |
| `packages/connectors/fixtures/alphapolis-publication-ended.json`  | 作成 | 公開終了の最小fixture。                                                    |
| `packages/connectors/fixtures/alphapolis-structure-changed.json`  | 作成 | 必須field欠落のfixture。                                                   |
| `packages/connectors/src/index.ts`                                | 変更 | config、type、parser、factoryをexportする。                                |
| `apps/worker/src/connector-registry.ts`                           | 変更 | `alphapolis` source keyをfactoryへ登録する。                               |
| `apps/worker/src/connector-registry.test.ts`                      | 変更 | policy gateとfactory解決を検証する。                                       |
| `docs/connectors.md`                                              | 変更 | 許可revision、content type、API mapping、rate、停止条件を記録する。        |
| `docs/operations.md`                                              | 変更 | policy登録、backfill、停止、permission失効時の手順を書く。                 |

fileの削除、DB schema変更、新しいruntime dependencyはない。production policy変更は`audit.md`へ
記録する。

## component間の契約

`alphapolisConfig`は`key: 'alphapolis'`、公式名、許可済みbase/discovery/publication URL、
allowlist host、API文書の漫画content type値をreadonlyで持つ。HTTPS、user infoなし、
許可host/path一致を必須にし、query keyは`cursor`と`updatedAfter`だけにする。

API fieldはworkのstable ID/content type/title/ordered authors/canonical URL/updated-at/age rating/
public stateと、episodeのstable ID/title/canonical URL/published-at/kind/public stateへ一対一で対応する。
pageはopaque `nextCursor | null`を返す。実field名とのmappingを`docs/connectors.md`へ残す。

checkpointは
`{ cursor: string | null, seenIdsAtWatermark: string[], watermark: string }`。途中pageではwatermarkを
変えず、最終pageで最大updated-atへ進める。同時刻IDをsortして保持する。initial/backfill/
incrementalのcheckpoint分離とqueue優先度は#061を使う。

明示的な漫画かつ公式作品だけを`kind: 'official'`にする。小説、投稿作品、未知content type、
未知episode kind/年齢区分、欠落、重複ID、cursor loop、host外URLは、除外または推測でなく
`ConnectorValidationError`にしてcrawl全体を止める。公開終了は#061の
`availability: 'ended'`としてingestionへ渡し、物理削除しない。

## 実装手順

1. 許可文書とAPI contractが解除条件を満たし、漫画content typeが明文化されていることを確認する。
2. response schemaと5 fixtureを作り、漫画だけを受理するpure parser testを先に固定する。
3. `alphapolis.ts`へpagination、checkpoint、URL検証、candidate変換を実装する。
4. #061 registryへfactoryを登録し、local serverで許可外path、画像、host外redirectへrequestしない
   ことを検証する。
5. docsを更新し、stagingでinitial backfill、再実行、incrementalを確認する。外部requestとpolicy
   変更は`audit.md`へ記録する。

## 受け入れ条件

- 許可host/pathだけをrate以下でrequestし、漫画作品、作者、公開話、日時、URL、年齢区分を変換する。
- 小説、投稿作品、未知content typeをcatalogへ入れない。
- response/checkpoint再処理で作品、話、release eventを重複させない。
- 公開終了を履歴付きで非公開へ遷移し、schema変更や未知値ではcheckpointを進めない。
- APIが提供されない、または保存・再公開が拒否された場合はconnectorを作らずpolicyを`rejected`にし、
  #018を許可済み別siteへ差し替えるissueを作って本issueを`done`にする。

## テスト

- pure parser: 正常、非漫画、最終page、未知値、欠落、重複、cursor loop、invalid URL。
- local HTTP: allowlist、redirect、content type、5 MiB、429、ETag/304、画像非取得。
- 実PostgreSQL: backfill/incremental、再実行、公開終了、rollback、policy stop。
- `bun run check`
- `bun test`

## 対象外

- 小説、利用者投稿、HTML scraping、browser操作、app/内部/認証付きAPI。
- 漫画本文、画像、viewer、あらすじ転載、permission交渉、APIにない値の推測。

## Blocker

2026-07-28時点で漫画metadata permissionは#070で承認済みだが、checkpoint、通常巡回、backfill、
公開終了を実行するworker基盤#061が未完了である。

## 解除条件

#061が`done`で、[利用判断](../docs/source-permissions/alphapolis.md)に従うconnector runnerを利用できること。

## 解除後の着手点

`packages/connectors/src/alphapolis.ts`へ許可host/path、漫画content type、Valibot schemaを書く。

## 禁止する代替

HTMLやapp通信の解析、robots.txtだけを許可とみなす取得、URLからの漫画判定、非公開endpointの推測、
許可前のfixture採取や試験requestを行わない。
