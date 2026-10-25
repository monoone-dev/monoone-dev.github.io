SLAT is a pattern for laying out the backend of a desktop application written in Rust, with Tauri as the window layer. It answers three questions that every growing codebase eventually gets wrong: **where does this file go**, **who may import whom**, and **how does data move** between the window, the domain and the outside world.

The name lists its four building blocks: **S**lice, **L**ayer, **A**ctor, **T**ier. Every rule in this document is about one of them.

This page is the complete reference. It is written so that a team that has never seen SLAT can adopt it in a new project or migrate an existing one, without asking us anything. It includes the rules, the reasons behind them, code you can copy, the checks that enforce them, and a worked example of a messy application brought into shape step by step.

Section numbers are stable. A repository that follows SLAT keeps a short copy of the rules in `docs/slat/SLAT.md` with the same numbers, so a reference such as "section 17.8" means the same thing on this page and in the repository. When the two differ, both are corrected on the same day. A new section is added just before the version history, which always stays last.

> **Version 1.3** · 25 October 2026. Version 1.3 adds section 23, *Plugins*, an optional part for products that let the user switch features on and off: when a feature is a plugin, the one rule about direction (a base slice never imports a plugin slice), extension points, one build with a switch at start, and the checks that keep it honest. A workspace without plugins needs no change. Version 1.3 also corrects the rest of the guide where it contradicted itself or left a question open, from the test command in 22.1 to a complete example actor in 9.4. The full history is in section 24.

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
| **Command** | A change of state. A *Tauri command* is something else: the function the window invokes, which may run a query or a command. | An action |
| **Event** | The backend telling the front-end that something changed, without being asked. | A push into a store |
| **Platform** | An operating system we build for: `macos`, `linux`, `windows`. | A browser target |
| **Platform contract** | A function in `drivers::platform` that means the same thing on every operating system. | A polyfill |
| **Plugin** | A feature the user can switch on or off: one or more slices with a manifest (section 23, optional). | A lazy-loaded feature library |
| **Base slice** | A slice that is always on; it never imports a plugin slice. | A shell library |
| **Hook** | An extension point a base slice offers and plugins answer with data. | An injection token with `multi: true` |

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
| `store` | Persistence: the writing connection and the read connections, migrations, schema, index rebuild, database encryption. | `kit` | `tauri`, domain logic, processes |
| `drivers` | The outside world: processes, provider command-line tools, HTTP, sidecars. Code that depends on the operating system lives only in `drivers/src/platform/`. | `kit` | `tauri`, `store`, domain logic |
| `core` | All domain slices: model, logic, use cases, actors. | `kit`, `store`, `drivers` | `tauri` |
| `app` | Entries: Tauri commands, DTOs, events, entry servers (MCP, bridge), the application state, `setup`, `main`. | every other tier | domain logic (that belongs in `core`) |

In this document `core/…` and `app/…` are short for the two crates' source folders. `core/src/<slice>/` is `crates/<product>-core/src/<slice>/`, and `app/src/<slice>/` is `src-tauri/src/<slice>/`, the folder Tauri creates for the app crate. The checks in section 16 use the full paths.

The shape of a SLAT workspace: Quayside, the example application from section 20, after its migration, shortened to two slices and four checks. Section 20.4 lists all of its slices.

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

### 5.1. The compiler is the guard

The arrows between tiers are written in each crate's `Cargo.toml`. If `core` does not list `tauri` as a dependency, then `use tauri::Manager;` inside `core` is a compile error. That is the strongest guarantee a rule can have: it cannot be forgotten, skipped in review or argued with.

A minimal workspace:

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

### 5.2. How many crates to start with

The minimum is two: `core` and `app`. Split out the other tiers only when their code already exists and is clean, which means it imports nothing from a higher tier. **An empty crate "for later" is forbidden.** It costs a compiler run on every build and its own test binaries to link on every test run, and teaches nothing.

### 5.3. When to split a tier

When `core` grows past about 60,000 lines, or a full rebuild of `core` after a change to one slice becomes painful, move a group of slices into `core-<group>`, for example `quayside-core-run`. Stay at six to eight crates at most. A library crate is not linked, but each crate brings its own test binaries, and each of those is linked separately (section 22.1). On a laptop a frozen machine costs more than the seconds a finer split would save. Decide with a measurement, not a feeling: `cargo build --timings` shows whether `core` is really the bottleneck (section 22.6).

**Split by compile weight, not only by lines.** A driver that wraps a large native or machine-learning library (speech recognition, an inference runtime, a database compiled from C sources) is often heavier than Tauri itself. Inside `drivers` it would be compiled and linked into every test binary of `core`, because `core` depends on `drivers`. Give such a driver its own crate, `<product>-drivers-<name>`, that `core` does not depend on. `app` depends on it and hands its output to the slice through a data seam (14.2), or the driver runs as a separate helper process that `app` starts. The tests of `core` then never compile it. `cargo-deny` keeps it that way: `{ crate = "quayside-drivers-speech", wrappers = ["quayside"] }` in `deny.toml` (16.5) makes any other path to that crate red.

### 5.4. Compatibility exception

A library name that the Tauri bundler or the user's data already knows (for example `quayside_lib`, or a folder under the user's home directory) stays with the `app` crate. New crates get new names.

## 6. Slices

A slice is one feature of the product. Its name is a singular noun in `snake_case`: `recording`, `transcript`, `board`, `trigger`. Not `recordings_manager`, not `utils`. Where the product has a front-end, slice names match the front-end's feature folders, so that the same word finds the code on both sides.

A slice exists in two tiers: its domain in `core`, and its entry (commands, DTOs, events) in `app`.

:::diagram slice

### 6.1. A slice in `core`

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

pub use model::{Transcript, TranscriptId, Word};
pub use service::TranscriptService;
```

### 6.2. A slice in `app`

```tree
app/src/<slice>/
  mod.rs        `mod …;` and `pub mod commands;` (the command list itself is in lib.rs, 6.4)
  commands.rs   #[tauri::command] functions; at most 10 lines each
  dto.rs        wire types: serde camelCase, #[serde(other)] on enums, From<model>, From<error> for IpcError
  events.rs     event names and payloads sent to the window; snapshot subscription loops
```

The rest of the `app` crate:

```tree
app/src/
  main.rs       calls lib::run(); nothing else
  lib.rs        run(): Builder, plugins, setup, generate_handler! with every command, grouped by slice
  state.rs      AppState: the composition root, section 11
  error.rs      entry error → code and text for the window
  platform.rs   optional: window and menu settings that depend on the operating system, section 12.3
  doors/        entries other than the window: MCP server, bridge for agents, remote hub
