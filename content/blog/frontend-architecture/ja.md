このガイドでは、大規模なフロントエンドの構成方法を説明します。1つのワークスペースに、多数のアプリケーションと多数のチームがあり、すべてのファイルにルールがあります。構築には**Nx**と**Angular**を使い、共有の状態は**NgRx**に置き、ストアの前に**任意のファサード**を置きます。そのうえで、同じアーキテクチャをルールごとに**React（Next.js）**と**Vue（Nuxt）**でも示します。

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
import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from '@fleetline/shared/data-access-http';
import type { WorkOrder } from '@fleetline/maintenance/model';

@Injectable({ providedIn: 'root' })
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

`libs/maintenance/data-access/src/lib/work-orders.effects.ts`

```ts
import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, mergeMap, of, switchMap } from 'rxjs';
import { toErrorMessage } from '@fleetline/shared/data-access-http';
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
import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import type { WorkOrder, WorkOrderFilter } from '@fleetline/maintenance/model';
import { workOrdersPage } from './work-orders.events';
import { workOrdersFeature } from './work-orders.feature';

@Injectable()
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

ファサードは`root`ではなく`provideWorkOrders()`で提供します。そのため、ストアのフィーチャーが存在する場所にちょうど存在します。

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
        └── util-date/
```

### 11.1. uiライブラリ

`libs/maintenance/ui-work-order-card/src/lib/work-order-card.component.ts`

```ts
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { isOverdue, type WorkOrder } from '@fleetline/maintenance/model';
import { BadgeComponent, MechanicPickerComponent } from '@fleetline/shared/ui-design-system';
import { RelativeDatePipe } from '@fleetline/shared/util-date';

@Component({
  selector: 'mnt-work-order-card',
  imports: [BadgeComponent, MechanicPickerComponent, RelativeDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
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

カードが`WorkOrder`を知っているのは、`model`が許されているからです。`vehicleLabel`を文字列として受け取るのは、maintenanceの`ui`ライブラリが`fleet/api`をインポートできないからです。

### 11.2. featureライブラリ

`libs/maintenance/feature-work-orders/src/lib/work-orders-page.component.ts`

```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { WorkOrdersFacade } from '@fleetline/maintenance/data-access';
import { StatusFilterComponent, WorkOrderCardComponent } from '@fleetline/maintenance/ui-work-order-card';
import { VehicleSummaryStore } from '@fleetline/fleet/api';
import { EmptyStateComponent, SpinnerComponent } from '@fleetline/shared/ui-design-system';

