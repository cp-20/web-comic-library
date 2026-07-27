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

## library storage

`library_entries`は手動の読書状態と標準公開範囲を保持し、各変更を`library_status_history`へ追記する。`content_read_records`は論理話、`publication_read_records`は実際に読んだ掲載ページを別に保持する。confirmedな`entry_content_mappings`だけをapplication transaction内で両方のread recordへ反映し、未確認mappingは掲載ページ既読を独立に残す。

追いつき状態は保存しない。公開中の`regular`または`extra`掲載ページにconfirmed mappingを持つ論理話と、利用者の`content_read_records`からquery時に再計算する。

## follow設定 storage

`user_source_preferences`は利用者ごとの掲載先優先順位を連番で一度だけ保持し、作品ごとに複製しない。`work_follow_settings`は作品単位の方式を、`subscription_publications`は掲載先指定の対象だけを保持する。いずれも利用者とcatalog entityへのforeign keyで所有者と作品整合性を保証する。

## extensionお気に入りimport storage

`favorite_import_batches`は利用者、24時間の期限、確認・破棄時刻を保持し、確認済みbatchを再適用できない。`favorite_import_candidates`はsource、外部作品ID、canonical URL、表示title、完全一致・曖昧・未照合のsnapshotを保持する。sourceとcanonical URLはbatch内で一意にし、完全一致にはworkとpublicationのforeign keyを必須にする。

extension inputのsource keyは`source_policy_records`の最新revisionでcollectionが`allowed`かつ緊急停止中でない`source`だけをUUIDへ解決してからcandidateへ保存する。未登録またはpolicyで拒否されたkeyはbatchとcandidateを作成しない。

titleだけの一致は`title_match_work_ids`に候補として保存し、自動適用しない。batchのclaim、`LibraryEntry`の任意upsert、follow設定と掲載先指定は同じapplication transactionで確定する。既読recordと進捗recordはこのtransactionで変更しない。

## 単行本library storage

`user_volume_records`は利用者・巻版ごとに未読、読書中、既読、紙所蔵、電子所蔵、話の個人memo、公開範囲を保持する。紙と電子は独立したbooleanであり、巻版と話の対応がなくても記録できる。巻版とmemo話はwork IDを含む複合foreign keyで同一作品に制限する。

巻を既読にしたときだけ、`volume_content_mappings`が`confirmed`の話を同じtransactionで既読へupsertする。巻の状態を未読へ戻しても既存のWeb話既読を削除しない。利用者の対応修正候補は`catalog_review_items`の`user_correction`としてqueueへ追加し、確認前の共有mappingを変更しない。

## 通知storage

`notifications`は利用者、release event、通知種別、経路ごとに冪等性keyを一意に保持し、未読・既読を`read_at`で表す。`notification_preferences`は利用者ごとの種別・経路の明示設定だけを保存し、通常話、番外編、新刊は未設定時に有効、再掲載、公開期間変更、告知は未設定時に無効とapplicationで解決する。

`release_events`のincrementalな新規eventは同じtransactionで`notification_release` jobを冪等登録する。initialとbackfillのeventはjobを登録せず、consumerも`notification_suppressed`を必ず除外する。

## Web Push storage

`web_push_subscriptions`は利用者とbrowser subscription endpointを一意に保持し、再登録時は鍵を更新して再有効化する。`web_push_deliveries`はWeb Push用notificationとsubscriptionの組を冪等に保持する。404/410の恒久失敗はsubscriptionを無効化し、再試行可能な失敗は`queued`のままworkerが再試行する。

## Email digest storage

`email_digest_settings`は利用者ごとの有効状態、timezone、送信時刻、unsubscribe時刻を保持し、標準では無効とする。`email_digests`は利用者とローカル日付ごとの一意な冪等性key、送信状態、試行結果を持つ。`email_digest_notifications`は送信対象notificationを固定し、同じ日を再処理しても二重送信しない。恒久的な送信失敗は設定を停止して記録する。

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

作品検索は`pg_trgm`のGIN indexを`works.title`、`work_aliases.value`、`creators.name`のNFKC正規化・小文字化した値に張る。検索queryも同じくNFKC正規化し、短いtitleは完全一致、前方一致、部分一致の順で順位付けする。人気順に必要な`library_entries(work_id, created_at)` indexは利用者IDや件数を公開queryのresponseへ出さない。

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
