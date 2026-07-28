# フロントエンドデザイン規則

この文書は`apps/web`の視覚設計、共通UI、responsive layout、interaction、採用技術の正本である。
route固有の公開範囲と操作規則は[Web実装規則](./web.md)、検証方法は[テスト規則](./testing.md)に従う。

## 目標

Web Comic Libraryは漫画を読むviewerではなく、作品を探し、公式の閲覧先へ移動し、読書状態を記録する
libraryである。画面は「静かな本棚」を基調とし、漫画siteの強い装飾を模倣しない。

- 作品名、作者、更新、読書状態を短時間で走査できることを優先する。
- mobileを第一に設計し、desktopでは情報量を増やしても操作体系を変えない。
- 紙とインクを思わせる中性色を土台にし、藍色を主要actionへ限定する。
- 書影やprofile画像がなくても、情報の優先順位と余白だけで画面が成立するようにする。
- private情報、感想本文、spoilerを装飾やpreviewのために早く取得しない。

吹き出し、集中線、原稿用紙、過度な擬音、紙のtextureなどを共通UIへ使わない。作品自身の書影を
視覚的な主役にし、applicationの装飾と競合させない。

## Information architecture

### Application shell

login後の主要navigationは次の四つに固定する。

| label        | 役割                    | 主なroute          |
| ------------ | ----------------------- | ------------------ |
| 探す         | catalog検索と作品発見   | `/`                |
| 本棚         | 読書状態と単行本library | `/library/volumes` |
| タイムライン | follow中の公開activity  | `/timeline`        |
| 通知         | アプリ内通知と通知設定  | `/notifications`   |

- `64rem`未満ではviewport下部のnavigation、`64rem`以上では左側のnavigationとして表示する。
- mobile navigationはsafe areaを含め、各項目の操作領域を最低`44px`四方にする。
- 現在地は色だけでなく、label、形、`aria-current="page"`で示す。
- profile、security、follow、extensionの設定はprofile menuから移動し、主要四項目へ混ぜない。
- 管理画面は権限を確認した利用者だけに別navigationとして示す。主要navigationへ管理actionを置かない。
- 未loginの公開画面は探す、login、法務への小さなheaderだけを使う。

### Layout

- viewport幅`20rem`から横scrollなしで操作できるmobile-first layoutにする。
- page全体の最大幅は`72rem`、文章の一行は最大`68ch`とする。
- mobileは一列、`48rem`以上で必要な画面だけ補助column、`64rem`以上でapplication shellを使う。
- 検索結果、timeline、通知、管理queueはlist-firstとする。情報の種類ごとに全要素をcardへ入れない。
- 書影の利用条件を確認できる場合だけ`2:3`で表示する。書影がない作品へ架空のcover artを生成しない。
- carousel、masonry、hoverしないと現れない主要action、無限scrollを使わない。cursor paginationは
  「さらに表示」の明示操作にする。

## Visual foundation

### Color

初期releaseはlight themeだけを提供する。component内へ色値を直接書かず、次のsemantic tokenを使う。
token名は見た目ではなく役割を表す。

| token            | value     | 用途                              |
| ---------------- | --------- | --------------------------------- |
| `canvas`         | `#F7F5F0` | page背景                          |
| `surface`        | `#FFFFFF` | 入力、panel、前景                 |
| `surface-subtle` | `#EFECE5` | section区切り、選択前の背景       |
| `text`           | `#1F2328` | 本文、heading                     |
| `text-muted`     | `#5E625F` | metadata、補助説明                |
| `border-subtle`  | `#D8D3CA` | 装飾的な区切り                    |
| `border-control` | `#77736D` | inputなど意味のある境界           |
| `accent`         | `#365C8D` | primary action、active navigation |
| `accent-hover`   | `#29466C` | accentのhover、pressed            |
| `on-accent`      | `#FFFFFF` | accent上のtextとicon              |
| `success`        | `#2E6B4F` | 完了                              |
| `warning`        | `#8A5700` | 注意、未確認mapping               |
| `danger`         | `#A23B3B` | 破壊的action、error               |
| `focus`          | `#0B6BCB` | keyboard focus                    |

- 通常textは背景に対して`4.5:1`以上、大きなtextと意味のある境界・iconは`3:1`以上を維持する。
- success、warning、dangerはiconまたは明示的な文言と併用し、色だけで状態を伝えない。
- dark themeを追加するまで`color-scheme: light`とする。将来のtheme追加はtoken値だけを差し替え、
  componentへ`dark:`指定を分散させない。

### Typography

Web fontは読み込まず、次のsystem font stackを使う。

```css
font-family:
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  'Segoe UI',
  'Hiragino Sans',
  'Yu Gothic UI',
  'Noto Sans JP',
  sans-serif;
```

