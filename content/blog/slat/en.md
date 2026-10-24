SLAT is a pattern for laying out the backend of a desktop application written in Rust, with Tauri as the window layer. It answers three questions that every growing codebase eventually gets wrong: **where does this file go**, **who may import whom**, and **how does data move** between the window, the domain and the outside world.

The name lists its four building blocks: **S**lice, **L**ayer, **A**ctor, **T**ier. Every rule in this document is about one of them.

This page is the complete reference. It is written so that a team that has never seen SLAT can adopt it in a new project or migrate an existing one, without asking us anything. It includes the rules, the reasons behind them, code you can copy, the checks that enforce them, and a worked example of a messy application brought into shape step by step.

> **Version 1.1** · 25 October 2026. Version 1.1 adds section 12, *Platforms*: how to keep code that depends on the operating system in one place, so that a later Linux or Windows port is work in a single folder. The full history is in section 22.

## 1. Why SLAT exists

A Tauri application starts small. There is a `main.rs`, a few `#[tauri::command]` functions, maybe a `state.rs`. Six months later the same project usually looks like this:

- one or two enormous files hold "the commands", and the commands hold all of the business logic;
- the application state is a struct with thirty fields, half of them `Mutex<Option<…>>` and `AtomicBool`;
- a few `static` variables keep more state that nobody owns;
- the domain logic calls `app.emit(…)` directly, so nothing can be tested without a window;
- functions multiply into variants: `start_with_budget`, `start_with_budget_and_slots`, `start_with_hook`;
- `#[cfg(target_os = "macos")]` is scattered across the codebase;
- a new developer, or a coding agent, needs a day to find where a feature lives.

None of this is caused by bad people. It is caused by the absence of a shared answer to "where does this go?". When there is no answer, the nearest file wins, and the nearest file is always the biggest one.

SLAT gives that answer once, for every kind of code, and makes the important parts of it **mechanical**: the compiler and a handful of small scripts refuse code that breaks the layout, so the layout survives deadlines, new team members and coding agents.

SLAT is to a Rust backend what Nx with NgRx is to a front-end: a set of rules that is independent of any one application. We use it in every MonoOne product with a Rust and Tauri backend, including RigOne and IndexOne.

### 1.1. Goals

1. **Findability.** A person or an agent who knows the name of a feature knows the folder it lives in, on both sides of the application.
2. **Testability without a window.** Everything except the thin entry layer compiles and runs its tests without Tauri, without a display and without real processes.
3. **Boundaries the compiler enforces.** Dependency direction is written in `Cargo.toml`, not in a wiki.
4. **One owner for long-lived state.** Background work (a run, a recording, a conversation) has exactly one owner, and its rules are a pure function.
5. **Cheap growth.** A new feature is a new folder with a fixed set of files, not edits to five shared files.
6. **Portability by construction.** Code that depends on the operating system lives in one folder, so a new platform is a new file, not a search through the whole repository.

### 1.2. Non-goals

- SLAT does not prescribe your front-end. It only fixes the contract at the boundary: commands, data transfer objects (DTOs) and events.
- SLAT is not a framework. There is no crate to depend on. It is a layout, a set of rules and a few scripts.
- SLAT does not replace your repository's own rules. When a project rule and SLAT disagree, **the project rule wins**. SLAT says where things live; the project says what is forbidden.

### 1.3. Who should use it

SLAT is designed for Rust desktop applications with Tauri, from about 10,000 lines of backend code upward. The ideas carry over to any Rust application with a thin entry layer (a CLI, a daemon, a server): replace "Tauri command" with "HTTP handler" or "CLI subcommand" and everything else holds.

## 2. SLAT on one page

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

Six sentences to remember:

1. **Only the `app` crate knows Tauri.** Everything else compiles and is tested without a window.
2. **A feature lives in one slice, and a slice has fixed files.** Looking for chat? It is in `core/chat/` and `app/chat/`.
3. **A Tauri command has at most 10 lines**: deserialize, call one function of the slice, map the result to a DTO.
4. **Long-lived state has one owner: an actor.** No `Mutex<Option<…>>` or `AtomicBool` in the application state, no `static` with state inside slices.
5. **Dependencies point down.** A lower tier never imports a higher one, and the compiler enforces it.
6. **Only `drivers/src/platform/` knows the operating system.** The rest asks for concepts (process group, secret, data folder), never for system calls.

## 3. Vocabulary

| Term | Meaning | Front-end equivalent |
|---|---|---|
| **Tier** | A kind of crate: `kit`, `store`, `drivers`, `core`, `app`. Tiers are stacked and depend only downward. | A library type in Nx (`type:util`, `type:data-access`, …) |
| **Slice** | One feature of the product, such as `run`, `chat` or `skill`. | A domain folder, `src/sections/<area>` |
| **Layer** | A file inside a slice with a fixed name and role: `model.rs`, `logic.rs`, `store.rs`, `service.rs`. | `feature/`, `ui/`, `data-access/`, `util/` |
| **Actor** | The single owner of long-lived state: `Msg → update → Effect`. | An NgRx store: action → reducer → effect |
| **Handle** | The only door into an actor from outside. | `inject(Store)` |
| **Snapshot** | What the window sees of an actor, published through a `watch` channel. | `select(…)` |
| **Entry** | A way the outside world calls the backend: a Tauri command, an MCP server, a local bridge, a remote hub. | A screen component |
| **Query** | A read without side effects. | A selector |
| **Command** | A change of state. | An action |
| **Event** | The backend telling the front-end that something changed, without being asked. | A push into a store |
| **Platform** | An operating system we build for: `macos`, `linux`, `windows`. | A browser target |
| **Platform contract** | A function in `drivers::platform` that means the same thing on every operating system. | A polyfill |

Three of these are easy to confuse, so here is the picture to keep in mind: **tiers are the floors of a building, slices are the apartments on the `core` floor, and layers are the rooms inside each apartment.**

## 4. Where SLAT comes from

SLAT is not new in its parts. It combines five well-known ideas and fixes the choices each of them leaves open.

