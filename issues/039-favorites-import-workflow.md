---
id: 039
title: お気に入り候補を確認してlibraryへ取り込む
type: feature
status: done
priority: P1
depends_on: [008, 021, 022, 038]
umbrella: 037
---

# お気に入り候補を確認してlibraryへ取り込む

## 目的

extensionが抽出したお気に入りをcatalogへ照合し、利用者の確認後に読書状態とfollow設定を一括登録する。

## 背景

お気に入り登録から「読んでいる」「読みたい」「何話まで読んだ」は確定できない。

抽出結果をそのまま既読へ変換すると誤った読書記録が作られる。

## スコープ

- `FavoriteImportBatch`と`FavoriteImportCandidate`のmodel、table、repository。
- source ID、外部作品ID、canonical URL、表示titleを持つValibot schema。
- batch作成、候補追加、catalog照合、確認、適用、破棄のapplication use case。
- extension向けHono RPC route。
- Web側の確認画面と期限付きimport URL。
- 未照合候補と曖昧な複数候補の表示。
- 一括指定と作品単位上書きによる読書状態とfollow方式の選択。

## 実装方針

- extensionはraw HTML、Cookie、認証情報、browser storageを送信しない。
- URLはextension内で許可hostを検証し、queryとfragmentを除いたcanonical URLだけを送る。
- 外部作品IDまたはcanonical URLの完全一致だけを自動照合する。
- titleだけの一致は候補として表示し、自動確定しない。
- 標準動作は「followだけ」とし、読みたい、読んでいるは利用者が選ぶ。
- お気に入りから既読と読書進捗を推測しない。
- 同じ利用者、source、外部作品IDの再importを冪等にする。
- お気に入りから消えた作品の`LibraryEntry`を削除しない。
- import batchは24時間で失効し、確認後は再適用できない。

## 受け入れ条件

- extensionがHono RPCで候補batchを作り、確認URLを取得できる。
- 完全一致、未照合、曖昧一致を区別して表示できる。
- 利用者が一括設定と作品単位の上書きを選べる。
- 確認した候補だけを一transactionで`LibraryEntry`とfollow設定へ反映する。
- 同じbatchまたは同じお気に入りを再送しても重複登録しない。
- 別利用者がbatchを閲覧または適用できない。

## テスト

- Valibot schema、URL正規化、照合、冪等性の単体テスト。
- batch作成からlibrary反映までのPostgreSQL統合テスト。
- extension tokenのscopeとbatch所有者を検証するHono RPC test。
- popupから確認画面を開いて一括importするE2E。

## 対象外

- 定期同期。
- お気に入り解除の反映。
- title類似度による自動照合。

## 実装結果

- `FavoriteImportBatch`と候補snapshotを24時間期限、単回apply、所有者制約付きで保存する。
- 完全一致、曖昧、未照合、titleのみ候補を分け、完全一致だけを選択可能にした。
- extension tokenの`favorites:import` scopeだけでbatchを作成し、確認画面はsession所有者だけが読取・適用・破棄できる。
- followだけを標準にし、明示した読書状態だけをlibraryへ保存する。既読・読書進捗は変更しない。
- Web originを最小権限で固定したunpacked extension E2Eは、配備origin確定後に[055](./055-extension-web-origin-e2e.md)で実施する。
