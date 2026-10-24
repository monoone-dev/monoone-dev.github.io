SLATは、Rustで書かれ、ウィンドウ層にTauriを使うデスクトップアプリケーションのバックエンドを構成するためのパターンです。コードベースが大きくなると、どのチームもいずれ次の3つの問いを誤ります。SLATはその3つに答えます。**このファイルはどこに置くのか**、**誰が誰をインポートしてよいのか**、そして**ウィンドウ、ドメイン、外部の世界の間でデータがどう流れるのか**です。

名前は4つの構成要素を並べたものです。**S**lice、**L**ayer、**A**ctor、**T**ierです。この文書のすべてのルールは、このいずれかに関するものです。

このページは完全なリファレンスです。SLATを初めて見るチームでも、私たちに何も質問せずに、新しいプロジェクトに導入したり既存のプロジェクトを移行したりできるように書いています。ルールとその理由、そのまま使えるコード、ルールを強制するチェック、そして散らかったアプリケーションを一歩ずつ整えていく具体例を含みます。

> **バージョン1.1** · 2026年10月25日。バージョン1.1ではセクション12「*プラットフォーム*」を追加しました。オペレーティングシステムに依存するコードを1か所にまとめ、のちのLinuxやWindowsへの移植を1つのフォルダー内の作業にする方法を説明します。全履歴はセクション22にあります。

## 1. SLATが存在する理由

Tauriアプリケーションは小さく始まります。`main.rs`があり、`#[tauri::command]`関数がいくつかあり、もしかすると`state.rs`もあります。半年後、同じプロジェクトはたいてい次のようになっています。

- 1つか2つの巨大なファイルが「コマンド」を抱え、そのコマンドがビジネスロジックをすべて抱えている。
- アプリケーションの状態は30個のフィールドを持つ構造体で、その半分は`Mutex<Option<…>>`や`AtomicBool`である。
- いくつかの`static`変数が、誰も所有していない状態をさらに保持している。
- ドメインロジックが`app.emit(…)`を直接呼ぶため、ウィンドウなしでは何もテストできない。
- 関数がバリエーションとして増殖する。`start_with_budget`、`start_with_budget_and_slots`、`start_with_hook`。
- `#[cfg(target_os = "macos")]`がコードベースのあちこちに散らばっている。
- 新しい開発者やコーディングエージェントは、ある機能がどこにあるのかを見つけるのに1日かかる。

これは誰かが悪いせいではありません。「これはどこに置くのか」という問いに、共有された答えがないせいです。答えがなければ、いちばん近いファイルが選ばれます。そして、いちばん近いファイルはいつもいちばん大きなファイルです。

SLATはあらゆる種類のコードに対して、その答えを一度だけ与えます。そして重要な部分を**機械的に**します。構成を壊すコードはコンパイラーと少数の小さなスクリプトが拒否するので、締め切りや新しいメンバー、コーディングエージェントがいても構成は保たれます。

SLATとRustバックエンドの関係は、Nx＋NgRxとフロントエンドの関係に相当します。特定のアプリケーションに依存しないルールの集まりです。私たちは、RigOneやIndexOneを含め、RustとTauriのバックエンドを持つすべてのMonoOne製品でSLATを使っています。

### 1.1. 目標

1. **見つけやすさ。** 機能の名前を知っている人やエージェントは、アプリケーションの両側で、その機能がどのフォルダーにあるかが分かります。
2. **ウィンドウなしでのテスト。** 薄いエントリ層を除くすべてが、Tauriもディスプレイも実際のプロセスもなしにコンパイルされ、テストが実行できます。
3. **コンパイラーが強制する境界。** 依存の方向はwikiではなく`Cargo.toml`に書かれます。
4. **長く生きる状態には所有者が1人。** バックグラウンドの作業（実行、録音、会話）には所有者がちょうど1人いて、そのルールは純粋関数です。
5. **低コストな成長。** 新しい機能は、決まったファイル構成を持つ新しいフォルダーです。5つの共有ファイルへの編集ではありません。
6. **構造による移植性。** オペレーティングシステムに依存するコードは1つのフォルダーにあるので、新しいプラットフォームは新しいファイルであり、リポジトリ全体の捜索ではありません。

### 1.2. 目標としないこと

- SLATはフロントエンドを規定しません。境界の契約、つまりコマンド、データ転送オブジェクト（DTO）、イベントだけを定めます。
- SLATはフレームワークではありません。依存すべきcrateはありません。構成と、ルールの集まりと、いくつかのスクリプトです。
- SLATはリポジトリ独自のルールを置き換えません。プロジェクトのルールとSLATが食い違う場合は、**プロジェクトのルールが優先されます**。SLATは物の置き場所を決め、プロジェクトは何を禁止するかを決めます。

### 1.3. 誰が使うべきか

SLATは、Tauriを使うRustデスクトップアプリケーションで、バックエンドのコードがおよそ10,000行以上のものを想定しています。考え方は、薄いエントリ層を持つあらゆるRustアプリケーション（CLI、デーモン、サーバー）にそのまま当てはまります。「Tauriコマンド」を「HTTPハンドラー」や「CLIサブコマンド」に置き換えれば、それ以外はすべて成り立ちます。

## 2. 1ページで見るSLAT

:::diagram tiers

```
app ──► core ──► store ──► kit
  │       └────► drivers ─► kit
  └─ only app knows tauri          only drivers/src/platform/ knows the operating system

core/<slice>/   model.rs  logic.rs  store.rs  service.rs  actor/  mod.rs
app/<slice>/    commands.rs  dto.rs  events.rs  mod.rs

Query:    UI ─invoke─► commands ─► service ─► store ─► DTO ─► UI
Command:  UI ─invoke─► commands ─► service | Handle ─► (actor: Msg ─► update ─► Effect) ─► store/drivers
Event:    actor/service ─► Snapshot | Event ─► app/events ─emit─► front-end store
```

覚えておくべき6つの文です。

1. **Tauriを知っているのは`app` crateだけです。** それ以外はすべてウィンドウなしでコンパイルされ、テストされます。
2. **機能は1つのスライスに収まり、スライスのファイルは決まっています。** チャットを探していますか。それは`core/chat/`と`app/chat/`にあります。
3. **Tauriコマンドは最大10行です。** デシリアライズし、スライスの関数を1つ呼び、結果をDTOに変換します。
4. **長く生きる状態の所有者は1人、アクターです。** アプリケーションの状態に`Mutex<Option<…>>`や`AtomicBool`を置かず、スライスの中に状態を持つ`static`を置きません。
5. **依存は下を向きます。** 下位のティアが上位のティアをインポートすることはなく、それをコンパイラーが強制します。
6. **オペレーティングシステムを知っているのは`drivers/src/platform/`だけです。** それ以外は概念（プロセスグループ、シークレット、データフォルダー）を求め、システムコールを求めることはありません。

## 3. 用語

| 用語 | 意味 | フロントエンドでの対応物 |
|---|---|---|
| **ティア**（Tier） | crateの種類：`kit`、`store`、`drivers`、`core`、`app`。ティアは積み重なり、下方向にのみ依存します。 | Nxのライブラリの型（`type:util`、`type:data-access`、…） |
| **スライス**（Slice） | 製品の1つの機能。たとえば`run`、`chat`、`skill`。 | ドメインのフォルダー、`src/sections/<area>` |
| **レイヤー**（Layer） | スライスの中にある、名前と役割が決まったファイル：`model.rs`、`logic.rs`、`store.rs`、`service.rs`。 | `feature/`、`ui/`、`data-access/`、`util/` |
| **アクター**（Actor） | 長く生きる状態の唯一の所有者：`Msg → update → Effect`。 | NgRxのストア：action → reducer → effect |
| **ハンドル**（Handle） | 外部からアクターに入る唯一の扉。 | `inject(Store)` |
| **スナップショット**（Snapshot） | ウィンドウから見えるアクターの姿。`watch`チャネルで公開されます。 | `select(…)` |
| **エントリ**（Entry） | 外部の世界がバックエンドを呼び出す手段：Tauriコマンド、MCPサーバー、ローカルブリッジ、リモートハブ。 | 画面コンポーネント |
| **クエリ**（Query） | 副作用のない読み取り。 | セレクター |
| **コマンド**（Command） | 状態の変更。 | アクション |
| **イベント**（Event） | 何かが変わったことを、問われずにバックエンドがフロントエンドに伝えるもの。 | ストアへのプッシュ |
| **プラットフォーム**（Platform） | ビルド対象のオペレーティングシステム：`macos`、`linux`、`windows`。 | ブラウザーのターゲット |
| **プラットフォーム契約**（Platform contract） | `drivers::platform`にある関数で、どのオペレーティングシステムでも同じ意味を持つもの。 | ポリフィル |

このうち3つは混同しやすいので、次のイメージを持っておいてください。**ティアは建物の階、スライスは`core`階にある部屋（住戸）、レイヤーは各住戸の中の部屋です。**

## 4. SLATの由来

SLATは、部品としては新しいものではありません。よく知られた5つの考え方を組み合わせ、それぞれが決めずに残している選択を確定させています。

| 考え方 | SLATが取り入れるもの | SLATがさらに決めること |
|---|---|---|
| レイヤードアーキテクチャ／クリーンアーキテクチャ | 依存はドメインに向かい、I/Oは端に置かれる。 | レイヤーは**crate**なので、方向はコンパイラーが確認する。種類はちょうど5つ。 |
| バーティカルスライスアーキテクチャ | コードは技術的な役割ではなく機能ごとにまとめる。 | すべてのスライスが、同じ役割を持つ**同じファイル名**を持つ。 |
| The Elm Architecture、NgRx、Redux | 状態はメッセージと純粋なupdate関数で変わる。 | 3つの問いのテスト（セクション9.1）に通る状態だけに適用する。エフェクトの結果はメッセージとして戻る。 |
| 関数型のコア、命令型のシェル | 判断は純粋で、副作用は別に実行する。 | `logic.rs`と`update.rs`はルールとして純粋であり、スクリプトがそれを確認する。 |
| ポートとアダプター（ヘキサゴナル） | 外部の世界にはインターフェースを通じて到達する。 | 実装が2つになるまでtraitは作らない。`drivers`ティアとプラットフォーム契約がポートの役割を果たす。 |

