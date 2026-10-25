SLAT ist ein Muster für den Aufbau des Backends einer Desktop-Anwendung in Rust, mit Tauri als Fensterschicht. Es beantwortet drei Fragen, die jede wachsende Codebasis früher oder später falsch beantwortet: **Wohin gehört diese Datei?**, **Wer darf wen importieren?** und **Wie fließen Daten** zwischen Fenster, Domäne und Außenwelt?

Der Name nennt die vier Bausteine: **S**lice, **L**ayer, **A**ctor, **T**ier. Jede Regel in diesem Dokument betrifft einen davon.

Diese Seite ist die vollständige Referenz. Sie ist so geschrieben, dass ein Team, das SLAT noch nie gesehen hat, das Muster in einem neuen Projekt einführen oder ein bestehendes Projekt migrieren kann, ohne uns etwas fragen zu müssen. Sie enthält die Regeln, die Gründe dahinter, Code zum Kopieren, die Checks, die die Regeln durchsetzen, und ein durchgearbeitetes Beispiel, in dem eine unaufgeräumte Anwendung Schritt für Schritt in Form gebracht wird.

Die Abschnittsnummern sind stabil. Ein Repository, das SLAT folgt, hält in `docs/slat/SLAT.md` eine kurze Kopie der Regeln mit denselben Nummern, sodass ein Verweis wie „Abschnitt 17.8“ auf dieser Seite und im Repository dasselbe bedeutet. Weichen die beiden voneinander ab, werden beide am selben Tag korrigiert. Ein neuer Abschnitt kommt direkt vor die Versionshistorie, die immer der letzte Abschnitt bleibt.

> **Version 1.2** · 25. Oktober 2026. Version 1.2 ergänzt Abschnitt 22, *Build- und Testzeit*: wohin die Kompilierzeit in einem SLAT-Workspace geht, welche Einstellungen sie verkürzen wie nur die Tests laufen, die eine Änderung betreffen kann, und was einen Build neu beginnen lässt, obwohl er das nicht sollte. Außerdem bekommt jede Regel des Leitfadens einen Check, auch die Reinheit von `logic.rs`, Zyklen zwischen Slices und der 10-Zeilen-Command. Die vollständige Historie steht in Abschnitt 23.

## 1. Warum es SLAT gibt

Eine Tauri-Anwendung fängt klein an. Es gibt eine `main.rs`, ein paar `#[tauri::command]`-Funktionen, vielleicht eine `state.rs`. Sechs Monate später sieht dasselbe Projekt meist so aus:

- ein oder zwei riesige Dateien enthalten „die Commands“, und die Commands enthalten die gesamte Geschäftslogik;
- der Anwendungszustand ist ein Struct mit dreißig Feldern, die Hälfte davon `Mutex<Option<…>>` und `AtomicBool`;
- einige `static`-Variablen halten weiteren Zustand, der niemandem gehört;
- die Domänenlogik ruft `app.emit(…)` direkt auf, sodass sich nichts ohne Fenster testen lässt;
- Funktionen vermehren sich zu Varianten: `start_with_budget`, `start_with_budget_and_slots`, `start_with_hook`;
- `#[cfg(target_os = "macos")]` ist über die ganze Codebasis verstreut;
- neue Entwicklerinnen und Entwickler oder ein Coding-Agent brauchen einen Tag, um herauszufinden, wo ein Feature liegt.

Nichts davon liegt an schlechten Leuten. Es liegt daran, dass es keine gemeinsame Antwort auf die Frage „Wohin gehört das?“ gibt. Ohne Antwort gewinnt die nächstgelegene Datei, und die nächstgelegene Datei ist immer die größte.

SLAT gibt diese Antwort einmal, für jede Art von Code, und macht die wichtigen Teile davon **mechanisch**: Der Compiler und eine Handvoll kleiner Skripte lehnen Code ab, der die Struktur verletzt. So übersteht die Struktur Deadlines, neue Teammitglieder und Coding-Agenten.

SLAT ist für ein Rust-Backend, was Nx mit NgRx für ein Frontend ist: ein Satz von Regeln, der von keiner einzelnen Anwendung abhängt. Wir setzen es in jedem MonoOne-Produkt mit Rust- und Tauri-Backend ein, darunter RigOne und IndexOne.

### 1.1. Ziele

1. **Auffindbarkeit.** Wer den Namen eines Features kennt, ob Mensch oder Agent, kennt auch den Ordner, in dem es liegt, auf beiden Seiten der Anwendung.
2. **Testbarkeit ohne Fenster.** Alles außer der dünnen Einstiegsebene kompiliert und führt seine Tests ohne Tauri, ohne Bildschirm und ohne echte Prozesse aus.
3. **Grenzen, die der Compiler durchsetzt.** Die Abhängigkeitsrichtung steht in `Cargo.toml`, nicht in einem Wiki.
4. **Ein Besitzer für langlebigen Zustand.** Hintergrundarbeit (ein Lauf, eine Aufnahme, eine Unterhaltung) hat genau einen Besitzer, und ihre Regeln sind eine reine Funktion.
5. **Günstiges Wachstum.** Ein neues Feature ist ein neuer Ordner mit einem festen Satz von Dateien, keine Änderung an fünf gemeinsam genutzten Dateien.
6. **Portierbarkeit durch Konstruktion.** Code, der vom Betriebssystem abhängt, liegt in einem Ordner. Eine neue Plattform ist also eine neue Datei, keine Suche durch das ganze Repository.

### 1.2. Nicht-Ziele

- SLAT schreibt Ihr Frontend nicht vor. Es legt nur den Vertrag an der Grenze fest: Commands, Datentransferobjekte (DTOs) und Events.
- SLAT ist kein Framework. Es gibt kein Crate, von dem Sie abhängen. Es ist eine Struktur, ein Satz von Regeln und ein paar Skripte.
- SLAT ersetzt nicht die eigenen Regeln Ihres Repositorys. Wenn eine Projektregel und SLAT sich widersprechen, **gewinnt die Projektregel**. SLAT sagt, wo etwas liegt; das Projekt sagt, was verboten ist.

### 1.3. Für wen es gedacht ist

SLAT ist für Rust-Desktop-Anwendungen mit Tauri ausgelegt, ab etwa 10.000 Zeilen Backend-Code. Die Ideen lassen sich auf jede Rust-Anwendung mit dünner Einstiegsebene übertragen (eine CLI, ein Daemon, ein Server): Ersetzen Sie „Tauri-Command“ durch „HTTP-Handler“ oder „CLI-Unterbefehl“, und alles andere gilt weiter.

## 2. SLAT auf einer Seite

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

Sechs Sätze zum Merken:

1. **Nur das Crate `app` kennt Tauri.** Alles andere kompiliert und wird ohne Fenster getestet.
2. **Ein Feature liegt in einem Slice, und ein Slice hat feste Dateien.** Sie suchen den Chat? Er liegt in `core/chat/` und `app/chat/`.
3. **Ein Tauri-Command hat höchstens 10 Zeilen**: deserialisieren, eine Funktion des Slice aufrufen, das Ergebnis auf ein DTO abbilden.
4. **Langlebiger Zustand hat einen Besitzer: einen Actor.** Kein `Mutex<Option<…>>` oder `AtomicBool` im Anwendungszustand, kein `static` mit Zustand innerhalb von Slices.
5. **Abhängigkeiten zeigen nach unten.** Ein tieferer Tier importiert nie einen höheren, und der Compiler setzt das durch.
6. **Nur `drivers/src/platform/` kennt das Betriebssystem.** Der Rest fragt nach Konzepten (Prozessgruppe, Secret, Datenordner), nie nach Systemaufrufen.

## 3. Begriffe

| Begriff | Bedeutung | Entsprechung im Frontend |
|---|---|---|
| **Tier** (Stufe) | Eine Art von Crate: `kit`, `store`, `drivers`, `core`, `app`. Tiers sind gestapelt und hängen nur nach unten ab. | Ein Bibliothekstyp in Nx (`type:util`, `type:data-access`, …) |
| **Slice** (Scheibe) | Ein Feature des Produkts, etwa `run`, `chat` oder `skill`. | Ein Domänenordner, `src/sections/<area>` |
| **Layer** (Schicht) | Eine Datei innerhalb eines Slice mit festem Namen und fester Rolle: `model.rs`, `logic.rs`, `store.rs`, `service.rs`. | `feature/`, `ui/`, `data-access/`, `util/` |
| **Actor** (Akteur) | Der einzige Besitzer langlebigen Zustands: `Msg → update → Effect`. | Ein NgRx-Store: Action → Reducer → Effect |
| **Handle** | Die einzige Tür von außen in einen Actor. | `inject(Store)` |
| **Snapshot** | Was das Fenster von einem Actor sieht, veröffentlicht über einen `watch`-Kanal. | `select(…)` |
| **Entry** (Einstiegspunkt) | Ein Weg, auf dem die Außenwelt das Backend aufruft: ein Tauri-Command, ein MCP-Server, eine lokale Bridge, ein Remote-Hub. | Eine Bildschirmkomponente |
| **Query** (Abfrage) | Ein Lesezugriff ohne Seiteneffekte. | Ein Selector |
| **Command** (Befehl) | Eine Zustandsänderung. | Eine Action |
| **Event** (Ereignis) | Das Backend teilt dem Frontend ungefragt mit, dass sich etwas geändert hat. | Ein Push in einen Store |
| **Platform** (Plattform) | Ein Betriebssystem, für das wir bauen: `macos`, `linux`, `windows`. | Ein Browser-Target |
| **Platform Contract** (Plattformvertrag) | Eine Funktion in `drivers::platform`, die auf jedem Betriebssystem dasselbe bedeutet. | Ein Polyfill |

Drei dieser Begriffe verwechselt man leicht, deshalb dieses Bild: **Tiers sind die Stockwerke eines Gebäudes, Slices sind die Wohnungen im Stockwerk `core`, und Layer sind die Zimmer in jeder Wohnung.**

## 4. Woher SLAT kommt

Die Einzelteile von SLAT sind nicht neu. SLAT kombiniert fünf bekannte Ideen und trifft die Entscheidungen, die jede davon offenlässt.

| Idee | Was SLAT davon übernimmt | Was SLAT zusätzlich festlegt |
|---|---|---|
| Layered / Clean Architecture | Abhängigkeiten zeigen zur Domäne; I/O liegt am Rand. | Die Schichten sind **Crates**, also prüft der Compiler die Richtung. Genau fünf Arten. |
| Vertical Slice Architecture | Code wird nach Feature gruppiert, nicht nach technischer Rolle. | Jeder Slice hat **dieselben Dateinamen** mit denselben Rollen. |
| The Elm Architecture, NgRx, Redux | Zustand ändert sich über Nachrichten und eine reine Update-Funktion. | Nur für Zustand, der den Drei-Fragen-Test besteht (Abschnitt 9.1). Effekte kehren als Nachrichten zurück. |
| Functional core, imperative shell | Entscheidungen sind rein; Seiteneffekte werden getrennt ausgeführt. | `logic.rs` und `update.rs` sind per Regel rein, und ein Skript prüft das. |
| Ports and Adapters (hexagonal) | Die Außenwelt wird über eine Schnittstelle erreicht. | Kein Trait, solange es keine zwei Implementierungen gibt. Der Tier `drivers` und die Plattformverträge übernehmen die Rolle der Ports. |

Der Unterschied zu jeder dieser Ideen für sich ist, dass SLAT **vollständig und mechanisch** ist. Jede Art von Code hat genau einen Ort, und die wichtigen Regeln werden von `Cargo.toml` oder von einem Check in der CI durchgesetzt.

## 5. Tiers

Ein SLAT-Workspace hat höchstens fünf Arten von Crates. Sie heißen `<product>-<tier>`, zum Beispiel `quayside-core`.

| Tier | Was hier liegt | Darf abhängen von | Niemals |
|---|---|---|---|
| `kit` | Gemeinsame Typen und Werkzeuge ohne Domäne: Bezeichner, Zeit, Pfade (`kit::paths`), dauerhafte Dateischreibvorgänge, der Basis-Fehlertyp, Logging. | nur externen Bibliotheken | `tauri`, `tokio::process`, SQL, Betriebssystem-`#[cfg]`, irgendetwas aus dem Produkt |
| `store` | Persistenz: die schreibende Verbindung, Migrationen, Schema, Neuaufbau des Index, Datenbankverschlüsselung. | `kit` | `tauri`, Domänenlogik, Prozesse |
| `drivers` | Die Außenwelt: Prozesse, Kommandozeilenwerkzeuge von Anbietern, HTTP, Sidecars. Code, der vom Betriebssystem abhängt, liegt nur in `drivers/src/platform/`. | `kit` | `tauri`, `store`, Domänenlogik |
| `core` | Alle Domänen-Slices: Modell, Logik, Use Cases, Actors. | `kit`, `store`, `drivers` | `tauri` |
| `app` | Einstiegspunkte: Tauri-Commands, DTOs, Events, Einstiegsserver (MCP, Bridge), der Anwendungszustand, `setup`, `main`. | allen anderen Tiers | Domänenlogik (die gehört nach `core`) |

In diesem Dokument sind `core/…` und `app/…` Kurzformen für die Quellordner der beiden Crates. `core/src/<slice>/` ist `crates/<product>-core/src/<slice>/`, und `app/src/<slice>/` ist `src-tauri/src/<slice>/`, der Ordner, den Tauri für das App-Crate anlegt. Die Checks in Abschnitt 16 verwenden die vollständigen Pfade.

