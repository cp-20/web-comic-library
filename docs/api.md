# API実装規則

対象は`apps/api`、`packages/api-client`、`packages/contracts`とする。

- Hono routeをchainし、`ApiType`を`@web-comic-library/api/rpc`から型だけ公開する。
- Webへは`hc<ApiType>`を包んだclientだけを公開する。
- HTTP入力は`@hono/valibot-validator`とValibotで検証する。
- HTTP schemaは`packages/contracts`へ置く。
- handlerは入力変換、application use caseの呼び出し、HTTP応答変換だけを行う。
- handlerからDB、認証SDK、通知SDK、外部HTTPを直接呼ばない。
- statusごとに`context.json(body, status)`を明示する。
- 公開JSON APIは作らず、認証済みWeb向けAPIとして扱う。

route変更にはHono RPC clientを通すテストを付ける。

## 認証とprofile API

Better Auth handlerは`/api/auth/*`へmountし、Webが開始する操作はHono RPCの`POST /api/login/google`と`POST /api/logout`へ限定する。Google OAuth開始は固定された`/settings/profile` callbackだけをauth adapterへ渡し、adapterのrate limitとorigin検証を通す。

TOTP enrollmentとverificationはHono RPCの`POST /api/settings/two-factor/enable`、`POST /api/settings/two-factor/verify`だけを通す。verification成功時はauth adapterのsession cookieからtokenをWebへ返さずに読み取り、APIがsession IDに対応するassuranceを保存できた場合だけsuccessを返す。生の`/api/auth/two-factor/enable`と`/api/auth/two-factor/verify-totp`は公開しない。

`GET /api/session`は有効なaccountのsessionだけを返す。`GET /api/profiles/{userId}`はapplicationのVisibility判定を通し、存在しない場合と閲覧できない場合はともに404を返す。`PUT /api/settings/profile`と`POST /api/settings/profile/icon`は有効なsessionを必要とし、icon URLをprofile更新入力で受け取らない。icon uploadだけがapplicationのPNG、容量、寸法検証・sanitizationを経由してstorage portへ渡す。

`POST /api/settings/data-exports`はactive session本人のJSON exportを非同期jobへ投入し、24時間有効なtoken付きdownload URLだけを返す。URLは同じaccountのsessionとtokenを両方必要とし、exportにはsession、account provider token、二要素認証、Web Push subscriptionを含めない。`POST /api/settings/account-deletion`は明示confirmationを要求し、sessionを失効してprofileを`pending_deletion`へ遷移させる。

cookieを伴うstate-changing API requestは同一origin headerを必須とする。感想、いいね、通報はIP単位の短時間rate limitを適用し、超過時は429と`Retry-After`を返す。API responseはCSP、frame拒否、MIME sniffing拒否などのsecurity headerを付ける。

## library API

`POST /api/library/status`は手動読書状態を変更し、`POST /api/library/reads`、`POST /api/library/reads/through`、`DELETE /api/library/reads`は論理話の既読、一括既読、取消をtransactionで実行する。`POST /api/library/publication-reads`は未確認mappingでも読んだ掲載ページだけを記録する。全routeはactive sessionを要求し、公開範囲はrecordごとの値として保存する。

`GET /api/library/volumes`はログイン利用者自身の巻記録だけを返す。`PUT /api/library/volumes/records`は巻ごとの読書状態、紙・電子所蔵、話memo、公開範囲を置換し、既読にした場合だけconfirmedな巻・話対応をWeb既読へ同一transactionで反映する。`POST /api/library/volumes/mapping-corrections`は確認候補を管理queueへ追加するだけで、共有mappingや他利用者の既読を変更しない。

## follow設定 API

`PUT /api/settings/source-preferences`はログイン利用者自身の掲載先優先順位を置換する。`PUT /api/settings/follows`は同じく自身の作品ごとの方式と掲載先指定を一transactionで置換する。どちらもactive sessionを必須とし、他利用者の設定を受け取らない。

## extensionお気に入りimport API

`POST /api/extension/favorite-imports`は`favorites:import` scopeのextension bearer tokenだけを受け付け、source key、外部作品ID、query・fragmentを持たないcanonical URL、表示titleから24時間有効な確認batchを作成する。serverはsource keyを最新policyでcollectionが許可され緊急停止中でないcatalog source UUIDへ内部解決し、未登録または拒否されたkeyではbatchを作成せず403を返す。tokenは通常のHono routeを認証できない。`GET /api/favorite-imports/{batchId}`、`POST /api/favorite-imports/{batchId}/apply`、`POST /api/favorite-imports/{batchId}/discard`はactive sessionのbatch所有者だけが利用でき、他利用者には404を返す。

照合はsource内の外部作品IDまたはcanonical URLの完全一致だけを自動確定する。title一致は表示用候補に留める。applyは確認済みの完全一致だけを一transactionでfollow設定と、利用者が明示した場合だけ`LibraryEntry`へ反映し、既読・進捗を作成しない。batchは確認後または期限切れ後に再適用できない。

