---
id: 061
title: connector巡回をworkerへ配線する
type: platform
status: open
priority: P0
execution: agent
review_required: true
review_status: approved
reviewed_at: 2026-07-28T11:44:59.851Z
depends_on: [009, 010, 014]
umbrella: 007
---

# connector巡回をworkerへ配線する

## 目的と利用場面

許可済みsourceのconnectorを定期的に実行し、通常更新をcatalogと通知へ反映しながら、初回backfillを
低い優先度で停止・再開できるようにする。運営者はsource policyの停止、connectorの連続失敗、
checkpointを使って外部siteへ不要なrequestを送らず復旧できる。

## 背景と現状の問題

`packages/connectors`には共通feed、ニコニコ漫画、カドコミのconnectorがあり、
`packages/application/src/ingestion.ts`には候補保存がある。しかし`apps/worker/src/worker.ts`の
`taskList`にはconnector taskがなく、`apps/worker/src/index.ts`もconnector factory、policy、
ingestion adapterを構築していない。現在の`apps/worker/src/connector.test.ts`は停止gateだけを単体で
呼んでおり、productionでは定期巡回もbackfillも実行されない。

また`source_crawl_states`はsourceごとにcheckpointを一つしか持たないため、通常巡回とbackfillを
交互に実行すると互いのcheckpoint形式を上書きする。`PublicationCandidate`にも公開終了状態がなく、
APIが明示した終了を既存dataを壊さず反映できない。

## 実装判断と代替案

- Graphile Workerの既存processへ`connector_schedule`と`connector_collect`を追加する。別のcron
  service、BullMQ、Temporalを導入するとqueue、retry、metrics、配備processが重複するため使わない。
- 5分ごとのschedulerは許可済みかつregistry対応済みsourceだけを列挙し、sourceごとのjobをenqueueする。
  全sourceを一つのjobで順番に巡回する方式は、一siteの遅延・失敗が他siteとretryを巻き込むため
  採用しない。
- 通常巡回とbackfillは同じtaskを`mode`で分け、Graphile Workerのpriorityを通常`0`、backfill`10`と
  する。別tableや別worker processを作らない。
- checkpointはDB columnを増やさず、既存JSONBを
  `{ backfill: JsonValue | null, incremental: JsonValue | null }`へmigrationする。source単位の停止状態と
  連続失敗数は共有し、どちらかが3回連続失敗したら両modeを停止する。
- connector registryはsource keyからfactoryを解決する明示的なrecordにする。dynamic import、file名
  scan、DBにclass名を保存する方式は、起動時の型検査とallowlistを失うため使わない。
- 外部HTTPはtransaction外で行い、policyをrequest直前とcommit直前に再確認する。候補、release event、
  mode別checkpoint、成功runは既存transactionへまとめる。
- 新しいdependencyは追加せず、payloadはValibot、HTTPは`ConnectorHttpClient`、永続化は既存
  `postgres` adapterを使う。

## スコープと変更対象

