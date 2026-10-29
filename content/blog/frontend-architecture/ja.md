このガイドでは、大規模なフロントエンドの構成方法を説明します。1つのワークスペースに、多数のアプリケーションと多数のチームがあり、すべてのファイルにルールがあります。構築には**Nx**と**Angular**を使い、共有の状態は**NgRx**に置き、ストアの前に**任意のファサード**を置きます。そのうえで、同じアーキテクチャをルールごとに**React（Next.js）**と**Vue（Nuxt）**でも示します。

例は**Angular 22**とNgRx 22、**React 19**とNext.js 16、**TanStack Query**と**Zustand**、そして**Vue 3.5**とNuxt 4、**Pinia 3**を前提に書いています。

このアーキテクチャは私たちが考えたものではありません。その核心を練り上げて公開したのは**Manfred Steyer**です。Angularのトレーナー兼コンサルタントで、AngularのGoogle Developer Expertであり、[ANGULARarchitects](https://www.angulararchitects.io/)の中心人物です。彼の考え方は、フロントエンドを**ドメインで縦に**、**ライブラリの型で横に**切り分け、ドメイン同士は明示的なAPIを通してのみやり取りさせ、その境界をwikiではなくツールに強制させる、というものです。何が彼に由来し、何がNxに由来し、何を私たちが加えたのかは、セクション2で正確に示します。

小さな例では、なぜこれが重要なのかを示せません。ドメインが1つ、ストアが1つなら、誰の頭にも収まります。そこで、このページの例はすべて1つの現実的なワークスペースから取っています。**Fleetline**という車両整備プラットフォームで、アプリケーションが3つ、ドメインが9つ、ライブラリがおよそ70、チームが5つあります。セクション5で紹介し、それ以降のすべてのセクションで使います。

> 対象は、フロントエンドのアプリケーションが複数ある、チームが複数ある、またはフロントエンドのコードがおよそ50,000行を超える、あるいは近いうちにそうなるチームです。それより小さい場合は、まずセクション16.4を読んでください。

## 1. フロントエンドにアーキテクチャが必要な理由

フロントエンドの成長の仕方は毎回同じです。最初の年はアプリケーションが1つで、`src/app`フォルダーに`components`、`services`、`store`があります。3年目には、同じプロジェクトはたいてい次のようになっています。

- `shared/`に300個のファイルがあり、その半分はちょうど1つの機能でしか使われていない。
- 請求のコンポーネントが、そこにあったからという理由で整備のセレクターをインポートしている。
- ルートストアに40個のフィーチャーキーがあり、あるページがどれを必要とするのか誰も知らない。
- コードの切り出しが難しすぎるので、2つ目のアプリケーションを1つ目のコピーで作る。
- 日付ヘルパーを1か所変えるだけで、リポジトリ全体が再ビルド・再テストされる。
- 新しい開発者やコーディングエージェントは、機能がどこにあり、何を使ってよいのかを知るのに何日もかかる。

これは開発者が悪いせいではありません。2つの問いに対する共有された答えがないせいです。**このファイルはどこに置くのか**、そして**誰が誰をインポートしてよいのか**です。答えがなければいちばん近いフォルダーが選ばれ、いちばん近いフォルダーはいつも`shared/`です。

このガイドのアーキテクチャは、あらゆる種類のフロントエンドのコードについて、この2つの問いに一度だけ答えます。そしてその答えを**機械的**にします。境界を越えるインポートは、エディターでもCIでもlintルールが拒否します。

### 1.1. 目標

1. **見つけやすさ。** 機能の名前が分かれば、どのアプリケーションでもそのフォルダーが分かります。
2. **局所的な変更。** あるドメインの中の変更は、別のドメインを壊せません。別のドメインからはその内部が見えないからです。
3. **規模が大きくても速いフィードバック。** CIは、変更が影響するライブラリだけをビルドし、テストします。
4. **並行して動くチーム。** チームが所有するのはドメインであり、`shared/`に散らばったファイルではありません。
5. **差し替えられる状態。** 機能は、データがNgRxから来るのか、Signal Storeから来るのか、キャッシュから来るのか、サーバーから来るのかを知りません。
6. **3つのフレームワークに1つのルールブック。** 同じ会社のAngular、React、Vueのアプリケーションが同じ構造に従い、フレームワークに依存しないコードはそれらの間で共有されます。

### 1.2. 目標としないこと

- バックエンド、デザインシステム、CSSは選びません。
- マイクロフロントエンドを必要としません。ここに書くことはすべて、1つのデプロイ単位のアプリケーションで機能します。マイクロフロントエンドは後で別に下す判断です。
- 製品のルールを置き換えません。このアーキテクチャはコードの置き場所と使ってよいものを決め、コードが何をすべきかはプロジェクトが決めます。

## 2. 考え方の由来

このアーキテクチャは3つの源を組み合わせています。それぞれ原典で読む価値があるので、名前を挙げておきます。

| 源 | 貢献したもの |
|---|---|
| **Nx**（Nrwlチーム、*Enterprise Angular Monorepo Patterns*） | モノレポそのもの、公開の`index.ts`を持つライブラリ、そして古典的なライブラリの型である`feature`、`ui`、`data-access`、`util`。プロジェクトのタグと`@nx/enforce-module-boundaries`のlintルール。 |
| **Manfred Steyer**（ANGULARarchitects、電子書籍*Enterprise Angular*、Nxによる戦略的設計についての記事） | ドメイン駆動設計をフロントエンドに適用すること：**縦のスライスとしてのドメイン**、**横のレイヤーとしてのライブラリの型**、linterが確認する2つのタグの次元（`domain:*`と`type:*`）、ドメイン間の唯一の扉としての**APIライブラリ**、そしてUIと状態管理の間に置く**ファサード**。のちに、Nxを使わないプロジェクトのための境界チェッカー**Sheriff**も。 |
| **NgRx**（とその前身のRedux） | 共有の状態のための1つのストア、アクションと純粋なリデューサーによる変更、エフェクトに置く副作用、メモ化されたセレクターによる読み取り。 |

このガイドで私たちがその上に決めたこと：

- フレームワークに依存しない型と純粋なドメイン関数のための独立した`model`型。これにより`ui`ライブラリが状態管理に依存することがなくなります。
- ドメインのルートとプロバイダーを所有する独自の`shell`型（Nxの`feature-shell`）。
- 3つ目のタグの次元`framework:*`。これでAngular、React、Vueのアプリケーションが1つのワークスペースに同居し、`model`と`util`のコードを共有できます。
- Next.js向けの4つ目の次元、`platform:server`と`platform:client`。
- ファサードが割に合うときと省くときを決める、セクション10のルール。
- セクション12と13のReact/NextとVue/Nuxtへの置き換え。

このページの内容が元の記事と食い違う場合、考え方については原典が基準であり、それをどう適用するかについてはこのページが基準です。

## 3. 1ページで見るアーキテクチャ

:::diagram fe-grid

```tree
apps/<app>/                         thin: bootstrap, root routes, root providers
libs/<domain>/feature-<use-case>/   smart components for one use case (a page or a flow)
libs/<domain>/ui-<name>/            presentational components: inputs in, events out
libs/<domain>/data-access/          state, effects, HTTP, facade
libs/<domain>/model/                types and pure domain functions, no framework
libs/<domain>/util-<name>/          technical helpers for this domain
libs/<domain>/api/                  the only thing other domains may import
libs/<domain>/feature-shell/        the domain's routes and providers
libs/shared/<type>-<name>/          used by every domain, knows none of them
```

覚えておくべき6つの文です。

1. **どのライブラリもドメインを1つ、型を1つ持ちます。** それはタグとして書かれ、タグが何をインポートしてよいかを決めます。
2. **インポートは型の階段を下へ向かいます。** feature → ui、data-access → model → util。上へは決して向かわず、feature同士で横にも向かいません。
3. **ドメインが別のドメインを見るのは、その`api`ライブラリを通してだけです。** ドメインのそれ以外はすべて非公開です。
4. **`shared`はどのドメインも知りません。** 「共有」のファイルに作業指示（work order）が出てくるなら、それは整備ドメインに属します。
5. **コンポーネントはHTTPと話しません。** データは`data-access`を通って流れます。featureが見るのはファサードかセレクターであり、URLではありません。
6. **アプリケーションは薄く保ちます。** アプリはルートとプロバイダーを配線するだけです。機能はライブラリにあるので、2つ目のアプリのコストはほぼゼロです。

## 4. 用語

| 用語 | 意味 |
|---|---|
| **ワークスペース**（Workspace） | すべてのアプリケーションとライブラリを含む1つのNxリポジトリ。 |
| **アプリケーション**（Application） | `apps/`にあるデプロイ可能なフロントエンド。コードはほとんど含まない。 |
| **ライブラリ**（Library） | 独自の`project.json`、タグ、公開の`index.ts`を持つ`libs/`内のフォルダー。パスエイリアス（例：`@fleetline/maintenance/data-access`）を通してのみインポートされる。 |
| **ドメイン**（Domain） | 独自の言葉とデータを持つビジネスの一部分。整備、車両、請求など。境界づけられたコンテキストとも呼ぶ。`libs/`内の1つのフォルダー。 |
| **型**（Type） | ライブラリの技術的な役割：`feature`、`ui`、`data-access`、`model`、`util`、`api`、`shell`。 |
| **公開API**（Public API） | ライブラリの`index.ts`。そこからエクスポートされないものは、ほかのライブラリにとって存在しない。 |
| **ファサード**（Facade） | featureがストアの代わりに使う小さなクラス、フック、またはコンポーザブル。状態はシグナルやrefとして、意図はメソッドとして提供する。 |
| **境界ルール**（Boundary rule） | 2つのライブラリのタグを読み、タグが許さないインポートを失敗させるlintルール。 |

## 5. 例：Fleetline

Fleetlineは、トラック、バン、バスを運用する企業のために整備を請け負います。整備士はデポ（整備拠点）で働き、プランナーが作業を割り当て、顧客はサービスを予約して請求書を支払い、経理とサポートがバックオフィスを運営します。

### 5.1. アプリケーション

| アプリケーション | 利用者 | このガイドでのフレームワーク |
|---|---|---|
| `ops-portal` | デポのプランナーと整備士 | Angular |
| `customer` | フリートの顧客：予約、車両、請求書 | Angular（セクション12ではNext.js） |
| `backoffice` | 経理、サポート、管理者 | Angular（セクション13ではNuxt） |

### 5.2. ドメインとチーム

| ドメイン | 所有するもの | チーム | 使用するアプリ |
|---|---|---|---|
| `maintenance` | 作業指示、チェックリスト、計画ボード、SLA | Workshop | ops-portal、backoffice |
| `fleet` | 車両、走行距離計、整備履歴 | Workshop | 3つすべて |
| `inventory` | 部品、デポごとの在庫、引当 | Supply | ops-portal、backoffice |
| `booking` | サービス枠、予約フロー、予約変更 | Customer | customer、ops-portal |
| `billing` | 見積、請求書、支払い | Finance | customer、backoffice |
| `customers` | アカウント、契約、連絡先 | Customer | customer、backoffice |
| `identity` | サインイン、ロール、権限 | Platform | 3つすべて |
| `notifications` | アプリ内の受信箱、メールの設定 | Platform | 3つすべて |
| `shared` | デザインシステム、レイアウト、HTTPの設定、日付、金額、テスト | Platform | 3つすべて |

チームが5つ、フロントエンドエンジニアがおよそ35人、TypeScriptがおよそ280,000行です。`CODEOWNERS`が各`libs/<domain>/`フォルダーをそのチームに対応付けるので、maintenanceへのプルリクエストはWorkshopチームにだけレビューを依頼します。

### 5.3. ワークスペース

```tree
fleetline/
├── apps/
│   ├── ops-portal/
│   ├── customer/
│   └── backoffice/
└── libs/
    ├── maintenance/
    │   ├── api/
    │   ├── feature-shell/
    │   ├── feature-work-orders/
    │   ├── feature-work-order-detail/
    │   ├── feature-planning-board/
    │   ├── feature-checklist-editor/
    │   ├── ui-work-order-card/
    │   ├── ui-checklist/
    │   ├── ui-planning-grid/
    │   ├── data-access/
    │   ├── model/
    │   └── util-sla/
    ├── fleet/
    │   ├── api/
    │   ├── feature-shell/
    │   ├── feature-vehicle-list/
    │   ├── feature-vehicle-detail/
    │   ├── ui-vehicle-badge/
    │   ├── ui-odometer-chart/
    │   ├── data-access/
    │   └── model/
    ├── inventory/
    ├── booking/
    ├── billing/
    ├── customers/
    ├── identity/
    ├── notifications/
    └── shared/
        ├── ui-design-system/
        ├── ui-layout/
        ├── data-access-http/
        ├── util-http/
        ├── util-date/
        ├── util-money/
        └── util-testing/
```

maintenanceだけでライブラリが12個あります。これは普通のことです。ユースケースごとに`feature-*`が1つ、まとまりのあるコンポーネント群ごとに`ui-*`が1つ、そして大きくなりすぎるまではドメインごとに`data-access`と`model`が1つずつです（セクション16.3）。

### 5.4. レイヤーを通る1つのユースケース

ガイドの残りでは、1つのユースケースを追います。**プランナーがあるデポの作業指示を開き、絞り込み、整備士を割り当てる**というものです。これはmaintenanceの4つのライブラリとfleetの1つのライブラリにまたがります。

| ライブラリ | 貢献するもの |
|---|---|
| `maintenance/feature-work-orders` | ページ：ファサードを読み、カードを描画し、クリックを転送する |
| `maintenance/ui-work-order-card` | カードとステータスフィルター。状態もHTTPも持たない |
| `maintenance/data-access` | NgRxのフィーチャー、エフェクト、HTTPクライアント、ファサード |
| `maintenance/model` | `WorkOrder`、`WorkOrderFilter`、`matchesFilter`、`isOverdue` |
| `fleet/api` | `VehicleSummaryStore`：車両IDに対するナンバープレートと車種 |

## 6. ライブラリの型

それぞれの型は1つの問いに答えます。2つの問いに答えるファイルは、2つのファイルにすべきです。

| 型 | 答える問い | 含むもの | 含んではならないもの |
|---|---|---|---|
| `feature` | このユースケースは何をするのか | ルーティングされるページ、スマートコンポーネント、ファサードとuiの配線 | HTTP呼び出し、再利用できる見た目のコンポーネント |
| `ui` | どう見えるのか | プレゼンテーショナルコンポーネント、パイプ、ディレクティブ | 注入されたストア、状態を持つサービス、HTTP |
| `data-access` | データはどこから来て、どう変わるのか | ストア、エフェクト、APIクライアント、ファサード、プロバイダー | コンポーネント |
| `model` | ドメインの用語とルールは何か | 型、列挙型、`isOverdue`のような純粋関数 | あらゆる種類のフレームワークのインポート |
| `util` | どんな技術的ヘルパーが必要か | 書式化、パース、小さなアルゴリズム | ドメインの用語、フレームワークの状態 |
| `api` | ほかのドメインは何を使ってよいのか | ドメインから選んだ一部の再エクスポート | 独自のロジック |
| `shell` | このドメインはどうマウントされるのか | ルート、ルート単位のプロバイダー、ガード | ビジネスロジック |

### 6.1. 誰が誰をインポートしてよいか

| インポート元 ↓ インポート先 → | shell | feature | ui | data-access | model | util | 別ドメインのapi |
|---|---|---|---|---|---|---|---|
| **app** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **shell** | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **feature** | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| **api** | – | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **ui** | – | – | ✓ | – | ✓ | ✓ | – |
| **data-access** | – | – | – | ✓ | ✓ | ✓ | – |
| **model** | – | – | – | – | ✓ | ✓ | – |
| **util** | – | – | – | – | – | ✓ | – |

この表の価値の大半は、次の3つの行にあります。

- **feature → featureは禁止です。** 同じものを必要とする2つのページは、`ui`か`data-access`を通してそれを共有します。ページを組み合わせるのはシェルやルーターであり、互いにインポートし合うことではありません。
- **ui → data-accessは禁止です。** ストアを注入するコンポーネントは、プレゼンテーショナルではありません。このルールがあるので、`WorkOrder`型は`data-access`ではなく`model`に置きます。
- **modelはフレームワークをインポートしません。** `model`と`util`は、Angular、React、Vue、Nodeのどれでも同じようにコンパイルされます。混在したワークスペースでは、これらが共有するコードです（セクション8.3）。

### 6.2. ライブラリの大きさ

- **feature：** 1つのユースケース。たいていは1つのルートとその子ルートです。`feature-maintenance`ではなく`feature-work-orders`です。
- **ui：** 一緒に変わる、まとまりのある1つのグループ。`ui-work-order-card`はカード、ステータスチップ、ステータスフィルターを含みます。
- **data-access：** 最初はドメインごとに1つ。ストアのフィーチャーが3つか4つを超えたり、チームが分かれたりしたら、サブドメインごとに分けます（`data-access-planning`、`data-access-work-orders`）。
- **model：** ドメインごとに1つ。性質上、小さいものです。
- ファイルが1つしかないライブラリは、おそらく小さすぎます。`index.ts`がおよそ30個を超えるシンボルをエクスポートしているなら、おそらく大きすぎます。

### 6.3. スタイル

スタイルにもTypeScriptと同じ境界が適用されますが、境界のルールからは見えません。NxはTypeScriptとJavaScriptのインポートから依存グラフを作り、SCSSの`@use`は無視するからです。そのため、スタイルには独自の4つのルールがあります。

1. **コンポーネントは自分専用のスタイルだけを、自分の隣のファイルに持つ。** ライブラリはグローバルなクラスを決して定義しないので、maintenanceの`.card`とbillingの`.card`が衝突することはありません。
2. **デザインシステムとはCSS変数を通してやり取りする。** トークン（色、余白、角丸、タイポグラフィ）は`shared/ui-design-system`のカスタムプロパティです。ドメインのコンポーネントは`var(--ds-…)`を読み、他のライブラリのSCSSファイルを`@use`しません。
3. **グローバルなスタイルを持つのはアプリケーションだけ：** リセット、フォント、トークンを1か所にまとめます。
4. **他人のコンポーネントの内部をスタイリングしない。** カスタマイズできるべきコンポーネントは、入力、prop、またはCSS変数を公開します。

| | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| コンポーネントのスタイル | デフォルトのエミュレートされたカプセル化による`styleUrl` | CSS Modules：`*.module.scss` | `<style scoped lang="scss">` |
| グローバルなスタイル | `apps/<app>/src/styles.scss` | アプリケーションの`app/layout.tsx`でのインポート | `nuxt.config.ts`の`css` |
| ライブラリで禁止 | `::ng-deep`、`ViewEncapsulation.None` | `:global(...)`、通常の`.css`のインポート | `:deep(...)`、`scoped`なしの`<style>` |

`libs/shared/ui-design-system/src/styles/tokens.scss`

```scss
:root {
  --ds-surface: #ffffff;
  --ds-text: #1b1f24;
  --ds-text-muted: #59636e;
  --ds-danger: #c62828;
  --ds-radius: 8px;
  --ds-space-2: 8px;
  --ds-space-3: 12px;
}
```

`libs/maintenance/ui-work-order-card/src/lib/work-order-card.component.scss`

```scss
.card {
  display: grid;
  gap: var(--ds-space-2);
  padding: var(--ds-space-3);
  border-radius: var(--ds-radius);
  background: var(--ds-surface);
  color: var(--ds-text);
}

.card--overdue {
  border-left: 4px solid var(--ds-danger);
}

.vehicle,
.due {
  color: var(--ds-text-muted);
}
```

同じCSSのルールは、Reactでは`work-order-card.module.scss`に、Vueではコンポーネントの`<style scoped>`ブロックに入ります。CIのStylelintは、表の最後の行にあるセレクターを拒否します（`selector-disallowed-list`）。ルール2はCIの`grep`コマンド1つで確認します。ドメインのライブラリ内の`@use`が指せるのは同じライブラリのファイルだけで、`@fleetline/`エイリアスは決して指せません。

## 7. ドメインと境界

ドメインとは、明示的な扉を持つフォルダーです。フォルダーの中ではセクション6の型のルールが適用されます。フォルダーをまたぐ場合に適用されるルールは1つだけです。**別のドメインからインポートしてよいのはその`api`ライブラリだけで、それ以外は何もインポートできません。**

### 7.1. APIライブラリ

`fleet/api`は、fleetが会社のほかの部分に何を提供するかを決めます。そこに挙げられていないものはすべてWorkshopチームの非公開物であり、誰にも相談せずに変更できます。

`libs/fleet/api/src/index.ts`

```ts
export type { VehicleSummary, VehicleId } from '@fleetline/fleet/model';
export { VehicleSummaryStore } from '@fleetline/fleet/data-access';
export { VehicleBadgeComponent } from '@fleetline/fleet/ui-vehicle-badge';
```

ここでエクスポートしているストアはNgRx Signal Storeですが、maintenanceは従来のNgRx Storeを使っています。maintenanceはそれを知る必要がありません。見えるのは`VehicleSummaryStore`だけです。

`libs/fleet/data-access/src/lib/vehicle-summary.store.ts`

```ts
import { inject } from '@angular/core';
import { patchState, signalStore, withMethods } from '@ngrx/signals';
import { upsertEntities, withEntities } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { tapResponse } from '@ngrx/operators';
import { filter, map, mergeMap, pipe } from 'rxjs';
import type { VehicleSummary } from '@fleetline/fleet/model';
import { FleetApi } from './fleet.api';

export const VehicleSummaryStore = signalStore(
  { providedIn: 'root' },
  withEntities<VehicleSummary>(),
  withMethods((store, api = inject(FleetApi)) => ({
    ensureLoaded: rxMethod<readonly string[]>(
      pipe(
        map((ids) => [...new Set(ids)].filter((id) => !store.entityMap()[id])),
        filter((ids) => ids.length > 0),
        mergeMap((ids) =>
          api.summaries(ids).pipe(
            tapResponse({
              next: (vehicles) => patchState(store, upsertEntities(vehicles)),
              error: (error: unknown) => console.error('fleet summaries', error),
            }),
          ),
        ),
      ),
    ),
  })),
);
```

### 7.2. sharedもドメインである

`shared`は`domain:shared`タグを持ち、`domain:shared`だけをインポートできます。ビジネスの用語は何も知りません。レビューでの目安として、`shared`のファイルにドメインの言葉（作業指示、請求書、車両）が含まれていたら、そのファイルはそのドメインへ移します。

### 7.3. 2つのドメインが同じものを必要とするとき

| 状況 | 答え |
|---|---|
| 請求で車両のナンバープレートを表示する | 請求が`fleet/api`をインポートする。 |
| 整備と在庫の両方がデポの一覧を必要とする | デポはそれ自体が1つの概念である。小さな`depots`ドメインを作るか、`fleet`がAPIでエクスポートする。`shared`ではない。 |
| 予約の後に予約ドメインが作業指示を作成する必要がある | 予約ドメインはバックエンドを呼び、バックエンドが作業指示を作成する。フロントエンドのドメインは、互いの書き込みを取りまとめない。 |
| 2つのドメインが同じ日付ピッカーを必要とする | これはビジネスではなく技術の問題なので、`shared/ui-design-system`に置く。 |
| 2つのAPIライブラリが互いをインポートしたがる | ドメインの切り方が間違っている。統合するか、共有の概念を3つ目のドメインに移す。 |

## 8. ルールの強制

確認されないルールは提案にすぎません。Nxはタグと1つのlintルールでそれを確認します。

### 8.1. タグ

どの`project.json`にも`domain:*`タグと`type:*`タグを1つずつ付け、混在したワークスペースでは`framework:*`タグも1つ付けます。

`libs/maintenance/data-access/project.json`

```json
{
  "name": "maintenance-data-access",
  "sourceRoot": "libs/maintenance/data-access/src",
  "projectType": "library",
  "tags": ["domain:maintenance", "type:data-access", "framework:angular"]
}
```

`libs/maintenance/model/project.json`

```json
{
  "name": "maintenance-model",
  "sourceRoot": "libs/maintenance/model/src",
  "projectType": "library",
  "tags": ["domain:maintenance", "type:model", "framework:agnostic"]
}
```

タグはライブラリの作成時にジェネレーターが設定します。

```bash
nx g @nx/angular:library --directory=libs/maintenance/feature-planning-board \
  --tags=domain:maintenance,type:feature,framework:angular
nx g @nx/js:library --directory=libs/maintenance/model \
  --tags=domain:maintenance,type:model,framework:agnostic --bundler=none
```

### 8.2. lintルール

`eslint.config.mjs`

```js
import nx from '@nx/eslint-plugin';

const domains = [
  'maintenance', 'fleet', 'inventory', 'booking',
  'billing', 'customers', 'identity', 'notifications',
];

const types = {
  app: ['shell', 'feature', 'ui', 'data-access', 'model', 'util'],
  shell: ['feature', 'ui', 'data-access', 'model', 'util', 'api'],
  feature: ['ui', 'data-access', 'model', 'util', 'api'],
  api: ['feature', 'ui', 'data-access', 'model', 'util'],
  ui: ['ui', 'model', 'util'],
  'data-access': ['data-access', 'model', 'util'],
  model: ['model', 'util'],
  util: ['util'],
};

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.vue'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          banTransitiveDependencies: true,
          depConstraints: [
            ...Object.entries(types).map(([type, allowed]) => ({
              sourceTag: `type:${type}`,
              onlyDependOnLibsWithTags: allowed.map((t) => `type:${t}`),
            })),
            { sourceTag: 'domain:shared', onlyDependOnLibsWithTags: ['domain:shared'] },
            ...domains.map((domain) => ({
              sourceTag: `domain:${domain}`,
              onlyDependOnLibsWithTags: [`domain:${domain}`, 'domain:shared', 'type:api'],
            })),
            { sourceTag: 'framework:agnostic', onlyDependOnLibsWithTags: ['framework:agnostic'] },
            { sourceTag: 'framework:angular', onlyDependOnLibsWithTags: ['framework:angular', 'framework:agnostic'] },
            { sourceTag: 'framework:react', onlyDependOnLibsWithTags: ['framework:react', 'framework:agnostic'] },
            { sourceTag: 'framework:vue', onlyDependOnLibsWithTags: ['framework:vue', 'framework:agnostic'] },
            { sourceTag: 'platform:client', notDependOnLibsWithTags: ['platform:server'] },
          ],
        },
      ],
    },
  },
];
```

次元の組み合わせ方：インポートは、インポートする側のライブラリが持つすべてのタグの**すべての**制約を満たさなければなりません。maintenanceのfeatureは`fleet/api`をインポートできます。型のルールが`type:api`を許し、ドメインのルールも`type:api`を許すからです。`fleet/data-access`はインポートできません。型のルールは`data-access`を許しますが、ドメインのルールが`domain:fleet`を許さないからです。maintenanceの`ui`ライブラリも`fleet/api`をインポートできません。ドメインのルールは許しますが、型のルールが許さないからです。

同じルールは、別のライブラリへの相対インポート、`index.ts`ではなくライブラリの内部へのインポート、そしてライブラリ間の循環依存も拒否します。

### 8.3. フレームワークの次元

Fleetlineの`customer`アプリケーションはNext.jsへ、`backoffice`はNuxtへ移行できます。そのとき`model`や`util`のライブラリは1つも動かす必要がありません。これらは`framework:agnostic`タグを持ち、ほかのフレームワーク非依存のコードしかインポートできないので、`matchesFilter`と`isOverdue`は3つのアプリすべてで同じ関数です。AngularのUIライブラリをインポートしようとするReactライブラリは、lintで失敗します。

### 8.4. Nxなしで：Sheriff

すべてのチームがNxを使っているわけではありません。同じANGULARarchitectsのチームによる**Sheriff**は、同じタグのルールを1つのTypeScriptプロジェクトの中で、ライブラリ単位ではなくフォルダー単位で強制します。モノレポより先に境界が欲しいNext.jsやNuxtのアプリケーションに向いています。

`sheriff.config.ts`

```ts
import { sameTag, type SheriffConfig } from '@softarc/sheriff-core';

export const config: SheriffConfig = {
  modules: {
    'src/domains/<domain>': {
      'feature-<name>': ['domain:<domain>', 'type:feature'],
      'ui-<name>': ['domain:<domain>', 'type:ui'],
      'data-access': ['domain:<domain>', 'type:data-access'],
      model: ['domain:<domain>', 'type:model'],
      api: ['domain:<domain>', 'type:api'],
    },
    'src/shared/ui-<name>': ['domain:shared', 'type:ui'],
    'src/shared/util-<name>': ['domain:shared', 'type:util'],
  },
  depRules: {
    root: ['type:feature', 'type:ui', 'type:data-access', 'type:model', 'type:util', 'domain:shared'],
    'domain:*': [sameTag, 'domain:shared', 'type:api'],
    'type:feature': ['type:ui', 'type:data-access', 'type:model', 'type:util', 'type:api'],
    'type:api': ['type:feature', 'type:ui', 'type:data-access', 'type:model', 'type:util'],
    'type:ui': ['type:ui', 'type:model', 'type:util'],
    'type:data-access': ['type:data-access', 'type:model', 'type:util'],
    'type:model': ['type:model', 'type:util'],
    'type:util': ['type:util'],
  },
};
```

### 8.5. CIでの扱い

```bash
nx affected -t lint typecheck test build --base=origin/main
nx graph --affected
```

依存グラフが明示されているので、`maintenance/ui-checklist`を変更すると、それに依存するライブラリとアプリケーションだけがlint、テスト、ビルドの対象になり、それ以外は対象になりません。Fleetlineでは、典型的なプルリクエストは1つのドメインに触れ、ワークスペースの5分の1を実行します。リモートキャッシュを使えば、変更のないライブラリはどのマシンでも再ビルドされません。

## 9. NgRxによる状態

`maintenance/data-access`には、作業指示がどこから来てどう変わるかに関するすべてが入っています。このセクションではその全体を示します。各ファイルの役割は1つです。

```tree
libs/maintenance/data-access/src/
├── index.ts
└── lib/
    ├── work-orders.api.ts
    ├── work-orders.events.ts
    ├── work-orders.feature.ts
    ├── work-orders.effects.ts
    ├── work-orders.facade.ts
    └── work-orders.providers.ts
```

### 9.1. モデル

モデルはフレームワークに依存せず、独自のライブラリに置きます。そのため`ui`ライブラリ、テスト、そしてReact版とVue版がそれを使えます。

`libs/maintenance/model/src/lib/work-order.ts`

```ts
export type WorkOrderStatus = 'open' | 'scheduled' | 'in-progress' | 'waiting-parts' | 'done';
export type WorkOrderPriority = 'low' | 'normal' | 'urgent';

export interface WorkOrder {
  id: string;
  vehicleId: string;
  depotId: string;
  title: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  dueAt: string;
  assigneeId: string | null;
}

export interface WorkOrderFilter {
  depotId: string;
  status: WorkOrderStatus | 'all';
  query: string;
}

export const emptyFilter: WorkOrderFilter = { depotId: '', status: 'all', query: '' };

export function matchesFilter(order: WorkOrder, filter: WorkOrderFilter): boolean {
  const query = filter.query.trim().toLowerCase();
  return (
    (filter.status === 'all' || order.status === filter.status) &&
    (query === '' || order.title.toLowerCase().includes(query))
  );
}

export function isOverdue(order: WorkOrder, now: Date): boolean {
  return order.status !== 'done' && new Date(order.dueAt).getTime() < now.getTime();
}

export function byDueDate(a: WorkOrder, b: WorkOrder): number {
  return a.dueAt.localeCompare(b.dueAt);
}
```

### 9.2. イベント

アクションは**何が起きたか**で名付け、**どこで起きたか**でまとめます。ページはイベントを報告します。`loadWorkOrders`のような命令は出しません。

`libs/maintenance/data-access/src/lib/work-orders.events.ts`

```ts
import { createActionGroup, props } from '@ngrx/store';
import type { WorkOrder, WorkOrderFilter } from '@fleetline/maintenance/model';

export const workOrdersPage = createActionGroup({
  source: 'Work Orders Page',
  events: {
    opened: props<{ depotId: string }>(),
    filterChanged: props<{ filter: Partial<Omit<WorkOrderFilter, 'depotId'>> }>(),
    assigneeChosen: props<{ id: string; assigneeId: string; previousAssigneeId: string | null }>(),
  },
});

export const workOrdersApi = createActionGroup({
  source: 'Work Orders API',
  events: {
    loadSucceeded: props<{ workOrders: WorkOrder[] }>(),
    loadFailed: props<{ error: string }>(),
    assignSucceeded: props<{ workOrder: WorkOrder }>(),
    assignFailed: props<{ id: string; previousAssigneeId: string | null; error: string }>(),
  },
});
```

### 9.3. フィーチャー：状態、リデューサー、セレクター

`libs/maintenance/data-access/src/lib/work-orders.feature.ts`

```ts
import { createEntityAdapter, type EntityState } from '@ngrx/entity';
import { createFeature, createReducer, createSelector, on } from '@ngrx/store';
import {
  byDueDate, emptyFilter, isOverdue, matchesFilter,
  type WorkOrder, type WorkOrderFilter,
} from '@fleetline/maintenance/model';
import { workOrdersApi, workOrdersPage } from './work-orders.events';

interface WorkOrdersState extends EntityState<WorkOrder> {
  filter: WorkOrderFilter;
  loading: boolean;
  error: string | null;
}

const adapter = createEntityAdapter<WorkOrder>({ sortComparer: byDueDate });

const initialState: WorkOrdersState = adapter.getInitialState({
  filter: emptyFilter,
  loading: false,
  error: null,
});

export const workOrdersFeature = createFeature({
  name: 'workOrders',
  reducer: createReducer(
    initialState,
    on(workOrdersPage.opened, (state, { depotId }) => ({
      ...adapter.removeAll(state),
      filter: { ...emptyFilter, depotId },
      loading: true,
      error: null,
    })),
    on(workOrdersPage.filterChanged, (state, { filter }) => ({
      ...state,
      filter: { ...state.filter, ...filter },
    })),
    on(workOrdersPage.assigneeChosen, (state, { id, assigneeId }) =>
      adapter.updateOne({ id, changes: { assigneeId } }, state),
    ),
    on(workOrdersApi.loadSucceeded, (state, { workOrders }) =>
      adapter.setAll(workOrders, { ...state, loading: false }),
    ),
    on(workOrdersApi.loadFailed, (state, { error }) => ({ ...state, loading: false, error })),
    on(workOrdersApi.assignSucceeded, (state, { workOrder }) => adapter.upsertOne(workOrder, state)),
    on(workOrdersApi.assignFailed, (state, { id, previousAssigneeId, error }) =>
      adapter.updateOne({ id, changes: { assigneeId: previousAssigneeId } }, { ...state, error }),
    ),
  ),
  extraSelectors: ({ selectWorkOrdersState, selectFilter }) => {
    const { selectAll } = adapter.getSelectors(selectWorkOrdersState);
    const selectVisible = createSelector(selectAll, selectFilter, (orders, filter) =>
      orders.filter((order) => matchesFilter(order, filter)),
    );
    const selectOverdueCount = createSelector(
      selectAll,
      (orders) => orders.filter((order) => isOverdue(order, new Date())).length,
    );
    return { selectAll, selectVisible, selectOverdueCount };
  },
});
```

割り当ては**楽観的**です。リデューサーは`assigneeChosen`をすぐに適用し、`assignFailed`が前の整備士を元に戻します。前の値はイベントに載せて運びます。エフェクトが実行される時点では、状態はすでに新しい値を持っているからです。

### 9.4. HTTPとエフェクト

`libs/maintenance/data-access/src/lib/work-orders.api.ts`

```ts
import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { API_BASE_URL } from '@fleetline/shared/data-access-http';
import type { WorkOrder } from '@fleetline/maintenance/model';

@Service()
export class WorkOrdersHttp {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(depotId: string) {
    return this.http.get<WorkOrder[]>(`${this.baseUrl}/depots/${depotId}/work-orders`);
  }

  assign(id: string, assigneeId: string) {
    return this.http.put<WorkOrder>(`${this.baseUrl}/work-orders/${id}/assignee`, { assigneeId });
  }
}
```

Angular 22の`@Service()`は`@Injectable({ providedIn: 'root' })`の短い書き方で、依存は`inject()`だけで取得します。`HttpClient`はデフォルトでFetch APIを使うので、設定に`withFetch()`は不要です。`toErrorMessage`は`shared/util-http`にあります。これはフレームワークに依存しないライブラリで、ReactとVueの版も使います。

`libs/maintenance/data-access/src/lib/work-orders.effects.ts`

```ts
import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, mergeMap, of, switchMap } from 'rxjs';
import { toErrorMessage } from '@fleetline/shared/util-http';
import { WorkOrdersHttp } from './work-orders.api';
import { workOrdersApi, workOrdersPage } from './work-orders.events';

export const loadWorkOrders = createEffect(
  (actions$ = inject(Actions), http = inject(WorkOrdersHttp)) =>
    actions$.pipe(
      ofType(workOrdersPage.opened),
      switchMap(({ depotId }) =>
        http.list(depotId).pipe(
          map((workOrders) => workOrdersApi.loadSucceeded({ workOrders })),
          catchError((error: unknown) => of(workOrdersApi.loadFailed({ error: toErrorMessage(error) }))),
        ),
      ),
    ),
  { functional: true },
);

export const assignWorkOrder = createEffect(
  (actions$ = inject(Actions), http = inject(WorkOrdersHttp)) =>
    actions$.pipe(
      ofType(workOrdersPage.assigneeChosen),
      mergeMap(({ id, assigneeId, previousAssigneeId }) =>
        http.assign(id, assigneeId).pipe(
          map((workOrder) => workOrdersApi.assignSucceeded({ workOrder })),
          catchError((error: unknown) =>
            of(workOrdersApi.assignFailed({ id, previousAssigneeId, error: toErrorMessage(error) })),
          ),
        ),
      ),
    ),
  { functional: true },
);
```

読み込みには`switchMap`を使います（新しいデポが古いリクエストをキャンセルします）。割り当てには`mergeMap`を使います（2枚のカードでの2つの割り当ては、どちらも完了しなければなりません）。

### 9.5. プロバイダー

ストアのフィーチャーは、アプリケーションのルートではなく、ドメインのルートに登録します。プランナーがmaintenanceを開くまでルートストアは空のままで、そのコードはルートと一緒に遅延読み込みされます。

`libs/maintenance/data-access/src/lib/work-orders.providers.ts`

```ts
import { makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';
import * as workOrderEffects from './work-orders.effects';
import { workOrdersFeature } from './work-orders.feature';
import { WorkOrdersFacade } from './work-orders.facade';

export function provideWorkOrders(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideState(workOrdersFeature),
    provideEffects(workOrderEffects),
    WorkOrdersFacade,
  ]);
}
```

### 9.6. data-accessの公開API

`libs/maintenance/data-access/src/index.ts`

```ts
export { provideWorkOrders } from './lib/work-orders.providers';
export { WorkOrdersFacade } from './lib/work-orders.facade';
```

エクスポートは2つです。アクション、リデューサー、セレクター、HTTPクライアントは非公開です。maintenanceのすべてのfeatureはファサードを通り、Workshopチームはコンポーネントを1つも触らずにストアを再構成できます。

## 10. ファサードと、それを省くとき

:::diagram fe-flow

ファサードは、featureと状態管理の間にある薄いオブジェクトです。**状態**（Angularではシグナル、Reactでは値、Vueではref）と**意図**（メソッド）を公開します。ロジックは持ちません。各メソッドはちょうど1つのイベントをディスパッチし、各プロパティはちょうど1つのセレクターです。

`libs/maintenance/data-access/src/lib/work-orders.facade.ts`

```ts
import { inject, Service } from '@angular/core';
import { Store } from '@ngrx/store';
import type { WorkOrder, WorkOrderFilter } from '@fleetline/maintenance/model';
import { workOrdersPage } from './work-orders.events';
import { workOrdersFeature } from './work-orders.feature';

@Service({ autoProvided: false })
export class WorkOrdersFacade {
  private readonly store = inject(Store);

  readonly visible = this.store.selectSignal(workOrdersFeature.selectVisible);
  readonly overdueCount = this.store.selectSignal(workOrdersFeature.selectOverdueCount);
  readonly filter = this.store.selectSignal(workOrdersFeature.selectFilter);
  readonly loading = this.store.selectSignal(workOrdersFeature.selectLoading);
  readonly error = this.store.selectSignal(workOrdersFeature.selectError);

  open(depotId: string): void {
    this.store.dispatch(workOrdersPage.opened({ depotId }));
  }

  filterBy(filter: Partial<Omit<WorkOrderFilter, 'depotId'>>): void {
    this.store.dispatch(workOrdersPage.filterChanged({ filter }));
  }

  assign(order: WorkOrder, assigneeId: string): void {
    this.store.dispatch(
      workOrdersPage.assigneeChosen({ id: order.id, assigneeId, previousAssigneeId: order.assigneeId }),
    );
  }
}
```

`autoProvided: false`は`root`での提供を無効にします。ファサードは`provideWorkOrders()`で提供されるので、そのストアのフィーチャーが存在する場所にちょうど存在します。

### 10.1. なぜファサードか

- **差し替えられる状態。** 作業指示がNgRx StoreからSignal Storeやサーバーキャッシュへ移る日が来ても、変わるのはファサードで、コンポーネントは変わりません。Fleetlineは`fleet`でまさにこれを行いました（セクション7.1）。
- **小さな表面。** featureから見えるのは、14個のアクションと9個のセレクターではなく、6個のメンバーです。
- **テストのしやすさ。** featureのテストは、同じ形の偽オブジェクトを提供します（セクション15）。
- **どのフレームワークでも同じ形。** ここではクラス、ReactとVueでは`useWorkOrders()`です。featureのコードは3つでほとんど同じに読めます（セクション14）。

### 10.2. なぜファサードは任意なのか

NgRxのコミュニティには、ファサードへの有力な反論があります。アクションはイベント（*「作業指示ページで担当者が選ばれた」*）を表すべきであり、`assign()`というメソッドを持つファサードは命令で考えることを誘う、というものです。3つのアクションを続けてディスパッチしたり、ロジックを持ったりするファサードは、NgRxをデバッグしやすくしているイベントログを隠してしまいます。

そこで私たちの方式では、ファサードを条件付きのルールにしています。

| ファサードを使うとき | 省くとき |
|---|---|
| 複数のfeatureが同じ状態を使う | 1つのfeatureが1つの小さなストアのフィーチャーを所有している |
| 状態の実装が変わる可能性がある（Store ↔ Signal Store ↔ サーバーキャッシュ） | 状態がコンポーネントにローカルである。コンポーネントの中でSignal Storeか単純なシグナルを使う |
| データを`api`を通して別のドメインに提供する | チームがイベントを直接ディスパッチすることを好み、ドメインが小さい |
| コードベースをReactやVueのチームと共有する | |

ファサードを使う場合のルールは2つです。

1. **メソッド名はイベントを保ちます。** `assign()`は、`Work Orders Page`ソースから`assigneeChosen`をディスパッチします。2つのページで割り当てができるなら、ページごとに独自のイベントを持たせます。ファサードにはメソッドを2つ用意するか`source`パラメーターを持たせ、汎用の`update()`を1つ作ることは決してしません。
2. **ロジックは持ちません。** `if`もループもHTTPの呼び出しもありません。判断が必要なら、その判断はリデューサー、セレクター、またはエフェクトに属します。

ファサードを使わない場合は、`data-access`の`index.ts`が代わりにページのイベントとセレクターをエクスポートし、コンポーネントが`store.dispatch()`と`store.selectSignal()`を自分で呼びます。どちらの形も境界ルールを通ります。ドメインごとにどちらかを選び、ドメインのREADMEに書いてください。

## 11. Angularでの全体像

`data-access`がそろえば、残りのライブラリは短く済みます。

このユースケースのすべてのファイルを含む Angular のワークスペースです。各ライブラリにはそれぞれ `project.json` と `tsconfig.json` もありますが、ツリーではアプリケーションと `data-access` についてのみ示しています。

```tree
fleetline/
├── nx.json
├── package.json
├── tsconfig.base.json
├── eslint.config.mjs
├── apps/
│   └── ops-portal/
│       ├── project.json
│       ├── tsconfig.json
│       └── src/
│           ├── main.ts
│           ├── index.html
│           ├── styles.scss
│           ├── environments/
│           │   └── environment.ts
│           └── app/
│               ├── app.config.ts
│               └── app.routes.ts
└── libs/
    ├── maintenance/
    │   ├── feature-shell/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           └── maintenance.routes.ts
    │   ├── feature-work-orders/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-orders-page.component.ts
    │   │           └── work-orders-page.component.spec.ts
    │   ├── ui-work-order-card/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-order-card.component.ts
    │   │           ├── work-order-card.component.scss
    │   │           └── status-filter.component.ts
    │   ├── data-access/
    │   │   ├── project.json
    │   │   ├── tsconfig.json
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-orders.api.ts
    │   │           ├── work-orders.events.ts
    │   │           ├── work-orders.feature.ts
    │   │           ├── work-orders.feature.spec.ts
    │   │           ├── work-orders.effects.ts
    │   │           ├── work-orders.facade.ts
    │   │           └── work-orders.providers.ts
    │   └── model/
    │       ├── src/
    │       │   ├── index.ts
    │       │   └── lib/
    │       │       ├── work-order.ts
    │       │       └── work-order.spec.ts
    │       └── testing/
    │           └── src/
    │               └── index.ts
    ├── fleet/
    │   ├── api/
    │   │   └── src/
    │   │       └── index.ts
    │   └── data-access/
    │       └── src/
    │           └── lib/
    │               ├── fleet.api.ts
    │               └── vehicle-summary.store.ts
    ├── identity/
    │   ├── api/
    │   └── data-access/
    └── shared/
        ├── ui-design-system/
        ├── ui-layout/
        ├── data-access-http/
        ├── util-http/
        └── util-date/
```

### 11.1. uiライブラリ

`libs/maintenance/ui-work-order-card/src/lib/work-order-card.component.ts`

```ts
import { Component, computed, input, output } from '@angular/core';
import { isOverdue, type WorkOrder } from '@fleetline/maintenance/model';
import { BadgeComponent, MechanicPickerComponent } from '@fleetline/shared/ui-design-system';
import { RelativeDatePipe } from '@fleetline/shared/util-date';

@Component({
  selector: 'mnt-work-order-card',
  imports: [BadgeComponent, MechanicPickerComponent, RelativeDatePipe],
  styleUrl: './work-order-card.component.scss',
  template: `
    <article class="card" [class.card--overdue]="overdue()">
      <header>
        <h3>{{ workOrder().title }}</h3>
        <ds-badge [tone]="workOrder().priority === 'urgent' ? 'danger' : 'neutral'">
          {{ workOrder().priority }}
        </ds-badge>
      </header>
      <p class="vehicle">{{ vehicleLabel() }}</p>
      <p class="due">{{ workOrder().dueAt | relativeDate }}</p>
      <ds-mechanic-picker
        [depotId]="workOrder().depotId"
        [value]="workOrder().assigneeId"
        (valueChange)="assign.emit($event)"
      />
    </article>
  `,
})
export class WorkOrderCardComponent {
  readonly workOrder = input.required<WorkOrder>();
  readonly vehicleLabel = input('');
  readonly assign = output<string>();

  protected readonly overdue = computed(() => isOverdue(this.workOrder(), new Date()));
}
```

カードが`WorkOrder`を知っているのは、`model`が許されているからです。`vehicleLabel`を文字列として受け取るのは、maintenanceの`ui`ライブラリが`fleet/api`をインポートできないからです。Angular 22では`OnPush`がデフォルトの変更検知戦略なので、コンポーネントはそれを宣言しません。セクション6.3のスタイルは`styleUrl`で読み込みます。

### 11.2. featureライブラリ

`libs/maintenance/feature-work-orders/src/lib/work-orders-page.component.ts`

```ts
import { Component, computed, effect, inject, input } from '@angular/core';
import { WorkOrdersFacade } from '@fleetline/maintenance/data-access';
import { StatusFilterComponent, WorkOrderCardComponent } from '@fleetline/maintenance/ui-work-order-card';
import { VehicleSummaryStore } from '@fleetline/fleet/api';
import { EmptyStateComponent, SpinnerComponent } from '@fleetline/shared/ui-design-system';

@Component({
  selector: 'mnt-work-orders-page',
  imports: [StatusFilterComponent, WorkOrderCardComponent, EmptyStateComponent, SpinnerComponent],
  template: `
    <h1>Work orders <small>{{ facade.overdueCount() }} overdue</small></h1>

    <mnt-status-filter
      [status]="facade.filter().status"
      [query]="facade.filter().query"
      (statusChange)="facade.filterBy({ status: $event })"
      (queryChange)="facade.filterBy({ query: $event })"
    />

    @if (facade.loading()) {
      <ds-spinner />
    } @else {
      @for (order of facade.visible(); track order.id) {
        <mnt-work-order-card
          [workOrder]="order"
          [vehicleLabel]="vehicles.entityMap()[order.vehicleId]?.plate ?? ''"
          (assign)="facade.assign(order, $event)"
        />
      } @empty {
        <ds-empty-state title="No work orders match this filter" />
      }
    }
  `,
})
export class WorkOrdersPageComponent {
  readonly depotId = input.required<string>();

  protected readonly facade = inject(WorkOrdersFacade);
  protected readonly vehicles = inject(VehicleSummaryStore);

  constructor() {
    effect(() => this.facade.open(this.depotId()));
    this.vehicles.ensureLoaded(computed(() => this.facade.visible().map((order) => order.vehicleId)));
  }
}
```

`depotId`は`withComponentInputBinding()`を通してルートパラメーターから渡されます。`ensureLoaded`は`rxMethod`なのでシグナルを受け取れます。そのため表示中のリストが変わるたびに、fleetはまだ持っていないナンバープレートを1回のリクエストで読み込みます。

### 11.3. シェル

`libs/maintenance/feature-shell/src/lib/maintenance.routes.ts`

```ts
import type { Routes } from '@angular/router';
import { provideWorkOrders } from '@fleetline/maintenance/data-access';
import { requirePermission } from '@fleetline/identity/api';

export const maintenanceRoutes: Routes = [
  {
    path: '',
    providers: [provideWorkOrders()],
    canActivate: [requirePermission('maintenance:read')],
    children: [
      {
        path: 'depots/:depotId/work-orders',
        loadComponent: () =>
          import('@fleetline/maintenance/feature-work-orders').then((m) => m.WorkOrdersPageComponent),
      },
      {
        path: 'work-orders/:workOrderId',
        loadComponent: () =>
          import('@fleetline/maintenance/feature-work-order-detail').then((m) => m.WorkOrderDetailPageComponent),
      },
      {
        path: 'planning',
        loadChildren: () =>
          import('@fleetline/maintenance/feature-planning-board').then((m) => m.planningRoutes),
      },
    ],
  },
];
```

シェルは権限ガードのために`identity/api`をインポートします。ガードはfleetのナンバープレートと同じくドメインをまたぐ関心事なので、featureと同じようにシェルも別のドメインのAPIを使えます（セクション6.1）。シェルが必要とするそれ以外のものは、すべて自分のドメインから来ます。

### 11.4. アプリケーション

`apps/ops-portal/src/app/app.routes.ts`

```ts
import type { Routes } from '@angular/router';
import { authGuard } from '@fleetline/identity/data-access';
import { AppLayoutComponent } from '@fleetline/shared/ui-layout';

export const appRoutes: Routes = [
  {
    path: '',
    component: AppLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'maintenance', loadChildren: () => import('@fleetline/maintenance/feature-shell').then((m) => m.maintenanceRoutes) },
      { path: 'fleet', loadChildren: () => import('@fleetline/fleet/feature-shell').then((m) => m.fleetRoutes) },
      { path: 'inventory', loadChildren: () => import('@fleetline/inventory/feature-shell').then((m) => m.inventoryRoutes) },
      { path: 'inbox', loadChildren: () => import('@fleetline/notifications/feature-shell').then((m) => m.inboxRoutes) },
      { path: '', pathMatch: 'full', redirectTo: 'maintenance/planning' },
    ],
  },
];
```

`apps/ops-portal/src/app/app.config.ts`

```ts
import type { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { authInterceptor } from '@fleetline/identity/data-access';
import { API_BASE_URL } from '@fleetline/shared/data-access-http';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideStore(),
    provideEffects(),
    provideStoreDevtools({ maxAge: 50 }),
    { provide: API_BASE_URL, useValue: environment.apiUrl },
  ],
};
```

Angular 22の新しいアプリケーションはzone.jsなしで動き、`HttpClient`はFetch APIを使うので、設定には`provideZonelessChangeDetection()`も`withFetch()`も必要ありません。アプリケーションはこれで全部です。2つのファイルと`environment`だけです。`backoffice`は同じ`maintenance/feature-shell`を別のレイアウトでマウントします。3つ目のアプリケーションも午後のうちに作れるでしょう。

## 12. ReactとNext.js

このアーキテクチャはAngularに依存しません。ライブラリ、型、ドメイン、タグ、lintルールはそのままです。NxはReactとNext.jsのプロジェクトを`@nx/react`と`@nx/next`で生成します。変わるのは各ライブラリの型の実装方法です。またNext.jsでは、サーバーでのみ動くコードという新しい次元が1つ加わります。

状態は2種類に分けます。**サーバーの状態**、つまりバックエンドが所有するデータ（作業指示の一覧）は**TanStack Query**が保持します。**クライアントの状態**、つまりブラウザーにしか存在しないもの（フィルター条件、選択、下書き）は**Zustand**が保持します。どちらも`data-access`の非公開部分で、featureに見えるのはファサードだけです。

同じワークスペースを Next.js アプリケーションで構成した場合の、このユースケースのすべてのファイルです。

```tree
fleetline/
├── nx.json
├── package.json
├── tsconfig.base.json
├── eslint.config.mjs
├── apps/
│   └── customer/
│       ├── project.json
│       ├── next.config.js
│       ├── tsconfig.json
│       ├── public/
│       └── app/
│           ├── layout.tsx
│           ├── page.tsx
│           └── maintenance/
│               ├── layout.tsx
│               └── depots/
│                   └── [depotId]/
│                       └── work-orders/
│                           ├── page.tsx
│                           └── loading.tsx
└── libs/
    ├── maintenance/
    │   ├── feature-shell/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           └── maintenance-layout.tsx
    │   ├── feature-work-orders/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-orders-route.tsx
    │   │           ├── work-orders-page.tsx
    │   │           └── work-orders-page.spec.tsx
    │   ├── ui-work-order-card/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-order-card.tsx
    │   │           ├── work-order-card.module.scss
    │   │           └── status-filter.tsx
    │   ├── data-access/
    │   │   ├── project.json
    │   │   ├── tsconfig.json
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-orders.http.ts
    │   │           ├── work-orders.queries.ts
    │   │           ├── work-orders.mutations.ts
    │   │           ├── work-orders.store.ts
    │   │           ├── work-orders.store.spec.ts
    │   │           ├── work-orders.provider.tsx
    │   │           └── use-work-orders.ts
    │   ├── data-access-server/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           └── work-orders.ts
    │   └── model/
    │       └── src/
    │           ├── index.ts
    │           └── lib/
    │               └── work-order.ts
    ├── fleet/
    │   ├── api/
    │   │   └── src/
    │   │       └── index.ts
    │   └── data-access/
    │       └── src/
    │           └── lib/
    │               ├── fleet.http.ts
    │               ├── vehicle-summary.store.ts
    │               └── vehicle-summaries.tsx
    ├── identity/
    │   └── api/
    └── shared/
        ├── data-access-query/
        │   └── src/
        │       ├── index.ts
        │       └── lib/
        │           ├── query-client.ts
        │           └── query-provider.tsx
        ├── data-access-server/
        ├── ui-design-system/
        ├── util-http/
        └── util-date/
```

### 12.1. 対応関係

| Angular | React / Next.js |
|---|---|
| `feature`コンポーネント | データを読み込むサーバーのコンテナと、それを表示するクライアントコンポーネント。どちらも`feature-*`にあり、`page.tsx`はコンテナを描画するだけ |
| `input()`/`output()`を持つ`ui`コンポーネント | propsとコールバックを持つコンポーネント |
| `shell`のルート | ファイルルートは`apps/<app>/app/`に残し、シェルライブラリはプロバイダーと権限チェック付きのドメインのレイアウトをエクスポートする |
| ルートでの`provideWorkOrders()` | シェルのレイアウト内の`<WorkOrdersProvider>` |
| サーバーのデータのためのNgRx Storeとエフェクト | TanStack Query：`queryOptions`、`useQuery`、`useMutation` |
| クライアントの状態のためのSignal Store | Zustand：ファクトリーからの`createStore`をContextで提供 |
| `createSelector` | `useStore(store, selector)`のセレクター。派生値はファサードが計算し、React Compilerがメモ化する |
| エフェクトでの`switchMap` | クエリキーと`queryFn`での`signal` |
| 楽観的なリデューサーと`assignFailed` | `useMutation`の`onMutate`と`onError` |
| ファサードのサービス | フック：`useWorkOrders()` |
| `HttpClient`を使う`@Service()` | `shared/util-http`の`createApiClient`の上に関数を並べたモジュール |
| `inject()` | `use()`で読むContext。スコープを持つものだけ |
| `provideStoreDevtools` | Zustandの`devtools`ミドルウェアとReact Query Devtools |

Redux Toolkitもこのアーキテクチャに合います。NgRxのフィーチャーの代わりにスライス、`createEntityAdapter`、エフェクトの代わりにリスナーミドルウェアを使います。FleetlineがTanStack QueryとZustandを選んだのは、Next.jsでは状態の大半がサーバーの状態で、クライアント側に残るものは小さいからです（セクション17）。

### 12.2. サーバーとクライアントのタグ

App Routerでは、ファイルはサーバーコンポーネントかクライアントコンポーネントのどちらかです。シークレット、cookie、データベースを読むコードが、ブラウザーのバンドルに入ってはなりません。Fleetlineでは、ドメインごとに2つ目のdata-accessライブラリと、もう1つのタグを加えています。

| ライブラリ | タグ | 含むもの |
|---|---|---|
| `maintenance/data-access` | `type:data-access`、`platform:client` | HTTPクライアント、TanStack Queryのクエリとミューテーション、Zustandのストア、プロバイダー、ファサードのフック |
| `maintenance/data-access-server` | `type:data-access`、`platform:server` | `server-only`のfetch関数とサーバーアクション |

セクション8.2のlintルールには、すでに`platform:client` → `platform:server`禁止の制約が入っています。さらに、サーバー専用のファイルはすべて`import 'server-only'`で始まります。そのため、lintが実行されない場所でも、誤りはビルドで失敗します。`feature`ライブラリには`platform`タグがありません。そのサーバーのコンテナは`data-access-server`をインポートし、クライアントコンポーネントは`data-access`だけをインポートします。

### 12.3. HTTPとクエリクライアント

ReactにはDIがないので、HTTPサービスは普通のモジュールです。`shared/util-http`の`createApiClient`は、フレームワークに依存しない`fetch`の薄いラッパーで、ベースURL、JSON、例外としてのHTTPエラーを扱います。モジュールが保持するのは設定だけで、ユーザーのデータは決して保持しないので、モジュールレベルに置けます。

`libs/maintenance/data-access/src/lib/work-orders.http.ts`

```ts
import { createApiClient } from '@fleetline/shared/util-http';
import type { WorkOrder } from '@fleetline/maintenance/model';

const api = createApiClient(process.env.NEXT_PUBLIC_API_URL ?? '');

export const workOrdersHttp = {
  list: (depotId: string, signal?: AbortSignal) =>
    api.get<WorkOrder[]>(`/depots/${depotId}/work-orders`, { signal }),
  assign: (id: string, assigneeId: string) =>
    api.put<WorkOrder>(`/work-orders/${id}/assignee`, { assigneeId }),
};
```

設定とは違い、クエリのキャッシュはユーザーのデータを保持します。そのため`QueryClient`はプロバイダーの中で作ります。ブラウザーではタブごとに1つ、サーバーではリクエストごとに別のものです。アプリケーションのルートレイアウトは`QueryProvider`を1回だけマウントします。Angularの`app.config.ts`での`provideHttpClient()`と同じです。

`libs/shared/data-access-query/src/lib/query-client.ts`

```ts
import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
}
```

`libs/shared/data-access-query/src/lib/query-provider.tsx`

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from './query-client';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

### 12.4. クエリとミューテーション

`libs/maintenance/data-access/src/lib/work-orders.queries.ts`

```ts
import { queryOptions } from '@tanstack/react-query';
import { workOrdersHttp } from './work-orders.http';

export const workOrdersQuery = (depotId: string) =>
  queryOptions({
    queryKey: ['maintenance', 'work-orders', depotId],
    queryFn: ({ signal }) => workOrdersHttp.list(depotId, signal),
  });
```

キーには`depotId`が含まれ、`queryFn`は`signal`を`fetch`に渡します。デポを変えると古いクエリは破棄され、そのリクエストは中断されます。これがセクション9.4の`switchMap`のセマンティクスです。同じキーを読む2つのコンポーネントは、1つのリクエストと1つのキャッシュエントリーを共有します。`workOrdersQuery`はサーバーのコンテナもインポートするので（セクション12.7）、このファイルには`'use client'`がありません。

`libs/maintenance/data-access/src/lib/work-orders.mutations.ts`

```ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workOrdersHttp } from './work-orders.http';
import { workOrdersQuery } from './work-orders.queries';

export function useAssignWorkOrder(depotId: string) {
  const client = useQueryClient();
  const { queryKey } = workOrdersQuery(depotId);

  return useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string }) => workOrdersHttp.assign(id, assigneeId),
    onMutate: async ({ id, assigneeId }) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData(queryKey);
      client.setQueryData(queryKey, (orders) =>
        orders?.map((order) => (order.id === id ? { ...order, assigneeId } : order)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => client.setQueryData(queryKey, context?.previous),
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
}
```

セクション9.3と同じ楽観的更新です。`onMutate`は新しい整備士をすぐに書き込み、`onError`は以前の一覧を復元し、`onSettled`はサーバーから状態を取り直します。ミューテーション同士は互いを中断しないので、2枚のカードでの2つの割り当てはどちらも完了します。`mergeMap`と同じです。

### 12.5. Zustandでのクライアントの状態

`libs/maintenance/data-access/src/lib/work-orders.store.ts`

```ts
import { createStore } from 'zustand/vanilla';
import { devtools } from 'zustand/middleware';
import type { WorkOrderFilter } from '@fleetline/maintenance/model';

type Criteria = Omit<WorkOrderFilter, 'depotId'>;

export interface WorkOrdersClientState {
  criteria: Criteria;
  filterChanged: (change: Partial<Criteria>) => void;
}

export function createWorkOrdersStore() {
  return createStore<WorkOrdersClientState>()(
    devtools(
      (set) => ({
        criteria: { status: 'all', query: '' },
        filterChanged: (change) =>
          set((state) => ({ criteria: { ...state.criteria, ...change } }), undefined, 'Work Orders Page/filterChanged'),
      }),
      { name: 'maintenance/work-orders' },
    ),
  );
}

export type WorkOrdersStore = ReturnType<typeof createWorkOrdersStore>;
```

Zustandが保持するのは、クライアントが所有するもの、つまりフィルター条件だけです。作業指示の一覧はクエリのキャッシュにあり、ここにはコピーしません。2つの情報源は遅かれ早かれ食い違うからです。アクションはセクション9.2のイベントのように名付け（`setFilter`ではなく`filterChanged`）、`set`の第3引数がそのイベントをRedux DevToolsに記録します。そのため、リデューサーがなくてもイベントログは残ります。

ストアはモジュールレベルの`create()`ではなく、`createStore`のファクトリーから作ります。Next.jsでグローバルなストアを使うと、サーバー上ではすべてのリクエスト、つまりすべてのユーザーで共有されてしまいます。ファクトリーを呼ぶのはプロバイダーです。

`libs/maintenance/data-access/src/lib/work-orders.provider.tsx`

```tsx
'use client';

import { createContext, use, useState, type ReactNode } from 'react';
import { createWorkOrdersStore, type WorkOrdersStore } from './work-orders.store';

const WorkOrdersStoreContext = createContext<WorkOrdersStore | null>(null);

export function WorkOrdersProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createWorkOrdersStore);
  return <WorkOrdersStoreContext value={store}>{children}</WorkOrdersStoreContext>;
}

export function useWorkOrdersStore(): WorkOrdersStore {
  const store = use(WorkOrdersStoreContext);
  if (!store) throw new Error('useWorkOrdersStore must be used inside <WorkOrdersProvider>');
  return store;
}
```

`WorkOrdersProvider`は`provideWorkOrders()`に相当します。シェルのレイアウトがマウントするので（セクション12.8）、ストアはmaintenanceのルートがある場所にちょうど存在します。React 19はコンテキストを直接プロバイダーとして描画し、`use()`で読みます。

### 12.6. ファサードのフック

`libs/maintenance/data-access/src/lib/use-work-orders.ts`

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { isOverdue, matchesFilter, type WorkOrder } from '@fleetline/maintenance/model';
import { toErrorMessage } from '@fleetline/shared/util-http';
import { useAssignWorkOrder } from './work-orders.mutations';
import { useWorkOrdersStore } from './work-orders.provider';
import { workOrdersQuery } from './work-orders.queries';

export function useWorkOrders(depotId: string) {
  const store = useWorkOrdersStore();
  const criteria = useStore(store, (state) => state.criteria);
  const filterChanged = useStore(store, (state) => state.filterChanged);
  const query = useQuery(workOrdersQuery(depotId));
  const assignment = useAssignWorkOrder(depotId);

  const all = query.data ?? [];
  const filter = { ...criteria, depotId };
  const failure = query.error ?? assignment.error;

  return {
    visible: all.filter((order) => matchesFilter(order, filter)),
    overdueCount: all.filter((order) => isOverdue(order, new Date())).length,
    filter,
    loading: query.isPending,
    error: failure ? toErrorMessage(failure) : null,
    filterBy: filterChanged,
    assign: (order: WorkOrder, assigneeId: string) => assignment.mutate({ id: order.id, assigneeId }),
  };
}
```

このフックは、`open()`を除いてAngularのファサードと同じメンバーを持ちます。クエリは`depotId`をキーにしているので、開く必要がありません。ファサードには副作用がありません。マウント時に何も登録せず、何も送信しないので、ヘッダーにある期限切れの作業指示のカウンターなど、いくつのコンポーネントからでも2回目のリクエストなしで使えます。

ストアのフィールドごとに別々のセレクターを使います。Zustand 5では、新しいオブジェクトを返すセレクターには`useShallow`が必要で、そうしないと描画が無限ループになります。`visible`と`overdueCount`は描画のたびに計算されます。React Compilerがそれらを自動でメモ化するので、ファサードに`useMemo`や`useCallback`は不要です。

`libs/maintenance/data-access/src/index.ts`

```ts
export { workOrdersQuery } from './lib/work-orders.queries';
export { WorkOrdersProvider } from './lib/work-orders.provider';
export { useWorkOrders } from './lib/use-work-orders';
```

エクスポートは3つです。Zustandのストア、ミューテーション、HTTPクライアントは非公開です。

### 12.7. feature、ui、ルート

featureには2つのコンテナがあります。`WorkOrdersRoute`はサーバーコンポーネントで、ユーザーのcookieを使って`data-access-server`経由で作業指示を読み込み、`HydrationBoundary`でクエリのキャッシュに渡します。`WorkOrdersPage`はクライアントコンポーネントで、ファサードを読み、`ui`ライブラリを組み合わせます。

`libs/maintenance/feature-work-orders/src/lib/work-orders-route.tsx`

```tsx
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { workOrdersQuery } from '@fleetline/maintenance/data-access';
import { listWorkOrders } from '@fleetline/maintenance/data-access-server';
import { makeQueryClient } from '@fleetline/shared/data-access-query';
import { WorkOrdersPage } from './work-orders-page';

export async function WorkOrdersRoute({ depotId }: { depotId: string }) {
  const client = makeQueryClient();
  await client.prefetchQuery({ ...workOrdersQuery(depotId), queryFn: () => listWorkOrders(depotId) });

  return (
    <HydrationBoundary state={dehydrate(client)}>
      <WorkOrdersPage depotId={depotId} />
    </HydrationBoundary>
  );
}
```

`libs/maintenance/data-access-server/src/lib/work-orders.ts`

```ts
import 'server-only';
import { apiFetch } from '@fleetline/shared/data-access-server';
import type { WorkOrder } from '@fleetline/maintenance/model';

export function listWorkOrders(depotId: string): Promise<WorkOrder[]> {
  return apiFetch<WorkOrder[]>(`/depots/${depotId}/work-orders`);
}
```

ブラウザーでの最初の描画にはすでにデータがあり、2回目のリクエストもスピナーもありません。アプリケーションの`loading.tsx`が見えるのは、サーバーで取得している間だけです。

`libs/maintenance/feature-work-orders/src/lib/work-orders-page.tsx`

```tsx
'use client';

import { useWorkOrders } from '@fleetline/maintenance/data-access';
import { StatusFilter, WorkOrderCard } from '@fleetline/maintenance/ui-work-order-card';
import { useVehicleSummaries } from '@fleetline/fleet/api';
import { EmptyState, Spinner } from '@fleetline/shared/ui-design-system';

export function WorkOrdersPage({ depotId }: { depotId: string }) {
  const workOrders = useWorkOrders(depotId);
  const vehicles = useVehicleSummaries(workOrders.visible.map((order) => order.vehicleId));

  return (
    <>
      <h1>
        Work orders <small>{workOrders.overdueCount} overdue</small>
      </h1>
      <StatusFilter
        status={workOrders.filter.status}
        query={workOrders.filter.query}
        onStatusChange={(status) => workOrders.filterBy({ status })}
        onQueryChange={(query) => workOrders.filterBy({ query })}
      />
      {workOrders.loading ? (
        <Spinner />
      ) : workOrders.visible.length === 0 ? (
        <EmptyState title="No work orders match this filter" />
      ) : (
        workOrders.visible.map((order) => (
          <WorkOrderCard
            key={order.id}
            workOrder={order}
            vehicleLabel={vehicles[order.vehicleId]?.plate ?? ''}
            onAssign={(assigneeId) => workOrders.assign(order, assigneeId)}
          />
        ))
      )}
    </>
  );
}
```

`libs/maintenance/ui-work-order-card/src/lib/work-order-card.tsx`

```tsx
import { isOverdue, type WorkOrder } from '@fleetline/maintenance/model';
import { Badge, MechanicPicker } from '@fleetline/shared/ui-design-system';
import { formatRelative } from '@fleetline/shared/util-date';
import styles from './work-order-card.module.scss';

interface WorkOrderCardProps {
  workOrder: WorkOrder;
  vehicleLabel: string;
  onAssign: (assigneeId: string) => void;
}

export function WorkOrderCard({ workOrder, vehicleLabel, onAssign }: WorkOrderCardProps) {
  const overdue = isOverdue(workOrder, new Date());

  return (
    <article className={overdue ? `${styles.card} ${styles['card--overdue']}` : styles.card}>
      <header>
        <h3>{workOrder.title}</h3>
        <Badge tone={workOrder.priority === 'urgent' ? 'danger' : 'neutral'}>{workOrder.priority}</Badge>
      </header>
      <p className={styles.vehicle}>{vehicleLabel}</p>
      <p className={styles.due}>{formatRelative(workOrder.dueAt)}</p>
      <MechanicPicker depotId={workOrder.depotId} value={workOrder.assigneeId} onChange={onAssign} />
    </article>
  );
}
```

`work-order-card.module.scss`はセクション6.3のファイルです。CSS Modulesは`.card`をアプリケーション全体で一意な名前に置き換えるので、あるライブラリのクラスが別のライブラリに漏れ出すことはありません。

アプリケーションのルートファイルはそれぞれ数行です。

`apps/customer/app/maintenance/layout.tsx`

```tsx
import type { ReactNode } from 'react';
import { MaintenanceLayout } from '@fleetline/maintenance/feature-shell';

export default function Layout({ children }: { children: ReactNode }) {
  return <MaintenanceLayout>{children}</MaintenanceLayout>;
}
```

`apps/customer/app/maintenance/depots/[depotId]/work-orders/page.tsx`

```tsx
import { WorkOrdersRoute } from '@fleetline/maintenance/feature-work-orders';

export default async function Page({ params }: { params: Promise<{ depotId: string }> }) {
  const { depotId } = await params;
  return <WorkOrdersRoute depotId={depotId} />;
}
```

### 12.8. シェルと別ドメインのAPI

シェルのレイアウトはサーバーコンポーネントです。まずサーバー側で権限を確認し、そのあとドメインのプロバイダーをマウントします。Angularでは、ルートの`canActivate`と`providers`がこれを行います（セクション11.3）。

`libs/maintenance/feature-shell/src/lib/maintenance-layout.tsx`

```tsx
import type { ReactNode } from 'react';
import { WorkOrdersProvider } from '@fleetline/maintenance/data-access';
import { VehicleSummaryProvider } from '@fleetline/fleet/api';
import { requirePermission } from '@fleetline/identity/api';

export async function MaintenanceLayout({ children }: { children: ReactNode }) {
  await requirePermission('maintenance:read');

  return (
    <VehicleSummaryProvider>
      <WorkOrdersProvider>{children}</WorkOrdersProvider>
    </VehicleSummaryProvider>
  );
}
```

Next.jsのレイアウトはmaintenanceのページ間の遷移ではアンマウントされないので、ストアはドメイン内のナビゲーションを生き延び、プランナーがドメインを離れると消えます。

`fleet/api`の`useVehicleSummaries`は、セクション7.1の`VehicleSummaryStore`に相当するものをZustandで書いたものです。maintenanceがIDの一覧を渡し、fleetが足りないナンバープレートを1回のリクエストで読み込みます。

`libs/fleet/data-access/src/lib/vehicle-summary.store.ts`

```ts
import { createStore } from 'zustand/vanilla';
import type { VehicleSummary } from '@fleetline/fleet/model';
import { toErrorMessage } from '@fleetline/shared/util-http';
import { fleetHttp } from './fleet.http';

export interface VehicleSummaryState {
  entities: Record<string, VehicleSummary>;
  ensureLoaded: (ids: readonly string[]) => Promise<void>;
}

export function createVehicleSummaryStore() {
  return createStore<VehicleSummaryState>()((set, get) => ({
    entities: {},
    ensureLoaded: async (ids) => {
      const missing = [...new Set(ids)].filter((id) => !get().entities[id]);
      if (missing.length === 0) return;
      try {
        const vehicles = await fleetHttp.summaries(missing);
        set((state) => ({
          entities: { ...state.entities, ...Object.fromEntries(vehicles.map((vehicle) => [vehicle.id, vehicle])) },
        }));
      } catch (error) {
        console.error('fleet summaries', toErrorMessage(error));
      }
    },
  }));
}

export type VehicleSummaryStore = ReturnType<typeof createVehicleSummaryStore>;
```

`libs/fleet/data-access/src/lib/vehicle-summaries.tsx`

```tsx
'use client';

import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createVehicleSummaryStore, type VehicleSummaryStore } from './vehicle-summary.store';

