# コネクタ規則

## 境界

コネクタは公開メタデータをapplicationの候補型へ変換するadapterである。

DB更新と通知判定はapplication use caseへ任せる。

```ts
interface Connector {
  discover(context: DiscoveryContext): Promise<DiscoveryBatch>;
  fetchPublication(ref: PublicationRef): Promise<PublicationCandidate>;
}
```

## HTTP

- `Bun.fetch`だけを使う。
- 接続とredirect先をhost allowlistで検証する。
- hostごとの同時接続は1、通常間隔は最低2秒とする。
- timeoutは10秒、redirectは3回、本文は5MiBを上限とする。
- ETag、Last-Modified、304を利用する。
- `Retry-After`を優先し、ほかの一時失敗は指数backoffする。
- 認証、CAPTCHA、paywall、年齢確認を回避しない。
- 漫画本文、漫画ページ画像、viewer manifestを取得しない。

`ConnectorHttpClient`は`redirect: "manual"`で最大3回までredirectを追跡し、requestごとにallowlistを再検証する。

hostごとのrequestは`HostRequestScheduler`で直列化し、開始間隔を2秒以上に保ってjitterを加える。

429では`Retry-After`を優先し、ほかの一時応答、timeout、network失敗では指数backoffを使う。

ETagとLast-Modifiedは`FetchResourceState`からconditional headerへ設定する。

304では本文を読まず、確認日時とresponse validatorだけを更新する。

本文はstreamとして読み、5MiBを超えた時点で中止する。

画像拡張子と画像Content-Typeはrequest前に拒否する。

## 解析

HTMLとXMLはCheerio、埋め込みJSONは`JSON.parse`で解析する。

抽出値はValibotで検証し、必須値の欠落を「更新なし」にしない。

```text
fetch -> decode -> parse -> validate -> normalize -> use case
```

parserはI/Oを持たない純粋関数にする。

schema変更時は既存データを維持し、コネクタを停止して通知する。

外部値は`validateConnectorValue`からValibotの`safeParse`へ渡す。

検証失敗時は値を補完せず、`validation`としてcrawl runへ記録する。

## 共通フィード型

少年ジャンプ＋、コミックDAYS、となりのヤングジャンプは`CommonFeedConnector`へサイト設定を渡して収集する。

設定はbase URL、全体Atom URL、許可hostだけを持ち、サイト別classは作らない。

全体Atomの`entry`から話題名、更新日時、話URL、作者を読み、話ページから作品名、作者、作品別RSSを補完する。

作品別RSSの履歴は、正規化した話URLを外部keyとして返す。

queryとfragmentは外部keyから除外し、hostと`/episode/{id}`のpathが変わった場合は検証失敗とする。

話題名の明示的な話数表現を通常話、番外編、特別編、読切を番外編として扱い、それ以外は判定不能にする。

checkpointは最新更新日時と同時刻の話URLを保持し、同じAtom entryを再処理しない。

HTMLまたはfeedの必須要素が欠けた場合はcrawl全体を失敗させ、checkpointを進めず、既存dataを削除しない。

話HTML内の`img`とfeed内の`enclosure`は解析対象にせず、画像URLへrequestしない。

## ニコニコ漫画

`NiconicoConnector`は`/manga/list?sort=manga_updated`を先頭から走査し、checkpointの透かし作品IDに到達するまでの作品だけを詳細取得する。

透かしが設定した最大page数までに見つからない場合は更新なしとして扱わず、検証失敗で停止する。

初回backfillは`sort=manga_created`を使い、page番号と最後に処理した`/comic/{id}`をcheckpointへ保存する。

通常巡回とbackfillが同時に待機している場合は、通常巡回を先に選ぶ。

一覧では`li.mg_item.item`から作品名、作者、開始日、更新日、公開話数を読み、作品ページでは`li.episode_item`から公開話だけを読む。

作品と話の外部keyには、それぞれ`/comic/{id}`の数値IDと`/watch/{id}`のIDを使う。

公式作品は`ul.sg_pankuzu`内の`/official/{channel}`だけを根拠にする。

ユーザー投稿は確認済み作品IDと根拠URLが設定された場合だけ判定し、公式とユーザー投稿の根拠がない作品は`unknown`とする。

ログイン、年齢確認、非公開、公開終了、有料購入が必要な作品と話は取得対象から除外し、制限を回避しない。

直近更新作品は翌日、180日以上更新がない作品は30日後、完結表示のある作品は90日後を次回確認時刻とする。

漫画本文、話画像、thumbnailは取得せず、公開一覧と作品HTMLだけを解析する。

## 巡回状態

resourceごとのETag、Last-Modified、本文SHA-256、確認日時は`FetchResourceState`へ保存する。

取得元ごとのcheckpoint、連続失敗数、停止状態は`SourceCrawlState`へ保存する。

候補保存、fetch state、checkpoint、成功runは`commitDiscovery`で同じdatabase transactionへ保存する。

候補保存に失敗した場合はcheckpointを進めない。

3回の連続失敗で取得元を停止し、成功だけでは自動再開しない。

workerは`discoverIfActive`を通して停止状態を確認し、`stopped`の取得元では`Connector.discover`を呼ばない。

運営者は原因を解消してから明示的に再開する。

## 対応済みの抽出方針

- **共通フィード型**：少年ジャンプ＋、コミックDAYS、となりのヤングジャンプのAtomと作品別RSS。
- **ニコニコ漫画**：更新順一覧、作品ページ、`/comic/{id}`、`/watch/{id}`。
- **カドコミ**：公開HTML内の`#__NEXT_DATA__`。非公開APIは直接呼ばない。

掲載元の年齢区分は確認済みの対応表で変換し、未知の値は公開しない。

## 取得元policy gate

workerはHTTP requestの直前に最新の取得元policyを確認する。

未確認、拒否、緊急停止中の取得元ではconnectorを呼ばない。

HTTP responseの取得後とjob投入の直前にもpolicyを再確認し、取得中に緊急停止された場合はjobを投入しない。

公開queryは取得元固有の年齢区分mappingが`public`である掲載先だけを検索、通知、共有へ渡す。

R18、年齢確認必須、`review`、未確認値は公開対象にしない。

## fixture

fixtureは漫画本文、画像、token、個人情報を除いた最小HTML、XML、JSONにする。

fixture名は英小文字、数字、hyphenと`.html`、`.xml`、`.json`だけを使い、`readConnectorFixture`で読み込む。

各parserで正常系、必須値欠落、未知値、冪等性、画像非取得をテストする。

実サイトの構造変更では、変更を再現するfixtureを追加してからparserを修正する。
