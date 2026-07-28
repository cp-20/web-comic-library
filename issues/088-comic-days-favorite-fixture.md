---
id: 088
title: コミックDAYSのお気に入りfixtureを取得・承認する
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

# コミックDAYSのお気に入りfixtureを取得・承認する

## 人が操作する理由

本人のaccountでお気に入りを取得し、sanitize後に個人情報が残っていないことを別の人も含めて確認する必要がある。

## Codexでは実行できない理由

Codexには利用者accountの認証sessionがなく、個人dataの提供同意や目視によるprivacy承認を代行できない。

## 目的と利用場面

提供者が自分の`comic-days.com` sessionでお気に入り一覧を表示し、個人情報のないfixtureとselector
manifestを承認して#040の実装入力にする。

## 背景と現状の問題

公開feedとlogin後のお気に入りDOMは別contractであり、agentはaccount固有画面を取得できない。
raw DOMの保存や他site selectorの流用は、情報漏洩または構造変更の見逃しになる。

## 実施判断と代替案

- local browser、provider自身のsession、#057 stdin sanitizerだけを使う。
- normal/emptyを必須にし、追加読込UIがある場合だけpartial/paginationを追加する。
- 二人目がsanitized outputと実画面のselectorを照合し、取得者だけの自己承認にしない。

## 変更対象

| file                                                         | 操作 | 変更内容                                                            |
| ------------------------------------------------------------ | ---- | ------------------------------------------------------------------- |
| `apps/extension/fixtures/favorites/comic-days/*.html`        | 作成 | 許可済み最小DOMを状態別に保存する。                                 |
| `apps/extension/fixtures/favorites/comic-days/manifest.json` | 作成 | host、pathname、pagination mode、selector、状態、取得日を保存する。 |
| `quality/favorites/reviews/comic-days.md`                    | 作成 | sanitize/verify hash、目視結果、実施者、reviewerを記録する。        |
| `issues/088-comic-days-favorite-fixture.md`                  | 変更 | report linkと結果を追記し、`done`へ進める。                         |

## 実施手順

1. 公式UIからお気に入り一覧へ移動し、origin、pathname、normal/empty状態を記録する。
2. root `outerHTML`をcopyし、`bun run --cwd apps/extension fixture:sanitize -- --source comic-days --state <state>`へstdinで渡す。
3. sanitized outputだけを`/tmp/comic-days-<state>.html`へ保存し、raw clipboardを消去する。
4. 追加読込UIがあれば読込前/全件読込後を取得し、なければ`paginationMode: "none"`をmanifestへ記録する。
5. verify後、二人目が禁止data不在とroot/item/link/title/empty/追加読込selectorを実画面で確認する。
6. 合格物とhashだけをrepositoryへ移し、temporary fileとclipboardを消去する。

## 受け入れ条件

- 必須状態と該当する追加読込状態のfixture・manifestが一致する。
- selectorとpathnameを実画面で確認し、verifyが成功する。
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

raw HTML/HAR/screenshot保存、別site selector流用、個人情報の事後削除を禁止する。
