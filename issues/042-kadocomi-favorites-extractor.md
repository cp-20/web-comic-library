---
id: 042
title: カドコミのお気に入りextractorを作る
type: feature
status: blocked
priority: P1
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: [009, 013, 039, 040, 091]
umbrella: 037
---

# カドコミのお気に入りextractorを作る

## 目的

カドコミを利用する読者が、login済みbrowserで表示中のお気に入り一覧から公開対象の作品候補を
抽出し、年齢区分を迂回せずWeb Comic Libraryの確認batchへ送れるようにする。

## 背景と現状の問題

`KadocomiConnector`は`comic-walker.com`の公開作品pageと埋め込みJSONを解析するが、お気に入りは
利用者固有dataである。extensionは`comic-walker.com`と`kadocomi.com`を許可候補に持つ一方、
`kadocomi` source keyとDOM extractorを持たない。

また、現行`PostgresFavoriteImport.createCandidates`はsource policyをbatch作成前に確認するが、
一致した`Publication.age_rating_value`の最新mappingが`public`かをexact match queryで確認しない。
extension側のDOM badgeだけで年齢区分を判断すると、表示変更やbadge欠落でexcluded作品をimport
できるため、公開可否はserverのcatalog policyでfail-closedに判定する。

## 実装判断と代替案

- #040のstatus付きmessage contractと`linkedom` fixture testを使い、読み込み済みDOMだけを抽出する。
  公開connectorの`#__NEXT_DATA__` parserは作品page用で、お気に入りpageの利用者dataを混ぜるため
  再利用しない。
- candidateはconnectorと同じ`https://comic-walker.com/detail/{workCode}`へcanonical化する。
  `kadocomi.com`が一覧hostまたは旧linkとしてfixtureに現れても、network redirectを辿らず
  `work.code`から正規URLを組み立てる。
- rating badgeは利用者への参考表示にも自動判定にも使わない。serverの最新
  `source_age_rating_mappings`が`public`である`Publication`だけをexact matchとし、mappingなし、
  `review`、`excluded`は`unmatched`として選択不能にする。
- DOMはWeb標準で解析し、新しいparser libraryを追加しない。内部API、viewer、画像request、
  自動paginationも行わない。

## スコープ

- #091で確認したお気に入りpageのURLと最小host permission。
- `work.code`、canonical作品URL、titleを返すpure extractor。
- `kadocomi` source keyのpolicy解決。
- favorite import exact matchへの最新年齢区分policy gate。
- 正常、空、partial、旧host、構造変更fixtureの回帰test。

## 変更対象

| file                                                  | 操作 | 変更内容                                                                                                |
| ----------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| `apps/extension/wxt.config.ts`                        | 変更 | #091で確認した現行お気に入りoriginだけをoptional permissionに残し、不要な旧originを削除する。           |
| `apps/extension/src/site-permissions.ts`              | 変更 | `kadocomi` source key、active page判定、`/detail/{workCode}` canonical化を追加する。                    |
| `apps/extension/src/favorites/kadocomi.ts`            | 作成 | root、作品link、empty、partial markerを検証してstatus unionを返す。                                     |
| `apps/extension/src/favorites/kadocomi.test.ts`       | 作成 | #091のfixture、旧host、未知code、重複、不整合を検証する。                                               |
| `apps/extension/entrypoints/favorites.content.ts`     | 変更 | 確認済みpageだけをKadocomi extractorへdispatchする。                                                    |
| `packages/db/src/favorite-import.ts`                  | 変更 | exact match queryを最新collection policy・emergency stop・年齢区分`public`で絞る。                      |
| `packages/db/src/favorite-import.integration.test.ts` | 変更 | public、excluded、review、mappingなし、retired、停止中の候補を検証する。                                |
| `apps/api/src/favorite-import.test.ts`                | 変更 | `kadocomi` source keyの許可と403、excluded候補が選択不能であることを検証する。                          |
| `docs/database.md`、`docs/web.md`                     | 変更 | favorite importにも公開catalogと同じrating gateを適用すること、canonical host、抽出禁止dataを追記する。 |

## component間の契約

extractorは次のcandidateだけを返す。

```ts
{
  canonicalUrl: `https://comic-walker.com/detail/${workCode}`,
  externalWorkId: workCode,
  sourceKey: 'kadocomi',
  title
}
```

`workCode`は既存connectorと同じ`^[A-Za-z0-9_]+$`、titleはNFKC正規化後1..200文字とする。
同じcodeで異なるtitle、同じtitleで異なる不正URL、root件数と作品link件数の矛盾は
`structure_changed`として全件破棄する。

DBのexact match queryは、candidateのsourceとURLまたはexternal IDが一致し、WorkとPublicationが
activeで、最新source policyが`collection = allowed`かつ非停止、さらに
`Publication.age_rating_value`に対する最新mappingが`public`の場合だけwork/publication IDを返す。
それ以外はcandidate snapshotを`unmatched`で保存し、確認画面に「公開対象外または未確認」と表示する。
年齢区分値そのものはextension payloadとAPI responseへ追加しない。

## 実装手順

1. #091のmanifestをURL判定testへ固定し、現行の二つのoptional originのうち必要なものだけを残す。
2. work code canonical化とDOM extractorをpure functionとして実装し、正常・empty・partial・changedを
   status unionへ変換する。
3. `kadocomi` source keyをpayloadへ追加し、APIのsource policy gate testを追加する。
4. `PostgresFavoriteImport`のexact queryへlatest policy/rating lateral joinを追加し、全sourceに同じ
   fail-closed条件を適用する。
5. popupからlocal fixtureを送るE2Eで、public候補だけが選択可能、excluded候補が選択不能であることを
   確認する。

## 受け入れ条件

- fixtureからwork code、`comic-walker.com` canonical URL、titleを抽出できる。
- 重複表示された作品を一件へまとめる。
- latest rating mappingが`public`のexact matchだけを選択できる。
- excluded、review、mappingなし、停止中の作品をlibraryへ反映せず、利用者へ件数と理由を示す。
- 未許可host、別page、構造変更時にpayloadを送らない。
- raw HTML、account情報、年齢確認pageの内容をbackendへ送らない。

## テスト

- 正常、空、partial、追加読込済み、旧host、構造変更fixture test
- latest policy/ratingを使うPostgreSQL integration test
- local fixture pageを使ったWXT Playwright Chromium E2E
- content scriptの外部network requestが0件であるtest
- `bun run check`
- `bun test`
- `bun run --cwd apps/extension build`
- `bun run --cwd apps/extension build:firefox`

## 対象外

- 年齢確認の自動通過。
- 公開作品page connectorの置き換え。
- DOM badgeからの年齢区分推測。
- 自動scroll、pagination request、内部API呼び出し。

## Blocker

2026-07-28時点で#091が未完了であり、login後のお気に入りpageが現在使うorigin、path、work codeの
link形式、empty・partial markerを確定できない。

## 解除条件

#040と#091が`done`で、カドコミのnormal/empty、該当時のpartial/pagination fixtureとmanifestが
repositoryに存在すること。

## 解除後の着手点

fixture manifestと`kadocomiConfig`の`baseUrl`を比較し、
`apps/extension/src/site-permissions.test.ts`へ入力originと出力canonical originを別々に固定する。

## 禁止する代替

公開作品pageからお気に入りselectorを推測する、rating badgeやtitleから公開可否を決める、
年齢確認を通過する、Cookie・raw HTML・内部API responseをbackendへ送る方法は採用しない。
