---
id: 016
title: openBDとNDLから単行本書誌を同期する
type: feature
status: done
priority: P1
depends_on: [008, 010, 014]
umbrella: 007
---

# openBDとNDLから単行本書誌を同期する

## 目的

ISBNまたは出版社商品IDごとの単行本版と、巻に収録される話の確認状態を管理する。

## スコープ

- `VolumeEdition`と`VolumeContentMapping`のdomain model、table、repository。
- openBDからISBN、書名、作者、出版社、発売日、許諾された書影を取得するadapter。
- 国立国会図書館サーチで不足fieldを補完するadapter。
- field単位の提供元、取得日時、利用条件。
- 書誌変更と削除の定期同期。
- 初回同期後に検出した新刊の`ReleaseEvent`。
- 近刊取得の収録率を測るreport。

## 実装方針

- openBDを第一候補、NDLを補完として使う。
- 同じ巻の紙版と電子版を同一視せず、版として識別する。
- 巻と話は多対多とし、mappingへ確認済み、未確認、却下を持たせる。
- 未確認mappingを他利用者の既読へ適用しない。
- 書影は利用条件を確認できる場合だけR2へ保存または参照する。

## 受け入れ条件

- ISBNまたは商品IDから版を冪等に登録できる。
- providerの優先順位に従ってfieldを統合し、provenanceを表示できる。
- providerで削除された書誌を検出し、公開状態を更新できる。
- 初回同期では通知対象にせず、その後に追加された版から新刊eventを一度だけ生成できる。
- 巻とWeb話の確認済みmappingを保存できる。
- openBDとNDLの収録率を同じISBN集合で比較できる。

## テスト

- provider responseのValibot validationとfixture test。
- field統合、削除、mapping状態の単体テスト。
- 書誌同期のPostgreSQL統合テスト。

## 対象外

- JPRO Web APIの契約。
- 購入価格、購入店、貸出管理。