```

### 6.3. A command, the reference shape

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

If a command needs an `if`, a loop or two calls into the slice, that logic belongs in `service.rs` or `logic.rs`. The 10-line limit is not about style. A command that only translates needs no unit test of its own, because its logic is tested in the slice. What is left to prove is the sentence a person sees, and that is tested end to end through the entry (section 14).

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
| `app/<slice>/dto.rs` | the slice's `model` and error type, `IpcError` | `service`, `store` |
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

### 8.4. High-volume streams

Some slices produce many small events: log lines, transcript words, progress ticks. Do not emit one Tauri event per line. Give the slice a bounded channel in `core`: a small sender type of the slice's own (for example the `WordSink` in section 20.3) whose `send` never waits and returns what happened, such as `Sent::Delivered`, `Sent::Dropped` or `Sent::Closed`. Let `app/<s>/events.rs` own a **pump** that batches lines into a `tauri::ipc::Channel` every few milliseconds. The bounded channel is the back-pressure: when the window is slow, the slice learns it (`Sent::Dropped`) instead of filling memory, and when nobody listens any more (`Sent::Closed`) the slice can stop. The batching, the channel and the frame rate are entry concerns and stay in `app`.

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

### 9.3. The contract

- **`update` is pure.** It receives the state and a message and returns a list of effects. Every business rule about that state can be tested without tokio, processes or a database.
- **An effect that produces a result returns it as a new `Msg`.** The actor never waits for a long effect inside its loop. A long effect goes to `tokio::spawn`, and its result comes back through the mailbox.
- **Cancellation is a message with a generation**, not a flag: `Msg::Cancel { generation }`. The state holds `generation: u64`, and a late answer with an old generation is ignored in `update`. A global `AtomicBool` leaks between operations; a generation cannot.
- **A result is a value**: `enum Outcome<T> { Done(T), Cancelled }`, never `Err(Cancelled)`. Cancelling is something the user asked for, not a failure.
- **A time limit is `Effect::StartTimer`, and its end is `Msg::TimedOut`.** Killing a process after a time limit is done by a driver. A bare `tokio::time::timeout` cancels the Rust future, not the operating-system process.
- **No `std::sync::Mutex` inside an actor.** Its state has one owner, so it needs no lock.
- **One actor per instance of state**: one per run, one per conversation. The registry of live instances is a small actor of its own, or a service with a map of handles.

### 9.4. A complete small actor

A recording actor that starts a recorder process, enforces a time limit, and can be stopped (the file is kept) or cancelled (the file is discarded). All type and function names are illustrative.

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

A new recording may start whenever nothing is in progress, including after an earlier one was saved or cancelled. The last arm is the point of generations: a `Level`, `TimedOut` or `Ended` message from an earlier recording arrives with an old generation and changes nothing.

A `Start` while a recording is in progress changes nothing either. The window does not offer Start then, because the snapshot says a recording is active; a caller that needs an answer uses `ask` with a oneshot (9.2). `Failed` is the end when the recorder could not start, stop or save. Before a driver returns that error, it has already killed the process and proved it dead (17.5), so `Failed` never leaves a recorder running.

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

The window takes the generation it needs for Stop and Cancel from the snapshot. The loop sends a snapshot only when it changed (`send_if_modified`), and the level is rounded to whole decibels, so a meter that reports every few milliseconds does not turn every report into an event for the window. A value that changes faster than the window can draw belongs to a stream (8.4), not to a snapshot.

The loop keeps only a weak sender for the results of its own effects. When the last `Handle` is dropped, `recv` returns `None` and the actor ends instead of waiting forever.

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

A few tests drive the whole actor through its `Handle` with `tokio::time::pause()`, a data seam or a fake driver (14.2), and assertions on the sequence of snapshots.

## 10. The variant explosion

A family of functions such as `start_with_budget`, `start_with_slots`, `start_with_snapshot_hook`, `start_with_budget_and_slots` is a signal that a request struct is missing. Replace the family with one entry function and one options struct:

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

Callers write `StartRequest { budget: Some(limit), ..StartRequest::new(workflow) }`. The fields a request cannot do without are the arguments of `new`, so a request without a workflow does not compile; a `Default` would make one. A new option is one new field, not a new function and a new line in every caller. Test-only injection points (`faults`, `hooks`) are fields that exist only in a test build. `cfg(test)` alone covers only the crate's own unit tests, so integration tests and other crates switch the fields on with a `test-hooks` feature, the same idea as the fake driver in 14.2. Switch it on the same way in every test command (section 22.3); otherwise every switch between a build with the feature and one without it compiles the crate and everything above it again.

## 11. AppState, the composition root

`AppState` assembles the application and does nothing else. It may hold:

- `Arc<…Service>` and `…Handle` values of slices;
- read-only configuration;
- a handle to the database writer.

It may not hold:

- `Mutex<Option<…>>`, `AtomicBool` or `Mutex<HashMap<…>>` that describe some background process. That is actor state and belongs in `core/<slice>/actor/state.rs`;
- fields that are a detail of one slice (caches, cancellation maps, queues).

Slices may not hide state in `static` variables either (`OnceLock<Mutex<…>>`, `LazyLock<Mutex<…>>`). The only exception is a constant computed once (`OnceLock<PathBuf>`) that never changes while the process lives.

**The test:** every field of `AppState` can be described with one noun from a slice ("recordings", "runs", "account"). A field that needs a sentence to describe belongs inside a slice.

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

This is not a loophole in the rules of section 11. They are about where state lives, not about its type. A lock inside `kit::Jobs`, owned by one slice's service and never held across an `await`, is that slice's private detail. The same map as a field of `AppState` is state that nobody owns.

## 12. Platforms

*New in version 1.1.*

A product may ship on a single operating system today (for example, only macOS). SLAT lays out the code so that the next operating system is work in **one folder**, not a search through the whole repository. There is one rule: **only `drivers/src/platform/` knows the operating system.** Everything else asks for concepts (a process group, a secret, the data folder, opening a file), never for system calls.

The list of supported platforms belongs to the repository (its contributor guide), not to SLAT.

:::diagram platform

### 12.1. Layout

```tree
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

- **Folders come only from `kit::paths`**: `data()`, `config()`, `cache()`, `logs()`, `temp()`. Underneath is a library that follows each system's convention (macOS `~/Library/Application Support/<App>`, Linux XDG, Windows `%APPDATA%`). Data that already lives under an older path stays there (the compatibility exception from 5.4): when the older folder exists, `kit::paths` returns it, so the code still asks only `kit::paths`. The choice depends on whether that folder exists, not on the operating system, so `kit` itself has no `#[cfg]`; the system's convention comes from the library.
- **File names the application creates are lower case** and never differ only by letter case. The default file systems of macOS and Windows do not tell them apart; Linux does.
- **Do not rename or delete a file that someone holds open.** Windows refuses. Atomic writes go through `kit::durable_file`, which closes the file before replacing it.
- **Long paths.** Windows limits paths to about 260 characters without the `\\?\` prefix. Keep working copies and run folders shallow; the prefix is added by `platform`, never by a slice.
- **Text from processes** is read tolerantly of `\r\n`. Files the application writes use `\n`.
- **A path sent to the window** is UTF-8. A path that cannot be written as UTF-8 is an error that names the file, never an `unwrap()`.

### 12.5. Platform tests

- **The contract test** lives in `drivers/tests/it/platform_contract.rs`, a module of the crate's single integration target (14.1), and is the same for every operating system: a process is dead after `terminate`, a secret comes back after it is written and is gone after it is deleted, a private file cannot be read by another user. Every supported platform passes **the same** set.
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
- **`core` returns domain errors.** `app/<slice>/dto.rs` turns the slice's errors into a code and a sentence key for the window, next to the slice's other wire types. `app/error.rs` holds only `IpcError` itself, so a new slice adds its errors in its own folder, not in a shared file. The sentence comes from your translation table, never from the `Display` of a wire enum.
- **An unknown event from the wire is not an error.** Use `#[serde(other)]` on enums and `Option<T>` on fields that are not essential. Log the unknown line for debugging and move on. A new version of a provider's command-line tool must never stop a run.
- **`unwrap()` and `panic!` are forbidden** outside tests in `kit`, `store`, `drivers` and `core`. Use `?` with an error variant, or `expect()` with a reason that explains why the value cannot be missing.

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

