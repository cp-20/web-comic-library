# テスト規則

- 単体テストと統合テストには`bun test`を使う。
- domainはI/Oなしで状態遷移と不変条件を試験する。
- applicationはportを差し替えて認可、transaction、分岐を試験する。
- adapterは実DB、fixture、またはローカルHTTPサーバーで契約を試験する。
- APIはHono RPC clientを通してstatusとresponseを試験する。
- connector fixtureには漫画本文と漫画ページ画像を含めない。
- connector HTTP clientはBunのlocal HTTP serverとTCP serverでredirect、304、429、timeout、本文超過、途中切断を試験する。
- connector testは画像URLをrequest前に拒否し、server側のrequest件数が0であることを確認する。
- E2EにはPlaywrightを使い、巡回処理には流用しない。
- E2Eは`bun run test:e2e`で実行し、mobile Chromium・同一repositoryのfixture APIを使う。外部site、実account、Cookie、漫画本文にはアクセスしない。
- Playwrightのaxe検査はWCAG 2.2 A/AAの重大違反を拒否する。keyboardとscreen readerの手動確認は`issues/035-performance-accessibility-e2e.md`へ結果を残す。
- 性能検査は固定fixture・mobile ChromiumでLCP 2.5秒以下を検査する。実運用の75 percentile、INP、CLS、負荷・soak試験は計測基盤と本番相当環境で別途記録し、fixture検査の結果だけで代替しない。
- 不具合修正には修正前に失敗する最小の回帰テストを付ける。

通常の完了条件は次の二つとする。

```sh
bun run check
bun test
```
