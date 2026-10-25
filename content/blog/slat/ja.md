SLATは、Rustで書かれ、ウィンドウ層にTauriを使うデスクトップアプリケーションのバックエンドを構成するためのパターンです。コードベースが大きくなると、どのチームもいずれ次の3つの問いを誤ります。SLATはその3つに答えます。**このファイルはどこに置くのか**、**誰が誰をインポートしてよいのか**、そして**ウィンドウ、ドメイン、外部の世界の間でデータがどう流れるのか**です。

名前は4つの構成要素を並べたものです。**S**lice、**L**ayer、**A**ctor、**T**ierです。この文書のすべてのルールは、このいずれかに関するものです。

このページは完全なリファレンスです。SLATを初めて見るチームでも、私たちに何も質問せずに、新しいプロジェクトに導入したり既存のプロジェクトを移行したりできるように書いています。ルールとその理由、そのまま使えるコード、ルールを強制するチェック、そして散らかったアプリケーションを一歩ずつ整えていく具体例を含みます。

セクション番号は固定です。SLATに従うリポジトリは、同じ番号を付けたルールの短い写しを`docs/slat/SLAT.md`に置きます。そのため「セクション17.8」のような参照は、このページでもリポジトリでも同じものを指します。両者が食い違ったときは、同じ日のうちに両方を直します。新しいセクションはバージョン履歴の直前に加えます。バージョン履歴は常に最後に置きます。

> **バージョン1.3** · 2026年10月25日。バージョン1.3ではセクション23「*プラグイン*」を追加しました。ユーザーが機能をオンにしたりオフにしたりできる製品のための、任意のパートです。機能をプラグインにするべきとき、向きに関する唯一のルール（ベーススライスはプラグインスライスを決してインポートしない）、拡張ポイント、起動時に切り替える1つのビルド、そしてそれを正直に保つチェックを扱います。プラグインのないワークスペースには変更は要りません。バージョン1.3では、ガイドのほかの部分のうち、自己矛盾していた箇所や疑問を残していた箇所も直しました。22.1のテストコマンドから、9.4の完全なアクターの例までです。全履歴はセクション24にあります。

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
| **コマンド**（Command） | 状態の変更。*Tauriコマンド*は別物です。ウィンドウが呼び出す関数のことで、クエリを実行することもコマンドを実行することもあります。 | アクション |
| **イベント**（Event） | 何かが変わったことを、問われずにバックエンドがフロントエンドに伝えるもの。 | ストアへのプッシュ |
| **プラットフォーム**（Platform） | ビルド対象のオペレーティングシステム：`macos`、`linux`、`windows`。 | ブラウザーのターゲット |
| **プラットフォーム契約**（Platform contract） | `drivers::platform`にある関数で、どのオペレーティングシステムでも同じ意味を持つもの。 | ポリフィル |
| **プラグイン**（Plugin） | ユーザーがオンにもオフにもできる機能：マニフェストを持つ1つ以上のスライス（セクション23、任意）。 | 遅延読み込みされる機能ライブラリ |
| **ベーススライス**（Base slice） | 常にオンのスライス。プラグインスライスを決してインポートしません。 | シェルライブラリ |
| **フック**（Hook） | ベーススライスが提供し、プラグインがデータで答える拡張ポイント。 | `multi: true`を付けたインジェクショントークン |

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
| `store` | 永続化：書き込み用接続と読み取り用接続、マイグレーション、スキーマ、インデックスの再構築、データベースの暗号化。 | `kit` | `tauri`、ドメインロジック、プロセス |
| `drivers` | 外部の世界：プロセス、プロバイダーのコマンドラインツール、HTTP、サイドカー。オペレーティングシステムに依存するコードは`drivers/src/platform/`にのみ置く。 | `kit` | `tauri`、`store`、ドメインロジック |
| `core` | すべてのドメインスライス：モデル、ロジック、ユースケース、アクター。 | `kit`、`store`、`drivers` | `tauri` |
| `app` | エントリ：Tauriコマンド、DTO、イベント、エントリサーバー（MCP、ブリッジ）、アプリケーションの状態、`setup`、`main`。 | ほかのすべてのティア | ドメインロジック（それは`core`に属する） |

この文書では、`core/…`と`app/…`は2つのcrateのソースフォルダーの略記です。`core/src/<slice>/`は`crates/<product>-core/src/<slice>/`のことであり、`app/src/<slice>/`は`src-tauri/src/<slice>/`、つまりTauriがアプリのcrateのために作るフォルダーのことです。セクション16のチェックは完全なパスを使います。

SLAT ワークスペースの形です。セクション 20 のサンプルアプリケーション Quayside の移行後の姿を、2つのスライスと4つのチェックに縮めています。すべてのスライスはセクション 20.4 にあります。

```tree
quayside/
├── Cargo.toml
├── package.json
├── docs/
│   └── slat/
│       └── SLAT.md
├── checks/
│   ├── baselines/
│   │   └── emit.txt
│   ├── slat-commands.sh
│   ├── slat-emit.sh
│   ├── slat-platform.sh
│   └── slat-pure-update.sh
├── crates/
│   ├── quayside-kit/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── ids.rs
│   │       ├── paths.rs
│   │       ├── durable_file.rs
│   │       └── jobs.rs
│   ├── quayside-store/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── writer.rs
│   │       ├── schema.rs
│   │       └── migrations/
│   ├── quayside-drivers/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── whisper.rs
│   │       ├── recorder.rs
│   │       └── platform/
│   │           ├── mod.rs
│   │           ├── unix.rs
│   │           ├── macos.rs
│   │           └── unsupported.rs
│   └── quayside-core/
│       ├── Cargo.toml
│       ├── src/
│       │   ├── lib.rs
│       │   ├── recording/
│       │   │   ├── mod.rs
│       │   │   ├── model.rs
│       │   │   ├── logic.rs
│       │   │   ├── service.rs
│       │   │   └── actor/
│       │   │       ├── mod.rs
│       │   │       ├── msg.rs
│       │   │       ├── state.rs
│       │   │       ├── update.rs
│       │   │       ├── effect.rs
│       │   │       ├── run.rs
│       │   │       ├── handle.rs
│       │   │       └── snapshot.rs
│       │   └── transcript/
│       │       ├── mod.rs
│       │       ├── model.rs
│       │       ├── logic.rs
│       │       ├── store.rs
│       │       └── service.rs
│       └── tests/
│           └── it/
│               ├── main.rs
│               └── recording_stops_on_time_limit.rs
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── state.rs
│       ├── error.rs
│       ├── recording/
│       │   ├── mod.rs
│       │   ├── commands.rs
│       │   ├── dto.rs
│       │   └── events.rs
│       └── transcript/
│           ├── mod.rs
│           ├── commands.rs
│           └── dto.rs
└── src/
    └── sections/
        ├── recording/
        └── transcript/
```

### 5.1. コンパイラーが番人

ティア間の矢印は、各crateの`Cargo.toml`に書かれます。`core`が依存関係に`tauri`を含めていなければ、`core`の中の`use tauri::Manager;`はコンパイルエラーになります。これはルールが持てる最も強い保証です。忘れられることも、レビューで見落とされることも、議論で覆されることもありません。

最小のワークスペースは次のとおりです。

`Cargo.toml`:

```toml
[workspace]
resolver = "3"
members = ["crates/*", "src-tauri"]

[workspace.dependencies]
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"] }
serde = { version = "1", features = ["derive"] }
thiserror = "2"
```

`crates/quayside-core/Cargo.toml`:

```toml
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

`src-tauri/Cargo.toml`:

```toml
[package]
name = "quayside"
version = "0.1.0"
edition = "2024"

[lib]
name = "quayside_lib"

[dependencies]
quayside-core = { path = "../crates/quayside-core" }
quayside-store = { path = "../crates/quayside-store" }
quayside-kit = { path = "../crates/quayside-kit" }
tauri = { version = "2", features = [] }
```

### 5.2. 最初はいくつのcrateから始めるか

最小は2つ、`core`と`app`です。ほかのティアは、そのコードがすでに存在していて、きれいな状態になってから切り出します。きれいとは、上位のティアから何もインポートしていないことです。**「あとで使う」ための空のcrateは禁止です。** ビルドのたびにコンパイラーの実行が1回増え、テストのたびにそのcrate自身のテストバイナリのリンクが増えるだけで、何も得られません。

### 5.3. ティアを分割するとき

`core`がおよそ60,000行を超えたとき、または1つのスライスを変更したあとの`core`のフルリビルドが苦痛になったときは、スライスのグループを`core-<group>`に移します。たとえば`quayside-core-run`です。crateは多くても6〜8個にとどめます。ライブラリのcrateはリンクされませんが、crateごとに自身のテストバイナリがあり、それぞれが別々にリンクされます（セクション22.1）。ノートパソコンでは、細かく分割して節約できる数秒よりも、マシンが固まることのほうが高くつきます。感覚ではなく測定で決めてください。`cargo build --timings`を使えば、`core`が本当にボトルネックなのかが分かります（セクション22.6）。

**行数だけでなく、コンパイルの重さで分割します。** 大きなネイティブライブラリや機械学習のライブラリ（音声認識、推論ランタイム、Cのソースからコンパイルされるデータベース）を包むドライバーは、Tauriそのものより重いことがよくあります。`drivers`の中にあると、`core`が`drivers`に依存しているため、`core`のすべてのテストバイナリにコンパイルされ、リンクされます。そのようなドライバーには、`core`が依存しない専用のcrate、`<product>-drivers-<name>`を与えます。`app`がそれに依存し、その出力をデータの継ぎ目（14.2）を通してスライスに渡します。あるいは、ドライバーを`app`が起動する別のヘルパープロセスとして動かします。こうすれば、`core`のテストがそれをコンパイルすることはありません。`cargo-deny`がその状態を保ちます。`deny.toml`（16.5）に`{ crate = "quayside-drivers-speech", wrappers = ["quayside"] }`と書けば、そのcrateへのほかの経路はすべてレッドになります。

### 5.4. 互換性のための例外

Tauriのバンドラーやユーザーのデータがすでに知っているライブラリ名（たとえば`quayside_lib`や、ユーザーのホームディレクトリにあるフォルダー）は、`app` crateにそのまま残します。新しいcrateには新しい名前を付けます。

## 6. スライス

スライスは製品の1つの機能です。名前は`snake_case`の単数形の名詞です：`recording`、`transcript`、`board`、`trigger`。`recordings_manager`や`utils`ではありません。製品にフロントエンドがある場合、スライス名はフロントエンドの機能フォルダーと一致させます。そうすれば、同じ単語で両側のコードが見つかります。

スライスは2つのティアに存在します。ドメインは`core`に、エントリ（コマンド、DTO、イベント）は`app`にあります。

:::diagram slice

### 6.1. `core`のスライス

```tree
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

pub use model::{Transcript, TranscriptId, Word};
pub use service::TranscriptService;
```

### 6.2. `app`のスライス

```tree
app/src/<slice>/
  mod.rs        `mod …;` and `pub mod commands;` (the command list itself is in lib.rs, 6.4)
  commands.rs   #[tauri::command] functions; at most 10 lines each
  dto.rs        wire types: serde camelCase, #[serde(other)] on enums, From<model>, From<error> for IpcError
  events.rs     event names and payloads sent to the window; snapshot subscription loops
```

`app` crateの残りの部分です。

```tree
app/src/
  main.rs       calls lib::run(); nothing else
  lib.rs        run(): Builder, plugins, setup, generate_handler! with every command, grouped by slice
  state.rs      AppState: the composition root, section 11
  error.rs      entry error → code and text for the window
  platform.rs   optional: window and menu settings that depend on the operating system, section 12.3
  doors/        entries other than the window: MCP server, bridge for agents, remote hub