### 5.1. Der Compiler ist der Wächter

Die Pfeile zwischen den Tiers stehen in der `Cargo.toml` jedes Crates. Wenn `core` `tauri` nicht als Abhängigkeit führt, ist `use tauri::Manager;` in `core` ein Kompilierfehler. Das ist die stärkste Garantie, die eine Regel haben kann: Sie lässt sich nicht vergessen, nicht im Review übersehen und nicht wegdiskutieren.

Ein minimaler Workspace:

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

### 5.2. Mit wie vielen Crates beginnen

Das Minimum sind zwei: `core` und `app`. Lösen Sie die übrigen Tiers erst heraus, wenn ihr Code bereits existiert und sauber ist, also nichts aus einem höheren Tier importiert. **Ein leeres Crate „für später“ ist verboten.** Es kostet bei jedem Build einen Compiler-Lauf und bei jedem Testlauf eigene Test-Binaries, die gelinkt werden müssen, und bringt nichts.

### 5.3. Wann ein Tier geteilt wird

Wenn `core` über etwa 60.000 Zeilen wächst oder ein vollständiger Rebuild von `core` nach der Änderung eines einzigen Slice lästig wird, verschieben Sie eine Gruppe von Slices nach `core-<group>`, zum Beispiel `quayside-core-run`. Bleiben Sie bei höchstens sechs bis acht Crates. Ein Bibliotheks-Crate wird nicht gelinkt, aber jedes Crate bringt eigene Test-Binaries mit, und jedes davon wird einzeln gelinkt (Abschnitt 22.1). Auf einem Laptop kostet ein eingefrorener Rechner mehr als die Sekunden, die eine feinere Aufteilung sparen würde. Entscheiden Sie nach einer Messung, nicht nach Gefühl: `cargo build --timings` zeigt, ob `core` wirklich der Engpass ist (Abschnitt 22.6).

**Nach Kompiliergewicht teilen, nicht nur nach Zeilen.** Ein Driver, der eine große native oder Machine-Learning-Bibliothek umhüllt (Spracherkennung, eine Inferenz-Runtime, eine aus C-Quellen kompilierte Datenbank), ist oft schwerer als Tauri selbst. Innerhalb von `drivers` würde er in jedes Test-Binary von `core` kompiliert und gelinkt, weil `core` von `drivers` abhängt. Geben Sie einem solchen Driver ein eigenes Crate, `<product>-drivers-<name>`, von dem `core` nicht abhängt. `app` hängt davon ab und übergibt seine Ausgabe über eine Datennaht (14.2) an den Slice, oder der Driver läuft als eigener Hilfsprozess, den `app` startet. Die Tests von `core` kompilieren ihn dann nie. `cargo-deny` sorgt dafür, dass das so bleibt: `{ crate = "quayside-drivers-speech", wrappers = ["quayside"] }` in `deny.toml` (16.5) macht jeden anderen Weg zu diesem Crate rot.

### 5.4. Ausnahme für Kompatibilität

Ein Bibliotheksname, den der Tauri-Bundler oder die Daten der Nutzerinnen und Nutzer bereits kennen (zum Beispiel `quayside_lib` oder ein Ordner im Home-Verzeichnis), bleibt beim Crate `app`. Neue Crates bekommen neue Namen.

## 6. Slices

Ein Slice ist ein Feature des Produkts. Sein Name ist ein Substantiv im Singular in `snake_case`: `recording`, `transcript`, `board`, `trigger`. Nicht `recordings_manager`, nicht `utils`. Wenn das Produkt ein Frontend hat, entsprechen die Slice-Namen den Feature-Ordnern des Frontends, sodass dasselbe Wort den Code auf beiden Seiten findet.

Ein Slice existiert in zwei Tiers: seine Domäne in `core` und sein Einstiegspunkt (Commands, DTOs, Events) in `app`.

:::diagram slice

### 6.1. Ein Slice in `core`

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

Regeln:

- **Eine Datei, die der Slice nicht braucht, existiert nicht.** Ein kleiner Slice kann eine einzige `mod.rs` mit Modell und Service sein, bis er etwa 400 Zeilen überschreitet.
- **Eine wachsende Datei wird zu einem Ordner mit demselben Namen**: Aus `logic.rs` wird `logic/mod.rs` plus `logic/<topic>.rs`. Die Rolle ändert sich nicht, nur die Zahl der Dateien.
- **Ein zu großer Slice teilt sich in Sub-Slices**: Aus `run/` wird `run/start/`, `run/step/`, `run/finish/`, jeweils mit derselben Dateistruktur. Der übergeordnete Slice behält nur eine `mod.rs` mit Re-Exports.
- **`mod.rs` ist die Eingangstür des Slice**, wie `index.ts` einer Nx-Bibliothek. Andere Slices importieren nur darüber.

Eine typische `mod.rs`:

```rust
mod logic;
mod model;
mod service;
mod store;

pub use model::{Transcript, TranscriptId, Word};
pub use service::TranscriptService;
```

### 6.2. Ein Slice in `app`

```
app/src/<slice>/
  mod.rs        `mod …;` and `pub mod commands;` (the command list itself is in lib.rs, 6.4)
  commands.rs   #[tauri::command] functions; at most 10 lines each
  dto.rs        wire types: serde camelCase, #[serde(other)] on enums, From<model>
  events.rs     event names and payloads sent to the window; snapshot subscription loops
```

Der Rest des Crates `app`:

```
app/src/
  main.rs       calls lib::run(); nothing else
  lib.rs        run(): Builder, plugins, setup, generate_handler! with every command, grouped by slice
  state.rs      AppState: the composition root, section 11
  error.rs      entry error → code and text for the window
  platform.rs   optional: window and menu settings that depend on the operating system, section 12.3
  doors/        entries other than the window: MCP server, bridge for agents, remote hub
```

### 6.3. Ein Command, die Referenzform

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

Braucht ein Command ein `if`, eine Schleife oder zwei Aufrufe in den Slice, gehört diese Logik in `service.rs` oder `logic.rs`. Die Grenze von 10 Zeilen ist keine Stilfrage. Ein Command, der nur übersetzt, braucht keinen eigenen Unit-Test, weil seine Logik im Slice getestet wird. Zu beweisen bleibt der Satz, den ein Mensch sieht, und der wird End-to-End über den Einstiegspunkt getestet (Abschnitt 14).

### 6.4. Commands registrieren

`tauri::generate_handler!` braucht den vollständigen Pfad jedes Commands, deshalb führt `lib.rs` eine Liste. Halten Sie sie nach Slices gruppiert, ein Block pro Slice, sodass ein neuer Command eine Zeile neben seinen Nachbarn ist:

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

Ein Command, der in einem Slice existiert, aber in dieser Liste fehlt, kompiliert und tut stillschweigend nichts. Abschnitt 16 enthält einen kleinen Check, der beides vergleicht und fehlschlägt, wenn sie auseinanderlaufen.

### 6.5. Slices benennen

- Ein Substantiv pro Feature, im Singular: `trigger`, nicht `triggers`.
- Der Name der Sache, die Nutzerinnen und Nutzer wiedererkennen, nicht der Technik: `transcript`, nicht `whisper_pipeline`.
- Wenn sich zwei Features immer gemeinsam ändern, sind sie ein Slice. Wenn ein Feature Teile hat, die sich unabhängig ändern, sind es Sub-Slices.
- **Querschnittliche Richtlinien sind ebenfalls ein Slice**: Zugriffsprüfungen, Limits, Budgets und der Schutz von Secrets liegen in `core/<policy>/` (zum Beispiel `core/guard/`), und alle anderen Slices rufen sie auf.

## 7. Wer wen importieren darf

### 7.1. Innerhalb eines Slice

| Datei | Darf importieren | Darf nicht importieren |
|---|---|---|
| `model.rs` | `kit`; das `model` anderer Slices, über deren `mod.rs` | alles mit I/O, `async`, `store`, `drivers` |
| `logic.rs` | `model` | I/O, `async`, `store`, `drivers`, `service` |
| `store.rs` | `model`, das Crate `store` | `drivers`, `service`, `logic` anderer Slices |
| `service.rs` | `model`, `logic`, `store.rs`, `drivers`, die öffentliche API anderer Slices | `tauri`, globalen Zustand |
| `actor/*` | `model`, `logic`, `service`, `drivers` | `tauri`; und `update.rs` zusätzlich kein I/O |
| `app/<slice>/dto.rs` | das `model` des Slice | `service`, `store` |
| `app/<slice>/commands.rs` | die öffentliche API des Slice, `dto`, `AppState` | `store`, `drivers`, `logic` |

### 7.2. Zwischen Slices

- **Nur über `mod.rs`.** Tiefe Pfade wie `crate::run::logic::…` aus einem anderen Slice sind verboten.
- **Keine Zyklen.** Wenn `a` `b` braucht und `b` `a`, wird das gemeinsame Stück ein eigener Slice (meist ein kleines `model` oder ein kleiner Service), und beide hängen davon ab.
- **Eine Richtlinie ist ein Slice, kein Command.** Liegt eine Budgetprüfung in einem Command, muss jeder tiefere Layer, der sie braucht, nach oben importieren. Das ist die häufigste Ursache für Zyklen in Tauri-Anwendungen.

### 7.3. Warum genau diese Linien

Die Importtabelle ist so gebaut, dass das, was teuer zu testen ist (I/O, async, Prozesse), in möglichst wenigen Dateien liegt, und das, was sich zu testen lohnt (Entscheidungen), in Dateien, die nichts davon enthalten. Eine Entscheidung in `logic.rs` wird mit einem einfachen `#[test]` in Mikrosekunden getestet. Dieselbe Entscheidung, vergraben in einem Command, braucht ein Fenster.

## 8. Datenflüsse

:::diagram flows

### 8.1. Query (ein Lesezugriff)

```
window ─invoke─► app/<s>/commands.rs ─► core/<s>/service.rs ─► core/<s>/store.rs
                        ◄── dto.rs ◄──────── model ◄──────────────────┘
```

Ein Lesezugriff geht nicht über einen Actor, es sei denn, er liest den Zustand dieses Actors. Dann liest er den neuesten `Snapshot` aus dem `Handle`, ohne eine Nachricht zu senden.

### 8.2. Command (eine Änderung)

Ohne Hintergrundzustand (eine Einstellung speichern, eine Datei anlegen):

```
window ─invoke─► commands ─► service ─► logic (decision) ─► store / drivers ─► result
```

Mit Hintergrundzustand (ein Lauf, eine Unterhaltung, eine Aufnahme):

```
window ─invoke─► commands ─► Handle.send(Msg)
                                  │
                 actor ◄──────────┘
                   update(&mut State, Msg) -> Vec<Effect>     pure function
                   for e in effects: execute(e)               I/O: drivers, store, timers
                   snapshot.send(State.view())                the window gets a new view
```

### 8.3. Event (Backend → Fenster)

Events werden **nur** aus `app/<s>/events.rs` gesendet. Ein Slice in `core` veröffentlicht Änderungen über einen `watch::Sender<Snapshot>` oder einen `broadcast::Sender<Event>`. `events.rs` abonniert sie und ruft `emit` auf. So weiß `core` nichts vom Fenster, und das Frontend hat genau eine Stelle, von der die Events eines Slice kommen. Event-Namen folgen dem Schema `<slice>:<event>`, zum Beispiel `recording:snapshot`.

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

### 8.4. Datenströme mit hohem Volumen

Manche Slices erzeugen viele kleine Events: Logzeilen, Wörter eines Transkripts, Fortschrittsmeldungen. Senden Sie nicht ein Tauri-Event pro Zeile. Geben Sie dem Slice einen begrenzten Kanal in `core`: einen kleinen Sender-Typ des Slice selbst (zum Beispiel den `WordSink` in Abschnitt 20.3), dessen `send` nie wartet und zurückgibt, was passiert ist, etwa `Sent::Delivered`, `Sent::Dropped` oder `Sent::Closed`. Lassen Sie `app/<s>/events.rs` eine **Pumpe** besitzen, die die Zeilen alle paar Millisekunden gebündelt in einen `tauri::ipc::Channel` schreibt. Der begrenzte Kanal ist der Gegendruck: Ist das Fenster langsam, erfährt der Slice davon (`Sent::Dropped`), statt den Speicher zu füllen, und wenn niemand mehr zuhört (`Sent::Closed`), kann der Slice aufhören. Bündelung, Kanal und Bildrate sind Sache des Einstiegspunkts und bleiben in `app`.

## 9. Actors: Slices mit Zustand

### 9.1. Wann ein Actor sinnvoll ist

Setzen Sie einen Actor nur ein, wenn **alle drei** Bedingungen zutreffen:

1. Der Zustand lebt länger als ein Command-Aufruf.
2. Mehrere Quellen ändern ihn nebenläufig (das Fenster, Prozesse, Timer, das Netzwerk).
3. Das Fenster beobachtet ihn live.

In allen anderen Fällen genügt eine einfache `service.rs`. Nicht jedes NgRx-Feature braucht Effects, und nicht jeder SLAT-Slice braucht einen Actor.

