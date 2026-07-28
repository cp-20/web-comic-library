---
id: 067
title: サンデーうぇぶりのmetadata利用可否を権利者へ確認する
type: quality
status: done
priority: P1
execution: human
review_required: true
review_status: approved
reviewed_at: 2026-07-28T10:23:39.407Z
depends_on: []
umbrella: 018
---

# サンデーうぇぶりのmetadata利用可否を権利者へ確認する

## 人が操作する理由

権利者へ連絡し、利用条件を合意した当事者として回答と適用範囲を確定する必要がある。

## Codexでは実行できない理由

Codexは運営者を代理して法的な照会や合意を行えず、外部への連絡権限も持たない。

## 目的と利用場面

運営者がサンデーうぇぶりの権利者からmetadataの自動収集・保存・公開と公式APIの条件を文書で受領するか、
利用不可を記録し、#051の実装可否を確定する。

## 背景と現状の問題

一般向け閲覧規約、公開page、robots.txtだけでは第三者serviceの再利用条件とAPI contractが確定しない。
人による権利確認をconnector codeから分離する。

## 実施判断と代替案

- 公式窓口の文書回答だけを根拠とし、無回答、browser閲覧可、robots許可を許可へ読み替えない。
- service目的、保存・公開field、rate、停止手順を先に提示する。

## 変更対象

| file                                             | 操作 | 変更内容                                                           |
| ------------------------------------------------ | ---- | ------------------------------------------------------------------ |
| `docs/source-permissions/sunday-webry.md`        | 作成 | 連絡・回答日、結論、field、host/path、rate、失効時処理を要約する。 |
| `issues/067-sunday-webry-permission-decision.md` | 変更 | evidence linkと結論を記録して`done`へ進める。                      |

## 実施手順

1. 作品、作者、公開話、日時、canonical URL、年齢区分の保存・再公開可否を公式窓口へ確認する。
2. 認証不要JSON APIのstable ID、cursor、host/path、rate、失効通知方法を確認する。
3. 許可、拒否、条件不足をevidenceへ記録する。
4. 許可なら#051の解除条件と照合し、拒否またはAPIなしならreplacement source issueを作る。

## 受け入れ条件

- 許可時は#051を実装できる全contractが文書化されている。
- 不許可時は取得を行わない結論とreplacement issueがある。
- 個人連絡先、Secret、非公開原文をGitへ含めない。

## テスト

- 人によるevidenceと#051解除条件の照合。

## 対象外

- connector実装、HTML/app解析、非回答からの推測。

## 決定

2026-07-28にrepository owner `cp-20`が、
[利用判断](../docs/source-permissions/sunday-webry.md)の範囲を許可した。#051はpermission待ちではなく、
#061と公式metadata contractの実装から進める。