```

### 6.3. コマンドの基準形

```rust
#[tauri::command]
pub async fn transcript_search(
    state: State<'_, AppState>,
    input: SearchInput,
) -> Result<Vec<TranscriptHitDto>, IpcError> {
    let hits = state.transcripts.search(input.into()).await?;
    Ok(hits.into_iter().map(Into::into).collect())
}
```

コマンドに`if`、ループ、スライスへの2回の呼び出しが必要なら、そのロジックは`service.rs`か`logic.rs`に属します。10行という制限は書き方の好みの問題ではありません。変換だけを行うコマンドには、専用の単体テストが要りません。そのロジックはスライスでテストされているからです。残る証明は人が目にする文であり、それはエントリを通したエンドツーエンドでテストします（セクション14）。

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
| `app/<slice>/dto.rs` | そのスライスの`model`とエラー型、`IpcError` | `service`、`store` |
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

`app/src/recording/events.rs`:

```rust
pub fn spawn(app: AppHandle, recordings: recording::Handle) {
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

スライスによっては、小さなイベントを大量に生み出します。ログの行、文字起こしの単語、進捗の刻みなどです。1行ごとに1つのTauriイベントを発行してはいけません。スライスには`core`の中に容量制限付きのチャネルを持たせます。これはスライス自身の小さな送信側の型（たとえばセクション20.3の`WordSink`）で、その`send`は決して待たず、何が起きたかを返します。たとえば`Sent::Delivered`、`Sent::Dropped`、`Sent::Closed`です。`app/<s>/events.rs`には、数ミリ秒ごとに行をまとめて`tauri::ipc::Channel`に流す**ポンプ**を持たせます。容量制限付きのチャネルがバックプレッシャーになります。ウィンドウが遅いとき、スライスはメモリーを埋め尽くす代わりにそれを知ることができ（`Sent::Dropped`）、もう誰も聞いていないとき（`Sent::Closed`）、スライスは止まることができます。まとめ方、チャネル、フレームレートはエントリの関心事であり、`app`に置きます。

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

```tree
core/src/<slice>/actor/
  mod.rs        pub use Deps, Handle, Msg, Snapshot, spawn
  msg.rs        enum Msg: everything that can happen (from the window, a process, a timer)
  state.rs      struct State: the only place where the state exists
  update.rs     fn update(state: &mut State, msg: Msg) -> Vec<Effect>; pure, no I/O, no async
  effect.rs     enum Effect + async fn execute(effect, &Deps) -> Option<Msg>
  run.rs        the loop: recv → update → execute → snapshot.send; started with tokio::spawn
  handle.rs     struct Handle { tx, snapshot }: send(), current(), subscribe(); ask() with a oneshot only when a caller needs a reply
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

録音プロセスを起動し、時間制限を課し、停止（ファイルは残す）またはキャンセル（ファイルは破棄する）ができる録音アクターです。型名と関数名はすべて説明のためのものです。

`msg.rs`:

```rust
pub enum Msg {
    Start { title: String, limit: Duration },
    Started { generation: u64, pid: ProcessId },
    Level { generation: u64, db: f32 },
    Stop { generation: u64 },
    Cancel { generation: u64 },
    TimedOut { generation: u64 },
    Ended { generation: u64, outcome: Outcome<RecordingFile> },
    Failed { generation: u64 },
}
```

`state.rs`:

```rust
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
    Failed,
}

impl Phase {
    pub fn is_active(&self) -> bool {
        matches!(self, Phase::Starting | Phase::Recording { .. } | Phase::Stopping)
    }
}
```

`effect.rs`:

```rust
pub enum Effect {
    SpawnRecorder { generation: u64, title: String },
    StopRecorder { generation: u64, pid: ProcessId },
    CancelRecorder { generation: u64, pid: ProcessId },
    StartTimer { generation: u64, after: Duration },
    Persist { generation: u64, file: RecordingFile },
}

#[derive(Clone)]
pub struct Deps {
    pub recorder: drivers::recorder::Recorder,
    pub recordings: Arc<RecordingStore>,
}

pub async fn execute(effect: Effect, deps: &Deps) -> Option<Msg> {
    match effect {
        Effect::SpawnRecorder { generation, title } => Some(match deps.recorder.start(&title).await {
            Ok(pid) => Msg::Started { generation, pid },
            Err(_) => Msg::Failed { generation },
        }),
        Effect::StopRecorder { generation, pid } => Some(match deps.recorder.stop(pid).await {
            Ok(file) => Msg::Ended { generation, outcome: Outcome::Done(file) },
            Err(_) => Msg::Failed { generation },
        }),
        Effect::CancelRecorder { generation, pid } => Some(match deps.recorder.discard(pid).await {
            Ok(()) => Msg::Ended { generation, outcome: Outcome::Cancelled },
            Err(_) => Msg::Failed { generation },
        }),
        Effect::StartTimer { generation, after } => {
            tokio::time::sleep(after).await;
            Some(Msg::TimedOut { generation })
        }
        Effect::Persist { generation, file } => match deps.recordings.save(&file).await {
            Ok(()) => None,
            Err(_) => Some(Msg::Failed { generation }),
        },
    }
}
```

`update.rs`:

```rust
pub fn update(state: &mut State, msg: Msg) -> Vec<Effect> {
    match msg {
        Msg::Start { title, limit } if !state.phase.is_active() => {
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
                    vec![Effect::StopRecorder { generation, pid }]
                }
                _ => vec![],
            }
        }
        Msg::Cancel { generation } if generation == state.generation => {
            match state.phase.clone() {
                Phase::Recording { pid } => {
                    state.phase = Phase::Stopping;
                    vec![Effect::CancelRecorder { generation, pid }]
                }
                _ => vec![],
            }
        }
        Msg::Ended { generation, outcome } if generation == state.generation => {
            state.level_db = None;
            match outcome {
                Outcome::Done(file) => {
                    state.phase = Phase::Saved(file.clone());
                    vec![Effect::Persist { generation, file }]
                }
                Outcome::Cancelled => {
                    state.phase = Phase::Cancelled;
                    vec![]
                }
            }
        }
        Msg::Failed { generation } if generation == state.generation => {
            state.phase = Phase::Failed;
            state.level_db = None;
            vec![]
        }
        _ => vec![],
    }
}
```

新しい録音は、進行中のものがなければいつでも開始できます。以前の録音が保存されたあとやキャンセルされたあとも同じです。最後の分岐こそが世代の要点です。以前の録音から届いた`Level`、`TimedOut`、`Ended`メッセージは古い世代を持っているので、何も変えません。

録音の進行中に届いた`Start`も、何も変えません。そのときウィンドウはStartを出しません。スナップショットが録音中であることを示しているからです。答えが必要な呼び出し側は、oneshotを使った`ask`を使います（9.2）。`Failed`は、録音プロセスが開始、停止、保存のいずれかをできなかったときの終わりです。ドライバーはそのエラーを返す前に、すでにプロセスを終了させ、終了したことを証明しています（17.5）。そのため`Failed`が録音プロセスを動かしたまま残すことはありません。

`run.rs`:

```rust
pub fn spawn(deps: Deps) -> Handle {
    let (tx, mut rx) = mpsc::channel(64);
    let (snapshot_tx, snapshot_rx) = watch::channel(Snapshot::default());
    let mailbox = tx.downgrade();
    tokio::spawn(async move {
        let mut state = State::default();
        while let Some(msg) = rx.recv().await {
            for effect in update(&mut state, msg) {
                let deps = deps.clone();
                let mailbox = mailbox.clone();
                tokio::spawn(async move {
                    if let Some(next) = execute(effect, &deps).await {
                        if let Some(mailbox) = mailbox.upgrade() {
                            let _ = mailbox.send(next).await;
                        }
                    }
                });
            }
            let next = Snapshot::from(&state);
            snapshot_tx.send_if_modified(|current| {
                let changed = *current != next;
                if changed {
                    *current = next;
                }
                changed
            });
        }
    });
    Handle::new(tx, snapshot_rx)
}
```

`handle.rs`:

```rust
#[derive(Clone)]
pub struct Handle {
    tx: mpsc::Sender<Msg>,
    snapshot: watch::Receiver<Snapshot>,
}

