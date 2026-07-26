# データベース実装規則

対象は`packages/db`、SQL migration、transactionを伴うuse caseとする。

- schema変更には前進方向のSQL migrationを付ける。
- unique、foreign key、check、not nullをDBでも保証する。
- transaction境界はapplication use caseが決める。
- 状態変更と通知用eventを同じtransactionへ保存する。
- adapterはapplicationが宣言したportを実装する。
- Drizzleのmodelをdomain modelまたはAPI responseとして公開しない。
- migrationはAPIとworkerの起動前に一度だけ実行する。

migrationには適用後の制約と主要queryを確認する統合テストを付ける。

## identity storage

Better Auth互換の`user`、`session`、`account`、`verification`を保持し、利用者固有の設定は`profiles`と`profile_followers`へ分ける。`profiles.public_id`は一意、ASCII小文字のID規則、予約語禁止をapplicationとDBの両方で守る。account statusは`active`、`disabled`、`pending_deletion`で、session queryは`profiles`とjoinしてactive以外を認証済みにしない。

`profiles.default_visibility`は未設定を許容する。未設定の閲覧判定はapplicationで`private`として解決し、recordごとの上書きが存在する場合は標準値より優先する。follower関係は`profile_followers`の複合主キーと両方のforeign keyで保証する。

## ローカル開発

PostgreSQL 16を起動する。

```sh
docker compose up -d --wait postgres
```

接続先は`postgres://postgres:postgres@127.0.0.1:55432/web_comic_library`である。

migrationだけを適用する場合は次を実行する。

```sh
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/web_comic_library \
  bun run --cwd packages/db migrate
```

実PostgreSQLを使う統合テストは次を実行する。

```sh
bun run test:integration
```

作業後はPostgreSQLを停止する。

```sh
docker compose down
```

## transactionとoutbox

applicationは`TransactionPort`でtransaction境界を定め、同じ`TransactionContext`をDB repositoryと`OutboxPort`へ渡す。
`PostgresFoundation`は業務状態とoutbox eventを同じtransactionへ保存し、rollback時はcommit後処理を実行しない。
outbox eventとGraphile Worker jobは呼び出し側が安定した冪等性keyを指定する。
同じ冪等性keyを再登録した場合は既存データを変更せず`duplicate`を返す。

## catalog storage

媒体横断の`Work`、サイト単位の`Publication`、論理話の`ContentUnit`、閲覧ページの`PublicationEntry`を別tableで保持する。

`Publication`はsource内のexternal IDとnormalized URLをそれぞれ一意にする。

`PublicationEntry`と`ContentUnit`はwork IDを含むcomposite foreign keyで関連付け、別作品間のmappingをdatabaseでも拒否する。

一括掲載と分割掲載は`EntryContentMapping`の多対多関係で保持し、確認状態をmappingごとに記録する。

connector候補は`work_ingestion_keys`のNFKC正規化済み作品名、作者名集合、掲載種別が完全一致した場合だけ既存`Work`へ統合する。話は正規化後の題名、話数、枝番が一対一で一致した場合だけ既存`ContentUnit`へconfirmed mappingを作る。分割掲載や曖昧な対応は別`ContentUnit`として残す。

`release_events`はsource、publication entry、event種別、発生時刻から作るidempotency keyを一意に保持する。初回取込とbackfillのeventは`notification_suppressed`をtrueにし、配信対象にはしない。候補、event、fetch state、checkpoint、成功runは同じtransactionで確定する。

## 単行本書誌

`volume_editions`はISBNまたは出版社商品IDで版を一意に識別し、紙版と電子版を同一視しない。ISBNと商品IDはそれぞれpartial unique indexで冪等登録する。

`volume_provider_records`はopenBD、NDL、出版社ごとの取得可否、取得日時、根拠URL、利用条件URLを保持する。統合後の各fieldは`volume_field_provenances`にprovider、取得日時、利用条件を残す。openBDで削除された既存版は削除せず`withdrawn`と`retired_at`で公開停止する。

`volume_content_mappings`は単行本版と`ContentUnit`の多対多対応と`confirmed`、`unconfirmed`、`rejected`を保持する。複合foreign keyにより別作品の話を対応付けられない。

新規の版は`release_events`へ`new_volume`として同じtransactionで記録する。初回同期のeventは通知抑止し、既存版の再同期ではeventを追加しない。

## catalog管理

管理操作は`catalog_merge_audits`に操作種別、操作者、理由、変更前後、時刻を追記する。`catalog_redirects`はretireした作品または話の旧IDを正規IDへ対応付け、公開queryは旧IDを直接公開せず正規IDへredirectする。

作品統合は掲載先、掲載ページ、話、対応付けを同じtransaction内で正規作品へ移す。話統合は掲載ページ対応を正規話へ集約し、重複mappingでは`confirmed`を失わない。分割は選択された掲載先と話の対応関係が閉じている場合だけ許可し、根拠のない既読対応を作らない。

`catalog_review_items`は解析失敗、種別不明、利用者修正候補を保持する。解析またはvalidation失敗と種別不明候補はdedupe key付きでqueueへ追加し、管理者が解決するまで既存catalog dataを削除しない。

既読や通知履歴から参照される`Work`、`Publication`、`ContentUnit`、`PublicationEntry`は物理削除せず、`retired_at`で廃止状態にする。

## 取得元policy

取得元の利用条件は`source_policy_records`へrevision単位で追記し、上書きしない。

各revisionは収集、営利利用、広告、affiliateの判断、緊急停止状態、変更者、変更日時を保持する。

規約、robots.txt、API、feed、問い合わせ結果の確認日時と根拠URLは`source_policy_evidence`へ保持する。

robots.txtだけを根拠に収集を許可してはならない。

掲載元固有の年齢区分は`source_age_rating_mappings`へrevision単位で追記し、`public`、`excluded`、`review`へ変換する。

公開queryは最新のpolicyが収集許可かつ緊急停止中でなく、最新の年齢区分mappingが`public`である`Publication`だけを返す。

未確認値、mappingのない値、R18、年齢確認が必要な値は公開しない。

`Publication.normalizedUrl`は公式閲覧URLを保持し、購入URLは`purchaseUrl`へ分ける。

## connector state

resource単位のETag、Last-Modified、本文SHA-256、確認日時は`fetch_resource_states`へ保存する。

取得元単位のcheckpoint、連続失敗数、`active`または`stopped`の状態は`source_crawl_states`へ保存する。

巡回ごとの成功件数、解析失敗件数、所要時間、失敗分類は`crawl_runs`へ追記する。

候補保存、fetch resource state、checkpoint、成功runは同じ`TransactionContext`でcommitする。

候補保存またはstate保存に失敗した場合はtransaction全体をrollbackし、checkpointを進めない。

失敗runは連続失敗数の更新と同じtransactionへ保存する。