@Component({
  selector: 'mnt-work-orders-page',
  imports: [StatusFilterComponent, WorkOrderCardComponent, EmptyStateComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    provideStoreDevtools({ maxAge: 50, connectInZone: true }),
    { provide: API_BASE_URL, useValue: environment.apiUrl },
  ],
};
```

アプリケーションはこれで全部です。2つのファイルと`environment`だけです。`backoffice`は同じ`maintenance/feature-shell`を別のレイアウトでマウントします。3つ目のアプリケーションも午後のうちに作れるでしょう。

## 12. ReactとNext.js

このアーキテクチャはAngularに依存しません。ライブラリ、型、ドメイン、タグ、lintルールはそのままです。NxはReactとNext.jsのプロジェクトを`@nx/react`と`@nx/next`で生成します。変わるのは各ライブラリの型の実装方法です。またNext.jsでは、サーバーでのみ動くコードという新しい次元が1つ加わります。

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
    │   │           ├── work-orders-page.tsx
    │   │           └── work-orders-page.spec.tsx
    │   ├── ui-work-order-card/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-order-card.tsx
    │   │           ├── work-order-card.module.css
    │   │           └── status-filter.tsx
    │   ├── data-access/
    │   │   ├── project.json
    │   │   ├── tsconfig.json
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-orders.http.ts
    │   │           ├── work-orders.slice.ts
    │   │           ├── work-orders.slice.spec.ts
    │   │           ├── work-orders.listeners.ts
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
    │               └── use-vehicle-summaries.ts
    └── shared/
        ├── data-access-store/
        │   └── src/
        │       ├── index.ts
        │       └── lib/
        │           ├── store.ts
        │           └── store-provider.tsx
        ├── data-access-server/
        ├── data-access-http/
        ├── ui-design-system/
        └── util-date/
```

### 12.1. 対応関係

| Angular | React / Next.js |
|---|---|
| `feature`コンポーネント | `feature-*`からエクスポートするクライアントコンポーネント。アプリの`page.tsx`はそれを描画するだけ |
| `input()`/`output()`を持つ`ui`コンポーネント | propsとコールバックを持つコンポーネント |
| `shell`のルート | ファイルルートは`apps/<app>/app/`に残し、シェルライブラリはドメインのレイアウトとプロバイダーをエクスポートする |
| NgRx Store、`createFeature` | Redux Toolkitの`createSlice` |
| NgRx Entity | Redux Toolkitの`createEntityAdapter` |
| `createSelector` | `createSelector`（Redux Toolkitに含まれるReselect） |
| エフェクト | リスナーミドルウェア。単純な場合はthunk |
| ルートでの`provideState` | `slice.injectInto(rootReducer)`（遅延スライス） |
| Signal Store | Zustand |
| ファサードのサービス | フック：`useWorkOrders()` |
| `HttpClient` | サーバー関数での`fetch`、またはクライアントのAPIモジュール |

### 12.2. サーバーとクライアントのタグ

App Routerでは、ファイルはサーバーコンポーネントかクライアントコンポーネントのどちらかです。シークレット、cookie、データベースを読むコードが、ブラウザーのバンドルに入ってはなりません。Fleetlineでは、ドメインごとに2つ目のdata-accessライブラリと、もう1つのタグを加えています。

| ライブラリ | タグ | 含むもの |
|---|---|---|
| `maintenance/data-access` | `type:data-access`、`platform:client` | Reduxのスライス、リスナー、クライアントAPI、ファサードのフック |
| `maintenance/data-access-server` | `type:data-access`、`platform:server` | `server-only`のfetch関数とサーバーアクション |

セクション8.2のlintルールには、すでに`platform:client` → `platform:server`禁止の制約が入っています。さらに、サーバー専用のファイルはすべて`import 'server-only'`で始まります。そのため、lintが実行されない場所でも、誤りはビルドで失敗します。

### 12.3. ストア

Redux Toolkitはスライスを遅延して注入できます。これがルートでの`provideState`の役割を果たします。ルートリデューサーは`shared`にあり、どのドメインも知りません。

`libs/shared/data-access-store/src/lib/store.ts`

```ts
import { combineSlices, configureStore, createListenerMiddleware, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';

const layoutSlice = createSlice({
  name: 'layout',
  initialState: { sidebarOpen: true },
  reducers: {
    sidebarToggled(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
    sidebarSet(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload;
    },
  },
});

export interface LazyLoadedSlices {}

export const rootReducer = combineSlices(layoutSlice).withLazyLoadedSlices<LazyLoadedSlices>();

export function makeStore() {
  const listener = createListenerMiddleware();
  return configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().prepend(listener.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const { sidebarToggled, sidebarSet } = layoutSlice.actions;
```

Redux ToolkitのApp Router向けガイドが推奨するとおり、リクエストごとの新しいストアはクライアントのプロバイダーで作成します。

`libs/shared/data-access-store/src/lib/store-provider.tsx`

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from './store';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(makeStore);
  return <Provider store={store}>{children}</Provider>;
}
```

### 12.4. スライス

セクション9と同じイベント、同じ楽観的更新、同じ`model`の関数です。

`libs/maintenance/data-access/src/lib/work-orders.slice.ts`

```ts
import { createEntityAdapter, createSelector, createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import { rootReducer, type RootState } from '@fleetline/shared/data-access-store';
import {
  byDueDate, emptyFilter, isOverdue, matchesFilter,
  type WorkOrder, type WorkOrderFilter,
} from '@fleetline/maintenance/model';

const adapter = createEntityAdapter<WorkOrder>({ sortComparer: byDueDate });

export const workOrdersSlice = createSlice({
  name: 'workOrders',
  initialState: adapter.getInitialState({
    filter: emptyFilter as WorkOrderFilter,
    loading: false,
    error: null as string | null,
  }),
  reducers: {
    opened(state, action: PayloadAction<{ depotId: string }>) {
      adapter.removeAll(state);
      state.filter = { ...emptyFilter, depotId: action.payload.depotId };
      state.loading = true;
      state.error = null;
    },
    filterChanged(state, action: PayloadAction<Partial<Omit<WorkOrderFilter, 'depotId'>>>) {
      Object.assign(state.filter, action.payload);
    },
    assigneeChosen(state, action: PayloadAction<{ id: string; assigneeId: string; previousAssigneeId: string | null }>) {
      adapter.updateOne(state, { id: action.payload.id, changes: { assigneeId: action.payload.assigneeId } });
    },
    loadSucceeded(state, action: PayloadAction<WorkOrder[]>) {
      adapter.setAll(state, action.payload);
      state.loading = false;
    },
    loadFailed(state, action: PayloadAction<string>) {
      state.loading = false;
      state.error = action.payload;
    },
    assignSucceeded(state, action: PayloadAction<WorkOrder>) {
      adapter.upsertOne(state, action.payload);
    },
    assignFailed(state, action: PayloadAction<{ id: string; previousAssigneeId: string | null; error: string }>) {
      adapter.updateOne(state, { id: action.payload.id, changes: { assigneeId: action.payload.previousAssigneeId } });
      state.error = action.payload.error;
    },
  },
});

declare module '@fleetline/shared/data-access-store' {
  export interface LazyLoadedSlices extends WithSlice<typeof workOrdersSlice> {}
}

const injected = workOrdersSlice.injectInto(rootReducer);
const selectState = (state: RootState) => injected.selectSlice(state);
const entities = adapter.getSelectors(selectState);

export const selectFilter = (state: RootState) => selectState(state).filter;
export const selectLoading = (state: RootState) => selectState(state).loading;
export const selectError = (state: RootState) => selectState(state).error;
export const selectVisible = createSelector([entities.selectAll, selectFilter], (orders, filter) =>
  orders.filter((order) => matchesFilter(order, filter)),
);
export const selectOverdueCount = createSelector([entities.selectAll], (orders) =>
  orders.filter((order) => isOverdue(order, new Date())).length,
);
export const workOrdersActions = workOrdersSlice.actions;
```

### 12.5. リスナーとしてのエフェクト

リスナーはドメインのマウント時に追加し、アンマウント時に削除します。これはルートでの`provideEffects`に相当します。`cancelActiveListeners()`が`switchMap`の振る舞いを与えます。

`libs/maintenance/data-access/src/lib/work-orders.listeners.ts`

```ts
import { addListener, type UnsubscribeListener } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from '@fleetline/shared/data-access-store';
import { toErrorMessage } from '@fleetline/shared/data-access-http';
import { workOrdersHttp } from './work-orders.http';
import { workOrdersActions as actions } from './work-orders.slice';

const addAppListener = addListener.withTypes<RootState, AppDispatch>();

export function startWorkOrderListeners(dispatch: AppDispatch): UnsubscribeListener {
  const stops = [
    dispatch(
      addAppListener({
        actionCreator: actions.opened,
        effect: async ({ payload }, api) => {
          api.cancelActiveListeners();
          try {
            const orders = await workOrdersHttp.list(payload.depotId, api.signal);
            api.dispatch(actions.loadSucceeded(orders));
          } catch (error) {
            if (!api.signal.aborted) api.dispatch(actions.loadFailed(toErrorMessage(error)));
          }
        },
      }),
    ),
    dispatch(
      addAppListener({
        actionCreator: actions.assigneeChosen,
        effect: async ({ payload }, api) => {
          try {
            api.dispatch(actions.assignSucceeded(await workOrdersHttp.assign(payload.id, payload.assigneeId)));
          } catch (error) {
            api.dispatch(actions.assignFailed({ ...payload, error: toErrorMessage(error) }));
          }
        },
      }),
    ),
  ];
  return () => stops.forEach((stop) => stop());
}
```

### 12.6. ファサードのフック

フックはAngularのファサードと同じメンバーを持ちます。さらにリスナーを開始し、ページが開いたことを報告するので、featureは1行で配線できます。

`libs/maintenance/data-access/src/lib/use-work-orders.ts`

```ts
'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@fleetline/shared/data-access-store';
import type { WorkOrder, WorkOrderFilter } from '@fleetline/maintenance/model';
import { startWorkOrderListeners } from './work-orders.listeners';
import {
  selectError, selectFilter, selectLoading, selectOverdueCount, selectVisible,
  workOrdersActions as actions,
} from './work-orders.slice';

export function useWorkOrders(depotId: string) {
  const dispatch = useAppDispatch();

  useEffect(() => startWorkOrderListeners(dispatch), [dispatch]);
  useEffect(() => {
    dispatch(actions.opened({ depotId }));
  }, [dispatch, depotId]);

  return {
    visible: useAppSelector(selectVisible),
    overdueCount: useAppSelector(selectOverdueCount),
    filter: useAppSelector(selectFilter),
    loading: useAppSelector(selectLoading),
    error: useAppSelector(selectError),
    filterBy: (filter: Partial<Omit<WorkOrderFilter, 'depotId'>>) => dispatch(actions.filterChanged(filter)),
    assign: (order: WorkOrder, assigneeId: string) =>
      dispatch(actions.assigneeChosen({ id: order.id, assigneeId, previousAssigneeId: order.assigneeId })),
  };
}
```

`libs/maintenance/data-access/src/index.ts`

```ts
export { useWorkOrders } from './lib/use-work-orders';
```

### 12.7. feature、ui、ルート

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

interface WorkOrderCardProps {
  workOrder: WorkOrder;
  vehicleLabel: string;
  onAssign: (assigneeId: string) => void;
}

export function WorkOrderCard({ workOrder, vehicleLabel, onAssign }: WorkOrderCardProps) {
  return (
    <article className={isOverdue(workOrder, new Date()) ? 'card card--overdue' : 'card'}>
      <header>
        <h3>{workOrder.title}</h3>
        <Badge tone={workOrder.priority === 'urgent' ? 'danger' : 'neutral'}>{workOrder.priority}</Badge>
      </header>
      <p className="vehicle">{vehicleLabel}</p>
      <p className="due">{formatRelative(workOrder.dueAt)}</p>
      <MechanicPicker depotId={workOrder.depotId} value={workOrder.assigneeId} onChange={onAssign} />
    </article>
  );
}
```

アプリケーションのルートファイルは数行のままです。シェルライブラリは、権限チェック付きのドメインのレイアウトをエクスポートします。

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
import { WorkOrdersPage } from '@fleetline/maintenance/feature-work-orders';

export default async function Page({ params }: { params: Promise<{ depotId: string }> }) {
  const { depotId } = await params;
  return <WorkOrdersPage depotId={depotId} />;
}
```

### 12.8. サーバーの状態：同じファサード、別のエンジン

Next.jsでは、AngularのSPAがNgRxに保持するものの多くは**サーバーの状態**です。サーバーが所有し、クライアントがキャッシュするデータです。作業指示のような一覧については、多くのチームがReduxよりもサーバーコンポーネントとクエリキャッシュを好みます。ファサードがあれば、これは`data-access`の内部の判断になります。

`libs/maintenance/data-access-server/src/lib/work-orders.ts`

```ts
import 'server-only';
import { apiFetch } from '@fleetline/shared/data-access-server';
import type { WorkOrder } from '@fleetline/maintenance/model';

export function listWorkOrders(depotId: string): Promise<WorkOrder[]> {
  return apiFetch<WorkOrder[]>(`/depots/${depotId}/work-orders`, { next: { tags: [`work-orders:${depotId}`] } });
}
```

`libs/maintenance/data-access/src/lib/use-work-orders.query.ts`

```ts
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  emptyFilter, isOverdue, matchesFilter,
  type WorkOrder, type WorkOrderFilter,
} from '@fleetline/maintenance/model';
import { workOrdersHttp } from './work-orders.http';

