---
id: 066
title: ヤンマガWebのmetadata利用可否を権利者へ確認する
type: quality
status: done
priority: P1
execution: human
review_required: true
review_status: approved
reviewed_at: 2026-07-28T10:23:39.163Z
depends_on: []
umbrella: 018
---

# ヤンマガWebのmetadata利用可否を権利者へ確認する

## 人が操作する理由

権利者へ連絡し、利用条件を合意した当事者として回答と適用範囲を確定する必要がある。

## Codexでは実行できない理由

Codexは運営者を代理して法的な照会や合意を行えず、外部への連絡権限も持たない。

## 目的と利用場面

運営者がヤンマガWebの権利者から、自動収集・保存・公開を許可するmetadata範囲と公式API contractを
文書で受領するか、利用不可の判断を記録し、#050を推測なしで開始または中止できるようにする。

## 背景と現状の問題

公開pageとrobots.txtは第三者serviceでの再利用許可を意味せず、#050のhost、path、field、rateを
確定できない。permission交渉はcodeで解消できないためconnector実装から分離する。

## 実施判断と代替案

- 権利者の公式窓口へservice目的、保存・公開field、想定rate、停止方法を提示し、文書回答だけを根拠にする。
- 回答がない場合を許可とみなさず、HTMLや非公開APIを解析しない。

## 変更対象

| file                                        | 操作 | 変更内容                                                                  |
| ------------------------------------------- | ---- | ------------------------------------------------------------------------- |
| `docs/source-permissions/yanmaga.md`        | 作成 | 連絡日、回答日、許可/拒否、field、host/path、rate、失効時処理を要約する。 |
| `issues/066-yanmaga-permission-decision.md` | 変更 | evidence linkと結論を記録して`done`へ進める。                             |

原文にSecret、個人連絡先、契約上非公開の文面を含めず、必要ならrepository外の保管場所とrevisionだけを書く。

## 実施手順

1. 公式窓口へ連絡し、作品名、作者名、公開話、公開日時、canonical URL、年齢区分の保存・再公開可否を尋ねる。
2. 認証不要HTTPS JSON APIのhost/path、stable ID、cursor、rate、失効通知方法を確認する。
3. 許可、拒否、条件不足のいずれかをevidenceへ記録する。
4. 許可なら#050の解除条件と一致することを確認する。拒否またはAPIなしならreplacement source issueを作る。

## 受け入れ条件

- 許可時は保存・公開field、host/path、rate、失効時処理が文書で確定している。
- 拒否またはAPIなしの場合も結論とreplacement issueが記録されている。
- 非回答を許可として扱わず、非公開情報をrepositoryへ保存しない。

## テスト

- 人によるevidenceと#050解除条件の照合。

## 対象外

- connector実装、HTML scraping、契約外の法的判断。

## 決定

2026-07-28にrepository owner `cp-20`が、[利用判断](../docs/source-permissions/yanmaga.md)の範囲を
許可した。#050はpermission待ちではなく、#061と公式metadata contractの実装から進める。
