---
id: 080
title: keyboardだけで主要journeyを確認する
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

# keyboardだけで主要journeyを確認する

## 人が操作する理由

実ブラウザをkeyboardだけで操作し、focus順序と視認性を利用者の操作として目視評価する必要がある。

## Codexでは実行できない理由

Codexの自動testだけでは、人が知覚するfocusの見え方や操作の自然さを最終判断できない。

## 目的と利用場面

初期リリース後、mouseを使えない利用者がdesktop Chromeでloginから読書管理、共有、moderationまで
到達でき、focusとvalidation結果を視覚的に追えることを人が確認する。未完了でも初期リリースを
阻害しない。

## 背景と現状の問題

Playwrightはrole locatorとfocus移動を検査できるが、focus ringの知覚、複雑な操作順、route移動後の
位置を人が連続操作したときの理解しやすさまでは判定できない。screen readerとmobileは別環境なので
#081、#082へ分離する。

## 実施判断と代替案

- Windows 11、Chrome stable、zoom 100％、#075の固定fixtureを使う。
- Tab、Shift+Tab、Enter、Space、矢印keyだけを使い、mouseやDevToolsで操作を補わない。
- failはこのissueでcode修正せず、check IDと再現手順付きagent issueへ分離する。

## 変更対象

| file                                                  | 操作 | 変更内容                                                                 |
| ----------------------------------------------------- | ---- | ------------------------------------------------------------------------ |
| `quality/accessibility/reports/keyboard-candidate.md` | 作成 | 候補SHA、環境、`KEY-01..07`、結果、発見issue、再試験、reviewを記録する。 |
| `issues/080-keyboard-accessibility-verification.md`   | 変更 | report linkと結果を追記し、`done`へ進める。                              |

## 実施手順

1. #075のserverを起動し、候補SHA、Chrome version、開始時刻をreportへ記録する。
2. mouseを画面外へ置き、`KEY-01..07`をchecklist順に一度ずつ実施する。
3. Google login fixture、profile validation、検索・読書状態、follow方式、単行本、ネタバレ、block・通報・
   moderationについてfocus順、focus ring、操作結果、error後の位置を記録する。
4. failをblocker/major/minorへ分類し、agent issueを作る。blocker/major修正後は該当journeyを最初から行う。
5. serverを停止し、port 3100/3101がlistenしていないことを確認する。

## 受け入れ条件

- `KEY-01..07`すべてにpass/fail、観測結果、実施者がある。
- keyboardだけで主要journeyを完了し、常に現在focusを視覚的に判別できる。
- errorと保存結果を認識でき、route移動後に操作不能なfocusが残らない。
- 未解決blocker/majorが0件で、minorは追跡issueがある。

## テスト

- `quality/accessibility/manual-checklist.md`の`KEY-01..07`
- local server終了とport確認

## 対象外

- NVDA、Android実機、code・checklist修正。

## Blocker

2026-07-28時点で#075の固定環境とchecklistが未完成である。

## 解除条件

#075が`done`で、同じ候補SHAの`bun run accessibility:serve`が成功すること。

## 解除後の着手点

`quality/accessibility/reports/keyboard-candidate.md`へ候補SHAとChrome versionを記録する。

## 禁止する代替

mouse操作、Playwright結果だけでの合格、未実施checkの一括passを禁止する。