export function useWorkOrders(depotId: string, initial?: WorkOrder[]) {
  const client = useQueryClient();
  const key = ['work-orders', depotId] as const;
  const [filter, setFilter] = useState<WorkOrderFilter>({ ...emptyFilter, depotId });

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => workOrdersHttp.list(depotId, signal),
    initialData: initial,
  });

  const assignment = useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string }) => workOrdersHttp.assign(id, assigneeId),
    onMutate: async ({ id, assigneeId }) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<WorkOrder[]>(key);
      client.setQueryData<WorkOrder[]>(key, (orders) =>
        orders?.map((order) => (order.id === id ? { ...order, assigneeId } : order)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => client.setQueryData(key, context?.previous),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });

  const all = query.data ?? [];
  const visible = all.filter((order) => matchesFilter(order, filter));

  return {
    visible,
    overdueCount: all.filter((order) => isOverdue(order, new Date())).length,
    filter,
    loading: query.isPending,
    error: query.error ? String(query.error) : null,
    filterBy: (change: Partial<Omit<WorkOrderFilter, 'depotId'>>) => setFilter((current) => ({ ...current, ...change })),
    assign: (order: WorkOrder, assigneeId: string) => assignment.mutate({ id: order.id, assigneeId }),
  };
}
```

戻り値は同じメンバーを持ちます。`WorkOrdersPage`は、サーバーの`page.tsx`が`listWorkOrders`で読み込んだ`initial`を渡すことを除いて変わりません。Fleetlineのルールは、**サーバーの状態はクエリキャッシュに、クライアントが所有する状態はReduxに**です。プランナーが保存前に何十件もの作業指示を整備士と日付の間でドラッグする計画ボードは、クライアントが所有する状態なのでReduxに残します。作業指示の一覧はサーバーの状態です。

### 12.9. Next.js特有の落とし穴

- **`'use client'`はそれ自体が1つの境界です。** フックを使うfeatureとdata-accessのファイルに置き、`model`や`util`には決して置きません。
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
    │               └── use-vehicle-summaries.ts
    └── shared/
        ├── data-access-http/
        ├── ui-design-system/
        └── util-date/
```