| Idea | What SLAT takes from it | What SLAT decides on top |
|---|---|---|
| Layered / Clean Architecture | Dependencies point toward the domain; I/O sits at the edge. | The layers are **crates**, so the compiler checks the direction. Exactly five kinds. |
| Vertical Slice Architecture | Code is grouped by feature, not by technical role. | Every slice has the **same file names** with the same roles. |
| The Elm Architecture, NgRx, Redux | State changes through messages and a pure update function. | Only for state that passes the three-question test (section 9.1). Effects return as messages. |
| Functional core, imperative shell | Decisions are pure; side effects are executed separately. | `logic.rs` and `update.rs` are pure by rule, and a script checks it. |
| Ports and adapters (hexagonal) | The outside world is reached through an interface. | No trait until there are two implementations. The `drivers` tier and platform contracts play the role of ports. |

The difference from each of them alone is that SLAT is **complete and mechanical**. Every kind of code has exactly one place, and the important rules are enforced by `Cargo.toml` or by a check that runs in CI.

## 5. Tiers

A SLAT workspace has at most five kinds of crates. They are named `<product>-<tier>`, for example `quayside-core`.

| Tier | What lives here | May depend on | Never |
|---|---|---|---|
| `kit` | Shared types and tools without a domain: identifiers, time, paths (`kit::paths`), durable file writes, the base error type, logging. | external libraries only | `tauri`, `tokio::process`, SQL, operating-system `#[cfg]`, anything from the product |
| `store` | Persistence: the writing connection, migrations, schema, index rebuild, database encryption. | `kit` | `tauri`, domain logic, processes |
| `drivers` | The outside world: processes, provider command-line tools, HTTP, sidecars. Code that depends on the operating system lives only in `drivers/src/platform/`. | `kit` | `tauri`, `store`, domain logic |
| `core` | All domain slices: model, logic, use cases, actors. | `kit`, `store`, `drivers` | `tauri` |
| `app` | Entries: Tauri commands, DTOs, events, entry servers (MCP, bridge), the application state, `setup`, `main`. | everything above | domain logic (that belongs in `core`) |

### 5.1. The compiler is the guard

The arrows between tiers are written in each crate's `Cargo.toml`. If `core` does not list `tauri` as a dependency, then `use tauri::Manager;` inside `core` is a compile error. That is the strongest guarantee a rule can have: it cannot be forgotten, skipped in review or argued with.

A minimal workspace:

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

### 5.2. How many crates to start with

The minimum is two: `core` and `app`. Split out the other tiers only when their code already exists and is clean, which means it imports nothing from a higher tier. **An empty crate "for later" is forbidden.** It costs a link step on every build and teaches nothing.

### 5.3. When to split a tier

When `core` grows past about 60,000 lines, or a full rebuild of `core` after a change to one slice becomes painful, move a group of slices into `core-<group>`, for example `quayside-core-run`. Never go beyond about eight crates. Each crate is a separate link step, and on a laptop a frozen machine costs more than the seconds a finer split would save.

### 5.4. Compatibility exception

A library name that the Tauri bundler or the user's data already knows (for example `quayside_lib`, or a folder under the user's home directory) stays with the `app` crate. New crates get new names.

## 6. Slices

A slice is one feature of the product. Its name is a singular noun in `snake_case`: `recording`, `transcript`, `board`, `trigger`. Not `recordings_manager`, not `utils`. Where the product has a front-end, slice names match the front-end's feature folders, so that the same word finds the code on both sides.

A slice exists in two tiers: its domain in `core`, and its entry (commands, DTOs, events) in `app`.

:::diagram slice

### 6.1. A slice in `core`

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

Rules:

- **A file the slice does not need does not exist.** A small slice can be a single `mod.rs` holding its model and service until it passes about 400 lines.
- **A growing file becomes a folder with the same name**: `logic.rs` becomes `logic/mod.rs` plus `logic/<topic>.rs`. The role does not change, only the number of files.
- **A slice that is too big splits into sub-slices**: `run/` becomes `run/start/`, `run/step/`, `run/finish/`, each with the same file layout. The parent keeps only a `mod.rs` with re-exports.
- **`mod.rs` is the slice's front door**, like `index.ts` of an Nx library. Other slices import only through it.

A typical `mod.rs`:

```rust
mod logic;
mod model;
mod service;
mod store;

pub use model::{Recording, RecordingId, RecordingState};
pub use service::RecordingService;
```

### 6.2. A slice in `app`

```
app/src/<slice>/
  mod.rs        `mod …;` plus the list of commands for `generate_handler!`
  commands.rs   #[tauri::command] functions; at most 10 lines each
  dto.rs        wire types: serde camelCase, #[serde(other)] on enums, From<model>
  events.rs     event names and payloads sent to the window; snapshot subscription loops
```

The rest of the `app` crate:

```
app/src/
  main.rs       calls lib::run(); nothing else
  lib.rs        run(): Builder, plugins, setup, generate_handler! assembled from <slice>::COMMANDS
  state.rs      AppState: the composition root, section 11
  error.rs      entry error → code and text for the window
  platform.rs   optional: window and menu settings that depend on the operating system, section 12.3
  doors/        entries other than the window: MCP server, bridge for agents, remote hub
```

### 6.3. A command, the reference shape

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

If a command needs an `if`, a loop or two calls into the slice, that logic belongs in `service.rs` or `logic.rs`. The 10-line limit is not about style. A command that only translates is a command that never needs a test of its own, because everything it does is tested in the slice.

### 6.4. Registering commands

`tauri::generate_handler!` needs the full path of every command, so `lib.rs` keeps one list. Keep it grouped by slice, one block per slice, so that adding a command is one line next to its neighbours:

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

A command that exists in a slice but is missing from this list compiles and silently does nothing. Section 16 includes a small check that compares the two and fails when they drift.

### 6.5. Naming slices

- One noun per feature, in the singular: `trigger`, not `triggers`.
- The name of the thing the user recognizes, not of the technique: `transcript`, not `whisper_pipeline`.
- When two features always change together, they are one slice. When one feature has parts that change independently, they are sub-slices.
- **Cross-cutting policy is a slice too**: access gates, limits, budgets and secret protection live in `core/<policy>/` (for example `core/guard/`) and every other slice calls them.

