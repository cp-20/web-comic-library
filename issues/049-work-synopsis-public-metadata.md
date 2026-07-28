---
id: 049
title: 管理者が根拠付きの作品概要を公開する
type: feature
status: review
priority: P1
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: [008, 017, 058]
umbrella: 007
---

# 管理者が根拠付きの作品概要を公開する

## 目的と利用場面

作品を初めて見つけた利用者が、作品ページと検索・共有previewで内容を判断できるようにする。
catalog管理者は公式作品ページなどの根拠を確認し、自分の言葉で500文字以内の概要を書いて公開、
差し替え、取り下げできる。

## 背景と現状の問題

#017で公開作品の作者、掲載先、Web話、単行本を表示できるようになったが、
`packages/application/src/catalog.ts`の`WorkCatalogReadModel`には概要がない。
`apps/web/src/app/works/[workId]/page.tsx`のmetadataも固定文言のため、検索結果や共有previewだけでは
作品を区別しにくい。

connectorが取得した公式あらすじをそのまま公開する方式は採用しない。metadata収集の許可が、文章の
転載や二次利用まで許可するとは限らず、取得元ごとに権利条件も異なるためである。漫画本文、viewer
response、利用者reviewを要約する方式も、収集範囲と権利・privacyの境界を広げるため採用しない。

## 実装判断と代替案

- 概要は管理者が根拠を読んで作る短い事実説明とし、公式文のcopyではないことを登録画面で明示する。
- 現在の公開版だけを`works`へ上書きせず、`work_synopsis_revisions`へappendして差し替え履歴を残す。
  一つの作品に`retired_at is null`の行を一つだけ許可する。
- 公開APIは`body`だけを`WorkCatalogReadModel.synopsis`として返す。根拠URL、確認日時、操作理由、
  operator IDは管理APIだけの情報とし、公開responseやHTMLへ出さない。
- #058と同じcatalog administratorかつ強いsessionだけが更新できる。新しい認可方式は作らない。
- 入力検証はrepositoryで既に使うValibot、transactionと永続化は既存の`postgres` adapterを使う。
  小さな文字列・URL検証のためにCMS、Markdown renderer、履歴libraryは追加しない。
- MarkdownとHTMLを許可せずplain textだけにする。sanitize libraryで任意HTMLを受ける方式より、
  XSSと表示差を入力境界でなくせるためである。

## スコープと変更対象

| file                                                  | 操作 | 変更内容                                                                                            |
| ----------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| `packages/db/migrations/<次の連番>_work_synopses.sql` | 作成 | revision table、部分unique index、check制約、catalog audit enum値を追加する。                       |
| `packages/db/src/catalog-schema.ts`                   | 変更 | `workSynopsisRevisions`のDrizzle schemaをexportする。                                               |
| `packages/domain/src/catalog-admin.ts`                | 変更 | plain text、HTTPS根拠URL、確認日時、理由を検証するcommandを追加する。                               |
| `packages/domain/src/catalog-admin.test.ts`           | 変更 | 空白、501文字、HTTP URL、未来の確認日時を拒否するtestを追加する。                                   |
| `packages/application/src/catalog.ts`                 | 変更 | 公開read modelへ`synopsis: string \| null`を追加する。                                              |
| `packages/application/src/catalog-admin.ts`           | 変更 | publish/retire command、repository port、transaction use case、audit operationを追加する。          |
| `packages/application/src/catalog-admin.test.ts`      | 変更 | 認可とtransaction委譲を検証する。                                                                   |
| `packages/contracts/src/catalog-admin.ts`             | 変更 | PUT/DELETEのparamsとbodyをValibotで定義する。                                                       |
| `packages/contracts/src/index.ts`                     | 変更 | 新しいschemaをpackage exportする。                                                                  |
| `packages/db/src/catalog.ts`                          | 変更 | 公開中revisionの本文だけを`findWork`と検索結果へ結合する。                                          |
| `packages/db/src/catalog.integration.test.ts`         | 変更 | 公開・差し替え・取り下げ後のread modelを実PostgreSQLで検証する。                                    |
| `packages/db/src/catalog-admin.ts`                    | 変更 | 行lock、revision更新、audit追加を同じtransactionで行う。                                            |
| `packages/db/src/catalog-admin.integration.test.ts`   | 変更 | 同時更新、履歴、rollback、存在しない作品を検証する。                                                |
| `packages/db/src/index.ts`                            | 変更 | 更新済みadapter型をexportする。                                                                     |
| `apps/api/src/app.ts`                                 | 変更 | 管理PUT/DELETE routeと公開responseを追加する。                                                      |
| `apps/api/src/app.test.ts`                            | 変更 | 200/400/401/403/404/409と非公開情報の不在を検証する。                                               |
| `apps/web/src/app/admin/catalog/page.tsx`             | 変更 | 作品ID、概要、根拠URL、確認日時、理由の公開・取り下げformを追加する。                               |
| `apps/web/src/app/works/[workId]/work-details.tsx`    | 変更 | 概要がある場合だけ「作品概要」sectionをplain textで表示する。                                       |
| `apps/web/src/lib/server-api-client.ts`               | 作成 | `API_ORIGIN`を使うserver専用catalog clientを提供し、browser bundleへ環境値を渡さない。              |
| `apps/web/src/app/works/[workId]/page.tsx`            | 変更 | title、description、Open Graph descriptionを公開APIから生成し、失敗時は固定titleへfail closedする。 |
| `docs/api.md`                                         | 変更 | 管理route、公開field、cacheと非公開fieldを記載する。                                                |
| `docs/web.md`                                         | 変更 | `API_ORIGIN`、作品概要、metadataのfallbackを記載する。                                              |
| `docs/database.md`                                    | 変更 | revisionと一件だけ公開中にする制約を記載する。                                                      |
| `docs/deployment.md`                                  | 変更 | Web serverからAPIへ到達する`API_ORIGIN`を必須設定として記載する。                                   |