### 13.1. 対応関係

| Angular | Vue / Nuxt |
|---|---|
| `feature`コンポーネント | `feature-*`の単一ファイルコンポーネント。`apps/<app>/app/pages/`のページはそれを描画するだけ |
| `ui`コンポーネント | `defineProps`と`defineEmits`を持つコンポーネント |
| `shell`のルート | ファイルルートはアプリに残し、シェルライブラリはレイアウトとルートミドルウェアをエクスポートする |
| NgRx Store / Signal Store | Pinia（セットアップストア） |
| セレクター | ストア内の`computed` |
| エフェクト | ストアの非同期アクション。サーバーレンダリング中の読み込みには`useAsyncData` |
| ファサードのサービス | コンポーザブル：`useWorkOrders()` |
| `HttpClient` | `$fetch` |

Piniaにはアクションとリデューサーの分離がありません。そのためNgRxのイベントログとタイムトラベルデバッグはなくなりますが、儀式的な記述の大半もなくなります。アーキテクチャにとっては何も変わりません。ストアは`data-access`の非公開物であり、コンポーザブルが扉です。

### 13.2. ライブラリの自動インポートを無効にする

Nuxtはコンポーネントとコンポーザブルを自動でインポートします。小さなアプリでは便利ですが、境界にとっては致命的です。**書かれていないインポートはlintできません。** billingのfeatureが`import`行なしに`useWorkOrders()`を使えるなら、lintルールは境界の越境を目にすることがありません。

