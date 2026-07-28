---
id: 082
title: Android実機で拡大とsoftware keyboardを確認する
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

# Android実機で拡大とsoftware keyboardを確認する

## 人が操作する理由

Android実機で拡大、回転、software keyboardを操作し、画面の隠れや再flowを目視確認する必要がある。

## Codexでは実行できない理由

Codexには対象Android実機とそのaccessibility設定を操作する接続がなく、実機固有の表示を保証できない。

## 目的と利用場面

初期リリース後、狭いmobile画面を拡大して使う利用者が、portraitとOS文字サイズ200％でも内容や操作
対象を失わず、software keyboard表示中にformとerrorへ到達できることを確認する。未完了でも初期
リリースを阻害しない。

## 背景と現状の問題

Playwright device emulationはphysical viewport、OS文字拡大、software keyboard、実際のtap操作を
再現しない。desktop keyboardとNVDAの結果もmobile reflowのstatusには流用できない。

## 実施判断と代替案

- Android 14以降の実機、Chrome stable、portrait、#075の同一LAN fixture Webを使う。
- OS文字サイズ100％と200％を別runにし、browser zoomやdesktop emulationで代用しない。
- LAN address、所有者名、Cookie、screenshotをreportへ保存しない。

## 変更対象

| file                                                 | 操作 | 変更内容                                                                          |
| ---------------------------------------------------- | ---- | --------------------------------------------------------------------------------- |
| `quality/accessibility/reports/android-candidate.md` | 作成 | 候補SHA、端末model/version、`MOB-01..04`、結果、issue、再試験、reviewを記録する。 |
| `issues/082-android-accessibility-verification.md`   | 変更 | report linkと結果を追記し、`done`へ進める。                                       |

## 実施手順

1. #075のserverを起動し、候補SHA、端末model、Android/Chrome versionを記録する。
2. portrait・文字100％で`MOB-01..04`を実施し、reflow、tap target、focused field、error、scrollを記録する。
3. 端末の文字サイズを200％へ変更し、同じcheckを最初から実施する。
4. software keyboard表示中にfocused field、送信操作、validation errorが隠れないことを確認する。
5. failを分類してagent issueへ分離し、blocker/major修正後は100％と200％を再実施する。
6. 一時firewall許可とserverを停止し、portとLAN公開が残っていないことを確認する。

## 受け入れ条件

- `MOB-01..04`の100％・200％すべてにpass/fail、観測結果、実施者がある。
- 横scrollに依存せず主要内容と操作へ到達でき、software keyboardがfocused fieldとerrorを隠さない。
- tap targetを誤操作せず主要journeyを完了できる。
- 未解決blocker/majorが0件で、minorは追跡issueがある。

## テスト

- `quality/accessibility/manual-checklist.md`の`MOB-01..04`
- server・firewall終了とport確認

## 対象外

- desktop keyboard、NVDA、iOS、tablet、code修正。

## Blocker

2026-07-28時点で#075の固定環境とchecklistが未完成である。

## 解除条件

#075が`done`で、同一LANのAndroid実機から候補SHAのfixture Webへ到達できること。

## 解除後の着手点

`quality/accessibility/reports/android-candidate.md`へ候補SHAと端末versionを記録する。

## 禁止する代替

DevTools emulation、100％結果の200％への流用、production accountの使用を禁止する。
