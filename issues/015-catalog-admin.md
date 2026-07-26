---
id: 015
title: カタログの修正、統合、分割を管理する
type: feature
status: done
priority: P0
depends_on: [014]
umbrella: 007
---

# カタログの修正、統合、分割を管理する

## 目的

自動判定できない作品と話を管理者が修正し、誤統合を履歴付きで戻せるようにする。

## スコープ

- 作品、作者、掲載先、話、巻の管理queryとcommand。
- 重複作品と重複話の統合。
- 誤統合された作品、話、mappingの分割。
- 解析失敗、種別不明、利用者の修正候補を処理するqueue。
- `MergeAudit`と運営操作の監査log。
- 管理者だけが使えるHono RPC routeと画面。

単行本のdata modelは#016、利用者identityと投稿は#020/#023で導入されるため、巻の管理commandと利用者による修正候補の投稿は#048へ分割する。本issueでは既存の作品・掲載先・話・mapping、connector由来のreview queue、管理者によるqueue処理を扱う。

## 実装方針

- 統合と分割をapplication use caseの一transactionで実行する。
- 既読、所蔵、通知履歴、公開URLを失わず新しい正規IDへ再関連付けする。
- 旧URLと旧IDは正規dataへredirectする。
- 操作者、理由、変更前後、時刻を監査logへ残す。
- 管理者には二要素認証またはpasskeyを要求する。

## 受け入れ条件

- 作品と話を統合し、関連する履歴を保持できる。
- 誤統合を分割し、元の掲載関係を再構成できる。
- 旧公開URLが正規URLへredirectする。
- 権限のない利用者は管理queryとcommandを実行できない。
- 監査logから変更者、理由、変更前後を追跡できる。

## テスト

- 統合と分割のPostgreSQL統合テスト。
- 既読と通知履歴を持つdataの再関連付けテスト。
- Hono RPCの認可とvalidationテスト。

## 対象外

- AIによる統合候補。
- 複数管理者による承認workflow。