| Kandidat | 1 | 2 | 3 | Ergebnis |
|---|---|---|---|---|
| ein Agentenlauf mit Schritten und Prozessen | ja | Fenster, Prozesse, Timer | ja | Actor |
| eine laufende Aufnahme | ja | Fenster, Audiogerät, Timer | ja | Actor |
| eine Unterhaltung mit einem Modell | ja | Fenster, Modellprozess, entferntes Gerät | ja | Actor |
| einmal einen Entwurf erzeugen und zurückgeben | ja | Fenster (Start/Stopp) | nein, ein Ergebnis | Service + `kit::Jobs` |
| ein Cache für Modellpreise | ja | keine | nein | ein Feld im Service des Slice |

### 9.2. Dateien

```
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

### 9.3. Der Vertrag

- **`update` ist rein.** Es erhält den Zustand und eine Nachricht und gibt eine Liste von Effekten zurück. Jede Geschäftsregel zu diesem Zustand lässt sich ohne tokio, Prozesse oder Datenbank testen.
- **Ein Effekt, der ein Ergebnis liefert, gibt es als neue `Msg` zurück.** Der Actor wartet in seiner Schleife nie auf einen langen Effekt. Ein langer Effekt geht an `tokio::spawn`, und sein Ergebnis kommt über die Mailbox zurück.
- **Abbruch ist eine Nachricht mit einer Generation**, kein Flag: `Msg::Cancel { generation }`. Der Zustand hält `generation: u64`, und eine verspätete Antwort mit einer alten Generation wird in `update` ignoriert. Ein globales `AtomicBool` sickert zwischen Operationen durch; eine Generation nicht.
- **Ein Ergebnis ist ein Wert**: `enum Outcome<T> { Done(T), Cancelled }`, nie `Err(Cancelled)`. Ein Abbruch ist etwas, das der Mensch verlangt hat, kein Fehler.
- **Ein Zeitlimit ist `Effect::StartTimer`, und sein Ablauf ist `Msg::TimedOut`.** Das Beenden eines Prozesses nach einem Zeitlimit übernimmt ein Driver. Ein bloßes `tokio::time::timeout` bricht das Rust-Future ab, nicht den Prozess im Betriebssystem.
- **Kein `std::sync::Mutex` in einem Actor.** Sein Zustand hat einen Besitzer, also braucht er keine Sperre.
- **Ein Actor pro Zustandsinstanz**: einer pro Lauf, einer pro Unterhaltung. Das Verzeichnis der laufenden Instanzen ist selbst ein kleiner Actor oder ein Service mit einer Map von Handles.

### 9.4. Ein vollständiger kleiner Actor

Ein Aufnahme-Actor, der einen Recorder-Prozess startet, ein Zeitlimit durchsetzt und sich stoppen (die Datei bleibt erhalten) oder abbrechen (die Datei wird verworfen) lässt. Alle Typ- und Funktionsnamen sind Beispiele.

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

Eine neue Aufnahme darf starten, sobald nichts läuft, auch nachdem eine frühere gespeichert oder abgebrochen wurde. Der letzte Zweig ist der Sinn der Generationen: Eine Nachricht `Level`, `TimedOut` oder `Ended` aus einer früheren Aufnahme kommt mit einer alten Generation an und ändert nichts.

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

Die Schleife behält für die Ergebnisse ihrer eigenen Effekte nur einen schwachen Sender. Wenn das letzte `Handle` gedroppt wird, gibt `recv` `None` zurück, und der Actor endet, statt ewig zu warten.

Wenn die Reihenfolge der Effekte wichtig ist (zum Beispiel erst speichern, dann benachrichtigen), führen Sie diese Effekte nacheinander in einer einzigen gestarteten Task aus statt in einer Task pro Effekt. Die Regel lautet nur, dass die Schleife selbst nie wartet.

### 9.5. Einen Actor testen

Die meisten Tests starten den Actor gar nicht. Sie rufen `update` direkt auf:

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

Einige wenige Tests steuern den ganzen Actor über sein `Handle`, mit `tokio::time::pause()`, einem Fake-Driver und Assertions auf die Folge der Snapshots.

## 10. Die Explosion der Varianten

Eine Familie von Funktionen wie `start_with_budget`, `start_with_slots`, `start_with_snapshot_hook`, `start_with_budget_and_slots` ist ein Zeichen dafür, dass ein Request-Struct fehlt. Ersetzen Sie die Familie durch eine Einstiegsfunktion und ein Options-Struct:

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

Aufrufer schreiben `StartRequest { workflow, budget: Some(limit), ..Default::default() }`. Eine neue Option ist ein neues Feld, keine neue Funktion und keine neue Zeile in jedem Aufrufer. Einspeisepunkte nur für Tests (`faults`, `hooks`) sind Felder, die nur in einem Test-Build existieren. `cfg(test)` allein deckt nur die eigenen Unit-Tests des Crates ab, deshalb schalten Integrationstests und andere Crates die Felder über ein Feature `test-hooks` ein, dieselbe Idee wie der Fake-Driver in 14.2. Schalten Sie es in jedem Testbefehl auf dieselbe Weise ein (Abschnitt 22.3); sonst kompiliert jeder Wechsel zwischen einem Build mit dem Feature und einem ohne das Crate und alles darüber erneut.

## 11. AppState, die Composition Root

`AppState` setzt die Anwendung zusammen und tut sonst nichts. Er darf enthalten:

- `Arc<…Service>`- und `…Handle`-Werte von Slices;
- schreibgeschützte Konfiguration;
- ein Handle auf den Datenbank-Writer.

Er darf nicht enthalten:

- `Mutex<Option<…>>`, `AtomicBool` oder `Mutex<HashMap<…>>`, die einen Hintergrundprozess beschreiben. Das ist Actor-Zustand und gehört nach `core/<slice>/actor/state.rs`;
- Felder, die ein Detail eines einzelnen Slice sind (Caches, Abbruch-Maps, Warteschlangen).

Auch dürfen Slices keinen Zustand in `static`-Variablen verstecken (`OnceLock<Mutex<…>>`, `LazyLock<Mutex<…>>`). Die einzige Ausnahme ist eine einmal berechnete Konstante (`OnceLock<PathBuf>`), die sich während der Lebenszeit des Prozesses nie ändert.

**Der Test:** Jedes Feld von `AppState` lässt sich mit einem Substantiv aus einem Slice beschreiben („recordings“, „runs“, „account“). Ein Feld, das einen ganzen Satz zur Beschreibung braucht, gehört in einen Slice.

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

### 11.1. `kit::Jobs`: einmalige Hintergrundarbeit

Einen Entwurf erzeugen, zwei Ordner vergleichen oder eine Aufgabe planen: Das läuft im Hintergrund, lässt sich stoppen und liefert ein Ergebnis. Dafür braucht es keinen Actor. Es braucht eine Abbruch-Map, und diese Map gehört dem Service des Slice, nicht `AppState`. `kit::Jobs<K>` ist dafür ein konkreter generischer Typ:

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

`begin` bricht einen früheren Job mit demselben Schlüssel ab, speichert eine neue Generation und gibt einen Guard zurück, der den Eintrag beim Drop entfernt, aber nur, wenn die Generation noch übereinstimmt. Die Sperre wird nur innerhalb dieser zwei kurzen Funktionen gehalten, nie über ein `await` hinweg. Weil `Jobs` ein konkreter Typ und kein Trait ist, verletzt er nicht die Regel gegen Traits mit nur einer Implementierung.

Das ist kein Schlupfloch in den Regeln aus Abschnitt 11. Sie handeln davon, wo Zustand lebt, nicht von seinem Typ. Eine Sperre in `kit::Jobs`, die dem Service eines einzelnen Slice gehört und nie über ein `await` gehalten wird, ist ein privates Detail dieses Slice. Dieselbe Map als Feld von `AppState` ist Zustand, der niemandem gehört.

## 12. Plattformen

*Neu in Version 1.1.*

Ein Produkt erscheint heute vielleicht nur für ein Betriebssystem (zum Beispiel nur für macOS). SLAT ordnet den Code so, dass das nächste Betriebssystem Arbeit in **einem Ordner** ist, keine Suche durch das ganze Repository. Es gibt eine Regel: **Nur `drivers/src/platform/` kennt das Betriebssystem.** Alles andere fragt nach Konzepten (eine Prozessgruppe, ein Secret, der Datenordner, eine Datei öffnen), nie nach Systemaufrufen.

Die Liste der unterstützten Plattformen gehört dem Repository (seinem Leitfaden für Mitwirkende), nicht SLAT.

:::diagram platform

### 12.1. Struktur

```
drivers/src/platform/
  mod.rs          the only platform API: selects a file with #[cfg] and pub use; no logic
  unix.rs         shared by macOS and Linux: process groups, signals, file modes
  macos.rs        Keychain, revealing in Finder, the login shell, …
  linux.rs        only when the port starts: Secret Service, xdg-open, …
  windows.rs      only when the port starts: Job Objects, Credential Manager, ACLs, …
  unsupported.rs  every function returns Err(PlatformError::Unsupported)
```

- Eine Datei für ein Betriebssystem, das das Produkt noch nicht unterstützt, **existiert nicht**, aus demselben Grund, aus dem es kein leeres Crate „für später“ gibt. `unsupported.rs` nimmt ihren Platz ein.
- `unsupported.rs` ist kein toter Code. Dank dieser Datei kompiliert der ganze Workspace außer `app` vom ersten Tag an für jede Plattform. Sickert Systemcode nach `core` durch, wird das zum Kompilierfehler in der CI, nicht zu einer Entdeckung am Tag der Portierung.
- `mod.rs` sieht in jedem Repository gleich aus:

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

Eine Portierung ändert nur diese Liste von `cfg`-Zeilen. Jede Plattformdatei stellt **denselben Satz von Funktionen und Typen mit denselben Signaturen** bereit. Eine fehlende Funktion ist auf dieser Plattform ein Kompilierfehler. Das ist kein Trait: In jedem Build gibt es immer genau eine Implementierung.

### 12.2. Verträge

Jedes Konzept hat einen Vertrag, der auf jedem Betriebssystem dasselbe bedeutet. Nur das Innere unterscheidet sich.

| Konzept | API in `drivers::platform` | macOS | Linux | Windows |
|---|---|---|---|---|
| Prozessgruppe | `ProcessGroup::spawn`, `terminate(grace)`, `proved_dead()` | Prozessgruppen-ID; SIGTERM, Schonfrist, SIGKILL; `kill(-pgid, 0)` liefert `ESRCH` | wie macOS | Job Object; `TerminateJobObject`; im Job sind keine Prozesse mehr |
| Secrets | `secret::read`, `secret::write`, `secret::delete` | Keychain | Secret Service (libsecret) | Credential Manager |
| private Datei und privater Ordner | `fs::write_private`, `fs::create_private_dir` | Modus `0o600` / `0o700` | wie macOS | ACL: nur Besitzer |
| im System öffnen | `open_path`, `reveal_path`, `open_url` | `open`, `open -R` | `xdg-open` | `ShellExecuteW`, `explorer /select,` |
| Benutzerumgebung | `login_env()` | die Login-Shell (der `PATH` einer aus dem Dock gestarteten App ist minimal) | wie macOS | Registry und Prozessumgebung |
| ein Programm finden | `which(program)` | `PATH` | `PATH` | `PATH` plus `PATHEXT` |
| Fakten zur Maschine | `machine::cores`, `machine::memory`, `machine::free_space` | sysctl, statfs | /proc, statfs | System-API |

Regeln für Verträge:

- Eine Vertragsfunktion gibt keine Systemtypen zurück (`pid_t`, `HANDLE`). Sie gibt Typen aus `drivers` oder `kit` zurück.
- **Beweis statt Hoffnung**, auf jeder Plattform: „Der Prozess ist tot“ ist eine festgestellte Tatsache, kein gesendetes Signal.
- Wo ein Betriebssystem nicht leisten kann, was der Vertrag verlangt, gibt die Funktion einen Fehler zurück, der benennt, was fehlt, nie einen stillen Ersatz.

Ein kurzes Beispiel für einen Vertrag und seine macOS-Seite:

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

### 12.3. Was außerhalb von `platform/` verboten ist

| Verboten außerhalb von `drivers/src/platform/` | Stattdessen |
|---|---|
| `#[cfg(unix)]`, `#[cfg(windows)]`, `#[cfg(target_os = …)]` | ein Vertrag aus 12.2 |
| `std::os::unix`, `std::os::windows`, `libc`, `nix`, `windows-sys`, `security-framework` | ein Vertrag aus 12.2 |
| `sh -c`, `bash`, `zsh`, `cmd /c`, `powershell` | `Command::new(program).args(…)`; wenn wirklich eine Shell nötig ist, wählt `platform` sie aus |
| Namen von Systemprogrammen: `open`, `xdg-open`, `security`, `osascript`, `explorer` | `open_path`, `secret::*`, … |
| fest codierte Pfade: `~`, `$HOME`, `/tmp`, `/usr/bin`, `/Applications`, `Library/` | `kit::paths` (12.4) |
| Pfade per String mit `/` zusammensetzen | `Path::join` |
| Dateimodi als Zahlen (`0o600`) | `fs::write_private` |

Die einzige Ausnahme ist `app/src/platform.rs`, für Dinge, die nur Tauri kennt: den Stil der Titelleiste, das Anwendungsmenü, die Aktivierungsrichtlinie des Fensters. Nichts außer Fenstereinstellungen.

### 12.4. Pfade, Dateien und Text