それぞれ単独との違いは、SLATが**完結していて機械的**だという点です。どの種類のコードにも置き場所がちょうど1つあり、重要なルールは`Cargo.toml`か、CIで実行されるチェックによって強制されます。

## 5. ティア

SLATのワークスペースには、最大で5種類のcrateがあります。名前は`<product>-<tier>`の形式で、たとえば`quayside-core`です。

| ティア | ここに置くもの | 依存してよいもの | 決して依存しないもの |
|---|---|---|---|
| `kit` | ドメインを持たない共有の型とツール：識別子、時刻、パス（`kit::paths`）、耐久性のあるファイル書き込み、基本のエラー型、ロギング。 | 外部ライブラリのみ | `tauri`、`tokio::process`、SQL、オペレーティングシステムの`#[cfg]`、製品に属するものすべて |
| `store` | 永続化：書き込み用接続、マイグレーション、スキーマ、インデックスの再構築、データベースの暗号化。 | `kit` | `tauri`、ドメインロジック、プロセス |
| `drivers` | 外部の世界：プロセス、プロバイダーのコマンドラインツール、HTTP、サイドカー。オペレーティングシステムに依存するコードは`drivers/src/platform/`にのみ置く。 | `kit` | `tauri`、`store`、ドメインロジック |
| `core` | すべてのドメインスライス：モデル、ロジック、ユースケース、アクター。 | `kit`、`store`、`drivers` | `tauri` |
| `app` | エントリ：Tauriコマンド、DTO、イベント、エントリサーバー（MCP、ブリッジ）、アプリケーションの状態、`setup`、`main`。 | 上記のすべて | ドメインロジック（それは`core`に属する） |

### 5.1. コンパイラーが番人

ティア間の矢印は、各crateの`Cargo.toml`に書かれます。`core`が依存関係に`tauri`を含めていなければ、`core`の中の`use tauri::Manager;`はコンパイルエラーになります。これはルールが持てる最も強い保証です。忘れられることも、レビューで見落とされることも、議論で覆されることもありません。

最小のワークスペースは次のとおりです。

```toml
# Cargo.toml (workspace root)
[workspace]
resolver = "2"
members = ["crates/*", "src-tauri"]

[workspace.dependencies]
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"] }
serde = { version = "1", features = ["derive"] }
thiserror = "2"
```

```toml
# crates/quayside-core/Cargo.toml
[package]
name = "quayside-core"
version = "0.1.0"
edition = "2024"

[dependencies]
quayside-kit = { path = "../quayside-kit" }
quayside-store = { path = "../quayside-store" }
quayside-drivers = { path = "../quayside-drivers" }
tokio.workspace = true
serde.workspace = true
thiserror.workspace = true
```

```toml
# src-tauri/Cargo.toml — the app tier keeps the name the bundler already knows
[package]
name = "quayside"
version = "0.1.0"
edition = "2024"

[lib]
name = "quayside_lib"

[dependencies]
quayside-core = { path = "../crates/quayside-core" }
quayside-kit = { path = "../crates/quayside-kit" }
tauri = { version = "2", features = [] }
```

### 5.2. 最初はいくつのcrateから始めるか

最小は2つ、`core`と`app`です。ほかのティアは、そのコードがすでに存在していて、きれいな状態になってから切り出します。きれいとは、上位のティアから何もインポートしていないことです。**「あとで使う」ための空のcrateは禁止です。** ビルドのたびにリンクの手間が増えるだけで、何も得られません。

### 5.3. ティアを分割するとき

`core`がおよそ60,000行を超えたとき、または1つのスライスを変更したあとの`core`のフルリビルドが苦痛になったときは、スライスのグループを`core-<group>`に移します。たとえば`quayside-core-run`です。crateはおよそ8個を超えないようにします。crateごとにリンクの手順が1つ増えます。ノートパソコンでは、細かく分割して節約できる数秒よりも、マシンが固まることのほうが高くつきます。

### 5.4. 互換性のための例外

Tauriのバンドラーやユーザーのデータがすでに知っているライブラリ名（たとえば`quayside_lib`や、ユーザーのホームディレクトリにあるフォルダー）は、`app` crateにそのまま残します。新しいcrateには新しい名前を付けます。

## 6. スライス

スライスは製品の1つの機能です。名前は`snake_case`の単数形の名詞です：`recording`、`transcript`、`board`、`trigger`。`recordings_manager`や`utils`ではありません。製品にフロントエンドがある場合、スライス名はフロントエンドの機能フォルダーと一致させます。そうすれば、同じ単語で両側のコードが見つかります。

スライスは2つのティアに存在します。ドメインは`core`に、エントリ（コマンド、DTO、イベント）は`app`にあります。

:::diagram slice

### 6.1. `core`のスライス

```
core/src/<slice>/
  mod.rs        public API of the slice: only `mod …;` and `pub use …;`
  model.rs      domain types, state enums, identifiers; no I/O, no async
  logic.rs      pure functions: validation, decisions, mappings, calculations
  store.rs      this slice's reads from SQL and files, and its write commands through the writer
  service.rs    use cases: async, composes logic + store + drivers; no state of its own
  error.rs      optional: the slice's error enum
  actor/        only for a slice with background state, section 9
  tests.rs      optional: unit tests of the slice
```

ルール：

- **スライスが必要としないファイルは存在しません。** 小さなスライスは、およそ400行を超えるまで、モデルとサービスを含む1つの`mod.rs`だけで構いません。
- **大きくなったファイルは同じ名前のフォルダーになります。** `logic.rs`は`logic/mod.rs`と`logic/<topic>.rs`になります。役割は変わらず、ファイルの数だけが変わります。
- **大きくなりすぎたスライスはサブスライスに分かれます。** `run/`は`run/start/`、`run/step/`、`run/finish/`になり、それぞれ同じファイル構成を持ちます。親には再エクスポートを書いた`mod.rs`だけが残ります。
- **`mod.rs`はスライスの玄関です。** Nxライブラリの`index.ts`に相当します。ほかのスライスはここを通してのみインポートします。

典型的な`mod.rs`です。

```rust
mod logic;
mod model;
mod service;
mod store;

pub use model::{Recording, RecordingId, RecordingState};
pub use service::RecordingService;
```

### 6.2. `app`のスライス

```
app/src/<slice>/
  mod.rs        `mod …;` plus the list of commands for `generate_handler!`
  commands.rs   #[tauri::command] functions; at most 10 lines each
  dto.rs        wire types: serde camelCase, #[serde(other)] on enums, From<model>
  events.rs     event names and payloads sent to the window; snapshot subscription loops
```

`app` crateの残りの部分です。

```
app/src/
  main.rs       calls lib::run(); nothing else
  lib.rs        run(): Builder, plugins, setup, generate_handler! assembled from <slice>::COMMANDS
  state.rs      AppState: the composition root, section 11
  error.rs      entry error → code and text for the window
  platform.rs   optional: window and menu settings that depend on the operating system, section 12.3
  doors/        entries other than the window: MCP server, bridge for agents, remote hub
```

### 6.3. コマンドの基準形

```rust
#[tauri::command]
pub async fn recording_start(
    state: State<'_, AppState>,
    input: StartRecordingInput,
) -> Result<RecordingDto, IpcError> {
    let recording = state.recordings.start(input.into()).await?;
    Ok(recording.into())
}
```

コマンドに`if`、ループ、スライスへの2回の呼び出しが必要なら、そのロジックは`service.rs`か`logic.rs`に属します。10行という制限は書き方の好みの問題ではありません。変換だけを行うコマンドには、専用のテストが要りません。コマンドが行うことはすべてスライスでテストされているからです。

### 6.4. コマンドの登録

`tauri::generate_handler!`にはすべてのコマンドのフルパスが必要なので、`lib.rs`に1つのリストを置きます。リストはスライスごとに1ブロックずつまとめておきます。そうすれば、コマンドの追加は隣のコマンドの横に1行足すだけで済みます。

```rust
pub fn run() {
    tauri::Builder::default()
        .setup(setup)
        .invoke_handler(tauri::generate_handler![
            recording::commands::recording_start,
            recording::commands::recording_stop,
            recording::commands::recording_list,
            transcript::commands::transcript_read,
            transcript::commands::transcript_search,
            board::commands::board_list,
            board::commands::board_sync,
        ])
        .run(tauri::generate_context!())
        .expect("the window could not start");
}
```

スライスに存在していてもこのリストにないコマンドは、コンパイルは通りますが、黙って何もしません。セクション16には、両者を比較し、ずれたときに失敗する小さなチェックが含まれています。

### 6.5. スライスの命名

- 1つの機能に1つの名詞、単数形で：`triggers`ではなく`trigger`。
- 技術の名前ではなく、ユーザーが認識するものの名前で：`whisper_pipeline`ではなく`transcript`。
- 2つの機能がいつも一緒に変わるなら、それは1つのスライスです。1つの機能に独立して変わる部分があるなら、それはサブスライスです。
- **横断的なポリシーもスライスです。** アクセス制御、制限、予算、シークレットの保護は`core/<policy>/`（たとえば`core/guard/`）に置き、ほかのすべてのスライスがそれを呼び出します。

## 7. 誰が誰をインポートしてよいか

### 7.1. スライスの内部

| ファイル | インポートしてよいもの | インポートしてはいけないもの |
|---|---|---|
| `model.rs` | `kit`、ほかのスライスの`model`（その`mod.rs`経由） | I/Oを伴うもの、`async`、`store`、`drivers` |
| `logic.rs` | `model` | I/O、`async`、`store`、`drivers`、`service` |
| `store.rs` | `model`、`store` crate | `drivers`、`service`、ほかのスライスの`logic` |
| `service.rs` | `model`、`logic`、`store.rs`、`drivers`、ほかのスライスの公開API | `tauri`、グローバルな状態 |
| `actor/*` | `model`、`logic`、`service`、`drivers` | `tauri`。さらに`update.rs`はI/Oも不可 |
| `app/<slice>/dto.rs` | そのスライスの`model` | `service`、`store` |
| `app/<slice>/commands.rs` | そのスライスの公開API、`dto`、`AppState` | `store`、`drivers`、`logic` |

