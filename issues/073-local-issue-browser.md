---
id: 073
title: issue一覧とworkflow属性をlocal Webで管理する
type: platform
status: review
priority: P1
execution: agent
review_required: true
review_status: pending
reviewed_at: null
depends_on: []
umbrella: 001
---

# issue一覧とworkflow属性をlocal Webで管理する

## 目的と利用場面

開発者とissue reviewerがrepository rootの一commandから全issueを検索・filter・閲覧し、status、
priority、execution、issue本文のreview結果をMarkdownを直接開かず安全に更新できるようにする。

## 背景と現状の問題

issueは`issues/*.md`へ分散し、一覧には複数fileを検索する必要がある。frontmatterを手編集すると
未知status、未承認本文の着手、同時編集の上書きが起きる。専用UIでschemaと更新範囲を固定する。

## 実装判断と代替案

- Bun.serve、Bun.build、plain TypeScript/HTML/CSSを使い、新しいframeworkやclient dependencyを
  追加しない。一画面のlocal repository toolにNext.js server、database、state libraryを導入すると
  起動と保守の境界が増える一方、必要なroutingと状態量は小さい。
- Markdownは`Bun.markdown.html`でGFMとして描画する。独自parserでは表、task list、escapingの実装漏れが
  起きやすく、別のMarkdown packageはBun標準機能と重複する。
- Markdown fileを正本のまま維持し、SQLiteやbrowser storageへ複製しない。
- bodyはread-onlyにし、workflow属性だけを更新する。本文・依存関係は通常のcode reviewを通す。
- 一覧と詳細を別APIにする。全91件の本文を初期responseへ含める方式は、一覧操作に不要な転送とMarkdown
  変換を発生させる。
- Coding AgentにはWeb DOMを操作させず、同じstoreを使うBun CLIを提供する。JSON出力、安定したexit
  code、依存解決済みissueの抽出はshellから直接扱え、Web専用APIをcurlで組み立てる必要がない。

## スコープと変更対象

| file                                                 | 操作 | 変更内容                                                  |
| ---------------------------------------------------- | ---- | --------------------------------------------------------- |
| `tools/issues/storage/issue-store.ts`                | 作成 | schema検証、revision guard、atomic属性更新を集約する。    |
| `tools/issues/presentation/{view-model,markdown}.ts` | 作成 | 一覧・詳細modelと安全なMarkdown/link変換を実装する。      |
| `tools/issues/http/handler.ts`                       | 作成 | page、asset、一覧、詳細、token付きPATCH APIを提供する。   |
| `tools/issues/cli/{arguments,main}.ts`               | 作成 | Agent向けcommand parse、検索、閲覧、検証、更新を行う。    |
| `tools/issues/ui/{page,app,styles,assets}.ts/css`    | 作成 | shell、client状態、操作UI、style、asset buildを分離する。 |
| `tools/issues/main.ts`                               | 作成 | loopback serverのcomposition rootにする。                 |
| `tools/issues/**/*.test.ts`                          | 作成 | store、Markdown、HTTP境界を責務別に検証する。             |
| `scripts/issues*.ts`                                 | 削除 | 単一directoryに混在した旧MVP実装を新構成へ置き換える。    |
| `package.json`                                       | 変更 | command、tool typecheck、test対象を登録する。             |
| `docs/{architecture,issues,issue-tooling}.md`        | 変更 | 記述規則とtool操作を分離して記録する。                    |

## component間の契約

- serverは既定で`127.0.0.1:3210`だけへbindし、`--port`は1024..65535だけを受ける。
- `GET /api/issues`はid順のsummaryとfilter選択肢を返し、bodyとrevisionを含めない。
- `GET /api/issues/:id`はbody、revision、Bunでrenderした`bodyHtml`を返す。
- `PATCH /api/issues/:id`はstatus、priority、execution、reviewStatus、revisionだけを受ける。
- 起動ごとのrandom tokenとsame-origin検査を通し、別originからの更新を拒否する。
- revisionがdisk上と異なる場合は409にし、bodyと依存関係を変更しない。
- `open`、`in_progress`、`human_action`、`done`は承認済みのissue本文を必須にする。
  human ready workは`human_action`だけを使う。
- Markdown内の相対linkは実在する`./NNN-slug.md`だけを`/issues/NNN`へ変換する。raw HTML、画像、
  repository内の任意相対pathは無効にし、HTTP(S)外部linkだけを別tabで許可する。issue linkには
  link先のstatus badgeを併記し、accessible nameとtooltipにはissue番号、title、statusを含める。
- CLIは`list`、`next`、`show`、`update`、`validate`を提供する。`--json`はstdoutへ機械可読結果だけを
  出し、schema・引数errorはstderrとexit code 1で返す。更新はWebと同じstore制約を通す。
- storageはblocked issueの`## Blocker`先頭段落をplain textへ正規化する。Web一覧・詳細とCLIの
  `BLOCKER`/`blocker` fieldへ同じ値を出し、依存番号を開かなくても停止理由を確認できるようにする。

## 実装手順

1. storage、presentation、HTTP、UIへ責務を分け、tool専用typecheckを追加する。
2. Bun MarkdownとHTML rewriteで表などを描画し、link許可規則を適用する。
3. 未完了、人の対応、review、完了view、複合filter、sort、URL状態、一覧/詳細routingを実装する。
4. workflow editorに連動する状態遷移、未保存表示、reset、validation、保存結果通知を実装する。
5. Agent向けCLIとJSON出力、dependency graph検証、partial updateを実装する。
6. store、Markdown、CLI、一覧/詳細API、security boundaryをtestし、恒久規則をdocsへ記録する。

## 受け入れ条件

- `bun run issues`でURLが表示され、用途別view、id・title検索、複合filter、sortを直感的に操作できる。
- GFMの表、list、codeが読め、issue相対linkだけがstatus付きで正しいissue詳細へ遷移する。
- 一覧を保ったまま詳細を閲覧し、許可されたworkflow属性だけを更新できる。
- invalid transition、未承認issueの着手・完了、tokenなし、cross-origin、古いrevisionを拒否する。
- 保存後もMarkdown本文とfrontmatterの非編集fieldが同一である。
- keyboardとmobile幅で一覧、選択、保存を操作できる。
- CLIから依存解決済みissueの取得、全文閲覧、filter、partial workflow更新、全graph検証ができる。
- blocked issueはWeb一覧とCLI一覧だけで本質的な停止理由が分かり、`## Blocker`欠落を検証で拒否する。

## テスト

- `bun run check`
- `bun test`
- handlerへloopback requestを送るsmoke test

## 対象外

- issue本文・依存関係のWeb/CLI編集、Git commit、GitHub同期、外部公開、認証、database。
