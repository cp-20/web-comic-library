---
id: 051
title: サンデーうぇぶりの許可済み公開情報を収集する
type: feature
status: blocked
priority: P2
depends_on: [009, 010, 014]
umbrella: 018
---

# サンデーうぇぶりの許可済み公開情報を収集する

## 目的

利用条件とrobots.txtを確認した公式の公開取得手段だけで、サンデーうぇぶりの作品と掲載情報を収集する。

## スコープ

- policy evidence、年齢区分、緊急停止条件の記録。
- 許可された公開feed、HTML、または埋め込みdataを使うconnectorと最小fixture。
- 通常巡回、backfill checkpoint、削除・公開終了・構造変更のfail-closed処理。

## 受け入れ条件

- policyが収集を明示許可した場合だけrequestする。
- 同じfixtureの再処理で候補とrelease eventを重複させない。
- 漫画本文、画像、認証が必要なresourceへrequestしない。

## テスト

- fixture、構造変更、削除、公開終了、URL変更のtest。
- 通常queue優先とcheckpoint再開のtest。

## 対象外

- browser自動操作と非公開API。

## Blocker

公式の[利用規約](https://blog.www.sunday-webry.com/terms_of_service)は本サービスおよび本コンテンツの複製を禁止しており、公開metadataを自動収集してよいという明示許可、公開feed、または収集用APIを示していない。`https://www.sunday-webry.com/robots.txt` も404であり、robots.txtは許可根拠にはならない。受け入れ条件の明示許可を満たす公式の取得手段または書面による許可が得られるまで、connectorを実装しない。