### 7.2. スライス間

- **`mod.rs`経由のみ。** ほかのスライスから`crate::run::logic::…`のような深いパスを使うことは禁止です。
- **循環は禁止。** `a`が`b`を必要とし、`b`が`a`を必要とするなら、共有部分を独立したスライス（たいていは小さな`model`か小さなサービス）にし、両方がそれに依存するようにします。
- **ポリシーはコマンドではなくスライスです。** 予算のチェックがコマンドにあると、それを必要とする下位のレイヤーはすべて上に向かってインポートしなければなりません。これがTauriアプリケーションで循環が起きる最も一般的な原因です。

### 7.3. なぜこの線引きなのか

インポートの表は、テストに手間のかかるもの（I/O、async、プロセス）をできるだけ少ないファイルに集め、テストする価値の高いもの（判断）をそれらを一切含まないファイルに置くように作られています。`logic.rs`にある判断は、普通の`#[test]`でマイクロ秒単位でテストできます。同じ判断がコマンドの中に埋もれていると、ウィンドウが必要になります。

## 8. データの流れ

:::diagram flows

### 8.1. クエリ（読み取り）

```
window ─invoke─► app/<s>/commands.rs ─► core/<s>/service.rs ─► core/<s>/store.rs
                        ◄── dto.rs ◄──────── model ◄──────────────────┘
```

読み取りはアクターを経由しません。ただし、そのアクターの状態を読む場合は例外です。その場合は、メッセージを送らずに、`Handle`から最新の`Snapshot`を読みます。

### 8.2. コマンド（変更）

バックグラウンドの状態がない場合（設定の保存、ファイルの作成）：

```
window ─invoke─► commands ─► service ─► logic (decision) ─► store / drivers ─► result
```

バックグラウンドの状態がある場合（実行、会話、録音）：

```
window ─invoke─► commands ─► Handle.send(Msg)
                                  │
                 actor ◄──────────┘
                   update(&mut State, Msg) -> Vec<Effect>     pure function
                   for e in effects: execute(e)               I/O: drivers, store, timers
                   snapshot.send(State.view())                the window gets a new view
```

### 8.3. イベント（バックエンド → ウィンドウ）

イベントは`app/<s>/events.rs`から**のみ**発行します。`core`のスライスは、`watch::Sender<Snapshot>`または`broadcast::Sender<Event>`を通じて変更を公開します。`events.rs`がそれを購読し、`emit`を呼びます。こうすることで`core`はウィンドウを知らずに済み、フロントエンドにとっては各スライスのイベントの出どころがちょうど1か所になります。イベント名は`<slice>:<event>`の形式に従います。たとえば`recording:snapshot`です。

```rust
// app/src/recording/events.rs
pub fn spawn(app: AppHandle, recordings: RecordingsHandle) {
    let mut snapshots = recordings.subscribe();
    tauri::async_runtime::spawn(async move {
        while snapshots.changed().await.is_ok() {
            let view = RecordingsDto::from(&*snapshots.borrow());
            if app.emit("recording:snapshot", view).is_err() {
                break;
            }
        }
    });
}
```

### 8.4. 大量のストリーム

スライスによっては、小さなイベントを大量に生み出します。ログの行、文字起こしの単語、進捗の刻みなどです。1行ごとに1つのTauriイベントを発行してはいけません。スライスには`core`の中に容量制限付きのチャネルを持たせ、`app`には、数ミリ秒ごとに行をまとめて`tauri::ipc::Channel`に流す**ポンプ**を持たせます。容量制限付きのチャネルがバックプレッシャーになります。ウィンドウが遅いとき、スライスはメモリーを埋め尽くす代わりにそれを知ることができます（`Sent::Dropped`）。まとめ方、チャネル、フレームレートはエントリの関心事であり、`app`に置きます。

## 9. アクター：状態を持つスライス

### 9.1. アクターを使うとき

アクターを使うのは、次の**3つすべて**が当てはまるときだけです。

1. 状態が1回のコマンド呼び出しより長く生きる。
2. 複数の発生源（ウィンドウ、プロセス、タイマー、ネットワーク）が同時にそれを変更する。
3. ウィンドウがそれをリアルタイムで見ている。

それ以外の場合は、普通の`service.rs`を使います。NgRxのすべての機能にエフェクトが必要なわけではないのと同じで、SLATのすべてのスライスにアクターが必要なわけではありません。

| 候補 | 1 | 2 | 3 | 判定 |
|---|---|---|---|---|
| ステップとプロセスを持つエージェントの実行 | はい | ウィンドウ、プロセス、タイマー | はい | アクター |
| 進行中の録音 | はい | ウィンドウ、オーディオデバイス、タイマー | はい | アクター |
| モデルとの会話 | はい | ウィンドウ、モデルのプロセス、リモートデバイス | はい | アクター |
| 下書きを一度生成して返す | はい | ウィンドウ（開始／停止） | いいえ、結果は1つ | サービス＋`kit::Jobs` |
| モデル価格のキャッシュ | はい | なし | いいえ | スライスのサービスのフィールド |

### 9.2. ファイル

```
core/src/<slice>/actor/
  mod.rs        pub use Handle, Msg, Snapshot
  msg.rs        enum Msg: everything that can happen (from the window, a process, a timer)
  state.rs      struct State: the only place where the state exists
  update.rs     fn update(state: &mut State, msg: Msg) -> Vec<Effect>; pure, no I/O, no async
  effect.rs     enum Effect + async fn execute(effect, &Deps) -> Option<Msg>
  run.rs        the loop: recv → update → execute → snapshot.send; started with tokio::spawn
  handle.rs     struct Handle { tx, snapshot }: send(), ask() with oneshot, subscribe()
  snapshot.rs   struct Snapshot: what the window sees; From<&State>
```

:::diagram actor

### 9.3. 契約

- **`update`は純粋です。** 状態とメッセージを受け取り、エフェクトのリストを返します。その状態に関するビジネスルールはすべて、tokioもプロセスもデータベースもなしにテストできます。
- **結果を生むエフェクトは、それを新しい`Msg`として返します。** アクターは自分のループの中で長いエフェクトを待ちません。長いエフェクトは`tokio::spawn`に渡され、その結果はメールボックスを通じて戻ってきます。
- **キャンセルはフラグではなく、世代を持つメッセージです**：`Msg::Cancel { generation }`。状態は`generation: u64`を保持し、古い世代を持つ遅れた応答は`update`で無視されます。グローバルな`AtomicBool`は操作をまたいで漏れますが、世代は漏れません。
- **結果は値です**：`enum Outcome<T> { Done(T), Cancelled }`。決して`Err(Cancelled)`ではありません。キャンセルはユーザーが求めたことであり、失敗ではありません。
- **時間制限は`Effect::StartTimer`であり、その終わりは`Msg::TimedOut`です。** 時間制限のあとにプロセスを終了させるのはドライバーの仕事です。むき出しの`tokio::time::timeout`がキャンセルするのはRustのfutureであって、オペレーティングシステムのプロセスではありません。
- **アクターの中に`std::sync::Mutex`は置きません。** 状態の所有者は1人なので、ロックは不要です。
- **状態のインスタンスごとに1つのアクター**：実行ごとに1つ、会話ごとに1つです。生きているインスタンスの登録簿は、それ自体が小さなアクターか、ハンドルのマップを持つサービスです。

### 9.4. 小さなアクターの完全な例

録音プロセスを起動し、時間制限を課し、キャンセルできる録音アクターです。型名と関数名はすべて説明のためのものです。

```rust
// msg.rs
pub enum Msg {
    Start { title: String, limit: Duration },
    Started { generation: u64, pid: ProcessId },
    Level { generation: u64, db: f32 },
    Stop { generation: u64 },
    TimedOut { generation: u64 },
    Ended { generation: u64, outcome: Outcome<RecordingFile> },
}
```

```rust
// state.rs
#[derive(Default)]
pub struct State {
    pub generation: u64,
    pub phase: Phase,
    pub title: Option<String>,
    pub level_db: Option<f32>,
}

#[derive(Default, Clone, PartialEq, Debug)]
pub enum Phase {
    #[default]
    Idle,
    Starting,
    Recording { pid: ProcessId },
    Stopping,
    Saved(RecordingFile),
    Cancelled,
}
```

```rust
// effect.rs
pub enum Effect {
    SpawnRecorder { generation: u64, title: String },
    StopRecorder { pid: ProcessId },
    StartTimer { generation: u64, after: Duration },
    Persist(RecordingFile),
}
```

```rust
// update.rs
pub fn update(state: &mut State, msg: Msg) -> Vec<Effect> {
    match msg {
        Msg::Start { title, limit } if state.phase == Phase::Idle => {
            state.generation += 1;
            state.phase = Phase::Starting;
            state.title = Some(title.clone());
            vec![
                Effect::SpawnRecorder { generation: state.generation, title },
                Effect::StartTimer { generation: state.generation, after: limit },
            ]
        }
        Msg::Started { generation, pid } if generation == state.generation => {
            state.phase = Phase::Recording { pid };
            vec![]
        }
        Msg::Level { generation, db } if generation == state.generation => {
            state.level_db = Some(db);
            vec![]
        }
        Msg::Stop { generation } | Msg::TimedOut { generation }
            if generation == state.generation =>
        {
            match state.phase.clone() {
                Phase::Recording { pid } => {
                    state.phase = Phase::Stopping;
                    vec![Effect::StopRecorder { pid }]
                }
                _ => vec![],
            }
        }
        Msg::Ended { generation, outcome } if generation == state.generation => {
            state.level_db = None;
            match outcome {
                Outcome::Done(file) => {
                    state.phase = Phase::Saved(file.clone());
                    vec![Effect::Persist(file)]
                }
                Outcome::Cancelled => {
                    state.phase = Phase::Cancelled;
                    vec![]
                }
            }
        }
        _ => vec![],
    }
}
```

最後の分岐こそが世代の要点です。以前の録音から届いた`Level`、`TimedOut`、`Ended`メッセージは古い世代を持っているので、何も変えません。