FleetlineのNuxtアプリケーションでのルール：

- ライブラリはパスエイリアスを通した明示的な`import`文でインポートし、自動インポートのディレクトリとして登録することは決してしない。
- ドメインをNuxtのレイヤーにはしない。レイヤーはそのコンポーネントとコンポーザブルをアプリに自動インポートするからである。
- アプリはVueとNuxtのAPIの自動インポートを自身の`pages/`と`layouts/`でだけ使い、ライブラリのコードはNuxtの関数を`#imports`からインポートする。

`apps/backoffice/nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
  components: { dirs: [] },
  imports: { scan: false },
  runtimeConfig: { public: { apiUrl: '' } },
});
```

### 13.3. ストア

`libs/maintenance/data-access/src/lib/work-orders.store.ts`

```ts
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  byDueDate, emptyFilter, isOverdue, matchesFilter,
  type WorkOrder, type WorkOrderFilter,
} from '@fleetline/maintenance/model';
import { toErrorMessage } from '@fleetline/shared/data-access-http';
import { useWorkOrdersHttp } from './work-orders.http';

export const useWorkOrdersStore = defineStore('maintenance/work-orders', () => {
  const http = useWorkOrdersHttp();

  const byId = ref<Record<string, WorkOrder>>({});
  const filter = ref<WorkOrderFilter>({ ...emptyFilter });
  const error = ref<string | null>(null);

  const all = computed(() => Object.values(byId.value).sort(byDueDate));
  const visible = computed(() => all.value.filter((order) => matchesFilter(order, filter.value)));
  const overdueCount = computed(() => all.value.filter((order) => isOverdue(order, new Date())).length);

  async function open(depotId: string) {
    filter.value = { ...emptyFilter, depotId };
    error.value = null;
    const orders = await http.list(depotId);
    byId.value = Object.fromEntries(orders.map((order) => [order.id, order]));
  }

  function filterBy(change: Partial<Omit<WorkOrderFilter, 'depotId'>>) {
    filter.value = { ...filter.value, ...change };
  }

  async function assign(id: string, assigneeId: string) {
    const order = byId.value[id];
    if (!order) return;
    const previousAssigneeId = order.assigneeId;
    byId.value[id] = { ...order, assigneeId };
    try {
      byId.value[id] = await http.assign(id, assigneeId);
    } catch (cause) {
      byId.value[id] = { ...order, assigneeId: previousAssigneeId };
      error.value = toErrorMessage(cause);
    }
  }

  return { byId, filter, error, visible, overdueCount, open, filterBy, assign };
});
```

