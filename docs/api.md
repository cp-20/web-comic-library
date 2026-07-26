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

## catalog管理API

`/api/admin/catalog/*`は管理者専用とする。routeはsessionを直接解釈せず、composition rootから渡す管理者解決portを使う。解決されたactorは`administrator` roleかつ`passkey`または`two_factor`の強い認証状態でなければならない。

管理commandには理由を必須にし、統合、分割、queue解決の前にapplication use caseを呼ぶ。認証なしは401、一般利用者は403、validation失敗は400を返す。実sessionとpasskey/二要素認証の接続は#020でauth adapterに実装する。

`/api/catalog/redirects/{resource}/{id}`はretire済み作品または話の旧公開IDを正規URLへ302 redirectする。redirect解決に管理者認可は要求しないが、管理queryやcommandは公開しない。
