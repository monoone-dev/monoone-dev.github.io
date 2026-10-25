SLAT 是一种组织桌面应用后端的模式，适用于用 Rust 编写、以 Tauri 作为窗口层的应用。它回答了每个不断增长的代码库迟早都会答错的三个问题：**这个文件该放在哪里**、**谁可以导入谁**，以及**数据如何**在窗口、领域和外部世界之间**流动**。

这个名字列出了它的四个构建单元：**S**lice、**L**ayer、**A**ctor、**T**ier。本文中的每一条规则都与其中之一有关。

本页是完整的参考文档。它的写法让从未接触过 SLAT 的团队也能在新项目中采用它，或迁移现有项目，而无需向我们提问。文中包含规则、规则背后的原因、可以直接复制的代码、执行这些规则的检查，以及一个把混乱的应用逐步整理成形的完整示例。

各节编号是固定的。遵循 SLAT 的仓库会在 `docs/slat/SLAT.md` 中保存一份使用相同编号的规则简版，因此像“第 17.8 节”这样的引用，在本页和仓库中指的是同一处内容。两者不一致时，在同一天内一起修正。新的一节总是加在版本历史之前，版本历史始终位于最后。

> **版本 1.2** · 2026年10月25日。1.2 版新增第 22 节 *构建和测试时间*：SLAT 工作区中的编译时间花在哪里、能缩短它的设置、如何只运行一次改动可能影响到的测试，以及哪些情况会让构建在不该重来时从头开始。它还为本指南的每条规则都配上了检查，包括 `logic.rs` 的纯度、切片之间的循环和 10 行命令。完整历史见第 23 节。

## 1. SLAT 为什么存在

Tauri 应用起步时都很小。有一个 `main.rs`、几个 `#[tauri::command]` 函数，也许还有一个 `state.rs`。六个月后，同一个项目通常会变成这样：

- 一两个巨大的文件装着“所有命令”，而命令里装着全部业务逻辑；
- 应用状态是一个有三十个字段的结构体，其中一半是 `Mutex<Option<…>>` 和 `AtomicBool`；
- 还有几个 `static` 变量保存着更多无人负责的状态；
- 领域逻辑直接调用 `app.emit(…)`，因此没有窗口就什么都测不了；
- 函数不断衍生出变体：`start_with_budget`、`start_with_budget_and_slots`、`start_with_hook`；
- `#[cfg(target_os = "macos")]` 散落在整个代码库中；
- 新开发者或编码智能体需要花一天时间才能找到某个功能在哪里。

这些问题都不是人的错。原因在于对“这个该放在哪里？”没有共同的答案。没有答案时，离得最近的文件就会胜出，而最近的文件总是最大的那个。

SLAT 为每一类代码一次性给出这个答案，并把其中重要的部分变成**机械化**的规则：编译器和几个小脚本会拒绝破坏布局的代码，因此布局能经受住截止日期、新成员和编码智能体的考验。

SLAT 之于 Rust 后端，就像 Nx 加 NgRx 之于前端：一套独立于任何具体应用的规则。我们在每个使用 Rust 和 Tauri 后端的 MonoOne 产品中都使用它，包括 RigOne 和 IndexOne。

### 1.1. 目标

1. **可查找性。** 知道功能名称的人或智能体，就知道它在应用两侧各自位于哪个文件夹。
2. **无需窗口即可测试。** 除了薄薄的入口层，其余一切都能在没有 Tauri、没有显示器、没有真实进程的情况下编译并运行测试。
3. **由编译器执行的边界。** 依赖方向写在 `Cargo.toml` 里，而不是 wiki 里。
4. **长生命周期状态只有一个所有者。** 后台工作（一次运行、一次录音、一段对话）只有一个所有者，其规则是一个纯函数。
5. **低成本增长。** 新功能是一个包含固定文件集的新文件夹，而不是对五个共享文件的修改。
6. **天生可移植。** 依赖操作系统的代码集中在一个文件夹中，因此支持新平台只需新增一个文件，而不是搜遍整个仓库。

### 1.2. 非目标

- SLAT 不规定你的前端。它只固定边界上的契约：命令、数据传输对象（DTO）和事件。
- SLAT 不是框架。没有需要依赖的 crate。它是一种布局、一套规则和几个脚本。
- SLAT 不取代你仓库自己的规则。当项目规则与 SLAT 冲突时，**以项目规则为准**。SLAT 说明东西放在哪里；项目说明什么是禁止的。

### 1.3. 谁应该使用它

SLAT 面向使用 Tauri 的 Rust 桌面应用，后端代码量大约在 10,000 行及以上。这些思路同样适用于任何带有薄入口层的 Rust 应用（CLI、守护进程、服务器）：把“Tauri 命令”换成“HTTP 处理函数”或“CLI 子命令”，其余一切照样成立。

## 2. 一页看懂 SLAT

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

需要记住的六句话：

1. **只有 `app` crate 知道 Tauri。** 其余一切都在没有窗口的情况下编译和测试。
2. **一个功能位于一个切片中，切片有固定的文件。** 要找聊天功能？它在 `core/chat/` 和 `app/chat/`。
3. **一个 Tauri 命令最多 10 行**：反序列化，调用切片的一个函数，把结果映射为 DTO。
4. **长生命周期状态只有一个所有者：Actor。** 应用状态中不出现 `Mutex<Option<…>>` 或 `AtomicBool`，切片内部不出现带状态的 `static`。
5. **依赖向下指。** 较低的层级从不导入较高的层级，由编译器保证。
6. **只有 `drivers/src/platform/` 知道操作系统。** 其余代码只请求概念（进程组、密钥、数据文件夹），从不直接请求系统调用。

## 3. 术语

| 术语 | 含义 | 前端中的对应物 |
|---|---|---|
| **层级（Tier）** | 一类 crate：`kit`、`store`、`drivers`、`core`、`app`。层级自上而下堆叠，只向下依赖。 | Nx 中的库类型（`type:util`、`type:data-access`……） |
| **切片（Slice）** | 产品的一个功能，例如 `run`、`chat` 或 `skill`。 | 领域文件夹，`src/sections/<area>` |
| **层（Layer）** | 切片内部名称和职责都固定的文件：`model.rs`、`logic.rs`、`store.rs`、`service.rs`。 | `feature/`、`ui/`、`data-access/`、`util/` |
| **Actor** | 长生命周期状态的唯一所有者：`Msg → update → Effect`。 | NgRx store：action → reducer → effect |
| **句柄（Handle）** | 从外部进入 Actor 的唯一入口。 | `inject(Store)` |
| **快照（Snapshot）** | 窗口看到的 Actor 视图，通过 `watch` 通道发布。 | `select(…)` |
| **入口（Entry）** | 外部世界调用后端的方式：Tauri 命令、MCP 服务器、本地桥接、远程中心。 | 页面组件 |
| **查询（Query）** | 没有副作用的读取。 | selector |
| **命令（Command）** | 状态的变更。 | action |
| **事件（Event）** | 后端在未被请求的情况下告知前端某些东西发生了变化。 | 推送到 store |
| **平台（Platform）** | 我们为之构建的操作系统：`macos`、`linux`、`windows`。 | 浏览器目标 |
| **平台契约（Platform contract）** | `drivers::platform` 中的一个函数，在每个操作系统上含义相同。 | polyfill |

其中有三个概念容易混淆，所以请记住这个画面：**层级是一栋楼的楼层，切片是 `core` 这一层上的公寓，层是每套公寓里的房间。**

## 4. SLAT 的由来

SLAT 的各个部分并不新。它组合了五个广为人知的思想，并把每个思想留下的未决选择定了下来。

| 思想 | SLAT 从中借鉴了什么 | SLAT 在此基础上决定了什么 |
|---|---|---|
| 分层架构 / 整洁架构 | 依赖指向领域；I/O 位于边缘。 | 层就是 **crate**，因此由编译器检查方向。恰好五类。 |
| 垂直切片架构 | 代码按功能分组，而不是按技术职责分组。 | 每个切片都使用**相同的文件名**，承担相同的职责。 |
| Elm 架构、NgRx、Redux | 状态通过消息和纯 update 函数变化。 | 仅用于通过三问测试的状态（第 9.1 节）。效果的结果以消息形式返回。 |
| 函数式核心，命令式外壳 | 决策是纯的；副作用单独执行。 | 按规则 `logic.rs` 和 `update.rs` 必须是纯的，并由脚本检查。 |
| 端口与适配器（六边形架构） | 通过接口访问外部世界。 | 在出现两个实现之前不写 trait。`drivers` 层级和平台契约扮演端口的角色。 |

与单独使用其中任何一个相比，SLAT 的区别在于它**完整且机械化**。每一类代码都有且只有一个位置，重要的规则由 `Cargo.toml` 或在 CI 中运行的检查来执行。

## 5. 层级

一个 SLAT 工作区最多有五类 crate。它们命名为 `<product>-<tier>`，例如 `quayside-core`。

| 层级 | 这里放什么 | 可以依赖 | 绝不可以 |
|---|---|---|---|
| `kit` | 不含领域的共享类型和工具：标识符、时间、路径（`kit::paths`）、持久化文件写入、基础错误类型、日志。 | 仅外部库 | `tauri`、`tokio::process`、SQL、操作系统 `#[cfg]`、产品中的任何东西 |
| `store` | 持久化：写连接、迁移、schema、索引重建、数据库加密。 | `kit` | `tauri`、领域逻辑、进程 |
| `drivers` | 外部世界：进程、各提供商的命令行工具、HTTP、sidecar。依赖操作系统的代码只存在于 `drivers/src/platform/`。 | `kit` | `tauri`、`store`、领域逻辑 |
| `core` | 所有领域切片：模型、逻辑、用例、Actor。 | `kit`、`store`、`drivers` | `tauri` |
| `app` | 入口：Tauri 命令、DTO、事件、入口服务器（MCP、桥接）、应用状态、`setup`、`main`。 | 其他所有层级 | 领域逻辑（它属于 `core`） |

在本文中，`core/…` 和 `app/…` 是这两个 crate 源码文件夹的简写。`core/src/<slice>/` 即 `crates/<product>-core/src/<slice>/`，`app/src/<slice>/` 即 `src-tauri/src/<slice>/`，也就是 Tauri 为 app crate 创建的文件夹。第 16 节中的检查使用完整路径。

一个完整的 SLAT 工作区：第 20 节的示例应用 Quayside 迁移之后的样子。

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

### 5.1. 编译器就是守卫

层级之间的箭头写在每个 crate 的 `Cargo.toml` 中。如果 `core` 没有把 `tauri` 列为依赖，那么在 `core` 中写 `use tauri::Manager;` 就是编译错误。这是一条规则能拥有的最强保证：它不会被遗忘，不会在评审中被跳过，也无从争辩。

一个最小的工作区：

```toml
# Cargo.toml (workspace root)
[workspace]
resolver = "3"
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
quayside-store = { path = "../crates/quayside-store" }
quayside-kit = { path = "../crates/quayside-kit" }
tauri = { version = "2", features = [] }
```