- **Ordner kommen nur aus `kit::paths`**: `data()`, `config()`, `cache()`, `logs()`, `temp()`. Darunter liegt eine Bibliothek, die der Konvention des jeweiligen Systems folgt (macOS `~/Library/Application Support/<App>`, Linux XDG, Windows `%APPDATA%`). Daten, die bereits unter einem älteren Pfad liegen, bleiben auf dem System, auf dem sie angelegt wurden, dort (die Ausnahme für Kompatibilität aus 5.4); auf diesem System gibt `kit::paths` den älteren Pfad zurück, sodass der Code weiterhin nur `kit::paths` fragt. `kit` selbst hat kein `#[cfg]`: Die Konvention des Systems kommt aus der Bibliothek.
- **Dateinamen, die die Anwendung anlegt, sind kleingeschrieben** und unterscheiden sich nie nur durch Groß- und Kleinschreibung. Die Standard-Dateisysteme von macOS und Windows unterscheiden sie nicht; Linux schon.
- **Benennen Sie keine Datei um und löschen Sie keine, die jemand geöffnet hält.** Windows verweigert das. Atomare Schreibvorgänge laufen über `kit::durable_file`, das die Datei schließt, bevor es sie ersetzt.
- **Lange Pfade.** Windows begrenzt Pfade ohne das Präfix `\\?\` auf etwa 260 Zeichen. Halten Sie Arbeitskopien und Laufordner flach; das Präfix fügt `platform` hinzu, nie ein Slice.
- **Text von Prozessen** wird tolerant gegenüber `\r\n` gelesen. Dateien, die die Anwendung schreibt, verwenden `\n`.
- **Ein Pfad, der an das Fenster geht**, ist UTF-8. Ein Pfad, der sich nicht als UTF-8 darstellen lässt, ist ein Fehler, der die Datei benennt, nie ein `unwrap()`.

### 12.5. Plattformtests

- **Der Vertragstest** liegt in `drivers/tests/it/platform_contract.rs`, einem Modul des einzigen Integrations-Targets des Crates (14.1), und ist für jedes Betriebssystem gleich: Ein Prozess ist nach `terminate` tot, ein Secret kommt nach dem Schreiben zurück und ist nach dem Löschen weg, eine private Datei kann von keinem anderen Benutzerkonto gelesen werden. Jede unterstützte Plattform besteht **denselben** Satz.
- **Tests außerhalb von `drivers` verwenden keine Shell und keine Signale.** Ein Prozess, den ein Test braucht, ist ein kleines Rust-Programm (ein Binary in einem Test-Crate), nicht `sh -c 'sleep 10'`.
- Ein Plattform-`#[cfg]` in Tests ist nur in den Tests von `drivers` erlaubt.

### 12.6. Durchsetzung

| Regel | Wer sie durchsetzt |
|---|---|
| die Verbote aus 12.3 | ein Grep-Check mit Baseline-Liste (Abschnitt 16) |
| Crates außer `app` kompilieren auf jeder Plattform | `cargo check --workspace --exclude <app>` auf nativen CI-Runnern für Ubuntu und Windows. Kein Cross-Check von macOS aus: Build-Skripte mit C-Code brauchen den Compiler des Zielsystems. |
| der Vertrag funktioniert | `platform_contract.rs` auf einem Runner für jede **unterstützte** Plattform |

### 12.7. Portierung auf ein neues Betriebssystem

1. `drivers/src/platform/<system>.rs`: jede Funktion des Vertrags. Der Compiler listet auf, was fehlt.
2. `mod.rs`: Das `cfg` des neuen Systems zeigt nicht mehr auf `unsupported.rs`.
3. `platform_contract.rs` ist auf dem Runner dieses Systems grün, und der Runner wird Teil der CI.
4. `app`: Bundle- und Signaturkonfiguration für das System und bei Bedarf `app/src/platform.rs`.
5. Der Leitfaden für Mitwirkende im Repository nimmt das System in die Liste der unterstützten Plattformen auf.

Erfordert eine Portierung eine Änderung in `core`, ist etwas durchgesickert. Dann verschiebt zuerst ein eigener Pull Request das Leck hinter einen Vertrag, danach geht die Portierung weiter.

## 13. Fehler

- **Jedes Crate hat sein eigenes Fehler-Enum** (mit `thiserror`). Ein Slice kann sein eigenes in `error.rs` haben.
- **`core` gibt Domänenfehler zurück.** `app/error.rs` macht daraus einen Code und einen Satz für das Fenster. Der Satz kommt aus Ihrer Übersetzungstabelle, nie aus dem `Display` eines Wire-Enums.
- **Ein unbekanntes Event von der Leitung ist kein Fehler.** Verwenden Sie `#[serde(other)]` auf Enums und `Option<T>` auf Feldern, die nicht unverzichtbar sind. Protokollieren Sie die unbekannte Zeile zur Fehlersuche und machen Sie weiter. Eine neue Version des Kommandozeilenwerkzeugs eines Anbieters darf nie einen Lauf anhalten.
- **`unwrap()` und `panic!` sind** außerhalb von Tests in `core`, `store` und `drivers` **verboten**. Verwenden Sie `?` mit einer Fehlervariante oder `expect()` mit einer Begründung, warum der Wert nicht fehlen kann.

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

## 14. Testen nach Layer

| Layer | Wie testen | Was als Beweis zählt |
|---|---|---|
| `logic.rs`, `update.rs` | ein einfaches `#[test]`, ohne tokio | eine Assertion auf einen Wert oder auf die Liste der Effekte |
| `store.rs` | eine Datenbank in einem temporären Ordner | die Zeile, die ein Lesezugriff zurückliefert |
| `service.rs` | `#[tokio::test]` mit echtem Store und Fake-Driver | der Zustand von Dateien oder der Datenbank nach dem Aufruf |
| `actor/` | ein `Handle` plus ein Skript von Nachrichten; Zeit mit `tokio::time::pause` | die Folge der `Snapshot`s |
| `drivers` | ein echter Prozess oder ein aufgezeichneter Datenstrom | der Prozess ist tot (`ESRCH` oder ein leerer Job), die Zeilen von der Leitung |
| `app/commands` | kein Unit-Test; ein End-to-End- oder Integrationstest über den Einstiegspunkt, für das, was ein Mensch sieht | der Text, den ein Mensch sieht |

Ein Test für eine Meldung, die einem Menschen angezeigt wird, gehört dorthin, wo der Mensch sie sieht, nicht nur nach `logic.rs`. Eine Funktion, die den richtigen Satz erzeugt, beweist nichts, wenn niemand sie aufruft.

### 14.1. Ein einziges Integrations-Binary

Jede Datei direkt in `tests/` ist ein eigenes Binary, und jedes Binary wird separat gelinkt. In einem großen Workspace ist das eine Minute pro Datei. Geben Sie jedem Crate **ein** Integrations-Target, `tests/it/main.rs`, mit einem Modul pro Thema, und führen Sie ein einzelnes Thema mit einem Filter aus:

```
tests/it/
  main.rs          mod recording_stops_on_time_limit; mod transcript_survives_restart; …
  recording_stops_on_time_limit.rs
  transcript_survives_restart.rs
```

```bash
cargo nextest run --test it recording_stops_on_time_limit::
```

Führen Sie das mit `--no-tests=fail` aus, damit ein Filter, der nichts trifft, rot ist statt still grün.

Hilfsfunktionen, die die Tests teilen, sind ein Modul desselben Targets, `tests/it/support/`. Eine Hilfsdatei direkt in `tests/` ist ein weiteres Binary, das gelinkt werden muss.

### 14.2. Ein Fake-Driver ohne Trait

Ein Test braucht einen Driver, der keine echten Prozesse startet. SLAT verbietet einen Trait mit nur einer Implementierung, und ein Fake zählt nicht als zweite echte. Zwei Möglichkeiten halten die Regel ein. Bevorzugen Sie die erste: Ein Feature ändert, wie `drivers` und jedes Crate darüber kompilieren, daher sind ein Test-Build mit dem Feature und ein Anwendungs-Build ohne es zwei getrennte Sätze von Artefakten (Abschnitt 22.3). Eine Datennaht kostet überhaupt keine Kompilierzeit.

- **Eine Datennaht.** Der Service nimmt die *Ausgabe* des Drivers als Wert oder Kanal entgegen, nicht den Driver selbst. Der Test schickt Zeilen in den Kanal.
- **Ein Test-Build.** `drivers` stellt `#[cfg(any(test, feature = "fake"))] pub mod fake;` mit denselben Funktionen wie das echte Modul bereit, und das Test-Crate aktiviert das Feature `fake`.

Wenn eine zweite echte Implementierung auftaucht (ein zweiter Anbieter, eine zweite Plattform), ist der Moment für einen Trait gekommen.

### 14.3. Mutanten im Diff

Ein Test, der besteht, beweist nur dann etwas, wenn er bei falschem Code fehlschlagen würde. Das ist Abschnitt 16.2, angewandt auf Tests. `cargo-mutants` verändert den Code (es kehrt eine Bedingung um, ersetzt einen Rückgabewert, löscht eine Anweisung) und meldet jede Änderung, die kein Test bemerkt hat. Führen Sie es auf den Zeilen aus, die ein Pull Request geändert hat, nicht auf dem ganzen Workspace:

```bash
git diff origin/main...HEAD > changes.diff
cargo mutants --in-diff changes.diff --package quayside-core
```

`logic.rs` und `update.rs` sind die Stellen, an denen sich das am meisten lohnt. Sie sind rein, ihre Tests laufen also in Mikrosekunden, und ein überlebender Mutant dort ist eine Geschäftsregel, die niemand prüft. Ein überlebender Mutant wird mit einem Test behoben, nie mit einer Ausnahme.

### 14.4. Property-Tests für `update`

Ein `update`-Test prüft ein Skript von Nachrichten. Ein Property-Test prüft Tausende zufälliger Skripte gegen Regeln, die immer gelten müssen. Erzeugen Sie mit `proptest` eine Folge von `Msg`-Werten und prüfen Sie nach jedem Schritt die Invarianten des Zustands:

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

`messages(n)` ist eine Strategie des Testmoduls, die zufällige `Msg`-Werte baut, und `Msg::generation()` ist eine kleine Hilfsfunktion, die die Generation zurückgibt, die eine Nachricht trägt. Das Leck aus Abschnitt 20.2 ist genau die Art von Fehler, die ein solcher Test von selbst findet: Niemand muss sich die Reihenfolge der Nachrichten ausdenken, die es auslöst.

## 15. Größengrenzen

| Einheit | Warnschwelle | Was zu tun ist |
|---|---|---|
| Datei | 1.500 Codezeilen (ohne Tests) | in einen Ordner mit derselben Rolle aufteilen, Abschnitt 6.1 |
| Slice | 15.000 Zeilen | in Sub-Slices aufteilen |
| `core` | 60.000 Zeilen | eine Gruppe nach `core-<group>` verschieben, Abschnitt 5.3 |
| Tauri-Command | 10 Zeilen | die Logik nach `service.rs` verschieben |
| Feld in `AppState` | ein Substantiv | siehe Abschnitt 11 |

Dateien, die am Tag der Einführung von SLAT über der Schwelle liegen, kommen auf eine **Baseline-Liste**. Die Liste darf nur schrumpfen.

## 16. Durchsetzung

Erst der Mechanismus, dann die Worte. Eine Regel, die ein Skript prüfen kann, sollte nie davon abhängen, dass sich jemand an sie erinnert.

| Regel | Wer sie durchsetzt |
|---|---|
| nur `app` kennt Tauri | `Cargo.toml` (anderswo keine Abhängigkeit auf `tauri`); `cargo-deny` für transitive Abhängigkeiten (16.5) |
| Tiers hängen nur nach unten ab | `Cargo.toml` |
| nur `store` öffnet die schreibende Verbindung | ein Grep-Check: `Connection::open` nur im Crate `store`. Die `store.rs`-Dateien der Slices verwenden Typen aus `rusqlite`, daher reicht die Abhängigkeit allein nicht. |
| `#[tauri::command]` nur in `app/*/commands.rs` | ein Grep-Check |
| jeder Command ist registriert | ein Check, der die Commands in den Slices mit `generate_handler!` vergleicht |
| `emit` nur in `app/*/events.rs` | ein Grep-Check |
| keine tiefen Importe zwischen Slices | ein Check auf `crate::<a>::<layer>::` aus einem anderen Slice |
| kein `static` mit Zustand in `core` | ein Grep-Check auf `static .*(Mutex|RwLock)` |
| `logic.rs` und `update.rs` haben kein I/O | ein Check: kein `async`, `tokio::`, `std::fs`, `store::`, `drivers::` in `logic.rs`, `logic/` und `update.rs` |
| die `mod.rs` eines Slice enthält nur `mod …;` und `pub use …;` | ein Check auf jede `mod.rs` unter `core/src/` |
| keine Zyklen zwischen Slices | ein Check, der den Slice-Graphen aus den Importen aufbaut und sortiert |
| ein Tauri-Command hat höchstens 10 Zeilen | ein Check auf `app/*/commands.rs` |
| kein `unwrap()` und `panic!` außerhalb von Tests in `core`, `store`, `drivers` | die Clippy-Lints `unwrap_used` und `panic` (16.5) |
| Betriebssystem nur in `drivers/src/platform/` und `app/src/platform.rs` | ein Grep-Check mit der Liste aus 12.3 |
| Crates außer `app` kompilieren auf jeder Plattform | `cargo check` auf CI-Runnern für Ubuntu und Windows |
| Größengrenzen | ein Check mit einer Baseline-Liste, die nur schrumpfen darf |