impl Handle {
    pub(super) fn new(tx: mpsc::Sender<Msg>, snapshot: watch::Receiver<Snapshot>) -> Self {
        Self { tx, snapshot }
    }

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

`snapshot.rs`:

```rust
#[derive(Clone, Default, PartialEq, Debug)]
pub struct Snapshot {
    pub generation: u64,
    pub phase: Phase,
    pub title: Option<String>,
    pub level_db: Option<i8>,
}

impl From<&State> for Snapshot {
    fn from(state: &State) -> Self {
        Self {
            generation: state.generation,
            phase: state.phase.clone(),
            title: state.title.clone(),
            level_db: state.level_db.map(|db| db.round() as i8),
        }
    }
}
```

`mod.rs`:

```rust
mod effect;
mod handle;
mod msg;
mod run;
mod snapshot;
mod state;
mod update;

pub use effect::Deps;
pub use handle::Handle;
pub use msg::Msg;
pub use run::spawn;
pub use snapshot::Snapshot;
```

ウィンドウは、StopとCancelに必要な世代をスナップショットから取ります。ループはスナップショットが変わったときだけ送り（`send_if_modified`）、レベルは整数のデシベルに丸めます。そのため、数ミリ秒ごとに報告するメーターでも、報告のたびにウィンドウへのイベントが生まれることはありません。ウィンドウが描画できるより速く変わる値は、スナップショットではなくストリーム（8.4）に属します。

ループは、自分のエフェクトの結果のために弱い送信側だけを持ちます。最後の`Handle`がドロップされると`recv`が`None`を返し、アクターはいつまでも待ち続けるのではなく終了します。

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

少数のテストは、`tokio::time::pause()`、データの継ぎ目または偽のドライバー（14.2）、スナップショットの列に対するアサーションを使い、`Handle`を通じてアクター全体を動かします。

## 10. バリエーションの爆発

`start_with_budget`、`start_with_slots`、`start_with_snapshot_hook`、`start_with_budget_and_slots`のような関数の一族は、リクエスト用の構造体が欠けているというサインです。この一族を、1つの入口関数と1つのオプション構造体に置き換えます。

```rust
pub struct StartRequest {
    pub workflow: WorkflowRef,
    pub task: Option<String>,
    pub at_once: Option<NonZeroUsize>,
    pub budget: Option<Money>,
    pub origin: Option<Origin>,
    #[cfg(any(test, feature = "test-hooks"))]
    pub faults: Faults,
}

impl StartRequest {
    pub fn new(workflow: WorkflowRef) -> Self {
        Self {
            workflow,
            task: None,
            at_once: None,
            budget: None,
            origin: None,
            #[cfg(any(test, feature = "test-hooks"))]
            faults: Faults::default(),
        }
    }
}

pub async fn start(deps: &Deps, request: StartRequest) -> Result<Outcome<RunId>, StartError> {
    todo!()
}
```

呼び出し側は`StartRequest { budget: Some(limit), ..StartRequest::new(workflow) }`と書きます。リクエストに欠かせないフィールドは`new`の引数なので、ワークフローのないリクエストはコンパイルできません。`Default`があれば、そうしたリクエストを作れてしまいます。新しいオプションは新しいフィールドを1つ追加するだけで、新しい関数も、すべての呼び出し側への1行の追加も要りません。テスト専用の注入点（`faults`、`hooks`）は、テストビルドにだけ存在するフィールドです。`cfg(test)`だけではそのcrate自身の単体テストしか対象にならないので、統合テストやほかのcrateは`test-hooks`フィーチャーでこれらのフィールドを有効にします。14.2の偽のドライバーと同じ考え方です。どのテストコマンドでも同じ方法で有効にしてください（セクション22.3）。そうしないと、フィーチャーありのビルドとなしのビルドを切り替えるたびに、そのcrateとその上にあるすべてが再びコンパイルされます。

## 11. AppState、コンポジションルート

`AppState`はアプリケーションを組み立てるだけで、それ以外のことはしません。保持してよいのは次のものです。

- スライスの`Arc<…Service>`と`…Handle`の値
- 読み取り専用の設定
- データベースのライターへのハンドル

保持してはいけないのは次のものです。

- 何らかのバックグラウンド処理を表す`Mutex<Option<…>>`、`AtomicBool`、`Mutex<HashMap<…>>`。それはアクターの状態であり、`core/<slice>/actor/state.rs`に属します。
- 1つのスライスの詳細であるフィールド（キャッシュ、キャンセル用のマップ、キュー）。

また、スライスは`static`変数（`OnceLock<Mutex<…>>`、`LazyLock<Mutex<…>>`）に状態を隠してもいけません。唯一の例外は、一度だけ計算され、プロセスが生きている間は変わらない定数（`OnceLock<PathBuf>`）です。

**判定方法：** `AppState`のすべてのフィールドは、スライスの名詞1つで説明できます（「recordings」「runs」「account」）。説明に文が必要なフィールドは、スライスの中に属します。

```rust
pub struct AppState {
    pub paths: kit::paths::AppPaths,
    pub store: store::Store,
    pub recordings: recording::Handle,
    pub transcripts: Arc<transcript::TranscriptService>,
    pub boards: board::Handle,
    pub triggers: trigger::Handle,
    pub account: Result<Arc<account::AccountService>, account::Unavailable>,
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

これはセクション11のルールの抜け穴ではありません。あのルールが扱うのは状態がどこにあるかであって、その型ではありません。`kit::Jobs`の中のロックは、1つのスライスのサービスが所有し、`await`をまたいで保持されることがないので、そのスライスの非公開の詳細です。同じマップを`AppState`のフィールドにすれば、誰も所有しない状態になります。

## 12. プラットフォーム

*バージョン1.1で追加。*

製品は、今は1つのオペレーティングシステム（たとえばmacOSだけ）で提供しているかもしれません。SLATはコードを、次のオペレーティングシステムへの対応がリポジトリ全体の捜索ではなく**1つのフォルダー**の作業で済むように配置します。ルールは1つです。**オペレーティングシステムを知っているのは`drivers/src/platform/`だけです。** それ以外はすべて概念（プロセスグループ、シークレット、データフォルダー、ファイルを開くこと）を求め、システムコールを求めることはありません。

サポートするプラットフォームの一覧は、SLATではなくリポジトリ（そのコントリビューターガイド）に属します。

:::diagram platform

### 12.1. 構成

```tree
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

`drivers/src/platform/macos.rs`:

```rust
pub fn open_path(path: &Path) -> Result<(), PlatformError> {
    let status = Command::new("/usr/bin/open").arg(path).status()?;
    status.success().then_some(()).ok_or(PlatformError::Refused("open"))
}
```

`drivers/src/platform/unsupported.rs`:

```rust
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

- **フォルダーは`kit::paths`からのみ取得します**：`data()`、`config()`、`cache()`、`logs()`、`temp()`。その下では、各システムの慣例（macOSは`~/Library/Application Support/<App>`、LinuxはXDG、Windowsは`%APPDATA%`）に従うライブラリが動きます。すでに古いパスにあるデータは、そのまま残します（5.4の互換性のための例外）。古いフォルダーが存在するときは`kit::paths`がそれを返すので、コードは引き続き`kit::paths`に尋ねるだけです。どちらを選ぶかは、オペレーティングシステムではなく、そのフォルダーが存在するかどうかで決まります。だから`kit`自体には`#[cfg]`がありません。システムの慣例はライブラリから来ます。
- **アプリケーションが作るファイル名は小文字です。** また、大文字と小文字の違いだけで区別される名前は作りません。macOSとWindowsの標準のファイルシステムはそれを区別しませんが、Linuxは区別します。
- **誰かが開いているファイルの名前を変えたり削除したりしません。** Windowsはそれを拒否します。アトミックな書き込みは`kit::durable_file`を通します。これは置き換える前にファイルを閉じます。
- **長いパス。** Windowsでは、`\\?\`接頭辞なしのパスはおよそ260文字に制限されます。作業用のコピーや実行用のフォルダーは浅く保ちます。接頭辞を付けるのは`platform`であり、スライスではありません。
- **プロセスからのテキスト**は`\r\n`を許容して読みます。アプリケーションが書くファイルは`\n`を使います。
- **ウィンドウに送るパス**はUTF-8です。UTF-8で表せないパスは、そのファイルを示すエラーにします。決して`unwrap()`にはしません。

### 12.5. プラットフォームのテスト

- **契約のテスト**は`drivers/tests/it/platform_contract.rs`にあり（crateの単一の統合ターゲットのモジュールです。14.1）、どのオペレーティングシステムでも同じです。`terminate`のあとにプロセスが終了していること、書き込んだシークレットが読み戻せて削除後には消えていること、非公開のファイルをほかのユーザーが読めないことを確認します。サポートするすべてのプラットフォームが**同じ**テスト群に合格します。
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
- **`core`はドメインのエラーを返します。** `app/<slice>/dto.rs`が、スライスのエラーをウィンドウ向けのコードと文のキーに変換します。置き場所は、そのスライスのほかのワイヤー型の隣です。`app/error.rs`が持つのは`IpcError`そのものだけです。だから新しいスライスは、自分のエラーを共有のファイルではなく自分のフォルダーに追加します。文は翻訳テーブルから取り、ワイヤー上のenumの`Display`からは決して取りません。
- **ワイヤーから届いた未知のイベントはエラーではありません。** enumには`#[serde(other)]`を、必須でないフィールドには`Option<T>`を使います。未知の行はデバッグ用にログに残し、先へ進みます。プロバイダーのコマンドラインツールの新しいバージョンが、実行を止めることがあってはなりません。
- **`unwrap()`と`panic!`は禁止です**。`kit`、`store`、`drivers`、`core`のテスト以外の場所でのことです。エラーの変種を伴う`?`を使うか、値が欠けることのない理由を説明した`expect()`を使います。

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

`app/src/error.rs`:

```rust
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    code: &'static str,
    message_key: &'static str,
}

impl IpcError {
    pub fn new(code: &'static str, message_key: &'static str) -> Self {
        Self { code, message_key }
    }
}
```

`app/src/recording/dto.rs`:

```rust
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
| `service.rs` | 本物のストアとデータの継ぎ目（14.2）を使う`#[tokio::test]` | 呼び出し後のファイルやデータベースの状態 |
| `actor/` | `Handle`とメッセージの台本。時間は`tokio::time::pause`で | `Snapshot`の列 |
| `drivers` | 本物のプロセス、または記録されたストリーム | プロセスが終了していること（`ESRCH`または空のジョブ）、ワイヤーから届いた行 |
| `app/commands` | 単体テストはなし。人が目にするものについて、エントリを通したエンドツーエンドまたは統合テスト | 人が目にするテキスト |

人に見せるメッセージのテストは、その人が目にする場所に置きます。`logic.rs`だけでは足りません。正しい文を生成する関数も、誰も呼ばなければ何も証明しません。

### 14.1. 統合テストのバイナリは1つ

`tests/`の直下にあるファイルは、それぞれが別のバイナリであり、バイナリごとに別々にリンクされます。大きなワークスペースでは、ファイル1つにつき1分かかります。各crateには**1つ**の統合ターゲット`tests/it/main.rs`を持たせ、トピックごとに1つのモジュールにして、単一のトピックはフィルターで実行します。

```tree
tests/it/
  main.rs          mod recording_stops_on_time_limit; mod transcript_survives_restart; …
  recording_stops_on_time_limit.rs
  transcript_survives_restart.rs
```

```bash
cargo nextest run --test it recording_stops_on_time_limit::
```

`--no-tests=fail`を付けて実行します。そうすれば、何にも一致しないフィルターは、黙ってグリーンになるのではなくレッドになります。

テストで共有するヘルパーは、同じターゲットのモジュール`tests/it/support/`にします。`tests/`の直下に置いたヘルパーのファイルは、リンクするバイナリが1つ増えるだけです。

### 14.2. traitを使わない偽のドライバー

テストには、本物のプロセスを起動しないドライバーが必要です。SLATは実装が1つしかないtraitを禁じており、偽物は2つ目の本物の実装には数えません。このルールを守る方法は2つあります。1つ目を優先してください。フィーチャーは`drivers`とその上にあるすべてのcrateのコンパイルのされ方を変えるので、フィーチャーありのテストビルドとフィーチャーなしのアプリケーションビルドは、別々の成果物の組になります（セクション22.3）。データの継ぎ目なら、コンパイル時間はまったくかかりません。

- **データの継ぎ目。** サービスはドライバーそのものではなく、ドライバーの*出力*を値やチャネルとして受け取ります。テストはそのチャネルに行を送ります。
- **テストビルド。** `drivers`は本物のモジュールと同じ関数を持つ`#[cfg(any(test, feature = "fake"))] pub mod fake;`を公開し、テスト用crateが`fake`フィーチャーを有効にします。

2つ目の本物の実装（2つ目のプロバイダー、2つ目のプラットフォーム）が現れたときが、traitを導入するタイミングです。

### 14.3. 差分に対するミュータント

通るテストが何かを証明するのは、間違ったコードで失敗する場合だけです。これはセクション16.2をテストに当てはめたものです。`cargo-mutants`はコードを変更し（条件を反転させる、戻り値を置き換える、文を削除する）、どのテストも気づかなかった変更をすべて報告します。ワークスペース全体ではなく、プルリクエストが変更した行に対して実行します。

```bash
git diff origin/main...HEAD > changes.diff
cargo mutants --in-diff changes.diff --package quayside-core
```

最も効果が大きいのは`logic.rs`と`update.rs`です。これらは純粋なので、テストはマイクロ秒で終わります。そこで生き残ったミュータントは、誰も確認していないビジネスルールです。生き残ったミュータントはテストで直します。除外で直すことは決してありません。

### 14.4. `update`のプロパティテスト

`update`のテストは、メッセージの台本を1つ確認します。プロパティテストは、常に成り立たなければならないルールに対して、何千ものランダムな台本を確認します。`proptest`で`Msg`の値の列を生成し、各ステップのあとで状態の不変条件をアサートします。

```rust
proptest! {
    #[test]
    fn a_stale_generation_never_changes_the_phase(script in messages(64)) {
        let mut state = State::default();
        for msg in script {
            let generation_before = state.generation;
            let phase_before = state.phase.clone();
            let stale = msg.generation().is_some_and(|g| g != generation_before);
            update(&mut state, msg);
            prop_assert!(state.generation >= generation_before);
            if stale {
                prop_assert_eq!(&state.phase, &phase_before);
            }
        }
    }
}
```

`messages(n)`はランダムな`Msg`の値を作るテストモジュールのストラテジーで、`Msg::generation()`はメッセージが持つ世代を返す小さなヘルパーです。セクション20.2のリークは、まさにこのようなテストが自力で見つけるバグです。それを引き起こすメッセージの順序を、誰かが思いつく必要はありません。

### 14.5. エントリを通したテスト

人が目にする文は、エントリを通して証明します。本物のコマンドと本物の`AppState`を使い、ウィンドウは使いません。Tauriの`test`フィーチャーにはモックランタイムがあり、ウィンドウと同じようにコマンドを実行します。このテストは`app` crateの`tests/it`のモジュールで、呼び出すコマンドを登録します。

```rust
#[test]
fn reading_a_transcript_that_is_gone_says_so() {
    let app = tauri::test::mock_builder()
        .manage(support::app_state())
        .invoke_handler(tauri::generate_handler![transcript::commands::transcript_read])
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("the test app could not start");
    let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .expect("the test window could not open");

    let reply = tauri::test::get_ipc_response(
        &window,
        support::invoke("transcript_read", serde_json::json!({ "id": "gone" })),
    );

    let error = reply.expect_err("a missing transcript must be refused");
    assert_eq!(support::english(&error["messageKey"]), "This transcript no longer exists.");
}
```

`support::app_state()`は一時フォルダー上に`AppState`を組み立てます。`support::invoke`は`tauri::test::INVOKE_KEY`を使って`tauri::webview::InvokeRequest`を作ります。`support::english`は、フロントエンドが使うのと同じ翻訳ファイルでキーを引きます。`messageKey`で止まるテストが証明するのは対応づけだけです。証明になるのは文です。

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
| Tauriを知っているのは`app`だけ | `Cargo.toml`（ほかの場所に`tauri`への依存がない）。推移的な依存には`cargo-deny`（16.5） |
| ティアは下方向にのみ依存する | `Cargo.toml` |
| データベースへの接続を開くのは`store`だけ | `checks/slat-writer.sh`：`Connection::open`は`store` crateの中だけ。このcrateが、1つの書き込み用接続と読み取り用接続を配ります。スライスの`store.rs`はそれを受け取って`rusqlite`の型を使うので、依存関係だけでは不十分です。 |
| `#[tauri::command]`は`app/**/commands.rs`の中だけ | grepチェック |
| すべてのコマンドが登録されている | スライスのコマンドと`generate_handler!`を比較するチェック |
| `emit`は`app/**/events.rs`の中だけ | grepチェック |
| スライス間の深いインポートがない | ほかのスライスからの`crate::<a>::<layer>::`を探すチェック |
| `core`に状態を持つ`static`がない | `Mutex`、`RwLock`、またはアトミック型を持つ`static`を探すgrepチェック |
| アクターの中にロックがない | grepチェック：`actor/`の下に`Mutex`も`RwLock`もない |
| `logic.rs`と`update.rs`にI/Oがない | チェック：`logic.rs`、`logic/`、`update.rs`に`async`、`tokio::`、`std::fs`、`store::`、`drivers::`がない |
| スライスの`mod.rs`には`mod …;`と`pub use …;`だけがある | `core/src/`の下のすべての`mod.rs`に対するチェック |
| スライス間に循環がない | インポートからスライスのグラフを作り、ソートするチェック |
| Tauriコマンドは最大10行 | `app/**/commands.rs`に対するチェック |
| `kit`、`store`、`drivers`、`core`のテスト以外に`unwrap()`と`panic!`がない | Clippyのリント`unwrap_used`と`panic`（16.5） |
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
  | grep -vE '^src-tauri/src/([a-z_]+/)+events\.rs$' | sort || true)"

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