```rust
// run.rs
pub fn spawn(deps: Deps) -> Handle {
    let (tx, mut rx) = mpsc::channel(64);
    let (snapshot_tx, snapshot_rx) = watch::channel(Snapshot::default());
    let mailbox = tx.clone();
    tokio::spawn(async move {
        let mut state = State::default();
        while let Some(msg) = rx.recv().await {
            for effect in update(&mut state, msg) {
                let deps = deps.clone();
                let mailbox = mailbox.clone();
                tokio::spawn(async move {
                    if let Some(next) = execute(effect, &deps).await {
                        let _ = mailbox.send(next).await;
                    }
                });
            }
            snapshot_tx.send_replace(Snapshot::from(&state));
        }
    });
    Handle::new(tx, snapshot_rx)
}
```

```rust
// handle.rs
#[derive(Clone)]
pub struct Handle {
    tx: mpsc::Sender<Msg>,
    snapshot: watch::Receiver<Snapshot>,
}

impl Handle {
    pub async fn send(&self, msg: Msg) -> Result<(), ActorGone> {
        self.tx.send(msg).await.map_err(|_| ActorGone)
    }

    pub fn current(&self) -> Snapshot {
        self.snapshot.borrow().clone()
    }

    pub fn subscribe(&self) -> watch::Receiver<Snapshot> {
        self.snapshot.clone()
    }
}
```

エフェクトの順序が重要な場合（たとえば通知の前に永続化する場合）は、エフェクトごとに1つのタスクを起動する代わりに、1つのタスクの中でそれらのエフェクトを順番に実行します。ルールは、ループそのものが決して待たないということだけです。

### 9.5. アクターのテスト

ほとんどのテストはアクターを起動しません。`update`を直接呼びます。

```rust
#[test]
fn a_late_timeout_from_an_earlier_recording_changes_nothing() {
    let mut state = State::default();
    update(&mut state, Msg::Start { title: "first".into(), limit: MINUTE });
    update(&mut state, Msg::Ended { generation: 1, outcome: Outcome::Cancelled });
    update(&mut state, Msg::Start { title: "second".into(), limit: MINUTE });
    update(&mut state, Msg::Started { generation: 2, pid: PID });

    let effects = update(&mut state, Msg::TimedOut { generation: 1 });

    assert!(effects.is_empty());
    assert_eq!(state.phase, Phase::Recording { pid: PID });
}
```

少数のテストは、`tokio::time::pause()`、偽のドライバー、スナップショットの列に対するアサーションを使い、`Handle`を通じてアクター全体を動かします。

## 10. バリエーションの爆発

`start_with_budget`、`start_with_slots`、`start_with_snapshot_hook`、`start_with_budget_and_slots`のような関数の一族は、リクエスト用の構造体が欠けているというサインです。この一族を、1つの入口関数と1つのオプション構造体に置き換えます。

```rust
#[derive(Default)]
pub struct StartRequest {
    pub workflow: WorkflowRef,
    pub task: Option<String>,
    pub at_once: Option<NonZeroUsize>,
    pub budget: Option<Money>,
    pub origin: Option<Origin>,
    #[cfg(test)]
    pub faults: Faults,
}

pub async fn start(deps: &Deps, request: StartRequest) -> Result<Outcome<RunId>, StartError> {
    todo!()
}
```

呼び出し側は`StartRequest { workflow, budget: Some(limit), ..Default::default() }`と書きます。新しいオプションは新しいフィールドを1つ追加するだけで、新しい関数も、すべての呼び出し側への1行の追加も要りません。テスト専用の注入点（`faults`、`hooks`）は、テストビルドにだけ存在するフィールドです。

## 11. AppState、コンポジションルート

`AppState`はアプリケーションを組み立てるだけで、それ以外のことはしません。保持してよいのは次のものです。

- スライスの`Arc<…Service>`と`…Handle`の値
- 読み取り専用の設定
- データベースのライターへのハンドル

保持してはいけないのは次のものです。

- 何らかのバックグラウンド処理を表す`Mutex<Option<…>>`、`AtomicBool`、`Mutex<HashMap<…>>`。それはアクターの状態であり、`core/<slice>/actor/state.rs`に属します。
- 1つのスライスの詳細であるフィールド（キャッシュ、キャンセル用のマップ、キュー）。
- また、スライスは`static`変数（`OnceLock<Mutex<…>>`、`LazyLock<Mutex<…>>`）に状態を隠してはいけません。唯一の例外は、一度だけ計算され、プロセスが生きている間は変わらない定数（`OnceLock<PathBuf>`）です。

**判定方法：** `AppState`のすべてのフィールドは、スライスの名詞1つで説明できます（「recordings」「runs」「account」）。説明に文が必要なフィールドは、スライスの中に属します。

```rust
pub struct AppState {
    pub paths: kit::paths::AppPaths,
    pub store: store::Store,
    pub recordings: recording::Handle,
    pub transcripts: Arc<transcript::Service>,
    pub boards: Arc<board::Service>,
    pub triggers: trigger::Handle,
    pub account: Result<Arc<account::Service>, account::Unavailable>,
}
```

### 11.1. `kit::Jobs`：一回限りのバックグラウンド作業

下書きの生成、2つのフォルダーの比較、タスクの計画は、バックグラウンドで実行され、停止でき、結果を1つ生み出します。これにアクターは要りません。必要なのはキャンセル用のマップで、そのマップは`AppState`ではなくスライスのサービスに属します。そのための具体的なジェネリック型が`kit::Jobs<K>`です。

```rust
pub struct Jobs<K> {
    next: AtomicU64,
    running: Mutex<HashMap<K, (u64, CancellationToken)>>,
}

impl<K: Eq + Hash + Clone> Jobs<K> {
    pub fn begin(&self, key: K) -> Job<K> { todo!() }
    pub fn stop(&self, key: &K) -> bool { todo!() }
}
```

`begin`は同じキーを持つ以前のジョブをキャンセルし、新しい世代を保存し、ガードを返します。ガードはドロップされたときにエントリを削除しますが、それは世代がまだ一致している場合だけです。ロックはこの2つの短い関数の中でだけ保持され、`await`をまたいで保持されることはありません。`Jobs`はtraitではなく具体的な型なので、実装が1つしかないtraitを禁じるルールにも反しません。

## 12. プラットフォーム

*バージョン1.1で追加。*

製品は、今は1つのオペレーティングシステム（たとえばmacOSだけ）で提供しているかもしれません。SLATはコードを、次のオペレーティングシステムへの対応がリポジトリ全体の捜索ではなく**1つのフォルダー**の作業で済むように配置します。ルールは1つです。**オペレーティングシステムを知っているのは`drivers/src/platform/`だけです。** それ以外はすべて概念（プロセスグループ、シークレット、データフォルダー、ファイルを開くこと）を求め、システムコールを求めることはありません。

サポートするプラットフォームの一覧は、SLATではなくリポジトリ（そのコントリビューターガイド）に属します。

:::diagram platform

### 12.1. 構成

```
drivers/src/platform/
  mod.rs          the only platform API: selects a file with #[cfg] and pub use; no logic
  unix.rs         shared by macOS and Linux: process groups, signals, file modes
  macos.rs        Keychain, revealing in Finder, the login shell, …
  linux.rs        only when the port starts: Secret Service, xdg-open, …
  windows.rs      only when the port starts: Job Objects, Credential Manager, ACLs, …
  unsupported.rs  every function returns Err(PlatformError::Unsupported)
```

- 製品がまだサポートしていないオペレーティングシステムのファイルは**存在しません**。「あとで使う」ための空のcrateが存在しないのと同じ理由です。その代わりを`unsupported.rs`が務めます。
- `unsupported.rs`はデッドコードではありません。これがあるおかげで、`app`以外のワークスペース全体が初日からすべてのプラットフォーム向けにコンパイルできます。システムのコードが`core`に漏れれば、移植の日に発覚するのではなく、CIでコンパイルエラーになります。
- `mod.rs`はどのリポジトリでも同じ形です。

```rust
#[cfg(unix)]
mod unix;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(not(target_os = "macos"))]
mod unsupported;
#[cfg(not(target_os = "macos"))]
pub use unsupported::*;
```

移植で変わるのは、この`cfg`の行の並びだけです。どのプラットフォームのファイルも、**同じシグネチャを持つ同じ関数と型の集まり**を公開します。関数が欠けていれば、そのプラットフォームでコンパイルエラーになります。これはtraitではありません。どのビルドでも、実装は常にちょうど1つです。

### 12.2. 契約

各概念には、どのオペレーティングシステムでも同じ意味を持つ契約があります。違うのは中身だけです。

| 概念 | `drivers::platform`のAPI | macOS | Linux | Windows |
|---|---|---|---|---|
| プロセスグループ | `ProcessGroup::spawn`、`terminate(grace)`、`proved_dead()` | プロセスグループID。SIGTERM、猶予期間、SIGKILL。`kill(-pgid, 0)`が`ESRCH`を返す | macOSと同じ | Job Object。`TerminateJobObject`。ジョブにプロセスが残っていない |
| シークレット | `secret::read`、`secret::write`、`secret::delete` | Keychain | Secret Service（libsecret） | Credential Manager |
| 非公開のファイルとフォルダー | `fs::write_private`、`fs::create_private_dir` | モード`0o600`／`0o700` | macOSと同じ | ACL：所有者のみ |
| システムで開く | `open_path`、`reveal_path`、`open_url` | `open`、`open -R` | `xdg-open` | `ShellExecuteW`、`explorer /select,` |
| ユーザー環境 | `login_env()` | ログインシェル（Dockから起動したアプリの`PATH`は最小限） | macOSと同じ | レジストリとプロセスの環境 |
| プログラムを探す | `which(program)` | `PATH` | `PATH` | `PATH`と`PATHEXT` |
| マシンの情報 | `machine::cores`、`machine::memory`、`machine::free_space` | sysctl、statfs | /proc、statfs | システムAPI |

契約のルール：