const VehicleSummaryContext = createContext<VehicleSummaryStore | null>(null);

export function VehicleSummaryProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createVehicleSummaryStore);
  return <VehicleSummaryContext value={store}>{children}</VehicleSummaryContext>;
}

export function useVehicleSummaries(ids: readonly string[]) {
  const store = use(VehicleSummaryContext);
  if (!store) throw new Error('useVehicleSummaries must be used inside <VehicleSummaryProvider>');
  const entities = useStore(store, (state) => state.entities);
  const key = ids.join(',');

  useEffect(() => {
    void store.getState().ensureLoaded(key ? key.split(',') : []);
  }, [store, key]);

  return entities;
}
```

エフェクトが配列ではなく`key`に依存しているのは、featureが描画のたびに新しい配列を作るからです。

`libs/fleet/api/src/index.ts`

```ts
export type { VehicleSummary, VehicleId } from '@fleetline/fleet/model';
export { VehicleSummaryProvider, useVehicleSummaries } from '@fleetline/fleet/data-access';
export { VehicleBadge } from '@fleetline/fleet/ui-vehicle-badge';
```

### 12.9. Next.js特有の落とし穴

- **`'use client'`はそれ自体が1つの境界です。** クライアントコンポーネント、プロバイダー、フックに置き、`model`や`util`、サーバーもインポートする`queryOptions`のファイルには決して置きません。
- **ストアをモジュール変数に置かないでください。** モジュールレベルでZustandの`create()`や`new QueryClient()`を使うと、サーバー上のすべてのリクエストで状態が共有されます。ストアとクエリクライアントはプロバイダーの中で作ります。
- **Zustandはサーバーのデータをコピーしません。** APIからの一覧はクエリのキャッシュにあります。ストアにそのコピーを置くと、2つ目の情報源になります。
- **「型のためだけに」サーバーライブラリをクライアントのファイルにインポートしないでください。** 型は`model`にあります。
- **サーバーアクションは`data-access-server`に属します。** featureがそれをインポートするのは、lintのタグが許す場合に限り、`data-access`の再エクスポートを通します。そうでなければ、ページがpropsとして渡します。
- **ルートファイルは薄く保ちます。** ロジックが増えていく`page.tsx`は、肥大化したAngularのappコンポーネントのNext.js版です。

## 13. VueとNuxt

Vueはさらに素直に対応します。PiniaのセットアップストアはNgRx Signal Storeによく似ており、コンポーザブルはファサードの自然な形だからです。NxはVueとNuxtのプロジェクトを`@nx/vue`と`@nx/nuxt`でビルドします。

同じワークスペースを Nuxt アプリケーションで構成した場合の、このユースケースのすべてのファイルです。

```tree
fleetline/
├── nx.json
├── package.json
├── tsconfig.base.json
├── eslint.config.mjs
├── apps/
│   └── backoffice/
│       ├── project.json
│       ├── nuxt.config.ts
│       ├── tsconfig.json
│       ├── public/
│       └── app/
│           ├── app.vue
│           ├── layouts/
│           │   ├── default.vue
│           │   └── maintenance.vue
│           ├── middleware/
│           │   └── maintenance-read.ts
│           └── pages/
│               ├── index.vue
│               └── maintenance/
│                   └── depots/
│                       └── [depotId]/
│                           └── work-orders.vue
└── libs/
    ├── maintenance/
    │   ├── feature-shell/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── MaintenanceLayout.vue
    │   │           └── require-maintenance-read.ts
    │   ├── feature-work-orders/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── WorkOrdersPage.vue
    │   │           └── WorkOrdersPage.spec.ts
    │   ├── ui-work-order-card/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── WorkOrderCard.vue
    │   │           └── StatusFilter.vue
    │   ├── data-access/
    │   │   ├── project.json
    │   │   ├── tsconfig.json
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-orders.http.ts
    │   │           ├── work-orders.store.ts
    │   │           ├── work-orders.store.spec.ts
    │   │           ├── work-orders.providers.ts
    │   │           └── use-work-orders.ts
    │   └── model/
    │       └── src/
    │           ├── index.ts
    │           └── lib/
    │               └── work-order.ts
    ├── fleet/
    │   ├── api/
    │   │   └── src/
    │   │       └── index.ts
    │   └── data-access/
    │       └── src/
    │           └── lib/
    │               ├── vehicle-summary.store.ts
    │               └── use-vehicle-summaries.ts
    ├── identity/
    │   └── api/
    └── shared/
        ├── ui-design-system/
        ├── ui-layout/
        ├── util-http/
        └── util-date/