## 7. Who may import whom

### 7.1. Inside a slice

| File | May import | May not import |
|---|---|---|
| `model.rs` | `kit`; the `model` of other slices, through their `mod.rs` | anything with I/O, `async`, `store`, `drivers` |
| `logic.rs` | `model` | I/O, `async`, `store`, `drivers`, `service` |
| `store.rs` | `model`, the `store` crate | `drivers`, `service`, `logic` of other slices |
| `service.rs` | `model`, `logic`, `store.rs`, `drivers`, the public API of other slices | `tauri`, global state |
| `actor/*` | `model`, `logic`, `service`, `drivers` | `tauri`; and `update.rs` also no I/O |
| `app/<slice>/dto.rs` | the slice's `model` | `service`, `store` |
| `app/<slice>/commands.rs` | the slice's public API, `dto`, `AppState` | `store`, `drivers`, `logic` |

### 7.2. Between slices

- **Only through `mod.rs`.** Deep paths such as `crate::run::logic::…` from another slice are forbidden.
- **No cycles.** If `a` needs `b` and `b` needs `a`, the shared piece becomes its own slice (usually a small `model` or a small service), and both depend on it.
- **Policy is a slice, not a command.** If a budget check lives in a command, then every lower layer that needs it has to import upward. That is the most common cause of cycles in Tauri applications.

### 7.3. Why these particular lines

The import table is built so that the expensive things to test (I/O, async, processes) sit in as few files as possible, and the valuable things to test (decisions) sit in files that have none of them. A decision in `logic.rs` is tested with a plain `#[test]` in microseconds. The same decision buried in a command needs a window.

## 8. Data flows

:::diagram flows

### 8.1. Query (a read)

```
window ─invoke─► app/<s>/commands.rs ─► core/<s>/service.rs ─► core/<s>/store.rs
                        ◄── dto.rs ◄──────── model ◄──────────────────┘
```

A read does not go through an actor, unless it reads that actor's state. Then it reads the latest `Snapshot` from the `Handle`, without sending a message.

### 8.2. Command (a change)

Without background state (saving a setting, creating a file):

```
window ─invoke─► commands ─► service ─► logic (decision) ─► store / drivers ─► result
```

With background state (a run, a conversation, a recording):

```
window ─invoke─► commands ─► Handle.send(Msg)
                                  │
                 actor ◄──────────┘
                   update(&mut State, Msg) -> Vec<Effect>     pure function
                   for e in effects: execute(e)               I/O: drivers, store, timers
                   snapshot.send(State.view())                the window gets a new view
```

### 8.3. Event (backend → window)

Events are emitted **only** from `app/<s>/events.rs`. A slice in `core` publishes changes through a `watch::Sender<Snapshot>` or a `broadcast::Sender<Event>`. `events.rs` subscribes and calls `emit`. This keeps `core` unaware of the window, and gives the front-end exactly one place where each slice's events come from. Event names follow `<slice>:<event>`, for example `recording:snapshot`.

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

### 8.4. High-volume streams

Some slices produce many small events: log lines, transcript words, progress ticks. Do not emit one Tauri event per line. Give the slice a bounded channel in `core`, and let `app` own a **pump** that batches lines into a `tauri::ipc::Channel` every few milliseconds. The bounded channel is the back-pressure: when the window is slow, the slice learns it (`Sent::Dropped`) instead of filling memory. The batching, the channel and the frame rate are entry concerns and stay in `app`.

## 9. Actors: slices with state

### 9.1. When to use an actor

Use an actor only when **all three** are true:

1. the state lives longer than one command call;
2. several sources change it concurrently (the window, processes, timers, the network);
3. the window watches it live.

In every other case, use a plain `service.rs`. Not every NgRx feature needs effects, and not every SLAT slice needs an actor.

| Candidate | 1 | 2 | 3 | Verdict |
|---|---|---|---|---|
| an agent run with steps and processes | yes | window, processes, timers | yes | actor |
| a live recording | yes | window, audio device, timer | yes | actor |
| a conversation with a model | yes | window, model process, remote device | yes | actor |
| generating a draft once and returning it | yes | window (start/stop) | no, one result | service + `kit::Jobs` |
| a cache of model prices | yes | none | no | a field of the slice's service |

### 9.2. Files

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

### 9.3. The contract

- **`update` is pure.** It receives the state and a message and returns a list of effects. Every business rule about that state can be tested without tokio, processes or a database.
- **An effect that produces a result returns it as a new `Msg`.** The actor never waits for a long effect inside its loop. A long effect goes to `tokio::spawn`, and its result comes back through the mailbox.
- **Cancellation is a message with a generation**, not a flag: `Msg::Cancel { generation }`. The state holds `generation: u64`, and a late answer with an old generation is ignored in `update`. A global `AtomicBool` leaks between operations; a generation cannot.
- **A result is a value**: `enum Outcome<T> { Done(T), Cancelled }`, never `Err(Cancelled)`. Cancelling is something the user asked for, not a failure.
- **A time limit is `Effect::StartTimer`, and its end is `Msg::TimedOut`.** Killing a process after a time limit is done by a driver. A bare `tokio::time::timeout` cancels the Rust future, not the operating-system process.
- **No `std::sync::Mutex` inside an actor.** Its state has one owner, so it needs no lock.
- **One actor per instance of state**: one per run, one per conversation. The registry of live instances is a small actor of its own, or a service with a map of handles.

### 9.4. A complete small actor

A recording actor that starts a recorder process, enforces a time limit and can be cancelled. All type and function names are illustrative.

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

The last arm is the point of generations: a `Level`, `TimedOut` or `Ended` message from an earlier recording arrives with an old generation and changes nothing.

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

When the order of effects matters (persist before notify, for example), execute those effects in sequence inside one spawned task instead of one task per effect. The rule is only that the loop itself never waits.

### 9.5. Testing an actor

Most tests never start the actor. They call `update` directly:

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

A few tests drive the whole actor through its `Handle` with `tokio::time::pause()`, a fake driver, and assertions on the sequence of snapshots.