- 契約の関数はシステムの型（`pid_t`、`HANDLE`）を返しません。`drivers`か`kit`の型を返します。
- どのプラットフォームでも**期待ではなく証明**です。「プロセスは終了した」は確認された事実であって、シグナルを送ったということではありません。
- オペレーティングシステムが契約の求めることを実行できない場合、関数は何が欠けているかを示すエラーを返します。黙って代替手段を使うことはありません。

契約とそのmacOS側の短い例です。

```rust
// drivers/src/platform/macos.rs
pub fn open_path(path: &Path) -> Result<(), PlatformError> {
    let status = Command::new("/usr/bin/open").arg(path).status()?;
    status.success().then_some(()).ok_or(PlatformError::Refused("open"))
}
```

```rust
// drivers/src/platform/unsupported.rs
pub fn open_path(_path: &Path) -> Result<(), PlatformError> {
    Err(PlatformError::Unsupported("open_path"))
}
```

### 12.3. `platform/`の外で禁止されていること

| `drivers/src/platform/`の外で禁止 | 代わりに使うもの |
|---|---|
| `#[cfg(unix)]`、`#[cfg(windows)]`、`#[cfg(target_os = …)]` | 12.2の契約 |
| `std::os::unix`、`std::os::windows`、`libc`、`nix`、`windows-sys`、`security-framework` | 12.2の契約 |
| `sh -c`、`bash`、`zsh`、`cmd /c`、`powershell` | `Command::new(program).args(…)`。シェルが本当に必要なら、`platform`が選ぶ |
| システムのプログラム名：`open`、`xdg-open`、`security`、`osascript`、`explorer` | `open_path`、`secret::*`、… |
| ハードコードされたパス：`~`、`$HOME`、`/tmp`、`/usr/bin`、`/Applications`、`Library/` | `kit::paths`（12.4） |
| 文字列の`/`によるパスの連結 | `Path::join` |
| 数値で書いたファイルモード（`0o600`） | `fs::write_private` |

唯一の例外は`app/src/platform.rs`で、Tauriだけが知っていることのためのものです。タイトルバーのスタイル、アプリケーションメニュー、ウィンドウのアクティベーションポリシーです。ウィンドウの設定以外は何も置きません。

### 12.4. パス、ファイル、テキスト

- **フォルダーは`kit::paths`からのみ取得します**：`data()`、`config()`、`cache()`、`logs()`、`temp()`。その下では、各システムの慣例（macOSは`~/Library/Application Support/<App>`、LinuxはXDG、Windowsは`%APPDATA%`）に従うライブラリが動きます。すでに古いパスにあるデータは、作られたシステム上ではそのまま残します（5.4の互換性のための例外）。
- **アプリケーションが作るファイル名は小文字です。** また、大文字と小文字の違いだけで区別される名前は作りません。macOSとWindowsの標準のファイルシステムはそれを区別しませんが、Linuxは区別します。
- **誰かが開いているファイルの名前を変えたり削除したりしません。** Windowsはそれを拒否します。アトミックな書き込みは`kit::durable_file`を通します。これは置き換える前にファイルを閉じます。
- **長いパス。** Windowsでは、`\\?\`接頭辞なしのパスはおよそ260文字に制限されます。作業用のコピーや実行用のフォルダーは浅く保ちます。接頭辞を付けるのは`platform`であり、スライスではありません。
- **プロセスからのテキスト**は`\r\n`を許容して読みます。アプリケーションが書くファイルは`\n`を使います。
- **ウィンドウに送るパス**はUTF-8です。UTF-8で表せないパスは、そのファイルを示すエラーにします。決して`unwrap()`にはしません。

### 12.5. プラットフォームのテスト

- **契約のテスト**は`drivers/tests/platform_contract.rs`にあり、どのオペレーティングシステムでも同じです。`terminate`のあとにプロセスが終了していること、書き込んだシークレットが読み戻せて削除後には消えていること、非公開のファイルをほかのユーザーが読めないことを確認します。サポートするすべてのプラットフォームが**同じ**テスト群に合格します。
- **`drivers`の外のテストは、シェルもシグナルも使いません。** テストに必要なプロセスは、`sh -c 'sleep 10'`ではなく、小さなRustプログラム（テスト用crateのバイナリ）です。
- テストでのプラットフォームの`#[cfg]`は、`drivers`のテストでのみ許されます。

### 12.6. 強制

| ルール | 誰が強制するか |
|---|---|
| 12.3の禁止事項 | ベースラインリスト付きのgrepチェック（セクション16） |
| `app`以外のcrateがすべてのプラットフォームでコンパイルできる | UbuntuとWindowsのネイティブなCIランナー上での`cargo check --workspace --exclude <app>`。macOSからのクロスチェックではありません。Cのコードを含むビルドスクリプトにはターゲットのコンパイラーが必要だからです。 |
| 契約が機能している | **サポートする**各プラットフォームのランナー上での`platform_contract.rs` |

### 12.7. 新しいオペレーティングシステムへの移植

1. `drivers/src/platform/<system>.rs`：契約のすべての関数。欠けているものはコンパイラーが列挙します。
2. `mod.rs`：新しいシステムの`cfg`が`unsupported.rs`を指さなくなります。
3. そのシステムのランナーで`platform_contract.rs`がグリーンになり、そのランナーがCIに加わります。
4. `app`：そのシステム向けのバンドルと署名の設定、必要なら`app/src/platform.rs`。
5. リポジトリのコントリビューターガイドで、サポートするプラットフォームの一覧にそのシステムを加えます。

移植で`core`の変更が必要になるなら、何かが漏れています。まず別のプルリクエストでその漏れを契約の後ろに移し、それから移植を続けます。

## 13. エラー

- **各crateは独自のエラーenumを持ちます**（`thiserror`を使います）。スライスは`error.rs`に独自のものを持てます。
- **`core`はドメインのエラーを返します。** `app/error.rs`がそれをウィンドウ向けのコードと文に変換します。文は翻訳テーブルから取り、ワイヤー上のenumの`Display`からは決して取りません。
- **ワイヤーから届いた未知のイベントはエラーではありません。** enumには`#[serde(other)]`を、必須でないフィールドには`Option<T>`を使います。未知の行はデバッグ用にログに残し、先へ進みます。プロバイダーのコマンドラインツールの新しいバージョンが、実行を止めることがあってはなりません。
- **`unwrap()`と`panic!`は禁止です**。`core`、`store`、`drivers`のテスト以外の場所でのことです。エラーの変種を伴う`?`を使うか、値が欠けることのない理由を説明した`expect()`を使います。

```rust
#[derive(Debug, thiserror::Error)]
pub enum RecordingError {
    #[error("the recorder could not start")]
    RecorderDidNotStart(#[source] PlatformError),
    #[error("the recording folder is not writable")]
    FolderNotWritable(#[source] std::io::Error),
    #[error("a recording is already running")]
    AlreadyRunning,
}
```

```rust
// app/src/error.rs
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    code: &'static str,
    message_key: &'static str,
}

impl From<RecordingError> for IpcError {
    fn from(error: RecordingError) -> Self {
        match error {
            RecordingError::RecorderDidNotStart(_) => Self::new("recorder", "errors.recorder"),
            RecordingError::FolderNotWritable(_) => Self::new("folder", "errors.folderNotWritable"),
            RecordingError::AlreadyRunning => Self::new("busy", "errors.recordingRunning"),
        }
    }
}
```

## 14. レイヤーごとのテスト

| レイヤー | テストの方法 | 証拠とみなすもの |
|---|---|---|
| `logic.rs`、`update.rs` | 普通の`#[test]`、tokioなし | 値やエフェクトのリストに対するアサーション |
| `store.rs` | 一時フォルダーに置いたデータベース | 読み取りで返ってくる行 |
| `service.rs` | 本物のストアと偽のドライバーを使う`#[tokio::test]` | 呼び出し後のファイルやデータベースの状態 |
| `actor/` | `Handle`とメッセージの台本。時間は`tokio::time::pause`で | `Snapshot`の列 |
| `drivers` | 本物のプロセス、または記録されたストリーム | プロセスが終了していること（`ESRCH`または空のジョブ）、ワイヤーから届いた行 |
| `app/commands` | エントリを通した統合テスト（エンドツーエンドまたは統合ターゲット） | 人が目にするテキスト |

人に見せるメッセージのテストは、その人が目にする場所に置きます。`logic.rs`だけでは足りません。正しい文を生成する関数も、誰も呼ばなければ何も証明しません。

### 14.1. 統合テストのバイナリは1つ

`tests/`の直下にあるファイルは、それぞれが別のバイナリであり、バイナリごとに別々にリンクされます。大きなワークスペースでは、ファイル1つにつき1分かかります。統合テストは**1つ**のターゲット`tests/it/main.rs`に置き、トピックごとに1つのモジュールにして、単一のトピックはフィルターで実行します。

```
tests/it/
  main.rs          mod recording_stops_on_time_limit; mod transcript_survives_restart; …
  recording_stops_on_time_limit.rs
  transcript_survives_restart.rs
```

```bash
cargo nextest run --test it recording_stops_on_time_limit::
```

`--no-tests=fail`を付けて実行します。そうすれば、何にも一致しないフィルターは、黙ってグリーンになるのではなくレッドになります。

### 14.2. traitを使わない偽のドライバー

テストには、本物のプロセスを起動しないドライバーが必要です。SLATは実装が1つしかないtraitを禁じており、偽物は2つ目の本物の実装には数えません。このルールを守る方法は2つあります。

- **データの継ぎ目。** サービスはドライバーそのものではなく、ドライバーの*出力*を値やチャネルとして受け取ります。テストはそのチャネルに行を送ります。
- **テストビルド。** `drivers`は本物のモジュールと同じ関数を持つ`#[cfg(any(test, feature = "fake"))] pub mod fake;`を公開し、テスト用crateが`fake`フィーチャーを有効にします。

2つ目の本物の実装（2つ目のプロバイダー、2つ目のプラットフォーム）が現れたときが、traitを導入するタイミングです。

## 15. サイズの上限

| 単位 | 警告のしきい値 | 対処 |
|---|---|---|
| ファイル | 1,500行のコード（テストを除く） | 同じ役割のフォルダーに分割する。セクション6.1 |
| スライス | 15,000行 | サブスライスに分割する |
| `core` | 60,000行 | グループを`core-<group>`に移す。セクション5.3 |
| Tauriコマンド | 10行 | ロジックを`service.rs`に移す |
| `AppState`のフィールド | 名詞1つ | セクション11を参照 |

