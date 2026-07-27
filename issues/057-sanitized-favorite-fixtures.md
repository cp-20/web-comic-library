---
id: 057
title: 匿名化したお気に入りDOM fixtureを用意する
type: quality
status: blocked
priority: P1
depends_on: []
umbrella: 037
---

# 匿名化したお気に入りDOM fixtureを用意する

## 目的

login後のお気に入りpageから、個人情報・credentialを含まない最小fixtureを得て、site固有extractorを推測せずに検証できるようにする。

## 背景

少年ジャンプ＋、コミックDAYS、となりのヤングジャンプ、ニコニコ漫画、カドコミのお気に入り一覧は利用者固有dataであり、公開トップだけから安定selectorを確定できない。

## スコープ

- 各siteの正常、空、paginationまたは追加読込済みDOM、構造変更を再現する最小HTML fixture。
- 作品link、表示title、pagination linkだけを残す匿名化手順。
- fixtureにaccount名、account ID、email、Cookie、CSRF token、閲覧履歴、画像URL、漫画本文を含めない検査。

## 実装方針

- credentialやbrowser profileを共有・収集しない。
- fixtureは利用者が明示的に提供したHTMLを匿名化してからrepositoryへ保存する。
- login画面、account menu、広告、viewer、画像、内部API responseはfixtureへ含めない。

## 受け入れ条件

- 各siteのfixtureが個人情報とcredentialを含まない。
- fixtureは作品linkと表示titleの抽出、空一覧、pagination、構造変更を再現できる。
- fixture取得元、確認日時、匿名化範囲を監査記録へ残す。

## テスト

- 禁止fieldと画像・viewer URLがfixtureに含まれない静的検査。
- 各extractorのfixture testで正常・空・pagination・構造変更を検証する。

## 対象外

- 実accountへのlogin。
- credential、Cookie、個人情報の収集・保存。

## Blocker

匿名化済みのlogin後お気に入りDOM fixtureがまだ提供されていない。credentialではなく、上記の禁止fieldを除去した最小HTMLが必要である。