## 10. The variant explosion

A family of functions such as `start_with_budget`, `start_with_slots`, `start_with_snapshot_hook`, `start_with_budget_and_slots` is a signal that a request struct is missing. Replace the family with one entry function and one options struct:

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

Callers write `StartRequest { workflow, budget: Some(limit), ..Default::default() }`. A new option is one new field, not a new function and a new line in every caller. Test-only injection points (`faults`, `hooks`) are fields that exist only in the test build.

## 11. AppState, the composition root

`AppState` assembles the application and does nothing else. It may hold:

- `Arc<…Service>` and `…Handle` values of slices;
- read-only configuration;
- a handle to the database writer.

It may not hold:

- `Mutex<Option<…>>`, `AtomicBool` or `Mutex<HashMap<…>>` that describe some background process. That is actor state and belongs in `core/<slice>/actor/state.rs`;
- fields that are a detail of one slice (caches, cancellation maps, queues);
- and slices may not hide state in `static` variables (`OnceLock<Mutex<…>>`, `LazyLock<Mutex<…>>`). The only exception is a constant computed once (`OnceLock<PathBuf>`) that never changes while the process lives.

**The test:** every field of `AppState` can be described with one noun from a slice ("recordings", "runs", "account"). A field that needs a sentence to describe belongs inside a slice.

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

### 11.1. `kit::Jobs`: one-shot background work

Generating a draft, comparing two folders or planning a task runs in the background, can be stopped, and produces one result. That does not need an actor. It needs a cancellation map, and that map belongs to the slice's service, not to `AppState`. `kit::Jobs<K>` is one concrete generic type for it:

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

`begin` cancels any earlier job with the same key, stores a new generation and returns a guard that removes the entry when it drops, but only if the generation still matches. The lock is held only inside these two short functions, never across an `await`. Because `Jobs` is a concrete type and not a trait, it does not break the rule against single-implementation traits.

## 12. Platforms

*New in version 1.1.*

A product may ship on a single operating system today (for example, only macOS). SLAT lays out the code so that the next operating system is work in **one folder**, not a search through the whole repository. There is one rule: **only `drivers/src/platform/` knows the operating system.** Everything else asks for concepts (a process group, a secret, the data folder, opening a file), never for system calls.

The list of supported platforms belongs to the repository (its contributor guide), not to SLAT.

:::diagram platform

### 12.1. Layout

```
drivers/src/platform/
  mod.rs          the only platform API: selects a file with #[cfg] and pub use; no logic
  unix.rs         shared by macOS and Linux: process groups, signals, file modes
  macos.rs        Keychain, revealing in Finder, the login shell, …
  linux.rs        only when the port starts: Secret Service, xdg-open, …
  windows.rs      only when the port starts: Job Objects, Credential Manager, ACLs, …
  unsupported.rs  every function returns Err(PlatformError::Unsupported)
```

- A file for an operating system the product does not support yet **does not exist**, for the same reason an empty crate "for later" does not. `unsupported.rs` takes its place.
- `unsupported.rs` is not dead code. Thanks to it, the whole workspace except `app` compiles for every platform from the first day. A leak of system code into `core` becomes a compile error in CI, not a discovery on the day of the port.
- `mod.rs` looks the same in every repository:

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

A port changes only this list of `cfg` lines. Every platform file exposes **the same set of functions and types with the same signatures**. A missing function is a compile error on that platform. This is not a trait: on any given build there is always exactly one implementation.

### 12.2. Contracts

Each concept has a contract that means the same thing on every operating system. Only the inside differs.

| Concept | API in `drivers::platform` | macOS | Linux | Windows |
|---|---|---|---|---|
| process group | `ProcessGroup::spawn`, `terminate(grace)`, `proved_dead()` | process group id; SIGTERM, grace period, SIGKILL; `kill(-pgid, 0)` returns `ESRCH` | as macOS | Job Object; `TerminateJobObject`; the job has no processes left |
| secrets | `secret::read`, `secret::write`, `secret::delete` | Keychain | Secret Service (libsecret) | Credential Manager |
| private file and folder | `fs::write_private`, `fs::create_private_dir` | mode `0o600` / `0o700` | as macOS | ACL: owner only |
| open in the system | `open_path`, `reveal_path`, `open_url` | `open`, `open -R` | `xdg-open` | `ShellExecuteW`, `explorer /select,` |
| user environment | `login_env()` | the login shell (the `PATH` of an app started from the Dock is minimal) | as macOS | registry and process environment |
| find a program | `which(program)` | `PATH` | `PATH` | `PATH` plus `PATHEXT` |
| machine facts | `machine::cores`, `machine::memory`, `machine::free_space` | sysctl, statfs | /proc, statfs | system API |

Contract rules:

- A contract function does not return system types (`pid_t`, `HANDLE`). It returns types from `drivers` or `kit`.
- **Proof, not hope**, on every platform: "the process is dead" is an established fact, not a signal that was sent.
- Where an operating system cannot do what the contract requires, the function returns an error that names what is missing, never a silent substitute.

A short example of a contract and its macOS side:

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

### 12.3. What is forbidden outside `platform/`

| Forbidden outside `drivers/src/platform/` | Use instead |
|---|---|
| `#[cfg(unix)]`, `#[cfg(windows)]`, `#[cfg(target_os = …)]` | a contract from 12.2 |
| `std::os::unix`, `std::os::windows`, `libc`, `nix`, `windows-sys`, `security-framework` | a contract from 12.2 |
| `sh -c`, `bash`, `zsh`, `cmd /c`, `powershell` | `Command::new(program).args(…)`; if a shell is truly needed, `platform` chooses it |
| system program names: `open`, `xdg-open`, `security`, `osascript`, `explorer` | `open_path`, `secret::*`, … |
| hard-coded paths: `~`, `$HOME`, `/tmp`, `/usr/bin`, `/Applications`, `Library/` | `kit::paths` (12.4) |
| joining paths with a string `/` | `Path::join` |
| file modes as numbers (`0o600`) | `fs::write_private` |