SLATを導入した日にしきい値を超えているファイルは、**ベースラインリスト**に載せます。このリストは縮小することしか許されません。

## 16. 強制

まず仕組み、言葉はその次です。スクリプトで確認できるルールが、誰かの記憶に頼ることがあってはなりません。

| ルール | 誰が強制するか |
|---|---|
| Tauriを知っているのは`app`だけ | `Cargo.toml`（ほかの場所に`tauri`への依存がない） |
| ティアは下方向にのみ依存する | `Cargo.toml` |
| 書き込み用接続を開くのは`store`だけ | grepチェック：`Connection::open`は`store` crateの中だけ。スライスの`store.rs`ファイルは`rusqlite`の型を使うので、依存関係だけでは不十分です。 |
| `#[tauri::command]`は`app/*/commands.rs`の中だけ | grepチェック |
| すべてのコマンドが登録されている | スライスのコマンドと`generate_handler!`を比較するチェック |
| `emit`は`app/*/events.rs`の中だけ | grepチェック |
| スライス間の深いインポートがない | ほかのスライスからの`crate::<a>::<layer>::`を探すチェック |
| `core`に状態を持つ`static`がない | `static .*(Mutex|RwLock)`を探すgrepチェック |
| `update.rs`にI/Oがない | チェック：`update.rs`に`async`、`tokio::`、`std::fs`、`store::`がない |
| オペレーティングシステムは`drivers/src/platform/`と`app/src/platform.rs`の中だけ | 12.3の一覧を使うgrepチェック |
| `app`以外のcrateがすべてのプラットフォームでコンパイルできる | UbuntuとWindowsのCIランナー上での`cargo check` |
| サイズの上限 | 縮小しか許されないベースラインリスト付きのチェック |

どのチェックも、現時点の違反を記した**ベースラインリスト**から始めます。新しい違反はレッドです。修正された違反は同じプルリクエストでリストから削除しなければなりません。そのため、リストが再び増えることはありません。

### 16.1. ベースライン付きのチェック

すべてのチェックは同じ形をしています。違反を見つけ、ベースラインを差し引き、残ったものがあれば失敗します。さらに、すでに修正されたものがベースラインに載っていても失敗します。

```bash
#!/usr/bin/env bash
set -euo pipefail

baseline="checks/baselines/emit.txt"
found="$(grep -rln --include='*.rs' -E '\.emit(_to)?\(' crates src-tauri/src \
  | grep -vE '^src-tauri/src/[a-z_]+/events\.rs$' | sort || true)"

new="$(comm -23 <(printf '%s\n' "$found" | sed '/^$/d') <(sort "$baseline"))"
fixed="$(comm -13 <(printf '%s\n' "$found" | sed '/^$/d') <(sort "$baseline"))"

if [ -n "$new" ]; then
  printf 'emit outside app/<slice>/events.rs:\n%s\n' "$new"
  exit 1
fi
if [ -n "$fixed" ]; then
  printf 'already fixed, remove from %s:\n%s\n' "$baseline" "$fixed"
  exit 1
fi
echo "emit: $(printf '%s\n' "$found" | sed '/^$/d' | wc -l | tr -d ' ') files on the baseline, none new"
```

### 16.2. チェックは失敗できなければならない

チェックを信頼する前に、本物の違反を仕込み、それがレッドになるのを確認してから取り除きます。一度もレッドになったことのないチェックは、一度もテストされていないのと同じです。文字列をgrepするチェックは、その文字列がコメントに現れるだけで通ってしまうことがあります。上のパターンが単語ではなくコードの形（`\.emit(`）に一致させているのはそのためです。

### 16.3. CIのプラットフォームジョブ

```yaml
name: platforms
on: [pull_request]
jobs:
  compile:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo check --workspace --exclude quayside --all-targets
```

実際のリポジトリでは、アクションのバージョンを完全なコミットハッシュで固定してください。このジョブはコンパイルするだけです。製品がまだサポートしていないプラットフォームではテストを実行しないので、コストは小さく済みます。

### 16.4. 一式のチェック

| チェック | ルール |
|---|---|
| `checks/slat-commands.sh` | `#[tauri::command]`は`src-tauri/src/*/commands.rs`の中だけ |
| `checks/slat-registered.sh` | スライスのすべてのコマンドが`generate_handler!`に現れる |
| `checks/slat-emit.sh` | `emit`は`src-tauri/src/*/events.rs`の中だけ |
| `checks/slat-deep-imports.sh` | ほかのスライスからの`crate::<slice>::<layer>::`がない |
| `checks/slat-static-state.sh` | `crates/*-core*`に`static … Mutex|RwLock`がない |
| `checks/slat-pure-update.sh` | `update.rs`に`async`、`tokio::`、`std::fs`、`store::`がない |
| `checks/slat-platform.sh` | `platform/`の外での12.3の禁止事項 |
| `checks/slat-size.sh` | ベースラインにある1,500行超のファイルは縮小することしか許されない |

## 17. レシピ

どのレシピも、古いコードで失敗するテストから始めます。失敗はコンパイルではなくアサーションで起きなければなりません。Rustでは、まず`todo!()`でシグネチャを書きます。そうすればテストはコンパイルされ、正しい理由で失敗します。

### 17.1. 新しい読み取り（クエリ）

1. `core/<s>/model.rs`：結果の型。まだなければ作ります。
2. `core/<s>/store.rs`：読み取りの関数。一時的なデータベースでテストします。
3. `core/<s>/service.rs`：storeとlogicを呼ぶ`pub async fn <verb>(…)`。
4. `core/<s>/mod.rs`：新しい関数や型を`pub use`します。
5. `app/<s>/dto.rs`：DTOと`From<model>`。
6. `app/<s>/commands.rs`：最大10行のコマンド。登録します。
7. フロントエンド：data-accessレイヤーがコマンドを呼びます。

### 17.2. バックグラウンドの状態を持たない新しい変更（コマンド）

17.1と同じです。加えて、判断（許可されるか、何が変わるか）を`logic.rs`にテスト付きの純粋関数として書きます。`service.rs`はそれを呼んで書き込みを行うだけです。

### 17.3. 新しいスライス

1. 名前：機能を表す`snake_case`の単数形の名詞。
2. `core/src/<s>/mod.rs`と、必要なファイルだけ。`core/src/lib.rs`に`pub mod <s>;`。
3. `app/src/<s>/mod.rs`、`commands.rs`、`dto.rs`。そのコマンドを登録します。
4. スライスがバックグラウンドの状態を持つなら：レシピ17.4。

### 17.4. 状態を持つ新しいフロー（アクター）

1. 9.1の3つの条件を確認します。1つでも外れれば：レシピ17.2。
2. `msg.rs`、`state.rs`、`snapshot.rs`：型。
3. `update.rs`：まずテスト（メッセージを入れ、期待するエフェクトと状態が出てくる）、次に実装。
4. `effect.rs`：すべてのエフェクトの`execute`。結果は`Msg`として戻ります。
5. `run.rs`と`handle.rs`：ループと扉。
6. `AppState`に加えるフィールドはちょうど1つ：登録簿か`Handle`。
7. `app/<s>/events.rs`：`Snapshot`を購読し、`emit("<s>:snapshot")`。

### 17.5. 新しいドライバー（外部の世界）

1. `drivers/src/<name>.rs`またはフォルダー。ドライバーはスライスもデータベースも知りません。
2. traitは実装が2つ以上あるときだけ。
3. プロセス：プロセスグループ、終了のエスカレーション、終了の証明。シークレットは引数とログに入れません。これらはすべて`platform`の契約（12.2）を通し、ドライバーの中でシステムコールを直接使うことはありません。
4. スライスは`service.rs`か`effect.rs`からドライバーを使います。

### 17.6. ウィンドウ向けの新しいイベント

1. `core`での変更が、チャネルに`Snapshot`か`Event`を公開します。
2. `app/<s>/events.rs`がそれを購読し、`<s>:<event>`を発行します。
3. フロントエンド：data-accessレイヤーがそれを受け取り、自分のストアを更新します。

### 17.7. 新しいプラットフォーム

セクション12.7を参照してください。

### 17.8. これはどこに置くのか（決定木）

```
Does it call Tauri, the window, MCP or a remote hub?   → app (commands, events, doors)
Does it depend on the operating system?                → drivers/src/platform/ (section 12)
Does it talk to a process, the network, a keychain?    → drivers (through platform contracts)
Is it a database read/write or the schema?             → store (connection) / core/<s>/store.rs (queries)
Is it a pure decision or a calculation?                → core/<s>/logic.rs (or update.rs in an actor)
Is it a domain type?                                   → core/<s>/model.rs
Is it a sequence of steps with I/O?                    → core/<s>/service.rs
Is it state that lives in the background and the window watches? → core/<s>/actor/
Does it have no domain at all (time, paths, ids, files)?          → kit
```

## 18. コーディングエージェントとの協働

SLATは、コードの多くをコーディングエージェントが書くチームの中で設計されました。エージェントは、構成が文書化されていて、短く、機械で確認されているとき、確実にそれに従います。違いを生むのは次の3つです。

1. **決まった構成は、無料の地図です。** 「文字起こしにフィルターを追加して」と指示されたエージェントは、探さずに`core/transcript/`と`app/transcript/`を開きます。エージェントが探すのに費やす時間は、間違えている時間です。
2. **チェックはプロンプトの文に勝ります。** プロンプトに書いた「coreからemitしないこと」は、たいていは守られます。レッドのチェックは毎回守られます。ルールはまずチェックとして書き、チェックできない場合にだけプロンプトの1行にします。
3. **レシピはプロンプトです。** セクション17を番号付きの手順で書いたのは意図的です。レシピをタスクに貼り付ければ、エージェントは期待どおりの場所に、期待どおりの順序でファイルを作ります。

リポジトリのコントリビューターガイド（`AGENTS.md`、`CLAUDE.md`、またはそれに相当するもの）にそのままコピーできるセクションです。

