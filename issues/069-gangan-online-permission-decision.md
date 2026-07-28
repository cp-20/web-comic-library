---
id: 069
title: ガンガンONLINEのmetadata利用可否を権利者へ確認する
type: quality
status: done
priority: P1
execution: human
review_required: true
review_status: approved
reviewed_at: 2026-07-28T10:23:39.940Z
depends_on: []
umbrella: 018
---

# ガンガンONLINEのmetadata利用可否を権利者へ確認する

## 人が操作する理由

権利者へ連絡し、利用条件を合意した当事者として回答と適用範囲を確定する必要がある。

## Codexでは実行できない理由

Codexは運営者を代理して法的な照会や合意を行えず、外部への連絡権限も持たない。

## 目的と利用場面

運営者がガンガンONLINEのmetadata利用許可と公式API条件を文書で受領するか、利用不可を記録し、
#053の実装可否を確定する。

## 背景と現状の問題

公開pageと一般規約からは自動収集・保存・再公開の範囲、rate、失効時処理を確定できない。
permission交渉をagent実装issueから分離する。

## 実施判断と代替案

- 公式窓口の文書回答だけを根拠にし、robots.txtやbrowser閲覧可否を許可とみなさない。
- APIが提供されない場合はHTMLやapp通信へ切り替えず、対象siteを差し替える。

## 変更対象

| file                                              | 操作 | 変更内容                                             |
| ------------------------------------------------- | ---- | ---------------------------------------------------- |
| `docs/source-permissions/gangan-online.md`        | 作成 | 結論、field、host/path、rate、失効時処理を要約する。 |
| `issues/069-gangan-online-permission-decision.md` | 変更 | evidence linkと結論を記録して`done`へ進める。        |

## 実施手順

1. 対象fieldの自動収集・保存・再公開可否を公式窓口へ確認する。
2. 認証不要JSON APIのstable ID、cursor、host/path、rate、失効通知を確認する。
3. 許可、拒否、条件不足をevidenceへ記録する。
4. 許可なら#053と照合し、拒否またはAPIなしならreplacement source issueを作る。

## 受け入れ条件

- 許可時は#053に必要なcontractが文書化されている。
- 不許可時は取得しない判断とreplacement issueがある。
- Secret、個人連絡先、非公開原文をGitへ含めない。

## テスト

- 人によるevidenceと#053解除条件の照合。

## 対象外

- connector実装、HTML/app解析、推測によるfield補完。

## 決定

2026-07-28にrepository owner `cp-20`が、
[利用判断](../docs/source-permissions/gangan-online.md)の範囲を許可した。#053はpermission待ちではなく、
#061と公式metadata contractの実装から進める。
