---
id: 050
title: 許可されたヤンマガWeb metadata APIを接続する
type: feature
status: blocked
priority: P2
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: [009, 010, 014, 061, 066]
umbrella: 018
---

# 許可されたヤンマガWeb metadata APIを接続する

## 目的と利用場面

ヤンマガWebで公開された作品と話を、権利者が許可した公式metadata APIだけからcatalogへ取り込み、
利用者が横断検索、follow、更新通知に使えるようにする。

## 背景と現状の問題

現在の対応元は共通feed型3 site、ニコニコ漫画、カドコミの5 siteであり、公開ベータの10 site目標を
満たさない。一方、2026-07-28に確認した[公式利用規約](https://yanmaga.jp/term)から、第三者serviceが
公開metadataを自動収集、保存、再公開してよいという許可は確認できない。commercial useの制限もある。
robots.txtやbrowserで閲覧できることだけを許可根拠にはできない。

## 実装判断と代替案

- 権利者が文書で提供・許可する、認証不要のHTTPS JSON metadata APIだけを使う。書面には
  permitted fields、保存・公開可否、host/path、rate limit、利用終了時の処理を含める。
- 公開HTML scrapingは、閲覧許可と自動再利用許可を混同し、構造変更も契約として検出できないため
  採用しない。browser自動操作、内部API推測、mobile app解析、規約を回避するproxyも使わない。
- RSS/Atomは新着通知用に履歴や公開終了を省く可能性があるため、このissueでは採用しない。将来公式
  feedだけが提供された場合は、権利範囲と完全性を確認した別issueへする。
- JSONは`JSON.parse`後にValibotで厳密検証し、I/Oを持たないparserで
  `PublicationCandidate`へ変換する。既存の`ConnectorHttpClient`を使い、新しいHTTP library、
  SDK、headless browserは追加しない。
- API契約にstable work/episode ID、更新日時、cursor、公開状態、title、author、canonical URL、
  年齢区分が一つでもない場合は実装しない。題名や配列位置から欠落値を推測しない。

## スコープと変更対象

| file                                                           | 操作 | 変更内容                                                                      |
| -------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------- |
| `packages/connectors/src/yanmaga.ts`                           | 作成 | API schema、pure parser、URL正規化、checkpoint、connector factoryを実装する。 |
| `packages/connectors/src/yanmaga.test.ts`                      | 作成 | parser、pagination、公開終了、構造変更、request範囲を検証する。               |
| `packages/connectors/fixtures/yanmaga-discovery-first.json`    | 作成 | 最初のpageと`nextCursor`だけを含む匿名fixture。                               |
| `packages/connectors/fixtures/yanmaga-discovery-last.json`     | 作成 | 最終pageとwatermark更新を検証するfixture。                                    |
| `packages/connectors/fixtures/yanmaga-publication-active.json` | 作成 | 一作品と公開話の最小fixture。                                                 |
| `packages/connectors/fixtures/yanmaga-publication-ended.json`  | 作成 | 公開終了を表す最小fixture。                                                   |
| `packages/connectors/fixtures/yanmaga-structure-changed.json`  | 作成 | 必須field欠落でfail closedするfixture。                                       |
| `packages/connectors/src/index.ts`                             | 変更 | type、config、parser、factoryをpackage exportする。                           |
| `apps/worker/src/connector-registry.ts`                        | 変更 | `yanmaga` source keyをfactoryへ登録する。                                     |
| `apps/worker/src/connector-registry.test.ts`                   | 変更 | 未許可policyでは生成・requestせず、許可済みkeyだけ解決する。                  |
| `docs/connectors.md`                                           | 変更 | 許可文書のrevision、API contract、field mapping、rate limit、停止条件を書く。 |
| `docs/operations.md`                                           | 変更 | policy登録、初回backfill、停止、permission失効時のretire手順を書く。          |

fileの削除、DB schema変更、新しいruntime dependencyはない。productionのpolicy登録を行う場合だけ、
操作と結果を`audit.md`へ追記する。

## component間の契約

`yanmagaConfig`は`key: 'yanmaga'`、公式名、許可文書に記載されたbase URL、discovery URL、
publication URL template、allowlist hostをreadonly値で持つ。URLはHTTPS、user infoなし、
allowlist host一致、API文書にあるpathだけを許可し、query keyは`cursor`と`updatedAfter`だけにする。

API文書のfield名を次のsemantic値へ一対一で対応させ、その表を`docs/connectors.md`へ残す。

- work: stable ID、title、ordered authors、canonical HTTPS URL、updated-at、age rating、public/ended state
- episode: stable ID、title、canonical HTTPS URL、published-at、kind、public/ended state
- page: opaque `nextCursor`または`null`

checkpointは
`{ cursor: string | null, seenIdsAtWatermark: string[], watermark: string }`とする。巡回途中は同じ
watermarkと次cursorを保存し、最終pageだけで最大updated-atへwatermarkを進める。同時刻のIDは
sortして保存し、再開時に再通知しない。初回backfillと通常巡回のqueue・checkpoint分離は#061の
runnerを使う。

公開中の公式作品は`kind: 'official'`、APIの明示的なepisode kindだけをdomain値へ対応させる。
未知のkindや年齢区分、欠落field、重複ID、cursor loop、host外URLは
`ConnectorValidationError`とし、checkpointと既存catalogを変更しない。公開終了は#061で定義する
`availability: 'ended'`としてingestionへ渡し、物理削除しない。

## 実装手順

1. 受領した許可文書をSecretを含めず保存可能なevidenceへ要約し、source policyを`allowed`にする
   revisionを準備する。文書とAPI contractが解除条件を満たさなければ実装しない。
2. API responseのValibot schemaと5 fixtureを作り、parserの正常・異常testを先に固定する。
3. `yanmaga.ts`でURL正規化、pagination、checkpoint、candidate変換を実装する。
4. #061のregistryへfactoryを登録し、local HTTP serverで許可path以外、画像、redirect先hostへ
   requestしないことを検証する。
5. docsを更新し、stagingでinitial backfill、同じcheckpointからの再実行、incrementalを順に確認する。
   外部serviceへrequestする検証は事前にpolicyを有効化し、`audit.md`へ記録する。

## 受け入れ条件

- 許可されたAPI host/pathだけを、文書のrate limit以下でrequestする。
- 作品、作者、公開話、日時、canonical URL、年齢区分を決められたcandidateへ変換する。
- 同じresponseとcheckpointの再処理で作品、話、release eventを重複させない。
- 公開終了は既存dataを即時削除せず公開対象外へ遷移し、履歴を保つ。
- schema変更、cursor loop、未知値ではcrawlを失敗させ、checkpointを進めない。
- APIが提供されない、または権利者が保存・再公開を許可しないと回答した場合はconnectorを作らず、
  policyを`rejected`として記録し、#018の対象を許可済みの別siteへ差し替えるissueを作って本issueを
  `done`にする。

## テスト

- pure parser: 正常、最終page、未知kind、未知年齢区分、欠落、重複ID、invalid URL。
- local HTTP: allowlist、redirect、content type、5 MiB、429、ETag/304、画像非取得。
- 実PostgreSQL: initial/backfill/incremental、再実行、公開終了、rollback、policy stop。
- `bun run check`
- `bun test`

## 対象外

- HTML scraping、browser操作、内部・認証付きAPI、漫画本文、画像、viewer manifest。
- API契約にない値の推測、公式あらすじの転載、permission交渉そのもの。

## Blocker

2026-07-28時点でpermissionは#066で承認済みだが、checkpoint、通常巡回、backfill、公開終了を
実行するworker基盤#061が未完了である。

## 解除条件

#061が`done`で、[利用判断](../docs/source-permissions/yanmaga.md)に従うconnector runnerを利用できること。

## 解除後の着手点

`packages/connectors/src/yanmaga.ts`へ、受領したhost/pathとresponseのValibot schemaを記述する。

## 禁止する代替

公開HTMLやapp通信の解析、robots.txtだけを根拠にした取得、非公開endpointの推測、許可を得る前の
fixture採取や試験requestを行わない。