### 5.2. 一开始建几个 crate

最少两个：`core` 和 `app`。只有当其他层级的代码已经存在且干净（即不导入更高层级的任何东西）时，才把它们拆分出来。**禁止“为以后准备”的空 crate。** 它让每次构建多运行一次编译器，让每次测试运行多链接它自己的测试二进制，却没有任何价值。

### 5.3. 何时拆分一个层级

当 `core` 超过大约 60,000 行，或者修改一个切片后完整重建 `core` 变得痛苦时，把一组切片移到 `core-<group>` 中，例如 `quayside-core-run`。crate 总数最多保持在六到八个。库 crate 不会被链接，但每个 crate 都带有自己的测试二进制，而每个测试二进制都要单独链接（第 22.1 节）。在笔记本电脑上，机器卡死的代价远高于更细拆分所节省的那几秒。要靠测量来决定，而不是靠感觉：`cargo build --timings` 会显示 `core` 是否真的是瓶颈（第 22.6 节）。

**按编译负担拆分，而不只是按行数。** 封装大型原生库或机器学习库（语音识别、推理运行时、由 C 源码编译的数据库）的驱动，往往比 Tauri 本身还重。放在 `drivers` 里，它会被编译并链接进 `core` 的每个测试二进制，因为 `core` 依赖 `drivers`。给这样的驱动一个单独的 crate，`<product>-drivers-<name>`，`core` 不依赖它。`app` 依赖它，并通过数据接缝（14.2）把它的输出交给切片，或者让驱动作为 `app` 启动的独立辅助进程运行。这样 `core` 的测试就从不编译它。`cargo-deny` 保证这一点：`deny.toml`（16.5）中的 `{ crate = "quayside-drivers-speech", wrappers = ["quayside"] }` 会让通往该 crate 的任何其他路径变红。

### 5.4. 兼容性例外

Tauri 打包器或用户数据已经知道的库名（例如 `quayside_lib`，或用户主目录下的某个文件夹）保留在 `app` crate 中。新的 crate 使用新的名字。

## 6. 切片

切片是产品的一个功能。它的名字是 `snake_case` 的单数名词：`recording`、`transcript`、`board`、`trigger`。不是 `recordings_manager`，也不是 `utils`。如果产品有前端，切片名与前端的功能文件夹保持一致，这样同一个词就能在两侧找到代码。

一个切片存在于两个层级中：它的领域在 `core`，它的入口（命令、DTO、事件）在 `app`。

:::diagram slice

### 6.1. `core` 中的切片

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

规则：

- **切片不需要的文件就不存在。** 小切片在超过大约 400 行之前，可以只是一个包含模型和服务的 `mod.rs`。
- **变大的文件变成同名文件夹**：`logic.rs` 变为 `logic/mod.rs` 加 `logic/<topic>.rs`。职责不变，只是文件数量变了。
- **过大的切片拆分为子切片**：`run/` 变为 `run/start/`、`run/step/`、`run/finish/`，每个都采用相同的文件布局。父级只保留一个用于重新导出的 `mod.rs`。
- **`mod.rs` 是切片的正门**，就像 Nx 库的 `index.ts`。其他切片只通过它导入。

一个典型的 `mod.rs`：

```rust
mod logic;
mod model;
mod service;
mod store;

pub use model::{Transcript, TranscriptId, Word};
pub use service::TranscriptService;
```

### 6.2. `app` 中的切片

```tree
app/src/<slice>/
  mod.rs        `mod …;` and `pub mod commands;` (the command list itself is in lib.rs, 6.4)
  commands.rs   #[tauri::command] functions; at most 10 lines each
  dto.rs        wire types: serde camelCase, #[serde(other)] on enums, From<model>
  events.rs     event names and payloads sent to the window; snapshot subscription loops
```

`app` crate 的其余部分：

```tree
app/src/
  main.rs       calls lib::run(); nothing else
  lib.rs        run(): Builder, plugins, setup, generate_handler! with every command, grouped by slice
  state.rs      AppState: the composition root, section 11
  error.rs      entry error → code and text for the window
  platform.rs   optional: window and menu settings that depend on the operating system, section 12.3
  doors/        entries other than the window: MCP server, bridge for agents, remote hub
```

### 6.3. 命令的参考形态

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

如果一个命令需要 `if`、循环或两次调用切片，那段逻辑就属于 `service.rs` 或 `logic.rs`。10 行的限制与风格无关。只做转换的命令不需要单独的单元测试，因为它的逻辑已在切片中测试过。剩下需要证明的是人看到的那句话，这要通过入口进行端到端测试（第 14 节）。

### 6.4. 注册命令

`tauri::generate_handler!` 需要每个命令的完整路径，所以 `lib.rs` 维护一份列表。按切片分组，每个切片一个块，这样新增命令只需在相邻命令旁加一行：

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

一个存在于切片中却不在这份列表里的命令能够编译，却悄无声息地什么也不做。第 16 节提供了一个小检查，用于比对两者，在它们不一致时失败。

### 6.5. 切片命名

- 每个功能一个名词，用单数：`trigger`，不是 `triggers`。
- 用用户认得的事物名称，而不是技术名称：`transcript`，不是 `whisper_pipeline`。
- 两个功能总是一起变化时，它们是一个切片。一个功能中有各自独立变化的部分时，它们是子切片。
- **横切策略也是切片**：访问门控、限额、预算和密钥保护都位于 `core/<policy>/`（例如 `core/guard/`），其他所有切片调用它们。

## 7. 谁可以导入谁

### 7.1. 切片内部

| 文件 | 可以导入 | 不可以导入 |
|---|---|---|
| `model.rs` | `kit`；其他切片的 `model`，通过它们的 `mod.rs` | 任何带 I/O 的东西、`async`、`store`、`drivers` |
| `logic.rs` | `model` | I/O、`async`、`store`、`drivers`、`service` |
| `store.rs` | `model`、`store` crate | `drivers`、`service`、其他切片的 `logic` |
| `service.rs` | `model`、`logic`、`store.rs`、`drivers`、其他切片的公共 API | `tauri`、全局状态 |
| `actor/*` | `model`、`logic`、`service`、`drivers` | `tauri`；此外 `update.rs` 不得有 I/O |
| `app/<slice>/dto.rs` | 本切片的 `model` | `service`、`store` |
| `app/<slice>/commands.rs` | 本切片的公共 API、`dto`、`AppState` | `store`、`drivers`、`logic` |

### 7.2. 切片之间

- **只通过 `mod.rs`。** 禁止从另一个切片使用 `crate::run::logic::…` 这样的深层路径。
- **不允许循环。** 如果 `a` 需要 `b`，而 `b` 也需要 `a`，共享的部分就成为独立的切片（通常是一个小 `model` 或小服务），两者都依赖它。
- **策略是切片，不是命令。** 如果预算检查放在命令里，那么每个需要它的较低层都不得不向上导入。这是 Tauri 应用中出现循环依赖最常见的原因。

### 7.3. 为什么界线划在这里

导入表的设计目的，是让测试成本高的东西（I/O、async、进程）集中在尽可能少的文件中，而测试价值高的东西（决策）放在完全不含这些的文件里。`logic.rs` 中的决策用普通的 `#[test]` 就能在微秒级完成测试。同样的决策埋在命令里，就需要一个窗口。

## 8. 数据流

:::diagram flows

### 8.1. 查询（读取）

```
window ─invoke─► app/<s>/commands.rs ─► core/<s>/service.rs ─► core/<s>/store.rs
                        ◄── dto.rs ◄──────── model ◄──────────────────┘
```

读取不经过 Actor，除非它读取的就是该 Actor 的状态。那时它从句柄读取最新的 `Snapshot`，而不发送消息。

### 8.2. 命令（变更）

没有后台状态时（保存一个设置、创建一个文件）：

```
window ─invoke─► commands ─► service ─► logic (decision) ─► store / drivers ─► result
```

有后台状态时（一次运行、一段对话、一次录音）：

```
window ─invoke─► commands ─► Handle.send(Msg)
                                  │
                 actor ◄──────────┘
                   update(&mut State, Msg) -> Vec<Effect>     pure function
                   for e in effects: execute(e)               I/O: drivers, store, timers
                   snapshot.send(State.view())                the window gets a new view
```

### 8.3. 事件（后端 → 窗口）

事件**只**从 `app/<s>/events.rs` 发出。`core` 中的切片通过 `watch::Sender<Snapshot>` 或 `broadcast::Sender<Event>` 发布变化。`events.rs` 订阅它们并调用 `emit`。这让 `core` 对窗口一无所知，也让前端对每个切片的事件来源只有一个位置。事件名遵循 `<slice>:<event>`，例如 `recording:snapshot`。

```rust
// app/src/recording/events.rs
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

### 8.4. 高频数据流

有些切片会产生大量小事件：日志行、转写出的单词、进度刻度。不要每一行都发出一个 Tauri 事件。在 `core` 中给切片一个有界通道：一个属于该切片自己的小型发送端类型（例如第 20.3 节中的 `WordSink`），它的 `send` 从不等待，并返回发生了什么，例如 `Sent::Delivered`、`Sent::Dropped` 或 `Sent::Closed`。让 `app/<s>/events.rs` 拥有一个**泵（pump）**，每隔几毫秒把这些行批量送入 `tauri::ipc::Channel`。有界通道就是背压：窗口处理变慢时，切片会知道（`Sent::Dropped`），而不是把内存填满；当不再有人监听时（`Sent::Closed`），切片可以停下来。批处理、通道和帧率都是入口的关注点，留在 `app` 中。
## 9. Actor：带状态的切片

### 9.1. 何时使用 Actor

只有当以下**三条全部**成立时才使用 Actor：

1. 状态的生命周期长于一次命令调用；
2. 有多个来源并发地改变它（窗口、进程、定时器、网络）；
3. 窗口实时观察它。

其他所有情况都使用普通的 `service.rs`。不是每个 NgRx feature 都需要 effects，也不是每个 SLAT 切片都需要 Actor。

| 候选 | 1 | 2 | 3 | 结论 |
|---|---|---|---|---|
| 一次包含步骤和进程的智能体运行 | 是 | 窗口、进程、定时器 | 是 | Actor |
| 一次实时录音 | 是 | 窗口、音频设备、定时器 | 是 | Actor |
| 一段与模型的对话 | 是 | 窗口、模型进程、远程设备 | 是 | Actor |
| 生成一次草稿并返回 | 是 | 窗口（开始/停止） | 否，只有一个结果 | 服务 + `kit::Jobs` |
| 模型价格缓存 | 是 | 无 | 否 | 切片服务的一个字段 |

### 9.2. 文件

```tree
core/src/<slice>/actor/
  mod.rs        pub use Handle, Msg, Snapshot
  msg.rs        enum Msg: everything that can happen (from the window, a process, a timer)
  state.rs      struct State: the only place where the state exists
  update.rs     fn update(state: &mut State, msg: Msg) -> Vec<Effect>; pure, no I/O, no async
  effect.rs     enum Effect + async fn execute(effect, &Deps) -> Option<Msg>
  run.rs        the loop: recv → update → execute → snapshot.send; started with tokio::spawn
  handle.rs     struct Handle { tx, snapshot }: send(), current(), subscribe(); ask() with a oneshot only when a caller needs a reply
  snapshot.rs   struct Snapshot: what the window sees; From<&State>