| file                                                      | 操作 | 変更内容                                                                        |
| --------------------------------------------------------- | ---- | ------------------------------------------------------------------------------- |
| `packages/contracts/src/connector-job-payload.ts`         | 作成 | collect jobのsource ID/key/mode schemaとparserを定義する。                      |
| `packages/contracts/src/index.ts`                         | 変更 | payload schema/type/parserをexportする。                                        |
| `packages/application/src/connectors.ts`                  | 変更 | mode別checkpoint、batch完了flag、availability、failure処理のportを定義する。    |
| `packages/application/src/connectors.test.ts`             | 作成 | checkpoint選択、停止gate、crawl failure分類を検証する。                         |
| `packages/application/src/ingestion.ts`                   | 変更 | active/ended publication・entryをtransactionでupsert/retireする契約を追加する。 |
| `packages/application/src/ingestion.test.ts`              | 変更 | mode、availability、checkpoint commitを検証する。                               |
| `packages/application/src/source-policy.ts`               | 変更 | collect可能source一覧queryとrequest/commit二重gateの結果型を追加する。          |
| `packages/application/src/source-policy.test.ts`          | 変更 | request前停止とrequest中停止を検証する。                                        |
| `packages/connectors/src/common-feed.ts`                  | 変更 | batchを`complete: true`、candidate/entryを`active`として返す。                  |
| `packages/connectors/src/common-feed.test.ts`             | 変更 | 新しいcontractの回帰testを追加する。                                            |
| `packages/connectors/src/niconico.ts`                     | 変更 | 通常batchの完了とbackfill pageの継続flag、active状態を返す。                    |
| `packages/connectors/src/niconico.test.ts`                | 変更 | backfill継続、完了、mode別checkpointを検証する。                                |
| `packages/connectors/src/kadocomi.ts`                     | 変更 | fetch結果へactive/ended episode状態を保持する。discover対象には登録しない。     |
| `packages/connectors/src/kadocomi.test.ts`                | 変更 | `isActive: false`をendedとして返す回帰testを追加する。                          |
| `packages/db/migrations/<次の連番>_connector_runtime.sql` | 作成 | 既存checkpointをmode別objectへwrapし、shape check制約を付ける。                 |
| `packages/db/src/connector-schema.ts`                     | 変更 | mode別checkpoint shapeをschema commentと型へ反映する。                          |
| `packages/db/src/connector-state.ts`                      | 変更 | modeごとのread/update、成功run、失敗、resumeを実装する。                        |
| `packages/db/src/connector-state.integration.test.ts`     | 変更 | mode分離、migration後read、共有停止、resume、rollbackを検証する。               |
| `packages/db/src/ingestion.ts`                            | 変更 | `ended`を`retired_at`へ反映し、再active化とevent冪等性を実装する。              |
| `packages/db/src/ingestion.integration.test.ts`           | 変更 | publication/entry終了、再開、再処理、backfill通知抑止を検証する。               |
| `packages/db/src/source-policy.ts`                        | 変更 | latest policyがcollect可能なsource ID/key一覧を返す。                           |
| `packages/db/src/source-policy.integration.test.ts`       | 変更 | rejected、emergency stop、重複revisionを除外する。                              |
| `apps/worker/src/connector-registry.ts`                   | 作成 | source keyとfactory、mode別discover関数を明示的に登録する。                     |
| `apps/worker/src/connector-registry.test.ts`              | 作成 | 対応key、未知key、host設定、Kadocomi非登録を検証する。                          |
| `apps/worker/src/source-collection.ts`                    | 作成 | schedulerとcollect handler、failure mapping、継続job投入を実装する。            |
| `apps/worker/src/source-collection.test.ts`               | 作成 | policy gate、priority、commit、retry、継続、metricsを検証する。                 |
| `apps/worker/src/collection-command.ts`                   | 作成 | 運営者がbackfillをenqueueするCLIを実装する。                                    |
| `apps/worker/src/worker.ts`                               | 変更 | 5分cronと二つのtask handlerをtask listへ追加する。                              |
| `apps/worker/src/index.ts`                                | 変更 | policy/state/ingestion/job queue/registry/handlerを構築してcloseする。          |
| `apps/worker/src/connector-command.ts`                    | 変更 | status/resumeにmode別checkpointを表示する。                                     |
| `apps/worker/src/connector.test.ts`                       | 変更 | 旧gate単体testをregistry/handler testへ統合する。                               |
| `apps/worker/src/metrics.ts`                              | 変更 | 成功・失敗・disabled/stoppedと処理時間を記録する。                              |
| `apps/worker/src/metrics.test.ts`                         | 変更 | payloadやsource IDをmetric labelへ出さないことを検証する。                      |
| `apps/worker/package.json`                                | 変更 | `collection`管理command scriptを追加する。                                      |
| `docs/connectors.md`                                      | 変更 | runtime、availability、mode別checkpoint、registryを記載する。                   |
| `docs/worker.md`                                          | 変更 | task、priority、cron、backfill commandを記載する。                              |
| `docs/operations.md`                                      | 変更 | status、停止、再開、backfill、失敗復旧のrunbookを更新する。                     |

削除するfileと追加dependencyはない。

## component間の契約

### candidateとbatch

`PublicationCandidate`と`PublicationEntryCandidate`へ
`availability: 'active' | 'ended'`を必須追加する。existing connectorは、取得元が明示した終了だけ
`ended`にし、一覧から消えたことを終了と推測しない。

`DiscoveryBatch`は次を返す。

```ts
type DiscoveryBatch = Readonly<{
  candidates: readonly PublicationCandidate[];
  checkpoint: JsonValue;
  complete: boolean;
}>;
```

`complete: false`ならcommit後に同じsource/modeの次jobをenqueueし、`true`ならその巡回を終える。
失敗時はcheckpointをcommitしない。

DBのcheckpoint JSONは次のshapeだけを許可する。

```ts
type SourceCheckpoints = Readonly<{
  backfill: JsonValue | null;
  incremental: JsonValue | null;
}>;
```

既存値はmigration時に`incremental`へ移し、`backfill`を`null`にする。application portはmodeを受け、
connectorへ該当する内側の値だけを渡す。成功時は反対modeを保持したまま該当値だけ更新する。

### jobとscheduler

