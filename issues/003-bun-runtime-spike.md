---
id: 003
title: 採用ライブラリのBun互換性を固定する
type: platform
status: done
priority: P0
depends_on: [002]
umbrella: 001
---

# 採用ライブラリのBun互換性を固定する

## 目的

本番で使うライブラリがBunだけで起動、build、終了できる組み合わせを確定する。

## スコープ

- Next.js、Hono、Hono RPC、Better Auth、Drizzle ORM、Graphile Worker、`web-push`の検証。
- Web、API、workerを別processとして起動するsmoke test。
- PostgreSQLへの接続、job投入と実行、Push payload生成の検証。
- 確定した版のmanifestと`bun.lock`への固定。
- 検証結果と既知の制約を`docs/compatibility.md`へ記録する。

## 実装方針

- Webは`bun --bun next build`と`bun --bun next start`を使う。
- APIとworkerはBunを直接使う。
- Hono RPCは`hc<ApiType>`からhealth routeを呼ぶ。
- Node.js runtimeをfallbackとして併設しない。
- 非互換ライブラリだけを同じ責務のBun対応ライブラリへ置き換える。

## 受け入れ条件

- `bun run check`、`bun test`、`bun run build:web`が成功する。
- Web、API、workerが同時に起動し、正常終了できる。
- Hono RPC、DB query、job、Push payloadのsmoke testが成功する。
- 採用版と回避事項が一箇所に記録されている。

## テスト

- Bunだけが入ったcontainerでinstall、build、test、startを実行する。
- SIGTERM後にprocessが終了し、新しいjob受付を停止することを確認する。

## 対象外

- 業務機能の実装。
- Push serviceへの本番送信。
