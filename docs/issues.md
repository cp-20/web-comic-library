# issue管理

issueは`issues/NNN-slug.md`として管理する。

番号は再利用しない。

番号は作成順を示し、実行順は`depends_on`だけで判断する。

## 種類

- `umbrella`：子issueの完了状況だけを追跡する。
- `feature`：利用者または運営者へ一つの成果を届ける。
- `platform`：複数機能が使う実行基盤を整える。
- `quality`：品質目標を検証し、失敗条件を残す。

## 必須項目

各issueは目的、背景、スコープ、実装方針、受け入れ条件、テスト、対象外、依存関係を含める。

実装者が`PLAN.md`を読まなくても判断できる情報をissueへ書く。

umbrella以外は、単独のpull requestで完了を判定できる大きさにする。

依存はfrontmatterの`depends_on`へissue番号で書く。

単なる順序の希望は依存にしない。

## 状態

`status`は`open`、`in_progress`、`blocked`、`done`のいずれかとする。

着手時に`in_progress`、受け入れ条件とテストを満たした時点で`done`へ変える。

外部判断または未完了の依存が必要な場合だけ`blocked`を使い、理由を本文へ追記する。

umbrellaは全子issueが`done`になった時点で`done`にする。

## 変更

スコープが独立して完了できる場合は新しいissueへ分割する。

受け入れ条件を変えた場合は、依存issueとumbrellaの一覧も同じ変更で更新する。

実装中に判明した設計判断は対象の`docs/`へ反映し、完了後のissueへ恒久的な規則を残さない。

全体の一覧とcritical pathは[issues/README.md](../issues/README.md)で管理する。
