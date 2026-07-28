---
id: 058
title: catalog管理者のroleと強い認証sessionを接続する
type: platform
status: done
priority: P0
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: [020, 059]
umbrella: 007
---

# catalog管理者のroleと強い認証sessionを接続する

## 目的

catalog管理commandを、実際の認証済みsessionから解決したadministrator roleとpasskeyまたは二要素認証のassuranceで安全に保護する。

## 背景

#015は`CatalogAdminActor`と管理routeを定義したが、identity storageにはroleとassuranceがなく、API composition rootもcatalog管理controllerを接続していない。#048の巻管理と利用者候補reviewを仮の管理者判定で公開してはならない。

## Blocked

Better Authの二要素認証pluginはverification成功後に通常sessionを発行するが、現行session tableへ強い認証完了を検証可能な形で保存しない。session時刻やCookieをassuranceの根拠にせず、#059でsession assuranceを実装してからroleとcatalog controllerを接続する。

## スコープ

- administrator roleとpasskey・二要素認証assuranceのstorage、session解決port、migration。
- API composition rootからcatalog管理controllerとactor解決portを接続する。
- administrator以外、強い認証なし、未認証の管理route拒否。
- 管理者role・assurance変更の監査記録。

## 実装方針

- roleとassuranceはsessionに紐づく明示的なDB dataから解決し、request header、email、環境変数、画面入力で推測しない。
- role変更とassurance昇格は監査可能な別の管理操作に限定する。
- API handlerは既存の`resolveCatalogAdmin` portを通し、認証SDK型をapplicationへ公開しない。

## 受け入れ条件

- active sessionのadministratorかつpasskeyまたは二要素認証済みだけがcatalog管理routeを実行できる。
- user role、弱いsession、未認証sessionはそれぞれ403または401となる。
- production composition rootでcatalog管理controllerが実DB adapterへ接続される。
- role・assuranceの変更履歴を監査できる。

## テスト

- PostgreSQL integration testでrole、assurance、監査の保存とsession解決を確認する。
- Hono RPCで未認証、user、弱いsession、強いadministratorを確認する。

## 対象外

- moderatorのblock、mute、通報処理（#031）。
