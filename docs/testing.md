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
- Playwrightのaxe検査はWCAG 2.2 A/AAの重大違反を拒否する。keyboard操作はE2Eで自動確認する。これらの自動検査と、#075の環境、#080〜#082の人によるkeyboard、NVDA、Android実機確認は#062でrelease後品質として追跡し、初期リリースの公開条件にしない。
- pull requestと初期リリースの性能検査は固定fixture・mobile ChromiumのLCP、ローカルAPI microbenchmark、fixture E2E loadで検証する。release後のk6 scenarioは`issues/074-k6-post-release-load-scenario.md`、24時間の実施とcapacity判定は`issues/065-post-release-load-capacity-review.md`へ分離し、初期リリースの公開条件にしない。
- 不具合修正には修正前に失敗する最小の回帰テストを付ける。

通常の完了条件は次の二つとする。

```sh
bun run check
bun test
```
