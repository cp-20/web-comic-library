---
id: 090
title: ニコニコ漫画のお気に入りfixtureを取得・承認する
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

# ニコニコ漫画のお気に入りfixtureを取得・承認する

## 人が操作する理由

本人のaccountでお気に入りを取得し、sanitize後に個人情報が残っていないことを別の人も含めて確認する必要がある。

## Codexでは実行できない理由

Codexには利用者accountの認証sessionがなく、個人dataの提供同意や目視によるprivacy承認を代行できない。

## 目的と利用場面

提供者が自分のニコニコ漫画sessionでお気に入り一覧を表示し、現行origin、作品link、個人情報のない
fixtureとselector manifestを承認して#041の実装入力にする。

## 背景と現状の問題

extensionは`seiga.nicovideo.jp`を候補に持つが、現行お気に入りoriginと
`manga.nicovideo.jp/comic/{id}`へのlink contractは未確認である。公開作品pageやnetwork redirectから
推測するとhost permissionを過剰に残す可能性がある。

## 実施判断と代替案

- local browser、provider自身のsession、#057 stdin sanitizerだけを使う。
- normalには公式作品とユーザー投稿作品を少なくとも一件ずつ含め、表示上区別できなければその事実を記録する。
- normal/emptyを必須にし、追加読込UIがある場合だけpartial/paginationを追加する。

## 変更対象

| file                                                       | 操作 | 変更内容                                                           |
| ---------------------------------------------------------- | ---- | ------------------------------------------------------------------ |
| `apps/extension/fixtures/favorites/niconico/*.html`        | 作成 | 許可済み最小DOMを状態別に保存する。                                |
| `apps/extension/fixtures/favorites/niconico/manifest.json` | 作成 | origin、pathname、canonical host、pagination、selectorを保存する。 |
| `quality/favorites/reviews/niconico.md`                    | 作成 | sanitize/verify hash、作品種別確認、実施者、reviewerを記録する。   |
| `issues/090-niconico-favorite-fixture.md`                  | 変更 | report linkと結果を追記し、`done`へ進める。                        |

## 実施手順

1. 公式UIからお気に入り一覧へ移動し、現行origin、pathname、normal/empty状態を記録する。
2. root `outerHTML`をcopyし、`bun run --cwd apps/extension fixture:sanitize -- --source niconico --state <state>`へstdinで渡す。
3. sanitized outputだけを`/tmp/niconico-<state>.html`へ保存し、raw clipboardを消去する。
4. 追加読込UIがあれば読込前/全件読込後を取得し、なければ`paginationMode: "none"`を記録する。
5. verify後、二人目が禁止data不在、root/item/link/title/empty、作品linkのIDと現行originを実画面で確認する。
6. 合格物とhashだけをrepositoryへ移し、temporary fileとclipboardを消去する。

## 受け入れ条件

- 必須状態と該当する追加読込状態のfixture・manifestが一致する。
- 現行お気に入りoriginと作品link host/IDを実画面で確認できる。
- raw DOM、credential、個人情報、漫画本文、画像、tracking属性が保存されていない。
- reportにhash、取得日、実施者、二人目のreviewerがある。

## テスト

- #057 sanitizer/verify
- fixture schema test
- 人による個人情報、origin、selectorの目視確認

## 対象外

- extractor、作品種別推測、login自動化、credential共有。

## Blocker

2026-07-28時点で#057が未完成である。

## 解除条件

#057が`done`で、providerが自分のsessionでnormal/empty状態を表示できること。

## 解除後の着手点

normal状態の一覧originとpathnameを記録し、rootをsanitizer stdinへ渡す。

## 禁止する代替

raw HTML/HAR/screenshot保存、redirectや公開pageからのorigin推測、個人情報の事後削除を禁止する。