Jeder Check beginnt mit einer **Baseline-Liste** der heutigen Verstöße. Ein neuer Verstoß ist rot. Ein behobener Verstoß muss im selben Pull Request von der Liste entfernt werden, damit die Liste nie wieder wachsen kann.

### 16.1. Ein Check mit Baseline

Alle Checks folgen derselben Form: Verstöße finden, die Baseline abziehen, bei allem, was übrig bleibt, fehlschlagen, und fehlschlagen, wenn die Baseline etwas aufführt, das bereits behoben ist.

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

### 16.2. Ein Check muss fehlschlagen können

Bevor Sie einem Check vertrauen, bauen Sie einen echten Verstoß ein, sehen Sie zu, wie er rot wird, und entfernen Sie ihn wieder. Ein Check, der nie rot war, wurde nie getestet.

Die Grep-Checks in SLAT suchen nach verbotenem Code, deshalb macht ein Treffer in einem Kommentar sie rot, nicht grün. Das ist lästig, aber sicher, und die Abhilfe ist, den toten Code zu löschen. Ein Check, der den Syntaxbaum liest (16.5), hat dieses Problem nicht. Gefährlich ist ein Check, der verlangt, dass ein String vorhanden ist: Er besteht auch bei einem Kommentar. Eine solche Regel beweisen Sie, indem Sie Code ausführen, nicht indem Sie Text lesen.

### 16.3. Der Plattform-Job in der CI

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

Pinnen Sie in einem echten Repository die Versionen der Actions auf vollständige Commit-Hashes. Der Job kompiliert nur; auf Plattformen, die das Produkt noch nicht unterstützt, führt er keine Tests aus und ist daher günstig. Der Cache-Schritt hält ihn günstig: Ohne ihn kompiliert jeder Pull Request alle Abhängigkeiten auf zwei Betriebssystemen von Grund auf.

### 16.4. Checks für den gesamten Satz

| Check | Regel |
|---|---|
| `checks/slat-commands.sh` | `#[tauri::command]` nur in `src-tauri/src/*/commands.rs` |
| `checks/slat-registered.sh` | jeder Command in einem Slice erscheint in `generate_handler!` |
| `checks/slat-emit.sh` | `emit` nur in `src-tauri/src/*/events.rs` |
| `checks/slat-deep-imports.sh` | kein `crate::<slice>::<layer>::` aus einem anderen Slice |
| `checks/slat-static-state.sh` | kein `static … Mutex|RwLock` in `crates/*-core*` |
| `checks/slat-pure.sh` | `logic.rs`, `logic/` und `update.rs` ohne `async`, `tokio::`, `std::fs`, `store::`, `drivers::` |
| `checks/slat-slice-mod.sh` | die `mod.rs` eines Slice enthält nur `mod …;` und `pub use …;` |
| `checks/slat-slice-cycles.sh` | keine Zyklen zwischen Slices |
| `checks/slat-command-size.sh` | jeder `#[tauri::command]` hat höchstens 10 Zeilen |
| `checks/slat-platform.sh` | die Verbote aus 12.3 außerhalb von `platform/` |
| `checks/slat-size.sh` | Dateien über 1.500 Zeilen aus der Baseline dürfen nur schrumpfen |

Der Zyklus-Check braucht keine Graph-Bibliothek. Jedes `use crate::<other>` innerhalb von `core/src/<slice>/` ist eine Kante, und `tsort` meldet einen Graphen mit einer Schleife auf seiner Fehlerausgabe:

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

Dieselbe Liste von Kanten ist der Slice-Graph, mit dem Abschnitt 22.4 die Slices findet, die eine Änderung betreffen kann.

### 16.5. Lints und Verbote vor Skripten

Manche Regeln brauchen kein Skript, weil ein Werkzeug, das der Workspace ohnehin ausführt, sie durchsetzen kann.

**Clippy, pro Tier.** Clippy liest `clippy.toml` zuerst aus dem eigenen Ordner des Crates, daher kann jedes Tier andere Dinge verbieten. Lints werden in `Cargo.toml` eingeschaltet:

```toml
[workspace.lints.clippy]
unwrap_used = "deny"
panic = "deny"
```

```toml
[lints]
workspace = true
```

Der erste Block kommt in das Workspace-Root, der zweite in `kit`, `store`, `drivers` und `core`. Das Crate `app` erbt sie nicht. Eine `clippy.toml` im Workspace-Root mit `allow-unwrap-in-tests = true` und `allow-panic-in-tests = true` hält Tests lesbar. Eine `clippy.toml` im Ordner eines Crates ersetzt die im Root, deshalb wiederholt sie diese beiden Zeilen. Eine `clippy.toml` in `core` kann `disallowed-methods` und `disallowed-types` aufführen, zum Beispiel `std::process::Command` und `std::sync::Mutex`, sodass ein aus einem Slice gestarteter Prozess oder ein Lock innerhalb eines Actors ein Lint-Fehler ist, kein Grep-Treffer.

**`cargo-deny`, für den ganzen Abhängigkeitsgraphen.** `Cargo.toml` verhindert `use tauri::…` in `core`, aber nicht eine Bibliothek, die `tauri` durch die Hintertür hereinzieht. Dieses Leck ist im Review unsichtbar, und es lässt die Tests von `core` den schwersten Teil der Anwendung kompilieren. `cargo-deny` prüft den ganzen Graphen. In `deny.toml`:

```toml
[bans]
deny = [
  { crate = "tauri", wrappers = ["quayside", "tauri-plugin-shell", "tauri-plugin-dialog"] },
]
```

`tauri` darf dann nur noch als direkte Abhängigkeit der Crates in `wrappers` auftauchen: des Crates `app` und der Tauri-Plugins, die es verwendet und die selbst von `tauri` abhängen. Ein Plugin, das die Anwendung neu aufnimmt, kommt im selben Pull Request auf die Liste. Jeder andere Weg zu `tauri`, etwa über eine Bibliothek, die `core` verwendet, ist rot.

**Syntax statt Text.** Die Grep-Checks aus 16.4 lassen sich als `ast-grep`-Regeln schreiben. `ast-grep` vergleicht mit dem Syntaxbaum von Rust, daher trifft ein Kommentar oder ein String nie, und ein Import, der über mehrere Zeilen verteilt ist (`use crate::run::{logic::plan, model::Run};`), ist trotzdem ein Import. Eine Regeldatei pro Check, mit `files`- und `ignores`-Globs aus den Pfaden in 16.4, ersetzt `grep -E`. Die Baseline-Liste (16.1) bleibt, wie sie ist: Die Regeln erzeugen die Liste der Verstöße, und dasselbe Skript zieht die Baseline ab.

## 17. Rezepte

Jedes Rezept beginnt mit einem Test, der auf dem alten Code fehlschlägt, und zwar an einer Assertion, nicht beim Kompilieren. Schreiben Sie in Rust zuerst die Signatur mit `todo!()`, damit der Test kompiliert und aus dem richtigen Grund fehlschlägt.

### 17.1. Ein neuer Lesezugriff (Query)

1. `core/<s>/model.rs`: der Ergebnistyp, falls er noch nicht existiert.
2. `core/<s>/store.rs`: die Lesefunktion. Testen Sie sie auf einer temporären Datenbank.
3. `core/<s>/service.rs`: `pub async fn <verb>(…)`, die Store und Logik aufruft.
4. `core/<s>/mod.rs`: `pub use` für die neue Funktion oder den neuen Typ.
5. `app/<s>/dto.rs`: das DTO und `From<model>`.
6. `app/<s>/commands.rs`: ein Command mit höchstens 10 Zeilen; registrieren Sie ihn.
7. Frontend: Die Data-Access-Schicht ruft den Command auf.

### 17.2. Eine neue Änderung ohne Hintergrundzustand (Command)

Wie 17.1, und die Entscheidung (ist es erlaubt, was ändert sich) steht in `logic.rs` als reine Funktion mit Test. `service.rs` ruft sie nur auf und führt den Schreibvorgang aus.

### 17.3. Ein neuer Slice

1. Name: das Feature als Substantiv im Singular in `snake_case`.
2. `core/src/<s>/mod.rs` plus nur die Dateien, die er braucht; `pub mod <s>;` in `core/src/lib.rs`.
3. `app/src/<s>/mod.rs`, `commands.rs`, `dto.rs`; registrieren Sie seine Commands.
4. Hat der Slice Hintergrundzustand: Rezept 17.4.

### 17.4. Ein neuer Ablauf mit Zustand (Actor)

1. Prüfen Sie die drei Bedingungen aus 9.1. Ist eine nicht erfüllt: Rezept 17.2.
2. `msg.rs`, `state.rs`, `snapshot.rs`: die Typen.
3. `update.rs`: zuerst die Tests (Nachricht hinein, erwartete Effekte und erwarteter Zustand heraus), dann die Implementierung.
4. `effect.rs`: `execute` für jeden Effekt; Ergebnisse kehren als `Msg` zurück.
5. `run.rs` und `handle.rs`: die Schleife und die Tür.
6. `AppState` bekommt genau ein Feld: das Verzeichnis oder das `Handle`.
7. `app/<s>/events.rs`: den `Snapshot` abonnieren und `emit("<s>:snapshot")`.

### 17.5. Ein neuer Driver (die Außenwelt)

1. `drivers/src/<name>.rs` oder ein Ordner. Ein Driver kennt keine Slices und keine Datenbank.
2. Ein Trait erst, wenn es mindestens zwei Implementierungen gibt.
3. Ein Prozess: Prozessgruppe, Eskalation beim Beenden, Beweis für den Tod; Secrets bleiben aus Argumenten und Logs heraus. Alles über die Verträge von `platform` (12.2), nie über einen Systemaufruf im Driver.
4. Ein Slice nutzt den Driver aus `service.rs` oder aus `effect.rs`.

### 17.6. Ein neues Event für das Fenster

1. Eine Änderung in `core` veröffentlicht einen `Snapshot` oder ein `Event` auf einem Kanal.
2. `app/<s>/events.rs` abonniert ihn und sendet `<s>:<event>`.
3. Frontend: Die Data-Access-Schicht hört zu und aktualisiert ihren Store.

### 17.7. Eine neue Plattform

Abschnitt 12.7.

### 17.8. Wohin gehört das? (Entscheidungsbaum)

```
Ruft es Tauri, das Fenster, MCP oder einen entfernten Hub auf?            → app (commands, events, doors)
Hängt es vom Betriebssystem ab?                                           → drivers/src/platform/ (Abschnitt 12)
Spricht es mit einem Prozess, dem Netzwerk, einem Schlüsselbund?          → drivers (über Plattformverträge)
Ist es ein Lese- oder Schreibzugriff auf die Datenbank oder das Schema?   → store (Verbindung) / core/<s>/store.rs (Abfragen)
Ist es eine reine Entscheidung oder eine Berechnung?                      → core/<s>/logic.rs (oder update.rs in einem Actor)
Ist es ein Domänentyp?                                                    → core/<s>/model.rs
Ist es eine Abfolge von Schritten mit I/O?                                → core/<s>/service.rs
Ist es Zustand, der im Hintergrund lebt und den das Fenster beobachtet?   → core/<s>/actor/
Hat es gar keine Domäne (Zeit, Pfade, IDs, Dateien)?                      → kit
```

## 18. Arbeit mit Coding-Agenten

SLAT ist in einem Team entstanden, in dem ein großer Teil des Codes von Coding-Agenten geschrieben wird. Agenten halten sich zuverlässig an eine Struktur, wenn sie aufgeschrieben, kurz und maschinell geprüft ist. Drei Dinge machen den Unterschied.

1. **Eine feste Struktur ist eine kostenlose Karte.** Ein Agent, der „einen Filter für Transkripte hinzufügen“ soll, öffnet `core/transcript/` und `app/transcript/`, ohne zu suchen. Die Zeit, die ein Agent mit Suchen verbringt, ist die Zeit, in der er falsch liegt.
2. **Ein Check schlägt einen Satz im Prompt.** „Kein emit aus core“ im Prompt wird meistens befolgt. Ein roter Check wird jedes Mal befolgt. Schreiben Sie die Regel zuerst als Check und nur dann als Prompt-Zeile, wenn sie sich nicht prüfen lässt.
3. **Die Rezepte sind Prompts.** Abschnitt 17 ist absichtlich als nummerierte Schritte geschrieben: Fügen Sie das Rezept in die Aufgabe ein, und der Agent legt Dateien an den erwarteten Stellen in der erwarteten Reihenfolge an.

Agenten verändern auch, wie ein Workspace gebaut wird. Mehrere Agenten in mehreren Arbeitskopien sind mehrere kalte Builds derselben Abhängigkeiten gleichzeitig, und das ist der eingefrorene Laptop aus Abschnitt 19.2. Abschnitt 22.5 zeigt, wie jede Arbeitskopie warm startet, ohne sich einen Ordner `target/` mit einer anderen zu teilen, und Abschnitt 22.4, wie jeder von ihnen nur die Tests ausführt, die seine Änderung betreffen kann.

Ein Abschnitt, den Sie in den Leitfaden für Mitwirkende Ihres Repositorys kopieren können (`AGENTS.md`, `CLAUDE.md` oder Gleichwertiges):

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

