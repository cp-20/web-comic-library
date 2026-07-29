# issue操作ガイド

この文書を`issues/*.md`の検索、閲覧、検証、workflow属性更新に使うtoolの正本とする。issue本文の
書き方、frontmatter schema、状態規則は[issue管理](./issues.md)を参照する。

## Coding Agent向けCLI

repository rootで`bun run issues:cli --`にcommandを続ける。stdoutは結果だけ、入力errorとschema
errorはstderrへ出し、失敗時はexit code 1を返す。Agentが値を再解析する場合は`--json`を使う。

### 実装候補を選ぶ

```sh
bun run issues:cli -- next --json
```

`execution: agent`、`status: open`、`review_status: approved`で、すべての直接依存が`done`の
issueだけをpriority、id順で返す。
本文を読まずに着手対象を決める用途では、`list`ではなく`next`を使う。

### 一覧と絞り込み

```sh
bun run issues:cli -- list
bun run issues:cli -- list --priority P1 --execution agent --json
bun run issues:cli -- list --status review --review-status pending --json
bun run issues:cli -- list --umbrella 033 --json
bun run issues:cli -- list --all --json
```

`list`は既定で`done`を除外する。`--all`を付けた場合だけ完了済みを含める。filterは`--status`、
`--priority`、`--execution`、`--review-status`、`--umbrella`をAND条件で適用する。text形式は
tab区切り、JSON形式は本文とrevisionを含まない配列である。blocked issueは`BLOCKER`列または
`blocker` fieldに本文の`## Blocker`要約を返すため、`dependsOn`をたどる前に停止理由を確認できる。

### 本文を読む

```sh
bun run issues:cli -- show 073
bun run issues:cli -- show 073 --json
```

text形式はfrontmatterを含むMarkdown fileをそのまま返す。JSON形式はparse済み属性、本文、現在の
revisionを返す。実装前は対象issueに加え、`depends_on`と`umbrella`のissueも`show`で読む。

### workflow属性を更新する

```sh
bun run issues:cli -- update 073 --status review --review-status pending
bun run issues:cli -- update 073 --status open --review-status approved
bun run issues:cli -- update 073 --status in_progress
bun run issues:cli -- update 073 --status done
bun run issues:cli -- update 073 --priority P2 --json
```

指定した属性だけを変更し、未指定値と本文は維持する。更新直前にdisk上のrevisionを読み、同じstoreの
revision guardとatomic renameを使う。変更可能なのは`status`、`priority`、`execution`、
`review_status`だけである。

CLIは矛盾する状態を補完しない。PR reviewなどの粗い所見は`status: unpolished`と
`review_status: not_requested`で保存できる。この状態は実装対象ではない。issue本文が書き上がったら`status: review`と
`review_status: pending`にし、人が本文を承認したら`review_status: approved`と着手可能なstatusを
同じcommandで指定する。成果物のreview結果をこの属性へ記録してはならない。本文、依存、umbrellaの
変更はCLIでは行わず、Markdownを変更して再びissue本文のreviewを通す。

### 全issueを検証する

```sh
bun run issues:cli -- validate
```

全fileのfrontmatter schema、blocked issueの`## Blocker`、human issueの理由2節、重複id、依存先、
umbrella種別、自己依存、依存cycleを検証する。issueを追加・分割・依存変更した後は
`bun run check`と`bun test`に加えて実行する。

## Browser UI

人が複数issueを見比べながらfilter・閲覧・更新する場合は次を実行する。

```sh
bun run issues
bun run issues --port 4321
```

既定では`http://127.0.0.1:3210`だけでlistenする。UIは用途別view、番号・title検索、status、
execution、priority、review filter、sortをURL queryへ保持する。一覧APIはsummaryだけを返し、本文は
選択時に取得する。

本文はBunのMarkdown parserでGFMを描画する。実在する`./NNN-slug.md`だけをissue内遷移に変換し、
link先statusを併記する。fragmentとHTTP(S)外部link以外のlink、画像、raw HTMLは無効にする。

更新可能な属性と状態規則はCLIと同一である。起動ごとのtoken、same-origin検査、file revision一致を
必須とし、競合は409で拒否する。
