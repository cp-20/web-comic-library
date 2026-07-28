---
id: 056
title: extension import用のsource key解決を提供する
type: feature
status: done
priority: P1
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: [008, 009, 039]
umbrella: 037
---

# extension import用のsource key解決を提供する

## 目的

extensionが固定のsite keyを安全にcatalogのsource UUIDへ解決し、お気に入り候補を正しいsourceへ紐付けられるようにする。

## 背景

catalogの`source_id`はdatabase UUIDであり、extensionに固定値として埋め込めない。#040以降のextractorはhostからsite keyを決められるが、UUIDを知る手段がない。

## スコープ

- extension import requestのsource key schema。
- active policyを持つ許可済みsource keyだけをUUIDへ解決するapplication use caseとDB query。
- 未登録、未許可、緊急停止中のsourceをbatch作成前に拒否するHono route test。
- extensionのhost-to-source-key定義とimport payloadの更新。

## 実装方針

- UUIDをextension設定、fixture、logへ埋め込まない。
- serverはsource keyを最新policyのcollection許可と緊急停止状態で検証し、許可済みsourceだけをinternal UUIDへ変換する。
- 不明または拒否のsourceを候補から推測・置換しない。

## 受け入れ条件

- 少年ジャンプ＋、コミックDAYS、となりのヤングジャンプの固定site keyをUUIDへ解決できる。
- 許可されないsource keyはbatchを作成せず、候補を保存しない。
- extension payloadとDBのsource UUIDが一致する。

## テスト

- schema、policy gate、UUID解決の単体・PostgreSQL統合テスト。
- extension token routeで許可・拒否source keyを検証するHono RPC test。

## 対象外

- source policyの自動変更。
- extensionへのsource UUID公開。
