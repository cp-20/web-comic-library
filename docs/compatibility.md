# Bun互換性

## 固定構成

| 対象                   | version        | 検証内容                                          |
| ---------------------- | -------------- | ------------------------------------------------- |
| Bun                    | 1.3.14         | install、check、test、build、process起動とSIGTERM |
| Next.js                | 16.2.11        | `bun --bun next build`、`next start`、HTTP応答    |
| Hono / Hono RPC        | 4.12.31        | Bun server起動、RPC health request                |
| Better Auth            | 1.6.25         | Bun上での初期化と`/api/auth/ok`                   |
| Drizzle ORM / postgres | 0.45.2 / 3.4.9 | PostgreSQL 16への接続とquery                      |
| Graphile Worker        | 0.17.3         | migration、job投入・実行、SIGTERM後の停止         |
| web-push               | 3.6.7          | VAPID鍵と暗号化済みPush request生成               |

versionの正本は各`package.json`、`bun.lock`、rootの`packageManager`とする。

## 自動検証

`Dockerfile.compatibility`はBunだけをJavaScript runtimeとして含むimageで、次を実行する。

```sh
bun install --frozen-lockfile
bun run check
bun test
bun run build:web
bun run smoke:compatibility
```

smoke testはPostgreSQL 16へ接続し、Web、API、workerを別processで同時起動する。
Hono RPC、Drizzle query、Graphile Worker job、web-push payloadを確認し、全processへSIGTERMを送る。
worker終了後に投入したjobが実行されないことも確認する。

## 既知の制約

- Next.js buildはBun processのworker生成を許可しないsandboxではpage data収集で停止する。
- Next.js serverはBun実行時のSIGTERMに対して終了コード143を返す。10秒以内の停止を正常なsignal終了として扱う。
- Graphile Worker 0.17.3はNode.js向けpackageとして公開されているため、Bun互換性をこのsmoke testで継続監視する。
- Push serviceへの通信は行わず、暗号化済みHTTP request生成までを検証する。
