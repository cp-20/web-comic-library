---
id: 040
title: 共通feed型3サイトのお気に入りextractorを作る
type: feature
status: blocked
priority: P1
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: [009, 011, 039, 087, 088, 089]
umbrella: 037
---

# 共通feed型3サイトのお気に入りextractorを作る

## 目的

少年ジャンプ＋、コミックDAYS、となりのヤングジャンプを利用する読者が、現在開いている
お気に入り一覧から作品linkと表示titleだけを抽出し、Web Comic Libraryの確認batchへ送れるようにする。

## 背景と現状の問題

`apps/extension/entrypoints/favorites.content.ts`は対象hostへruntime登録されるが、常に
`{ favorites: [] }`を返すplaceholderである。popupはこの応答を「お気に入りが0件」と表示するため、
未実装、正しい空一覧、siteのDOM変更を区別できない。

3 siteは更新収集では`CommonFeedConnector`を共有するが、login後のお気に入りDOMは別実装であり、
connectorのAtom/RSS parserを再利用できない。server crawlerでお気に入りを取得すると利用者の
Cookieをserverへ渡す必要があるため、利用者のactive tab内だけで抽出する。

## 実装判断と代替案

- browserが構築済みのDOMをWeb標準の`querySelectorAll`で読む。content scriptへCheerioをbundle
  すると同じDOMを文字列へ戻して再parseするだけで容量が増えるため使わない。
- parser単体testは#057がdev dependencyへ追加した`linkedom`で匿名化HTMLから`Document`を作る。
  jsdomはlayout・networkを含む大きな実装で、selectorと属性のtestには不要である。
- extractorは利用者が読み込み済みのDOMだけを対象にする。認証済みpaginationを自動fetchすると、
  Cookie付きrequestの回数・停止条件がsiteごとに変わりcrawlerに近づくため行わない。「もっと見る」
  が残る場合は`partial`として件数と再実行方法をpopupへ表示する。
- CSS module/hash classを契約にしない。#087〜#089のfixture manifestで確認したお気に入り一覧root、
  作品URL pattern、linkのaccessible nameまたは隣接見出しを使う。
- 空一覧はfixtureで確認したempty-state selectorが存在する場合だけ`empty`とする。作品linkも
  empty-stateもない場合は`structure_changed`とし、payloadを送らない。

## スコープ

- 3 siteのお気に入りpageだけを許可するURL判定。
- site別のDOM extractorと、content scriptからのdispatch。
- source key、外部作品ID、query・fragmentを除いたcanonical作品URL、表示titleの抽出。
- `ok`、`empty`、`partial`、`unsupported_page`、`structure_changed`の応答とpopup表示。
- #087〜#089が作るnormal、empty、該当時の追加読込fixtureと、それを変形した構造変更fixtureによる回帰test。

## 変更対象

| file                                                                   | 操作     | 変更内容                                                                                  |
| ---------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `apps/extension/package.json`、`bun.lock`                              | 変更なし | #057で固定済みの`linkedom`をfixture testだけで使い、runtime bundleからはimportしない。    |
| `apps/extension/src/messages.ts`                                       | 変更     | content script応答をstatus付きdiscriminated unionにし、raw HTMLを型上送れなくする。       |
| `apps/extension/src/site-permissions.ts`                               | 変更     | 3 siteのsource key、#087〜#089で確定したお気に入りpage URL判定、作品URL正規化を追加する。 |
| `apps/extension/src/favorites/types.ts`                                | 作成     | `FavoriteExtractor`、`FavoriteCandidate`、status unionを定義する。                        |
| `apps/extension/src/favorites/common-feed-sites.ts`                    | 作成     | 3 siteのroot・link・empty・partial判定とcandidate抽出を純粋関数で実装する。               |
| `apps/extension/src/favorites/common-feed-sites.test.ts`               | 作成     | #087〜#089のfixtureを`linkedom`でparseし、3 siteの全caseを検証する。                      |
| `apps/extension/entrypoints/favorites.content.ts`                      | 変更     | `location`でsiteを選び、利用者のmessage受信時だけextractorを呼ぶ。                        |
| `apps/extension/src/popup.ts`、`apps/extension/entrypoints/popup.html` | 変更     | status別message、抽出件数、partial時の再実行案内を表示し、`ok`だけをAPIへ送る。           |
| `apps/extension/src/site-permissions.test.ts`                          | 変更     | お気に入りpage以外、別host、query付き作品URL、旧hostを含むURL境界を追加する。             |
| `docs/web.md`                                                          | 変更     | extensionは読み込み済みDOMだけを抽出し、自動paginationしない規則を追記する。              |