```

:::diagram actor

### 9.3. 契约

- **`update` 是纯函数。** 它接收状态和一条消息，返回一个效果列表。关于该状态的每条业务规则都可以在没有 tokio、进程或数据库的情况下测试。
- **产生结果的效果以新的 `Msg` 返回结果。** Actor 从不在自己的循环中等待耗时的效果。耗时的效果交给 `tokio::spawn`，其结果通过邮箱返回。
- **取消是一条带代数（generation）的消息**，而不是一个标志：`Msg::Cancel { generation }`。状态持有 `generation: u64`，带有旧代数的迟到回复会在 `update` 中被忽略。全局 `AtomicBool` 会在不同操作之间泄漏；代数不会。
- **结果是一个值**：`enum Outcome<T> { Done(T), Cancelled }`，绝不是 `Err(Cancelled)`。取消是用户主动要求的，不是失败。
- **时间限制是 `Effect::StartTimer`，超时是 `Msg::TimedOut`。** 超时后结束进程由驱动完成。单纯的 `tokio::time::timeout` 取消的是 Rust future，而不是操作系统进程。
- **Actor 内部不使用 `std::sync::Mutex`。** 它的状态只有一个所有者，所以不需要锁。
- **每个状态实例一个 Actor**：每次运行一个，每段对话一个。活跃实例的注册表本身是一个小 Actor，或者是一个持有句柄映射的服务。

### 9.4. 一个完整的小 Actor

一个录音 Actor：启动录音进程，执行时间限制，并且可以停止（保留文件）或取消（丢弃文件）。所有类型名和函数名仅作示意。

```rust
// msg.rs
pub enum Msg {
    Start { title: String, limit: Duration },
    Started { generation: u64, pid: ProcessId },
    Level { generation: u64, db: f32 },
    Stop { generation: u64 },
    Cancel { generation: u64 },
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

impl Phase {
    pub fn is_active(&self) -> bool {
        matches!(self, Phase::Starting | Phase::Recording { .. } | Phase::Stopping)
    }
}
```

```rust
// effect.rs
pub enum Effect {
    SpawnRecorder { generation: u64, title: String },
    StopRecorder { pid: ProcessId },
    CancelRecorder { pid: ProcessId },
    StartTimer { generation: u64, after: Duration },
    Persist(RecordingFile),
}
```

```rust
// update.rs
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
                    vec![Effect::StopRecorder { pid }]
                }
                _ => vec![],
            }
        }
        Msg::Cancel { generation } if generation == state.generation => {
            match state.phase.clone() {
                Phase::Recording { pid } => {
                    state.phase = Phase::Stopping;
                    vec![Effect::CancelRecorder { pid }]
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

只要没有正在进行的录音，就可以开始新的录音，包括在之前的录音已保存或已取消之后。最后一个分支正是代数的意义所在：来自之前某次录音的 `Level`、`TimedOut` 或 `Ended` 消息带着旧的代数到达，不会改变任何东西。

```rust
// run.rs
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

循环只为自身效果的结果保留一个弱发送端。当最后一个 `Handle` 被 drop 时，`recv` 返回 `None`，Actor 随之结束，而不是永远等待下去。

当效果的顺序很重要时（例如先持久化再通知），在一个派生出的任务中按顺序执行这些效果，而不是每个效果一个任务。规则只有一条：循环本身从不等待。

### 9.5. 测试 Actor

大多数测试根本不启动 Actor。它们直接调用 `update`：

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

少数测试通过 Actor 的句柄驱动整个 Actor，配合 `tokio::time::pause()`、一个假驱动，以及对快照序列的断言。

## 10. 变体爆炸

像 `start_with_budget`、`start_with_slots`、`start_with_snapshot_hook`、`start_with_budget_and_slots` 这样的一族函数，说明缺少一个请求结构体。用一个入口函数和一个选项结构体替换这一族函数：

```rust
#[derive(Default)]
pub struct StartRequest {
    pub workflow: WorkflowRef,
    pub task: Option<String>,
    pub at_once: Option<NonZeroUsize>,
    pub budget: Option<Money>,
    pub origin: Option<Origin>,
    #[cfg(any(test, feature = "test-hooks"))]
    pub faults: Faults,
}

pub async fn start(deps: &Deps, request: StartRequest) -> Result<Outcome<RunId>, StartError> {
    todo!()
}
```

调用方写成 `StartRequest { workflow, budget: Some(limit), ..Default::default() }`。新增一个选项只是新增一个字段，而不是新增一个函数并修改每个调用方。仅用于测试的注入点（`faults`、`hooks`）是只在测试构建中存在的字段。单靠 `cfg(test)` 只覆盖该 crate 自己的单元测试，因此集成测试和其他 crate 通过 `test-hooks` feature 启用这些字段，思路与 14.2 中的伪驱动相同。在每个测试命令中都以同样的方式启用它（第 22.3 节）；否则，每次在启用该 feature 的构建和未启用的构建之间切换，都会重新编译这个 crate 以及它之上的一切。

## 11. AppState：组合根

`AppState` 负责组装应用，除此之外什么也不做。它可以持有：

- 各切片的 `Arc<…Service>` 和 `…Handle` 值；
- 只读配置；
- 数据库写入器的句柄。

它不可以持有：

- 描述某个后台过程的 `Mutex<Option<…>>`、`AtomicBool` 或 `Mutex<HashMap<…>>`。那是 Actor 的状态，属于 `core/<slice>/actor/state.rs`；
- 属于某个切片内部细节的字段（缓存、取消映射、队列）。

此外，切片也不可以把状态藏在 `static` 变量中（`OnceLock<Mutex<…>>`、`LazyLock<Mutex<…>>`）。唯一的例外是只计算一次、在进程存活期间永不改变的常量（`OnceLock<PathBuf>`）。

**检验方法：** `AppState` 的每个字段都能用切片中的一个名词来描述（“recordings”“runs”“account”）。需要一句话才能描述的字段，应当放进切片内部。

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

### 11.1. `kit::Jobs`：一次性后台工作

生成草稿、比较两个文件夹或规划一项任务，都在后台运行、可以停止，并且只产生一个结果。这不需要 Actor。它需要的是一个取消映射，而这个映射属于切片的服务，而不是 `AppState`。`kit::Jobs<K>` 是为此准备的一个具体泛型类型：

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

`begin` 会取消同一个键下更早的任务，存入新的代数，并返回一个守卫（guard）；守卫被 drop 时移除该条目，但前提是代数仍然匹配。锁只在这两个简短的函数内部持有，从不跨越 `await`。由于 `Jobs` 是具体类型而不是 trait，它不违反“不写单一实现 trait”的规则。

这并不是第 11 节规则的漏洞。那些规则关心的是状态存放在哪里，而不是它的类型。`kit::Jobs` 内部的锁由某一个切片的服务拥有，且从不跨越 `await` 持有，它是该切片的私有细节。同样的映射如果成为 `AppState` 的字段，就是无人拥有的状态。

## 12. 平台

*1.1 版新增。*

一个产品今天可能只在一个操作系统上发布（例如只有 macOS）。SLAT 对代码的布局，让支持下一个操作系统只需在**一个文件夹**中完成，而不是搜遍整个仓库。规则只有一条：**只有 `drivers/src/platform/` 知道操作系统。** 其余一切都只请求概念（进程组、密钥、数据文件夹、打开文件），从不直接请求系统调用。

支持的平台列表属于仓库（它的贡献者指南），而不属于 SLAT。

:::diagram platform

### 12.1. 布局

```tree
drivers/src/platform/
  mod.rs          the only platform API: selects a file with #[cfg] and pub use; no logic
  unix.rs         shared by macOS and Linux: process groups, signals, file modes
  macos.rs        Keychain, revealing in Finder, the login shell, …
  linux.rs        only when the port starts: Secret Service, xdg-open, …
  windows.rs      only when the port starts: Job Objects, Credential Manager, ACLs, …
  unsupported.rs  every function returns Err(PlatformError::Unsupported)
```

- 产品尚不支持的操作系统对应的文件**不存在**，理由与不建“为以后准备”的空 crate 相同。由 `unsupported.rs` 代替它。
- `unsupported.rs` 不是死代码。有了它，除 `app` 外的整个工作区从第一天起就能在每个平台上编译。系统代码泄漏进 `core` 会变成 CI 中的编译错误，而不是在移植当天才被发现。
- `mod.rs` 在每个仓库中都长得一样：

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

移植只需修改这几行 `cfg`。每个平台文件都暴露**同一组函数和类型，签名完全相同**。缺少某个函数就是该平台上的编译错误。这不是 trait：在任何一次构建中，始终只有一个实现。

### 12.2. 契约

每个概念都有一份契约，它在每个操作系统上含义相同。只有内部实现不同。

| 概念 | `drivers::platform` 中的 API | macOS | Linux | Windows |
|---|---|---|---|---|
| 进程组 | `ProcessGroup::spawn`、`terminate(grace)`、`proved_dead()` | 进程组 id；SIGTERM、宽限期、SIGKILL；`kill(-pgid, 0)` 返回 `ESRCH` | 同 macOS | Job Object；`TerminateJobObject`；该 job 中已没有进程 |
| 密钥 | `secret::read`、`secret::write`、`secret::delete` | Keychain | Secret Service（libsecret） | Credential Manager |
| 私有文件和文件夹 | `fs::write_private`、`fs::create_private_dir` | 权限 `0o600` / `0o700` | 同 macOS | ACL：仅所有者 |
| 用系统打开 | `open_path`、`reveal_path`、`open_url` | `open`、`open -R` | `xdg-open` | `ShellExecuteW`、`explorer /select,` |
| 用户环境 | `login_env()` | 登录 shell（从 Dock 启动的应用 `PATH` 极简） | 同 macOS | 注册表和进程环境 |
| 查找程序 | `which(program)` | `PATH` | `PATH` | `PATH` 加 `PATHEXT` |
| 机器信息 | `machine::cores`、`machine::memory`、`machine::free_space` | sysctl、statfs | /proc、statfs | 系统 API |

契约规则：

- 契约函数不返回系统类型（`pid_t`、`HANDLE`）。它返回来自 `drivers` 或 `kit` 的类型。
- 在每个平台上都要**证明，而不是期望**：“进程已结束”是一个已被确认的事实，而不是一个已经发出的信号。
- 当某个操作系统无法做到契约要求的事情时，函数返回一个指明缺少什么的错误，绝不悄悄用别的东西替代。

一个契约及其 macOS 实现的简短示例：

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

### 12.3. `platform/` 之外禁止什么

| 在 `drivers/src/platform/` 之外禁止 | 改用 |
|---|---|
| `#[cfg(unix)]`、`#[cfg(windows)]`、`#[cfg(target_os = …)]` | 12.2 中的契约 |
| `std::os::unix`、`std::os::windows`、`libc`、`nix`、`windows-sys`、`security-framework` | 12.2 中的契约 |
| `sh -c`、`bash`、`zsh`、`cmd /c`、`powershell` | `Command::new(program).args(…)`；如果确实需要 shell，由 `platform` 选择 |
| 系统程序名：`open`、`xdg-open`、`security`、`osascript`、`explorer` | `open_path`、`secret::*`…… |
| 硬编码路径：`~`、`$HOME`、`/tmp`、`/usr/bin`、`/Applications`、`Library/` | `kit::paths`（12.4） |
| 用字符串 `/` 拼接路径 | `Path::join` |
| 以数字表示的文件权限（`0o600`） | `fs::write_private` |

唯一的例外是 `app/src/platform.rs`，用于只有 Tauri 才知道的东西：标题栏样式、应用菜单、窗口激活策略。除窗口设置外什么都不放。

### 12.4. 路径、文件和文本

- **文件夹只来自 `kit::paths`**：`data()`、`config()`、`cache()`、`logs()`、`temp()`。其底层是一个遵循各系统约定的库（macOS 的 `~/Library/Application Support/<App>`、Linux 的 XDG、Windows 的 `%APPDATA%`）。已经存放在旧路径下的数据，在创建它的系统上继续留在原处（5.4 中的兼容性例外）；在那个系统上，`kit::paths` 返回旧路径，因此代码仍然只询问 `kit::paths`。`kit` 本身没有 `#[cfg]`：系统约定来自那个库。
- **应用创建的文件名一律小写**，并且绝不只靠大小写区分。macOS 和 Windows 的默认文件系统不区分大小写；Linux 区分。
- **不要重命名或删除别人正打开着的文件。** Windows 会拒绝。原子写入通过 `kit::durable_file` 完成，它会在替换文件之前先关闭文件。
- **长路径。** 不加 `\\?\` 前缀时，Windows 把路径限制在大约 260 个字符。让工作副本和运行文件夹的层级保持浅；前缀由 `platform` 添加，绝不由切片添加。
- **来自进程的文本**在读取时要容忍 `\r\n`。应用写入的文件使用 `\n`。
- **发送给窗口的路径**使用 UTF-8。无法写成 UTF-8 的路径是一个指明文件的错误，绝不是 `unwrap()`。

### 12.5. 平台测试

- **契约测试**位于 `drivers/tests/it/platform_contract.rs`，是该 crate 唯一集成测试目标（14.1）中的一个模块，对每个操作系统都相同：`terminate` 之后进程已结束；密钥写入后能读回、删除后就消失；私有文件不能被其他用户读取。每个受支持的平台都要通过**同一套**测试。
- **`drivers` 之外的测试不使用 shell 或信号。** 测试需要的进程是一个小 Rust 程序（测试 crate 中的一个二进制），而不是 `sh -c 'sleep 10'`。
- 测试中的平台 `#[cfg]` 只允许出现在 `drivers` 的测试里。

### 12.6. 执行

| 规则 | 由谁执行 |
|---|---|
| 12.3 中的禁止项 | 一个带基线列表的 grep 检查（第 16 节） |
| 除 `app` 外的 crate 在每个平台上都能编译 | 在 Ubuntu 和 Windows 的原生 CI runner 上运行 `cargo check --workspace --exclude <app>`。不是从 macOS 交叉检查：带 C 代码的构建脚本需要目标平台的编译器。 |
| 契约有效 | 在每个**受支持**平台的 runner 上运行 `platform_contract.rs` |

### 12.7. 移植到新的操作系统

1. `drivers/src/platform/<system>.rs`：实现契约的每一个函数。编译器会列出缺少的部分。
2. `mod.rs`：新系统的 `cfg` 不再指向 `unsupported.rs`。
3. `platform_contract.rs` 在该系统的 runner 上通过，该 runner 加入 CI。
4. `app`：该系统的打包和签名配置，如有需要再加上 `app/src/platform.rs`。
5. 仓库的贡献者指南把该系统加入受支持平台列表。

如果移植需要修改 `core`，说明有东西泄漏了。先用一个单独的 pull request 把泄漏移到契约之后，然后再继续移植。

## 13. 错误

- **每个 crate 都有自己的错误枚举**（使用 `thiserror`）。切片可以在 `error.rs` 中有自己的错误枚举。
- **`core` 返回领域错误。** `app/error.rs` 把它们转换成供窗口使用的代码和一句话。这句话来自你的翻译表，绝不来自线上枚举的 `Display`。
- **来自线上的未知事件不是错误。** 在枚举上使用 `#[serde(other)]`，在非必需字段上使用 `Option<T>`。把未知的行记录到调试日志，然后继续。提供商命令行工具的新版本绝不能让一次运行停止。
- 在 `core`、`store` 和 `drivers` 中，除测试外**禁止 `unwrap()` 和 `panic!`**。使用带错误变体的 `?`，或者带有原因说明（解释为什么该值不可能缺失）的 `expect()`。

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

## 14. 按层测试

| 层 | 如何测试 | 什么算作证明 |
|---|---|---|
| `logic.rs`、`update.rs` | 普通的 `#[test]`，不用 tokio | 对某个值或效果列表的断言 |
| `store.rs` | 临时文件夹中的数据库 | 读取返回的那一行 |
| `service.rs` | `#[tokio::test]`，使用真实的 store 和假驱动 | 调用之后文件或数据库的状态 |
| `actor/` | 一个句柄加一段消息脚本；时间用 `tokio::time::pause` 控制 | `Snapshot` 的序列 |
| `drivers` | 真实进程或录制下来的数据流 | 进程已结束（`ESRCH` 或空 job）、线上传来的行 |
| `app/commands` | 不写单元测试；针对人看到的内容，通过入口进行端到端测试或集成测试 | 人看到的文字 |

针对展示给人看的消息的测试，应当放在人看到它的地方，而不仅仅是 `logic.rs` 里。能产生正确句子的函数，如果没有人调用它，什么也证明不了。

### 14.1. 一个集成测试二进制

直接放在 `tests/` 下的每个文件都是一个单独的二进制，每个二进制单独链接。在大型工作区中，这意味着每个文件一分钟。给每个 crate **一个**集成测试目标 `tests/it/main.rs`，每个主题一个模块，用过滤器运行单个主题：

```tree
tests/it/
  main.rs          mod recording_stops_on_time_limit; mod transcript_survives_restart; …
  recording_stops_on_time_limit.rs
  transcript_survives_restart.rs
```

```bash
cargo nextest run --test it recording_stops_on_time_limit::
```

使用 `--no-tests=fail` 运行，这样一个什么都没匹配到的过滤器会显示为红色，而不是悄悄变绿。

测试共用的辅助代码是同一目标中的一个模块，`tests/it/support/`。直接放在 `tests/` 下的辅助文件就是又一个需要链接的二进制。

### 14.2. 不用 trait 的假驱动

测试需要一个不启动真实进程的驱动。SLAT 禁止只有一个实现的 trait，而假实现不算第二个真实实现。有两种做法可以遵守这条规则。优先选择第一种：feature 会改变 `drivers` 及其之上每个 crate 的编译方式，因此启用它的测试构建和不启用它的应用构建是两套独立的构建产物（第 22.3 节）。数据接缝则完全不增加编译时间。

- **数据接缝。** 服务接收的是驱动的*输出*（一个值或一个通道），而不是驱动本身。测试把行发送到通道中。
- **测试构建。** `drivers` 暴露 `#[cfg(any(test, feature = "fake"))] pub mod fake;`，其中的函数与真实模块相同，测试 crate 启用 `fake` feature。

当出现第二个真实实现时（第二个提供商、第二个平台），才是引入 trait 的时机。

### 14.3. 差异中的变异测试

一个通过的测试，只有在面对错误代码时会失败，才证明了某些东西。这就是把第 16.2 节应用到测试上。`cargo-mutants` 会修改代码（翻转一个条件、替换一个返回值、删除一条语句），并报告每一处没有被任何测试发现的修改。在 pull request 改动的那些行上运行它，而不是在整个工作区上：

```bash
git diff origin/main...HEAD > changes.diff
cargo mutants --in-diff changes.diff --package quayside-core
```

`logic.rs` 和 `update.rs` 是这样做收益最大的地方。它们是纯的，所以测试在微秒级完成，而那里存活下来的变异就是一条没人检查的业务规则。存活的变异要用测试来修复，绝不用排除项来修复。

### 14.4. `update` 的属性测试

一个 `update` 测试检查的是一段消息脚本。属性测试则针对必须始终成立的规则，检查成千上万段随机脚本。使用 `proptest` 生成一串 `Msg` 值，并在每一步之后断言状态的不变量：

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

`messages(n)` 是测试模块中的一个策略（strategy），用来构建随机的 `Msg` 值；`Msg::generation()` 是一个小辅助函数，返回消息携带的代数。第 20.2 节中的泄漏正是这类测试能够自己找出的 bug：没有人需要事先想到引发它的消息顺序。

## 15. 规模上限

| 单元 | 警告阈值 | 怎么做 |
|---|---|---|
| 文件 | 1,500 行代码（不含测试） | 拆分为职责相同的文件夹，第 6.1 节 |
| 切片 | 15,000 行 | 拆分为子切片 |
| `core` | 60,000 行 | 把一组切片移到 `core-<group>`，第 5.3 节 |
| Tauri 命令 | 10 行 | 把逻辑移到 `service.rs` |
| `AppState` 字段 | 一个名词 | 见第 11 节 |

在采用 SLAT 当天就超过阈值的文件，列入**基线列表**。这份列表只能缩短。

## 16. 执行机制

先有机制，后有文字。能由脚本检查的规则，绝不应依赖某人记得它。

| 规则 | 由谁执行 |
|---|---|
| 只有 `app` 知道 Tauri | `Cargo.toml`（其他地方没有 `tauri` 依赖）；针对传递依赖使用 `cargo-deny`（16.5） |
| 层级只向下依赖 | `Cargo.toml` |
| 只有 `store` 打开写连接 | grep 检查：`Connection::open` 只出现在 `store` crate 中。切片的 `store.rs` 文件会使用 `rusqlite` 类型，所以仅靠依赖关系不够。 |
| `#[tauri::command]` 只在 `app/*/commands.rs` 中 | grep 检查 |
| 每个命令都已注册 | 一个比对切片中的命令与 `generate_handler!` 的检查 |
| `emit` 只在 `app/*/events.rs` 中 | grep 检查 |
| 切片之间没有深层导入 | 检查来自其他切片的 `crate::<a>::<layer>::` |
| `core` 中没有带状态的 `static` | grep 检查 `static .*(Mutex|RwLock)` |
| `logic.rs` 和 `update.rs` 没有 I/O | 检查：`logic.rs`、`logic/` 和 `update.rs` 中没有 `async`、`tokio::`、`std::fs`、`store::`、`drivers::` |
| 切片的 `mod.rs` 只包含 `mod …;` 和 `pub use …;` | 对 `core/src/` 下每个 `mod.rs` 的检查 |
| 切片之间没有循环 | 一个根据导入构建切片图并对其排序的检查 |
| Tauri 命令最多 10 行 | 对 `app/*/commands.rs` 的检查 |
| `core`、`store`、`drivers` 中除测试外没有 `unwrap()` 和 `panic!` | Clippy lint `unwrap_used` 和 `panic`（16.5） |
| 操作系统相关代码只在 `drivers/src/platform/` 和 `app/src/platform.rs` 中 | 使用 12.3 中列表的 grep 检查 |
| 除 `app` 外的 crate 在每个平台上都能编译 | 在 Ubuntu 和 Windows CI runner 上运行 `cargo check` |
| 规模上限 | 一个带基线列表的检查，列表只能缩短 |

每个检查都从一份记录当前违规的**基线列表**开始。新的违规显示为红色。被修复的违规必须在同一个 pull request 中从列表里删除，这样列表永远不会重新变长。

### 16.1. 带基线的检查

所有检查都遵循同一种形态：找出违规，减去基线，剩下任何内容就失败；如果基线中列出了已经修复的东西，也失败。

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

### 16.2. 检查必须能够失败

在信任一个检查之前，先植入一个真实的违规，看着它变红，然后再删掉。从未变红过的检查从未被测试过。

SLAT 中的 grep 检查查找的是被禁止的代码，所以注释中的匹配会让它们变红，而不是变绿。这虽然烦人，但很安全，修复办法是删掉那段死代码。读取语法树的检查（16.5）没有这个问题。危险的是要求某个字符串必须存在的检查：它在注释上也会通过。这类规则要通过运行代码来证明，而不是通过读文本。

### 16.3. CI 中的平台任务

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

在真实仓库中，请把 action 版本固定到完整的提交哈希。这个任务只做编译；在产品尚不支持的平台上不运行测试，所以成本很低。缓存步骤让它保持低成本：没有它，每个 pull request 都要在两个操作系统上从零编译所有依赖。

### 16.4. 全套检查

| 检查 | 规则 |
|---|---|
| `checks/slat-commands.sh` | `#[tauri::command]` 只在 `src-tauri/src/*/commands.rs` 中 |
| `checks/slat-registered.sh` | 切片中的每个命令都出现在 `generate_handler!` 中 |
| `checks/slat-emit.sh` | `emit` 只在 `src-tauri/src/*/events.rs` 中 |
| `checks/slat-deep-imports.sh` | 没有来自其他切片的 `crate::<slice>::<layer>::` |
| `checks/slat-static-state.sh` | `crates/*-core*` 中没有 `static … Mutex|RwLock` |
| `checks/slat-pure.sh` | `logic.rs`、`logic/` 和 `update.rs` 中没有 `async`、`tokio::`、`std::fs`、`store::`、`drivers::` |
| `checks/slat-slice-mod.sh` | 切片的 `mod.rs` 只包含 `mod …;` 和 `pub use …;` |
| `checks/slat-slice-cycles.sh` | 切片之间没有循环 |
| `checks/slat-command-size.sh` | 每个 `#[tauri::command]` 最多 10 行 |
| `checks/slat-platform.sh` | `platform/` 之外适用 12.3 中的禁止项 |
| `checks/slat-size.sh` | 基线中超过 1,500 行的文件只能缩小 |

循环检查不需要图库。`core/src/<slice>/` 中的每个 `use crate::<other>` 都是一条边，而 `tsort` 会在错误输出中报告带环的图：

```bash
#!/usr/bin/env bash
set -euo pipefail

core="crates/quayside-core/src"
edges="$(grep -roE --include='*.rs' 'crate::[a-z_]+' "$core" \
  | sed -E "s#^$core/([a-z_]+)/[^:]*:crate::([a-z_]+)#\1 \2#" \
  | awk '$1 != $2 && NF == 2' | sort -u)"

loops="$(printf '%s\n' "$edges" | tsort 2>&1 > /dev/null || true)"
if [ -n "$loops" ]; then
  printf '%s\n' "$loops"
  echo "slices import each other in a loop; move the shared part into its own slice (7.2)"
  exit 1
fi
echo "slices: $(printf '%s\n' "$edges" | sed '/^$/d' | wc -l | tr -d ' ') edges, no cycle"
```

同一份边的列表，就是第 22.4 节用来找出一次改动可能影响哪些切片的切片图。

### 16.5. 先用 lint 和禁令，再写脚本

有些规则不需要脚本，因为工作区已经在运行的工具就能执行它们。

**Clippy，按层级配置。** Clippy 首先读取 crate 自己文件夹中的 `clippy.toml`，因此每个层级可以禁止不同的东西。lint 在 `Cargo.toml` 中开启：

```toml
[workspace.lints.clippy]
unwrap_used = "deny"
panic = "deny"
```

```toml
[lints]
workspace = true
```

第一段放在工作区根目录，第二段放进 `kit`、`store`、`drivers` 和 `core`。`app` crate 不继承它们。工作区根目录中一个包含 `allow-unwrap-in-tests = true` 和 `allow-panic-in-tests = true` 的 `clippy.toml` 让测试保持可读。crate 文件夹中的 `clippy.toml` 会取代根目录中的那个，所以它要重复这两行。`core` 中的 `clippy.toml` 可以列出 `disallowed-methods` 和 `disallowed-types`，例如 `std::process::Command` 和 `std::sync::Mutex`，这样从切片中启动进程或在 Actor 内部使用锁，就会成为 lint 错误，而不是 grep 匹配。

**`cargo-deny`，针对整个依赖图。** `Cargo.toml` 能阻止 `core` 中的 `use tauri::…`，却阻止不了一个从后门把 `tauri` 拉进来的库。这种泄漏在评审中看不见，而且会让 `core` 的测试去编译应用中最重的部分。`cargo-deny` 检查整个依赖图。在 `deny.toml` 中：

```toml
[bans]
deny = [
  { crate = "tauri", wrappers = ["quayside", "tauri-plugin-shell", "tauri-plugin-dialog"] },
]
```

这样，`tauri` 只能作为 `wrappers` 中那些 crate 的直接依赖出现：`app` crate，以及它使用的 Tauri 插件（它们本身依赖 `tauri`）。给应用新增插件时，在同一个 pull request 中把它加入列表。通往 `tauri` 的任何其他路径，例如 `core` 使用的某个库，都会显示为红色。

**用语法代替文本。** 16.4 中的 grep 检查可以写成 `ast-grep` 规则。`ast-grep` 匹配的是 Rust 语法树，所以注释或字符串永远不会匹配，而拆成多行的导入（`use crate::run::{logic::plan, model::Run};`）仍然是一个导入。每个检查一个规则文件，其中的 `files` 和 `ignores` glob 取自 16.4 中的路径，以此取代 `grep -E`。基线列表（16.1）保持不变：规则产出违规列表，同一个脚本再减去基线。

## 17. 操作配方

每个配方都从一个在旧代码上失败的测试开始，而且要失败在断言上，而不是编译上。在 Rust 中，先用 `todo!()` 写出签名，这样测试能够编译，并因为正确的原因失败。

### 17.1. 新增一个读取（查询）

1. `core/<s>/model.rs`：结果类型（如果还不存在）。
2. `core/<s>/store.rs`：读取函数。在临时数据库上测试它。
3. `core/<s>/service.rs`：调用 store 和 logic 的 `pub async fn <verb>(…)`。
4. `core/<s>/mod.rs`：用 `pub use` 导出新的函数或类型。
5. `app/<s>/dto.rs`：DTO 和 `From<model>`。
6. `app/<s>/commands.rs`：一个最多 10 行的命令；注册它。
7. 前端：data-access 层调用该命令。

### 17.2. 新增一个没有后台状态的变更（命令）

同 17.1，另外把决策（是否允许、改变什么）作为纯函数写在 `logic.rs` 中，并配上测试。`service.rs` 只负责调用它并执行写入。

### 17.3. 新增一个切片

1. 命名：用 `snake_case` 的单数名词表示该功能。
2. `core/src/<s>/mod.rs` 加上它需要的文件，仅此而已；在 `core/src/lib.rs` 中加入 `pub mod <s>;`。
3. `app/src/<s>/mod.rs`、`commands.rs`、`dto.rs`；注册它的命令。
4. 如果切片有后台状态：配方 17.4。

### 17.4. 新增一个带状态的流程（Actor）

1. 检查 9.1 中的三个条件。有一个不满足：配方 17.2。
2. `msg.rs`、`state.rs`、`snapshot.rs`：类型。
3. `update.rs`：先写测试（输入消息，输出预期的效果和状态），再写实现。
4. `effect.rs`：为每个效果实现 `execute`；结果以 `Msg` 返回。
5. `run.rs` 和 `handle.rs`：循环和入口。
6. `AppState` 恰好增加一个字段：注册表或句柄。
7. `app/<s>/events.rs`：订阅 `Snapshot` 并 `emit("<s>:snapshot")`。

### 17.5. 新增一个驱动（外部世界）

1. `drivers/src/<name>.rs` 或一个文件夹。驱动不知道任何切片，也不知道数据库。
2. 只有在至少有两个实现时才写 trait。
3. 进程：进程组、逐级升级的终止、结束的证明；密钥不出现在参数和日志中。这一切都通过 `platform` 的契约（12.2）完成，绝不在驱动中直接使用系统调用。
4. 切片从 `service.rs` 或 `effect.rs` 中使用驱动。

### 17.6. 新增一个发往窗口的事件

1. `core` 中的变化在通道上发布一个 `Snapshot` 或 `Event`。
2. `app/<s>/events.rs` 订阅并发出 `<s>:<event>`。
3. 前端：data-access 层监听并更新它的 store。

### 17.7. 新增一个平台

见第 12.7 节。

### 17.8. 这个该放在哪里？（决策树）

```
它是否调用 Tauri、窗口、MCP 或远程中心？    → app (commands, events, doors)
它是否依赖操作系统？                        → drivers/src/platform/ (第 12 节)
它是否与进程、网络或钥匙串打交道？          → drivers (通过平台契约)
它是数据库读写还是 schema？                 → store (连接) / core/<s>/store.rs (查询)
它是纯粹的决策或计算吗？                    → core/<s>/logic.rs (Actor 中则为 update.rs)
它是领域类型吗？                            → core/<s>/model.rs
它是带 I/O 的一系列步骤吗？                 → core/<s>/service.rs
它是在后台存活、由窗口观察的状态吗？        → core/<s>/actor/
它完全没有领域（时间、路径、ID、文件）吗？  → kit
```

## 18. 与编码智能体协作

SLAT 是在一个大量代码由编码智能体编写的团队中设计出来的。当布局被写下来、足够简短、并由机器检查时，智能体会可靠地遵循它。有三点起决定作用。

1. **固定的布局就是一张免费的地图。** 被要求“给转写记录加一个过滤器”的智能体会直接打开 `core/transcript/` 和 `app/transcript/`，无需搜索。智能体花在搜索上的时间，就是它犯错的时间。
2. **检查胜过提示词里的一句话。** 提示词里的“不要从 core 发出事件”多数时候会被遵守。红色的检查每次都会被遵守。先把规则写成检查，只有在无法检查时才写成提示词中的一行。
3. **配方就是提示词。** 第 17 节有意写成编号步骤：把配方粘贴到任务中，智能体就会按预期的顺序在预期的位置生成文件。

智能体也改变了工作区的构建方式。多个智能体在多个工作副本中工作，就是同时对相同的依赖进行多次冷构建，这正是第 19.2 节说的笔记本电脑卡死。第 22.5 节说明每个工作副本如何在不与其他副本共享 `target/` 文件夹的情况下热启动，第 22.4 节说明每个智能体如何只运行它的改动可能影响到的测试。

一段可以复制到你仓库贡献者指南（`AGENTS.md`、`CLAUDE.md` 或类似文件）中的内容：

```markdown
## Backend layout: SLAT 1.2

The backend follows SLAT (Slice · Layer · Actor · Tier), version 1.2.
Reference: https://monoone.dev/blog/slat/

- Tiers: app → core → store/drivers → kit. Only `app` depends on tauri.
- A feature is one slice: `crates/<product>-core/src/<slice>/` and `src-tauri/src/<slice>/`.
- Files in a slice: mod.rs, model.rs, logic.rs, store.rs, service.rs, actor/ (only if needed).
- A Tauri command has at most 10 lines and calls one function of its slice.
- Background state belongs to an actor: Msg → update (pure) → Effect.
- Operating-system code only in `drivers/src/platform/`.
- Before adding code, find its place with the decision tree (SLAT section 17.8,
  https://monoone.dev/blog/slat/recipes/).
- Checks in `checks/slat-*.sh` enforce this. Do not edit a check to make it pass;
  report it instead.
- Before pushing, run the tests the change affects (SLAT section 22.4), then the checks.
- Every working copy has its own `target/`. Never point two copies at one
  folder (SLAT section 22.5).
```

## 19. 迁移现有代码库

你不需要重写。SLAT 通过一系列小的 pull request 来采用，整个过程中应用始终可用，而且顺序安排得不会阻塞其他分支。

:::diagram migration

### 19.1. 顺序

1. **测量。** 摸清各个模块：每个模块的行数、向上指的导入、使用 `tauri::` 的文件、`#[tauri::command]` 的数量、带状态的 `static`、应用状态的字段、针对操作系统的 `#[cfg]`。把这些写进仓库中的一份计划。这些数字就是你的基线。
2. **反转向上的依赖。** 位于命令层却被较低层调用的策略，下移到 `core/<policy>/`。领域从入口层借用的类型（行通道、图像类型、消息字符串）移到它们所属的切片。旧路径以 `pub use` 的形式保留，直到迁移结束。
3. **拆分 `app` 和 `core`。** 创建工作区和一个不含 `tauri` 的 `core` crate。知道 Tauri 的代码留在 `app`；其余一切用 `git mv` 移走。这是最机械的一步。
4. **拆出 `store`、`drivers` 和 `kit`。** 仅在它们的代码已经干净时进行。拆分 `drivers` 时，把操作系统相关代码移入 `platform/`，并为平台检查建立基线。
5. **逐个切片推进。** 每个 pull request 一个切片：命令移入 `app/<s>/`，逻辑按固定布局移入 `core/<s>/`。从最小、共享最少的切片开始。
6. **`kit::Jobs`。** 取消映射离开应用状态。
7. **Actor。** 应用状态和 `static` 变量中的状态移入 Actor，每个 pull request 一个流程，并先针对当前行为编写 `update` 测试。
8. **检查。** 每一步都为其对应的规则开启检查，并附上基线。

### 19.2. 迁移规则

- **移动不改变行为。** 移动代码的 pull request 不修复逻辑，修复逻辑的 pull request 不移动代码。出问题时，你知道是哪一类改动造成的。
- **旧路径上的门面（facade）。** 在旧模块路径放一行 `pub use new::place::*;`，让你不允许改动（或暂时不想改动）的代码以及现有测试无需修改就能编译。当没有任何代码再导入它时，就删除门面。
- **同一时间只跑一个重型构建。** 对大型工作区并行运行多个 `cargo` 构建可能让笔记本电脑卡死。按单线顺序迁移。
- **每一步之后运行完整测试套件**，而不是每次提交之后。测试套件就是行为没有变化的证明。

### 19.3. 先调整布局，更快起步

如果可查找性是你最大的痛点，可以调整工作顺序：先在现有的单个 crate 内把**文件**移入切片文件夹，不改动文件内容，并在旧路径上保留门面。Git 会把这些记录为重命名，因此其他未合并的分支仍能干净地合并。你会在一两天内得到这张地图（每个功能所在的文件夹），而 crate 拆分、切片内部的层和 Actor 可以之后在已经清晰可读的布局之上逐步完成。

即使这样，也有两件事不是零成本的。使用 `super::` 或 `pub(super)` 的文件在移动后父模块会改变，所以有少量路径需要做小的机械修改。另外，把命令从中央文件中移出会修改那个文件，与正在编辑它的分支产生冲突，所以最好作为单独的第二步来做。

### 19.4. 常见问题

| 问题 | 怎么做 |
|---|---|
| 数百个测试导入旧路径 | 在旧路径上放门面。不要在同一批 pull request 中移动测试。 |
| 并行分支与 `git mv` 冲突 | 在未合并分支最少的时候拆分 crate。每次移动都是独立的 pull request。 |
| 拆分后另一个 crate 需要使用 `pub(crate)` 项 | 把它们放宽为 `pub`。迁移完成后，再检查哪些可以改回 `pub(crate)`。 |
| 编译时间随 crate 数量增加 | 最多六到八个 crate。同一时间只跑一个重型构建。每次拆分前后用 `cargo build --timings` 测量（22.6）。 |
| 重构悄悄改变了行为 | 先针对当前行为写 `update` 测试。移动和修复放在不同的 pull request 中。 |
| 有一部分代码完全不能改（关键功能、冻结区域） | 它留在原处，只通过门面接入新布局。门面是纯新增的代码。 |

## 20. 案例研究：Quayside

Quayside 是一个为本文**虚构**的桌面应用。它大致以我们所开发的那类软件为原型，但下文中的每个名称、数字和文件都是编造的。Quayside 可以录制通话，在设备上进行转写，用本地或云端模型撰写摘要，用编码智能体执行后续任务，把待办事项同步到团队共享看板，还有一个手机伴侣应用，可以观看录音过程并向其中发送备注。

它由一个赶工的小团队开发了两年，而且能用。它同时也是第 1 节所描述的一切问题的教科书式样本。

### 20.1. 之前

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

迁移第 1 步的测量结果：

| 项目 | 数值 |
|---|---|
| Rust 代码行数（不含测试） | 约 78,000 |
| 使用 `tauri::` 的文件 | 112 个中的 37 个 |
| `#[tauri::command]` 函数 | 148 个，分布在 4 个文件中 |
| `AppState` 的字段 | 41 个，其中 14 个是 `Mutex<…>` 或原子类型 |
| 带状态的 `static` | 12 |
| 打开 SQLite 写连接的位置 | 9 |
| 含 `#[cfg(target_os = …)]` 的文件 | 23 |
| `start_recording_*` 的变体 | 7 |
| 运行领域测试的时间 | 需要窗口，所以没人运行 |

### 20.2. 代码中的症状

应用状态（节选）：

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

一个在两次录音之间泄漏的停止操作。用户按下停止，然后迅速开始新的录音。旧录音的循环还没来得及读取标志；新录音没有重置任何东西；下一次检查 `recording_cancel` 时，停止的是**新**录音：

```rust
static RECORDING_CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn stop_recording() {
    RECORDING_CANCEL.store(true, Ordering::SeqCst);
}
```

领域直接与窗口对话，所以没有窗口就无法测试：

```rust
pub async fn transcribe(app: AppHandle, file: PathBuf) -> Result<(), String> {
    let mut words = whisper::stream(&file)?;
    while let Some(word) = words.next().await {
        app.emit("transcript-word", &word).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

变体不断增多：

```rust
pub async fn start_recording(…)
pub async fn start_recording_with_limit(…)
pub async fn start_recording_with_limit_and_device(…)
pub async fn start_recording_for_meeting(…)
pub async fn start_recording_for_meeting_with_limit(…)
pub async fn start_recording_from_companion(…)
pub async fn start_recording_with_test_hook(…)
```

而操作系统相关代码无处不在：

```rust
#[cfg(target_os = "macos")]
fn reveal(path: &Path) {
    let _ = Command::new("sh").arg("-c").arg(format!("open -R '{}'", path.display())).spawn();
}
```

最后这段代码同时也是一个 shell 注入漏洞，只等一个带引号的文件名出现。

### 20.3. 迁移，一步一步

**第 2 步：反转依赖。** 转写器不再接收 `AppHandle`。它把单词写入一个由 `core` 拥有的有界通道；`app` 把通道中的内容泵入窗口。上传代码不再读取 `AppState`，而是以参数形式接收它需要的两个值。

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

**第 3 步：拆分 `app` 和 `core`。** 建立一个工作区，包含 `quayside-core`（不含 `tauri`），并把现有的 `src-tauri` 作为 `app`。app 中的 `lib.rs` 保留 `pub use quayside_core::{…};`，让每个旧路径仍能编译。证明：在 `core` 中植入 `use tauri::Manager;` 会编译失败。

**第 4 步：`kit`、`store`、`drivers`。** 九处 SQLite 打开操作合并为 `quayside-store` 中的一个写入器。录音器、转写器、模型客户端和 `git` 移入 `quayside-drivers`。23 个含 `#[cfg]` 的文件变成一个 `platform/` 文件夹，包含 `unix.rs`、`macos.rs` 和 `unsupported.rs`，而 `reveal` 变成一个契约：

```rust
pub fn reveal_path(path: &Path) -> Result<(), PlatformError> {
    let status = Command::new("/usr/bin/open").arg("-R").arg(path).status()?;
    status.success().then_some(()).ok_or(PlatformError::Refused("open -R"))
}
```

没有 shell，没有引号转义，没有注入。

**第 5 步：切片。** 把 `handlers.rs` 和 `utils.rs` 拆分为切片，从最小的开始：

```
settings → device → llm → summary → transcript → board → companion → agent → recording
```

**第 6 步：`kit::Jobs`。** `transcribing` 和 `summarizing`（两个存放取消令牌的映射）分别变为转写服务中的一个 `Jobs<TranscriptId>` 和摘要服务中的一个 `Jobs<SummaryId>`。

**第 7 步：Actor。** 有三部分状态通过了 9.1 中的测试：录音、智能体运行和看板同步。录音最先迁移，并针对当前行为编写 `update` 测试。`AtomicBool` 消失了；停止操作现在携带它所针对的那次录音的代数，20.2 中的泄漏变成了一个一行的测试，并且永远保持通过。七个 `start_recording_*` 函数合并为一个：

```rust
pub struct StartRecording {
    pub title: String,
    pub device: Option<DeviceId>,
    pub meeting: Option<MeetingId>,
    pub limit: Option<Duration>,
    pub origin: Origin,
}
```

**第 8 步：检查。** 第 16 节中的每个检查都带着各自的基线开启。大多数基线已经是空的，因为上面的步骤已经消除了这些违规。

### 20.4. 之后

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

迁移之后的一个命令：

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

重复同样的测量：

| 项目 | 之前 | 之后 |
|---|---|---|
| 使用 `tauri::` 的文件 | 37 | 12，全部在 `src-tauri` 中 |
| 最长的命令 | 140 行 | 9 行 |
| `AppState` 的字段 | 41 | 9 |
| 带状态的 `static` | 12 | 0 |
| SQLite 写连接 | 9 处 | 1 |
| 含操作系统 `#[cfg]` 的文件 | 23 | 3，全部在 `platform/` 中 |
| `start_recording_*` 的变体 | 7 | 1 |
| 领域测试 | 需要窗口 | 几秒内运行完成，无需窗口 |
| 可在 Linux 和 Windows 上编译（`app` 除外） | 否 | 是，在 CI 中检查 |

这些数字仅作示意。重要的是变化的方向：每一行都朝着一个所有者、一个位置、一条规则的方向移动。

## 21. 采用清单与常见问题

### 21.1. 新项目清单

- 包含两个 crate 的工作区：`<product>-core`（不含 `tauri`）和 `app` crate。
- 从第一天起使用 `kit::paths`；不硬编码主目录或临时路径。
- 一旦出现第一个系统调用，就建立 `drivers/src/platform/`，包含 `mod.rs`、`unix.rs`、你所用平台的文件和 `unsupported.rs`。
- 每个功能都是一个带固定文件的切片；命令最多 10 行。
- 事件只从 `app/<slice>/events.rs` 发出。
- 一个集成测试目标：`tests/it/`。
- 从第一周起就在 CI 中运行第 16 节的检查，那时基线还是空的。
- 第 22 节中的构建设置：调试信息配合 `strip = false`、链接器、一套 feature、`.taurignore`、CI 中只从 `main` 写入的编译缓存。
- 重型原生库放在 `core` 不依赖的驱动 crate 中（5.3）。
- 在贡献者指南中加入第 18 节的 SLAT 段落。

### 21.2. 现有项目清单

- 把测量表作为计划提交（19.1，第 1 步）。
- 为每个将要开启的检查建立基线列表。
- 决定哪些部分不能改动，并为它们准备门面。
- 把第 2 到第 8 步安排为独立的 pull request，crate 拆分安排在未合并分支较少的时候。

### 21.3. 问答

**SLAT 只适用于 Tauri 吗？**
不是。把“Tauri 命令”换成你的入口（HTTP 处理函数、CLI 子命令、消息消费者），其余保持不变。`app` 层级就是“唯一知道入口框架的 crate”。

**为什么不用处处设端口的六边形架构？**
当存在两个实现时，以 trait 形式定义端口才划算。桌面应用中的大多数驱动只有一个实现。SLAT 在出现第二个实现之前一直使用具体类型，可测试性则来自纯的 `logic`/`update` 函数和数据接缝。

**对小应用来说，五个层级是不是太多了？**
从两个开始（`core` 和 `app`）。当其他层级的代码已经存在且干净时，再把它们加进来。

**所有切片都需要全部文件吗？**
不需要。不需要的文件就不存在。小切片可以只是一个 `mod.rs`。

**什么时候该用 Actor 而不是服务？**
当 9.1 中的三个条件全部成立时。如果不确定，那就是服务。以后把服务改成 Actor，也只是一个切片内部的局部改动。

**如果两个切片互相需要怎么办？**
共享部分成为独立的切片，两者都依赖它。任何情况下都不允许循环依赖。

**为什么命令上限是 10 行？**
因为只做转换的命令不需要自己的单元测试。十行足以完成反序列化、调用和映射，却不足以藏下一个决策。

**SLAT 会拖慢编译吗？**
拆分为多个 crate 通常会加快增量构建，因为修改一个切片不会重建 `kit`、`store` 或 `drivers`。由于要链接更多的测试二进制，干净构建可能会稍慢一些，这也是 SLAT 限制 crate 数量的原因。第 22 节列出了比 crate 数量更重要的设置。

**我们只在 macOS 上发布。现在就做第 12 节值得吗？**
值得，做其中成本低的部分：`kit::paths`、为你已有的少数系统调用定义契约、`unsupported.rs`，以及在 Linux 和 Windows 上的编译任务。这现在只需要几天，却能省去日后搜遍整个代码库的工作。`linux.rs` 和 `windows.rs` 文件本身，等你决定移植时再写。

**编码智能体如何应对 SLAT？**
应对得很好，因为布局是固定的，重要的规则是检查而不是建议。见第 18 节。

## 22. 构建和测试时间

*1.2 版新增。*

SLAT 中最大的节省来自第 5 节：只有 `app` 知道 Tauri，因此其他每个 crate 的测试都从不编译 Tauri 及其背后的 web view。第二大的节省来自 5.3：重型原生库放在一个 `core` 不依赖的驱动 crate 中，因此 `core` 的测试也从不编译它。其余的时间花在少数几项设置和习惯上，每项只需一两行配置。本节按它们通常能节省的时间排序列出，最后说明哪些情况会让构建在不该重来时从头开始。

先测量。`cargo build --timings` 会生成一份 HTML 报告，列出每个 crate 的编译时间，以及有多少个 crate 在并行编译。保留改动之前的报告，用来对比。

### 22.1. 时间花在哪里

- **库 crate 只编译，不链接。** 被链接的是每个二进制，在测试运行中则是每个测试二进制。
- **每个 crate 可以有三类测试二进制：** 它的单元测试、直接位于 `tests/` 下的每个文件（第 14.1 节把它减为一个，`tests/it`），以及它的文档示例。从 edition 2024 起，一个 crate 的文档示例会构建为一个二进制。没有文档示例的 crate 在 `[lib]` 下设置 `doctest = false`。
- **`app` 以下的测试运行从不需要 Tauri。** 日常命令是 `cargo nextest run --workspace --exclude quayside`。只有第 14 节的端到端测试才会构建 `app` crate。
- **重型原生库比 Tauri 代价更高。** 由构建脚本编译的 C 和 C++ 源码，以及机器学习 crate，占去一次干净构建的大部分时间，也占去每个包含它们的二进制的大部分链接时间。第 5.3 节让它们远离 `core` 的测试。
- **调试信息占链接时间的很大一部分。** 其中大部分从来没人读。

### 22.2. 构建设置

在工作区根目录的 `Cargo.toml` 中：

```toml
[profile.dev]
debug = "line-tables-only"
split-debuginfo = "unpacked"

[profile.dev.package."*"]
debug = false
strip = false
```

你自己的 crate 在回溯中保留文件名和行号；依赖不带调试信息。需要调试器时，在一次会话中把它改回 `debug = true`。

在 macOS 上，`strip = false` 不是可选项。设置 `debug = false` 时，Cargo 默认也会对这些单元执行 strip，而在 macOS 27 上，系统的 `strip` 会损坏过程宏的动态库：`serde_derive` 无法再被加载，干净构建随之失败。`split-debuginfo = "unpacked"` 被显式写出来，这样在 macOS 上每次链接之后是否运行 `dsymutil`，就不取决于某个 Cargo 版本的默认值。

链接器对测试二进制最重要。在 x86-64 的 Linux 上，Rust 从 1.90 版起默认使用 `rust-lld`。其他 Linux 目标可以使用 `mold`。在 macOS 上，Xcode 15 及更高版本自带的链接器已经很快，保持不动即可。在 Windows 上，`rust-lld` 通常比默认链接器快得多。在 `.cargo/config.toml` 中：

```toml
[target.aarch64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]

[target.x86_64-pc-windows-msvc]
linker = "rust-lld.exe"
```

**优化测试花时间最多的那些依赖。** 开发构建在编译每个依赖时都不做优化，包括由 C 源码构建的加密数据库，以及测试会调用数百万次的加密算法或哈希函数。只优化这些包，测试会变快，而发布构建保持不变。在我们的一个工作区中，这让一次测试运行从 170 秒降到 102 秒：

```toml
[profile.dev.package.libsqlite3-sys]
opt-level = 3

[profile.dev.package.sha2]
opt-level = 3
```

每一行都要让该包重新构建一次。在改动前后测量测试运行时间，只保留确实带来变化的包。

删除没人使用的依赖：`cargo machete` 会列出它们，每一个都是白白花掉的编译时间。

### 22.3. 一套 feature

对于被请求的每一组不同的 feature，Cargo 都会把依赖构建一次。SLAT 工作区中有两种东西会请求不同的组合：

1. **不同的命令。** `cargo test --workspace` 会合并所有成员的 feature，`cargo test -p quayside-core` 只合并 `core` 需要的那些。两者都运行，就会把 `tokio`、`serde` 和其余依赖编译两次。`cargo-hakari` 解决这个问题：它维护一个生成出来的 `workspace-hack` crate，每个成员都依赖它，其中包含所有 feature 的并集，这样每个命令都以相同的方式构建依赖。`cargo hakari generate` 更新它，CI 中的 `cargo hakari verify` 会在有人忘记更新时失败。
2. **你自己 crate 的测试 feature。** 14.2 中的 `fake` feature 和第 10 节的 `test-hooks` 会改变 `drivers` 和 `core`，因此 feature 切换时，它们之上的每个 crate 都要重新编译。优先使用数据接缝（14.2），它不需要 feature。确实需要 feature 时，每个测试命令都以同样的方式启用它。把这个命令放在一个地方，即 `.cargo/config.toml` 中：

```toml
[alias]
t = "nextest run --workspace --exclude quayside --features quayside-drivers/fake --no-tests=fail"
```

所有人，包括智能体和 CI，都运行 `cargo t` 来跑整个测试套件，每个范围更窄的测试命令都是在 `cargo t` 后面加一个过滤器（22.4）。包列表或 feature 列表不同的测试命令就是第二次构建。

### 22.4. 只运行改动可能影响到的测试

固定的布局说明一个文件属于哪个切片，而循环检查（16.4）中的切片图说明哪些切片依赖它。两者结合，就为每类改动给出了各自的一组测试：

| 改动了什么 | 运行什么 |
|---|---|
| 一个切片内的 `logic.rs`、`model.rs`、`store.rs`、`service.rs` 或 `actor/`，其 `mod.rs` 未变 | 该切片的测试，以及 `cargo mutants --in-diff`（14.3） |
| 切片的 `mod.rs`，即它的公共 API | 该切片以及导入它的每个切片 |
| `tests/it` 的一个模块 | 该模块 |
| `kit`、`store` 或 `drivers` | 依赖它的每个 crate：`cargo t -E 'rdeps(quayside-store)'` |
| `drivers/src/platform/` | 另外运行契约测试（12.5）；在 CI 中运行平台任务（16.3） |
| 只有 `app` | 通过入口的端到端测试；`core` 中没有任何改动 |
| `Cargo.toml`、`Cargo.lock`、`.cargo/`、工具链文件 | 全部 |

过滤器选择的是**运行**哪些测试，而不是**编译**什么：nextest 先构建 Cargo 选项指定的每个包，然后才应用 `-E`。正因如此，每一行都保留 `cargo t` 的包和 feature，只用 `-E` 缩小范围。构建仍然是 `target/` 中已有的那一次，只有运行变短了。用 `-p` 缩小构建范围，只有在 `cargo-hakari`（22.3）让 feature 保持一致时才能节省编译时间；没有它，`-p` 就是对依赖的第二次构建。

切片的测试很容易选出来，因为它们的名字以切片名开头：单元测试位于 `core/src/<slice>/`，所以名字以 `<slice>::` 开头，而 `tests/it` 的模块也以切片名开头（`recording_stops_on_time_limit`）。第一版的选择逻辑用一个短脚本就能写完。它把工作副本与分支离开 `main` 的那个点进行比较，因此尚未提交的改动也会计入，这正是智能体的循环所需要的：

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

它有意保守：任何 `mod.rs` 的改动、`core/src/` 顶层某个文件的改动，或共享测试辅助代码的改动，都会运行整个 `core`，而不是沿着切片图选择。当 `core` 的测试套件变慢时，再把这一步换成切片图。

选择是为了速度，不是为了证明。使用三个级别：

| 在哪里 | 运行什么 |
|---|---|
| 在你的机器上和智能体的循环中 | 上面的选择 |
| 在 pull request 的 CI 中 | 依赖于被改动 crate 的每个 crate（`rdeps`） |
| 在 `main` 上，或在合并队列中 | 整个测试套件 |

`--no-tests=fail`（14.1）在每个级别都保持开启，这样一个什么都没匹配到的选择会显示为红色，而不是悄悄变绿。

### 22.5. 多个工作副本

编码智能体经常并行工作，每个都在自己的工作副本中。不加注意的话，四个智能体会在同一时刻把相同的依赖编译四次。

**每个工作副本都有自己的 `target/`。** 不要让多个副本指向同一个文件夹，无论是通过符号链接还是 `CARGO_TARGET_DIR`。它看起来像共享缓存，实际上是一个正确性缺陷。同一工作区的两个副本会产生相同的产物名称和相同的指纹条目，因此在 `build A; build B; build A` 之后，Cargo 可能把副本 A 报告为 `Fresh`，而磁盘上的库却是用 B 的源码构建的。这时检查评判的是别人的代码，却报告为绿色。此外，不同的分支在每次切换时都会重新构建彼此的 crate。

**用克隆而不是共享，让新副本热启动。** 创建工作副本时，用写时复制克隆拷贝主副本的 `target/`：在 macOS（APFS）上用 `cp -c -R`，在 Btrfs 或 XFS 上用 `cp --reflink=auto -R`。这只需几秒，在文件被修改之前不占用磁盘空间。依赖保持最新，Cargo 只重新构建你自己的 crate，因为它们的源码比克隆所记录的更新。在新副本中测量一次首次构建的时间；它应当接近增量构建，而不是干净构建。

**`sccache` 是补充，而不是答案。** 把它设为编译器包装器，写在用户的 `~/.cargo/config.toml` 中或环境变量里（`RUSTC_WRAPPER=sccache`），它的本地缓存就由这台机器上的每个工作副本共享。它缓存普通库依赖的编译。它不缓存过程宏、二进制、`cdylib` crate 或你自己的 crate（它们由 Cargo 增量编译），也不缓存链接。链接测试二进制是每个工作副本付出最多的部分，只有 14.1、22.2 和上面的克隆能减少它。

用 `CARGO_BUILD_JOBS` 限制一次构建能占用多少机器资源，例如一半的核心，这样第二个构建只会变慢，而不会让机器卡死。第 19.2 节的规则仍然成立：同一时间只跑一个重型构建。

### 22.6. CI

- **每个 Rust 任务都有缓存**，包括 16.3 中的平台任务。`Swatinem/rust-cache` 在多次运行之间保留依赖和 target 文件夹，以 `Cargo.lock` 和工具链为键。
- **只从 `main` 写入缓存，在所有地方读取。** pull request 的运行只能读取它自己 ref 的缓存和默认分支的缓存，别的都读不到，因此一个 pull request 写入的缓存只对该 pull request 有帮助，而所有其他 pull request 都会查找的默认分支却始终是空的。设置 `save-if: ${{ github.ref == 'refs/heads/main' }}`，并让工作流也在推送到 `main` 时运行（`push`），这样每次合并都会刷新缓存，每个 pull request 的第一次运行都能热启动。在我们的一个仓库中，这让第一次运行从 942 秒降到 478 秒。
- **在 CI 中设置 `CARGO_INCREMENTAL=0`。** 增量数据很大，在全新的运行中毫无用处。`Swatinem/rust-cache` 会替你设置它；使用其他缓存时，请自己设置。
- **在 Linux 上运行 `app` 以下的测试。** 如果 macOS 专用代码只存在于 `drivers/src/platform/` 和 5.3 中的原生驱动 crate 中，那么 `kit`、`store` 和 `core` 的测试就不需要 macOS。在启动更快、费用更低的 Linux runner 上运行它们，把 macOS runner 留给 `drivers`、`app` 和契约测试。
- **构建一次，并行测试**，当测试套件需要超过几分钟时：`cargo nextest archive` 在一个任务中构建测试二进制，多个任务用 `--partition hash:1/3`、`2/3`、`3/3` 各自运行其中一部分。
- **`main` 上的时间报告。** 把 `cargo build --timings` 作为 `main` 每次构建的产物。如果在只改动一个切片后，`core` 的条形图不断变长，这就是第 5.3 节在拆分前要求的测量。
- **`cargo hakari verify`** 和 **`cargo deny check`** 与第 16 节的检查放在一起。两者都只需几秒。

### 22.7. 什么会让构建从头开始

一次没有明显原因就从头开始的构建，几乎总是出于以下原因之一：

- **没有 `rerun-if-changed` 的构建脚本。** 一个不输出任何 `cargo:rerun-if-changed` 的 `build.rs`，会在其所在包的任何文件改动后再次运行，所有使用其输出的东西都要重新编译。每个输入输出一行。编译辅助程序（Swift、C）的脚本要列出它们的源码。绝不要列出不存在的路径：Cargo 会在每次构建时都把它视为已改动。
- **`tauri dev` 监视它自己的输出。** 开发服务器会在 `src-tauri/` 中的文件改动时重新构建应用。应用写到那里的数据库、日志或生成文件，会让构建陷入循环。运行时数据应放在 `kit::paths` 之下（12.4）；生成的文件写进 `.taurignore`。
- **编辑器和终端共用一个文件夹。** rust-analyzer 用自己的设置运行 `cargo check`。在同一个 `target/` 中，编辑器与终端或智能体会互相等待对方的锁，还可能让彼此的工作失效。给编辑器一个单独的文件夹：`"rust-analyzer.cargo.targetDir": true`。
- **不同的环境。** `RUSTFLAGS` 以及构建脚本读取的变量（`MACOSX_DEPLOYMENT_TARGET`、`CC`、`CFLAGS`）都属于 Cargo 比较的内容。如果终端、编辑器和智能体的 shell 对它们的设置不同，每次在它们之间切换都会重新构建。把它们写进 `.cargo/config.toml`（`[env]`、`[build] rustflags`），而不是 shell 配置文件。
- **不固定的工具链。** 新的编译器会重新构建一切。在 `rust-toolchain.toml` 中固定完整的版本号，三段式（`1.98.1`）：两段式的通道会在仓库没有任何改动的情况下拾取每一个新的补丁版本。

### 22.8. 清理 `target/`

Cargo 从不删除旧的产物。每个分支、每组 feature 和每个依赖版本都会留下文件，当 `target/` 中有几十万个文件时，每条 Cargo 命令都会变慢。在我们的一个工作区中，`cargo clean` 删除了大约 960,000 个文件（119 GiB）。库及其测试的完整构建从 7–8 分钟降到 36 秒，`cargo clippy --all-targets` 从几分钟降到 8 秒。

把它当作规则，而不是救急手段：当 `target/debug/deps` 超过几万个文件，或 `target/` 超过几十 GB 时，运行 `cargo clean`，接受一次冷构建。`cargo sweep --time 30` 是更温和的选择：它只删除 30 天内没有用过的产物。被删除的工作副本会连同它的 `target/` 一起消失。

## 23. 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| 1.2 | 2026年10月25日 | 第 22 节 *构建和测试时间*：编译时间花在哪里、构建设置（包括 `strip = false` 和经过优化的测试依赖）、一套 feature、运行改动可能影响到的测试、每个工作副本一个独立的 `target/` 并从写时复制克隆启动、只从 `main` 写入缓存的 CI、什么会让构建从头开始，以及清理 `target/`。重型原生驱动放在 `core` 不依赖的 crate 中（5.3）。新增小节 14.3（差异中的变异测试）、14.4（`update` 的属性测试）和 16.5（Clippy、`cargo-deny`、`ast-grep`）。为此前没有检查的规则加上检查：`logic.rs` 的纯度、切片的 `mod.rs`、切片之间的循环、10 行命令、`unwrap()` 和 `panic!`。优先使用数据接缝，而不是 `fake` feature。更正了 crate 的成本（5.2、5.3）、edition 2024 使用 `resolver = "3"`（5.1）、平台任务中的缓存步骤（16.3）。版本历史从第 22 节移到第 23 节；第 1 到 21 节保持原有编号。 |
| 1.1 | 2026年10月25日 | 第 12 节 *平台*：`drivers` 中的 `platform/` 文件夹、平台契约、`platform/` 之外的禁止项、路径、文件和文本规则、平台测试、Linux 和 Windows 上的 CI 编译任务、移植配方。补充了层级、执行机制、配方和决策树的内容。 |
| 1.0 | 2026年10月24日 | 第一版：层级、带固定层的切片、导入规则、数据流、Actor、作为组合根的应用状态、错误、测试、规模上限、执行机制、配方和迁移。 |

SLAT 像库一样进行版本管理。新规则如果附带基线列表，就提升次版本号：现有代码保持合规，只有新的违规会变红。1.1 正是这样加入平台规则的。让合规代码变得不合规、且没有基线可以吸收的修改，例如重命名切片的文件或反转依赖方向，会提升主版本号。不改变任何规则的更正保持版本号不变。每个遵循 SLAT 的仓库都要在贡献者指南中写明它所遵循的版本。
