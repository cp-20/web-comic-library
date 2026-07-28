---
id: 072
title: Firefox実機でextension importを確認する
type: quality
status: blocked
priority: P1
execution: human
review_required: true
review_status: pending
reviewed_at: null
depends_on: [055]
umbrella: 037
---

# Firefox実機でextension importを確認する

## 人が操作する理由

Firefox実機の拡張機能UIを操作し、表示とimport結果を人の目で確認して証跡を残す必要がある。

## Codexでは実行できない理由

Codexのrepository実行環境には、対象のFirefox profile、拡張機能の対話UI、実機画面を操作する接続がない。

## 目的と利用場面

提供者がrelease候補extensionをFirefox stableへ一時installし、pairing、site permission、fixture抽出、
確認画面への遷移を完了できることを公開前に確認する。

## 背景と現状の問題

#055のChromium Playwrightとmanifest testはFirefox固有のpermission UI、temporary add-on、background
script lifecycleを実browserで保証しない。この人手確認をagent実装issueから分離する。

## 実施判断と代替案

- Firefox stableのtemporary add-onとしてunsigned release buildを使う。署名・公開前に同じruntimeを
  確認できるためである。
- production accountと外部siteを使わず、#087〜#091のfixture pageとlocal Web/APIだけを使う。

## 変更対象

| file                                    | 操作 | 変更内容                                                            |
| --------------------------------------- | ---- | ------------------------------------------------------------------- |
| `quality/extension/firefox-smoke.md`    | 作成 | version、build hash、操作、結果、console error、cleanupを記録する。 |
| `issues/072-firefox-extension-smoke.md` | 変更 | report linkと結果を追記して`done`へ進める。                         |

## 実施手順

1. #055のrelease build hashを記録し、Firefox stableへtemporary add-onとしてinstallする。
2. local Webでpairing codeを発行し、extensionへ一度だけ入力する。
3. fixture pageのpermissionを許可し、作品候補を抽出して確認tabが開くことを確認する。
4. permission拒否時は抽出せず説明を表示し、再許可後に一度だけcontent scriptが動くことを確認する。
5. add-on、local token、permission、test batchを削除する。

## 受け入れ条件

- Firefox stableでpairingから確認tabまで完了する。
- permission拒否時にdataを送らず、再許可で重複登録しない。
- 外部network request、production account、個人dataを使わない。
- cleanup後にtemporary add-on、token、batchが残らない。

## テスト

- Firefox stable manual smoke
- extension consoleとlocal API requestの確認

## 対象外

- Firefox Add-ons署名・公開、Chromium E2E、code修正。

## Blocker

2026-07-28時点で#055が未完了で、release buildと承認済みfixtureを使うflowがない。

## 解除条件

全`depends_on`が`done`で、Firefox stableへrelease buildをtemporary installできること。

## 解除後の着手点

`quality/extension/firefox-smoke.md`へFirefox versionとextension build hashを記録する。

## 禁止する代替

Chromium結果で代用する、production accountを使う、未承認fixtureを使う、cleanupを省略する方法を禁止する。