```

### 13.1. 対応関係

| Angular | Vue / Nuxt |
|---|---|
| `feature`コンポーネント | `feature-*`の単一ファイルコンポーネント。`apps/<app>/app/pages/`のページはそれを描画するだけ |
| `ui`コンポーネント | `defineProps`と`defineEmits`を持つコンポーネント。スタイルは`<style scoped>` |
| `shell`のルート | ファイルルートはアプリに残し、シェルライブラリはレイアウトとルートミドルウェアをエクスポートし、アプリはそれを再エクスポートするだけ |
| ルートでの`provideWorkOrders()` | シェルのレイアウト内で呼ぶ`provideWorkOrders()` |
| NgRx Store / Signal Store | Pinia（セットアップストア） |
| セレクター | ストア内の`computed` |
| エフェクト | ストアの非同期アクション。サーバーレンダリング中の読み込みには`useAsyncData` |
| エフェクトでの`switchMap` | ストアのアクション内の`AbortController` |
| ファサードのサービス | コンポーザブル：`useWorkOrders()` |
| `HttpClient`を使う`@Service()` | `$fetch.create`と`useRuntimeConfig()`を使うコンポーザブル`useWorkOrdersHttp()` |
| `provideStoreDevtools` | PiniaタブのあるVue DevTools |

Piniaにはアクションとリデューサーの分離がありません。そのためNgRxのイベントログとタイムトラベルデバッグはなくなりますが、儀式的な記述の大半もなくなります。アーキテクチャにとっては何も変わりません。ストアは`data-access`の非公開物であり、コンポーザブルが扉です。

### 13.2. ライブラリの自動インポートを無効にする

Nuxtはコンポーネントとコンポーザブルを自動でインポートします。小さなアプリでは便利ですが、境界にとっては致命的です。**書かれていないインポートはlintできません。** billingのfeatureが`import`行なしに`useWorkOrders()`を使えるなら、lintルールは境界の越境を目にすることがありません。

FleetlineのNuxtアプリケーションでのルール：

- ライブラリはパスエイリアスを通した明示的な`import`文でインポートし、自動インポートのディレクトリとして登録することは決してしない。
- ドメインをNuxtのレイヤーにはしない。レイヤーはそのコンポーネントとコンポーザブルをアプリに自動インポートするからである。
- アプリはVueとNuxtのAPIの自動インポートを自身の`pages/`と`layouts/`でだけ使い、ライブラリのコードはNuxtの関数を`#imports`からインポートする。
- ページが`definePageMeta`で名前によって参照するレイアウトとミドルウェアは、アプリ内では`feature-shell`からの1行の再エクスポートにする（セクション13.5）。文字列の中の名前はlintが確認できないからである。

