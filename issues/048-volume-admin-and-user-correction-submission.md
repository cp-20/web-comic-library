---
id: 048
title: 利用者の巻・話対応候補をcatalog管理で審査する
type: feature
status: review
priority: P1
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: [015, 016, 020, 023, 058]
umbrella: 007
---

# 利用者の巻・話対応候補をcatalog管理で審査する

## 目的

単行本を読んだ利用者が「この巻にはこの話が収録される」という修正候補を根拠付きで送り、
強い認証を持つcatalog管理者が内容を確認して共有mappingへ反映または却下できるようにする。

## 背景と現状の問題

#023により、`POST /api/library/volumes/mapping-corrections`は認証済み利用者の候補を
`catalog_review_items(kind = user_correction)`へ保存できる。#015の管理APIはqueueを一覧できるが、
現行の`POST /api/admin/catalog/review-items/{id}/resolve`はstatusを`resolved`へ変えるだけで、
payloadを型検証せず、`volume_content_mappings`を更新しない。管理画面もqueueの根拠、対象巻、
対象話、提案statusを表示しない。

そのため候補を解決済みにしてもcatalogは改善せず、管理者がDBを直接変更すると理由、変更前後、
操作者を`catalog_merge_audits`へ一transactionで残せない。利用者候補を投稿時点で即時反映すると、
誤対応が他利用者の巻既読からWeb話既読へ伝播する。

## 実装判断と代替案

- 既存の`catalog_review_items`、`volume_content_mappings`、`catalog_merge_audits`を同じPostgreSQL
  transactionで更新する。新しいworkflow libraryや別queueは追加しない。既存tableが候補、共有状態、
  監査の責務を既に分離しており、二重管理を避けられる。
- 利用者の`submittedBy`はqueue payloadに保持するが、公開APIと管理画面では内部user UUIDを表示しない。
  abuse調査はDBの監査経路で行い、通常の審査に個人識別子は不要である。
- 管理者は利用者の`suggestedStatus`をそのまま承認せず、`confirmed`、`unconfirmed`、`rejected`を
  最終入力として明示する。自動承認や多数決は誤った既読伝播を起こすため採用しない。
- 汎用`JsonValue`のままhandlerでfieldを読む方式をやめ、applicationで
  `VolumeMappingCorrectionReviewItem`へnarrowする。HTTP入力だけをValibotで検証し、domain/application
  からValibotへ依存しない。
- 既存のIP単位rate limiterへ1分10件のscopeを追加する。Redisは単一instanceの初期構成には過剰で、
  永続的なquotaも要件ではない。

## スコープ

- 利用者候補のvalidation、1分10件のrate limit、重複時の既存open item返却。
- `user_correction` payloadの型付きread modelと、他kindを混在させない管理queue。
- 管理者によるmapping status確定、queue解決、変更前後のauditを一transactionで行うcommand。
- 管理画面での巻、話、提案、根拠、作成日時、最終status、管理理由の表示と操作。

## 変更対象

