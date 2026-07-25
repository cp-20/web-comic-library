# コネクタ規則

## 境界

コネクタは公開メタデータをapplicationの候補型へ変換するadapterである。

DB更新と通知判定はapplication use caseへ任せる。

```ts
interface PublicationSource {
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

## 解析

HTMLとXMLはCheerio、埋め込みJSONは`JSON.parse`で解析する。

抽出値はValibotで検証し、必須値の欠落を「更新なし」にしない。

```text
fetch -> decode -> parse -> validate -> normalize -> use case
```

parserはI/Oを持たない純粋関数にする。

schema変更時は既存データを維持し、コネクタを停止して通知する。

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

各parserで正常系、必須値欠落、未知値、冪等性、画像非取得をテストする。

実サイトの構造変更では、変更を再現するfixtureを追加してからparserを修正する。
