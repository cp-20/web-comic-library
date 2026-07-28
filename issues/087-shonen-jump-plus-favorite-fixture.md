---
id: 087
title: 少年ジャンプ＋のお気に入りfixtureを取得・承認する
type: quality
status: blocked
priority: P0
execution: human
review_required: true
review_status: pending
reviewed_at: null
depends_on: [057]
umbrella: 071
---

# 少年ジャンプ＋のお気に入りfixtureを取得・承認する

## 人が操作する理由

本人のaccountでお気に入りを取得し、sanitize後に個人情報が残っていないことを別の人も含めて確認する必要がある。

## Codexでは実行できない理由

Codexには利用者accountの認証sessionがなく、個人dataの提供同意や目視によるprivacy承認を代行できない。

## 目的と利用場面

提供者が自分の`shonenjumpplus.com` sessionでお気に入り一覧を表示し、実DOMから個人情報を除いたfixtureと
selector manifestを作り、#040を推測なしで実装できる状態にする。

## 背景と現状の問題

login後DOMはagentとserver crawlerから取得できず、公開作品pageはお気に入り一覧のroot、empty表示、
追加読込を保証しない。raw HTMLを保存するとaccount情報がGit historyやbackupへ残る。

## 実施判断と代替案

- provider自身のlocal browserと#057のstdin sanitizerだけを使い、credential、HAR、raw HTMLを共有しない。
- synthetic HTMLと別siteの共通feed selectorは実画面の構造変更を検出できないため使わない。
- `normal`と`empty`を必須にし、追加読込UIがある場合だけ`partial`と読込後`pagination`も取得する。

## 変更対象

| file                                                               | 操作 | 変更内容                                                            |
| ------------------------------------------------------------------ | ---- | ------------------------------------------------------------------- |
| `apps/extension/fixtures/favorites/shonen-jump-plus/*.html`        | 作成 | 許可済み最小DOMを状態別に保存する。                                 |
| `apps/extension/fixtures/favorites/shonen-jump-plus/manifest.json` | 作成 | host、pathname、pagination mode、selector、状態、取得日を保存する。 |
| `quality/favorites/reviews/shonen-jump-plus.md`                    | 作成 | sanitize/verify hash、目視結果、実施者、reviewerを記録する。        |
| `issues/087-shonen-jump-plus-favorite-fixture.md`                  | 変更 | report linkと結果を追記し、`done`へ進める。                         |

## 実施手順

1. 公式UIからお気に入り一覧へ移動し、origin、queryを除くpathname、normal/empty状態を記録する。
2. 一覧rootの`outerHTML`だけをcopyし、`bun run --cwd apps/extension fixture:sanitize -- --source shonen-jump-plus --state <state>`のstdinへpasteする。
3. sanitizer出力だけを`/tmp/shonen-jump-plus-<state>.html`へ保存し、raw clipboardを直ちに消去する。
4. 追加読込UIがあれば読込前を`partial`、全件読込後を`pagination`として同じ手順で取得する。なければmanifestを`paginationMode: "none"`にする。
5. verifyを実行し、二人目がaccount、email、avatar、token、tracking、作品外textがないこととselectorを実画面で確認する。
6. 合格したfixture、manifest、hashだけを対象pathへ移し、`/tmp`とclipboardを消去する。

## 受け入れ条件

- normal/emptyと、該当時だけpartial/paginationのfixtureがmanifestと一致する。
- root、item、link、title、empty、追加読込selectorを実画面で確認できる。
- raw DOM、credential、個人情報、漫画本文、画像、tracking属性が保存されていない。
- reportにhash、取得日、実施者、二人目のreviewerがある。

## テスト

- #057 sanitizer/verify
- fixture schema test
- 人による個人情報とselectorの目視確認

## 対象外

- extractor、login自動化、credential共有、remote browser操作。

## Blocker

2026-07-28時点で#057が未完成である。

## 解除条件

#057が`done`で、providerが自分のsessionでnormal/empty状態を表示できること。

## 解除後の着手点

normal状態の一覧rootを一度だけsanitizer stdinへ渡す。

## 禁止する代替

raw HTML/HAR/screenshot保存、公開pageからの推測、個人情報をcommit後に削除する方法を禁止する。
