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