チェックを信頼する前に、本物の違反を仕込み、それがレッドになるのを確認してから取り除きます。一度もレッドになったことのないチェックは、一度もテストされていないのと同じです。

SLATのgrepチェックは禁止されたコードを探すので、コメントの中で一致すればグリーンではなくレッドになります。煩わしいものの安全であり、直し方は死んだコードを削除することです。構文木を読むチェック（16.5）には、この問題がありません。危険なのは、文字列が存在することを要求するチェックです。それはコメントだけで通ってしまいます。そのようなルールは、テキストを読むことではなく、コードを実行することで証明します。

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
      - uses: Swatinem/rust-cache@v2
      - run: cargo check --workspace --exclude quayside --all-targets
```

実際のリポジトリでは、アクションのバージョンを完全なコミットハッシュで固定してください。このジョブはコンパイルするだけです。製品がまだサポートしていないプラットフォームではテストを実行しないので、コストは小さく済みます。キャッシュのステップが、そのコストを小さく保ちます。これがないと、プルリクエストのたびに2つのオペレーティングシステムで、すべての依存関係をゼロからコンパイルすることになります。

### 16.4. 一式のチェック

| チェック | ルール |
|---|---|
| `checks/slat-commands.sh` | `#[tauri::command]`は`src-tauri/src/**/commands.rs`の中だけ |
| `checks/slat-registered.sh` | スライスのすべてのコマンドが`generate_handler!`に現れる |
| `checks/slat-emit.sh` | `emit`は`src-tauri/src/**/events.rs`の中だけ |
| `checks/slat-writer.sh` | `Connection::open`は`crates/*-store`の中だけ |
| `checks/slat-deep-imports.sh` | ほかのスライスからの`crate::<slice>::<layer>::`がない |
| `checks/slat-static-state.sh` | `crates/*-core*`に`Mutex`、`RwLock`、またはアトミック型を持つ`static`がない |
| `checks/slat-actor-lock.sh` | `actor/`の下に`Mutex`も`RwLock`もない |
| `checks/slat-pure.sh` | `logic.rs`、`logic/`、`update.rs`に`async`、`tokio::`、`std::fs`、`store::`、`drivers::`がない |
| `checks/slat-slice-mod.sh` | スライスの`mod.rs`には`mod …;`と`pub use …;`だけがある |
| `checks/slat-edges.sh` | スライスのグラフを、1行に1つの`<slice> <imported slice>`で出力する |
| `checks/slat-slice-cycles.sh` | スライス間に循環がない |
| `checks/slat-command-size.sh` | すべての`#[tauri::command]`は最大10行 |
| `checks/slat-platform.sh` | `platform/`の外での12.3の禁止事項 |
| `checks/slat-size.sh` | ベースラインにある1,500行超のファイルは縮小することしか許されない |

循環のチェックに、グラフのライブラリは要りません。`checks/slat-edges.sh`がスライスのグラフを出力します。`core/src/<slice>/`の中の`crate::<other>`はどれも1本の辺です。`use crate::{run::Run, plan::Plan};`のようにまとめたインポートも、複数行にまたがるものも含みます。入れ子のグループ（`crate::{run::{Run, Step}, plan}`）では、内側のグループより後の名前が失われます。そこからは`ast-grep`のルール（16.5）が引き受けます。

`checks/slat-edges.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

core="${1:-crates/quayside-core/src}"
find "$core" -mindepth 2 -name '*.rs' | sort | while read -r file; do
  slice="${file#"$core"/}"
  slice="${slice%%/*}"
  { tr '\n' ' ' < "$file" \
    | grep -oE 'crate::(\{[^}]*\}|[a-z_]+)' \
    | grep -oE '(crate::|[{,] *)[a-z_]+' \
    | sed -E 's/^(crate::|[{,] *)//' \
    | sed "s/^/$slice /"; } || true
done | awk '$1 != $2' | sort -u
```

`tsort`は、ループのあるグラフをエラー出力で報告します。`checks/slat-slice-cycles.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

edges="$(checks/slat-edges.sh crates/quayside-core/src)"
loops="$(printf '%s\n' "$edges" | tsort 2>&1 > /dev/null || true)"
if [ -n "$loops" ]; then
  printf '%s\n' "$loops"
  echo "slices import each other in a loop; move the shared part into its own slice (7.2)"
  exit 1
fi
echo "slices: $(printf '%s\n' "$edges" | sed '/^$/d' | wc -l | tr -d ' ') edges, no cycle"
```

この辺のリストが、そのままスライスのグラフです。セクション22.4は、変更が影響しうるスライスを見つけるのにこれを使います。

### 16.5. スクリプトより先にリントと禁止

一部のルールにはスクリプトが要りません。ワークスペースですでに動いているツールで強制できるからです。

**ティアごとのClippy。** Clippyはまずcrate自身のフォルダーから`clippy.toml`を読むので、ティアごとに別のものを禁止できます。リントは`Cargo.toml`で有効にします。

```toml
[workspace.lints.clippy]
unwrap_used = "deny"
panic = "deny"
```

```toml
[lints]
workspace = true
```

1つ目のブロックはワークスペースのルートに、2つ目は`kit`、`store`、`drivers`、`core`に置きます。`app` crateはこれを継承しません。ワークスペースのルートに`allow-unwrap-in-tests = true`と`allow-panic-in-tests = true`を書いた`clippy.toml`を置けば、テストは読みやすいままです。crateのフォルダーにある`clippy.toml`はルートのものを置き換えるので、その2行を繰り返します。`core`の`clippy.toml`には`disallowed-types`を列挙できます。たとえば`std::process::Command`です。そうすれば、スライスから起動したプロセスは、grepの一致ではなくリントのエラーになります。ただし`std::sync::Mutex`はそこに挙げないでください。スライスのサービスが持つキャッシュ（9.1）には短いロックが必要で、それを`await`をまたいで保持することはありません。あってはならないロック、つまりアクターの中のロック（9.3）は、`checks/slat-actor-lock.sh`が捕まえます。

**依存関係のグラフ全体には`cargo-deny`。** `Cargo.toml`は`core`の中の`use tauri::…`を止めますが、裏口から`tauri`を引き込むライブラリは止めません。この漏れはレビューでは見えず、`core`のテストがアプリケーションで最も重い部分をコンパイルすることになります。`cargo-deny`はグラフ全体を確認します。`deny.toml`に次のように書きます。

```toml
[bans]
deny = [
  { crate = "tauri", wrappers = ["quayside", "tauri-plugin-shell", "tauri-plugin-dialog"] },
]
```

こうすると`tauri`は、`wrappers`にあるcrateの直接の依存としてしか現れてはいけなくなります。つまり`app` crateと、それが使うTauriのプラグインです。プラグイン自身も`tauri`に依存しているからです。アプリケーションに加えたプラグインは、同じプルリクエストでこのリストに加えます。`core`が使うライブラリなど、`tauri`へのほかの経路はすべてレッドです。

**テキストではなく構文。** 16.4のgrepチェックは`ast-grep`のルールとして書けます。`ast-grep`はRustの構文木に一致するので、コメントや文字列に一致することはなく、複数行に分かれたインポート（`use crate::run::{logic::plan, model::Run};`）も1つのインポートのままです。チェックごとに1つのルールファイルを用意し、`files`と`ignores`のglobには16.4のパスを使えば、`grep -E`を置き換えられます。ベースラインリスト（16.1）はそのまま残ります。ルールが違反のリストを出し、同じスクリプトがベースラインを差し引きます。

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
Tauri、ウィンドウ、MCP、リモートハブを呼び出すか？          → app (commands, events, doors)
オペレーティングシステムに依存するか？                      → drivers/src/platform/ (セクション12)
プロセス、ネットワーク、キーチェーンとやり取りするか？      → drivers (プラットフォーム契約経由)
データベースの読み書き、またはスキーマか？                  → store (接続) / core/<s>/store.rs (クエリ)
純粋な判断、または計算か？                                  → core/<s>/logic.rs (アクターなら update.rs)
ドメインの型か？                                            → core/<s>/model.rs
I/Oを伴う手順の並びか？                                     → core/<s>/service.rs
バックグラウンドで生き、ウィンドウが見守る状態か？          → core/<s>/actor/
ユーザーがオフにしても、残りが動き続けるか？                → プラグインスライス (セクション23)
ドメインをまったく持たないか（時刻、パス、ID、ファイル）？  → kit
```

最初の問いは、エントリそのものだけについてのものです。コマンド、emit、MCPサーバーやリモートハブのリスナーです。そうしたエントリが行うこと（ペアリング、暗号化、ブリッジが運ぶメッセージ、リモートセッションのルール）はドメインであり、エントリが呼び出す`core`のスライスに置きます。

## 18. コーディングエージェントとの協働

SLATは、コードの多くをコーディングエージェントが書くチームの中で設計されました。エージェントは、構成が文書化されていて、短く、機械で確認されているとき、確実にそれに従います。違いを生むのは次の3つです。

1. **決まった構成は、無料の地図です。** 「文字起こしにフィルターを追加して」と指示されたエージェントは、探さずに`core/transcript/`と`app/transcript/`を開きます。エージェントが探すのに費やす時間は、間違えている時間です。
2. **チェックはプロンプトの文に勝ります。** プロンプトに書いた「coreからemitしないこと」は、たいていは守られます。レッドのチェックは毎回守られます。ルールはまずチェックとして書き、チェックできない場合にだけプロンプトの1行にします。
3. **レシピはプロンプトです。** セクション17を番号付きの手順で書いたのは意図的です。レシピをタスクに貼り付ければ、エージェントは期待どおりの場所に、期待どおりの順序でファイルを作ります。

エージェントは、ワークスペースのビルドのされ方も変えます。複数の作業コピーで複数のエージェントが動けば、同じ依存関係のコールドビルドが同時に複数走ります。これはセクション19.2の、固まるノートパソコンです。セクション22.5では、ほかのコピーと`target/`フォルダーを共有せずに、各作業コピーを温まった状態で始める方法を、セクション22.4ではそれぞれが自分の変更が影響しうるテストだけを実行する方法を説明します。

リポジトリのコントリビューターガイド（`AGENTS.md`、`CLAUDE.md`、またはそれに相当するもの）にそのままコピーできるセクションです。

```markdown
## Backend layout: SLAT 1.3

