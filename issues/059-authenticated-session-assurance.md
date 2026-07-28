---
id: 059
title: 二要素認証済みsessionのassuranceを検証可能に保存する
type: platform
status: completed
priority: P0
depends_on: [020]
umbrella: 019
---

# 二要素認証済みsessionのassuranceを検証可能に保存する

## 目的

Better Authのpasskeyまたは二要素認証が成功したsessionだけを、applicationが改ざん不能な強いassuranceとして判定できるようにする。

## 背景

Google OAuthはactive sessionを作るが、session tableに二要素認証完了の記録がない。Better AuthのTOTP pluginもverification後に通常sessionを作るため、session時刻、Cookieの存在、email、request headerから強い認証を推測してはならない。

## スコープ

- Better AuthのpasskeyまたはTOTP verification成功に連動するsession assurance record。
- assuranceの期限、session失効・logout時の無効化、再認証の更新。
- passkey・TOTP未完了sessionを強いassuranceとして返さないquery port。
- TOTP enrollment・verificationのAPI/Web flowとtest。

## 受け入れ条件

- 二要素認証成功以外のsessionは`two_factor`または`passkey`として解決されない。
- session失効、logout、assurance期限後は強い管理操作を拒否する。
- TOTP設定とverificationを実browserおよびPostgreSQL integration testで確認できる。

## 対象外

- catalog管理者roleの付与（#058）。
