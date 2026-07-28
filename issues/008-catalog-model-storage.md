---
id: 008
title: 作品、掲載先、話のdomain modelとstorageを作る
type: feature
status: done
priority: P0
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: [004]
umbrella: 007
---

# 作品、掲載先、話のdomain modelとstorageを作る

## 目的

媒体と掲載サイトをまたぐ作品、論理的な話、実際の掲載ページを別々に保持する。

## スコープ

- `Work`、`WorkAlias`、`Creator`、`Source`、`Publication`のmodelとtable。
- `ContentUnit`、`PublicationEntry`、`EntryContentMapping`のmodelとtable。
- 連載状態と掲載種別の列挙値。
- repository port、Drizzle adapter、SQL migration。
- 作品と掲載情報を返すquery portとread model。

## 不変条件

- `Work`はサイト固有IDを持たない。
- `Publication`は一つの`Source`に属し、source内の外部IDまたは正規化URLで一意である。
- `PublicationEntry`は通常話、番外編、再掲載、告知、不明を区別する。
- 掲載ページと論理的な話は多対多で対応付けられる。
- 対応が未確認の掲載ページを別掲載先の話へ推測で関連付けない。

## 実装方針

- domainは識別子、不変条件、状態遷移を持ち、DrizzleとValibotへ依存しない。
- applicationはcommand用repositoryと画面用query portを分ける。
- foreign key、unique、check、not nullをDBでも保証する。
- 物理削除が既読や通知履歴を壊す対象には廃止状態を使う。

## 受け入れ条件

- 一作品へ複数の掲載先を登録できる。
- 一つの掲載ページを複数の`ContentUnit`へ関連付けられる。
- 同じ外部IDまたは正規化URLを二重登録できない。
- 通常話と番外編以外を追いつき計算の対象外として返せる。

## テスト

- domain不変条件の単体テスト。
- migration、制約、repository、query portのPostgreSQL統合テスト。
- 一括掲載と分割掲載の多対多mappingテスト。

## 対象外

- 自動重複判定。
- 管理画面。
- 利用者の読書記録。
