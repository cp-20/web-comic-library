---
id: 060
title: Google OAuth専用のloginへ移行する
type: feature
status: done
priority: P1
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: [020]
umbrella: 019
---

# Google OAuth専用のloginへ移行する

## 目的

利用者のlogin手段をGoogle OAuthだけに統一し、magic linkのメール配送基盤とその運用を不要にする。

## スコープ

- `/login`からメールアドレス入力とmagic link送信操作を削除する。
- magic link RPC、contract、Better Auth plugin、配送adapterと設定を削除する。
- API起動時にGoogle OAuth credentialの組を必須化する。
- API、Web、配備文書と#020の認証記述を更新する。

## 受け入れ条件

- Google OAuthだけを開始でき、magic link routeとpluginは利用不能である。
- Google credentialが完全に設定されないAPIは起動を拒否する。
- API、Web、配備文書にmagic linkを認証手段として残さない。

## テスト

- Google OAuth開始、logout、削除済みmagic link routeのHono RPC test。
- auth adapterのcredential必須性とplugin非搭載test。
- `bun run check`、`bun test`、`bun run build:web`。

## 対象外

- Google以外のOAuth provider、credential発行、既存magic-link data移行。