## 19. Eine bestehende Codebasis migrieren

Sie müssen nichts neu schreiben. SLAT wird in kleinen Pull Requests eingeführt, die die Anwendung die ganze Zeit lauffähig halten, und in einer Reihenfolge, die andere Branches nicht blockiert.

:::diagram migration

### 19.1. Die Reihenfolge

1. **Messen.** Erfassen Sie die Module: Zeilen pro Modul, Importe, die nach oben zeigen, Dateien, die `tauri::` verwenden, die Anzahl von `#[tauri::command]`, `static` mit Zustand, die Felder des Anwendungszustands, `#[cfg]` für Betriebssysteme. Halten Sie das in einem Plan im Repository fest. Diese Zahlen sind Ihre Baselines.
2. **Aufwärts gerichtete Abhängigkeiten umkehren.** Richtlinien, die in der Command-Schicht liegen, aber von tieferen Layern aufgerufen werden, wandern nach unten in `core/<policy>/`. Typen, die sich die Domäne von der Einstiegsebene borgt (ein Zeilenkanal, ein Bildtyp, ein Nachrichten-String), wandern in den Slice, zu dem sie gehören. Der alte Pfad bleibt als `pub use` erhalten, bis die Migration abgeschlossen ist.
3. **`app` und `core` trennen.** Legen Sie den Workspace und ein Crate `core` ohne `tauri` an. Code, der Tauri kennt, bleibt in `app`; alles andere wandert per `git mv`. Das ist der mechanischste Schritt.
4. **`store`, `drivers` und `kit` herauslösen.** Erst wenn ihr Code bereits sauber ist. Wenn Sie `drivers` herauslösen, verschieben Sie Betriebssystem-Code nach `platform/` und geben Sie dem Plattform-Check seine Baseline.
5. **Slice für Slice.** Ein Slice pro Pull Request: Commands nach `app/<s>/`, Logik nach `core/<s>/` in der festen Struktur. Beginnen Sie mit dem kleinsten und am wenigsten geteilten.
6. **`kit::Jobs`.** Die Abbruch-Maps verlassen den Anwendungszustand.
7. **Actors.** Zustand aus dem Anwendungszustand und aus `static`-Variablen wandert in Actors, ein Ablauf pro Pull Request, mit `update`-Tests, die zuerst gegen das aktuelle Verhalten geschrieben werden.
8. **Checks.** Jeder Schritt schaltet den Check für seine Regel ein, mit Baseline.

### 19.2. Regeln der Migration

- **Verschiebungen ändern kein Verhalten.** Ein Pull Request, der Code verschiebt, korrigiert keine Logik, und ein Pull Request, der Logik korrigiert, verschiebt keinen Code. Wenn etwas kaputtgeht, wissen Sie, welche Art von Änderung es verursacht hat.
- **Fassaden an alten Pfaden.** `pub use new::place::*;` am alten Modulpfad sorgt dafür, dass Code, den Sie nicht anfassen dürfen (oder noch nicht anfassen wollen), und Ihre bestehenden Tests unverändert kompilieren. Eine Fassade wird entfernt, wenn nichts sie mehr importiert.
- **Ein schwerer Build zur Zeit.** Mehrere parallele `cargo`-Builds eines großen Workspace können einen Laptop einfrieren. Migrieren Sie in einer Linie.
- **Führen Sie nach jedem Schritt die gesamte Testsuite aus**, nicht nach jedem Commit. Die Suite ist Ihr Beweis, dass sich am Verhalten nichts verschoben hat.

### 19.3. Struktur zuerst: ein schnellerer Start

Wenn Auffindbarkeit Ihr größtes Problem ist, können Sie die Arbeit umstellen: Verschieben Sie zuerst **Dateien** in Slice-Ordner innerhalb des einen bestehenden Crates, ohne ihren Inhalt zu ändern, und lassen Sie Fassaden an den alten Pfaden. Git erfasst das als Umbenennungen, sodass sich andere offene Branches weiterhin sauber mergen lassen. Die Karte (den Ordner jedes Features) haben Sie in ein oder zwei Tagen; die Trennung in Crates, die Layer in jedem Slice und die Actors folgen später auf einer Struktur, die bereits lesbar ist.

Zwei Dinge sind auch hier nicht umsonst. Dateien, die `super::` oder `pub(super)` verwenden, ändern beim Verschieben ihr Elternmodul, sodass einige Pfade kleine mechanische Korrekturen brauchen. Und das Herauslösen von Commands aus einer zentralen Datei ändert diese Datei, was zu Konflikten mit Branches führt, die sie bearbeiten. Das erledigt man besser als separaten zweiten Schritt.

### 19.4. Was üblicherweise schiefgeht

| Problem | Was zu tun ist |
|---|---|
| Hunderte Tests importieren alte Pfade | Fassaden an den alten Pfaden. Verschieben Sie die Tests nicht in denselben Pull Requests. |
| Parallele Branches kollidieren mit `git mv` | Trennen Sie die Crates, wenn die wenigsten Branches offen sind. Jede Verschiebung ist ein eigener Pull Request. |
| `pub(crate)`-Elemente werden nach der Trennung aus einem anderen Crate gebraucht | Erweitern Sie sie zu `pub`. Prüfen Sie nach der Migration, was zurück auf `pub(crate)` kann. |
| Die Kompilierzeit wächst mit der Zahl der Crates | Höchstens sechs bis acht Crates. Ein schwerer Build zur Zeit. Messen Sie vor und nach jeder Trennung mit `cargo build --timings` (22.6). |
| Ein Refactoring ändert still das Verhalten | Zuerst `update`-Tests gegen das heutige Verhalten. Verschiebungen und Korrekturen in getrennten Pull Requests. |
| Ein Teil des Codes darf sich gar nicht ändern (ein kritisches Feature, ein eingefrorener Bereich) | Er bleibt, wo er ist, und erreicht die neue Struktur nur über Fassaden. Fassaden sind rein additiver Code. |

## 20. Fallstudie: Quayside

Quayside ist eine **fiktive** Desktop-Anwendung, erfunden für dieses Dokument. Sie ist lose an die Art von Software angelehnt, die wir bauen, aber jeder Name, jede Zahl und jede Datei unten ist ausgedacht. Quayside zeichnet Gespräche auf, transkribiert sie auf dem Gerät, schreibt mit einem lokalen oder einem Cloud-Modell eine Zusammenfassung, führt Folgeaufgaben mit Coding-Agenten aus, synchronisiert To-dos mit einem gemeinsamen Team-Board und hat eine Begleit-App fürs Telefon, die eine Aufnahme verfolgen und eine Notiz hineinschicken kann.

Ein kleines Team hat sie zwei Jahre lang unter Zeitdruck gebaut, und sie funktioniert. Sie ist außerdem ein Lehrbuchbeispiel für alles, was Abschnitt 1 beschrieben hat.

### 20.1. Vorher

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

Die Messung aus Schritt 1 der Migration:

| Was | Wert |
|---|---|
| Rust-Zeilen (ohne Tests) | ~78.000 |
| Dateien, die `tauri::` verwenden | 37 von 112 |
| `#[tauri::command]`-Funktionen | 148, in 4 Dateien |
| Felder von `AppState` | 41, davon 14 `Mutex<…>` oder Atomics |
| `static` mit Zustand | 12 |
| Stellen, die eine schreibende SQLite-Verbindung öffnen | 9 |
| Dateien mit `#[cfg(target_os = …)]` | 23 |
| Varianten von `start_recording_*` | 7 |
| Laufzeit der Domänentests | sie brauchen ein Fenster, also führt sie niemand aus |

### 20.2. Symptome im Code

Der Anwendungszustand, gekürzt:

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

Ein Stopp, der zwischen Aufnahmen durchsickert. Jemand drückt Stop und startet schnell eine neue Aufnahme. Die Schleife der alten Aufnahme hat das Flag noch nicht gelesen; die neue Aufnahme setzt nichts zurück; die nächste Prüfung von `recording_cancel` stoppt die **neue** Aufnahme:

```rust
static RECORDING_CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn stop_recording() {
    RECORDING_CANCEL.store(true, Ordering::SeqCst);
}
```

Die Domäne spricht direkt mit dem Fenster und lässt sich deshalb ohne Fenster nicht testen:

```rust
pub async fn transcribe(app: AppHandle, file: PathBuf) -> Result<(), String> {
    let mut words = whisper::stream(&file)?;
    while let Some(word) = words.next().await {
        app.emit("transcript-word", &word).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

Varianten vermehren sich:

```rust
pub async fn start_recording(…)
pub async fn start_recording_with_limit(…)
pub async fn start_recording_with_limit_and_device(…)
pub async fn start_recording_for_meeting(…)
pub async fn start_recording_for_meeting_with_limit(…)
pub async fn start_recording_from_companion(…)
pub async fn start_recording_with_test_hook(…)
```

Und das Betriebssystem ist überall:

```rust
#[cfg(target_os = "macos")]
fn reveal(path: &Path) {
    let _ = Command::new("sh").arg("-c").arg(format!("open -R '{}'", path.display())).spawn();
}
```

Letzteres ist außerdem eine Shell-Injection, die nur auf einen Dateinamen mit einem Anführungszeichen wartet.

### 20.3. Die Migration, Schritt für Schritt

**Schritt 2: Abhängigkeiten umkehren.** Der Transcriber nimmt kein `AppHandle` mehr entgegen. Er schreibt Wörter in einen begrenzten Kanal, der `core` gehört; `app` pumpt den Kanal ins Fenster. Der Upload-Code liest `AppState` nicht mehr, sondern erhält die zwei Werte, die er braucht, als Argumente.

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

**Schritt 3: `app` und `core` trennen.** Ein Workspace mit `quayside-core` (ohne `tauri`) und dem bestehenden `src-tauri` als `app`. `lib.rs` in der App behält `pub use quayside_core::{…};`, damit jeder alte Pfad weiter kompiliert. Beweis: Ein eingebautes `use tauri::Manager;` in `core` lässt das Kompilieren scheitern.

**Schritt 4: `kit`, `store`, `drivers`.** Die neun Stellen, die SQLite öffnen, schrumpfen auf einen Writer in `quayside-store`. Recorder, Transcriber, Modell-Clients und `git` wandern nach `quayside-drivers`. Die 23 Dateien mit `#[cfg]` werden zu einem Ordner `platform/` mit `unix.rs`, `macos.rs` und `unsupported.rs`, und `reveal` wird ein Vertrag:

```rust
pub fn reveal_path(path: &Path) -> Result<(), PlatformError> {
    let status = Command::new("/usr/bin/open").arg("-R").arg(path).status()?;
    status.success().then_some(()).ok_or(PlatformError::Refused("open -R"))
}
```

Keine Shell, kein Quoting, keine Injection.

**Schritt 5: Slices.** `handlers.rs` und `utils.rs` werden in Slices zerlegt, die kleinsten zuerst:

```
settings → device → llm → summary → transcript → board → companion → agent → recording
```

**Schritt 6: `kit::Jobs`.** `transcribing` und `summarizing` (zwei Maps mit Abbruch-Tokens) werden zu einem `Jobs<TranscriptId>` im Transcript-Service und einem `Jobs<SummaryId>` im Summary-Service.

**Schritt 7: Actors.** Drei Zustände bestehen den Test aus 9.1: die Aufnahme, die Agentenläufe und die Board-Synchronisierung. Die Aufnahme kommt zuerst, mit `update`-Tests gegen das heutige Verhalten. Das `AtomicBool` verschwindet; Stop trägt jetzt die Generation der gemeinten Aufnahme, und das Leck aus 20.2 wird zu einem einzeiligen Test, der für immer grün bleibt. Aus den sieben `start_recording_*`-Funktionen wird eine:

```rust
pub struct StartRecording {
    pub title: String,
    pub device: Option<DeviceId>,
    pub meeting: Option<MeetingId>,
    pub limit: Option<Duration>,
    pub origin: Origin,
}
```

**Schritt 8: Checks.** Jeder Check aus Abschnitt 16 wird mit seiner Baseline eingeschaltet. Die meisten Baselines sind bereits leer, weil die Schritte oben die Verstöße beseitigt haben.

### 20.4. Nachher

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
      device/  llm/  settings/  guard/
src-tauri/
  src/
    main.rs lib.rs state.rs error.rs platform.rs
    recording/  mod.rs commands.rs dto.rs events.rs
    transcript/ mod.rs commands.rs dto.rs events.rs
    …
    doors/companion/
```

Ein Command nach der Migration:

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

Dieselbe Messung, wiederholt:

| Was | Vorher | Nachher |
|---|---|---|
| Dateien, die `tauri::` verwenden | 37 | 12, alle in `src-tauri` |
| Längster Command | 140 Zeilen | 9 Zeilen |
| Felder von `AppState` | 41 | 9 |
| `static` mit Zustand | 12 | 0 |
| Schreibende SQLite-Verbindungen | 9 Stellen | 1 |
| Dateien mit Betriebssystem-`#[cfg]` | 23 | 3, alle in `platform/` |
| Varianten von `start_recording_*` | 7 | 1 |
| Domänentests | brauchten ein Fenster | laufen in wenigen Sekunden, ohne Fenster |
| Kompiliert für Linux und Windows (außer `app`) | nein | ja, in der CI geprüft |

Diese Zahlen sind Beispiele. Entscheidend ist die Form der Veränderung: Jede Zeile hat sich in Richtung eines Besitzers, eines Ortes und einer Regel bewegt.