The only exception is `app/src/platform.rs`, for things only Tauri knows: the title bar style, the application menu, the window activation policy. Nothing but window settings.

### 12.4. Paths, files and text

- **Folders come only from `kit::paths`**: `data()`, `config()`, `cache()`, `logs()`, `temp()`. Underneath is a library that follows each system's convention (macOS `~/Library/Application Support/<App>`, Linux XDG, Windows `%APPDATA%`). Data that already lives under an older path stays there on the system where it was created (the compatibility exception from 5.4).
- **File names the application creates are lower case** and never differ only by letter case. The default file systems of macOS and Windows do not tell them apart; Linux does.
- **Do not rename or delete a file that someone holds open.** Windows refuses. Atomic writes go through `kit::durable_file`, which closes the file before replacing it.
- **Long paths.** Windows limits paths to about 260 characters without the `\\?\` prefix. Keep working copies and run folders shallow; the prefix is added by `platform`, never by a slice.
- **Text from processes** is read tolerantly of `\r\n`. Files the application writes use `\n`.
- **A path sent to the window** is UTF-8. A path that cannot be written as UTF-8 is an error that names the file, never an `unwrap()`.

### 12.5. Platform tests

- **The contract test** lives in `drivers/tests/platform_contract.rs` and is the same for every operating system: a process is dead after `terminate`, a secret comes back after it is written and is gone after it is deleted, a private file cannot be read by another user. Every supported platform passes **the same** set.
- **Tests outside `drivers` do not use a shell or signals.** A process needed by a test is a small Rust program (a binary in a test crate), not `sh -c 'sleep 10'`.
- A platform `#[cfg]` in tests is allowed only in the tests of `drivers`.

### 12.6. Enforcement

| Rule | Who enforces it |
|---|---|
| the prohibitions from 12.3 | a grep check with a baseline list (section 16) |
| crates other than `app` compile on every platform | `cargo check --workspace --exclude <app>` on native CI runners for Ubuntu and Windows. Not a cross-check from macOS: build scripts with C code need the target's compiler. |
| the contract works | `platform_contract.rs` on a runner for each **supported** platform |

### 12.7. Porting to a new operating system

1. `drivers/src/platform/<system>.rs`: every function of the contract. The compiler lists what is missing.
2. `mod.rs`: the new system's `cfg` stops pointing at `unsupported.rs`.
3. `platform_contract.rs` is green on that system's runner, and the runner joins CI.
4. `app`: bundle and signing configuration for the system, and `app/src/platform.rs` if needed.
5. The repository's contributor guide adds the system to the list of supported platforms.

If a port requires a change in `core`, something leaked. First a separate pull request moves the leak behind a contract, then the port continues.

## 13. Errors

- **Every crate has its own error enum** (with `thiserror`). A slice may have its own in `error.rs`.
- **`core` returns domain errors.** `app/error.rs` turns them into a code and a sentence for the window. The sentence comes from your translation table, never from the `Display` of a wire enum.
- **An unknown event from the wire is not an error.** Use `#[serde(other)]` on enums and `Option<T>` on fields that are not essential. Log the unknown line for debugging and move on. A new version of a provider's command-line tool must never stop a run.
- **`unwrap()` and `panic!` are forbidden** outside tests in `core`, `store` and `drivers`. Use `?` with an error variant, or `expect()` with a reason that explains why the value cannot be missing.

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

## 14. Testing by layer

| Layer | How to test | What counts as proof |
|---|---|---|
| `logic.rs`, `update.rs` | a plain `#[test]`, no tokio | an assertion on a value or on the list of effects |
| `store.rs` | a database in a temporary folder | the row that comes back from a read |
| `service.rs` | `#[tokio::test]` with a real store and a fake driver | the state of files or the database after the call |
| `actor/` | a `Handle` plus a script of messages; time with `tokio::time::pause` | the sequence of `Snapshot`s |
| `drivers` | a real process or a recorded stream | the process is dead (`ESRCH` or an empty job), the lines from the wire |
| `app/commands` | an integration test through the entry (end-to-end or an integration target) | the text a person sees |

A test for a message shown to a person belongs where the person sees it, not only in `logic.rs`. A function that produces the right sentence proves nothing if nobody calls it.

### 14.1. One integration binary

Every file directly in `tests/` is a separate binary, and each binary is linked separately. On a large workspace that is a minute per file. Put integration tests in **one** target, `tests/it/main.rs`, with one module per topic, and run a single topic with a filter:

```
tests/it/
  main.rs          mod recording_stops_on_time_limit; mod transcript_survives_restart; …
  recording_stops_on_time_limit.rs
  transcript_survives_restart.rs
```

```bash
cargo nextest run --test it recording_stops_on_time_limit::
```

Run with `--no-tests=fail`, so that a filter that matches nothing is red instead of quietly green.

### 14.2. A fake driver without a trait

A test needs a driver that does not start real processes. SLAT forbids a trait with one implementation, and a fake does not count as a second real one. Two options keep the rule:

- **A data seam.** The service takes the driver's *output* as a value or a channel, not the driver itself. The test sends lines into the channel.
- **A test build.** `drivers` exposes `#[cfg(any(test, feature = "fake"))] pub mod fake;` with the same functions as the real module, and the test crate enables the `fake` feature.

When a second real implementation appears (a second provider, a second platform), that is the moment for a trait.

## 15. Size limits

| Unit | Warning threshold | What to do |
|---|---|---|
| file | 1,500 lines of code (without tests) | split into a folder with the same role, section 6.1 |
| slice | 15,000 lines | split into sub-slices |
| `core` | 60,000 lines | move a group into `core-<group>`, section 5.3 |
| Tauri command | 10 lines | move the logic into `service.rs` |
| `AppState` field | one noun | see section 11 |

Files over the threshold on the day you adopt SLAT go on a **baseline list**. The list may only shrink.

## 16. Enforcement

Mechanism first, words second. A rule that a script can check should never depend on someone remembering it.