```markdown
## Backend layout: SLAT 1.1

The backend follows SLAT (Slice · Layer · Actor · Tier), version 1.1.
Reference: https://monoone.dev/blog/slat/

- Tiers: app → core → store/drivers → kit. Only `app` depends on tauri.
- A feature is one slice: `crates/<product>-core/src/<slice>/` and `src-tauri/src/<slice>/`.
- Files in a slice: mod.rs, model.rs, logic.rs, store.rs, service.rs, actor/ (only if needed).
- A Tauri command has at most 10 lines and calls one function of its slice.
- Background state belongs to an actor: Msg → update (pure) → Effect.
- Operating-system code only in `drivers/src/platform/`.
- Before adding code, find its place with the decision tree (SLAT section 17.8).
- Checks in `checks/slat-*.sh` enforce this. Do not edit a check to make it pass;
  report it instead.
```

## 19. 既存のコードベースの移行

書き直しは必要ありません。SLATは、アプリケーションが常に動き続ける小さなプルリクエストの積み重ねで導入します。順序は、ほかのブランチの作業を妨げないように選びます。

:::diagram migration

### 19.1. 順序

1. **測定する。** モジュールを洗い出します。モジュールごとの行数、上を向いているインポート、`tauri::`を使うファイル、`#[tauri::command]`の数、状態を持つ`static`、アプリケーションの状態のフィールド、オペレーティングシステム向けの`#[cfg]`です。これをリポジトリ内の計画に書き留めます。これらの数値がベースラインになります。
2. **上向きの依存を逆転させる。** コマンド層にありながら下位のレイヤーから呼ばれているポリシーは、`core/<policy>/`に下ろします。ドメインがエントリ層から借りている型（行のチャネル、画像の型、メッセージの文字列）は、それが属するスライスに移します。古いパスは移行が終わるまで`pub use`として残します。
3. **`app`と`core`を分ける。** ワークスペースと、`tauri`を含まない`core` crateを作ります。Tauriを知っているコードは`app`に残し、それ以外はすべて`git mv`で移します。最も機械的な手順です。
4. **`store`、`drivers`、`kit`を切り出す。** そのコードがすでにきれいな状態になってからです。`drivers`を切り出すときは、オペレーティングシステムのコードを`platform/`に移し、プラットフォームのチェックにベースラインを与えます。
5. **スライスを1つずつ。** プルリクエスト1つにつきスライス1つです。コマンドは`app/<s>/`へ、ロジックは決まった構成で`core/<s>/`へ移します。最も小さく、最も共有されていないものから始めます。
6. **`kit::Jobs`。** キャンセル用のマップがアプリケーションの状態から出ていきます。
7. **アクター。** アプリケーションの状態と`static`変数にあった状態をアクターに移します。プルリクエスト1つにつきフロー1つで、まず現在の振る舞いに対する`update`のテストを書きます。
8. **チェック。** 各手順で、そのルールのチェックをベースライン付きで有効にします。

### 19.2. 移行のルール

- **移動は振る舞いを変えません。** コードを移動するプルリクエストはロジックを直さず、ロジックを直すプルリクエストはコードを移動しません。何かが壊れたとき、どちらの種類の変更が原因かが分かります。
- **古いパスにファサードを置く。** 古いモジュールパスに`pub use new::place::*;`を置けば、触ってはいけない（あるいは、まだ触りたくない）コードや既存のテストが、変更なしでコンパイルされます。ファサードは、何もそれをインポートしなくなったら削除します。
- **重いビルドは一度に1つ。** 大きなワークスペースで`cargo`のビルドを複数並行で走らせると、ノートパソコンが固まることがあります。移行は1本の流れで進めます。
- **テストスイート全体は、コミットごとではなく手順ごとに実行します。** スイートは、振る舞いが何も動いていないことの証明です。

### 19.3. 構成を先に、より速いスタート

いちばんの悩みが見つけやすさなら、作業の順序を入れ替えることもできます。まず、既存の単一のcrateの中で、中身を変えずに**ファイル**をスライスのフォルダーに移し、古いパスにはファサードを残します。Gitはこれをリネームとして記録するので、開いているほかのブランチもきれいにマージできます。1日か2日で地図（各機能のフォルダー）が手に入り、crateの分割、各スライス内のレイヤー、アクターは、すでに読みやすくなった構成の上にあとから進められます。

ここでも、無料ではないことが2つあります。`super::`や`pub(super)`を使うファイルは、移動すると親モジュールが変わるので、いくつかのパスに小さな機械的な修正が必要です。また、中央のファイルからコマンドを移すとそのファイルが変わり、そのファイルを編集しているブランチと競合します。そのため、これは別の第2段階として行うほうがよいでしょう。

### 19.4. よくある失敗

| 問題 | 対処 |
|---|---|
| 何百ものテストが古いパスをインポートしている | 古いパスにファサードを置く。同じプルリクエストでテストを移動しない。 |
| 並行するブランチが`git mv`と競合する | 開いているブランチが最も少ないときにcrateを分割する。移動はそれぞれ独立したプルリクエストにする。 |
| 分割後、`pub(crate)`の項目が別のcrateから必要になる | `pub`に広げる。移行後、`pub(crate)`に戻せるものを見直す。 |
| crateの数に応じてコンパイル時間が延びる | crateは最大6〜8個。重いビルドは一度に1つ。 |
| リファクタリングが黙って振る舞いを変える | まず今日の振る舞いに対する`update`のテストを書く。移動と修正は別々のプルリクエストにする。 |
| コードの一部をまったく変えてはいけない（重要な機能、凍結された領域） | その部分はその場に残し、ファサードを通じてのみ新しい構成とつなぐ。ファサードは追加のみのコードである。 |

## 20. ケーススタディ：Quayside

Quaysideは、この文書のために考案した**架空の**デスクトップアプリケーションです。私たちが作っている種類のソフトウェアをゆるやかに模していますが、以下の名前、数値、ファイルはすべて作りものです。Quaysideは通話を録音し、デバイス上で文字起こしをし、ローカルまたはクラウドのモデルで要約を書き、コーディングエージェントでフォローアップのタスクを実行し、アクションアイテムをチームの共有ボードに同期します。さらに、録音を見守ってメモを送り込めるスマートフォン用のコンパニオンアプリもあります。

Quaysideは小さなチームが急ぎながら2年かけて作ってきたもので、ちゃんと動いています。同時に、セクション1で述べたことすべての見本でもあります。

### 20.1. 移行前

```
src-tauri/src/
  main.rs                 40 lines
  lib.rs                  2,300 lines   setup, 148 commands, emit helpers, menu
  state.rs                AppState with 41 fields
  handlers.rs             31,000 lines  "all the commands"
  handlers/
    recording.rs          6,800 lines
    sync.rs               4,100 lines
    agents.rs             9,700 lines
  engine/
    recorder.rs           imports tauri::AppHandle to emit levels
    transcriber.rs        imports tauri::AppHandle to emit words
  db.rs                   opens SQLite connections in 9 places
  utils.rs                6,400 lines
  companion/              phone hub: crypto, pairing, and AppState everywhere
```

:::diagram chaos

移行の手順1での測定結果です。

| 項目 | 値 |
|---|---|
| Rustの行数（テストを除く） | 約78,000 |
| `tauri::`を使うファイル | 112個中37個 |
| `#[tauri::command]`関数 | 148個、4ファイルに分散 |
| `AppState`のフィールド | 41個、うち14個が`Mutex<…>`またはアトミック |
| 状態を持つ`static` | 12個 |
| 書き込み用のSQLite接続を開く場所 | 9か所 |
| `#[cfg(target_os = …)]`を含むファイル | 23個 |
| `start_recording_*`のバリエーション | 7個 |
| ドメインのテストの実行時間 | ウィンドウが必要なので、誰も実行していない |

### 20.2. コードに現れる症状

アプリケーションの状態（抜粋）です。

```rust
pub struct AppState {
    pub db_path: PathBuf,
    pub recording: Mutex<Option<RecordingSession>>,
    pub recording_cancel: AtomicBool,
    pub level_task: Mutex<Option<JoinHandle<()>>>,
    pub transcribing: Mutex<HashMap<String, CancellationToken>>,
    pub summarizing: Mutex<HashMap<String, CancellationToken>>,
    pub agent_runs: Mutex<HashMap<String, AgentRun>>,
    pub agent_slots: Mutex<usize>,
    pub sync_in_flight: AtomicBool,
    pub companion: Mutex<Option<CompanionHub>>,
    pub model_prices: Mutex<Option<(Instant, PriceList)>>,
    // … 30 more
}
```

録音をまたいで漏れる停止です。ユーザーが停止を押し、すぐに新しい録音を始めます。古い録音のループはまだフラグを読んでいません。新しい録音は何もリセットしません。次に`recording_cancel`を確認したとき、止まるのは**新しい**録音です。

```rust
static RECORDING_CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn stop_recording() {
    RECORDING_CANCEL.store(true, Ordering::SeqCst);
}
```

ドメインがウィンドウと直接やり取りしているので、ウィンドウなしではテストできません。

