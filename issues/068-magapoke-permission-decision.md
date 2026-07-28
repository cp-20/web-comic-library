---
id: 068
title: マガポケのmetadata利用可否を権利者へ確認する
type: quality
status: done
priority: P1
execution: human
review_required: true
review_status: approved
reviewed_at: 2026-07-28T10:23:39.704Z
depends_on: []
umbrella: 018
---

# マガポケのmetadata利用可否を権利者へ確認する

## 人が操作する理由

権利者へ連絡し、利用条件を合意した当事者として回答と適用範囲を確定する必要がある。

## Codexでは実行できない理由

Codexは運営者を代理して法的な照会や合意を行えず、外部への連絡権限も持たない。

## 目的と利用場面

運営者がマガポケの一般規約に優先する個別許可と公式metadata API contractを受領するか、利用不可を
記録し、#052を安全に開始または中止できるようにする。

## 背景と現状の問題

現在の一般規約は自動収集を許可しておらず、技術的に取得できることでは解消できない。個別許可の取得は
人の外部連絡なのでconnector実装から分離する。

## 実施判断と代替案

- 一般規約に優先することが明記された文書回答だけを許可根拠にする。
- robots.txt、公開page、非公開APIの存在を個別許可の代用にしない。

## 変更対象

| file                                         | 操作 | 変更内容                                                                 |
| -------------------------------------------- | ---- | ------------------------------------------------------------------------ |
| `docs/source-permissions/magapoke.md`        | 作成 | 個別許可の優先関係、field、host/path、rate、失効時処理、結論を要約する。 |
| `issues/068-magapoke-permission-decision.md` | 変更 | evidence linkと結論を記録して`done`へ進める。                            |

## 実施手順

1. service目的と対象fieldを提示し、自動収集・保存・再公開の個別許可を求める。
2. 許可が一般規約に優先すること、認証不要JSON APIのcontract、rate、失効時処理を確認する。
3. 許可、拒否、条件不足をevidenceへ記録する。
4. 許可なら#052と照合し、不許可ならreplacement source issueを作る。

## 受け入れ条件

- 許可時は一般規約との優先関係を含む文書とAPI contractがある。
- 不許可時は取得しない結論とreplacement issueがある。
- 非回答や技術的取得可能性を許可として扱わない。

## テスト

- 人によるevidenceと#052解除条件の照合。

## 対象外

- connector実装、規約回避、非公開endpoint調査。

## 決定

2026-07-28にrepository owner `cp-20`が、[利用判断](../docs/source-permissions/magapoke.md)を一般規約に
優先する個別許可として承認した。#052はpermission待ちではなく、#061と公式metadata contractの実装から
進める。