## 14. Testing by layer

| Layer | How to test | What counts as proof |
|---|---|---|
| `logic.rs`, `update.rs` | a plain `#[test]`, no tokio | an assertion on a value or on the list of effects |
| `store.rs` | a database in a temporary folder | the row that comes back from a read |
| `service.rs` | `#[tokio::test]` with a real store and a data seam (14.2) | the state of files or the database after the call |
| `actor/` | a `Handle` plus a script of messages; time with `tokio::time::pause` | the sequence of `Snapshot`s |
| `drivers` | a real process or a recorded stream | the process is dead (`ESRCH` or an empty job), the lines from the wire |
| `app/commands` | no unit test; an end-to-end or integration test through the entry, for what a person sees | the text a person sees |

A test for a message shown to a person belongs where the person sees it, not only in `logic.rs`. A function that produces the right sentence proves nothing if nobody calls it.

### 14.1. One integration binary

Every file directly in `tests/` is a separate binary, and each binary is linked separately. On a large workspace that is a minute per file. Give each crate **one** integration target, `tests/it/main.rs`, with one module per topic, and run a single topic with a filter:

```tree
tests/it/
  main.rs          mod recording_stops_on_time_limit; mod transcript_survives_restart; …
  recording_stops_on_time_limit.rs
  transcript_survives_restart.rs
```

```bash
cargo nextest run --test it recording_stops_on_time_limit::
```

Run with `--no-tests=fail`, so that a filter that matches nothing is red instead of quietly green.

Helpers shared by the tests are a module of the same target, `tests/it/support/`. A helper file placed directly in `tests/` is one more binary to link.

### 14.2. A fake driver without a trait

A test needs a driver that does not start real processes. SLAT forbids a trait with one implementation, and a fake does not count as a second real one. Two options keep the rule. Prefer the first: a feature changes how `drivers` and every crate above it compile, so a test build with it and an application build without it are two separate sets of artifacts (section 22.3). A data seam costs no compile time at all.

- **A data seam.** The service takes the driver's *output* as a value or a channel, not the driver itself. The test sends lines into the channel.
- **A test build.** `drivers` exposes `#[cfg(any(test, feature = "fake"))] pub mod fake;` with the same functions as the real module, and the test crate enables the `fake` feature.

When a second real implementation appears (a second provider, a second platform), that is the moment for a trait.

### 14.3. Mutants in the diff

A test that passes proves something only if it would fail on wrong code. That is section 16.2 applied to tests. `cargo-mutants` changes the code (it flips a condition, replaces a return value, deletes a statement) and reports every change that no test noticed. Run it on the lines a pull request changed, not on the whole workspace:

```bash
git diff origin/main...HEAD > changes.diff
cargo mutants --in-diff changes.diff --package quayside-core
```

`logic.rs` and `update.rs` are where this pays off most. They are pure, so their tests run in microseconds, and a surviving mutant there is a business rule nobody checks. A surviving mutant is fixed with a test, never with an exclusion.

### 14.4. Property tests for `update`

An `update` test checks one script of messages. A property test checks thousands of random scripts against rules that must always hold. With `proptest`, generate a sequence of `Msg` values and assert the invariants of the state after every step:

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

`messages(n)` is a strategy of the test module that builds random `Msg` values, and `Msg::generation()` is a small helper that returns the generation a message carries. The leak from section 20.2 is exactly the kind of bug such a test finds on its own: no one has to think of the order of messages that causes it.

### 14.5. A test through the entry

The sentence a person sees is proved through the entry: the real command and a real `AppState`, without a window. Tauri's `test` feature has a mock runtime that runs a command the way the window does. The test is a module of the `app` crate's `tests/it` and registers the commands it calls:

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

`support::app_state()` assembles `AppState` on a temporary folder, `support::invoke` builds the `tauri::webview::InvokeRequest` with `tauri::test::INVOKE_KEY`, and `support::english` looks the key up in the same translation file the front-end uses. A test that stops at `messageKey` proves only the mapping; the sentence is the proof.

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
| only `app` knows Tauri | `Cargo.toml` (no `tauri` dependency elsewhere); `cargo-deny` for transitive dependencies (16.5) |
| tiers depend only downward | `Cargo.toml` |
| only `store` opens database connections | `checks/slat-writer.sh`: `Connection::open` only in the `store` crate, which hands out the one writer and the read connections. A slice's `store.rs` receives them and uses `rusqlite` types, so the dependency alone is not enough. |
| `#[tauri::command]` only in `app/**/commands.rs` | a grep check |
| every command is registered | a check comparing commands in slices with `generate_handler!` |
| `emit` only in `app/**/events.rs` | a grep check |
| no deep imports between slices | a check for `crate::<a>::<layer>::` from another slice |
| no `static` with state in `core` | a grep check for a `static` with `Mutex`, `RwLock` or an atomic type |
| no lock inside an actor | a grep check: no `Mutex` or `RwLock` under `actor/` |
| `logic.rs` and `update.rs` have no I/O | a check: no `async`, `tokio::`, `std::fs`, `store::`, `drivers::` in `logic.rs`, `logic/` and `update.rs` |
| a slice's `mod.rs` holds only `mod …;` and `pub use …;` | a check on every `mod.rs` under `core/src/` |
| no cycles between slices | a check that builds the slice graph from imports and sorts it |
| a Tauri command has at most 10 lines | a check on `app/**/commands.rs` |
| no `unwrap()` and `panic!` outside tests in `kit`, `store`, `drivers`, `core` | Clippy lints `unwrap_used` and `panic` (16.5) |
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

### 16.2. A check must be able to fail

Before you trust a check, plant a real violation, watch it turn red, and remove it. A check that has never been red has never been tested.

The grep checks in SLAT look for forbidden code, so a match inside a comment turns them red, not green. That is annoying but safe, and the fix is to delete the dead code. A check that reads the syntax tree (16.5) does not have this problem. The dangerous kind is a check that requires a string to be present: it passes on a comment. Prove a rule like that by running code, not by reading text.

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
      - uses: Swatinem/rust-cache@v2
      - run: cargo check --workspace --exclude quayside --all-targets
