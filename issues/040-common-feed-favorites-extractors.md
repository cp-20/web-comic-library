---
id: 040
title: 共通feed型3サイトのお気に入りextractorを作る
type: feature
status: open
priority: P1
depends_on: [009, 011, 039]
umbrella: 037
---

# 共通feed型3サイトのお気に入りextractorを作る

## 目的

少年ジャンプ＋、コミックDAYS、となりのヤングジャンプで、利用者に表示されているお気に入り作品をimport候補へ変換する。

## 背景

公開feedの構造が共通でも、login後のお気に入り画面が同じとは限らない。

三サイトのselectorは別fixtureで検証する。

## スコープ

- 三サイトのお気に入りpageを識別するURL規則。
- WXT runtime content scriptとsite別extractor。
- 外部作品ID、canonical作品URL、表示titleの抽出。
- paginationまたは追加読込済みDOMの走査。
- 個人情報を除去した最小HTML fixture。
- popup上の件数、未対応page、構造変更error表示。

## 実装方針

- 利用者がお気に入りpageでimportを実行した場合だけDOMを読む。
- 各siteのhost permissionを個別に要求する。
- pageに表示された作品linkを第一候補とし、非公開内部APIを呼ばない。
- 明示された次pageのHTMLを取得する場合は同一originに限定し、1秒以上の間隔とpage上限を設ける。
- infinite scrollしかない場合は、利用者が読込済みのDOMだけを対象にして件数を明示する。
- 漫画本文、画像、account名、Cookie、CSRF tokenを抽出しない。
- selector不一致や件数急減を空のお気に入りとして扱わない。

## 受け入れ条件

- 各siteのfixtureから重複しない候補を抽出できる。
- 別pageと作品pageではextractorを実行しない。
- 未許可hostではcontent scriptを登録しない。
- paginationを停止、再試行でき、同じ作品を二重送信しない。
- 構造変更時に候補を送らず利用者へerrorを表示する。

## テスト

- 三サイトそれぞれの正常、空、pagination、構造変更fixture test。
- WXTを読み込んだbrowserでlocal fixture pageを抽出するE2E。
- network request先と抽出payloadに禁止dataがないことを検査する。

## 対象外

- 漫画viewerからの既読取得。
- 三サイトのaccount credential保存。