| Rule | Who enforces it |
|---|---|
| only `app` knows Tauri | `Cargo.toml` (no `tauri` dependency elsewhere) |
| tiers depend only downward | `Cargo.toml` |
| only `store` opens the writing connection | a grep check: `Connection::open` only in the `store` crate. Slice `store.rs` files use `rusqlite` types, so the dependency alone is not enough. |
| `#[tauri::command]` only in `app/*/commands.rs` | a grep check |
| every command is registered | a check comparing commands in slices with `generate_handler!` |
| `emit` only in `app/*/events.rs` | a grep check |
| no deep imports between slices | a check for `crate::<a>::<layer>::` from another slice |
| no `static` with state in `core` | a grep check for `static .*(Mutex|RwLock)` |
| `update.rs` has no I/O | a check: no `async`, `tokio::`, `std::fs`, `store::` in `update.rs` |
| operating system only in `drivers/src/platform/` and `app/src/platform.rs` | a grep check with the list from 12.3 |
| crates other than `app` compile on every platform | `cargo check` on Ubuntu and Windows CI runners |
| size limits | a check with a baseline list that may only shrink |

Every check starts with a **baseline list** of today's violations. A new violation is red. A violation that gets fixed must be removed from the list in the same pull request, so the list can never grow back.

### 16.1. A check with a baseline

All checks follow one shape: find violations, subtract the baseline, fail on anything left, and fail if the baseline lists something that is already fixed.

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

### 16.2. A check must be able to fail

Before you trust a check, plant a real violation, watch it turn red, and remove it. A check that has never been red has never been tested. A check that greps for a string can pass because the string appears in a comment, which is why the patterns above match code shapes (`\.emit(`), not words.

### 16.3. The platform job in CI

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

Pin action versions to full commit hashes in a real repository. The job only compiles; it runs no tests on platforms the product does not support yet, so it is cheap.

### 16.4. Checks for the whole set

| Check | Rule |
|---|---|
| `checks/slat-commands.sh` | `#[tauri::command]` only in `src-tauri/src/*/commands.rs` |
| `checks/slat-registered.sh` | every command in a slice appears in `generate_handler!` |
| `checks/slat-emit.sh` | `emit` only in `src-tauri/src/*/events.rs` |
| `checks/slat-deep-imports.sh` | no `crate::<slice>::<layer>::` from another slice |
| `checks/slat-static-state.sh` | no `static … Mutex|RwLock` in `crates/*-core*` |
| `checks/slat-pure-update.sh` | `update.rs` without `async`, `tokio::`, `std::fs`, `store::` |
| `checks/slat-platform.sh` | the prohibitions from 12.3 outside `platform/` |
| `checks/slat-size.sh` | files over 1,500 lines from the baseline may only shrink |

## 17. Recipes

Every recipe starts with a test that fails on the old code, on an assertion and not on compilation. In Rust, write the signature first with `todo!()`, so the test compiles and fails for the right reason.

### 17.1. A new read (Query)

1. `core/<s>/model.rs`: the result type, if it does not exist.
2. `core/<s>/store.rs`: the read function. Test it on a temporary database.
3. `core/<s>/service.rs`: `pub async fn <verb>(…)` that calls store and logic.
4. `core/<s>/mod.rs`: `pub use` the new function or type.
5. `app/<s>/dto.rs`: the DTO and `From<model>`.
6. `app/<s>/commands.rs`: a command of at most 10 lines; register it.
7. Front-end: the data-access layer calls the command.

### 17.2. A new change without background state (Command)

As 17.1, and the decision (is it allowed, what changes) is written in `logic.rs` as a pure function with a test. `service.rs` only calls it and performs the write.

### 17.3. A new slice

1. Name: the feature as a singular noun in `snake_case`.
2. `core/src/<s>/mod.rs` plus only the files it needs; `pub mod <s>;` in `core/src/lib.rs`.
3. `app/src/<s>/mod.rs`, `commands.rs`, `dto.rs`; register its commands.
4. If the slice has background state: recipe 17.4.

### 17.4. A new flow with state (actor)

1. Check the three conditions from 9.1. If one fails: recipe 17.2.
2. `msg.rs`, `state.rs`, `snapshot.rs`: the types.
3. `update.rs`: tests first (message in, expected effects and state out), then the implementation.
4. `effect.rs`: `execute` for every effect; results return as `Msg`.
5. `run.rs` and `handle.rs`: the loop and the door.
6. `AppState` gets exactly one field: the registry or the `Handle`.
7. `app/<s>/events.rs`: subscribe to the `Snapshot` and `emit("<s>:snapshot")`.

### 17.5. A new driver (the outside world)

1. `drivers/src/<name>.rs` or a folder. A driver knows no slices and no database.
2. A trait only when there are at least two implementations.
3. A process: process group, kill escalation, proof of death; secrets kept out of arguments and logs. All of it through the contracts of `platform` (12.2), never through a system call in the driver.
4. A slice uses the driver from `service.rs` or from `effect.rs`.

### 17.6. A new event for the window

1. A change in `core` publishes a `Snapshot` or an `Event` on a channel.
2. `app/<s>/events.rs` subscribes and emits `<s>:<event>`.
3. Front-end: the data-access layer listens and updates its store.

### 17.7. A new platform

Section 12.7.

### 17.8. Where does this go? (decision tree)

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

## 18. Working with coding agents

SLAT was designed in a team where much of the code is written by coding agents. Agents follow a layout reliably when it is written down, short, and checked by machines. Three things make the difference.

1. **A fixed layout is a free map.** An agent told to "add a filter to transcripts" opens `core/transcript/` and `app/transcript/` without searching. The time an agent spends searching is the time it spends being wrong.
2. **A check beats a sentence in the prompt.** "Do not emit from core" in a prompt is followed most of the time. A red check is followed every time. Write the rule as a check first, and as a prompt line only when it cannot be checked.
3. **The recipes are prompts.** Section 17 is written as numbered steps on purpose: paste the recipe into the task, and the agent produces files in the expected places in the expected order.

A section you can copy into your repository's contributor guide (`AGENTS.md`, `CLAUDE.md` or equivalent):

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

## 19. Migrating an existing codebase

You do not need a rewrite. SLAT is adopted in small pull requests that keep the application working the whole time, in an order that does not block other branches.

:::diagram migration