```

Pin action versions to full commit hashes in a real repository. The job only compiles; it runs no tests on platforms the product does not support yet, so it is cheap. The cache step keeps it cheap: without it, every pull request compiles all dependencies from nothing on two operating systems.

### 16.4. Checks for the whole set

| Check | Rule |
|---|---|
| `checks/slat-commands.sh` | `#[tauri::command]` only in `src-tauri/src/**/commands.rs` |
| `checks/slat-registered.sh` | every command in a slice appears in `generate_handler!` |
| `checks/slat-emit.sh` | `emit` only in `src-tauri/src/**/events.rs` |
| `checks/slat-writer.sh` | `Connection::open` only in `crates/*-store` |
| `checks/slat-deep-imports.sh` | no `crate::<slice>::<layer>::` from another slice |
| `checks/slat-static-state.sh` | no `static` with `Mutex`, `RwLock` or an atomic type in `crates/*-core*` |
| `checks/slat-actor-lock.sh` | no `Mutex` or `RwLock` under `actor/` |
| `checks/slat-pure.sh` | `logic.rs`, `logic/` and `update.rs` without `async`, `tokio::`, `std::fs`, `store::`, `drivers::` |
| `checks/slat-slice-mod.sh` | a slice's `mod.rs` holds only `mod …;` and `pub use …;` |
| `checks/slat-edges.sh` | prints the slice graph, one `<slice> <imported slice>` per line |
| `checks/slat-slice-cycles.sh` | no cycles between slices |
| `checks/slat-command-size.sh` | every `#[tauri::command]` has at most 10 lines |
| `checks/slat-platform.sh` | the prohibitions from 12.3 outside `platform/` |
| `checks/slat-size.sh` | files over 1,500 lines from the baseline may only shrink |

The cycle check needs no graph library. `checks/slat-edges.sh` prints the slice graph: every `crate::<other>` inside `core/src/<slice>/` is an edge, including grouped imports such as `use crate::{run::Run, plan::Plan};`, also when they span several lines. A nested group (`crate::{run::{Run, Step}, plan}`) loses the names after its inner group; that is where an `ast-grep` rule (16.5) takes over.

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

`tsort` reports a graph with a loop on its error output. `checks/slat-slice-cycles.sh`:

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

The same list of edges is the slice graph that section 22.4 uses to find the slices a change can affect.

### 16.5. Lints and bans before scripts

Some rules need no script, because a tool the workspace already runs can enforce them.

**Clippy, per tier.** Clippy reads `clippy.toml` from the crate's own folder first, so each tier can forbid different things. Lints are switched on in `Cargo.toml`:

```toml
[workspace.lints.clippy]
unwrap_used = "deny"
panic = "deny"
```

```toml
[lints]
workspace = true
```

The first block goes into the workspace root, the second into `kit`, `store`, `drivers` and `core`. The `app` crate does not inherit them. A `clippy.toml` in the workspace root with `allow-unwrap-in-tests = true` and `allow-panic-in-tests = true` keeps tests readable. A `clippy.toml` in a crate's folder replaces the one in the root, so it repeats those two lines. A `clippy.toml` in `core` can list `disallowed-types`, for example `std::process::Command`, so that a process started from a slice is a lint error, not a grep match. Do not list `std::sync::Mutex` there: a cache that belongs to a slice's service (9.1) needs a short lock, never held across an `await`. The lock that must not exist, one inside an actor (9.3), is caught by `checks/slat-actor-lock.sh`.

**`cargo-deny`, for the whole dependency graph.** `Cargo.toml` stops `use tauri::…` in `core`, but not a library that pulls `tauri` in through the back door. That leak is invisible in review, and it makes the tests of `core` compile the heaviest part of the application. `cargo-deny` checks the whole graph. In `deny.toml`:

```toml
[bans]
deny = [
  { crate = "tauri", wrappers = ["quayside", "tauri-plugin-shell", "tauri-plugin-dialog"] },
]
```

`tauri` may then appear only as a direct dependency of the crates in `wrappers`: the `app` crate and the Tauri plugins it uses, which depend on `tauri` themselves. A plugin added to the application joins the list in the same pull request. Any other path to `tauri`, such as a library that `core` uses, is red.

**Syntax instead of text.** The grep checks of 16.4 can be written as `ast-grep` rules. `ast-grep` matches the Rust syntax tree, so a comment or a string never matches, and an import split over several lines (`use crate::run::{logic::plan, model::Run};`) is still one import. A rule file per check, with `files` and `ignores` globs taken from the paths in 16.4, replaces `grep -E`. The baseline list (16.1) stays as it is: the rules produce the list of violations, and the same script subtracts the baseline.

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
Can the user switch it off while the rest keeps working?          → a plugin slice (section 23)
Does it have no domain at all (time, paths, ids, files)?          → kit
```

The first question is about the entry alone: the command, the emit, the listener of an MCP server or of a remote hub. What such an entry does (pairing, encryption, the messages a bridge carries, the rules of a remote session) is domain, and lives in a `core` slice that the entry calls.

## 18. Working with coding agents

SLAT was designed in a team where much of the code is written by coding agents. Agents follow a layout reliably when it is written down, short, and checked by machines. Three things make the difference.

1. **A fixed layout is a free map.** An agent told to "add a filter to transcripts" opens `core/transcript/` and `app/transcript/` without searching. The time an agent spends searching is the time it spends being wrong.
2. **A check beats a sentence in the prompt.** "Do not emit from core" in a prompt is followed most of the time. A red check is followed every time. Write the rule as a check first, and as a prompt line only when it cannot be checked.
3. **The recipes are prompts.** Section 17 is written as numbered steps on purpose: paste the recipe into the task, and the agent produces files in the expected places in the expected order.

Agents also change how a workspace is built. Several agents in several working copies are several cold builds of the same dependencies at once, which is the frozen laptop of section 19.2. Section 22.5 shows how each working copy starts warm without sharing a `target/` folder with another, and section 22.4 how each of them runs only the tests its change can affect.

A section you can copy into your repository's contributor guide (`AGENTS.md`, `CLAUDE.md` or equivalent):

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
| Compile time grows with the number of crates | At most six to eight crates. One heavy build at a time. Measure with `cargo build --timings` before and after each split (22.6). |
| A refactor quietly changes behaviour | `update` tests first, against today's behaviour. Moves and fixes in separate pull requests. |
| A part of the code may not change at all (a critical feature, a frozen area) | It stays where it is and reaches the new layout only through facades. Facades are additive code. |

## 20. Case study: Quayside

Quayside is a **fictional** desktop application, invented for this document. It is loosely modelled on the kind of software we build, but every name, number and file below is made up. Quayside records calls, transcribes them on the device, writes a summary with a local or a cloud model, runs follow-up tasks with coding agents, syncs action items to a shared team board, and has a phone companion that can watch a recording and send a note into it.

It has been built for two years by a small team in a hurry, and it works. It is also a textbook of everything section 1 described.

### 20.1. Before

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

The application state, 11 of its 41 fields:

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

**Step 2: invert dependencies.** The transcriber stops taking an `AppHandle`. It writes words into a bounded channel that `core` owns; `app` pumps the channel into the window. The upload code stops reading `AppState` and receives the two values it needs as arguments.

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

**Step 3: split `app` and `core`.** A workspace with `quayside-core` (no `tauri`) and the existing `src-tauri` as `app`. `lib.rs` in the app keeps `pub use quayside_core::{…};` so every old path still compiles. Proof: planting `use tauri::Manager;` in `core` fails to compile.

**Step 4: `kit`, `store`, `drivers`.** The nine SQLite openings collapse into one writer in `quayside-store`. Recorder, transcriber, model clients and `git` go to `quayside-drivers`. The 23 files with `#[cfg]` become one `platform/` folder with `unix.rs`, `macos.rs` and `unsupported.rs`, and `reveal` becomes a contract:

