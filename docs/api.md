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

Better Auth handlerは`/api/auth/*`へmountし、Webが開始する操作はHono RPCの`POST /api/login/magic-link`、`POST /api/login/google`、`POST /api/logout`へ限定する。前者二つは固定された`/settings/profile` callbackだけをauth adapterへ渡し、adapterのrate limitとorigin検証を通す。

`GET /api/session`は有効なaccountのsessionだけを返す。`GET /api/profiles/{userId}`はapplicationのVisibility判定を通し、存在しない場合と閲覧できない場合はともに404を返す。`PUT /api/settings/profile`と`POST /api/settings/profile/icon`は有効なsessionを必要とし、icon URLをprofile更新入力で受け取らない。icon uploadだけがapplicationのPNG、容量、寸法検証・sanitizationを経由してstorage portへ渡す。

## library API

`POST /api/library/status`は手動読書状態を変更し、`POST /api/library/reads`、`POST /api/library/reads/through`、`DELETE /api/library/reads`は論理話の既読、一括既読、取消をtransactionで実行する。`POST /api/library/publication-reads`は未確認mappingでも読んだ掲載ページだけを記録する。全routeはactive sessionを要求し、公開範囲はrecordごとの値として保存する。

`GET /api/library/volumes`はログイン利用者自身の巻記録だけを返す。`PUT /api/library/volumes/records`は巻ごとの読書状態、紙・電子所蔵、話memo、公開範囲を置換し、既読にした場合だけconfirmedな巻・話対応をWeb既読へ同一transactionで反映する。`POST /api/library/volumes/mapping-corrections`は確認候補を管理queueへ追加するだけで、共有mappingや他利用者の既読を変更しない。

## follow設定 API

`PUT /api/settings/source-preferences`はログイン利用者自身の掲載先優先順位を置換する。`PUT /api/settings/follows`は同じく自身の作品ごとの方式と掲載先指定を一transactionで置換する。どちらもactive sessionを必須とし、他利用者の設定を受け取らない。

## 通知API

`GET /api/notifications`はactive sessionの利用者自身の通知だけをcursor paginationと未読件数で返す。`POST /api/notifications/{id}/read`と`POST /api/notifications/read-all`は同じ利用者の通知だけを既読にする。`PUT /api/settings/notification-preferences`は通知種別・経路ごとの有効状態を保存する。

`GET /api/push/config`はWeb Pushを有効にした場合だけVAPID公開鍵を返す。`PUT`と`DELETE /api/settings/push-subscriptions`はactive session自身のbrowser subscriptionだけを登録、更新、解除する。subscription endpointや鍵は公開APIに出さない。

`PUT /api/settings/email-digest`はactive session自身の更新digestの有効状態、IANA timezone、送信時刻を保存する。`POST /api/settings/email-digest/unsubscribe`は同じ利用者のdigestだけを停止する。いずれも受信先emailや本文をresponseへ含めない。

## 公開catalog API

`GET /api/catalog/works`は`q`、`source`、`status`、`kind`、`sort`で公開作品を検索する。`q`はNFKC正規化し、title、別名、読み仮名、作者名を対象にする。`GET /api/catalog/works/{workId}`は公開済みの作品詳細だけを返す。両routeは最新のsource policyがcollectionを許可し、緊急停止中でなく、年齢区分が`public`の掲載先だけを返し、CDN cache可能なresponse headerを付ける。人気順は直近30日間のlibrary entry数で決めるが、利用者情報と件数はresponseに含めない。

## catalog管理API

`/api/admin/catalog/*`は管理者専用とする。routeはsessionを直接解釈せず、composition rootから渡す管理者解決portを使う。解決されたactorは`administrator` roleかつ`passkey`または`two_factor`の強い認証状態でなければならない。

管理commandには理由を必須にし、統合、分割、queue解決の前にapplication use caseを呼ぶ。認証なしは401、一般利用者は403、validation失敗は400を返す。実sessionとpasskey/二要素認証の接続は#020でauth adapterに実装する。

`/api/catalog/redirects/{resource}/{id}`はretire済み作品または話の旧公開IDを正規URLへ302 redirectする。redirect解決に管理者認可は要求しないが、管理queryやcommandは公開しない。