## 21. Checkliste für die Einführung und FAQ

### 21.1. Checkliste für ein neues Projekt

- Workspace mit zwei Crates: `<product>-core` (ohne `tauri`) und das Crate `app`.
- `kit::paths` vom ersten Tag an; keine fest codierten Home- oder Temp-Pfade.
- `drivers/src/platform/` mit `mod.rs`, `unix.rs`, der Datei Ihrer Plattform und `unsupported.rs`, sobald der erste Systemaufruf auftaucht.
- Jedes Feature als Slice mit den festen Dateien; Commands mit höchstens 10 Zeilen.
- Events nur aus `app/<slice>/events.rs`.
- Ein einziges Integrationstest-Target, `tests/it/`.
- Checks aus Abschnitt 16 ab der ersten Woche in der CI, solange die Baselines noch leer sind.
- Build-Einstellungen aus Abschnitt 22: Debug-Informationen mit `strip = false`, Linker, ein einziger Feature-Satz, `.taurignore`, ein Kompilier-Cache in der CI, der nur von `main` geschrieben wird.
- Schwere native Bibliotheken in einem Driver-Crate, von dem `core` nicht abhängt (5.3).
- Der SLAT-Abschnitt aus 18 im Leitfaden für Mitwirkende.

### 21.2. Checkliste für ein bestehendes Projekt

- Messtabelle als Plan committet (19.1, Schritt 1).
- Baseline-Listen für jeden Check angelegt, den Sie einschalten werden.
- Eine Entscheidung darüber, was sich nicht ändern darf, und Fassaden dafür.
- Schritte 2 bis 8 als separate Pull Requests eingeplant, die Trennung der Crates auf Zeiten mit wenigen offenen Branches gelegt.

### 21.3. Fragen

**Ist SLAT nur für Tauri?**
Nein. Ersetzen Sie „Tauri-Command“ durch Ihren Einstiegspunkt (HTTP-Handler, CLI-Unterbefehl, Message Consumer) und behalten Sie alles andere bei. Der Tier `app` ist einfach „das einzige Crate, das das Einstiegs-Framework kennt“.

**Warum keine hexagonale Architektur mit Ports überall?**
Ports als Traits lohnen sich, wenn es zwei Implementierungen gibt. Die meisten Driver in einer Desktop-Anwendung haben eine. SLAT bleibt bei konkreten Typen, bis eine zweite Implementierung existiert, und gewinnt Testbarkeit stattdessen aus reinen `logic`/`update`-Funktionen und Datennähten.

**Sind fünf Tiers für eine kleine App zu viele?**
Beginnen Sie mit zwei (`core` und `app`). Fügen Sie die anderen hinzu, wenn ihr Code existiert und sauber ist.

**Brauchen alle Slices alle Dateien?**
Nein. Eine Datei, die nicht gebraucht wird, existiert nicht. Ein kleiner Slice kann eine einzige `mod.rs` sein.

**Wann ist etwas ein Actor und kein Service?**
Wenn alle drei Bedingungen aus 9.1 erfüllt sind. Im Zweifel ist es ein Service. Einen Service später in einen Actor umzuwandeln, ist eine begrenzte Änderung innerhalb eines Slice.

**Was, wenn zwei Slices einander brauchen?**
Der gemeinsame Teil wird ein eigener Slice, und beide hängen davon ab. Zyklen sind nie erlaubt.

**Warum liegt die Grenze für Commands bei 10 Zeilen?**
Weil ein Command, der nur übersetzt, keinen eigenen Unit-Test braucht. Zehn Zeilen reichen, um zu deserialisieren, aufzurufen und abzubilden; sie reichen nicht, um eine Entscheidung zu verstecken.

**Verlangsamt SLAT das Kompilieren?**
Die Aufteilung in Crates beschleunigt inkrementelle Builds meist, weil eine Änderung in einem Slice `kit`, `store` oder `drivers` nicht neu baut. Einen sauberen Build kann sie durch zusätzliche Test-Binaries, die gelinkt werden müssen, leicht verlangsamen. Deshalb begrenzt SLAT die Zahl der Crates. Abschnitt 22 nennt die Einstellungen, die mehr ausmachen als die Zahl der Crates.

**Wir liefern nur für macOS aus. Lohnt sich Abschnitt 12 schon jetzt?**
Ja, der günstige Teil davon: `kit::paths`, Verträge für die wenigen Systemaufrufe, die Sie bereits haben, `unsupported.rs` und der Kompilier-Job auf Linux und Windows. Das kostet jetzt Tage und erspart später eine Suche durch die ganze Codebasis. Die Dateien `linux.rs` und `windows.rs` selbst warten, bis Sie sich für eine Portierung entscheiden.

**Wie kommen Coding-Agenten mit SLAT zurecht?**
Gut, weil die Struktur fest ist und die wichtigen Regeln Checks sind, keine Ratschläge. Siehe Abschnitt 18.

## 22. Build- und Testzeit

*Neu in Version 1.2.*

Die größte Ersparnis in SLAT kommt aus Abschnitt 5: Nur `app` kennt Tauri, daher kompilieren die Tests aller anderen Crates nie Tauri und die Web-View dahinter. Die zweitgrößte kommt aus 5.3: Eine schwere native Bibliothek liegt in einem Driver-Crate, von dem `core` nicht abhängt, daher kompilieren auch die Tests von `core` sie nie. Der Rest der Zeit geht auf ein paar Einstellungen und Gewohnheiten, jede eine oder zwei Zeilen Konfiguration. Dieser Abschnitt führt sie in der Reihenfolge auf, in der sie üblicherweise am meisten sparen, und endet mit den Dingen, die einen Build neu beginnen lassen, obwohl er das nicht sollte.

Erst messen. `cargo build --timings` schreibt einen HTML-Bericht über die Kompilierzeit jedes Crates und darüber, wie viele parallel liefen. Heben Sie den Bericht von vor einer Änderung auf und vergleichen Sie.

### 22.1. Wohin die Zeit geht

- **Ein Bibliotheks-Crate wird kompiliert, nicht gelinkt.** Gelinkt wird jedes Binary und in einem Testlauf jedes Test-Binary.
- **Jedes Crate kann drei Arten von Test-Binaries haben:** seine Unit-Tests, jede Datei direkt in `tests/` (Abschnitt 14.1 reduziert das auf eine, `tests/it`) und seine Dokumentationsbeispiele. Seit Edition 2024 werden die Dokumentationsbeispiele eines Crates als ein einziges Binary gebaut. Ein Crate ohne Dokumentationsbeispiele setzt `doctest = false` unter `[lib]`.
- **Ein Testlauf unterhalb von `app` braucht nie Tauri.** Der Befehl für jeden Tag ist `cargo nextest run --workspace --exclude quayside`. Nur die End-to-End-Tests aus Abschnitt 14 bauen das Crate `app`.
- **Eine schwere native Bibliothek kostet mehr als Tauri.** C- und C++-Quellen, die Build-Skripte kompilieren, und Machine-Learning-Crates nehmen den größten Teil eines sauberen Builds und den größten Teil des Linkens jedes Binarys, das sie enthält. Abschnitt 5.3 hält sie aus den Tests von `core` heraus.
- **Debug-Informationen sind ein großer Teil der Link-Zeit.** Das meiste davon wird nie gelesen.

### 22.2. Build-Einstellungen

In der `Cargo.toml` im Workspace-Root:

```toml
[profile.dev]
debug = "line-tables-only"
split-debuginfo = "unpacked"

[profile.dev.package."*"]
debug = false
strip = false
```

Ihre eigenen Crates behalten Datei- und Zeilennummern in Backtraces; Abhängigkeiten bekommen keine Debug-Informationen. Setzen Sie es für eine Sitzung zurück auf `debug = true`, wenn Sie einen Debugger brauchen.

`strip = false` ist unter macOS nicht optional. Mit `debug = false` strippt Cargo diese Einheiten standardmäßig auch, und unter macOS 27 beschädigt das System-`strip` die dynamischen Bibliotheken von prozeduralen Makros: `serde_derive` lässt sich nicht mehr laden, und ein sauberer Build schlägt fehl. `split-debuginfo = "unpacked"` steht ausdrücklich da, damit es nicht vom Standard einer bestimmten Cargo-Version abhängt, ob unter macOS nach jedem Linken `dsymutil` läuft.

Der Linker zählt am meisten für Test-Binaries. Unter Linux für x86-64 verwendet Rust seit Version 1.90 standardmäßig `rust-lld`. Andere Linux-Targets können `mold` verwenden. Unter macOS ist der Linker, der mit Xcode 15 und neuer kommt, bereits schnell, lassen Sie ihn also, wie er ist. Unter Windows ist `rust-lld` meist deutlich schneller als der Standard-Linker. In `.cargo/config.toml`:

```toml
[target.aarch64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]

[target.x86_64-pc-windows-msvc]
linker = "rust-lld.exe"
```

**Optimieren Sie die Abhängigkeiten, in denen Ihre Tests ihre Zeit verbringen.** Ein Dev-Build kompiliert jede Abhängigkeit ohne Optimierung, auch eine verschlüsselte Datenbank aus C-Quellen, eine Chiffre oder eine Hash-Funktion, die die Tests millionenfach aufrufen. Wer nur diese Pakete optimiert, macht die Tests schneller und lässt den Release-Build unverändert. In einem unserer Workspaces hat das einen Testlauf von 170 auf 102 Sekunden gebracht:

```toml
[profile.dev.package.libsqlite3-sys]
opt-level = 3

[profile.dev.package.sha2]
opt-level = 3
```

Jede Zeile kostet einen Rebuild dieses Pakets. Messen Sie den Testlauf vorher und nachher, und behalten Sie nur die Pakete, die ihn bewegt haben.

Entfernen Sie Abhängigkeiten, die niemand verwendet: `cargo machete` listet sie auf, und jede davon ist Kompilierzeit für nichts.

### 22.3. Ein einziger Feature-Satz

Cargo baut eine Abhängigkeit einmal für jeden unterschiedlichen Satz von Features, der verlangt wird. Zwei Dinge in einem SLAT-Workspace verlangen unterschiedliche Sätze:

1. **Unterschiedliche Befehle.** `cargo test --workspace` vereinigt die Features aller Mitglieder, `cargo test -p quayside-core` nur die, die `core` braucht. Wer beides ausführt, kompiliert `tokio`, `serde` und den Rest zweimal. `cargo-hakari` behebt das: Es pflegt ein generiertes Crate `workspace-hack`, von dem jedes Mitglied abhängt, mit der Vereinigung aller Features, sodass jeder Befehl die Abhängigkeiten auf dieselbe Weise baut. `cargo hakari generate` aktualisiert es, und `cargo hakari verify` in der CI schlägt fehl, wenn jemand es vergessen hat.
2. **Test-Features Ihrer eigenen Crates.** Das Feature `fake` aus 14.2 und `test-hooks` aus Abschnitt 10 ändern `drivers` und `core`, daher wird jedes Crate darüber erneut kompiliert, wenn das Feature wechselt. Bevorzugen Sie eine Datennaht (14.2), die kein Feature braucht. Wo ein Feature nötig ist, schaltet jeder Testbefehl es auf dieselbe Weise ein. Legen Sie diesen Befehl an einer Stelle ab, in `.cargo/config.toml`:

```toml
[alias]
t = "nextest run --workspace --exclude quayside --features quayside-drivers/fake --no-tests=fail"
```

Alle, auch Agenten und die CI, führen `cargo t` für die ganze Suite aus, und jeder engere Testbefehl ist `cargo t` mit einem zusätzlichen Filter (22.4). Ein Testbefehl mit einer anderen Liste von Paketen oder Features ist ein zweiter Build.

### 22.4. Ausführen, was eine Änderung betreffen kann

Die feste Struktur sagt, zu welchem Slice eine Datei gehört, und der Slice-Graph aus dem Zyklus-Check (16.4) sagt, welche Slices von ihm abhängen. Zusammen geben sie jeder Art von Änderung ihren eigenen Satz von Tests:

| Was sich geändert hat | Was läuft |
|---|---|
| `logic.rs`, `model.rs`, `store.rs`, `service.rs` oder `actor/` innerhalb eines Slice, seine `mod.rs` unverändert | die Tests dieses Slice und `cargo mutants --in-diff` (14.3) |
| die `mod.rs` eines Slice, seine öffentliche API | dieser Slice und jeder Slice, der ihn importiert |
| ein Modul von `tests/it` | dieses Modul |
| `kit`, `store` oder `drivers` | jedes Crate, das davon abhängt: `cargo t -E 'rdeps(quayside-store)'` |
| `drivers/src/platform/` | zusätzlich der Vertragstest (12.5); in der CI der Plattform-Job (16.3) |
| nur `app` | die End-to-End-Tests über den Einstiegspunkt; in `core` hat sich nichts geändert |
| `Cargo.toml`, `Cargo.lock`, `.cargo/`, die Toolchain-Datei | alles |

Ein Filter wählt aus, welche Tests **laufen**, nicht, was **kompiliert** wird: nextest baut zuerst jedes Paket, das die Cargo-Optionen nennen, und wendet dann `-E` an. Deshalb behält jede Zeile die Pakete und Features von `cargo t` und schränkt nur mit `-E` ein. Der Build bleibt der, der schon in `target/` liegt, und nur der Lauf wird kürzer. Den Build mit `-p` einzuschränken spart nur dann Kompilierzeit, wenn `cargo-hakari` (22.3) die Features gleich hält; ohne es ist `-p` ein zweiter Build der Abhängigkeiten.