```rust
pub fn reveal_path(path: &Path) -> Result<(), PlatformError> {
    let status = Command::new("/usr/bin/open").arg("-R").arg(path).status()?;
    status.success().then_some(()).ok_or(PlatformError::Refused("open -R"))
}
```

No shell, no quoting, no injection.

**Step 5: slices.** `handlers.rs` and `utils.rs` are taken apart into slices, smallest first:

```
settings → device → llm → summary → transcript → board → companion → agent → recording
```

**Step 6: `kit::Jobs`.** `transcribing` and `summarizing` (two maps with cancellation tokens) become one `Jobs<TranscriptId>` inside the transcript service and one `Jobs<SummaryId>` inside the summary service.

**Step 7: actors.** Three pieces of state pass the test from 9.1: the recording, the agent runs and the board sync. The recording goes first, with `update` tests written against today's behaviour. The `AtomicBool` disappears; Stop now carries the generation of the recording it means, and the leak from 20.2 becomes a one-line test that stays green forever. The seven `start_recording_*` functions become one:

```rust
pub struct StartRecording {
    pub title: String,
    pub device: Option<DeviceId>,
    pub meeting: Option<MeetingId>,
    pub limit: Option<Duration>,
    pub origin: Origin,
}
```

**Step 8: checks.** Each check from section 16 switches on with its baseline. Most baselines are already empty, because the steps above removed the violations.

### 20.4. After

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
- Build settings from section 22: debug info with `strip = false`, linker, one feature set, `.taurignore`, a compile cache in CI written only from `main`.
- Heavy native libraries in a driver crate that `core` does not depend on (5.3).
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
Because a command that only translates needs no unit test of its own. Ten lines is enough to deserialize, call, and map; it is not enough to hide a decision.

**Does SLAT slow down compilation?**
Splitting into crates usually speeds up incremental builds, because a change in one slice does not rebuild `kit`, `store` or `drivers`. It can slow down a clean build slightly through extra test binaries to link, which is why SLAT caps the number of crates. Section 22 lists the settings that matter more than the number of crates.

**We only ship on macOS. Is section 12 worth it now?**
Yes, the cheap part of it: `kit::paths`, contracts for the few system calls you already have, `unsupported.rs`, and the compile job on Linux and Windows. That costs days now and saves a search through the whole codebase later. The `linux.rs` and `windows.rs` files themselves wait until you decide to port.

**How do coding agents cope with SLAT?**
Well, because the layout is fixed and the important rules are checks, not advice. See section 18.

## 22. Build and test time

*New in version 1.2.*

The largest saving in SLAT comes from section 5: only `app` knows Tauri, so the tests of every other crate never compile Tauri and the web view behind it. The second largest comes from 5.3: a heavy native library lives in a driver crate that `core` does not depend on, so the tests of `core` never compile it either. The rest of the time goes to a few settings and habits, each a line or two of configuration. This section lists them in the order of what they usually save, and ends with the things that make a build start over when it should not.

Measure first. `cargo build --timings` writes an HTML report of every crate's compile time and of how many ran in parallel. Keep the report from before a change and compare.

### 22.1. Where the time goes

- **A library crate is compiled, not linked.** What gets linked is every binary, and in a test run every test binary.
- **Each crate can have three kinds of test binaries:** its unit tests, each file directly in `tests/` (section 14.1 reduces that to one, `tests/it`), and its documentation examples. Since edition 2024, the documentation examples of a crate are built as one binary. A crate with no documentation examples sets `doctest = false` under `[lib]`.
- **A test run below `app` never needs Tauri.** The everyday command is `cargo t` (22.3), which runs every crate except `quayside`. Only the end-to-end tests of section 14 build the `app` crate.
- **A heavy native library costs more than Tauri.** C and C++ sources compiled by build scripts, and machine-learning crates, take most of a clean build and most of the link of every binary that includes them. Section 5.3 keeps them out of the tests of `core`.
- **Debug information is a large share of the link time.** Most of it is never read.

### 22.2. Build settings

In the workspace root `Cargo.toml`:

```toml
[profile.dev]
debug = "line-tables-only"
split-debuginfo = "unpacked"

[profile.dev.package."*"]
debug = false
strip = false
```

Your own crates keep file and line numbers in backtraces; dependencies get no debug information. Raise it back to `debug = true` for one session when you need a debugger.

`strip = false` is not optional on macOS. With `debug = false`, Cargo also strips those units by default, and on macOS 27 the system `strip` damages the dynamic libraries of procedural macros: `serde_derive` can no longer be loaded and a clean build fails. `split-debuginfo = "unpacked"` is written out so that whether `dsymutil` runs after every link on macOS does not depend on the default of a given Cargo version.

The linker matters most for test binaries. On Linux for x86-64, Rust has used `rust-lld` by default since version 1.90. Other Linux targets can use `mold`. On macOS, the linker that comes with Xcode 15 and later is already fast, so leave it alone. On Windows, `rust-lld` is usually much faster than the default linker. In `.cargo/config.toml`:

```toml
[target.aarch64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]

[target.x86_64-pc-windows-msvc]
linker = "rust-lld.exe"
```

**Optimize the dependencies your tests spend their time in.** A dev build compiles every dependency without optimization, including an encrypted database built from C sources, a cipher or a hash function that the tests call millions of times. Optimizing only those packages makes the tests faster and leaves the release build unchanged. In one of our workspaces this took a test run from 170 to 102 seconds:

```toml
[profile.dev.package.libsqlite3-sys]
opt-level = 3

[profile.dev.package.sha2]
opt-level = 3
```

Each line costs one rebuild of that package. Measure the test run before and after, and keep only the packages that moved it.

Remove dependencies nobody uses: `cargo machete` lists them, and each one is compile time for nothing.

### 22.3. One set of features

Cargo builds a dependency once for every distinct set of features it is asked for. Two things in a SLAT workspace ask for different sets:

1. **Different commands.** `cargo test --workspace` unifies the features of all members, `cargo test -p quayside-core` only those that `core` needs. Running both compiles `tokio`, `serde` and the rest twice. `cargo-hakari` fixes this: it keeps a generated `workspace-hack` crate that every member depends on, with the union of all features, so every command builds the dependencies the same way. `cargo hakari generate` updates it, and `cargo hakari verify` in CI fails when someone forgot.
2. **Test features of your own crates.** The `fake` feature of 14.2 and `test-hooks` of section 10 change `drivers` and `core`, so every crate above them is compiled again when the feature switches. Prefer a data seam (14.2), which needs no feature. Where a feature is necessary, every test command switches it on the same way. Put that command in one place, in `.cargo/config.toml`:

```toml
[alias]
t = "nextest run --workspace --exclude quayside --features quayside-drivers/fake --no-tests=fail"
```

Everyone, including agents and CI, runs `cargo t` for the whole suite, and every narrower test command is `cargo t` with a filter added (22.4). A test command with a different list of packages or features is a second build. A workspace that uses only data seams (14.2) drops `--features quayside-drivers/fake` here and in the script of 22.4: an alias that names a feature nobody defines fails.

### 22.4. Run what a change can affect