fileの削除はない。

## component間の契約

### 永続model

`work_synopsis_revisions`は次のcolumnを持つ。

- `id uuid primary key`
- `work_id uuid not null references works(id)`
- `body text not null`。`btrim(body)`が1〜500文字であるcheckを付ける。
- `source_url text not null`。`https://`から始まり2,048文字以下であるcheckを付ける。
- `source_checked_at timestamptz not null`
- `operator_id text not null`
- `reason text not null`
- `created_at timestamptz not null`
- `retired_at timestamptz null`

`work_id where retired_at is null`へ部分unique indexを付ける。catalog audit enumへ
`publish_work_synopsis`と`retire_work_synopsis`を追加し、revisionの差し替えと同じtransactionで
before/afterを`catalog_merge_audits`へ記録する。

作品をmergeした場合はtarget作品の公開概要を維持し、retireされるsource作品の概要をcopyしない。
作品をsplitした場合も新作品へ概要をcopyしない。文章の内容が新しい作品範囲にも正しいかを自動で
判断できないためである。

### applicationとHTTP

- `PUT /api/admin/catalog/works/:workId/synopsis`
  - body: `{ body, reason, sourceCheckedAt, sourceUrl }`
  - source URLはHTTPS absolute URL、`sourceCheckedAt`は現在以前のISO 8601。
  - 既存の公開revisionをlockしてretireし、新revisionとauditを作り`200`で返す。
- `DELETE /api/admin/catalog/works/:workId/synopsis`
  - body: `{ reason }`
  - 現在のrevisionをretireしてauditを作り`200`。公開revisionがなければ`404`。
- 対象作品がなければ`404`、同時更新でunique制約に競合した場合は`409`。
- 未認証は`401`、権限またはsession assurance不足は`403`、不正入力は`400`。
- `GET /api/catalog/works`と`GET /api/catalog/works/:workId`は`synopsis: string | null`だけを返す。

管理画面は保存成功後にAPIから返ったrevision IDと公開時刻を表示する。失敗時は入力を保持する。
作品ページは`synopsis !== null`の場合だけ表示する。metadata取得が失敗または404なら概要や推測titleを
出さず、現在の固定titleとOG画像URLだけへfallbackする。

## 実装手順

1. domain validator、contract、migration/schemaを追加し、境界値testを先に固定する。
2. application port/use caseとPostgreSQL adapterを実装し、同時差し替えとrollbackを実DBで検証する。
3. catalog public queryへ本文だけを追加し、根拠・operator・retired revisionが返らないtestを追加する。
4. Hono管理routeを既存catalog admin middleware配下へ追加し、status mappingを固定する。
5. 管理画面と作品画面を追加する。概要はJSX text nodeとしてだけ描画する。
6. server API clientと`generateMetadata`を追加し、API障害時のfallbackをtestする。
7. 恒久文書を更新し、全checkを実行する。

## 受け入れ条件

- 強いsessionを持つadministratorが根拠付き概要を公開すると、作品ページ、公開API、description metadataへ
  同じplain textが表示される。
- 差し替え後は新しい一件だけが公開され、旧本文と根拠を管理auditから追跡できる。
- 取り下げ後は公開APIが`synopsis: null`を返し、HTMLとmetadataに旧本文が残らない。
- 未確認revision、根拠URL、operator ID、操作理由は公開responseへ含まれない。
- 作品merge/splitで概要が別作品へ暗黙にcopyされない。

## テスト

- domain/contract: 空白、1文字、500文字、501文字、HTTPS、HTTP、未来日時。
- PostgreSQL: 初回公開、差し替え、取り下げ、部分unique制約、同時更新、transaction rollback、retired work。
- API: 管理者の200、入力400、未認証401、弱いsession/非管理者403、不在404、競合409。
- Web: 概要あり/なし、plain text escaping、metadata、API障害fallback。
- `bun run check`
- `bun test`
- `bun run build:web`

## 対象外

- 公式あらすじの自動取得・転載、生成AIによる要約、Markdown/HTML、翻訳。
- 概要による全文検索ranking。
- 利用者review本文、漫画本文、漫画画像、viewer responseの利用。
