---
id: 050
title: ヤンマガWebの許可済み公開情報を収集する
type: feature
status: blocked
priority: P2
depends_on: [009, 010, 014]
umbrella: 018
---

# ヤンマガWebの許可済み公開情報を収集する

## 目的

利用条件とrobots.txtを確認した公式の公開取得手段だけで、ヤンマガWebの作品と掲載情報を収集する。

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

ヤンマガWebの[利用規約](https://yanmaga.jp/term)は、自動化されたbot、robot、crawler、spider、scraper等によるアクセスとコンテンツの収集・蓄積・抽出・処理を禁止している。明示的な書面許可または公式の収集用feed/APIが提供されるまで、connectorを実装しない。