The fixed layout says which slice a file belongs to, and the slice graph from the cycle check (16.4) says which slices depend on it. Together they give each kind of change its own set of tests:

| What changed | What runs |
|---|---|
| `logic.rs`, `model.rs`, `store.rs`, `service.rs` or `actor/` inside one slice, its `mod.rs` unchanged | the tests of that slice, and `cargo mutants --in-diff` (14.3) |
| a slice's `mod.rs`, its public API | that slice and every slice that imports it |
| a module of `tests/it` | that module |
| `kit`, `store` or `drivers` | every crate that depends on it: `cargo t -E 'rdeps(quayside-store)'` |
| `drivers/src/platform/` | also the contract test (12.5); in CI, the platform job (16.3) |
| only `app` | the end-to-end tests through the entry; nothing in `core` changed |
| `Cargo.toml`, `Cargo.lock`, `.cargo/`, the toolchain file | everything |

A filter chooses which tests **run**, not what is **compiled**: nextest first builds every package that the Cargo options name, then applies `-E`. That is why every row keeps the packages and features of `cargo t` and narrows only with `-E`. The build stays the one that is already in `target/`, and only the run gets shorter. Narrowing the build with `-p` saves compile time only when `cargo-hakari` (22.3) keeps the features the same; without it, `-p` is a second build of the dependencies.

The tests of a slice are easy to select because their names start with the slice: unit tests live in `core/src/<slice>/`, so their names begin with `<slice>::`, and the modules of `tests/it` begin with the slice too (`recording_stops_on_time_limit`). A first version of the selection fits in a short script. It compares the working copy with the point where the branch left `main`, so changes that are not committed yet count too, which is what an agent's loop needs:

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

It is deliberately cautious: a change to any `mod.rs`, to a file at the top of `core/src/` or to the shared test helpers runs all of `core` instead of following the slice graph. Replace that step with the graph when the suite of `core` gets slow.

Selection is for speed, not for proof. Use three levels:

| Where | What runs |
|---|---|
| on your machine and in an agent's loop | the selection above |
| in CI on a pull request | every crate that depends on a changed crate (`rdeps`) |
| on `main`, or in the merge queue | the whole suite |

`--no-tests=fail` (14.1) stays on at every level, so a selection that matches nothing is red, not quietly green.

### 22.5. Many working copies

Coding agents often work in parallel, each in its own working copy. Without care, four agents compile the same dependencies four times at the same moment.

**Every working copy has its own `target/`.** Do not point several copies at one folder, with a symbolic link or with `CARGO_TARGET_DIR`. It looks like a shared cache, but it is a correctness bug. Two copies of the same workspace produce the same artifact names and the same fingerprint entries, so after `build A; build B; build A` Cargo can report copy A as `Fresh` while the library on disk was built from the sources of B. A check then judges someone else's code and reports green. On top of that, branches that differ rebuild each other's crates at every switch.

**Start a new copy warm by cloning, not by sharing.** When the working copy is created, copy the `target/` of the main copy with a copy-on-write clone: `cp -c -R` on macOS (APFS), `cp --reflink=auto -R` on Btrfs or XFS. It takes seconds and no disk space until a file changes. Dependencies stay fresh, and Cargo rebuilds only your own crates, because their sources are newer than what the clone recorded. Measure the first build in a new copy once; it should be close to an incremental build, not a clean one.

**`sccache` is a complement, not the answer.** Set it as the compiler wrapper, in the user's `~/.cargo/config.toml` or in the environment (`RUSTC_WRAPPER=sccache`), and its local cache is shared by every working copy on the machine. It caches the compilation of ordinary library dependencies. It does not cache procedural macros, binaries, `cdylib` crates or your own crates, which Cargo compiles incrementally, and it does not cache linking. Linking the test binaries is what each working copy pays most for, and only 14.1, 22.2 and the clone above reduce it.

Limit how much of the machine one build may take with `CARGO_BUILD_JOBS`, for example half of the cores, so that a second build slows down instead of freezing the machine. The rule of section 19.2 still holds: one heavy build at a time.

### 22.6. CI

- **A cache in every Rust job**, including the platform job of 16.3. `Swatinem/rust-cache` keeps dependencies and the target folder between runs, keyed by `Cargo.lock` and the toolchain.
- **Write the cache only from `main`, read it everywhere.** A pull-request run can read the cache of its own ref and of the default branch, nothing else, so a cache written by one pull request helps only that pull request, while the default branch, where every other pull request looks, stays empty. Set `save-if: ${{ github.ref == 'refs/heads/main' }}` and run the workflow on `push` to `main` as well, so that every merge refreshes the cache and the first run of each pull request starts warm. In one of our repositories that took the first run from 942 to 478 seconds.
- **`CARGO_INCREMENTAL=0`** in CI. Incremental data is large and useless in a fresh run. `Swatinem/rust-cache` sets it for you; with any other cache, set it yourself.
- **The tests below `app` on Linux.** When the only macOS code is in `drivers/src/platform/` and in the native driver crates of 5.3, the tests of `kit`, `store` and `core` need no macOS. Run them on a Linux runner, which starts faster and costs less, and keep the macOS runner for `drivers`, `app` and the contract test.
- **Build once, test in parallel**, when the suite takes longer than a few minutes: `cargo nextest archive` builds the test binaries in one job, and several jobs run their part of them with `--partition hash:1/3`, `2/3`, `3/3`.
- **A timings report on `main`.** `cargo build --timings` as an artifact of every build of `main`. When the bar of `core` keeps getting longer after a change to a single slice, that is the measurement section 5.3 asks for before a split.
- **`cargo hakari verify`** and **`cargo deny check`** next to the checks of section 16. Both take seconds.

### 22.7. What makes a build start over

A build that starts over for no visible reason almost always has one of these causes:

- **A build script without `rerun-if-changed`.** A `build.rs` that prints no `cargo:rerun-if-changed` runs again after a change to any file of its package, and everything that uses its output is compiled again. Print one line per input. A script that compiles helper programs (Swift, C) lists their sources. Never list a path that does not exist: Cargo treats it as changed on every build.
- **`tauri dev` watching its own output.** The development server rebuilds the app when a file in `src-tauri/` changes. A database, a log or a generated file that the app writes there restarts the build in a loop. Runtime data belongs under `kit::paths` (12.4); generated files go into `.taurignore`.
- **The editor and the terminal in one folder.** rust-analyzer runs `cargo check` with its own settings. In the same `target/`, the editor and the terminal or an agent wait for each other's lock and can invalidate each other's work. Give the editor its own folder: `"rust-analyzer.cargo.targetDir": true`.
- **Different environments.** `RUSTFLAGS`, and the variables that build scripts read (`MACOSX_DEPLOYMENT_TARGET`, `CC`, `CFLAGS`), are part of what Cargo compares. If the terminal, the editor and an agent's shell set them differently, every switch between them rebuilds. Put them in `.cargo/config.toml` (`[env]`, `[build] rustflags`), not in shell profiles.
- **A moving toolchain.** A new compiler rebuilds everything. Pin the full version in `rust-toolchain.toml`, three parts (`1.98.1`): a two-part channel picks up every new patch release without a change in the repository.

### 22.8. Clean `target/`