`apps/backoffice/nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
  components: { dirs: [] },
  imports: { scan: false },
  css: ['../../libs/shared/ui-design-system/src/styles/tokens.scss'],
  runtimeConfig: { public: { apiUrl: '' } },
});
```

### 13.3. ストア

HTTPサービスはコンポーザブルです。設定はアプリケーションの`runtimeConfig`、つまりNuxtのDIから取得します。Angularの`WorkOrdersHttp`が`API_BASE_URL`を`inject()`から取得するのと同じです。

`libs/maintenance/data-access/src/lib/work-orders.http.ts`

```ts
import { useRuntimeConfig } from '#imports';
import type { WorkOrder } from '@fleetline/maintenance/model';

export function useWorkOrdersHttp() {
  const api = $fetch.create({ baseURL: useRuntimeConfig().public.apiUrl });

  return {
    list: (depotId: string, signal?: AbortSignal) => api<WorkOrder[]>(`/depots/${depotId}/work-orders`, { signal }),
    assign: (id: string, assigneeId: string) =>
      api<WorkOrder>(`/work-orders/${id}/assignee`, { method: 'PUT', body: { assigneeId } }),
  };
}
```

`libs/maintenance/data-access/src/lib/work-orders.store.ts`

```ts
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  byDueDate, emptyFilter, isOverdue, matchesFilter,
  type WorkOrder, type WorkOrderFilter,
} from '@fleetline/maintenance/model';
import { toErrorMessage } from '@fleetline/shared/util-http';
import { useWorkOrdersHttp } from './work-orders.http';

export const useWorkOrdersStore = defineStore('maintenance/work-orders', () => {
  const http = useWorkOrdersHttp();

  const byId = ref<Record<string, WorkOrder>>({});
  const filter = ref<WorkOrderFilter>({ ...emptyFilter });
  const error = ref<string | null>(null);
  let inflight: AbortController | undefined;

  const all = computed(() => Object.values(byId.value).sort(byDueDate));
  const visible = computed(() => all.value.filter((order) => matchesFilter(order, filter.value)));
  const overdueCount = computed(() => all.value.filter((order) => isOverdue(order, new Date())).length);

  async function open(depotId: string) {
    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    filter.value = { ...emptyFilter, depotId };
    error.value = null;
    try {
      const orders = await http.list(depotId, controller.signal);
      byId.value = Object.fromEntries(orders.map((order) => [order.id, order]));
    } catch (cause) {
      if (!controller.signal.aborted) error.value = toErrorMessage(cause);
    }
  }

  function filterBy(change: Partial<Omit<WorkOrderFilter, 'depotId'>>) {
    filter.value = { ...filter.value, ...change };
  }

  async function assign(id: string, assigneeId: string) {
    const order = byId.value[id];
    if (!order) return;
    byId.value[id] = { ...order, assigneeId };
    try {
      byId.value[id] = await http.assign(id, assigneeId);
    } catch (cause) {
      byId.value[id] = order;
      error.value = toErrorMessage(cause);
    }
  }

  function $reset() {
    inflight?.abort();
    byId.value = {};
    filter.value = { ...emptyFilter };
    error.value = null;
  }

  return { byId, filter, error, visible, overdueCount, open, filterBy, assign, $reset };
});
```

