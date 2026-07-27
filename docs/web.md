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

`/settings/security`はHono RPC clientでTOTP enrollment URIとbackup codeを一度だけ表示し、認証アプリの6桁コードをverification APIへ送る。verification後のresponseはsession tokenを含めない。

プロフィール画像はPNG、2 MiB以下、512px以下だけを選択できる。multipart uploadはHono RPCのJSON schemaでは表現できないため、保存済みprofileに対する専用の同一origin endpointへ送る。それ以外のbackend呼び出しはAPI clientへ集約する。

## 作品の読書操作

`/works/{workId}`は手動読書状態、論理話の既読、指定話までの一括既読、既読取消、掲載ページ既読をHono RPCで操作する。状態と追いつき状態を同じ表示や入力に混在させず、掲載ページIDが未確認mappingの場合も独立した既読として扱う。

## 単行本ライブラリ

`/library/volumes`は巻の未読、読書中、既読、紙・電子所蔵、話memo、公開範囲をHono RPC clientで保存する。巻を既読にしたときのWeb話既読反映はconfirmedな巻・話対応だけに限り、画面からWeb話を直接操作しない。対応候補の送信は管理queueへ追加するだけで、確認前に公開catalogや他利用者の記録を変更しない。

## 公開catalog

`/`は作品名、別名、読み仮名、作者名を検索し、掲載先、連載状態、掲載種別と並び順を組み合わせる。`/works/{workId}`はcanonical URLとOG titleを持ち、公開済みの作者、掲載先、Web話、単行本だけをHono RPC client経由で表示する。retire済みの旧作品IDはcatalog redirect APIの正規URLへ遷移する。漫画本文は表示・配信せず、公式閲覧URLへ新しいタブで遷移する。

## follow設定

`/settings/follows`は利用者自身の掲載先優先順位と、作品ごとの最速、site優先、掲載先指定、全掲載先の四方式をHono RPC clientで保存する。掲載先指定は対象publication IDを明示し、未選択の掲載先は通知候補にしない。

`/profiles/{userId}`はprofileのfollowまたは解除をHono RPC clientで行う。`/settings/follows`は受け取ったfollow申請の承認・拒否と自分のfollow一覧を表示する。`/timeline`はaccepted followの現在も閲覧可能なactivityだけをcursor paginationで表示し、非公開化されたactivityをHTMLへ残さない。

`/profiles/{userId}`はblock、mute、profile通報もHono RPC clientだけを通して実行する。blockは相互followを解除し、blockまたはmuteした対象をtimelineへ残さない。感想の通報フォームは対象activity IDとplain text理由だけを送る。`/admin/moderation`はmoderator以上の通報queueと操作理由の入力を提供し、通報本文をtextとして表示する。本文内の外部URLは`target="_blank"`と`rel="nofollow ugc noopener"`を付け、HTMLとして解釈しない。

`/works/{workId}`は話または巻を指定して感想を投稿・表示する。初期表示で伏せられた感想の本文をHTMLへ含めず、利用者の明示操作後だけreveal APIで取得してテキストとして表示する。感想本文を`dangerouslySetInnerHTML`、metadata、OG、SNS共有文へ渡さない。

## extensionお気に入りimport

`/settings/extension/imports/{batchId}`はextensionが作成した24時間有効の候補batchを、ログイン利用者本人だけに表示する。完全一致、未照合、曖昧な複数候補とtitleのみの候補を区別し、完全一致だけを選択できる。一括のfollow方式・読書状態に対し作品単位で上書きでき、標準はfollowだけである。画面はお気に入りから既読または読書進捗を推測・作成しない。

## アプリ内通知

`/notifications`はログイン利用者自身の通知一覧と未読件数をHono RPC clientで表示し、個別または一括で既読にする。通知本文には非公開情報やネタバレ本文を含めず、種別と既読状態だけを表示する。

Web appは最小のmanifestとPush受信・notification click専用Service Workerを提供する。Push許可とsubscription登録は`/notifications`の利用者の明示操作でのみ行い、Service Workerはoffline cacheやbackground syncを実装しない。

`/notifications`では更新digestを利用者の明示操作で有効にできる。timezoneと送信時刻を保存し、停止操作はその利用者のメールdigestだけに適用する。画面とメールには作品名、本文、非公開情報を出さない。

## 管理画面

`/admin/catalog`は管理者のcatalog統合・分割画面である。すべての操作で理由を入力させ、Hono RPC clientだけを使ってAPIへ送る。画面だけで権限を判断せず、API側の強い認証とrole検査を必須とする。
