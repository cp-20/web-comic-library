---
id: 081
title: NVDAで主要journeyの読み上げを確認する
type: quality
status: blocked
priority: P3
execution: human
review_required: true
review_status: pending
reviewed_at: null
depends_on: [075]
umbrella: 062
---

# NVDAで主要journeyの読み上げを確認する

## 人が操作する理由

Windows上のNVDAを実際に操作し、読み上げ順序、文脈、操作可能性を聴覚で評価する必要がある。

## Codexでは実行できない理由

Codexのrepository実行環境にはNVDAの対話sessionがなく、利用者が聞く読み上げ体験を代替できない。

## 目的と利用場面

初期リリース後、screen reader利用者がpage構造、form状態、error、保存結果、ネタバレ開示を一意に
理解し、非公開dataや開示前本文を読み上げず主要journeyを完了できることを確認する。未完了でも初期
リリースを阻害しない。

## 背景と現状の問題

axeはaccessible nameやARIAの静的違反を検出できるが、日本語の読み上げ順、browse/form modeの遷移、
live regionの重複通知を判断できない。keyboardの視覚確認とmobile reflowは別issueで扱う。

## 実施判断と代替案

- Windows 11、NVDA stable、日本語音声、Chrome stable、#075の固定fixtureに環境を固定する。
- NVDA Speech Viewerの個人情報を含まないchecklist対象だけをreportへ要約し、音声や全logを保存しない。
- JAWS、VoiceOver、TalkBackで代用せず、追加matrixは別issueにする。

## 変更対象

| file                                              | 操作 | 変更内容                                                                       |
| ------------------------------------------------- | ---- | ------------------------------------------------------------------------------ |
| `quality/accessibility/reports/nvda-candidate.md` | 作成 | 候補SHA、version、`SR-01..05`、読み上げ結果、issue、再試験、reviewを記録する。 |
| `issues/081-nvda-accessibility-verification.md`   | 変更 | report linkと結果を追記し、`done`へ進める。                                    |

## 実施手順

1. #075のserverを起動し、候補SHA、Windows、Chrome、NVDA、音声versionを記録する。
2. mouseを使わず`SR-01..05`をbrowse/form modeでchecklist順に実施する。
3. title、heading、landmark、label、現在値、required/invalid/disabled、保存結果、ネタバレ開示を記録する。
4. messageが一回だけ通知され、非公開活動と開示前本文を読み上げないことを確認する。
5. failを分類してagent issueへ分離し、blocker/major修正後は該当journeyを最初から再実施する。
6. NVDAとserverを停止し、一時設定とportをcleanupする。

## 受け入れ条件

- `SR-01..05`すべてにpass/fail、期待と実際の要約、実施者がある。
- heading、label、状態、error、保存結果、ネタバレ開示を一意に理解できる。
- 非公開dataと開示前本文を読み上げず、live regionが重複通知しない。
- 未解決blocker/majorが0件で、minorは追跡issueがある。

## テスト

- `quality/accessibility/manual-checklist.md`の`SR-01..05`
- NVDA・local server終了とport確認

## 対象外

- keyboard focusの視覚評価、Android、JAWS、VoiceOver、TalkBack、code修正。

## Blocker

2026-07-28時点で#075の固定環境とchecklistが未完成である。

## 解除条件

#075が`done`で、同じ候補SHAの`bun run accessibility:serve`が成功すること。

## 解除後の着手点

`quality/accessibility/reports/nvda-candidate.md`へ候補SHAとsoftware versionを記録する。

## 禁止する代替

axe結果だけでの合格、音声を聞かないARIA目視、別screen readerの結果流用を禁止する。