`open`は新しいリクエストを送る前に、前のリクエストを中断します。これはセクション9.4の`switchMap`を手で書いたものです。これがないと、デポを素早く切り替えたときに古いレスポンスが新しいものを上書きしかねません。`assign`は`mergeMap`と同じく何も中断せず、エラー時には覚えておいた作業指示を復元します。エラーはストアが捕まえて`error`に書き込みます。セクション9.3のリデューサーと同じです。

`byId`、`filter`、`error`を返しているのは、Piniaがそれらをサーバーレンダリングのペイロードにシリアライズし、ブラウザーが同じ状態から始められるようにするためです。`inflight`は返さないので、ストアのインスタンスに閉じたままです。セットアップストアには`$reset`が自動では付かないので、自分で定義します。

### 13.4. ファサードのコンポーザブルとストアのスコープ

`libs/maintenance/data-access/src/lib/use-work-orders.ts`

```ts
import { useAsyncData } from '#imports';
import { storeToRefs } from 'pinia';
import { toValue, type MaybeRefOrGetter } from 'vue';
import type { WorkOrder } from '@fleetline/maintenance/model';
import { useWorkOrdersStore } from './work-orders.store';

export async function useWorkOrders(depotId: MaybeRefOrGetter<string>) {
  const store = useWorkOrdersStore();
  const { visible, overdueCount, filter, error } = storeToRefs(store);

  const { pending } = await useAsyncData(
    () => `maintenance:work-orders:${toValue(depotId)}`,
    () => store.open(toValue(depotId)).then(() => true),
  );

  return {
    visible,
    overdueCount,
    filter,
    error,
    loading: pending,
    filterBy: store.filterBy,
    assign: (order: WorkOrder, assigneeId: string) => store.assign(order.id, assigneeId),
  };
}
```