```rust
pub async fn transcribe(app: AppHandle, file: PathBuf) -> Result<(), String> {
    let mut words = whisper::stream(&file)?;
    while let Some(word) = words.next().await {
        app.emit("transcript-word", &word).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

バリエーションが増殖します。

```rust
pub async fn start_recording(…)
pub async fn start_recording_with_limit(…)
pub async fn start_recording_with_limit_and_device(…)
pub async fn start_recording_for_meeting(…)
pub async fn start_recording_for_meeting_with_limit(…)
pub async fn start_recording_from_companion(…)
pub async fn start_recording_with_test_hook(…)
```

そして、オペレーティングシステムがいたるところにあります。

```rust
#[cfg(target_os = "macos")]
fn reveal(path: &Path) {
    let _ = Command::new("sh").arg("-c").arg(format!("open -R '{}'", path.display())).spawn();
}
```

この最後の例は、引用符を含むファイル名を待っているシェルインジェクションでもあります。

### 20.3. 移行の手順

**手順1：依存を逆転させる。** 文字起こし処理は`AppHandle`を受け取らなくなります。単語は`core`が所有する容量制限付きのチャネルに書き込み、`app`がそのチャネルをウィンドウに流します。アップロードのコードは`AppState`を読まなくなり、必要な2つの値を引数として受け取ります。

```rust
pub async fn transcribe(file: &Path, words: WordSink) -> Result<Outcome<Transcript>, TranscribeError> {
    let mut stream = drivers::whisper::stream(file).await?;
    let mut transcript = Transcript::default();
    while let Some(word) = stream.next().await {
        transcript.push(word.clone());
        if words.send(word) == Sent::Closed {
            return Ok(Outcome::Cancelled);
        }
    }
    Ok(Outcome::Done(transcript))
}
```

**手順2：`app`と`core`を分ける。** `quayside-core`（`tauri`なし）と、`app`としての既存の`src-tauri`からなるワークスペースを作ります。アプリの`lib.rs`には`pub use quayside_core::{…};`を残すので、古いパスはすべて引き続きコンパイルされます。証明として、`core`に`use tauri::Manager;`を仕込むとコンパイルに失敗します。

**手順3：`kit`、`store`、`drivers`。** 9か所あったSQLiteの接続は、`quayside-store`の1つのライターにまとまります。録音処理、文字起こし処理、モデルのクライアント、`git`は`quayside-drivers`に移ります。`#[cfg]`を含む23個のファイルは、`unix.rs`、`macos.rs`、`unsupported.rs`を持つ1つの`platform/`フォルダーになり、`reveal`は契約になります。

```rust
pub fn reveal_path(path: &Path) -> Result<(), PlatformError> {
    let status = Command::new("/usr/bin/open").arg("-R").arg(path).status()?;
    status.success().then_some(()).ok_or(PlatformError::Refused("open -R"))
}
```

シェルも、引用符の処理も、インジェクションもありません。

**手順4：スライス。** `handlers.rs`と`utils.rs`を、小さいものから順にスライスへと分解します。

```
settings → device → model → summary → transcript → board → companion → agent → recording
```

**手順5：`kit::Jobs`。** `transcribing`と`summarizing`（キャンセルトークンを持つ2つのマップ）は、文字起こしサービスの中の1つの`Jobs<TranscriptId>`と、要約サービスの中の1つの`Jobs<SummaryId>`になります。

**手順6：アクター。** 9.1のテストに通る状態は3つです。録音、エージェントの実行、ボードの同期です。最初は録音で、今日の振る舞いに対する`update`のテストを先に書きます。`AtomicBool`はなくなります。停止は対象とする録音の世代を運ぶようになり、20.2の漏れは、ずっとグリーンのままの1行のテストになります。7つの`start_recording_*`関数は1つになります。

```rust
pub struct StartRecording {
    pub title: String,
    pub device: Option<DeviceId>,
    pub meeting: Option<MeetingId>,
    pub limit: Option<Duration>,
    pub origin: Origin,
}
```

**手順7：チェック。** セクション16の各チェックを、そのベースライン付きで有効にします。ほとんどのベースラインはすでに空です。上の手順で違反が取り除かれたからです。

### 20.4. 移行後

```
Cargo.toml                       [workspace]
crates/
  quayside-kit/                  paths, ids, durable_file, jobs, logging
  quayside-store/                writer, schema, migrations
  quayside-drivers/
    src/
      whisper.rs  recorder.rs  models.rs  git.rs
      platform/   mod.rs  unix.rs  macos.rs  unsupported.rs
  quayside-core/
    src/
      recording/  mod.rs model.rs logic.rs service.rs actor/
      transcript/ mod.rs model.rs logic.rs store.rs service.rs
      summary/    mod.rs model.rs service.rs
      agent/      mod.rs model.rs logic.rs store.rs service.rs actor/
      board/      mod.rs model.rs logic.rs store.rs service.rs actor/
      companion/  mod.rs model.rs logic.rs store.rs service.rs
      device/  model/  settings/  guard/
src-tauri/
  src/
    main.rs lib.rs state.rs error.rs platform.rs
    recording/  mod.rs commands.rs dto.rs events.rs
    transcript/ mod.rs commands.rs dto.rs events.rs
    …
    doors/companion/
```

移行後のコマンドです。

```rust
#[tauri::command]
pub async fn recording_stop(
    state: State<'_, AppState>,
    generation: u64,
) -> Result<(), IpcError> {
    state.recordings.send(recording::Msg::Stop { generation }).await?;
    Ok(())
}
```

同じ測定をもう一度行った結果です。

| 項目 | 移行前 | 移行後 |
|---|---|---|
| `tauri::`を使うファイル | 37 | 12、すべて`src-tauri`内 |
| 最長のコマンド | 140行 | 9行 |
| `AppState`のフィールド | 41 | 9 |
| 状態を持つ`static` | 12 | 0 |
| 書き込み用のSQLite接続 | 9か所 | 1 |
| オペレーティングシステムの`#[cfg]`を含むファイル | 23 | 3、すべて`platform/`内 |
| `start_recording_*`のバリエーション | 7 | 1 |
| ドメインのテスト | ウィンドウが必要だった | ウィンドウなしで数秒で実行 |
| LinuxとWindows向けのコンパイル（`app`を除く） | できない | できる、CIで確認 |

これらの数値は説明のためのものです。大切なのは変化の形です。どの行も、所有者は1人、場所は1つ、ルールは1つ、という方向に動きました。

## 21. 導入チェックリストとFAQ

### 21.1. 新しいプロジェクトのチェックリスト

- 2つのcrateを持つワークスペース：`<product>-core`（`tauri`なし）と`app` crate。
- 初日から`kit::paths`を使う。ホームや一時フォルダーのパスをハードコードしない。
- 最初のシステムコールが現れたらすぐに、`mod.rs`、`unix.rs`、自分のプラットフォームのファイル、`unsupported.rs`を持つ`drivers/src/platform/`を用意する。
- すべての機能を決まったファイルを持つスライスにする。コマンドは最大10行。
- イベントは`app/<slice>/events.rs`からのみ発行する。
- 統合テストのターゲットは1つ、`tests/it/`。
- ベースラインがまだ空の最初の週から、セクション16のチェックをCIで動かす。
- コントリビューターガイドにセクション18のSLATのセクションを入れる。

### 21.2. 既存のプロジェクトのチェックリスト

- 測定結果の表を計画としてコミットする（19.1、手順1）。
- 有効にするすべてのチェックについて、ベースラインリストを作る。
- 変えてはいけないものを決め、それに対するファサードを用意する。
- 手順2〜8を別々のプルリクエストとして予定し、crateの分割は開いているブランチが少ない時期に合わせる。

### 21.3. よくある質問

**SLATはTauri専用ですか？**
いいえ。「Tauriコマンド」を自分のエントリ（HTTPハンドラー、CLIサブコマンド、メッセージのコンシューマー）に置き換え、それ以外はそのまま使ってください。`app`ティアは単に「エントリのフレームワークを知っている唯一のcrate」です。

**なぜ、あらゆる場所にポートを置くヘキサゴナルアーキテクチャではないのですか？**
traitとしてのポートは、実装が2つあるときに価値があります。デスクトップアプリケーションのドライバーの多くは、実装が1つです。SLATは2つ目の実装が現れるまで具体的な型を使い、テストのしやすさは純粋な`logic`／`update`関数とデータの継ぎ目から得ます。

**小さなアプリに5つのティアは多すぎませんか？**
2つ（`core`と`app`）から始めてください。ほかのティアは、そのコードが存在し、きれいな状態になってから加えます。

**すべてのスライスにすべてのファイルが必要ですか？**
いいえ。必要のないファイルは存在しません。小さなスライスは1つの`mod.rs`だけで構いません。

**どんなときに、サービスではなくアクターになるのですか？**
9.1の3つの条件がすべて成り立つときです。迷うなら、それはサービスです。あとからサービスをアクターに変えるのは、1つのスライスの中に収まる変更です。

**2つのスライスが互いを必要とする場合は？**
共有部分を独立したスライスにし、両方がそれに依存するようにします。循環は決して許されません。

**なぜコマンドの上限は10行なのですか？**
変換だけを行うコマンドには、専用のテストが要らないからです。10行あれば、デシリアライズし、呼び出し、変換するには十分です。判断を隠すには足りません。

**SLATでコンパイルは遅くなりますか？**
crateに分割すると、たいていはインクリメンタルビルドが速くなります。1つのスライスを変更しても、`kit`、`store`、`drivers`は再ビルドされないからです。クリーンビルドはリンクの手順が増える分、少し遅くなることがあります。SLATがcrateの数に上限を設けているのはそのためです。

**macOSでしか提供していません。今、セクション12に取り組む価値はありますか？**
はい、そのうち安価な部分には価値があります。`kit::paths`、すでにある少数のシステムコールに対する契約、`unsupported.rs`、そしてLinuxとWindowsでのコンパイルジョブです。今なら数日のコストで済み、のちにコードベース全体を捜索する手間が省けます。`linux.rs`と`windows.rs`のファイルそのものは、移植を決めるまで待って構いません。

**コーディングエージェントはSLATにどう対応しますか？**
うまく対応します。構成が決まっていて、重要なルールが助言ではなくチェックになっているからです。セクション18を参照してください。

## 22. バージョン履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| 1.1 | 2026年10月25日 | セクション12「*プラットフォーム*」：`drivers`内の`platform/`フォルダー、プラットフォーム契約、`platform/`の外での禁止事項、パス・ファイル・テキストのルール、プラットフォームのテスト、LinuxとWindowsでのCIのコンパイルジョブ、移植のレシピ。ティア、強制、レシピ、決定木への追記。 |
| 1.0 | 2026年10月24日 | 最初のバージョン：ティア、決まったレイヤーを持つスライス、インポートのルール、データの流れ、アクター、コンポジションルートとしてのアプリケーションの状態、エラー、テスト、サイズの上限、強制、レシピ、移行。 |

SLATはライブラリと同じようにバージョン管理されます。ルールの変更はマイナーバージョンを上げます。既存の準拠したコードを非準拠にする変更は、メジャーバージョンを上げます。SLATに従うリポジトリはすべて、従っているバージョンをコントリビューターガイドに明記します。
