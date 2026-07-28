---
id: 070
title: アルファポリスの漫画metadata利用可否を権利者へ確認する
type: quality
status: done
priority: P1
execution: human
review_required: true
review_status: approved
reviewed_at: 2026-07-28T10:23:40.175Z
depends_on: []
umbrella: 018
---

# アルファポリスの漫画metadata利用可否を権利者へ確認する

## 人が操作する理由

権利者へ連絡し、利用条件を合意した当事者として回答と適用範囲を確定する必要がある。

## Codexでは実行できない理由

Codexは運営者を代理して法的な照会や合意を行えず、外部への連絡権限も持たない。

## 目的と利用場面

運営者がアルファポリスの漫画contentだけを対象に、metadata利用許可と公式API条件を文書で受領するか、
利用不可を記録し、#054の実装可否を確定する。

## 背景と現状の問題

アルファポリスには複数content typeがあり、URLやtitleから漫画を推測すると対象外作品を収集する。
permissionとcontent type判定は権利者の回答が必要なのでconnector実装から分離する。

## 実施判断と代替案

- 漫画を識別するAPI fieldと許可範囲が文書に明記された場合だけ実装へ進む。
- URL pattern、画像、viewer、titleから漫画区分を推測しない。

## 変更対象

| file                                           | 操作 | 変更内容                                                           |
| ---------------------------------------------- | ---- | ------------------------------------------------------------------ |
| `docs/source-permissions/alphapolis.md`        | 作成 | 漫画範囲、判定field、host/path、rate、失効時処理、結論を要約する。 |
| `issues/070-alphapolis-permission-decision.md` | 変更 | evidence linkと結論を記録して`done`へ進める。                      |

## 実施手順

1. 漫画作品・作者・公開話・日時・URL・年齢区分の保存・再公開可否を確認する。
2. 漫画content typeを識別するfield、stable ID、cursor、host/path、rate、失効通知を確認する。
3. 許可、拒否、条件不足をevidenceへ記録する。
4. 許可なら#054と照合し、拒否またはAPIなしならreplacement source issueを作る。

## 受け入れ条件

- 許可時は漫画範囲と判定fieldを含む#054の全contractが文書化されている。
- 不許可時は取得しない判断とreplacement issueがある。
- URLやtitleから漫画区分を推測しない。

## テスト

- 人によるevidenceと#054解除条件の照合。

## 対象外

- connector実装、漫画本文・画像・viewerの利用、content type推測。

## 決定

2026-07-28にrepository owner `cp-20`が、
[利用判断](../docs/source-permissions/alphapolis.md)の範囲を漫画contentに限定して許可した。#054は
permission待ちではなく、#061と公式metadata contractの実装から進める。