キーは`depotId`の関数なので、デポを切り替えると再取得されます。サーバーでは`useAsyncData`がデータを待ち、ブラウザーではページが2回目のリクエストなしにペイロードからハイドレートされます。

Piniaはストアをアプリケーションごとに1つ、サーバーではリクエストごとに1つ保持します。何もしなければ、maintenanceの状態はドメインを離れたあともメモリに残ります。`provideWorkOrders()`は、Angularのルートでのプロバイダーと同じスコープを与えます。

`libs/maintenance/data-access/src/lib/work-orders.providers.ts`

```ts
import { onUnmounted } from 'vue';
import { useWorkOrdersStore } from './work-orders.store';

export function provideWorkOrders() {
  const store = useWorkOrdersStore();
  onUnmounted(() => store.$reset());
}
```

`onUnmounted`はサーバーでは実行されないので、状態はハイドレーション前にペイロードに入り、ブラウザーではプランナーがmaintenanceを離れたときに消えます。

`libs/maintenance/data-access/src/index.ts`

```ts
export { provideWorkOrders } from './lib/work-orders.providers';
export { useWorkOrders } from './lib/use-work-orders';
```

Reactのようにサーバーの状態とクライアントの状態を分けたいチームは、Piniaの公式クエリレイヤーである**Pinia Colada**を使えます。キー、キャッシュ、楽観的なミューテーションを備えた、TanStack Queryに相当するものです。ファサードとfeatureは変わりません。