| file                                                                                            | 操作 | 変更内容                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain/src/catalog-admin.ts`、`packages/domain/src/catalog-admin.test.ts`             | 変更 | 最終mapping statusと3文字以上2,000文字以下の管理理由を検証するcommand規則を追加する。                                       |
| `packages/application/src/catalog-admin.ts`、`packages/application/src/catalog-admin.test.ts`   | 変更 | `VolumeMappingCorrectionReviewItem` union、審査use case、repository methodを追加する。                                      |
| `packages/application/src/volume-library.ts`、`packages/application/src/volume-library.test.ts` | 変更 | correction保存portと投稿use caseがdedupe後のreview item IDを返すようにする。                                                |
| `packages/contracts/src/catalog-admin.ts`、`packages/contracts/src/index.ts`                    | 変更 | `{ status, reason }`のValibot schemaとreview item paramsを公開する。                                                        |
| `packages/db/migrations/0024_catalog_volume_correction_review.sql`                              | 作成 | audit operation enumへ`resolve_volume_content_mapping_correction`を追加する。着手時に0024が使用済みなら次の連番へ変更する。 |
| `packages/db/src/catalog-admin.ts`、`packages/db/src/catalog-admin.integration.test.ts`         | 変更 | payload narrow、mapping upsert、review resolve、audit insertを一transactionで実装・検証する。                               |
| `packages/db/src/volume-library.ts`、`packages/db/src/volume-library.integration.test.ts`       | 変更 | dedupe済みopen itemのIDを返し、同じ利用者・巻・話の連打でqueueを増やさない。                                                |
| `apps/api/src/app.ts`、`apps/api/src/app.test.ts`                                               | 変更 | 利用者routeのrate limitと、管理者用`POST /api/admin/catalog/review-items/{id}/volume-mapping-resolution`を追加する。        |
| `apps/web/src/app/admin/catalog/page.tsx`                                                       | 変更 | queue一覧、型付き巻・話候補、根拠、status、理由form、成功・失敗状態を追加する。                                             |
| `apps/web/src/app/library/volumes/volume-library-controls.tsx`                                  | 変更 | queued responseを表示し、二重submitを防止する。                                                                             |
| `docs/api.md`、`docs/database.md`、`docs/web.md`                                                | 変更 | 審査route、transaction、確認前後の既読反映規則を追記する。                                                                  |

## component間の契約

利用者routeは既存requestを維持し、成功時に`{ reviewItemId, status: 'queued' }`を200で返す。同じ
利用者、巻、話にopen itemがある場合はpayloadの`rationale`と`suggestedStatus`を最新入力へ更新し、
同じIDを返す。別利用者の候補とはdedupeしない。

管理者routeは次を受ける。

```ts
type ResolveVolumeMappingCorrectionRequest = Readonly<{
  reason: string;
  status: 'confirmed' | 'unconfirmed' | 'rejected';
}>;
```

対象itemは`kind = user_correction`、`status = open`、payloadの
`type = volume_content_mapping`でなければ409を返す。未認証は401、弱いsessionまたは非administratorは
403、不正入力は400、不存在は404とする。

use caseは巻と話が同じactive workに属することを再確認してからmappingをupsertする。
`confirmed`だけが以後の巻既読からWeb話既読へ反映される。過去の利用者巻既読に遡ってread recordを
作らず、次回その利用者が巻を`read`へ保存した時点から適用する。同じtransactionでreview itemを
resolvedにし、auditへitem ID、volume ID、content ID、旧status、新status、操作者、管理理由を保存する。
投稿者UUIDとrationaleはauditの公開read modelへ含めない。

## 実装手順

1. domain commandとapplication read modelを追加し、別kind、壊れたpayload、同一work違反、弱いactorを
   失敗させるunit testを書く。
2. migrationとDB repositoryを追加し、mapping・review・auditのいずれかが失敗した場合に全rollback
   するintegration testを追加する。
3. 利用者routeのdedupe responseとrate limit、管理routeのstatus mappingをHono RPC testへ追加する。
4. 管理画面をqueue read modelで描画し、raw JSONとsubmittedByを表示しない。処理済みitemはformから
   除外し、再submit時の409を説明する。
5. docsを更新し、Web buildを含む完了commandを実行する。

## 受け入れ条件

- active accountだけが候補を投稿でき、同じ候補の再送でopen itemが増えない。
- 1 IPから1分11件目は429と`Retry-After`を返す。
- 強いadministratorだけが候補を`confirmed`、`unconfirmed`、`rejected`へ確定できる。
- mapping、queue status、auditが一transactionで更新され、失敗時はどれも変わらない。
- `confirmed`前の候補と、過去の巻既読からWeb話既読を作らない。
- 管理画面とAPI responseに投稿者UUID、raw payload、個人情報を表示しない。
- 同じitemの再処理は409となり、auditを重複作成しない。

## テスト

- applicationのactor、payload、同一work、status分岐test
- PostgreSQLのupsert、rollback、dedupe、audit integration test
- Hono RPCの401、403、400、404、409、429、200 test
- `bun run check`
- `bun test`
- `bun run build:web`

## 対象外

- 複数管理者の承認workflow。
- `VolumeEdition`自体の統合・分割、ISBN変更、書誌provider dataの手動上書き。
- 過去の巻既読への遡及適用。
- 利用者による作品・作者・掲載先の自由記述修正。