`byId`、`filter`、`error`を返しているのは、Piniaがそれらをサーバーレンダリングのペイロードにシリアライズし、ブラウザーが同じ状態から始められるようにするためです。

### 13.4. ファサードのコンポーザブル

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

### 13.5. feature、ui、ページ

`libs/maintenance/feature-work-orders/src/lib/WorkOrdersPage.vue`

```vue
<script setup lang="ts">
import { useWorkOrders } from '@fleetline/maintenance/data-access';
import { StatusFilter, WorkOrderCard } from '@fleetline/maintenance/ui-work-order-card';
import { useVehicleSummaries } from '@fleetline/fleet/api';
import { EmptyState, Spinner } from '@fleetline/shared/ui-design-system';

const props = defineProps<{ depotId: string }>();

const { visible, overdueCount, filter, loading, filterBy, assign } = await useWorkOrders(() => props.depotId);
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

`libs/maintenance/ui-work-order-card/src/lib/WorkOrderCard.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { isOverdue, type WorkOrder } from '@fleetline/maintenance/model';
import { Badge, MechanicPicker } from '@fleetline/shared/ui-design-system';
import { formatRelative } from '@fleetline/shared/util-date';

const props = defineProps<{ workOrder: WorkOrder; vehicleLabel: string }>();
const emit = defineEmits<{ assign: [assigneeId: string] }>();

const overdue = computed(() => isOverdue(props.workOrder, new Date()));
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

### 13.6. Nuxt特有の落とし穴

- **`.vue`ファイルのlint**には、ESLintの設定に`vue-eslint-parser`が必要です。ないと、境界ルールはすべてのコンポーネントを黙ってスキップします。セクション8.2の`files`パターンに`**/*.vue`が含まれているのはこのためです。
- **リクエストごとに1つのストア。** `@pinia/nuxt`を使うPiniaは、サーバーでリクエストごとにすでに1つ作成します。ライブラリのモジュールレベルの`ref`に状態を持たせてはいけません。サーバーではユーザー間で共有されてしまいます。
- **`useAsyncData`はストアではなくファサードに属します。** これでストアはテストからもクライアント専用のコードからも使えるままになります。

