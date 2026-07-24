# Repository instructions

変更対象に対応する文書を作業前に読む。

- 構成と依存方向：[docs/architecture.md](./docs/architecture.md)
- 共通の開発規則：[docs/development.md](./docs/development.md)
- Web：[docs/web.md](./docs/web.md)
- API：[docs/api.md](./docs/api.md)
- worker：[docs/worker.md](./docs/worker.md)
- データベース：[docs/database.md](./docs/database.md)
- 巡回処理：[docs/connectors.md](./docs/connectors.md)
- テスト：[docs/testing.md](./docs/testing.md)
- 配備：[docs/deployment.md](./docs/deployment.md)
- issue管理：[docs/issues.md](./docs/issues.md)

## リポジトリ全体の規則

- ランタイムとpackage managerにはBunだけを使う。
- TypeScriptはstrictを維持し、`any`と根拠のないtype assertionを使わない。
- workspace間はpackageの`exports`を使い、相対importとdeep importをしない。
- 依存方向はdeliveryとadapterからapplication、applicationからdomainへ向ける。
- formatterはoxfmt、linterはoxlintを使う。
- Secretと個人情報をコード、fixture、ログへ含めない。

## 完了条件

```sh
bun run check
bun test
```

Webを変更した場合は`bun run build:web`も実行する。
