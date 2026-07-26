# Web実装規則

対象は`apps/web`と`packages/api-client`とする。

- Next.js App RouterをBunで実行する。
- backendへの呼び出しは`@web-comic-library/api-client`のHono RPC clientへ集約する。
- API、application、domain、adapterをWebから直接importしない。
- Server ComponentとClient Componentの境界を明示し、不要なClient Componentを作らない。
- 公開ページは安定したURL、canonical URL、OGメタデータを持つ。
- 非公開情報とネタバレ本文をHTML、メタデータ、ログへ含めない。
- キーボード操作、フォーカス表示、フォームラベル、エラー説明を実装時に確認する。

Web変更後は次を実行する。

```sh
bun run check
bun test
bun run build:web
```

## loginとプロフィール設定

`/login`はHono RPC clientでmagic linkとGoogle OAuth開始APIを呼び、OAuth URLへの遷移だけをbrowserで行う。`/settings/profile`では初回にユーザーID、表示名、自己紹介、標準公開範囲を選ぶ。保存前のaccountは第三者へ表示しない。

プロフィール画像はPNG、2 MiB以下、512px以下だけを選択できる。multipart uploadはHono RPCのJSON schemaでは表現できないため、保存済みprofileに対する専用の同一origin endpointへ送る。それ以外のbackend呼び出しはAPI clientへ集約する。

## 作品の読書操作

`/works/{workId}`は手動読書状態、論理話の既読、指定話までの一括既読、既読取消、掲載ページ既読をHono RPCで操作する。状態と追いつき状態を同じ表示や入力に混在させず、掲載ページIDが未確認mappingの場合も独立した既読として扱う。

## 単行本ライブラリ

`/library/volumes`は巻の未読、読書中、既読、紙・電子所蔵、話memo、公開範囲をHono RPC clientで保存する。巻を既読にしたときのWeb話既読反映はconfirmedな巻・話対応だけに限り、画面からWeb話を直接操作しない。対応候補の送信は管理queueへ追加するだけで、確認前に公開catalogや他利用者の記録を変更しない。

## 公開catalog

`/`は作品名、別名、読み仮名、作者名を検索し、掲載先、連載状態、掲載種別と並び順を組み合わせる。`/works/{workId}`はcanonical URLとOG titleを持ち、公開済みの作者、掲載先、Web話、単行本だけをHono RPC client経由で表示する。retire済みの旧作品IDはcatalog redirect APIの正規URLへ遷移する。漫画本文は表示・配信せず、公式閲覧URLへ新しいタブで遷移する。

## follow設定

`/settings/follows`は利用者自身の掲載先優先順位と、作品ごとの最速、site優先、掲載先指定、全掲載先の四方式をHono RPC clientで保存する。掲載先指定は対象publication IDを明示し、未選択の掲載先は通知候補にしない。

## 管理画面

`/admin/catalog`は管理者のcatalog統合・分割画面である。すべての操作で理由を入力させ、Hono RPC clientだけを使ってAPIへ送る。画面だけで権限を判断せず、API側の強い認証とrole検査を必須とする。
