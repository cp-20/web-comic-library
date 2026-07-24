# アーキテクチャ

## 構成

Web、API、workerを分離したモジュール化モノリスとする。

```text
apps/
  web/          Next.js
  api/          Hono
  worker/       巡回、通知、非同期処理
packages/
  api-client/   Hono RPC client
  contracts/    Valibot schema
  application/  use caseとport
  domain/       業務規則
  db/           PostgreSQL adapter
  connectors/   漫画サイトadapter
  auth/         認証adapter
  notifications/ 通知adapter
```

## 依存方向

```text
web -> api-client --type-only-> api AppType
api -> application -> domain
worker -> application -> domain
db / connectors / auth / notifications -> application -> domain
api -> contracts
```

- Webはbackend実装をimportしない。
- APIとworkerはDB、connector、通知SDKを直接呼ばず、application use caseを呼ぶ。
- applicationは必要なI/Oをportとして宣言し、具体adapterへ依存しない。
- domainはほかのworkspaceと外部libraryへ依存しない。
- adapterの組み立てはAPIとworkerのcomposition rootだけで行う。
- workspace間はpackageの`exports`を使い、別packageの`src`へdeep importしない。

oxlintで逆向き依存と循環依存を拒否する。

## Hono RPC

APIはrouteをchainして`ApiType`を`@web-comic-library/api/rpc`から型だけ公開する。

`packages/api-client`は`hc<ApiType>`を包み、Webはこのclientだけを使う。

```text
Next.js -> @web-comic-library/api-client -> HTTP -> Hono
```

Hono handlerの入力は`@hono/valibot-validator`で検証する。

schemaは`packages/contracts`、handlerは`apps/api`、業務処理は`packages/application`へ置く。

handlerはHTTP入出力の変換だけを担当する。

本番は同一originの`/api/*`をHonoへrouteし、認証cookieとCORSを単純に保つ。

## 層の責務

- **delivery**：Next.js、Hono、worker jobの入出力変換。
- **application**：use case、認可、transaction境界、port。
- **domain**：aggregate、value object、不変条件、domain event。
- **adapter**：DB、外部HTTP、認証、通知。
- **contracts**：HTTPとjob payloadのValibot schema。

更新はdomainの状態遷移を通す。

参照はapplicationのquery portから画面用read modelを返してよい。

## transaction

transaction境界はapplication use caseが決める。

状態変更と通知用eventを同じPostgreSQL transactionへ保存し、外部送信はcommit後にworkerが実行する。

jobと通知は冪等性keyを持ち、再実行で重複させない。

## 業務モジュール

domainとapplicationの内部は次で分ける。

- catalog
- library
- releases
- identity
- social
- moderation

別モジュールのaggregateを直接変更せず、application use caseかdomain eventで調整する。
