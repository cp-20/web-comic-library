---
id: 041
title: ニコニコ漫画のお気に入りextractorを作る
type: feature
status: blocked
priority: P1
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: [009, 012, 039, 040, 090]
umbrella: 037
---

# ニコニコ漫画のお気に入りextractorを作る

## 目的

ニコニコ漫画を利用する読者が、login済みbrowserで表示中のお気に入り漫画一覧からseriesを
抽出し、公式作品とユーザー投稿作品を区別せず同じ確認batchへ送れるようにする。

## 背景と現状の問題

`NiconicoConnector`は公開更新一覧と作品pageを`manga.nicovideo.jp`から収集できるが、
お気に入りは利用者固有で公開crawlerの対象外である。extensionのpermissionには
`seiga.nicovideo.jp`がある一方、source key mapにニコニコ漫画がなく、content scriptも空配列を
返すだけである。このままでは候補を送れず、hostを誤って直すと必要以上のsite権限を要求する。

## 実装判断と代替案

- #040で定義したstatus付きmessage contractを使い、#090のmanifestで確定したお気に入りpageの
  読み込み済みDOMだけを抽出する。内部APIや自動paginationは利用者の認証requestをextensionが
  代理実行するため採用しない。
- candidateのcanonical URLはconnectorと同じ
  `https://manga.nicovideo.jp/comic/{numericId}`へ統一する。お気に入りDOMが旧
  `seiga.nicovideo.jp` linkを返す場合もIDだけを取り出して同じURLへ変換し、redirect先を
  networkで確認しない。
- DOM解析はWeb標準、fixture testは#040で追加する`linkedom`を使う。ニコニコ専用のparser libraryは
  必要なく、Cheerioをcontent scriptへbundleしない。
- 公式・ユーザー投稿の判定をextensionで行わない。`/comic/{id}`がcatalogに完全一致するかを
  #039のserver照合へ委ね、titleやDOM badgeからsource種別を推測しない。

## スコープ

- #090で確認したニコニコ漫画のお気に入りpage URLとhost permission。
- runtime content scriptから呼ぶsite別pure extractor。
- `/comic/{id}`、canonical URL、表示titleの抽出。
- `niconico` source keyのextension payloadとserver側policy解決。
- 正常、公式・ユーザー投稿混在、空、partial、構造変更fixtureの回帰test。

## 変更対象

| file                                                                            | 操作     | 変更内容                                                                                                  |
| ------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `apps/extension/wxt.config.ts`                                                  | 変更     | #090で確認したお気に入りpageのoriginだけを`optional_host_permissions`へ残す。旧originが不要なら削除する。 |
| `apps/extension/src/site-permissions.ts`                                        | 変更     | active page判定、`niconico` source key、`/comic/{id}`のcanonical化を追加する。                            |
| `apps/extension/src/favorites/niconico.ts`                                      | 作成     | root、作品link、empty、partial markerを検証してstatus unionを返す。                                       |
| `apps/extension/src/favorites/niconico.test.ts`                                 | 作成     | #090の全fixtureとURL境界を検証する。                                                                      |
| `apps/extension/entrypoints/favorites.content.ts`                               | 変更     | 確認済みoriginとpageだけを`niconico` extractorへdispatchする。                                            |
| `apps/extension/src/site-permissions.test.ts`                                   | 変更     | `watch`、`image`、広告、別host、非数値comic IDを拒否するcaseを追加する。                                  |
| `packages/application/src/source-policy.ts`、`packages/db/src/source-policy.ts` | 変更なし | 既存の`resolveCollectableSourceId('niconico')`を使用し、新しい解決経路は作らない。                        |
| `apps/api/src/favorite-import.test.ts`                                          | 変更     | `niconico`が許可済みならbatchを作り、未登録・停止中なら403で何も保存しないcaseを追加する。                |
| `docs/web.md`                                                                   | 変更     | ニコニコ漫画で許可するpage、canonical host、抽出禁止dataを追記する。                                      |

## component間の契約

extractorは#040の`FavoriteCandidate`へ次を設定する。

```ts
{
  canonicalUrl: `https://manga.nicovideo.jp/comic/${comicId}`,
  externalWorkId: comicId,
  sourceKey: 'niconico',
  title
}
```

`comicId`は`/comic/`直後のASCII数字だけを許可する。titleはNFKC正規化、連続空白の縮約後に
1..200文字とする。同じIDが複数表示された場合は最初を採用し、同じIDで異なるtitleがある場合は
`structure_changed`として全候補を破棄する。

## 実装手順

1. #090の`manifest.json`からactive page origin・pathとDOM markerを
   `site-permissions.test.ts`へ固定し、現在のhost permissionの過不足を先に失敗させる。
2. URL canonical化とcandidate重複規則をpure functionで実装し、旧host linkと正規host linkが同じ
   candidateになるtestを追加する。
3. `niconico.ts`でroot、empty、partialの順に判定し、作品link以外を無視する。
4. content scriptへdispatchを追加し、popupから`niconico` candidateを既存favorite-import APIへ送る。
5. API testでsource policy gateを確認し、extension buildとFirefox buildを実行する。

## 受け入れ条件

- fixtureからcomic ID、上記canonical URL、titleを抽出できる。
- 公式とユーザー投稿のどちらも同じcandidate contractへ変換できる。
- 重複表示されたseriesを一件へまとめる。
- 未許可host、別page、ID不整合、構造変更時にpayloadを送らない。
- empty markerがあるfixtureだけを0件として扱い、partialでは追加読込を案内する。
- raw HTMLとaccount固有fieldをbackendへ送らない。

## テスト

- 公式、ユーザー投稿、空、partial、追加読込済み、構造変更fixture test
- local fixture pageを使ったWXT Playwright Chromium E2E
- content scriptの外部network requestが0件であるtest
- policy許可・停止・未知source keyのHono RPC test
- `bun run check`
- `bun test`
- `bun run --cwd apps/extension build`
- `bun run --cwd apps/extension build:firefox`

## 対象外

- viewerの読了位置。
- 限定公開と年齢制限付き作品の回避。
- 公式・ユーザー投稿のextension内判定。
- 自動scroll、pagination request、内部API呼び出し。

## Blocker

2026-07-28時点で#090が未完了であり、login後のお気に入りpageの現行origin、path、empty表示、
load-more markerを確定できない。

## 解除条件

#040と#090が`done`で、ニコニコ漫画のnormal/empty、該当時のpartial/pagination fixtureとmanifestが
repositoryに存在すること。

## 解除後の着手点

fixture manifestのpage URLと現在の`seiga.nicovideo.jp` permissionを比較し、
`apps/extension/src/site-permissions.test.ts`に期待するoriginを固定する。

## 禁止する代替

公開作品pageからお気に入りselectorを推測する、認証requestを自動送信する、Cookieまたはraw HTMLを
backendへ送る、DOM badgeから公式・ユーザー投稿を推測する方法は採用しない。