- 本文は`1rem`、line-heightは`1.7`を標準にする。
- font sizeは`0.875rem`、`1rem`、`1.125rem`、`1.5rem`、`2rem`のscaleを使う。
- `0.875rem`はmetadataと補助説明に限定し、入力値と主要actionは`1rem`以上にする。
- 作品名と状態名を太さで区別し、長文へ極端なboldやletter spacingを使わない。
- 数値の桁比較が必要な管理画面だけ`font-variant-numeric: tabular-nums`を使う。

### Spacing, shape, and elevation

- spacingは`4px`を基準に`4`、`8`、`12`、`16`、`24`、`32`、`48`、`64px`を使う。
- 同じcomponent内部は`8`または`12px`、関連group間は`16`または`24px`、section間は`32px`以上空ける。
- radiusはcontrolの`6px`、panelの`10px`、dialogの`16px`に限定する。pillはbadgeだけに使う。
- shadowはpopover、dialog、固定navigationなどlayer差を示す場合だけ使う。通常のlist itemへshadowを付けない。
- dividerと余白を優先し、すべてをborder付きcardにしない。

### Motion

- 状態変化は原則`120–200ms`のopacityまたはtransformで表す。
- navigation、保存完了、loadingへ装飾animationを追加しない。
- `prefers-reduced-motion: reduce`ではessentialでないtransitionとanimationを無効にする。
- parallax、autoplay、点滅、layoutが大きく移動するanimationを使わない。

## Components and interaction

共通componentは`apps/web/src/components/ui`へ置く。共通componentはAPI client、業務type、route固有文言を
importせず、見た目、semantic HTML、interactionだけを担当する。layout componentは
`apps/web/src/components/layout`へ置く。

最初に共通化する対象は`Button`、`Field`、`Input`、`Textarea`、`Select`、`Checkbox`、`RadioGroup`、
`Badge`、`Alert`、`EmptyState`、`PageHeader`、`AppShell`である。二つ以上の実利用がないcomponentを
先回りして作らない。

### Native HTML first

- `button`、`a`、`input`、`textarea`、`select`、`fieldset`、`legend`をその役割のまま使う。
- mobileのplatform pickerを利用できる通常の選択にはnative `select`を使う。
- 単純な開閉でsemanticが合う場合は`details`と`summary`を使う。
- clickableな`div`、labelのないicon button、placeholderだけのfieldを作らない。
- button風のlinkとlink風のbuttonを作らず、navigationはlink、状態変更はbuttonにする。

### Radix Primitives

Dialog、Alert Dialog、Popover、Dropdown Menu、Tabsなど、focus移動、keyboard navigation、portal、
outside interactionが必要なpatternだけRadix Primitivesを使う。

- `radix-ui`を直接routeから使わず、local wrapperでtoken、size、accessible nameを固定する。
- wrapperと、それを必要とする範囲だけをClient Componentにする。root layoutへproviderを追加しない。
- Dialogは短い確認または補助操作に限定する。mobileで長いformや複数stepをdialogへ入れず、pageへ遷移する。
- Tooltipは補足にだけ使い、操作方法やlabelをTooltipだけで伝えない。
- 通常のcheckbox、radio、selectを外観のためだけにRadixへ置き換えない。

### Action and feedback

- primary actionは一画面または一formに一つを原則とする。
- destructive actionは`danger`、取消可能な通常actionはsecondaryまたはghostにする。
- async action中は同じbuttonをdisabledにし、進行中の動詞を表示する。画面全体を不要にlockしない。
- errorは該当fieldの近くに説明し、複数errorはform先頭にもsummaryを置く。
- success、empty、loading、errorを空白だけで表さない。
- toastだけへ必須情報を置かず、保存結果は操作箇所の`aria-live="polite"`なinline messageにも残す。
- loading skeletonは最終layoutと同じ形にし、取得できない実dataを推測したtextで埋めない。

### Domain-specific presentation

- 読書状態と「最新話へ追いついているか」を別のlabelとcontrolで表す。
- spoiler本文は明示的な開示前にDOMへ含めず、開示buttonが対象と結果を説明する。
- 未確認mapping、非公開、moderation中などの状態は通常の成功状態と同じ色・文言にしない。
- 公式閲覧先へのlinkは外部移動であることを文言またはiconで伝える。
- profile画像と書影には有用な代替textを付ける。隣接textと完全に重複する場合は装飾画像として扱う。

## Technology choices

dependencyは実際に使う変更と同時にBunで追加し、方針だけのために先行追加しない。