### 13.5. feature、ui、シェル、ページ

`libs/maintenance/feature-work-orders/src/lib/WorkOrdersPage.vue`

```vue
<script setup lang="ts">
import { useWorkOrders } from '@fleetline/maintenance/data-access';
import { StatusFilter, WorkOrderCard } from '@fleetline/maintenance/ui-work-order-card';
import { useVehicleSummaries } from '@fleetline/fleet/api';
import { EmptyState, Spinner } from '@fleetline/shared/ui-design-system';

const { depotId } = defineProps<{ depotId: string }>();

const { visible, overdueCount, filter, loading, filterBy, assign } = await useWorkOrders(() => depotId);
const vehicles = useVehicleSummaries(() => visible.value.map((order) => order.vehicleId));
</script>

<template>
  <h1>Work orders <small>{{ overdueCount }} overdue</small></h1>
  <StatusFilter
    :status="filter.status"
    :query="filter.query"
    @update:status="(status) => filterBy({ status })"
    @update:query="(query) => filterBy({ query })"
  />
  <Spinner v-if="loading" />
  <template v-else>
    <WorkOrderCard
      v-for="order in visible"
      :key="order.id"
      :work-order="order"
      :vehicle-label="vehicles[order.vehicleId]?.plate ?? ''"
      @assign="(assigneeId) => assign(order, assigneeId)"
    />
    <EmptyState v-if="visible.length === 0" title="No work orders match this filter" />
  </template>
</template>
```

Vue 3.5は分割代入したあともpropsのリアクティビティを保つので、`() => depotId`はルートの変更を追跡します。

`libs/maintenance/ui-work-order-card/src/lib/WorkOrderCard.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { isOverdue, type WorkOrder } from '@fleetline/maintenance/model';
import { Badge, MechanicPicker } from '@fleetline/shared/ui-design-system';
import { formatRelative } from '@fleetline/shared/util-date';

const { workOrder, vehicleLabel } = defineProps<{ workOrder: WorkOrder; vehicleLabel: string }>();
const emit = defineEmits<{ assign: [assigneeId: string] }>();

const overdue = computed(() => isOverdue(workOrder, new Date()));
</script>

<template>
  <article class="card" :class="{ 'card--overdue': overdue }">
    <header>
      <h3>{{ workOrder.title }}</h3>
      <Badge :tone="workOrder.priority === 'urgent' ? 'danger' : 'neutral'">{{ workOrder.priority }}</Badge>
    </header>
    <p class="vehicle">{{ vehicleLabel }}</p>
    <p class="due">{{ formatRelative(workOrder.dueAt) }}</p>
    <MechanicPicker
      :depot-id="workOrder.depotId"
      :model-value="workOrder.assigneeId"
      @update:model-value="(id) => emit('assign', id)"
    />
  </article>
</template>

<style scoped lang="scss">
.card {
  display: grid;
  gap: var(--ds-space-2);
  padding: var(--ds-space-3);
  border-radius: var(--ds-radius);
  background: var(--ds-surface);
  color: var(--ds-text);
}

.card--overdue {
  border-left: 4px solid var(--ds-danger);
}

.vehicle,
.due {
  color: var(--ds-text-muted);
}
</style>
```

シェルは、`provideWorkOrders()`を呼ぶレイアウトと、権限の条件を持つミドルウェアをエクスポートします。

`libs/maintenance/feature-shell/src/lib/MaintenanceLayout.vue`

```vue
<script setup lang="ts">
import { provideWorkOrders } from '@fleetline/maintenance/data-access';
import { AppLayout } from '@fleetline/shared/ui-layout';

provideWorkOrders();
</script>

<template>
  <AppLayout>
    <slot />
  </AppLayout>
</template>
```

`libs/maintenance/feature-shell/src/lib/require-maintenance-read.ts`

```ts
import { abortNavigation, defineNuxtRouteMiddleware } from '#imports';
import { hasPermission } from '@fleetline/identity/api';

export const requireMaintenanceRead = defineNuxtRouteMiddleware(() => {
  if (!hasPermission('maintenance:read')) return abortNavigation({ statusCode: 403 });
});
```

アプリケーションはそれらを再エクスポートするだけなので、`feature-shell`からのインポートがlintに見えます。

`apps/backoffice/app/layouts/maintenance.vue`

```vue
<script setup lang="ts">
import { MaintenanceLayout } from '@fleetline/maintenance/feature-shell';
</script>

<template>
  <MaintenanceLayout>
    <slot />
  </MaintenanceLayout>
</template>
```

`apps/backoffice/app/middleware/maintenance-read.ts`

```ts
export { requireMaintenanceRead as default } from '@fleetline/maintenance/feature-shell';
```

`apps/backoffice/app/pages/maintenance/depots/[depotId]/work-orders.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { definePageMeta, useRoute } from '#imports';
import { WorkOrdersPage } from '@fleetline/maintenance/feature-work-orders';

definePageMeta({ layout: 'maintenance', middleware: ['maintenance-read'] });

const route = useRoute();
const depotId = computed(() => String(route.params.depotId));
</script>

<template>
  <WorkOrdersPage :depot-id="depotId" />
</template>
```

Vueでの`fleet/api`の`useVehicleSummaries`は、セクション12.8と同じ`ensureLoaded`アクションを持つ小さなPiniaストアと、それを呼ぶコンポーザブルです。

`libs/fleet/data-access/src/lib/use-vehicle-summaries.ts`

```ts
import { storeToRefs } from 'pinia';
import { toValue, watch, type MaybeRefOrGetter } from 'vue';
import { useVehicleSummaryStore } from './vehicle-summary.store';

export function useVehicleSummaries(ids: MaybeRefOrGetter<readonly string[]>) {
  const store = useVehicleSummaryStore();
  watch(() => toValue(ids).join(','), (key) => store.ensureLoaded(key ? key.split(',') : []), { immediate: true });
  return storeToRefs(store).entities;
}
```

### 13.6. Nuxt特有の落とし穴

- **`.vue`ファイルのlint**には、ESLintの設定に`vue-eslint-parser`が必要です。ないと、境界ルールはすべてのコンポーネントを黙ってスキップします。セクション8.2の`files`パターンに`**/*.vue`が含まれているのはこのためです。
- **リクエストごとに1つのストア。** `@pinia/nuxt`を使うPiniaは、サーバーでリクエストごとにすでに1つ作成します。ライブラリのモジュールレベルの`ref`に状態を持たせてはいけません。サーバーではユーザー間で共有されてしまいます。
- **`useAsyncData`はストアではなくファサードに属します。** これでストアはテストからもクライアント専用のコードからも使えるままになります。
- **`<script setup>`のトップレベルの`await`**には、コンポーネントの上に`<Suspense>`が必要です。Nuxtのページにはすでにありますが、ほかの場所で描画するfeatureのコンポーネントはそれで包む必要があります。
- **スタイルは`scoped`だけにしてください。** ライブラリ内の`scoped`なしの`<style>`ブロックは、アプリケーション全体のグローバルCSSに入ります。

## 14. 並べて比較する

:::diagram fe-frameworks

3つのフレームワークでの同じユースケースを、ファイルごとに示します。

| ライブラリ | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| `model` | `work-order.ts` | 同じファイル | 同じファイル |
| `data-access`の状態 | `createFeature` + `createEntityAdapter` | TanStack Query（サーバー）+ Zustand（クライアント） | Piniaのセットアップストア |
| `data-access`のエフェクト | 関数型の`createEffect` | `queryFn`と`useMutation` | ストアの非同期アクション + `useAsyncData` |
| 並行処理 | `switchMap` / `mergeMap` | クエリキー + `signal` | `AbortController` |
| HTTPサービス | `@Service()` + `HttpClient` | `createApiClient`の上のモジュール | `$fetch.create`を使うコンポーザブル |
| `data-access`のファサード | `WorkOrdersFacade`（シグナル） | `useWorkOrders()`（値） | `useWorkOrders()`（ref） |
| 状態のスコープ | ルートでの`provideWorkOrders()` | シェルのレイアウト内の`<WorkOrdersProvider>` | シェルのレイアウト内の`provideWorkOrders()` |
| `ui` | `input()` / `output()` | props / コールバック | `defineProps` / `defineEmits` |
| `ui`のスタイル | `styleUrl`、エミュレートされたカプセル化 | CSS Modules | `<style scoped>` |
| `feature` | スタンドアロンコンポーネント、デフォルトで`OnPush` | サーバーのコンテナ + クライアントコンポーネント | 単一ファイルコンポーネント |
| `shell` | `providers`と`canActivate`付きの`Routes` | プロバイダー付きのサーバーのレイアウト | レイアウト + ルートミドルウェア |
| アプリのルート | `loadChildren` | `page.tsx` | `pages/*.vue` |
| テストでのファサードの偽物 | `TestBed`のプロバイダー | モジュールの`vi.mock` | モジュールの`vi.mock` |
| 境界 | `@nx/enforce-module-boundaries` | 同じルール | 同じルール（`vue-eslint-parser`付き） |