## component間の契約

`FavoriteCandidate`は次の4 fieldだけを持つ。

```ts
type FavoriteCandidate = Readonly<{
  canonicalUrl: string;
  externalWorkId: string | null;
  sourceKey: 'comic-days' | 'shonen-jump-plus' | 'tonari-no-young-jump';
  title: string;
}>;
```

応答は`ok`だけが`favorites`を持ち、`empty`はfixtureで確認した空表示、`partial`は
読み込み操作が残る状態、`unsupported_page`は許可host内の別page、`structure_changed`は契約要素の
欠落を表す。popupは`ok`以外で`POST /api/extension/favorite-imports`を呼ばない。

titleはtext contentをNFKC正規化して連続空白を一つにし、1..200文字だけを許可する。URLは
`https`、許可host、#087〜#089で確認した作品pathだけを許可し、queryとfragmentを削除する。external IDは
作品pathの一つのID segmentから得られる場合だけ設定し、DOM attributeやtitleから推測しない。
重複keyは`sourceKey + "\0" + canonicalUrl`とし、DOM順を保って最初の一件を採用する。

## 実装手順

1. #087〜#089の各`manifest.json`からpage URL、作品path、root、empty、pagination modeを転記し、
   URL判定と純粋なcandidate正規化testを先に追加する。
2. `common-feed-sites.ts`をsite設定tableと共通走査関数で実装する。site別classは作らないが、
   selectorとpath patternはsiteごとに独立した設定値にする。
3. message contractとcontent scriptをstatus unionへ変更し、構造変更fixtureでAPI callが0件になる
   browser testを追加する。
4. popupをstatus別に表示し、`partial`では「一覧を最後まで読み込んで再実行」と現在件数を示す。
5. manifest権限、payloadのkey、network request先を検査し、docsを更新する。

## 受け入れ条件

- 3 siteの正常fixtureからsource key、ID、canonical URL、titleが一致する候補をDOM順に抽出できる。
- 確認済みempty fixtureだけを0件として表示し、別pageと構造変更ではAPIへ送信しない。
- 未許可hostではcontent scriptを登録しない。
- load-more markerがあると`partial`になり、利用者が追加読込後に再実行できる。
- 同じ作品の重複表示、query・fragment違いを一件へまとめる。
- candidateとextension logにaccount名、account ID、Cookie、token、画像URL、raw HTMLがない。

## テスト

- 3 siteそれぞれの正常、空、追加読込済み、partial、構造変更fixture test
- WXTを読み込んだPlaywright Chromiumでlocal fixture pageを抽出するE2E
- content scriptが外部network requestを0件しか行わないtest
- `bun run check`
- `bun test`
- `bun run --cwd apps/extension build`
- `bun run --cwd apps/extension build:firefox`

## 対象外

- 漫画viewerからの既読取得。
- 三サイトのaccount credential保存。
- お気に入りpageの自動scroll、pagination request、非公開API呼び出し。
- お気に入り解除の同期。

## Blocker

2026-07-28時点でlogin後のお気に入りDOMを認証なしでは確認できず、公開pageからselectorを
推測できない。#087、#088、#089が`blocked`である。

## 解除条件

#087、#088、#089が`done`になり、3 siteそれぞれのnormal/empty、該当時のpartial/pagination fixtureと
`manifest.json`がrepositoryに存在すること。

## 解除後の着手点

`apps/extension/src/site-permissions.test.ts`へ3 siteのmanifest記載URLを追加し、URL判定testを
失敗させる。

## 禁止する代替

公開pageからselectorを推測する、利用者のCookieやHTMLをbackendへ送る、非公開APIを呼ぶ、
selector不一致を空一覧として送る方法は採用しない。