Die Tests eines Slice lassen sich leicht auswählen, weil ihre Namen mit dem Slice beginnen: Unit-Tests liegen in `core/src/<slice>/`, ihre Namen beginnen also mit `<slice>::`, und auch die Module von `tests/it` beginnen mit dem Slice (`recording_stops_on_time_limit`). Eine erste Version der Auswahl passt in ein kurzes Skript. Es vergleicht die Arbeitskopie mit dem Punkt, an dem der Branch von `main` abgezweigt ist, daher zählen auch Änderungen, die noch nicht committet sind, und genau das braucht die Schleife eines Agenten:

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

Es ist absichtlich vorsichtig: Eine Änderung an irgendeiner `mod.rs`, an einer Datei oben in `core/src/` oder an den gemeinsamen Test-Helfern führt ganz `core` aus, statt dem Slice-Graphen zu folgen. Ersetzen Sie diesen Schritt durch den Graphen, wenn die Suite von `core` langsam wird.

Die Auswahl dient der Geschwindigkeit, nicht dem Beweis. Verwenden Sie drei Ebenen:

| Wo | Was läuft |
|---|---|
| auf Ihrem Rechner und in der Schleife eines Agenten | die Auswahl oben |
| in der CI bei einem Pull Request | jedes Crate, das von einem geänderten Crate abhängt (`rdeps`) |
| auf `main` oder in der Merge Queue | die ganze Suite |

`--no-tests=fail` (14.1) bleibt auf jeder Ebene eingeschaltet, damit eine Auswahl, die nichts trifft, rot ist, nicht still grün.

### 22.5. Viele Arbeitskopien

Coding-Agenten arbeiten oft parallel, jeder in seiner eigenen Arbeitskopie. Ohne Sorgfalt kompilieren vier Agenten dieselben Abhängigkeiten viermal im selben Moment.

**Jede Arbeitskopie hat ihr eigenes `target/`.** Lassen Sie nicht mehrere Kopien auf einen Ordner zeigen, weder mit einem symbolischen Link noch mit `CARGO_TARGET_DIR`. Das sieht aus wie ein gemeinsamer Cache, ist aber ein Korrektheitsfehler. Zwei Kopien desselben Workspace erzeugen dieselben Artefaktnamen und dieselben Fingerprint-Einträge, daher kann Cargo nach `build A; build B; build A` die Kopie A als `Fresh` melden, während die Bibliothek auf der Platte aus den Quellen von B gebaut wurde. Ein Check beurteilt dann fremden Code und meldet grün. Dazu kommt, dass Branches, die sich unterscheiden, bei jedem Wechsel die Crates des jeweils anderen neu bauen.

**Starten Sie eine neue Kopie warm, durch Klonen statt durch Teilen.** Wenn die Arbeitskopie angelegt wird, kopieren Sie das `target/` der Hauptkopie mit einem Copy-on-Write-Klon: `cp -c -R` unter macOS (APFS), `cp --reflink=auto -R` auf Btrfs oder XFS. Das dauert Sekunden und belegt keinen Speicherplatz, bis sich eine Datei ändert. Die Abhängigkeiten bleiben frisch, und Cargo baut nur Ihre eigenen Crates neu, weil deren Quellen neuer sind als das, was der Klon festgehalten hat. Messen Sie einmal den ersten Build in einer neuen Kopie; er sollte nahe an einem inkrementellen Build liegen, nicht an einem sauberen.

**`sccache` ist eine Ergänzung, nicht die Antwort.** Setzen Sie es als Compiler-Wrapper, in der `~/.cargo/config.toml` des Benutzers oder in der Umgebung (`RUSTC_WRAPPER=sccache`), dann wird sein lokaler Cache von jeder Arbeitskopie auf dem Rechner geteilt. Es cacht das Kompilieren gewöhnlicher Bibliotheksabhängigkeiten. Es cacht keine prozeduralen Makros, keine Binaries, keine `cdylib`-Crates und nicht Ihre eigenen Crates, die Cargo inkrementell kompiliert, und es cacht nicht das Linken. Das Linken der Test-Binaries ist das, wofür jede Arbeitskopie am meisten bezahlt, und nur 14.1, 22.2 und der Klon oben verringern es.

Begrenzen Sie mit `CARGO_BUILD_JOBS`, wie viel des Rechners ein Build nehmen darf, zum Beispiel die Hälfte der Kerne, damit ein zweiter Build langsamer wird, statt den Rechner einzufrieren. Die Regel aus Abschnitt 19.2 gilt weiter: ein schwerer Build zur Zeit.

### 22.6. CI

- **Ein Cache in jedem Rust-Job**, auch im Plattform-Job aus 16.3. `Swatinem/rust-cache` hält Abhängigkeiten und den Target-Ordner zwischen den Läufen vor, mit `Cargo.lock` und der Toolchain als Schlüssel.
- **Den Cache nur von `main` schreiben, überall lesen.** Ein Lauf für einen Pull Request kann den Cache seiner eigenen Ref und des Standard-Branches lesen, sonst nichts. Ein Cache, den ein Pull Request schreibt, hilft also nur diesem Pull Request, während der Standard-Branch, in dem jeder andere Pull Request nachsieht, leer bleibt. Setzen Sie `save-if: ${{ github.ref == 'refs/heads/main' }}` und lassen Sie den Workflow auch bei `push` auf `main` laufen, damit jeder Merge den Cache auffrischt und der erste Lauf jedes Pull Requests warm startet. In einem unserer Repositorys hat das den ersten Lauf von 942 auf 478 Sekunden gebracht.
- **`CARGO_INCREMENTAL=0`** in der CI. Inkrementelle Daten sind groß und in einem frischen Lauf nutzlos. `Swatinem/rust-cache` setzt das für Sie; bei jedem anderen Cache setzen Sie es selbst.
- **Die Tests unterhalb von `app` auf Linux.** Wenn der einzige macOS-Code in `drivers/src/platform/` und in den nativen Driver-Crates aus 5.3 liegt, brauchen die Tests von `kit`, `store` und `core` kein macOS. Führen Sie sie auf einem Linux-Runner aus, der schneller startet und weniger kostet, und behalten Sie den macOS-Runner für `drivers`, `app` und den Vertragstest.
- **Einmal bauen, parallel testen**, wenn die Suite länger als ein paar Minuten dauert: `cargo nextest archive` baut die Test-Binaries in einem Job, und mehrere Jobs führen ihren Teil davon mit `--partition hash:1/3`, `2/3`, `3/3` aus.
- **Ein Timings-Bericht auf `main`.** `cargo build --timings` als Artefakt jedes Builds von `main`. Wenn der Balken von `core` nach der Änderung eines einzigen Slice immer länger wird, ist das die Messung, die Abschnitt 5.3 vor einer Trennung verlangt.
- **`cargo hakari verify`** und **`cargo deny check`** neben den Checks aus Abschnitt 16. Beide dauern Sekunden.

### 22.7. Was einen Build neu beginnen lässt

Ein Build, der ohne sichtbaren Grund neu beginnt, hat fast immer eine dieser Ursachen:

- **Ein Build-Skript ohne `rerun-if-changed`.** Ein `build.rs`, das kein `cargo:rerun-if-changed` ausgibt, läuft nach einer Änderung an irgendeiner Datei seines Pakets erneut, und alles, was seine Ausgabe verwendet, wird neu kompiliert. Geben Sie eine Zeile pro Eingabe aus. Ein Skript, das Hilfsprogramme kompiliert (Swift, C), listet deren Quellen auf. Listen Sie nie einen Pfad auf, der nicht existiert: Cargo behandelt ihn bei jedem Build als geändert.
- **`tauri dev` beobachtet seine eigene Ausgabe.** Der Entwicklungsserver baut die App neu, wenn sich eine Datei in `src-tauri/` ändert. Eine Datenbank, ein Log oder eine generierte Datei, die die App dort schreibt, startet den Build in einer Schleife neu. Laufzeitdaten gehören unter `kit::paths` (12.4); generierte Dateien kommen in `.taurignore`.
- **Editor und Terminal im selben Ordner.** rust-analyzer führt `cargo check` mit eigenen Einstellungen aus. Im selben `target/` warten Editor und Terminal oder ein Agent auf die Sperre des jeweils anderen und können die Arbeit des anderen ungültig machen. Geben Sie dem Editor einen eigenen Ordner: `"rust-analyzer.cargo.targetDir": true`.
- **Unterschiedliche Umgebungen.** `RUSTFLAGS` und die Variablen, die Build-Skripte lesen (`MACOSX_DEPLOYMENT_TARGET`, `CC`, `CFLAGS`), gehören zu dem, was Cargo vergleicht. Wenn Terminal, Editor und die Shell eines Agenten sie unterschiedlich setzen, baut jeder Wechsel zwischen ihnen neu. Legen Sie sie in `.cargo/config.toml` ab (`[env]`, `[build] rustflags`), nicht in Shell-Profilen.
- **Eine wandernde Toolchain.** Ein neuer Compiler baut alles neu. Pinnen Sie die volle Version in `rust-toolchain.toml`, dreiteilig (`1.98.1`): Ein zweiteiliger Kanal übernimmt jedes neue Patch-Release ohne eine Änderung im Repository.

### 22.8. `target/` aufräumen

Cargo löscht nie alte Artefakte. Jeder Branch, jeder Feature-Satz und jede Version einer Abhängigkeit hinterlässt Dateien, und mit Hunderttausenden von Dateien in `target/` wird jeder Cargo-Befehl langsamer. In einem unserer Workspaces hat `cargo clean` etwa 960.000 Dateien (119 GiB) entfernt. Ein vollständiger Build der Bibliothek und ihrer Tests ging von 7–8 Minuten auf 36 Sekunden zurück, und `cargo clippy --all-targets` von mehreren Minuten auf 8 Sekunden.

Machen Sie daraus eine Regel, keine Rettungsaktion: Wenn `target/debug/deps` einige Zehntausend Dateien überschreitet oder `target/` einige Dutzend Gigabyte, führen Sie `cargo clean` aus und nehmen Sie einen kalten Build in Kauf. `cargo sweep --time 30` ist die sanftere Möglichkeit: Es entfernt nur die Artefakte, die 30 Tage lang nicht verwendet wurden. Eine Arbeitskopie, die entfernt wird, nimmt ihr `target/` mit.

## 23. Versionshistorie

| Version | Datum | Änderungen |
|---|---|---|
| 1.2 | 25. Oktober 2026 | Abschnitt 22, *Build- und Testzeit*: wohin die Kompilierzeit geht, Build-Einstellungen (einschließlich `strip = false` und optimierter Test-Abhängigkeiten), ein einziger Feature-Satz, Ausführen der Tests, die eine Änderung betreffen kann, ein eigenes `target/` für jede Arbeitskopie, gestartet aus einem Copy-on-Write-Klon, CI mit einem Cache, der nur von `main` geschrieben wird, was einen Build neu beginnen lässt, und das Aufräumen von `target/`. Schwere native Driver in einem Crate, von dem `core` nicht abhängt (5.3). Neue Unterabschnitte 14.3 (Mutanten im Diff), 14.4 (Property-Tests für `update`) und 16.5 (Clippy, `cargo-deny`, `ast-grep`). Checks für Regeln, die keinen hatten: Reinheit von `logic.rs`, die `mod.rs` eines Slice, Zyklen zwischen Slices, der 10-Zeilen-Command, `unwrap()` und `panic!`. Datennähte werden einem Feature `fake` vorgezogen. Korrigiert: die Kosten eines Crates (5.2, 5.3), `resolver = "3"` für Edition 2024 (5.1), der Cache-Schritt im Plattform-Job (16.3). Die Versionshistorie wandert von Abschnitt 22 nach Abschnitt 23; die Abschnitte 1 bis 21 behalten ihre Nummern. |
| 1.1 | 25. Oktober 2026 | Abschnitt 12, *Plattformen*: der Ordner `platform/` in `drivers`, Plattformverträge, Verbote außerhalb von `platform/`, Regeln für Pfade, Dateien und Text, Plattformtests, CI-Kompilier-Job auf Linux und Windows, Rezept für Portierungen. Ergänzungen zu Tiers, Durchsetzung, Rezepten und dem Entscheidungsbaum. |
| 1.0 | 24. Oktober 2026 | Erste Version: Tiers, Slices mit festen Layern, Importregeln, Datenflüsse, Actors, der Anwendungszustand als Composition Root, Fehler, Tests, Größengrenzen, Durchsetzung, Rezepte und Migration. |

SLAT wird wie eine Bibliothek versioniert. Eine neue Regel erhöht die Minor-Version, wenn sie mit einer Baseline-Liste kommt: Der heutige Code bleibt konform, und nur neue Verstöße sind rot. So hat 1.1 die Plattformregeln ergänzt. Eine Änderung, die konformen Code nicht konform macht, ohne dass eine Baseline sie auffängt, etwa das Umbenennen der Dateien eines Slice oder das Umkehren einer Abhängigkeit, erhöht die Major-Version. Korrekturen, die keine Regel ändern, behalten die Version. Jedes Repository, das SLAT folgt, nennt in seinem Leitfaden für Mitwirkende die Version, der es folgt.