## 14. 並べて比較する

:::diagram fe-frameworks

3つのフレームワークでの同じユースケースを、ファイルごとに示します。

| ライブラリ | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| `model` | `work-order.ts` | 同じファイル | 同じファイル |
| `data-access`の状態 | `createFeature` + `createEntityAdapter` | `createSlice` + `createEntityAdapter` | Piniaのセットアップストア |
| `data-access`のエフェクト | 関数型の`createEffect` | リスナーミドルウェア | ストアの非同期アクション + `useAsyncData` |
| `data-access`のファサード | `WorkOrdersFacade`（シグナル） | `useWorkOrders()`（値） | `useWorkOrders()`（ref） |
| `ui` | `input()` / `output()` | props / コールバック | `defineProps` / `defineEmits` |
| `feature` | スタンドアロンコンポーネント | クライアントコンポーネント | 単一ファイルコンポーネント |
| `shell` | `providers`付きの`Routes` | レイアウトコンポーネント、ルートセグメント | レイアウト + ルートミドルウェア |
| アプリのルート | `loadChildren` | `page.tsx` | `pages/*.vue` |
| 境界 | `@nx/enforce-module-boundaries` | 同じルール | 同じルール（`vue-eslint-parser`付き） |

3つすべてで同一のもの：すべてのファイルのフォルダー、タグ、lintルール、`model`ライブラリ、ファサードのメンバー、そして`model`ライブラリのテストです。Fleetlineのアプリ間を行き来する開発者が学び直すのは、フレームワークそのものだけです。

## 15. ライブラリの型ごとのテスト

それぞれの型には自然なテストの種類があり、境界があるおかげでどれも安く済みます。

| 型 | テスト | 速度 | 偽物にするもの |
|---|---|---|---|
| `model`、`util` | フレームワークなしの単純な単体テスト | ミリ秒 | なし |
| `data-access`のリデューサー、セレクター | 純粋関数のテスト | ミリ秒 | なし |
| `data-access`のエフェクト／リスナー | 偽のHTTPクライアントを使うテスト | 速い | HTTP |
| ファサード | 本物のストアとの結合テスト | 速い | HTTP |
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
どちらもこのアーキテクチャに合い、どちらも`data-access`に置かれ、ファサードがその選択を隠します。Fleetlineでは、イベントログとdevtoolsが役立つところ（整備、計画）ではStoreを、より単純なドメイン（車両の概要、通知）ではSignal Storeを使っています。

**ファサードは余計なレイヤーにすぎないのでは？**
そのとおりです。そしてセクション10で、いつそれが割に合うのかを説明しています。ReactとVueでは、フックやコンポーザブルがもともと状態へのアクセスを共有する慣用的な方法なので、そこではファサードのコストはほとんどかかりません。

**すべてのドメインに最初から`api`ライブラリを持たせるべきですか？**
いいえ。別のドメインが何かを初めて必要としたときに作ってください。それまでは、ドメインは完全に非公開です。これ以上の境界はありません。

**これはマイクロフロントエンドですか？**
いいえ。ここに書いたものはすべて、アプリのフォルダーごとに1つのアプリケーションとしてビルドされます。組織が独立したデプロイを必要とするようになれば、同じドメインの切り方が、後のマイクロフロントエンドの自然な継ぎ目になります。

**React、Vue、Angularは本当にライブラリを共有できますか？**
共有するのは`framework:agnostic`タグの付いた`model`と`util`のライブラリ、そしてテストデータビルダーです。コンポーネントとストアはフレームワークごとです。Fleetlineでは、フロントエンドのコードのおよそ5分の1がフレームワークに依存しません。

**さらに読むならどこですか？**
Manfred Steyerの記事と[angulararchitects.io](https://www.angulararchitects.io/)の無料電子書籍*Enterprise Angular*、モジュール境界についての[Nxのドキュメント](https://nx.dev/)、[Sheriff](https://github.com/softarc-consulting/sheriff)、そして[NgRxのドキュメント](https://ngrx.io/)です。
