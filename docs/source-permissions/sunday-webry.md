# サンデーうぇぶり metadata利用判断

- 判断日：2026-07-28
- 判断者：repository owner `cp-20`
- 結論：許可
- 対象：作品名、作者名、公開話名、公開日時、canonical URL、年齢区分、公開状態
- 利用：自動収集、保存、catalog表示、検索、follow、更新通知
- 制限：漫画本文、画像、viewer、認証情報、非公開endpointは対象外
- request：同時実行1、最大1 request/秒。公式制限がより厳しい場合は公式制限を優先する
- 失効時：source policyを停止し、新規取得と公開を止める

connector実装前に、認証不要の公式metadata surfaceのhost/pathとresponse contractを
`docs/connectors.md`へ固定する。
