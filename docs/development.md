# 共通の開発規則

## コマンド

```sh
bun install --frozen-lockfile
bun run dev:web
bun run dev:api
bun run check
bun test
```

package操作には`bun add`、一時CLIには`bunx`を使う。

npm、pnpm、Yarn、Node.jsランタイムは併設しない。

application、build script、repository内CLIのruntimeはBunに統一する。protocol-levelの継続負荷試験には
test toolとしてk6を使ってよい。k6はapplication dependencyへ追加せず、利用issueでversion、入力、
threshold、Secretを含まないartifact、local/CIの実行方法を固定する。

## formatとlint

oxfmtをformatter、oxlintをlinterに使う。

Prettier、ESLint、Biomeは追加しない。

`bun run check`はformat、lint、全workspaceの型検査を行う。

lint規則を無効化する場合は、対象を最小限にして理由を書く。

## GitHubへの変更公開

repositoryの変更は直接`main`へpushしない。作業ごとに専用branchを作成し、変更対象だけをcommit・pushしてPRを作成する。PRの必要なGitHub Actionsが成功したことを確認してから`main`へmergeし、ローカルの`main`をremote `main`へfast-forwardする。merge後は、PRとmerge commit、実行した検証を作業結果へ記録する。

GitHub、production、外部service、Secret、database、永続dataに影響する操作は、実行前に`audit.md`へ対象、操作、危険性、保護策、cleanup、関連PRを記録し、操作後に結果を追記する。Secretの値と個人情報は記録しない。

## TypeScript

- `strict`と`noUncheckedIndexedAccess`を有効にする。
- 外部入力は`unknown`からValibotで検証する。
- 公開関数、port、use caseは戻り値型を明示する。
- 状態は複数のbooleanではなく判別可能unionで表す。
- workspace間の相対importとdeep importを使わない。

構成を変えた場合は`docs/architecture.md`も更新する。