The backend follows SLAT (Slice · Layer · Actor · Tier), version 1.3.
Reference: https://monoone.dev/blog/slat/

- Tiers: app → core → store/drivers → kit. Only `app` depends on tauri.
- A feature is one slice: `crates/<product>-core/src/<slice>/` and `src-tauri/src/<slice>/`.
- Files in a slice: mod.rs, model.rs, logic.rs, store.rs, service.rs, actor/ (only if needed).
- A Tauri command has at most 10 lines and calls one function of its slice.
- Background state belongs to an actor: Msg → update (pure) → Effect.
- Operating-system code only in `drivers/src/platform/`.
- If the product has plugins: a base slice never imports a plugin slice
  (SLAT section 23).
- Before adding code, find its place with the decision tree (SLAT section 17.8,
  https://monoone.dev/blog/slat/recipes/).
- Checks in `checks/slat-*.sh` enforce this. Do not edit a check to make it pass;
  report it instead.
- Before pushing, run the tests the change affects (SLAT section 22.4), then the checks.
- Every working copy has its own `target/`. Never point two copies at one
  folder (SLAT section 22.5).
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
| crateの数に応じてコンパイル時間が延びる | crateは最大6〜8個。重いビルドは一度に1つ。分割のたびに、その前後で`cargo build --timings`で測定する（22.6）。 |
| リファクタリングが黙って振る舞いを変える | まず今日の振る舞いに対する`update`のテストを書く。移動と修正は別々のプルリクエストにする。 |
| コードの一部をまったく変えてはいけない（重要な機能、凍結された領域） | その部分はその場に残し、ファサードを通じてのみ新しい構成とつなぐ。ファサードは追加のみのコードである。 |

## 20. ケーススタディ：Quayside

Quaysideは、この文書のために考案した**架空の**デスクトップアプリケーションです。私たちが作っている種類のソフトウェアをゆるやかに模していますが、以下の名前、数値、ファイルはすべて作りものです。Quaysideは通話を録音し、デバイス上で文字起こしをし、ローカルまたはクラウドのモデルで要約を書き、コーディングエージェントでフォローアップのタスクを実行し、アクションアイテムをチームの共有ボードに同期します。さらに、録音を見守ってメモを送り込めるスマートフォン用のコンパニオンアプリもあります。

Quaysideは小さなチームが急ぎながら2年かけて作ってきたもので、ちゃんと動いています。同時に、セクション1で述べたことすべての見本でもあります。

### 20.1. 移行前

```tree
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

アプリケーションの状態です。41個のフィールドのうち11個を示します。

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

**手順2：依存を逆転させる。** 文字起こし処理は`AppHandle`を受け取らなくなります。単語は`core`が所有する容量制限付きのチャネルに書き込み、`app`がそのチャネルをウィンドウに流します。アップロードのコードは`AppState`を読まなくなり、必要な2つの値を引数として受け取ります。

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

**手順3：`app`と`core`を分ける。** `quayside-core`（`tauri`なし）と、`app`としての既存の`src-tauri`からなるワークスペースを作ります。アプリの`lib.rs`には`pub use quayside_core::{…};`を残すので、古いパスはすべて引き続きコンパイルされます。証明として、`core`に`use tauri::Manager;`を仕込むとコンパイルに失敗します。

**手順4：`kit`、`store`、`drivers`。** 9か所あったSQLiteの接続は、`quayside-store`の1つのライターにまとまります。録音処理、文字起こし処理、モデルのクライアント、`git`は`quayside-drivers`に移ります。`#[cfg]`を含む23個のファイルは、`unix.rs`、`macos.rs`、`unsupported.rs`を持つ1つの`platform/`フォルダーになり、`reveal`は契約になります。

```rust
pub fn reveal_path(path: &Path) -> Result<(), PlatformError> {
    let status = Command::new("/usr/bin/open").arg("-R").arg(path).status()?;
    status.success().then_some(()).ok_or(PlatformError::Refused("open -R"))
}
```

シェルも、引用符の処理も、インジェクションもありません。

**手順5：スライス。** `handlers.rs`と`utils.rs`を、小さいものから順にスライスへと分解します。

```
settings → device → llm → summary → transcript → board → companion → agent → recording
```

**手順6：`kit::Jobs`。** `transcribing`と`summarizing`（キャンセルトークンを持つ2つのマップ）は、文字起こしサービスの中の1つの`Jobs<TranscriptId>`と、要約サービスの中の1つの`Jobs<SummaryId>`になります。

**手順7：アクター。** 9.1のテストに通る状態は3つです。録音、エージェントの実行、ボードの同期です。最初は録音で、今日の振る舞いに対する`update`のテストを先に書きます。`AtomicBool`はなくなります。停止は対象とする録音の世代を運ぶようになり、20.2の漏れは、ずっとグリーンのままの1行のテストになります。7つの`start_recording_*`関数は1つになります。

```rust
pub struct StartRecording {
    pub title: String,
    pub device: Option<DeviceId>,
    pub meeting: Option<MeetingId>,
    pub limit: Option<Duration>,
    pub origin: Origin,
}
```

**手順8：チェック。** セクション16の各チェックを、そのベースライン付きで有効にします。ほとんどのベースラインはすでに空です。上の手順で違反が取り除かれたからです。

### 20.4. 移行後

```tree
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
      device/  llm/  settings/  guard/
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
- セクション22のビルド設定：`strip = false`を付けたデバッグ情報、リンカー、1つのフィーチャーの組、`.taurignore`、`main`からだけ書き込むCIのコンパイルキャッシュ。
- 重いネイティブライブラリは、`core`が依存しないドライバーのcrateに置く（5.3）。
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
変換だけを行うコマンドには、専用の単体テストが要らないからです。10行あれば、デシリアライズし、呼び出し、変換するには十分です。判断を隠すには足りません。

**SLATでコンパイルは遅くなりますか？**
crateに分割すると、たいていはインクリメンタルビルドが速くなります。1つのスライスを変更しても、`kit`、`store`、`drivers`は再ビルドされないからです。クリーンビルドはリンクするテストバイナリが増える分、少し遅くなることがあります。SLATがcrateの数に上限を設けているのはそのためです。crateの数よりも重要な設定は、セクション22にまとめています。

**macOSでしか提供していません。今、セクション12に取り組む価値はありますか？**
はい、そのうち安価な部分には価値があります。`kit::paths`、すでにある少数のシステムコールに対する契約、`unsupported.rs`、そしてLinuxとWindowsでのコンパイルジョブです。今なら数日のコストで済み、のちにコードベース全体を捜索する手間が省けます。`linux.rs`と`windows.rs`のファイルそのものは、移植を決めるまで待って構いません。

**コーディングエージェントはSLATにどう対応しますか？**
うまく対応します。構成が決まっていて、重要なルールが助言ではなくチェックになっているからです。セクション18を参照してください。

## 22. ビルドとテストの時間

*バージョン1.2で追加。*

SLATで最も大きな節約は、セクション5から生まれます。Tauriを知っているのは`app`だけなので、ほかのすべてのcrateのテストは、Tauriとその背後のウェブビューをコンパイルしません。2番目に大きな節約は5.3から生まれます。重いネイティブライブラリは`core`が依存しないドライバーのcrateに置かれるので、`core`のテストはそれもコンパイルしません。残りの時間は、いくつかの設定と習慣で決まります。どれも1〜2行の設定です。このセクションでは、それらをたいていの節約量の順に並べ、最後に、本来その必要がないのにビルドが最初からやり直しになる原因を扱います。

まず測定します。`cargo build --timings`は、各crateのコンパイル時間と、いくつが並行して動いたかをHTMLのレポートに書き出します。変更前のレポートを残しておき、比較します。

### 22.1. 時間はどこに使われるか

- **ライブラリのcrateはコンパイルされますが、リンクはされません。** リンクされるのはすべてのバイナリで、テストの実行ではすべてのテストバイナリです。
- **各crateには3種類のテストバイナリがありえます。** 単体テスト、`tests/`の直下にある各ファイル（セクション14.1でこれを`tests/it`の1つに減らします）、そしてドキュメントの例です。エディション2024からは、crateのドキュメントの例は1つのバイナリとしてビルドされます。ドキュメントの例を持たないcrateは、`[lib]`の下に`doctest = false`を設定します。
- **`app`より下のテストの実行に、Tauriは要りません。** 日常のコマンドは`cargo t`（22.3）で、`quayside`以外のすべてのcrateを実行します。`app` crateをビルドするのは、セクション14のエンドツーエンドのテストだけです。
- **重いネイティブライブラリは、Tauriより高くつきます。** ビルドスクリプトがコンパイルするCやC++のソース、そして機械学習のcrateは、クリーンビルドの大部分と、それを含むすべてのバイナリのリンクの大部分を占めます。セクション5.3は、それらを`core`のテストから遠ざけます。
- **リンク時間の大きな部分はデバッグ情報です。** そのほとんどは一度も読まれません。

### 22.2. ビルドの設定

ワークスペースのルートの`Cargo.toml`に次のように書きます。

```toml
[profile.dev]
debug = "line-tables-only"
split-debuginfo = "unpacked"

[profile.dev.package."*"]
debug = false
strip = false
```

自分のcrateはバックトレースにファイル名と行番号を残し、依存関係にはデバッグ情報を付けません。デバッガーが必要なときは、そのセッションの間だけ`debug = true`に戻します。

`strip = false`はmacOSでは省略できません。`debug = false`のとき、Cargoはデフォルトでそれらのユニットのストリップも行います。そしてmacOS 27では、システムの`strip`が手続き型マクロの動的ライブラリを壊します。`serde_derive`が読み込めなくなり、クリーンビルドが失敗します。`split-debuginfo = "unpacked"`を明示しているのは、macOSでリンクのたびに`dsymutil`が走るかどうかを、Cargoのバージョンごとのデフォルトに左右させないためです。

リンカーが最も効くのはテストバイナリです。x86-64のLinuxでは、Rustはバージョン1.90から`rust-lld`をデフォルトで使っています。ほかのLinuxのターゲットでは`mold`を使えます。macOSでは、Xcode 15以降に付属するリンカーがすでに速いので、そのままにします。Windowsでは、`rust-lld`はたいていデフォルトのリンカーよりずっと速くなります。`.cargo/config.toml`に次のように書きます。

```toml
[target.aarch64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]

[target.x86_64-pc-windows-msvc]
linker = "rust-lld.exe"
```

**テストが時間を費やす依存関係を最適化します。** devビルドはすべての依存関係を最適化なしでコンパイルします。Cのソースからビルドされる暗号化データベースや、テストが何百万回も呼び出す暗号や、ハッシュ関数も同じです。それらのパッケージだけを最適化すれば、テストは速くなり、リリースビルドは変わりません。私たちのワークスペースの1つでは、これでテストの実行が170秒から102秒になりました。

```toml
[profile.dev.package.libsqlite3-sys]
opt-level = 3

[profile.dev.package.sha2]
opt-level = 3
```

1行ごとに、そのパッケージのリビルドが1回かかります。前後でテストの実行を測定し、効果のあったパッケージだけを残します。

誰も使っていない依存関係は削除します。`cargo machete`がそれを一覧にします。1つひとつが、何の役にも立たないコンパイル時間です。

### 22.3. 1つのフィーチャーの組

Cargoは、求められたフィーチャーの組が異なるたびに、依存関係を1回ずつビルドします。SLATのワークスペースでは、2つのものが異なる組を求めます。

1. **異なるコマンド。** `cargo test --workspace`はすべてのメンバーのフィーチャーを統合し、`cargo test -p quayside-core`は`core`が必要とするものだけを使います。両方を実行すると、`tokio`、`serde`などが2回コンパイルされます。`cargo-hakari`がこれを解決します。すべてのメンバーが依存する、生成された`workspace-hack` crateを、すべてのフィーチャーの和集合とともに管理するので、どのコマンドも依存関係を同じ方法でビルドします。`cargo hakari generate`がそれを更新し、CIの`cargo hakari verify`は誰かが忘れたときに失敗します。
2. **自分のcrateのテスト用フィーチャー。** 14.2の`fake`フィーチャーとセクション10の`test-hooks`は`drivers`と`core`を変えるので、フィーチャーが切り替わると、その上にあるすべてのcrateが再びコンパイルされます。フィーチャーの要らないデータの継ぎ目（14.2）を優先してください。フィーチャーが必要な場合は、どのテストコマンドも同じ方法でそれを有効にします。そのコマンドは1か所、`.cargo/config.toml`に置きます。

```toml
[alias]
t = "nextest run --workspace --exclude quayside --features quayside-drivers/fake --no-tests=fail"
```

エージェントやCIを含め、誰もがスイート全体には`cargo t`を実行し、より絞ったテストコマンドはどれも、フィルターを加えた`cargo t`にします（22.4）。パッケージやフィーチャーの一覧が異なるテストコマンドは、2つ目のビルドです。データの継ぎ目（14.2）だけを使うワークスペースでは、ここと22.4のスクリプトから`--features quayside-drivers/fake`を外します。誰も定義していないフィーチャーを指定するエイリアスは失敗します。

### 22.4. 変更が影響しうるものを実行する

決まった構成から、ファイルがどのスライスに属するかが分かります。そして循環のチェック（16.4）のスライスのグラフから、どのスライスがそれに依存しているかが分かります。この2つを合わせると、変更の種類ごとに専用のテストの組が決まります。

| 変更されたもの | 実行するもの |
|---|---|
| 1つのスライスの中の`logic.rs`、`model.rs`、`store.rs`、`service.rs`、`actor/`で、`mod.rs`は変更なし | そのスライスのテストと`cargo mutants --in-diff`（14.3） |
| スライスの`mod.rs`、つまりその公開API | そのスライスと、それをインポートするすべてのスライス |
| `tests/it`のモジュール | そのモジュール |
| `kit`、`store`、`drivers` | それに依存するすべてのcrate：`cargo t -E 'rdeps(quayside-store)'` |
| `drivers/src/platform/` | 契約のテスト（12.5）も。CIではプラットフォームジョブ（16.3） |
| `app`だけ | エントリを通したエンドツーエンドのテスト。`core`は何も変わっていない |
| `Cargo.toml`、`Cargo.lock`、`.cargo/`、ツールチェーンのファイル | すべて |

フィルターが選ぶのは、どのテストを**実行する**かであって、何を**コンパイルする**かではありません。nextestはまずCargoのオプションが指定するすべてのパッケージをビルドし、そのあとで`-E`を適用します。だからどの行も`cargo t`のパッケージとフィーチャーを保ち、`-E`だけで絞り込みます。ビルドは`target/`にすでにあるものと同じままで、短くなるのは実行だけです。`-p`でビルドを絞り込んでコンパイル時間が減るのは、`cargo-hakari`（22.3）がフィーチャーを同じに保っている場合だけです。それがなければ、`-p`は依存関係の2つ目のビルドになります。

スライスのテストは名前がスライスで始まるので、簡単に選べます。単体テストは`core/src/<slice>/`にあるので名前が`<slice>::`で始まり、`tests/it`のモジュールもスライスで始まります（`recording_stops_on_time_limit`）。選択の最初の版は、短いスクリプトに収まります。このスクリプトは、作業コピーを、ブランチが`main`から分かれた地点と比較します。そのため、まだコミットしていない変更も数に入ります。エージェントのループに必要なのはこれです。

```bash
#!/usr/bin/env bash
set -euo pipefail

base="$(git merge-base origin/main HEAD)"
changed="$({ git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u)"
crate="crates/quayside-core"
tests=(cargo nextest run --workspace --exclude quayside --features quayside-drivers/fake --no-tests=fail)

if grep -qE '(^|/)Cargo\.(toml|lock)$|^\.cargo/|^rust-toolchain|^crates/quayside-(kit|store|drivers)/' <<< "$changed"; then
  exec "${tests[@]}"
fi
if grep -qE "^$crate/(src/[^/]+\.rs|src/.*mod\.rs|tests/it/main\.rs|tests/it/support/)" <<< "$changed"; then
  exec "${tests[@]}" -E 'package(quayside-core)'
fi

names="$({
  sed -nE "s#^$crate/src/([a-z_]+)/.*#\1#p" <<< "$changed"
  sed -nE "s#^$crate/tests/it/([a-z_]+)\.rs\$#\1#p" <<< "$changed"
} | sort -u | paste -sd'|' -)"
if [ -z "$names" ]; then
  echo "nothing below app changed; run the end-to-end tests of the entry"
  exit 0
