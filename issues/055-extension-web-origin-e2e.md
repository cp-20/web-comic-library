---
id: 055
title: extensionのWeb origin権限とbrowser E2Eを確定する
type: quality
status: open
priority: P1
depends_on: [038, 039]
umbrella: 037
---

# extensionのWeb origin権限とbrowser E2Eを確定する

## 目的

配備先のWeb originだけをextensionの通信先として明示し、pairingから確認画面を開くまでを実browserで検証する。

## 背景

お気に入りsiteへの任意権限とWeb applicationへの通信権限は別に管理する必要がある。配備先originが未確定のまま任意のhostをoptional permissionへ追加すると、最小権限の要件を損なう。

## スコープ

- deployment設定からWeb originをextension buildへ安全に渡す方法。
- Web originだけのhost permissionと、pairing・token保存・import batch作成のpopup flow。
- unpacked ChromeまたはFirefox extensionとPlaywrightによる確認画面遷移のE2E。
- manifestに不要なhost、`history`、`bookmarks`、`cookies`、`<all_urls>`がないことの検証。

## 実装方針

- Web originはbuild時設定で固定し、runtime入力から任意hostのpermissionを追加しない。
- 漫画siteへの任意権限とWeb originへの通信権限を別々に検査する。
- E2Eはfixtureだけを使い、外部漫画site、Cookie、実account、漫画本文へアクセスしない。

## 受け入れ条件

- pairing codeを交換したpopupが限定されたWeb originへだけrequestできる。
- import batch作成後に同一originの確認画面を開ける。
- E2Eで一括設定を選び、確認後のlibrary/follow反映を確認できる。
- 生成manifestに不要なhostまたは強い権限がない。

## テスト

- ChromeとFirefoxのmanifest検査。
- Playwrightによるunpacked extension popupから確認画面までのE2E。
- origin不一致、失効token、batch所有者不一致の拒否。

## 対象外

- extension store公開。
- 任意の利用者入力originへの通信許可。
