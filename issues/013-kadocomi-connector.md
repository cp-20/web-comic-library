---
id: 013
title: カドコミの埋め込みJSONを収集する
type: feature
status: done
priority: P0
depends_on: [010]
umbrella: 007
---

# カドコミの埋め込みJSONを収集する

## 目的

カドコミの公開HTMLだけを取得し、埋め込みJSONから作品と掲載情報を安全に抽出する。

## スコープ

- 公開作品ページの`script#__NEXT_DATA__`解析。
- `dehydratedState.queries[].state.data`から対象dataを探索するValibot schema。
- `work`、`firstEpisodes.result`、`latestEpisodes.result`の抽出。
- 埋め込みJSONがない場合の安定したHTML要素による限定fallback。
- `ratingLevel`と`SourcePolicyRecord`の対応。
- 漫画本文と画像を除いた最小fixture。

## 実装方針

- `JSON.parse`後の値を`unknown`としてValibotで検証する。
- hash付きCSS classを主要selectorに使わない。
- `work.code`と`episode.code`を外部keyにする。
- 非公開仕様のAPIを直接呼ばない。
- schema変更や抽出件数の急減を「更新なし」とせずconnector failureにする。
- 単行本告知や記念illustrationは`PublicationEntry`として保持するが、追いつき対象へ含めない。

## 受け入れ条件

- fixtureから作品、作者と役割、連載状態、次回更新日、話、公開状態を抽出できる。
- 127件以上を含むfixtureを上限欠落なく解析できる。
- 通常話、番外編、告知、不明を区別し、題名だけで通常話と推測しない。
- 未確認の年齢区分を公開候補へ渡さない。
- 埋め込みJSONとfallbackが両方失敗した場合も既存データを維持する。

## テスト

- 正常、schema変更、JSON破損、HTML fallbackのfixture test。
- 抽出件数急減と未確認年齢区分の停止テスト。
- 非公開APIと画像へrequestしない統合テスト。

## 対象外

- JavaScript実行。
- 非公開endpointのreverse engineering。