## 通知API

`GET /api/notifications`はactive sessionの利用者自身の通知だけをcursor paginationと未読件数で返す。`POST /api/notifications/{id}/read`と`POST /api/notifications/read-all`は同じ利用者の通知だけを既読にする。`PUT /api/settings/notification-preferences`は通知種別・経路ごとの有効状態を保存する。

`GET /api/push/config`はWeb Pushを有効にした場合だけVAPID公開鍵を返す。`PUT`と`DELETE /api/settings/push-subscriptions`はactive session自身のbrowser subscriptionだけを登録、更新、解除する。subscription endpointや鍵は公開APIに出さない。

`PUT /api/settings/email-digest`はactive session自身の更新digestの有効状態、IANA timezone、送信時刻を保存する。`POST /api/settings/email-digest/unsubscribe`は同じ利用者のdigestだけを停止する。いずれも受信先emailや本文をresponseへ含めない。

## 公開catalog API

`GET /api/catalog/works`は`q`、`source`、`status`、`kind`、`sort`で公開作品を検索する。`q`はNFKC正規化し、title、別名、読み仮名、作者名を対象にする。`GET /api/catalog/works/{workId}`は公開済みの作品詳細だけを返す。両routeは最新のsource policyがcollectionを許可し、緊急停止中でなく、年齢区分が`public`の掲載先だけを返し、CDN cache可能なresponse headerを付ける。人気順は直近30日間のlibrary entry数で決めるが、利用者情報と件数はresponseに含めない。

`GET /api/og/works/{workId}.svg`は同じ公開作品判定を通った作品名と作者名だけでSVGを生成する。R2が構成されている場合は公開内容のSHA-256 version keyを先にHEADし、未保存時だけPUTして公開asset URLへ302する。本文、掲載ページ、読書進捗、profileの非公開情報はこのrouteとR2 objectへ渡さない。

## catalog管理API

`/api/admin/catalog/*`は管理者専用とする。routeはsessionを直接解釈せず、composition rootから渡す管理者解決portを使う。解決されたactorは`administrator` roleかつ`passkey`または`two_factor`の強い認証状態でなければならない。

管理commandには理由を必須にし、統合、分割、queue解決の前にapplication use caseを呼ぶ。認証なしは401、一般利用者は403、validation失敗は400を返す。実sessionとpasskey/二要素認証の接続は#020でauth adapterに実装する。

`/api/catalog/redirects/{resource}/{id}`はretire済み作品または話の旧公開IDを正規URLへ302 redirectする。redirect解決に管理者認可は要求しないが、管理queryやcommandは公開しない。

## social API

`POST`と`DELETE /api/profiles/{userId}/follow`はactive sessionの利用者だけがprofileをfollowまたは解除する。`POST /api/settings/follow-requests/{userUuid}`は申請先本人だけが`accepted`または`rejected`へ応答する。`GET /api/settings/follows/users`は本人のfollowersとfollowingだけを返す。

`GET /api/timeline`はactive sessionのaccepted followから、現在も公開またはfollowers公開である読書activityだけをcreated-atとIDのstable cursorで返す。`POST /api/library/status`は`shareActivity`がtrueの場合だけ状態変更activityを作成する。

`GET /api/activities/{id}/share`は匿名共有用の最小payloadだけを返す。読書activityは現在のlibrary entryまたはprofile標準公開範囲が`public`、reviewはreview自体が`public`で、かつaccountがactiveかつactivityが非表示でない場合に限る。閲覧不可と不存在はともに404とし、review本文・spoiler flag・既読位置を返さない。

`GET /api/catalog/works/{workId}/reviews`は話または巻のどちらか一方をqueryで指定する。初期read modelは、未login、未読位置、または投稿者指定のネタバレでは本文を含まない`hidden` variantを返す。`POST /api/reviews/{id}/reveal`だけが明示操作後の公開本文を返し、非公開感想は投稿者本人以外に返さない。`POST`、`PUT`、`DELETE /api/reviews`はactive session本人の感想だけを作成・編集・削除する。`POST`と`DELETE /api/reviews/{id}/reactions`は本人のいいねを切り替え、同じ利用者と感想の組を重複登録しない。

`POST`と`DELETE /api/profiles/{userId}/block`は相互followとpending申請を同じtransactionで解除する。`POST`と`DELETE /api/profiles/{userId}/mute`はfollowを維持したままtimelineから対象を除外する。blockされた組はprofile、review、reaction、timeline、follow操作に対して存在を返さない。`POST /api/reports`はactive sessionのplain text通報だけを受け付け、同じ報告者・対象の再通報はopenへ戻す。

`GET /api/admin/moderation/reports`と`GET /api/admin/moderation/actions`はmoderator以上だけが利用できる。`POST /api/admin/moderation/reports/{id}/actions`は理由を必須にして非表示・警告・利用停止・解除を記録し、利用停止はadministratorだけを許可する。routeはsessionのroleを入力から受け取らず、composition rootで解決したactorだけを使用する。