### 19.1. The order

1. **Measure.** Map the modules: lines per module, imports that point upward, files that use `tauri::`, number of `#[tauri::command]`, `static` with state, fields of the application state, `#[cfg]` for operating systems. Write it down in a plan in the repository. These numbers are your baselines.
2. **Invert the upward dependencies.** Policies that live in the command layer but are called by lower layers move down to `core/<policy>/`. Types that the domain borrows from the entry layer (a line channel, an image type, a message string) move to the slice they belong to. The old path stays as a `pub use` until the migration ends.
3. **Split `app` and `core`.** Create the workspace and a `core` crate without `tauri`. Code that knows Tauri stays in `app`; everything else moves with `git mv`. This is the most mechanical step.
4. **Split out `store`, `drivers` and `kit`.** Only when their code is already clean. When you split `drivers`, move operating-system code into `platform/`, and give the platform check its baseline.
5. **Slice by slice.** One slice per pull request: commands into `app/<s>/`, logic into `core/<s>/` in the fixed layout. Start with the smallest and least shared.
6. **`kit::Jobs`.** The cancellation maps leave the application state.
7. **Actors.** State from the application state and from `static` variables moves into actors, one flow per pull request, with `update` tests written first against the current behaviour.
8. **Checks.** Each step switches on the check for its rule, with a baseline.

### 19.2. Rules of migration

- **Moves do not change behaviour.** A pull request that moves code does not fix logic, and a pull request that fixes logic does not move code. When something breaks, you know which kind of change caused it.
- **Facades on old paths.** `pub use new::place::*;` at the old module path lets code you are not allowed to touch (or do not want to touch yet), and your existing tests, compile unchanged. A facade is removed when nothing imports it.
- **One heavy build at a time.** Several parallel `cargo` builds of a large workspace can freeze a laptop. Migrate in one line.
- **Run the whole test suite after each step**, not after each commit. The suite is your proof that nothing moved in behaviour.

### 19.3. Layout first, a faster start

If findability is your biggest pain, you can reorder the work: first move **files** into slice folders inside the single existing crate, with no changes to their contents, and leave facades at the old paths. Git records these as renames, so other open branches still merge cleanly. You get the map (the folder of each feature) in a day or two, and the crate split, the layers inside each slice and the actors follow later on top of a layout that is already readable.

Two things are not free even here. Files that use `super::` or `pub(super)` change their parent module when they move, so a few paths need small mechanical fixes. And moving commands out of a central file changes that file, which conflicts with branches that edit it, so it is better done as a separate second step.

### 19.4. What usually goes wrong

| Problem | What to do |
|---|---|
| Hundreds of tests import old paths | Facades at the old paths. Do not move the tests in the same pull requests. |
| Parallel branches conflict with `git mv` | Do the crate splits when the fewest branches are open. Every move is its own pull request. |
| `pub(crate)` items are needed from another crate after the split | Widen them to `pub`. After the migration, review what can go back to `pub(crate)`. |
| Compile time grows with the number of crates | At most six to eight crates. One heavy build at a time. |
| A refactor quietly changes behaviour | `update` tests first, against today's behaviour. Moves and fixes in separate pull requests. |
| A part of the code may not change at all (a critical feature, a frozen area) | It stays where it is and reaches the new layout only through facades. Facades are additive code. |

## 20. Case study: Quayside

Quayside is a **fictional** desktop application, invented for this document. It is loosely modelled on the kind of software we build, but every name, number and file below is made up. Quayside records calls, transcribes them on the device, writes a summary with a local or a cloud model, runs follow-up tasks with coding agents, syncs action items to a shared team board, and has a phone companion that can watch a recording and send a note into it.

It has been built for two years by a small team in a hurry, and it works. It is also a textbook of everything section 1 described.

### 20.1. Before

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

The measurement from step 1 of the migration:

| What | Value |
|---|---|
| Rust lines (without tests) | ~78,000 |
| Files that use `tauri::` | 37 of 112 |
| `#[tauri::command]` functions | 148, in 4 files |
| Fields of `AppState` | 41, of which 14 are `Mutex<…>` or atomics |
| `static` with state | 12 |
| Places that open a writing SQLite connection | 9 |
| Files with `#[cfg(target_os = …)]` | 23 |
| Variants of `start_recording_*` | 7 |
| Time to run the domain tests | they need a window, so nobody runs them |

### 20.2. Symptoms in the code

The application state, abridged:

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

A stop that leaks between recordings. The user presses Stop, then quickly starts a new recording. The old recording's loop has not yet read the flag; the new recording resets nothing; the next check of `recording_cancel` stops the **new** recording:

```rust
static RECORDING_CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn stop_recording() {
    RECORDING_CANCEL.store(true, Ordering::SeqCst);
}
```

The domain talks to the window directly, so it cannot be tested without one:

```rust
pub async fn transcribe(app: AppHandle, file: PathBuf) -> Result<(), String> {
    let mut words = whisper::stream(&file)?;
    while let Some(word) = words.next().await {
        app.emit("transcript-word", &word).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

Variants multiply:

```rust
pub async fn start_recording(…)
pub async fn start_recording_with_limit(…)
pub async fn start_recording_with_limit_and_device(…)
pub async fn start_recording_for_meeting(…)
pub async fn start_recording_for_meeting_with_limit(…)
pub async fn start_recording_from_companion(…)
pub async fn start_recording_with_test_hook(…)
```

And the operating system is everywhere:

```rust
#[cfg(target_os = "macos")]
fn reveal(path: &Path) {
    let _ = Command::new("sh").arg("-c").arg(format!("open -R '{}'", path.display())).spawn();
}
```

That last one is also a shell injection waiting for a file name with a quote in it.

### 20.3. The migration, step by step

**Step 1: invert dependencies.** The transcriber stops taking an `AppHandle`. It writes words into a bounded channel that `core` owns; `app` pumps the channel into the window. The upload code stops reading `AppState` and receives the two values it needs as arguments.

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

**Step 2: split `app` and `core`.** A workspace with `quayside-core` (no `tauri`) and the existing `src-tauri` as `app`. `lib.rs` in the app keeps `pub use quayside_core::{…};` so every old path still compiles. Proof: planting `use tauri::Manager;` in `core` fails to compile.

**Step 3: `kit`, `store`, `drivers`.** The nine SQLite openings collapse into one writer in `quayside-store`. Recorder, transcriber, model clients and `git` go to `quayside-drivers`. The 23 files with `#[cfg]` become one `platform/` folder with `unix.rs`, `macos.rs` and `unsupported.rs`, and `reveal` becomes a contract:

```rust
pub fn reveal_path(path: &Path) -> Result<(), PlatformError> {
    let status = Command::new("/usr/bin/open").arg("-R").arg(path).status()?;
    status.success().then_some(()).ok_or(PlatformError::Refused("open -R"))
}
```

No shell, no quoting, no injection.

**Step 4: slices.** `handlers.rs` and `utils.rs` are taken apart into slices, smallest first:

```
settings → device → model → summary → transcript → board → companion → agent → recording
```

**Step 5: `kit::Jobs`.** `transcribing` and `summarizing` (two maps with cancellation tokens) become one `Jobs<TranscriptId>` inside the transcript service and one `Jobs<SummaryId>` inside the summary service.

**Step 6: actors.** Three pieces of state pass the test from 9.1: the recording, the agent runs and the board sync. The recording goes first, with `update` tests written against today's behaviour. The `AtomicBool` disappears; Stop now carries the generation of the recording it means, and the leak from 20.2 becomes a one-line test that stays green forever. The seven `start_recording_*` functions become one:

```rust
pub struct StartRecording {
    pub title: String,
    pub device: Option<DeviceId>,
    pub meeting: Option<MeetingId>,
    pub limit: Option<Duration>,
    pub origin: Origin,
}
```

**Step 7: checks.** Each check from section 16 switches on with its baseline. Most baselines are already empty, because the steps above removed the violations.

### 20.4. After

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

A command after the migration:

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

The same measurement, repeated:

| What | Before | After |
|---|---|---|
| Files that use `tauri::` | 37 | 12, all in `src-tauri` |
| Longest command | 140 lines | 9 lines |
| Fields of `AppState` | 41 | 9 |
| `static` with state | 12 | 0 |
| Writing SQLite connections | 9 places | 1 |
| Files with an operating-system `#[cfg]` | 23 | 3, all in `platform/` |
| Variants of `start_recording_*` | 7 | 1 |
| Domain tests | needed a window | run in a few seconds, no window |
| Compiles for Linux and Windows (except `app`) | no | yes, checked in CI |

These numbers are illustrative. The shape of the change is what matters: every row moved in the direction of one owner, one place and one rule.

## 21. Adoption checklist and FAQ

### 21.1. Checklist for a new project

- Workspace with two crates: `<product>-core` (no `tauri`) and the `app` crate.
- `kit::paths` from day one; no hard-coded home or temporary paths.
- `drivers/src/platform/` with `mod.rs`, `unix.rs`, your platform file and `unsupported.rs`, as soon as the first system call appears.
- Every feature as a slice with the fixed files; commands of at most 10 lines.
- Events only from `app/<slice>/events.rs`.
- One integration test target, `tests/it/`.
- Checks from section 16 in CI from the first week, when the baselines are still empty.
- The SLAT section from 18 in the contributor guide.

### 21.2. Checklist for an existing project

- Measurement table committed as a plan (19.1, step 1).
- Baseline lists created for every check you will turn on.
- A decision on what may not change, and facades for it.
- Steps 2 to 8 scheduled as separate pull requests, crate splits timed for few open branches.

### 21.3. Questions

**Is SLAT only for Tauri?**
No. Replace "Tauri command" with your entry (HTTP handler, CLI subcommand, message consumer) and keep everything else. The `app` tier is simply "the only crate that knows the entry framework".

**Why not hexagonal architecture with ports everywhere?**
Ports as traits are worth it when there are two implementations. Most drivers in a desktop application have one. SLAT keeps concrete types until a second implementation exists, and gets testability from pure `logic`/`update` functions and data seams instead.

**Is five tiers too many for a small app?**
Start with two (`core` and `app`). Add the others when their code exists and is clean.

**Do all slices need all files?**
No. A file that is not needed does not exist. A small slice can be a single `mod.rs`.

**When is something an actor and not a service?**
When all three conditions in 9.1 hold. If you are unsure, it is a service. Turning a service into an actor later is a contained change inside one slice.

**What if two slices need each other?**
The shared part becomes its own slice, and both depend on it. Cycles are never allowed.

**Why is the command limit 10 lines?**
Because a command that only translates needs no test of its own. Ten lines is enough to deserialize, call, and map; it is not enough to hide a decision.

**Does SLAT slow down compilation?**
Splitting into crates usually speeds up incremental builds, because a change in one slice does not rebuild `kit`, `store` or `drivers`. It can slow down a clean build slightly through extra link steps, which is why SLAT caps the number of crates.

**We only ship on macOS. Is section 12 worth it now?**
Yes, the cheap part of it: `kit::paths`, contracts for the few system calls you already have, `unsupported.rs`, and the compile job on Linux and Windows. That costs days now and saves a search through the whole codebase later. The `linux.rs` and `windows.rs` files themselves wait until you decide to port.

**How do coding agents cope with SLAT?**
Well, because the layout is fixed and the important rules are checks, not advice. See section 18.

## 22. Version history

| Version | Date | Changes |
|---|---|---|
| 1.1 | 25 October 2026 | Section 12, *Platforms*: the `platform/` folder in `drivers`, platform contracts, prohibitions outside `platform/`, rules for paths, files and text, platform tests, CI compile job on Linux and Windows, porting recipe. Additions to tiers, enforcement, recipes and the decision tree. |
| 1.0 | 24 October 2026 | First version: tiers, slices with fixed layers, import rules, data flows, actors, the application state as composition root, errors, testing, size limits, enforcement, recipes and migration. |

SLAT is versioned like a library. A change to a rule raises the minor version; a change that makes existing compliant code non-compliant raises the major version. Every repository that follows SLAT names the version it follows in its contributor guide.