3つすべてで同一のもの：すべてのファイルのフォルダー、タグ、lintルール、`model`ライブラリ、ファサードのメンバー（Reactでは`open()`なし。クエリが自分で開くため）、コンポーネントのスタイル、そして`model`ライブラリのテストです。Fleetlineのアプリ間を行き来する開発者が学び直すのは、フレームワークそのものだけです。

## 15. ライブラリの型ごとのテスト

それぞれの型には自然なテストの種類があり、境界があるおかげでどれも安く済みます。

| 型 | テスト | 速度 | 偽物にするもの |
|---|---|---|---|
| `model`、`util` | フレームワークなしの単純な単体テスト | ミリ秒 | なし |
| `data-access`のリデューサー、セレクター | 純粋関数のテスト | ミリ秒 | なし |
| `data-access`のエフェクト、クエリ、ミューテーション | MSWでネットワークを差し替えたテスト | 速い | HTTP |
| ファサード | 本物のストアとの結合テスト | 速い | HTTP（MSW） |
| `ui` | コンポーネントテスト、Storybookのストーリー | 速い | なし。入力しか持たない |
| `feature` | 偽のファサードを使うコンポーネントテスト | 速い | ファサード |
| アプリ | Playwrightによるエンドツーエンドテスト、少数のフロー | 遅い | バックエンド、またはなし |

リデューサーのテストにはTestBedは要りません。

```ts
import { describe, expect, it } from 'vitest';
import { workOrdersApi, workOrdersPage } from './work-orders.events';
import { workOrdersFeature } from './work-orders.feature';
import { aWorkOrder } from '@fleetline/maintenance/model/testing';

describe('work orders reducer', () => {
  it('puts the previous mechanic back when an assignment fails', () => {
    const order = aWorkOrder({ id: 'wo-1', assigneeId: 'mech-1' });
    const loaded = workOrdersFeature.reducer(undefined, workOrdersApi.loadSucceeded({ workOrders: [order] }));
    const optimistic = workOrdersFeature.reducer(
      loaded,
      workOrdersPage.assigneeChosen({ id: 'wo-1', assigneeId: 'mech-2', previousAssigneeId: 'mech-1' }),
    );
    const failed = workOrdersFeature.reducer(
      optimistic,
      workOrdersApi.assignFailed({ id: 'wo-1', previousAssigneeId: 'mech-1', error: 'conflict' }),
    );

    expect(optimistic.entities['wo-1']?.assigneeId).toBe('mech-2');
    expect(failed.entities['wo-1']?.assigneeId).toBe('mech-1');
    expect(failed.error).toBe('conflict');
  });
});
```

featureのテストでは偽のファサードを提供します。コンポーネントにはそれ以外何も見えないからです。

```ts
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect, it, vi } from 'vitest';
import { WorkOrdersFacade } from '@fleetline/maintenance/data-access';
import { VehicleSummaryStore } from '@fleetline/fleet/api';
import { aWorkOrder } from '@fleetline/maintenance/model/testing';
import { WorkOrdersPageComponent } from './work-orders-page.component';

it('assigns the chosen mechanic', async () => {
  const order = aWorkOrder({ id: 'wo-1' });
  const facade = {
    visible: signal([order]),
    overdueCount: signal(0),
    filter: signal({ depotId: 'd-1', status: 'all' as const, query: '' }),
    loading: signal(false),
    error: signal(null),
    open: vi.fn(),
    filterBy: vi.fn(),
    assign: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkOrdersFacade, useValue: facade },
      { provide: VehicleSummaryStore, useValue: { entityMap: signal({}), ensureLoaded: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(WorkOrdersPageComponent);
  fixture.componentRef.setInput('depotId', 'd-1');
  await fixture.whenStable();

  fixture.debugElement.query((el) => el.name === 'mnt-work-order-card').triggerEventHandler('assign', 'mech-7');

  expect(facade.open).toHaveBeenCalledWith('d-1');
  expect(facade.assign).toHaveBeenCalledWith(order, 'mech-7');
});
```

ReactとVueではファサードはDIで渡されないので、featureのテストはモジュールを差し替えます。原則は同じです。コンポーネントにはファサードと`ui`ライブラリ以外は何も見えません。

`libs/maintenance/feature-work-orders/src/lib/work-orders-page.spec.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { useWorkOrders } from '@fleetline/maintenance/data-access';
import { aWorkOrder } from '@fleetline/maintenance/model/testing';
import { WorkOrdersPage } from './work-orders-page';

vi.mock('@fleetline/maintenance/data-access', () => ({ useWorkOrders: vi.fn() }));
vi.mock('@fleetline/fleet/api', () => ({ useVehicleSummaries: () => ({}) }));
vi.mock('@fleetline/maintenance/ui-work-order-card', () => ({
  StatusFilter: () => null,
  WorkOrderCard: ({ onAssign }: { onAssign: (assigneeId: string) => void }) => (
    <button type="button" onClick={() => onAssign('mech-7')}>
      assign
    </button>
  ),
}));

it('assigns the chosen mechanic', async () => {
  const order = aWorkOrder({ id: 'wo-1' });
  const assign = vi.fn();
  vi.mocked(useWorkOrders).mockReturnValue({
    visible: [order],
    overdueCount: 0,
    filter: { depotId: 'd-1', status: 'all', query: '' },
    loading: false,
    error: null,
    filterBy: vi.fn(),
    assign,
  });

  render(<WorkOrdersPage depotId="d-1" />);
  await userEvent.click(screen.getByRole('button', { name: 'assign' }));

  expect(useWorkOrders).toHaveBeenCalledWith('d-1');
  expect(assign).toHaveBeenCalledWith(order, 'mech-7');
});
```

Vueでは同じテストを`@vue/test-utils`と同じ`vi.mock`で書き、`<script setup>`に`await`があるコンポーネントは`@nuxt/test-utils`の`mountSuspended`でマウントします。ファサードの結合テストでは`@pinia/testing`の`createTestingPinia`がPiniaのストアを差し替え、ネットワークは3つのフレームワークすべてでMSWが差し替えます。そのため、`data-access`のテストはHTTPサービスが設定を受け取る方法に依存しません。

`aWorkOrder`のようなテストデータビルダーは、`model`のセカンダリエントリポイント（`@fleetline/maintenance/model/testing`）に置きます。そのため、どのフレームワークのテストも同じものを使います。

## 16. 段階的な導入と移行

最初から70個のライブラリで始める人はいません。Fleetlineも、`src/app`フォルダーを持つ1つのAngularアプリケーションとして始まりました。以下の手順は、うまくいった順序です。

### 16.1. 8つのステップによる移行

1. **アプリの周りにワークスペースを作ります。** 既存のリポジトリで`nx init`を実行します。まだ何も動かしません。
2. **ドメインを紙に描きます。** ビジネスの言葉を使います。プランナー、顧客、経理は何について話しているでしょうか。ドメインは6〜10個になるはずです。それをREADMEに書きます。
3. **ルールを警告として有効にします。** セクション8.2のlint設定を`'warn'`で追加します。警告の数を数えます。それがベースラインです。
4. **まず`model`と`util`を切り出します。** 依存を持たないので移動は安全で、以降のすべてのステップがそれらを必要とします。`nx g @nx/workspace:move`を使います。
5. **ドメインごとに`ui`を切り出します。** 入力と出力しか持たないコンポーネントはすべて移します。ストアを注入するコンポーネントは今は残します。
6. **ドメインごとに`data-access`を切り分けます。** ルートストアをドメインごとに分割します。ストアの各フィーチャーとそのエフェクト、HTTPをドメインの`data-access`に移し、ドメインのルートに登録します。
7. **ページを`feature-*`に、ルートを`feature-shell`に移します。** アプリはルートとプロバイダーだけに縮みます。
8. **ルールを`'error'`に切り替え、CODEOWNERSを追加します。** これ以降、新しい越境はCIで失敗します。

ステップ4〜7はドメインごとに進め、その間もアプリケーションはリリースを続けます。Fleetlineでは移行全体に、機能開発と並行して4か月かかりました。1度に1つのドメインを扱い、手順を覚えるために最も小さいドメイン（`notifications`）から始めました。

### 16.2. よくある失敗

- **`common`や`core`という名前のドメイン。** それが新しい`shared/`になります。どの概念にもビジネス上の所有者がいます。それを見つけてください。
- **ビジネスの言葉ではなくページで切ったドメイン。** 「ダッシュボード」はドメインではありません。複数のドメインからそれぞれのAPIを通して読み取るfeatureです。
- **すべてを再エクスポートするAPIライブラリ。** それでは境界は見かけだけになります。別のチームが実際に使うものだけをエクスポートし、それ以外はエクスポートしないでください。
- **lintを無効にする行。** 境界ルールへの`eslint-disable`は、1つが1年以内に40個になります。例外は設定に書き、理由はプルリクエストに書きます。

### 16.3. ライブラリを分割するとき

- ストアのフィーチャーが3つか4つを超える、または2つのチームが所有する`data-access`：サブドメインごとに分割します。
- 1つのfeatureからしかインポートされない`ui`ライブラリ：そのfeatureに戻すか、そのまま残します。ただし`shared`には移しません。
- 互いに関係のない複数のルートを持つ`feature`：ユースケースごとに1つのライブラリにします。
- ライブラリの大半を別のチームが所有しているドメイン：ドメインの切り方か、チームの境界が間違っています。

### 16.4. これが過剰なとき

アプリケーションが1つ、チームが1つ、ドメインが1つか2つなら、完全な構成は得るものよりコストのほうが大きくなります。代わりに1つのプロジェクト内のフォルダー（`src/domains/<domain>/feature-…`、`ui-…`、`data-access`、`model`）から始め、Sheriffで強制してください（セクション8.4）。依存のルールがすでに成り立っているので、後でそれらのフォルダーをNxのライブラリに移すのは機械的な作業です。

## 17. よくある質問

**すべての状態にNgRxが必要ですか？**
いいえ。複数のfeatureが読む、共有された長く生きる状態はストアに置きます。フォームの状態、パネルの開閉、そのほか1つのコンポーネントが所有する状態は、シグナルかコンポーネント単位のSignal Storeを使ってコンポーネントに残します。

**NgRx StoreとNgRx Signal Store、どちらですか？**
どちらもこのアーキテクチャに合い、どちらも`data-access`に置かれ、ファサードがその選択を隠します。Fleetlineでは、イベントログとdevtoolsが役立つところ（整備、計画）ではStoreを、より単純なドメイン（車両の概要、通知）ではSignal Storeを使っています。Signal Storeのイベントプラグイン（`@ngrx/signals/events`）はFlux風のイベントを持ち込むので、イベントログはもはや従来のStoreを選ぶ唯一の理由ではありません。

**Angularでのサーバーの状態は？**
Angular 22では`resource`、`rxResource`、`httpResource`が安定版で、2つのリクエストが重なった場合は`switchMap`と同じく最新のものだけが反映されます。主に読み取るデータについては、これがTanStack QueryやPinia ColadaのAngular版です。`data-access`が`httpResource`を持ち、ファサードがその`value()`と`isLoading()`を公開します。featureは変わりません。

**なぜReactではRedux ToolkitではなくZustandとTanStack Queryなのですか？**
どちらの選択肢も同じ境界のルールを満たし、どちらも同じファサードの裏に隠れます。Redux ToolkitはNgRx Storeと同じもの、つまりスライス、`createEntityAdapter`、リスナーミドルウェア、完全なイベントログを提供します。しかしNext.jsでは状態の大半がサーバーの状態で、クライアント側に残るものは小さいので、Fleetlineはデータをクエリのキャッシュに置き、残りをdevtoolsに名前付きのアクションが見える小さなZustandストアに置いています。大きなクライアント側のドメインでイベントログが必要なチームは、そこでRedux Toolkitを使えます。

**ファサードは余計なレイヤーにすぎないのでは？**
そのとおりです。そしてセクション10で、いつそれが割に合うのかを説明しています。ReactとVueでは、フックやコンポーザブルがもともと状態へのアクセスを共有する慣用的な方法なので、そこではファサードのコストはほとんどかかりません。

**すべてのドメインに最初から`api`ライブラリを持たせるべきですか？**
いいえ。別のドメインが何かを初めて必要としたときに作ってください。それまでは、ドメインは完全に非公開です。これ以上の境界はありません。

**これはマイクロフロントエンドですか？**
いいえ。ここに書いたものはすべて、アプリのフォルダーごとに1つのアプリケーションとしてビルドされます。組織が独立したデプロイを必要とするようになれば、同じドメインの切り方が、後のマイクロフロントエンドの自然な継ぎ目になります。

**React、Vue、Angularは本当にライブラリを共有できますか？**
共有するのは`framework:agnostic`タグの付いた`model`と`util`のライブラリ、そしてテストデータビルダーです。コンポーネントとストアはフレームワークごとです。Fleetlineでは、フロントエンドのコードのおよそ5分の1がフレームワークに依存しません。

**さらに読むならどこですか？**
Manfred Steyerの記事と[angulararchitects.io](https://www.angulararchitects.io/)の無料電子書籍*Enterprise Angular*、モジュール境界についての[Nxのドキュメント](https://nx.dev/)、[Sheriff](https://github.com/softarc-consulting/sheriff)、[NgRxのドキュメント](https://ngrx.io/)、[TanStack Query](https://tanstack.com/query)、[Zustand](https://zustand.docs.pmnd.rs/)、そして[Pinia](https://pinia.vuejs.org/)です。