| technology                 | decision       | why                                                                     | 制約とtrade-off                                                   |
| -------------------------- | -------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Next.js App Router / React | 継続           | Server Component、metadata、routingを既存構成のまま利用できる           | interactionに必要な最小範囲だけClient Componentにする             |
| Tailwind CSS v4            | 標準として採用 | responsive、state、spacingを近接して記述し、`@theme`でtokenを統制できる | 長いclass列を共通componentへ閉じ込め、arbitrary valueを常用しない |
| CSS Modules                | 例外的に採用   | 複雑なanimationやthird-party selectorを局所化できる                     | 通常のcomponent stylingを二重化しない                             |
| native HTML                | 最優先         | browser標準のsemantic、keyboard操作、mobile UIを利用できる              | 外観統一よりplatform behaviorを優先する                           |
| Radix Primitives           | 選択的に採用   | 複雑なWAI-ARIA patternとfocus管理を自作せずに済む                       | 該当wrapperだけClient Componentになり、利用後の検証は必要         |
| Lucide React               | iconに採用     | 一貫したstroke、TypeScript、icon単位のimportを利用できる                | dynamic icon importを使わず、text labelを省略しない               |
| CSS transition             | motionに採用   | 追加runtimeなしで必要な状態変化を表せる                                 | 複雑な演出はproduct目的に合わない                                 |

Tailwind classはlayout、size、spacing、color、typography、state、responsiveの順で記述する。同じ組み合わせを
三回以上使う場合、またはsemanticとvariantを固定すべき場合はlocal componentへ抽出する。共通classを
文字列constantとしてroute間で共有しない。

## Why not

次は品質が低いからではなく、現在のproductとrepositoryに対して費用が先行するため採用しない。

| alternative                             | why not now                                                                           | 再検討条件                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| MUI、Chakra UI、Ant Design              | 完成済みの視覚言語とtheme runtimeが「静かな本棚」と競合し、上書きが増える             | 管理画面を別productとして短期間に大量構築する必要が生じたとき        |
| shadcn/uiの全面導入                     | 生成されたsourceの更新責任とdefault aestheticを同時に引き受ける                       | 必要componentを個別評価し、local規約へ合わせて所有するとき           |
| CSS Modulesだけ                         | responsiveとstateの重複記述が増え、既存の多数のrouteへ一貫して適用しにくい            | Tailwindのbuildまたはbrowser互換性がrepository要件を満たさないとき   |
| styled-components、EmotionなどCSS-in-JS | App RouterのSSR registry、runtime、Server/Client境界の複雑さが増える                  | runtime themeまたはconsumerによる動的style APIが必須になったとき     |
| React Aria Componentsの全面導入         | 現状はnative controlと少数のoverlayで足り、広いinteraction abstractionは過剰である    | 複雑なcombobox、collection、drag and dropを複数画面で必要とするとき  |
| React Query                             | 初期readはServer Component、mutation後は局所更新で足り、二つ目のcacheを持つ必要がない | cross-routeのoptimistic updateとcache同期が繰り返し必要になったとき  |
| Redux、Zustand                          | server dataとform stateをglobal client stateへ複製する理由がない                      | 複数routeを跨ぐclient-only workflowが実際に発生したとき              |
| React Hook Form                         | native FormDataとHTML validationで現在のformを表現できる                              | 大規模な条件分岐field arrayとclient validationが複数formに現れたとき |
| Framer Motionなどmotion library         | productの目的に必要なmotionが小さく、client bundleとAPIを増やす方が大きい             | gesture連動のessential interactionが必要になったとき                 |
| Storybook                               | 現在は共通componentが少なく、Playwrightとaxeとは別のbuild設定の保守が先行する         | 共通componentが増え、独立状態のreviewを複数人で行う段階になったとき  |
| 日本語Web font                          | CJK fontの転送量と描画遅延に対して、library UIで得られる効果が小さい                  | brand fontをsubsetして性能budget内で配信できると確認したとき         |

## Accessibility and verification

- WCAG 2.2 A/AAを最低基準とし、axeの成功だけを適合の根拠にしない。
- 主要controlは`44px`四方、inline link以外の隣接controlには誤操作を避ける間隔を確保する。
- focusは`3px solid var(--color-focus)`と`2px`のoffsetを基準に、全背景で常に見えるようにする。
- `200%` zoom、text拡大、縦向きmobileで情報と操作を失わない。
- keyboardだけでnavigation、dialog、form、spoiler開示、paginationを完了できるようにする。
- screen reader向けのname、description、error関連付けと、非同期更新の通知順を確認する。
- motionを止めても操作結果と現在状態を理解できるようにする。

Web UIの変更では次を実行する。

```sh
bun run check
bun test
bun run build:web
```

主要journeyを変更した場合はPlaywrightのrole/label locatorとaxe検査を更新する。color tokenを変更する場合は
light themeの通常、hover、focus、disabled、error状態でcontrastを再確認する。

## References

- [Next.js: CSS](https://nextjs.org/docs/app/getting-started/css)
- [Tailwind CSS: Theme variables](https://tailwindcss.com/docs/theme)
- [Radix Primitives: Accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility)
- [Lucide for React](https://lucide.dev/guide/react)
- [W3C: WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
