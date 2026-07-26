---
id: 020
title: 認証、profile、公開範囲を実装する
type: feature
status: done
priority: P0
depends_on: [004]
umbrella: 019
---

# 認証、profile、公開範囲を実装する

## 目的

利用者が安全にloginし、公開範囲を選んでprofileと記録を所有できるようにする。

## スコープ

- Better AuthのHono integration。
- メールlinkとGoogle OAuthによる登録とlogin。
- `User`、`Profile`、session、account状態のstorage。
- 表示名、一意なuser ID、自己紹介、icon。
- 公開、follower限定、非公開の`Visibility`。
- account全体の標準公開範囲と記録単位の上書きを解決するdomain service。
- profile、session、設定用Hono RPC routeとNext.js画面。

## 実装方針

- 初回設定で公開範囲を選ぶまでは非公開とする。
- auth adapterは`packages/auth`へ置き、applicationへSDK型を公開しない。
- Cookieに`HttpOnly`、`Secure`、適切な`SameSite`を設定する。
- login、登録、callbackへrate limitを設定する。
- iconはMIME type、容量、画像寸法を検証して位置情報を除去し、R2へ保存する。
- 公開範囲の判定をqueryごとに再実装せずapplication serviceへ集約する。

## 受け入れ条件

- メールlinkとGoogle OAuthで登録、login、logoutできる。
- user IDの重複と予約語を拒否できる。
- profileを公開範囲に従って取得できる。
- 未設定accountを第三者が閲覧できない。
- 記録単位の指定があれば標準公開範囲より優先する。
- 無効または削除予定accountのsessionを拒否する。

## テスト

- visibility解決とuser ID規則のdomain単体テスト。
- auth adapter、Cookie、sessionの統合テスト。
- Hono RPCの未認証、認証済み、権限不足のtest。
- 登録から公開範囲選択までのE2E。

## 対象外

- 利用者dataのexportとaccount削除。
- 管理者の二要素認証。