fi
exec "${tests[@]}" -E "package(quayside-core) & test(/^($names)(::|_)/)"
```

これは意図的に慎重です。どの`mod.rs`、`core/src/`の最上位にあるファイル、または共有のテストヘルパーが変わっても、スライスのグラフをたどらずに`core`全体を実行します。`core`のスイートが遅くなったら、この手順をグラフに置き換えます。

選択は速さのためであり、証明のためではありません。3つの段階を使います。

| 場所 | 実行するもの |
|---|---|
| 自分のマシンとエージェントのループ | 上の選択 |
| プルリクエストのCI | 変更されたcrateに依存するすべてのcrate（`rdeps`） |
| `main`、またはマージキュー | スイート全体 |

`--no-tests=fail`（14.1）はどの段階でも有効のままです。そのため、何にも一致しない選択は、黙ってグリーンになるのではなくレッドになります。

### 22.5. 多くの作業コピー

コーディングエージェントは、それぞれ自分の作業コピーで並行して動くことがよくあります。注意しなければ、4つのエージェントが同じ依存関係を同じ瞬間に4回コンパイルします。

**作業コピーごとに自分の`target/`を持たせます。** シンボリックリンクでも`CARGO_TARGET_DIR`でも、複数のコピーを1つのフォルダーに向けてはいけません。共有のキャッシュのように見えますが、これは正しさのバグです。同じワークスペースの2つのコピーは、同じ成果物の名前と同じフィンガープリントのエントリを作ります。そのため`build A; build B; build A`のあと、ディスク上のライブラリがBのソースからビルドされたものなのに、CargoがコピーAを`Fresh`と報告することがあります。するとチェックは他人のコードを判定して、グリーンを報告します。そのうえ、内容の異なるブランチは、切り替えのたびに互いのcrateをリビルドします。

**新しいコピーは、共有ではなくクローンで温まった状態から始めます。** 作業コピーを作るときに、メインのコピーの`target/`をコピーオンライトのクローンでコピーします。macOS（APFS）では`cp -c -R`、BtrfsやXFSでは`cp --reflink=auto -R`です。数秒で終わり、ファイルが変わるまでディスク容量を使いません。依存関係は新しいままで、Cargoは自分のcrateだけをリビルドします。それらのソースのほうが、クローンが記録したものより新しいからです。新しいコピーでの最初のビルドを一度測定してください。クリーンビルドではなく、インクリメンタルビルドに近い時間になるはずです。

**`sccache`は補完であって、答えではありません。** ユーザーの`~/.cargo/config.toml`か環境変数（`RUSTC_WRAPPER=sccache`）でコンパイラーのラッパーに設定すれば、そのローカルキャッシュはマシン上のすべての作業コピーで共有されます。キャッシュするのは、通常のライブラリの依存関係のコンパイルです。手続き型マクロ、バイナリ、`cdylib`のcrate、そしてCargoがインクリメンタルにコンパイルする自分のcrateはキャッシュせず、リンクもキャッシュしません。各作業コピーが最も多く払うのはテストバイナリのリンクであり、それを減らすのは14.1、22.2、そして上のクローンだけです。

1つのビルドがマシンをどれだけ使えるかは、`CARGO_BUILD_JOBS`で制限します。たとえばコア数の半分です。そうすれば、2つ目のビルドはマシンを固めるのではなく、遅くなるだけです。セクション19.2のルールは今も有効です。重いビルドは一度に1つです。

### 22.6. CI

- **すべてのRustのジョブにキャッシュを。** 16.3のプラットフォームジョブも含みます。`Swatinem/rust-cache`は、依存関係とtargetフォルダーを`Cargo.lock`とツールチェーンをキーにして実行の間で保持します。
- **キャッシュの書き込みは`main`からだけ、読み込みはどこからでも。** プルリクエストの実行が読めるのは、自分のrefとデフォルトブランチのキャッシュだけです。そのため、あるプルリクエストが書いたキャッシュはそのプルリクエストにしか役立たず、ほかのすべてのプルリクエストが参照するデフォルトブランチは空のままです。`save-if: ${{ github.ref == 'refs/heads/main' }}`を設定し、`main`への`push`でもワークフローを実行します。そうすれば、マージのたびにキャッシュが更新され、各プルリクエストの最初の実行が温まった状態から始まります。私たちのリポジトリの1つでは、これで最初の実行が942秒から478秒になりました。
- **CIでは`CARGO_INCREMENTAL=0`。** インクリメンタルのデータは大きく、まっさらな実行では役に立ちません。`Swatinem/rust-cache`はこれを自動で設定します。ほかのキャッシュを使う場合は、自分で設定します。
- **`app`より下のテストはLinuxで。** macOSのコードが`drivers/src/platform/`と5.3のネイティブドライバーのcrateにしかないなら、`kit`、`store`、`core`のテストにmacOSは要りません。それらは起動が速くコストも低いLinuxのランナーで実行し、macOSのランナーは`drivers`、`app`、契約のテストのために残します。
- **ビルドは1回、テストは並行で。** スイートが数分より長くかかる場合です。`cargo nextest archive`が1つのジョブでテストバイナリをビルドし、複数のジョブが`--partition hash:1/3`、`2/3`、`3/3`でその一部ずつを実行します。
- **`main`のタイミングレポート。** `main`のすべてのビルドで、`cargo build --timings`を成果物として残します。1つのスライスを変更しただけで`core`のバーが長くなり続けるなら、それがセクション5.3が分割の前に求める測定です。
- **`cargo hakari verify`と`cargo deny check`。** セクション16のチェックと並べて実行します。どちらも数秒で終わります。

### 22.7. ビルドが最初からやり直しになる原因

目に見える理由もなく最初からやり直しになるビルドには、ほぼ必ず次のどれかの原因があります。

- **`rerun-if-changed`のないビルドスクリプト。** `cargo:rerun-if-changed`を1行も出力しない`build.rs`は、そのパッケージのどのファイルが変わっても再び実行され、その出力を使うものがすべて再びコンパイルされます。入力ごとに1行を出力します。ヘルパープログラム（Swift、C）をコンパイルするスクリプトは、そのソースを列挙します。存在しないパスは決して列挙しないでください。Cargoはそれをビルドのたびに変更されたものとして扱います。
- **自分の出力を監視する`tauri dev`。** 開発サーバーは、`src-tauri/`のファイルが変わるとアプリをリビルドします。アプリがそこに書き込むデータベース、ログ、生成ファイルは、ビルドをループで再起動させます。実行時のデータは`kit::paths`（12.4）の下に置き、生成ファイルは`.taurignore`に入れます。
- **1つのフォルダーにエディターとターミナル。** rust-analyzerは自分の設定で`cargo check`を実行します。同じ`target/`の中では、エディターとターミナルやエージェントが互いのロックを待ち、互いの作業を無効にすることがあります。エディターには専用のフォルダーを与えます：`"rust-analyzer.cargo.targetDir": true`。
- **異なる環境。** `RUSTFLAGS`と、ビルドスクリプトが読む変数（`MACOSX_DEPLOYMENT_TARGET`、`CC`、`CFLAGS`）は、Cargoが比較するものの一部です。ターミナル、エディター、エージェントのシェルがそれらを違う値に設定していれば、その間を切り替えるたびにリビルドが起きます。シェルのプロファイルではなく、`.cargo/config.toml`（`[env]`、`[build] rustflags`）に置きます。
- **動くツールチェーン。** 新しいコンパイラーはすべてをリビルドします。`rust-toolchain.toml`で完全なバージョンを3つの部分（`1.98.1`）で固定します。2つの部分のチャネルは、リポジトリに何の変更もないまま、新しいパッチリリースをすべて取り込みます。

### 22.8. `target/`の掃除

Cargoは古い成果物を決して削除しません。ブランチ、フィーチャーの組、依存関係のバージョンのそれぞれがファイルを残していき、`target/`のファイルが数十万になると、Cargoのすべてのコマンドが遅くなります。私たちのワークスペースの1つでは、`cargo clean`がおよそ960,000個のファイル（119 GiB）を削除しました。ライブラリとそのテストのフルビルドは7〜8分から36秒になり、`cargo clippy --all-targets`は数分から8秒になりました。

救済策ではなくルールにします。`target/debug/deps`のファイルが数万を超えたとき、または`target/`が数十ギガバイトを超えたときは、`cargo clean`を実行し、1回のコールドビルドを受け入れます。より穏やかな選択肢は`cargo sweep --time 30`です。30日間使われていない成果物だけを削除します。作業コピーを削除すれば、その`target/`も一緒に消えます。

## 23. プラグイン

*バージョン1.3で追加。任意。* プラグインを必要としない製品は、このセクションを飛ばしてかまいません。ほかのどのセクションもこのセクションに依存せず、プラグインのないワークスペースもSLATに完全に従っています。

プラグインとは、製品の残りの部分が同じように動き続けたまま、ユーザーがオンにもオフにもできる機能です。製品を初期状態では小さく保ち、選択によって大きくできます。SLATでは、プラグインは新しい種類のコードではありません。1つか少数のスライスに、マニフェストと、インポートの向きに関するルールを1つ加えたものです。どのプラグインもアプリケーションにコンパイルされています。プラグインをオフにするとは、起動時に組み立てられないということであり、ビルドから欠けているということではありません。

:::diagram plugins

### 23.1. 機能をプラグインにするとき

機能をプラグインにするのは、次の**3つすべて**が当てはまるときだけです。

1. それがなくても製品は役に立つ。
2. オフにしてもデータは失われず、ほかの機能も壊れない。ただし、それを必要とすると宣言したプラグインは除く。
3. 決めるのはユーザーであり、ビルドやプラットフォームやリリースチャネルではない。

| 候補 | 1 | 2 | 3 | 判定 |
|---|---|---|---|---|
| アクションアイテムをチームのボードに同期する | はい | はい | はい | プラグイン |
| スマートフォン用のコンパニオン | はい | はい | はい | プラグイン |
| 録音 | いいえ、それが製品そのもの | — | — | ベーススライス |
| チームがまだテスト中の機能 | はい | はい | いいえ、決めるのはチーム | 設定であり、プラグインではない |
| macOSにだけあるメニュー | — | — | いいえ、決めるのはプラットフォーム | セクション12 |
| 追加のログを出すビルド | — | — | いいえ、決めるのはビルド | Cargoのプロファイル |

このセクションでは、`core`のスライスを2つの言葉で呼び分けます。**ベーススライス**は常にオンです。**プラグインスライス**はプラグインに属します。どちらも`core`ティアにあります。「ベース」は製品について、「core」はcrateについて述べた言葉です。

### 23.2. 構成

プラグインスライスは、セクション6の構成に、各ティアで1つずつファイルを加えたものです。

```tree
core/src/<plugin>/
  plugin.rs     the manifest: id, what it needs, whether it starts on
  hooks.rs      its answers to the hooks of base slices, 23.4
  mod.rs  model.rs  logic.rs  store.rs  service.rs  actor/