`connectorCollectJobPayload`は
`{ mode: 'backfill' | 'incremental', sourceId: uuid, sourceKey: non-empty string }`。
handlerはDBのsource ID/key一致を再確認し、不一致をvalidation failureにする。

`connector_schedule`は`*/5 * * * *`で起動し、`listCollectableSources()`のうちregistryにあるsourceごとに
`connector_collect`を投入する。idempotency keyは
`connector:{sourceId}:incremental:{UTCの5分bucket}`、priorityは`0`。

backfillは次のcommandだけで開始する。

```sh
bun run --cwd apps/worker collection -- enqueue-backfill SOURCE_KEY
```

初回keyは`connector:{sourceId}:backfill:start`、priorityは`10`。継続keyはcommit済みcheckpointを
canonical JSONでserializeしてSHA-256にした値をsuffixにする。job retryとoperatorの二重実行は同じkeyで
dedupeする。通常jobが待機していればGraphile Workerのpriorityにより先に実行する。

### handlerの処理順

1. payloadをparseし、registryとDB sourceを一致確認する。
2. latest source policyとsource crawl statusを確認する。不可ならHTTPを呼ばず`disabled`または`stopped`。
3. modeのcheckpointでconnectorを一回呼ぶ。1 jobで処理するのは一page/batchだけにする。
4. request完了後にpolicyを再確認する。停止されていれば候補とcheckpointを捨てる。
5. `ingestDiscovery`でcandidate、release event、該当mode checkpoint、crawl runを一transactionでcommit。
6. `complete: false`ならcommit後に継続jobを投入する。

`ConnectorHttpError.code`は同名failure code、`ConnectorValidationError`は`validation`、JSON parse errorは
`parse`、その他は`network`へ丸めずjobを失敗させる。分類可能なcrawl failureは
`recordFailure(..., 3)`へ保存してからthrowし、Graphile Workerのretryを発生させる。3回でsource全体を
stoppedにし、明示resumeまで通常・backfillともrequestしない。

### registry

初期registryへ次だけを登録する。

- `shonen-jump-plus`、`comic-days`、`tonari-no-young-jump`:
  `CommonFeedConnector.discover`を両modeで使い、一回でcompleteにする。
- `niconico`: incrementalは`discover`、backfillは`discoverBackfill`。

Kadocomiは公開一覧discovery endpointを持たず`fetchPublication(reference)`専用なのでschedulerへ
登録しない。#050〜#054は各issueで許可されたfactoryを同じregistryへ追加する。

## 実装手順

1. payload、availability、batch、mode別checkpointのapplication contractを更新し、既存connector testを
   compileさせる。
2. migrationとDB adapterを実装し、mode分離・availability・transaction testを実PostgreSQLで通す。
3. source queryとregistryを追加し、許可sourceと実装済みkeyの積集合だけを返すtestを作る。
4. collect handlerを実装し、request前/commit前policy gate、failure、継続jobをfake portで検証する。
5. Graphile Worker task、5分cron、composition root、CLIを配線する。
6. local HTTP fixtureと実PostgreSQLでincremental、backfill、停止、resume、冪等性を統合検証する。
7. docsを更新する。配備済み環境での停止・再開操作と監査記録は#083、#084へ委ね、このagent issueでは
   実施しない。

## 受け入れ条件

- policyがallowedでregistry対応済みのsourceだけが5分ごとに通常巡回される。
- emergency stopまたは3連続failure後は通常・backfillとも外部requestが0件になる。
- 通常巡回とbackfillのcheckpointが互いを上書きせず、worker再起動後も続きから再開する。
- 通常jobがbackfillより先に実行される。
- candidate、release event、checkpoint、成功runのどれかが失敗すると全てrollbackする。
- 同一job、response、checkpointの再処理でcatalogとrelease eventが重複しない。
- 明示的な公開終了はretireされ、単なる欠落では既存dataをretireしない。
- log、metric、job payloadにHTML、作品名、個人情報、Secretを含めない。

## テスト

- unit: payload、registry、mode checkpoint、failure mapping、priority、continuation key。
- local HTTP: policy gate、timeout、429、parse failure、3回停止、request 0件。
- PostgreSQL: scheduler dedupe、atomic commit、mode分離、retire/reactivate、resume。
- worker process: cron taskとmanual backfillを投入してcheckpointが進むsmoke test。
- `bun run check`
- `bun test`

## 対象外

- Kadocomiのdiscovery endpoint推測、connector対象siteの追加、permission取得。
- 認証付きsource、browser automation、分散lock service、source別worker process。
- 外部siteを使うload testとproduction policyの無断変更。