Cargo never deletes old artifacts. Every branch, feature set and dependency version leaves files behind, and with hundreds of thousands of files in `target/` every Cargo command gets slower. In one of our workspaces `cargo clean` removed about 960,000 files (119 GiB). A full build of the library and its tests went from 7–8 minutes to 36 seconds, and `cargo clippy --all-targets` from several minutes to 8 seconds.

Make it a rule, not a rescue: when `target/debug/deps` passes a few tens of thousands of files, or `target/` passes a few tens of gigabytes, run `cargo clean` and accept one cold build. `cargo sweep --time 30` is the gentler option: it removes only the artifacts not used for 30 days. A working copy that is removed takes its `target/` with it.

## 23. Plugins

*New in version 1.3. Optional.* A product that does not need plugins skips this section. No other section depends on it, and a workspace without plugins follows SLAT in full.

A plugin is a feature the user can switch on or off while the rest of the product keeps working the same way. It lets a product stay small by default and grow by choice. In SLAT a plugin is not a new kind of code. It is one slice, or a few, with a manifest and one more rule about the direction of imports. Every plugin is compiled into the application: switching one off means it is not assembled at start, not that it is missing from the build.

:::diagram plugins

### 23.1. When a feature is a plugin

Make a feature a plugin only when **all three** are true:

1. the product is useful without it;
2. switching it off loses no data and breaks no other feature, except the plugins that declared they need it;
3. the user decides, not the build, the platform or the release channel.

| Candidate | 1 | 2 | 3 | Verdict |
|---|---|---|---|---|
| sync of action items to a team board | yes | yes | yes | plugin |
| phone companion | yes | yes | yes | plugin |
| recording | no, it is the product | — | — | base slice |
| a feature still being tested by the team | yes | yes | no, the team decides | a setting, not a plugin |
| a menu that exists only on macOS | — | — | no, the platform decides | section 12 |
| a build with extra logging | — | — | no, the build decides | a Cargo profile |

This section uses two words for the slices in `core`. A **base slice** is always on. A **plugin slice** belongs to a plugin. Both live in the `core` tier: "base" says something about the product, "core" about the crate.

### 23.2. Layout

A plugin slice has the layout of section 6 and one more file in each tier:

```tree
core/src/<plugin>/
  plugin.rs     the manifest: id, what it needs, whether it starts on
  hooks.rs      its answers to the hooks of base slices, 23.4
  mod.rs  model.rs  logic.rs  store.rs  service.rs  actor/
app/src/<plugin>/
  mod.rs  commands.rs  dto.rs  events.rs
```

A plugin with several slices keeps its manifest in the slice that carries its name, and the others are that slice's sub-slices (6.1).

The manifest is a constant:

```rust
pub const PLUGIN: Plugin = Plugin {
    id: PluginId("board"),
    needs: &[PluginId("account")],
    on_by_default: false,
};
```

`Plugin`, `PluginId`, the file that remembers which plugins are on, and the decision which plugins can be on together belong to one base slice, `core/src/plugin/`. It has the usual files and no `plugin.rs`, because it is not a plugin itself. Only `app` lists every manifest, because only `app` may know every slice. The list lives in `app/src/plugins.rs`:

```rust
pub const PLUGINS: &[Plugin] = &[account::PLUGIN, board::PLUGIN, companion::PLUGIN];
```

### 23.3. Direction

The rule that makes plugins work: **a base slice never imports a plugin slice.**

| From | May import |
|---|---|
| a base slice | other base slices |
| a plugin slice | base slices; another plugin slice only when that plugin is in its `needs` |
| `app` | everything |

A base slice does not name a plugin either: no `if on.contains("board")`, no plugin id in a string. When the base needs a plugin's help, it offers an extension point (23.4) and does not know who answers. With every plugin off, the base compiles, starts and passes its tests (23.8). That is what makes "off" honest. Hiding a button while the base still calls the plugin's code is not off.

`needs` has no cycles, for the same reason as 7.2.

### 23.4. Extension points

A plugin reaches the base in three ways. Prefer them in this order.

**1. Listen.** The base already publishes what changes, through its `Snapshot` or `Event` channel (8.3). A plugin subscribes in its own service or actor, and the base does not change at all. Example: the board plugin subscribes to finished summaries and turns their action items into cards.

**2. Answer a hook.** When the base must ask something at a point in its own flow ("is there anything to add to this summary?"), the base slice declares a hook in its `hooks.rs`, and each plugin answers it in its own `hooks.rs`:

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

The base slice's service receives its hooks when `app` assembles it, as `Vec<Arc<dyn SummaryNotes>>`, and asks each of them. With the plugin off, the list is empty and the base does what it did before plugins existed.

Three rules for hooks:

- **A hook answers with data, at once, without I/O.** It is not `async`. A plugin that needs the network or a process to answer keeps the answer ready in its own service or actor (here, the latest snapshot of cards), and the hook reads it. The base never waits for a plugin, so a slow plugin cannot slow the base down.
- **A hook does not decide for the base.** It returns material, and what to do with it is a decision in the base slice's `logic.rs`. A hook that could refuse something (an access gate, a budget) is policy, and policy is a base slice (6.5): plugins add rules to it as data, and the base slice decides.
- **A hook trait is the one trait allowed with a single implementation.** Section 4 and 14.2 forbid a trait until there are two implementations, because until then it abstracts nothing. A hook is different: without it the base would have to import the plugin. Every hook trait sits in a `hooks.rs`, so the exception is easy to find and to check (23.10).

**3. Own the entry.** The plugin's commands, DTOs, events and doors live in `app/src/<plugin>/`, like those of any other slice. The base never calls them.

### 23.5. On and off

- **One build.** A plugin is not a Cargo feature. A feature per plugin makes every combination of plugins a separate build and a separate set of tests (22.3), and a user cannot switch a feature.
- **The choice is a file.** The `plugin` slice keeps the set of plugins that are on in a file under `kit::paths::config()` and reads it once at start. A missing file means every plugin has its `on_by_default`.
- **`app` assembles only what is on.** An off plugin has no service, no actor, no hook and no event loop. Its field in `AppState` says so, in the same shape as the account in section 11:

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

`on.start` returns `Err(PluginOff)` without calling the closure when the plugin is off.

- **The commands of an off plugin stay registered.** `generate_handler!` is fixed when the application compiles, so the command exists and answers. `From<PluginOff> for IpcError` (section 13) gives the window the code `plugin_off`, and the command still has one line of logic: `state.boards.as_ref()?.send(…)`.
- **A change takes effect on the next start**, and the window says so in one sentence. Switching live means the registry of plugins becomes an actor (it passes all three questions of 9.1) and every hook list can change while the base runs. Do it only when a restart is a real problem.
- **Off never deletes.** The plugin's files stay where they are, its tables stay in the schema, and the migrations of every plugin run whether it is on or not, so the schema is the same for every combination. Removing a plugin's data is a separate action that the user asks for.
- **`needs` is a pure function.** `plugin::logic::resolve(manifests, wanted)` returns the set of plugins that may be on, or the need that is missing. Switching on a plugin whose need is off, or switching off a plugin that another one needs, is refused with a sentence that names the other plugin. The user switches both.

### 23.6. Front-end

