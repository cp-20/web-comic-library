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

## 管理画面

`/admin/catalog`は管理者のcatalog統合・分割画面である。すべての操作で理由を入力させ、Hono RPC clientだけを使ってAPIへ送る。画面だけで権限を判断せず、API側の強い認証とrole検査を必須とする。