app/src/<plugin>/
  mod.rs  commands.rs  dto.rs  events.rs
```

複数のスライスを持つプラグインは、プラグインの名前を持つスライスにマニフェストを置き、ほかのスライスはそのサブスライスにします（6.1）。

マニフェストは定数です。

```rust
pub const PLUGIN: Plugin = Plugin {
    id: PluginId("board"),
    needs: &[PluginId("account")],
    on_by_default: false,
};
```

`Plugin`、`PluginId`、どのプラグインがオンかを覚えておくファイル、そしてどのプラグインを同時にオンにできるかの判断は、1つのベーススライス`core/src/plugin/`に属します。このスライスは通常のファイルを持ちますが、`plugin.rs`はありません。それ自体はプラグインではないからです。すべてのマニフェストを列挙するのは`app`だけです。すべてのスライスを知ってよいのは`app`だけだからです。一覧は`app/src/plugins.rs`にあります。

```rust
pub const PLUGINS: &[Plugin] = &[account::PLUGIN, board::PLUGIN, companion::PLUGIN];
```

### 23.3. 向き

プラグインを成り立たせるルールです。**ベーススライスはプラグインスライスを決してインポートしません。**

| インポート元 | インポートしてよいもの |
|---|---|
| ベーススライス | ほかのベーススライス |
| プラグインスライス | ベーススライス。ほかのプラグインスライスは、そのプラグインが自分の`needs`にあるときだけ |
| `app` | すべて |

ベーススライスはプラグインの名前も出しません。`if on.contains("board")`も、文字列の中のプラグインidもありません。ベースがプラグインの助けを必要とするときは、拡張ポイント（23.4）を提供し、誰が答えるかは知りません。すべてのプラグインがオフでも、ベースはコンパイルでき、起動し、自分のテストに通ります（23.8）。これが「オフ」を正直なものにします。ベースがプラグインのコードを呼び続けたままボタンを隠すのは、オフではありません。

`needs`に循環はありません。理由は7.2と同じです。

### 23.4. 拡張ポイント

プラグインがベースに届く方法は3つあります。この順に優先します。

**1. 聞く。** ベースは、変化を`Snapshot`または`Event`のチャネルですでに公開しています（8.3）。プラグインは自分のサービスかアクターでそれを購読し、ベースはまったく変わりません。例：ボードのプラグインは完成した要約を購読し、そのアクションアイテムをカードにします。

**2. フックに答える。** ベースが自分のフローのある時点で何かを尋ねなければならないとき（「この要約に加えるものはあるか？」）、ベーススライスは自分の`hooks.rs`にフックを宣言し、各プラグインは自分の`hooks.rs`でそれに答えます。

```rust
pub trait SummaryNotes: Send + Sync {
    fn notes(&self, summary: &Summary) -> Vec<Note>;
}
```

```rust
pub struct BoardNotes {
    cards: board::Handle,
}

impl summary::SummaryNotes for BoardNotes {
    fn notes(&self, summary: &summary::Summary) -> Vec<summary::Note> {
        self.cards.current().for_summary(summary.id).map(Into::into).collect()
    }
}
```

ベーススライスのサービスは、`app`が組み立てるときに自分のフックを`Vec<Arc<dyn SummaryNotes>>`として受け取り、その1つずつに尋ねます。プラグインがオフなら一覧は空で、ベースはプラグインが存在する前と同じことをします。

フックの3つのルール：

- **フックはデータで、すぐに、I/Oなしで答えます。** `async`ではありません。答えるのにネットワークやプロセスが必要なプラグインは、自分のサービスかアクターで答えを用意しておき（ここではカードの最新のスナップショット）、フックはそれを読みます。ベースはプラグインを決して待たないので、遅いプラグインがベースを遅くすることはありません。
- **フックはベースの代わりに決めません。** 材料を返すだけで、それをどうするかはベーススライスの`logic.rs`にある判断です。何かを拒否できるフック（アクセス制御、予算）はポリシーであり、ポリシーはベーススライスです（6.5）。プラグインはそこにデータとしてルールを加え、決めるのはベーススライスです。
- **フックのtraitは、実装が1つでも許される唯一のtraitです。** セクション4と14.2は、実装が2つになるまでtraitを禁じています。それまでは何も抽象化しないからです。フックは違います。フックがなければ、ベースはプラグインをインポートしなければなりません。フックのtraitはすべて`hooks.rs`にあるので、この例外は見つけやすく、チェックしやすいのです（23.10）。

**3. エントリを持つ。** プラグインのコマンド、DTO、イベント、ウィンドウ以外のエントリ（doors）は、ほかのスライスと同じく`app/src/<plugin>/`にあります。ベースがそれらを呼ぶことはありません。

### 23.5. オンとオフ

- **ビルドは1つ。** プラグインはCargoのフィーチャーではありません。プラグインごとにフィーチャーを作ると、プラグインの組み合わせごとに別のビルドと別のテスト一式ができ（22.3）、しかもユーザーはフィーチャーを切り替えられません。
- **選択はファイルです。** `plugin`スライスは、オンになっているプラグインの集合を`kit::paths::config()`の下のファイルに保存し、起動時に一度だけ読みます。ファイルがなければ、各プラグインはその`on_by_default`に従います。
- **`app`はオンのものだけを組み立てます。** オフのプラグインには、サービスも、アクターも、フックも、イベントのループもありません。`AppState`のそのフィールドが、セクション11のaccountと同じ形でそれを示します。

```rust
pub struct AppState {
    pub recordings: recording::Handle,
    pub summaries: Arc<summary::SummaryService>,
    pub boards: Result<board::Handle, PluginOff>,
    pub companion: Result<Arc<companion::CompanionService>, PluginOff>,
}
```

```rust
let on = plugin::PluginService::load(&paths, PLUGINS)?;
let boards = on.start(&board::PLUGIN, || board::spawn(board_deps));
let notes: Vec<Arc<dyn summary::SummaryNotes>> = match &boards {
    Ok(cards) => vec![Arc::new(board::BoardNotes::new(cards.clone()))],
    Err(_) => vec![],
};
let summaries = Arc::new(summary::SummaryService::new(store.clone(), notes));
```

プラグインがオフのとき、`on.start`はクロージャーを呼ばずに`Err(PluginOff)`を返します。

- **オフのプラグインのコマンドも登録されたままです。** `generate_handler!`はアプリケーションのコンパイル時に決まるので、コマンドは存在し、応答します。`From<PluginOff> for IpcError`（セクション13）がウィンドウにコード`plugin_off`を渡し、コマンドのロジックは1行のままです：`state.boards.as_ref()?.send(…)`。
- **変更は次の起動時に反映され**、ウィンドウはそのことを1文で伝えます。実行中に切り替えるということは、プラグインのレジストリがアクターになり（9.1の3つの問いすべてに当てはまります）、ベースの実行中にどのフックの一覧も変わりうるということです。再起動が本当に問題になるときだけ、そうしてください。
- **オフは決して削除しません。** プラグインのファイルはそのまま残り、テーブルもスキーマに残ります。どのプラグインのマイグレーションも、オンかどうかに関係なく実行されるので、どの組み合わせでもスキーマは同じです。プラグインのデータを削除するのは、ユーザーが求める別の操作です。
- **`needs`は純粋な関数です。** `plugin::logic::resolve(manifests, wanted)`は、オンにしてよいプラグインの集合か、欠けている依存を返します。必要とするプラグインがオフのままプラグインをオンにすること、またはほかのプラグインが必要とするプラグインをオフにすることは、もう一方のプラグインの名前を挙げた1文とともに拒否されます。ユーザーは両方を切り替えます。

### 23.6. フロントエンド

SLATはフロントエンドを規定せず（1.2）、境界だけを決めます。プラグインはほかのスライスと同じようにその境界を越えます。`plugin`スライスには、すべてのマニフェストをその状態とともに返すクエリ`plugin_list`があり、フロントエンドはプラグインがオンのときだけその画面を表示します。プラグインのフロントエンドのフォルダーには、セクション6と同じく、プラグインの名前を付けます。オフのプラグインの画面はまったくレンダリングしません。レンダリングしてスタイルで隠すのは、オフではありません。

### 23.7. 独自のcrateに置くプラグイン

プラグインのコンパイルが重いとき（5.3）、あるいはチェックではなくコンパイラーに23.3を守らせたいときは、`<product>-plugin-<name>`に移します。それは`core`に依存し、`core`はそれに依存せず、`app`は両方に依存します。こうすると23.3のルールは5.1と同じく`Cargo.toml`に書かれ、`deny.toml`（16.5）の`wrappers`がほかのすべてのcrateをそれから遠ざけます。5.3の6〜8個のcrateに数えられるので、重いプラグインにだけ行い、すべてのプラグインには行いません。

### 23.8. テスト

| 対象 | テストの方法 | 証拠とみなすもの |
|---|---|---|
| プラグインなしのベース | すべてのプラグインをオフにして組み立てた`AppState`。ベースのエンドツーエンドテスト | ベースで人が目にする文が変わらないこと |
| `plugin::logic::resolve` | 普通の`#[test]` | プラグインの集合、または欠けている依存 |
| プラグインのフック | その実装に対する普通の`#[test]`。スナップショットの値を使う | 返されたデータ |
| フックを伴うベースのフロー | テストモジュールに書いたフックを持つベースのサービス | ベースがフックの返したものを使ったこと |
| オフのプラグインのコマンド | エントリ経由 | `plugin_off`に対してウィンドウが表示する文 |

