---
id: 047
title: カタログ統合後の読書・所蔵・通知履歴を正規IDへ解決する
type: feature
status: done
priority: P0
execution: agent
review_required: true
review_status: legacy_unrecorded
reviewed_at: null
depends_on: [015, 021, 023, 024]
umbrella: 007
---

# カタログ統合後の読書・所蔵・通知履歴を正規IDへ解決する

## 目的

作品または話の統合後も、既読、所蔵、通知履歴を失わず正規の作品と話として参照できるようにする。

## 背景

#015はcatalog entityの統合、分割、redirect、操作監査を提供する。既読、所蔵、通知履歴のtableとqueryは#021、#023、#024で導入されるため、それらが存在する前に実データの再関連付けを検証できない。

## スコープ

- catalog redirectを経由した既読、所蔵、通知queryの正規ID解決。
- 重複した履歴の冪等な統合と、公開・通知判定の保持。
- 統合、分割後の既存履歴を含むPostgreSQL統合test。

## 実装方針

- 履歴の元IDを破棄せず、catalog redirectをtransaction内で正規IDへ解決する。
- 同じ利用者、同じ正規対象へ収束する履歴は各domainの不変条件に従って統合する。
- 分割後は元のentry/content mappingを使い、根拠のない既読推測を行わない。

## 受け入れ条件

- 作品と話の統合後、既読、所蔵、通知履歴を正規IDで取得できる。
- 分割後、未確認mappingを根拠に別作品の既読を推測しない。
- 再実行しても履歴または通知を重複させない。

## テスト

- 既読、所蔵、通知履歴を含むPostgreSQL統合test。
- 統合、分割、redirect解決、冪等性のtest。

## 対象外

- catalog統合・分割操作そのもの（#015）。
- 読書、所蔵、通知の個別UI（#021、#023、#024）。