SLAT does not prescribe the front-end (1.2), only the boundary, and a plugin crosses it like any other slice. The `plugin` slice has a query, `plugin_list`, that returns every manifest with its state, and the front-end shows a plugin's screens only when it is on. The front-end folder of a plugin has the plugin's name, as in section 6. A screen of an off plugin is not rendered at all; rendering it and hiding it with a style is not off.

### 23.7. A plugin in its own crate

When a plugin is heavy to compile (5.3), or you want the compiler instead of a check to guard 23.3, move it into `<product>-plugin-<name>`. It depends on `core`, `core` does not depend on it, and `app` depends on both. The rule of 23.3 is then written in `Cargo.toml`, as in 5.1, and `wrappers` in `deny.toml` (16.5) keeps every other crate away from it. It counts toward the six to eight crates of 5.3, so do it for a heavy plugin, not for every plugin.

### 23.8. Testing

| What | How | What counts as proof |
|---|---|---|
| the base without plugins | `AppState` assembled with every plugin off; the end-to-end tests of the base | the sentences a person sees in the base, unchanged |
| `plugin::logic::resolve` | a plain `#[test]` | the set of plugins, or the missing need |
| a plugin's hook | a plain `#[test]` on its implementation, with a snapshot value | the returned data |
| a base flow with a hook | the base service with a hook written in the test module | the base used what the hook returned |
| a command of an off plugin | through the entry | the sentence the window shows for `plugin_off` |

The hook written in a test module is the second implementation of the hook trait, so a hook is the easiest kind of extension point to test.

### 23.9. Turning an existing slice into a plugin

1. **Measure.** Take the edges from the cycle check of 16.4 and list every base slice that imports the candidate. Those edges are the baseline of the plugin check (16.1).
2. **Invert each edge**, one pull request at a time: the base publishes and the plugin listens (the first choice), or the base declares a hook and the plugin answers it. Moves and fixes stay in separate pull requests (19.2).
3. **Add the manifest**, its line in `PLUGINS`, and the `Result<…, PluginOff>` field in `AppState`. Set `on_by_default: true`, so that people who use the feature today keep it.
4. **Prove it.** When the baseline is empty, run the tests of the base with every plugin off (23.8). Only then may the plugin be switched off.

### 23.10. Enforcement

| Rule | Who enforces it |
|---|---|
| a base slice never imports a plugin slice | `checks/slat-plugins.sh`, below; or `Cargo.toml` for a plugin in its own crate (23.7) |
| a plugin slice imports another plugin only when it is in its `needs` | the same check, against the `needs` of the manifests |
| no plugin id in a base slice | a grep check for `PluginId(` in base slices outside `core/src/plugin/` |
| a trait in `core` with a single implementation is a hook in a `hooks.rs` | an `ast-grep` rule for `trait` items in `core` outside `hooks.rs` (16.5), with a baseline; every trait on the list has two implementations (14.2) |
| every manifest is in `PLUGINS` | a check that compares the folders with a `plugin.rs` with `app/src/plugins.rs`, like `slat-registered.sh` |
| the base works with every plugin off | the test from 23.8, in CI |

Plugin slices are the folders that have a `plugin.rs`. The check reuses `checks/slat-edges.sh` from 16.4:

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

While a slice is being turned into a plugin (23.9), the check subtracts its baseline, as in 16.1.

### 23.11. Plugins from outside

Code written by someone else and loaded while the application runs is outside SLAT. Rust has no stable binary interface, and code loaded into the process can take the whole application down with it. An extension from outside runs as its own process and talks to the application through an entry in `app/src/doors/`, for example an MCP server, with the same rules as any other entry. Inside the application it is an entry, not a plugin.

## 24. Version history

| Version | Date | Changes |
|---|---|---|
| 1.3 | 25 October 2026 | Section 23, *Plugins*, optional: when a feature is a plugin, the manifest in `plugin.rs`, base slices that never import plugin slices, three extension points (listen, answer a hook, own the entry), hooks as the one trait allowed with a single implementation, one build with the choice in a file read at start, `Result<…, PluginOff>` in `AppState`, the front-end boundary, a plugin in its own crate, tests with every plugin off, turning an existing slice into a plugin, `checks/slat-plugins.sh`, and extensions from outside as entries. Vocabulary: plugin, base slice, hook. The decision tree (17.8) and the section for the contributor guide (18) mention plugins. The version history moves from section 23 to section 24; sections 1 to 22 keep their numbers. Corrections: the everyday test command in 22.1 is `cargo t`; `unwrap()` and `panic!` are forbidden in `kit` too (13, 16); a service's cache may hold a short lock, a lock inside an actor is caught by a new check (16.4, 16.5); `kit::paths` picks an older path by whether it exists, not by the operating system (12.4); file names before code blocks instead of comments inside them; the workspace tree in 5 is a shortened shape; data seams in the testing table (9.5, 14); *Command* and *Tauri command* told apart (3); the entry and the domain behind it told apart (17.8); a slice's errors map to `IpcError` in its own `dto.rs` (6.2, 7.1, 13); `store` hands out read connections, with a check (5, 16); checks follow sub-slices (16.1, 16.4); `checks/slat-edges.sh` sees grouped imports (16.4, 23.10); the example actor in 9.4 is complete (`Deps`, `execute`, `Snapshot`, `mod.rs`, `Failed`) and sends a snapshot only when it changed; `StartRequest::new` instead of `Default` (10); new subsection 14.5, a test through the entry. |
| 1.2 | 25 October 2026 | Section 22, *Build and test time*: where compile time goes, build settings (including `strip = false` and optimized test dependencies), one feature set, running the tests a change can affect, a separate `target/` for each working copy started from a copy-on-write clone, CI with a cache written only from `main`, what makes a build start over, and cleaning `target/`. Heavy native drivers in a crate that `core` does not depend on (5.3). New subsections 14.3 (mutants in the diff), 14.4 (property tests for `update`) and 16.5 (Clippy, `cargo-deny`, `ast-grep`). Checks for rules that had none: purity of `logic.rs`, a slice's `mod.rs`, slice cycles, the 10-line command, `unwrap()` and `panic!`. Data seams preferred over a `fake` feature. Corrected the cost of a crate (5.2, 5.3), `resolver = "3"` for edition 2024 (5.1), the cache step in the platform job (16.3). The version history moves from section 22 to section 23; sections 1 to 21 keep their numbers. |
| 1.1 | 25 October 2026 | Section 12, *Platforms*: the `platform/` folder in `drivers`, platform contracts, prohibitions outside `platform/`, rules for paths, files and text, platform tests, CI compile job on Linux and Windows, porting recipe. Additions to tiers, enforcement, recipes and the decision tree. |
| 1.0 | 24 October 2026 | First version: tiers, slices with fixed layers, import rules, data flows, actors, the application state as composition root, errors, testing, size limits, enforcement, recipes and migration. |

SLAT is versioned like a library. A new rule raises the minor version when it arrives with a baseline list: today's code stays compliant and only new violations are red. That is how 1.1 added the platform rules. A change that makes compliant code non-compliant with no baseline to absorb it, such as renaming the files of a slice or reversing a dependency, raises the major version. Corrections that change no rule keep the version. Every repository that follows SLAT names the version it follows in its contributor guide.