テストモジュールに書いたフックは、フックのtraitの2つ目の実装です。そのため、フックは拡張ポイントの中で最もテストしやすい種類です。

### 23.9. 既存のスライスをプラグインにする

1. **測定する。** 16.4の循環チェックから辺を取り出し、候補をインポートしているベーススライスをすべて列挙します。それらの辺が、プラグインのチェックのベースラインになります（16.1）。
2. **辺を1つずつ逆転させる。** プルリクエスト1つにつき1つです。ベースが公開してプラグインが聞く（第一の選択）か、ベースがフックを宣言してプラグインがそれに答えます。移動と修正は別々のプルリクエストにします（19.2）。
3. **マニフェストを加える。** `PLUGINS`のその行と、`AppState`の`Result<…, PluginOff>`フィールドも加えます。`on_by_default: true`にして、今日その機能を使っている人がそのまま使えるようにします。
4. **証明する。** ベースラインが空になったら、すべてのプラグインをオフにしてベースのテストを実行します（23.8）。そうして初めて、プラグインをオフにしてよくなります。

### 23.10. 強制

| ルール | 誰が強制するか |
|---|---|
| ベーススライスはプラグインスライスを決してインポートしない | 下の`checks/slat-plugins.sh`。独自のcrateに置くプラグインなら`Cargo.toml`（23.7） |
| プラグインスライスがほかのプラグインをインポートするのは、それが自分の`needs`にあるときだけ | 同じチェック。マニフェストの`needs`と照合する |
| ベーススライスにプラグインidがない | `core/src/plugin/`以外のベーススライスで`PluginId(`を探すgrepチェック |
| 実装が1つだけの`core`のtraitは`hooks.rs`のフックである | `core`の中で`hooks.rs`以外にある`trait`項目を探す`ast-grep`ルール（16.5）。ベースラインリスト付きで、リストにある各traitには実装が2つある（14.2） |
| すべてのマニフェストが`PLUGINS`にある | `plugin.rs`を持つフォルダーと`app/src/plugins.rs`を比較するチェック。`slat-registered.sh`と同様 |
| すべてのプラグインがオフでもベースが動く | 23.8のテストをCIで |

プラグインスライスとは、`plugin.rs`を持つフォルダーのことです。チェックは16.4の`checks/slat-edges.sh`を再利用します。

```bash
#!/usr/bin/env bash
set -euo pipefail

core="crates/quayside-core/src"
plugins="$(find "$core" -mindepth 2 -maxdepth 2 -name plugin.rs \
  | sed -E "s#^$core/([a-z_]+)/plugin\.rs#\1#" | sort)"
edges="$(checks/slat-edges.sh "$core")"

wrong="$(awk 'NR == FNR { plugin[$1] = 1; next } !($1 in plugin) && ($2 in plugin)' \
  <(printf '%s\n' "$plugins") <(printf '%s\n' "$edges"))"
if [ -n "$wrong" ]; then
  printf 'a base slice imports a plugin slice:\n%s\n' "$wrong"
  echo "listen to what the base publishes, or answer a hook (23.4)"
  exit 1
fi
echo "plugins: $(printf '%s\n' "$plugins" | sed '/^$/d' | wc -l | tr -d ' ') plugin slices, no base slice imports one"
```

スライスをプラグインにしている間（23.9）は、16.1と同じく、チェックはそのベースラインを差し引きます。

### 23.11. 外部からのプラグイン

ほかの誰かが書き、アプリケーションの実行中に読み込まれるコードは、SLATの範囲外です。Rustには安定したバイナリインターフェースがなく、プロセスに読み込まれたコードはアプリケーション全体を道連れにして落とすことがあります。外部からの拡張は独自のプロセスとして動き、`app/src/doors/`のエントリ、たとえばMCPサーバーを通じてアプリケーションとやり取りします。ルールはほかのエントリと同じです。アプリケーションの中では、それはプラグインではなくエントリです。

## 24. バージョン履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| 1.3 | 2026年10月25日 | セクション23「*プラグイン*」、任意：機能をプラグインにするとき、`plugin.rs`のマニフェスト、プラグインスライスを決してインポートしないベーススライス、3つの拡張ポイント（聞く、フックに答える、エントリを持つ）、実装が1つでも許される唯一のtraitとしてのフック、起動時に読むファイルに選択を置く1つのビルド、`AppState`の`Result<…, PluginOff>`、フロントエンドの境界、独自のcrateに置くプラグイン、すべてのプラグインをオフにしたテスト、既存のスライスをプラグインにする手順、`checks/slat-plugins.sh`、エントリとしての外部からの拡張。用語：プラグイン、ベーススライス、フック。決定木（17.8）とコントリビューターガイド用のセクション（18）がプラグインに触れる。バージョン履歴はセクション23からセクション24に移動。セクション1〜22の番号は変わらない。修正：22.1の日常のテストコマンドは`cargo t`。`kit`でも`unwrap()`と`panic!`を禁止（13、16）。サービスのキャッシュは短いロックを持ってよく、アクターの中のロックは新しいチェックが捕まえる（16.4、16.5）。`kit::paths`は古いパスを、オペレーティングシステムではなく、それが存在するかどうかで選ぶ（12.4）。コードブロック内のコメントの代わりに、コードブロックの前にファイル名。セクション5のワークスペースのツリーは縮めた形。テストの表にデータの継ぎ目（9.5、14）。*コマンド*と*Tauriコマンド*を区別（3）。エントリとその背後のドメインを区別（17.8）。スライスのエラーは自分の`dto.rs`で`IpcError`に対応づける（6.2、7.1、13）。`store`は読み取り用接続も配り、そのチェックを追加（5、16）。チェックはサブスライスにも及ぶ（16.1、16.4）。`checks/slat-edges.sh`はまとめたインポートも見る（16.4、23.10）。9.4のアクターの例は完全になり（`Deps`、`execute`、`Snapshot`、`mod.rs`、`Failed`）、スナップショットは変わったときだけ送る。`Default`の代わりに`StartRequest::new`（10）。新しいサブセクション14.5、エントリを通したテスト。 |
| 1.2 | 2026年10月25日 | セクション22「*ビルドとテストの時間*」：コンパイル時間の使われ方、ビルドの設定（`strip = false`と最適化したテストの依存関係を含む）、1つのフィーチャーの組、変更が影響しうるテストの実行、コピーオンライトのクローンから始める作業コピーごとの別々の`target/`、`main`からだけ書き込むキャッシュを使うCI、ビルドが最初からやり直しになる原因、`target/`の掃除。`core`が依存しないcrateに置く重いネイティブドライバー（5.3）。新しいサブセクション14.3（差分に対するミュータント）、14.4（`update`のプロパティテスト）、16.5（Clippy、`cargo-deny`、`ast-grep`）。チェックのなかったルールへのチェック：`logic.rs`の純粋さ、スライスの`mod.rs`、スライスの循環、10行のコマンド、`unwrap()`と`panic!`。`fake`フィーチャーよりデータの継ぎ目を優先。crateのコストの訂正（5.2、5.3）、エディション2024のための`resolver = "3"`（5.1）、プラットフォームジョブのキャッシュのステップ（16.3）。バージョン履歴はセクション22からセクション23に移動。セクション1〜21の番号は変わらない。 |
| 1.1 | 2026年10月25日 | セクション12「*プラットフォーム*」：`drivers`内の`platform/`フォルダー、プラットフォーム契約、`platform/`の外での禁止事項、パス・ファイル・テキストのルール、プラットフォームのテスト、LinuxとWindowsでのCIのコンパイルジョブ、移植のレシピ。ティア、強制、レシピ、決定木への追記。 |
| 1.0 | 2026年10月24日 | 最初のバージョン：ティア、決まったレイヤーを持つスライス、インポートのルール、データの流れ、アクター、コンポジションルートとしてのアプリケーションの状態、エラー、テスト、サイズの上限、強制、レシピ、移行。 |

SLATはライブラリと同じようにバージョン管理されます。新しいルールがベースラインのリストとともに加わる場合は、マイナーバージョンを上げます。今日のコードは準拠したままで、新しい違反だけがレッドになります。1.1がプラットフォームのルールを加えたのはこの方法です。準拠したコードを非準拠にし、それを吸収するベースラインがない変更、たとえばスライスのファイル名の変更や依存の向きの反転は、メジャーバージョンを上げます。ルールを変えない訂正では、バージョンは変わりません。SLATに従うリポジトリはすべて、従っているバージョンをコントリビューターガイドに明記します。
