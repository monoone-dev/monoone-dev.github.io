SLAT è un pattern per organizzare il backend di un'applicazione desktop scritta in Rust, con Tauri a gestire la finestra. Risponde a tre domande su cui, prima o poi, ogni codebase in crescita sbaglia: **dove va questo file**, **chi può importare chi** e **come si spostano i dati** tra la finestra, il dominio e il mondo esterno.

Il nome elenca i suoi quattro elementi costitutivi: **S**lice, **L**ayer, **A**ctor, **T**ier. Ogni regola di questo documento riguarda uno di essi.

Questa pagina è il riferimento completo. È scritta in modo che un team che non ha mai visto SLAT possa adottarlo in un nuovo progetto o migrare un progetto esistente, senza doverci chiedere nulla. Contiene le regole, le ragioni che le motivano, codice da copiare, i check che le fanno rispettare e un esempio completo: un'applicazione disordinata rimessa in forma passo dopo passo.

I numeri delle sezioni sono stabili. Un repository che segue SLAT tiene una breve copia delle regole in `docs/slat/SLAT.md` con gli stessi numeri, così un riferimento come "sezione 17.8" significa la stessa cosa in questa pagina e nel repository. Quando le due versioni differiscono, entrambe vengono corrette lo stesso giorno. Una nuova sezione si aggiunge subito prima della cronologia delle versioni, che resta sempre l'ultima.

> **Versione 1.3** · 25 ottobre 2026. La versione 1.3 aggiunge la sezione 23, *Plugin*, una parte facoltativa per i prodotti che permettono all'utente di attivare e disattivare funzionalità: quando una funzionalità è un plugin, l'unica regola sulla direzione (una slice base non importa mai una slice di plugin), i punti di estensione, una sola build con un interruttore all'avvio e i check che la mantengono onesta. Un workspace senza plugin non richiede modifiche. La cronologia completa è nella sezione 24.

## 1. Perché esiste SLAT

Un'applicazione Tauri nasce piccola. C'è un `main.rs`, qualche funzione `#[tauri::command]`, forse uno `state.rs`. Sei mesi dopo, di solito lo stesso progetto ha questo aspetto:

- uno o due file enormi contengono "i comandi", e i comandi contengono tutta la logica di business;
- lo stato dell'applicazione è una struct con trenta campi, metà dei quali `Mutex<Option<…>>` e `AtomicBool`;
- alcune variabili `static` tengono altro stato che non appartiene a nessuno;
- la logica di dominio chiama direttamente `app.emit(…)`, quindi niente si può testare senza una finestra;
- le funzioni si moltiplicano in varianti: `start_with_budget`, `start_with_budget_and_slots`, `start_with_hook`;
- `#[cfg(target_os = "macos")]` è sparso in tutta la codebase;
- chi entra nel team, persona o agente di coding, impiega un giorno a capire dove vive una funzionalità.

Niente di tutto questo dipende da persone che lavorano male. Dipende dall'assenza di una risposta condivisa a "dove va questo?". Quando la risposta manca, vince il file più vicino, e il file più vicino è sempre il più grande.

SLAT dà quella risposta una volta per tutte, per ogni tipo di codice, e rende **meccaniche** le parti importanti: il compilatore e una manciata di piccoli script rifiutano il codice che rompe la struttura. Così la struttura sopravvive alle scadenze, ai nuovi membri del team e agli agenti di coding.

SLAT sta a un backend Rust come Nx con NgRx sta a un front-end: un insieme di regole indipendente dalla singola applicazione. Lo usiamo in ogni prodotto MonoOne con un backend Rust e Tauri, tra cui RigOne e IndexOne.

### 1.1. Obiettivi

1. **Reperibilità.** Una persona o un agente che conosce il nome di una funzionalità conosce la cartella in cui vive, su entrambi i lati dell'applicazione.
2. **Testabilità senza finestra.** Tutto, tranne il sottile livello di ingresso, compila ed esegue i propri test senza Tauri, senza display e senza processi reali.
3. **Confini fatti rispettare dal compilatore.** La direzione delle dipendenze è scritta in `Cargo.toml`, non in una wiki.
4. **Un solo proprietario per lo stato di lunga durata.** Il lavoro in background (un'esecuzione, una registrazione, una conversazione) ha esattamente un proprietario, e le sue regole sono una funzione pura.
5. **Crescita a basso costo.** Una nuova funzionalità è una nuova cartella con un insieme fisso di file, non una modifica a cinque file condivisi.
6. **Portabilità per costruzione.** Il codice che dipende dal sistema operativo vive in una sola cartella, quindi una nuova piattaforma è un nuovo file, non una ricerca nell'intero repository.

### 1.2. Non-obiettivi

- SLAT non impone nulla sul front-end. Fissa solo il contratto al confine: comandi, data transfer object (DTO) ed eventi.
- SLAT non è un framework. Non c'è nessun crate da cui dipendere. È una struttura, un insieme di regole e qualche script.
- SLAT non sostituisce le regole proprie del repository. Quando una regola del progetto e SLAT sono in disaccordo, **vince la regola del progetto**. SLAT dice dove stanno le cose; il progetto dice che cosa è vietato.

### 1.3. A chi è rivolto

SLAT è pensato per applicazioni desktop in Rust con Tauri, a partire da circa 10.000 righe di codice backend. Le idee valgono per qualsiasi applicazione Rust con un sottile livello di ingresso (una CLI, un daemon, un server): basta sostituire "comando Tauri" con "handler HTTP" o "sottocomando CLI", e tutto il resto rimane valido.

## 2. SLAT in una pagina

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

Sei frasi da ricordare:

1. **Solo il crate `app` conosce Tauri.** Tutto il resto compila e si testa senza finestra.
2. **Una funzionalità vive in una slice, e una slice ha file fissi.** Cerchi la chat? È in `core/chat/` e in `app/chat/`.
3. **Un comando Tauri ha al massimo 10 righe**: deserializza, chiama una funzione della slice, converte il risultato in un DTO.
4. **Lo stato di lunga durata ha un solo proprietario: un attore.** Niente `Mutex<Option<…>>` o `AtomicBool` nello stato dell'applicazione, niente `static` con stato dentro le slice.
5. **Le dipendenze puntano verso il basso.** Un tier inferiore non importa mai uno superiore, e il compilatore lo garantisce.
6. **Solo `drivers/src/platform/` conosce il sistema operativo.** Il resto chiede concetti (gruppo di processi, segreto, cartella dei dati), mai chiamate di sistema.

## 3. Vocabolario

| Termine | Significato | Equivalente front-end |
|---|---|---|
| **Tier** (piano) | Un tipo di crate: `kit`, `store`, `drivers`, `core`, `app`. I tier sono impilati e dipendono solo verso il basso. | Un tipo di libreria in Nx (`type:util`, `type:data-access`, …) |
| **Slice** (fetta) | Una funzionalità del prodotto, come `run`, `chat` o `skill`. | Una cartella di dominio, `src/sections/<area>` |
| **Layer** (strato) | Un file dentro una slice, con nome e ruolo fissi: `model.rs`, `logic.rs`, `store.rs`, `service.rs`. | `feature/`, `ui/`, `data-access/`, `util/` |
| **Attore** (actor) | L'unico proprietario di uno stato di lunga durata: `Msg → update → Effect`. | Uno store NgRx: action → reducer → effect |
| **Handle** | L'unica porta d'accesso a un attore dall'esterno. | `inject(Store)` |
| **Snapshot** | Ciò che la finestra vede di un attore, pubblicato tramite un canale `watch`. | `select(…)` |
| **Punto di ingresso** (entry) | Un modo in cui il mondo esterno chiama il backend: un comando Tauri, un server MCP, un bridge locale, un hub remoto. | Un componente di schermata |
| **Query** | Una lettura senza effetti collaterali. | Un selector |
| **Command** | Un cambiamento di stato. | Un'action |
| **Evento** | Il backend che avvisa il front-end che qualcosa è cambiato, senza che gli venga chiesto. | Un push in uno store |
| **Piattaforma** | Un sistema operativo per cui compiliamo: `macos`, `linux`, `windows`. | Un browser target |
| **Contratto di piattaforma** | Una funzione in `drivers::platform` che significa la stessa cosa su ogni sistema operativo. | Un polyfill |
| **Plugin** | Una funzionalità che l'utente può attivare o disattivare: una o più slice con un manifest (sezione 23, facoltativa). | Una libreria di funzionalità caricata in lazy loading |
| **Slice base** (base slice) | Una slice sempre attiva; non importa mai una slice di plugin. | Una libreria shell |
| **Hook** | Un punto di estensione che una slice base offre e a cui i plugin rispondono con dati. | Un injection token con `multi: true` |

Tre di questi termini si confondono facilmente, quindi ecco l'immagine da tenere a mente: **i tier sono i piani di un edificio, le slice sono gli appartamenti al piano `core` e i layer sono le stanze di ogni appartamento.**

## 4. Da dove viene SLAT

SLAT non è nuovo nelle sue parti. Combina cinque idee note e fissa le scelte che ciascuna lascia aperte.

| Idea | Cosa prende SLAT | Cosa decide SLAT in più |
|---|---|---|
| Architettura a livelli / Clean Architecture | Le dipendenze puntano verso il dominio; l'I/O sta ai margini. | I livelli sono **crate**, quindi il compilatore controlla la direzione. Esattamente cinque tipi. |
| Vertical Slice Architecture | Il codice è raggruppato per funzionalità, non per ruolo tecnico. | Ogni slice ha **gli stessi nomi di file** con gli stessi ruoli. |
| The Elm Architecture, NgRx, Redux | Lo stato cambia tramite messaggi e una funzione di update pura. | Solo per lo stato che supera il test delle tre domande (sezione 9.1). Gli effetti ritornano come messaggi. |
| Functional core, imperative shell | Le decisioni sono pure; gli effetti collaterali vengono eseguiti a parte. | `logic.rs` e `update.rs` sono puri per regola, e uno script lo verifica. |
| Ports and adapters (architettura esagonale) | Il mondo esterno si raggiunge tramite un'interfaccia. | Nessun trait finché non ci sono due implementazioni. Il tier `drivers` e i contratti di piattaforma fanno da porte. |

La differenza rispetto a ciascuna di queste idee presa da sola è che SLAT è **completo e meccanico**. Ogni tipo di codice ha esattamente un posto, e le regole importanti sono fatte rispettare da `Cargo.toml` o da un check che gira in CI.

## 5. Tier

Un workspace SLAT ha al massimo cinque tipi di crate. Si chiamano `<product>-<tier>`, per esempio `quayside-core`.

| Tier | Cosa ci vive | Può dipendere da | Mai |
|---|---|---|---|
| `kit` | Tipi e strumenti condivisi senza dominio: identificatori, tempo, percorsi (`kit::paths`), scritture durevoli su file, il tipo di errore di base, logging. | solo librerie esterne | `tauri`, `tokio::process`, SQL, `#[cfg]` del sistema operativo, qualsiasi cosa del prodotto |
| `store` | Persistenza: la connessione in scrittura, migrazioni, schema, ricostruzione dell'indice, cifratura del database. | `kit` | `tauri`, logica di dominio, processi |
| `drivers` | Il mondo esterno: processi, strumenti a riga di comando dei provider, HTTP, sidecar. Il codice che dipende dal sistema operativo vive solo in `drivers/src/platform/`. | `kit` | `tauri`, `store`, logica di dominio |
| `core` | Tutte le slice di dominio: modello, logica, casi d'uso, attori. | `kit`, `store`, `drivers` | `tauri` |
| `app` | Punti di ingresso: comandi Tauri, DTO, eventi, server di ingresso (MCP, bridge), lo stato dell'applicazione, `setup`, `main`. | tutti gli altri tier | logica di dominio (appartiene a `core`) |

In questo documento `core/…` e `app/…` abbreviano le cartelle dei sorgenti dei due crate. `core/src/<slice>/` è `crates/<product>-core/src/<slice>/`, e `app/src/<slice>/` è `src-tauri/src/<slice>/`, la cartella che Tauri crea per il crate dell'app. I check della sezione 16 usano i percorsi completi.

Un workspace SLAT completo: Quayside, l'applicazione di esempio della sezione 20, dopo la migrazione.

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

### 5.1. Il compilatore fa da guardia

Le frecce tra i tier sono scritte nel `Cargo.toml` di ogni crate. Se `core` non elenca `tauri` tra le dipendenze, allora `use tauri::Manager;` dentro `core` è un errore di compilazione. È la garanzia più forte che una regola possa avere: non si può dimenticare, saltare in review o mettere in discussione.

Un workspace minimo:

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

### 5.2. Con quanti crate iniziare

Il minimo è due: `core` e `app`. Gli altri tier si separano solo quando il loro codice esiste già ed è pulito, cioè non importa nulla da un tier superiore. **Un crate vuoto "per dopo" è vietato.** Costa un'esecuzione del compilatore a ogni build e i propri binari di test da linkare a ogni esecuzione dei test, e non insegna nulla.

### 5.3. Quando dividere un tier

Quando `core` supera circa 60.000 righe, o quando ricompilare tutto `core` dopo una modifica a una sola slice diventa pesante, si sposta un gruppo di slice in `core-<group>`, per esempio `quayside-core-run`. Si resta al massimo tra sei e otto crate. Un crate di libreria non viene linkato, ma ogni crate porta con sé i propri binari di test, e ognuno di questi viene linkato separatamente (sezione 22.1). Su un portatile una macchina bloccata costa più dei secondi che una suddivisione più fine farebbe risparmiare. Si decide con una misurazione, non a sensazione: `cargo build --timings` mostra se `core` è davvero il collo di bottiglia (sezione 22.6).

**Si divide per peso di compilazione, non solo per righe.** Un driver che avvolge una grande libreria nativa o di machine learning (riconoscimento vocale, un runtime di inferenza, un database compilato da sorgenti C) è spesso più pesante di Tauri stesso. Dentro `drivers` verrebbe compilato e linkato in ogni binario di test di `core`, perché `core` dipende da `drivers`. Un driver del genere riceve un crate proprio, `<product>-drivers-<name>`, da cui `core` non dipende. `app` dipende da esso e passa il suo output alla slice attraverso un punto di giunzione sui dati (14.2), oppure il driver gira come processo di supporto separato che `app` avvia. I test di `core` allora non lo compilano mai. `cargo-deny` mantiene le cose così: `{ crate = "quayside-drivers-speech", wrappers = ["quayside"] }` in `deny.toml` (16.5) rende rosso qualsiasi altro percorso verso quel crate.

### 5.4. Eccezione di compatibilità

Un nome di libreria che il bundler di Tauri o i dati dell'utente conoscono già (per esempio `quayside_lib`, o una cartella nella home dell'utente) resta al crate `app`. I nuovi crate ricevono nomi nuovi.

## 6. Slice

Una slice è una funzionalità del prodotto. Il suo nome è un sostantivo singolare in `snake_case`: `recording`, `transcript`, `board`, `trigger`. Non `recordings_manager`, non `utils`. Dove il prodotto ha un front-end, i nomi delle slice coincidono con le cartelle delle funzionalità del front-end, così la stessa parola trova il codice su entrambi i lati.

Una slice esiste in due tier: il suo dominio in `core` e il suo punto di ingresso (comandi, DTO, eventi) in `app`.

:::diagram slice

### 6.1. Una slice in `core`

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

Regole:

- **Un file di cui la slice non ha bisogno non esiste.** Una slice piccola può essere un unico `mod.rs` con modello e servizio, finché non supera circa 400 righe.
- **Un file che cresce diventa una cartella con lo stesso nome**: `logic.rs` diventa `logic/mod.rs` più `logic/<topic>.rs`. Il ruolo non cambia, cambia solo il numero di file.
- **Una slice troppo grande si divide in sotto-slice**: `run/` diventa `run/start/`, `run/step/`, `run/finish/`, ciascuna con la stessa struttura di file. La slice madre conserva solo un `mod.rs` con i re-export.
- **`mod.rs` è la porta d'ingresso della slice**, come l'`index.ts` di una libreria Nx. Le altre slice importano solo attraverso di esso.

Un tipico `mod.rs`:

```rust
mod logic;
mod model;
mod service;
mod store;

pub use model::{Transcript, TranscriptId, Word};
pub use service::TranscriptService;
```

### 6.2. Una slice in `app`

```tree
app/src/<slice>/
  mod.rs        `mod …;` and `pub mod commands;` (the command list itself is in lib.rs, 6.4)
  commands.rs   #[tauri::command] functions; at most 10 lines each
  dto.rs        wire types: serde camelCase, #[serde(other)] on enums, From<model>
  events.rs     event names and payloads sent to the window; snapshot subscription loops
```

Il resto del crate `app`:

```tree
app/src/
  main.rs       calls lib::run(); nothing else
  lib.rs        run(): Builder, plugins, setup, generate_handler! with every command, grouped by slice
  state.rs      AppState: the composition root, section 11
  error.rs      entry error → code and text for the window
  platform.rs   optional: window and menu settings that depend on the operating system, section 12.3
  doors/        entries other than the window: MCP server, bridge for agents, remote hub
```

### 6.3. Un comando, la forma di riferimento

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

Se un comando ha bisogno di un `if`, di un ciclo o di due chiamate alla slice, quella logica appartiene a `service.rs` o a `logic.rs`. Il limite di 10 righe non è una questione di stile. Un comando che si limita a tradurre non ha bisogno di un test unitario proprio, perché la sua logica è già testata nella slice. Resta da dimostrare la frase che una persona vede, e quella si testa end-to-end attraverso il punto di ingresso (sezione 14).

### 6.4. Registrare i comandi

`tauri::generate_handler!` ha bisogno del percorso completo di ogni comando, quindi `lib.rs` tiene un'unica lista. Va mantenuta raggruppata per slice, un blocco per slice, così aggiungere un comando significa aggiungere una riga accanto ai suoi vicini:

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

Un comando che esiste in una slice ma manca da questa lista compila e, in silenzio, non fa nulla. La sezione 16 include un piccolo check che confronta le due cose e fallisce quando divergono.

### 6.5. Dare un nome alle slice

- Un sostantivo per funzionalità, al singolare: `trigger`, non `triggers`.
- Il nome della cosa che chi usa il prodotto riconosce, non della tecnica: `transcript`, non `whisper_pipeline`.
- Quando due funzionalità cambiano sempre insieme, sono una sola slice. Quando una funzionalità ha parti che cambiano in modo indipendente, sono sotto-slice.
- **Anche una policy trasversale è una slice**: controlli di accesso, limiti, budget e protezione dei segreti vivono in `core/<policy>/` (per esempio `core/guard/`), e tutte le altre slice li chiamano.

## 7. Chi può importare chi

### 7.1. Dentro una slice

| File | Può importare | Non può importare |
|---|---|---|
| `model.rs` | `kit`; il `model` di altre slice, attraverso il loro `mod.rs` | qualsiasi cosa con I/O, `async`, `store`, `drivers` |
| `logic.rs` | `model` | I/O, `async`, `store`, `drivers`, `service` |
| `store.rs` | `model`, il crate `store` | `drivers`, `service`, `logic` di altre slice |
| `service.rs` | `model`, `logic`, `store.rs`, `drivers`, l'API pubblica di altre slice | `tauri`, stato globale |
| `actor/*` | `model`, `logic`, `service`, `drivers` | `tauri`; e `update.rs` nemmeno I/O |
| `app/<slice>/dto.rs` | il `model` della slice | `service`, `store` |
| `app/<slice>/commands.rs` | l'API pubblica della slice, `dto`, `AppState` | `store`, `drivers`, `logic` |

### 7.2. Tra slice

- **Solo attraverso `mod.rs`.** Percorsi profondi come `crate::run::logic::…` da un'altra slice sono vietati.
- **Nessun ciclo.** Se `a` ha bisogno di `b` e `b` ha bisogno di `a`, la parte condivisa diventa una slice a sé (di solito un piccolo `model` o un piccolo servizio), ed entrambe dipendono da essa.
- **Una policy è una slice, non un comando.** Se un controllo di budget vive in un comando, ogni livello inferiore che ne ha bisogno deve importare verso l'alto. È la causa più comune di cicli nelle applicazioni Tauri.

### 7.3. Perché proprio questi confini

La tabella degli import è costruita in modo che le cose costose da testare (I/O, async, processi) stiano nel minor numero possibile di file, e le cose che vale la pena testare (le decisioni) stiano in file che non ne contengono nessuna. Una decisione in `logic.rs` si testa con un semplice `#[test]` in pochi microsecondi. La stessa decisione sepolta in un comando richiede una finestra.

## 8. Flussi di dati

:::diagram flows

### 8.1. Query (una lettura)

```
window ─invoke─► app/<s>/commands.rs ─► core/<s>/service.rs ─► core/<s>/store.rs
                        ◄── dto.rs ◄──────── model ◄──────────────────┘
```

Una lettura non passa da un attore, a meno che non legga lo stato di quell'attore. In quel caso legge l'ultimo `Snapshot` dall'`Handle`, senza inviare messaggi.

### 8.2. Command (una modifica)

Senza stato in background (salvare un'impostazione, creare un file):

```
window ─invoke─► commands ─► service ─► logic (decision) ─► store / drivers ─► result
```

Con stato in background (un'esecuzione, una conversazione, una registrazione):

```
window ─invoke─► commands ─► Handle.send(Msg)
                                  │
                 actor ◄──────────┘
                   update(&mut State, Msg) -> Vec<Effect>     pure function
                   for e in effects: execute(e)               I/O: drivers, store, timers
                   snapshot.send(State.view())                the window gets a new view
```

### 8.3. Evento (backend → finestra)

Gli eventi vengono emessi **solo** da `app/<s>/events.rs`. Una slice in `core` pubblica i cambiamenti tramite un `watch::Sender<Snapshot>` o un `broadcast::Sender<Event>`. `events.rs` si iscrive e chiama `emit`. Così `core` non sa nulla della finestra, e il front-end ha esattamente un posto da cui arrivano gli eventi di ciascuna slice. I nomi degli eventi seguono lo schema `<slice>:<event>`, per esempio `recording:snapshot`.

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

### 8.4. Flussi ad alto volume

Alcune slice producono molti piccoli eventi: righe di log, parole della trascrizione, aggiornamenti di avanzamento. Non si emette un evento Tauri per ogni riga. La slice riceve in `core` un canale limitato: un piccolo tipo mittente proprio della slice (per esempio il `WordSink` della sezione 20.3) il cui `send` non aspetta mai e restituisce ciò che è successo, come `Sent::Delivered`, `Sent::Dropped` o `Sent::Closed`. `app/<s>/events.rs` possiede una **pompa** che raggruppa le righe in un `tauri::ipc::Channel` ogni pochi millisecondi. Il canale limitato è la contropressione: quando la finestra è lenta, la slice lo scopre (`Sent::Dropped`) invece di riempire la memoria, e quando nessuno ascolta più (`Sent::Closed`) la slice può fermarsi. Il raggruppamento, il canale e la frequenza dei frame riguardano il punto di ingresso e restano in `app`.

## 9. Attori: slice con stato

### 9.1. Quando usare un attore

Si usa un attore solo quando **tutte e tre** le condizioni sono vere:

1. lo stato vive più a lungo di una singola chiamata di comando;
2. più fonti lo modificano in modo concorrente (la finestra, i processi, i timer, la rete);
3. la finestra lo osserva in tempo reale.

In tutti gli altri casi si usa un semplice `service.rs`. Non ogni feature NgRx ha bisogno di effect, e non ogni slice SLAT ha bisogno di un attore.

| Candidato | 1 | 2 | 3 | Verdetto |
|---|---|---|---|---|
| un'esecuzione di agenti con passi e processi | sì | finestra, processi, timer | sì | attore |
| una registrazione in corso | sì | finestra, dispositivo audio, timer | sì | attore |
| una conversazione con un modello | sì | finestra, processo del modello, dispositivo remoto | sì | attore |
| generare una bozza una volta e restituirla | sì | finestra (avvio/stop) | no, un solo risultato | servizio + `kit::Jobs` |
| una cache dei prezzi dei modelli | sì | nessuna | no | un campo del servizio della slice |

### 9.2. File

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

### 9.3. Il contratto

- **`update` è pura.** Riceve lo stato e un messaggio e restituisce una lista di effetti. Ogni regola di business su quello stato si può testare senza tokio, processi o database.
- **Un effetto che produce un risultato lo restituisce come nuovo `Msg`.** L'attore non aspetta mai un effetto lungo dentro il proprio ciclo. Un effetto lungo va in `tokio::spawn`, e il suo risultato torna attraverso la mailbox.
- **L'annullamento è un messaggio con una generazione**, non un flag: `Msg::Cancel { generation }`. Lo stato contiene `generation: u64`, e una risposta tardiva con una generazione vecchia viene ignorata in `update`. Un `AtomicBool` globale si trascina da un'operazione all'altra; una generazione no.
- **Un risultato è un valore**: `enum Outcome<T> { Done(T), Cancelled }`, mai `Err(Cancelled)`. Annullare è qualcosa che la persona ha chiesto, non un fallimento.
- **Un limite di tempo è `Effect::StartTimer`, e la sua scadenza è `Msg::TimedOut`.** Terminare un processo dopo un limite di tempo è compito di un driver. Un semplice `tokio::time::timeout` annulla il future di Rust, non il processo del sistema operativo.
- **Nessun `std::sync::Mutex` dentro un attore.** Il suo stato ha un solo proprietario, quindi non serve un lock.
- **Un attore per ogni istanza di stato**: uno per esecuzione, uno per conversazione. Il registro delle istanze attive è a sua volta un piccolo attore, oppure un servizio con una mappa di handle.

### 9.4. Un piccolo attore completo

Un attore di registrazione che avvia un processo registratore, applica un limite di tempo e può essere fermato (il file viene conservato) o annullato (il file viene scartato). Tutti i nomi di tipi e funzioni sono illustrativi.

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

Una nuova registrazione può partire ogni volta che non c'è nulla in corso, anche dopo che una precedente è stata salvata o annullata. L'ultimo ramo è il senso delle generazioni: un messaggio `Level`, `TimedOut` o `Ended` proveniente da una registrazione precedente arriva con una generazione vecchia e non cambia nulla.

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

Il ciclo tiene solo un mittente debole per i risultati dei propri effetti. Quando l'ultimo `Handle` viene distrutto, `recv` restituisce `None` e l'attore termina invece di restare in attesa per sempre.

Quando l'ordine degli effetti conta (per esempio, salvare prima di notificare), quegli effetti si eseguono in sequenza dentro un unico task, invece di avviare un task per effetto. L'unica regola è che il ciclo stesso non aspetti mai.

### 9.5. Testare un attore

La maggior parte dei test non avvia mai l'attore. Chiama direttamente `update`:

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

Alcuni test guidano l'intero attore attraverso il suo `Handle` con `tokio::time::pause()`, un driver finto e asserzioni sulla sequenza degli snapshot.

## 10. L'esplosione delle varianti

Una famiglia di funzioni come `start_with_budget`, `start_with_slots`, `start_with_snapshot_hook`, `start_with_budget_and_slots` segnala che manca una struct di richiesta. La famiglia si sostituisce con un'unica funzione di ingresso e un'unica struct di opzioni:

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

Chi chiama scrive `StartRequest { workflow, budget: Some(limit), ..Default::default() }`. Una nuova opzione è un nuovo campo, non una nuova funzione più una nuova riga in ogni chiamante. I punti di iniezione riservati ai test (`faults`, `hooks`) sono campi che esistono solo in una build di test. `cfg(test)` da solo copre soltanto gli unit test del crate stesso, quindi i test di integrazione e gli altri crate attivano quei campi con una feature `test-hooks`, la stessa idea del driver finto della 14.2. La feature si attiva allo stesso modo in ogni comando di test (sezione 22.3); altrimenti ogni passaggio tra una build con la feature e una senza ricompila il crate e tutto ciò che sta sopra.

## 11. AppState, la composition root

`AppState` assembla l'applicazione e non fa nient'altro. Può contenere:

- valori `Arc<…Service>` e `…Handle` delle slice;
- configurazione di sola lettura;
- un handle al writer del database.

Non può contenere:

- `Mutex<Option<…>>`, `AtomicBool` o `Mutex<HashMap<…>>` che descrivono qualche processo in background. Quello è stato di un attore e appartiene a `core/<slice>/actor/state.rs`;
- campi che sono un dettaglio di una singola slice (cache, mappe di annullamento, code).

Le slice non possono nemmeno nascondere stato in variabili `static` (`OnceLock<Mutex<…>>`, `LazyLock<Mutex<…>>`). L'unica eccezione è una costante calcolata una sola volta (`OnceLock<PathBuf>`) che non cambia mai finché il processo è in vita.

**Il test:** ogni campo di `AppState` si può descrivere con un solo sostantivo di una slice ("registrazioni", "esecuzioni", "account"). Un campo che richiede una frase per essere descritto appartiene a una slice.

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

### 11.1. `kit::Jobs`: lavoro in background una tantum

Generare una bozza, confrontare due cartelle o pianificare un'attività: sono lavori che girano in background, si possono fermare e producono un solo risultato. Non serve un attore. Serve una mappa di annullamento, e quella mappa appartiene al servizio della slice, non ad `AppState`. `kit::Jobs<K>` è un tipo generico concreto pensato per questo:

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

`begin` annulla qualsiasi job precedente con la stessa chiave, memorizza una nuova generazione e restituisce una guardia che rimuove la voce quando viene distrutta, ma solo se la generazione corrisponde ancora. Il lock è tenuto solo dentro queste due brevi funzioni, mai attraverso un `await`. Poiché `Jobs` è un tipo concreto e non un trait, non viola la regola contro i trait con una sola implementazione.

Questa non è una scappatoia rispetto alle regole della sezione 11. Quelle regole riguardano dove vive lo stato, non il suo tipo. Un lock dentro `kit::Jobs`, posseduto dal servizio di una sola slice e mai tenuto attraverso un `await`, è un dettaglio privato di quella slice. La stessa mappa come campo di `AppState` è stato che non appartiene a nessuno.

## 12. Piattaforme

*Novità della versione 1.1.*

Oggi un prodotto può essere distribuito su un solo sistema operativo (per esempio solo macOS). SLAT organizza il codice in modo che il sistema operativo successivo sia lavoro in **una sola cartella**, non una ricerca nell'intero repository. La regola è una sola: **solo `drivers/src/platform/` conosce il sistema operativo.** Tutto il resto chiede concetti (un gruppo di processi, un segreto, la cartella dei dati, l'apertura di un file), mai chiamate di sistema.

L'elenco delle piattaforme supportate appartiene al repository (alla sua guida per chi contribuisce), non a SLAT.

:::diagram platform

### 12.1. Struttura

```tree
drivers/src/platform/
  mod.rs          the only platform API: selects a file with #[cfg] and pub use; no logic
  unix.rs         shared by macOS and Linux: process groups, signals, file modes
  macos.rs        Keychain, revealing in Finder, the login shell, …
  linux.rs        only when the port starts: Secret Service, xdg-open, …
  windows.rs      only when the port starts: Job Objects, Credential Manager, ACLs, …
  unsupported.rs  every function returns Err(PlatformError::Unsupported)
```

- Un file per un sistema operativo che il prodotto non supporta ancora **non esiste**, per la stessa ragione per cui non esiste un crate vuoto "per dopo". Al suo posto c'è `unsupported.rs`.
- `unsupported.rs` non è codice morto. Grazie a questo file, l'intero workspace tranne `app` compila per ogni piattaforma fin dal primo giorno. Una fuga di codice di sistema in `core` diventa un errore di compilazione in CI, non una scoperta il giorno del port.
- `mod.rs` ha lo stesso aspetto in ogni repository:

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

Un port cambia solo questa lista di righe `cfg`. Ogni file di piattaforma espone **lo stesso insieme di funzioni e tipi con le stesse firme**. Una funzione mancante è un errore di compilazione su quella piattaforma. Non è un trait: in ogni build c'è sempre esattamente un'implementazione.

### 12.2. Contratti

Ogni concetto ha un contratto che significa la stessa cosa su ogni sistema operativo. Cambia solo l'implementazione interna.

| Concetto | API in `drivers::platform` | macOS | Linux | Windows |
|---|---|---|---|---|
| gruppo di processi | `ProcessGroup::spawn`, `terminate(grace)`, `proved_dead()` | id del gruppo di processi; SIGTERM, periodo di grazia, SIGKILL; `kill(-pgid, 0)` restituisce `ESRCH` | come macOS | Job Object; `TerminateJobObject`; nel job non restano processi |
| segreti | `secret::read`, `secret::write`, `secret::delete` | Keychain | Secret Service (libsecret) | Credential Manager |
| file e cartella privati | `fs::write_private`, `fs::create_private_dir` | modalità `0o600` / `0o700` | come macOS | ACL: solo il proprietario |
| apertura nel sistema | `open_path`, `reveal_path`, `open_url` | `open`, `open -R` | `xdg-open` | `ShellExecuteW`, `explorer /select,` |
| ambiente dell'utente | `login_env()` | la login shell (il `PATH` di un'app avviata dal Dock è minimale) | come macOS | registro di sistema e ambiente del processo |
| trovare un programma | `which(program)` | `PATH` | `PATH` | `PATH` più `PATHEXT` |
| dati della macchina | `machine::cores`, `machine::memory`, `machine::free_space` | sysctl, statfs | /proc, statfs | API di sistema |

Regole dei contratti:

- Una funzione di contratto non restituisce tipi di sistema (`pid_t`, `HANDLE`). Restituisce tipi di `drivers` o di `kit`.
- **Prove, non speranze**, su ogni piattaforma: "il processo è morto" è un fatto accertato, non un segnale inviato.
- Dove un sistema operativo non può fare ciò che il contratto richiede, la funzione restituisce un errore che nomina ciò che manca, mai un sostituto silenzioso.

Un breve esempio di contratto e del suo lato macOS:

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

### 12.3. Cosa è vietato fuori da `platform/`

| Vietato fuori da `drivers/src/platform/` | Da usare invece |
|---|---|
| `#[cfg(unix)]`, `#[cfg(windows)]`, `#[cfg(target_os = …)]` | un contratto della 12.2 |
| `std::os::unix`, `std::os::windows`, `libc`, `nix`, `windows-sys`, `security-framework` | un contratto della 12.2 |
| `sh -c`, `bash`, `zsh`, `cmd /c`, `powershell` | `Command::new(program).args(…)`; se una shell serve davvero, la sceglie `platform` |
| nomi di programmi di sistema: `open`, `xdg-open`, `security`, `osascript`, `explorer` | `open_path`, `secret::*`, … |
| percorsi scritti a mano: `~`, `$HOME`, `/tmp`, `/usr/bin`, `/Applications`, `Library/` | `kit::paths` (12.4) |
| unire percorsi con una stringa `/` | `Path::join` |
| modalità dei file come numeri (`0o600`) | `fs::write_private` |

L'unica eccezione è `app/src/platform.rs`, per le cose che conosce solo Tauri: lo stile della barra del titolo, il menu dell'applicazione, la policy di attivazione della finestra. Nient'altro che impostazioni della finestra.

### 12.4. Percorsi, file e testo

- **Le cartelle arrivano solo da `kit::paths`**: `data()`, `config()`, `cache()`, `logs()`, `temp()`. Sotto c'è una libreria che segue la convenzione di ogni sistema (macOS `~/Library/Application Support/<App>`, Linux XDG, Windows `%APPDATA%`). I dati che vivono già in un percorso più vecchio restano lì, sul sistema in cui sono stati creati (l'eccezione di compatibilità della 5.4); su quel sistema `kit::paths` restituisce il percorso più vecchio, quindi il codice continua a chiedere solo a `kit::paths`. `kit` stesso non ha alcun `#[cfg]`: la convenzione del sistema arriva dalla libreria.
- **I nomi dei file creati dall'applicazione sono in minuscolo** e non differiscono mai solo per maiuscole e minuscole. I file system predefiniti di macOS e Windows non li distinguono; Linux sì.
- **Non si rinomina né si elimina un file che qualcuno tiene aperto.** Windows lo rifiuta. Le scritture atomiche passano da `kit::durable_file`, che chiude il file prima di sostituirlo.
- **Percorsi lunghi.** Windows limita i percorsi a circa 260 caratteri senza il prefisso `\\?\`. Le copie di lavoro e le cartelle delle esecuzioni vanno tenute poco profonde; il prefisso lo aggiunge `platform`, mai una slice.
- **Il testo che arriva dai processi** si legge tollerando `\r\n`. I file scritti dall'applicazione usano `\n`.
- **Un percorso inviato alla finestra** è in UTF-8. Un percorso che non si può scrivere in UTF-8 è un errore che nomina il file, mai un `unwrap()`.

### 12.5. Test di piattaforma

- **Il test del contratto** vive in `drivers/tests/it/platform_contract.rs`, un modulo dell'unico target di integrazione del crate (14.1), ed è lo stesso per ogni sistema operativo: un processo è morto dopo `terminate`, un segreto torna indietro dopo essere stato scritto e sparisce dopo essere stato eliminato, un file privato non è leggibile da un altro utente. Ogni piattaforma supportata supera **lo stesso** insieme di test.
- **I test fuori da `drivers` non usano né una shell né segnali.** Un processo necessario a un test è un piccolo programma Rust (un binario in un crate di test), non `sh -c 'sleep 10'`.
- Un `#[cfg]` di piattaforma nei test è ammesso solo nei test di `drivers`.

### 12.6. Applicazione delle regole

| Regola | Chi la fa rispettare |
|---|---|
| i divieti della 12.3 | un check con grep e una lista di baseline (sezione 16) |
| i crate diversi da `app` compilano su ogni piattaforma | `cargo check --workspace --exclude <app>` su runner CI nativi per Ubuntu e Windows. Non un cross-check da macOS: gli script di build con codice C richiedono il compilatore del target. |
| il contratto funziona | `platform_contract.rs` su un runner per ogni piattaforma **supportata** |

### 12.7. Port su un nuovo sistema operativo

1. `drivers/src/platform/<system>.rs`: ogni funzione del contratto. Il compilatore elenca cosa manca.
2. `mod.rs`: il `cfg` del nuovo sistema smette di puntare a `unsupported.rs`.
3. `platform_contract.rs` è verde sul runner di quel sistema, e il runner entra in CI.
4. `app`: configurazione di bundle e firma per il sistema, e `app/src/platform.rs` se serve.
5. La guida per chi contribuisce al repository aggiunge il sistema all'elenco delle piattaforme supportate.

Se un port richiede una modifica in `core`, qualcosa è trapelato. Prima una pull request separata sposta la fuga dietro un contratto, poi il port prosegue.

## 13. Errori

- **Ogni crate ha il proprio enum di errore** (con `thiserror`). Una slice può avere il proprio in `error.rs`.
- **`core` restituisce errori di dominio.** `app/error.rs` li trasforma in un codice e in una frase per la finestra. La frase viene dalla tabella delle traduzioni del progetto, mai dal `Display` di un enum del protocollo.
- **Un evento sconosciuto che arriva dal protocollo non è un errore.** Si usa `#[serde(other)]` sugli enum e `Option<T>` sui campi non essenziali. La riga sconosciuta si registra nel log per il debug e si va avanti. Una nuova versione dello strumento a riga di comando di un provider non deve mai fermare un'esecuzione.
- **`unwrap()` e `panic!` sono vietati** fuori dai test in `core`, `store` e `drivers`. Si usa `?` con una variante di errore, oppure `expect()` con un motivo che spiega perché il valore non può mancare.

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

## 14. Test per layer

| Layer | Come testare | Cosa conta come prova |
|---|---|---|
| `logic.rs`, `update.rs` | un semplice `#[test]`, senza tokio | un'asserzione su un valore o sulla lista degli effetti |
| `store.rs` | un database in una cartella temporanea | la riga restituita da una lettura |
| `service.rs` | `#[tokio::test]` con uno store reale e un driver finto | lo stato dei file o del database dopo la chiamata |
| `actor/` | un `Handle` più una sequenza prestabilita di messaggi; il tempo con `tokio::time::pause` | la sequenza di `Snapshot` |
| `drivers` | un processo reale o un flusso registrato | il processo è morto (`ESRCH` o un job vuoto), le righe arrivate dal protocollo |
| `app/commands` | nessun test unitario; un test end-to-end o di integrazione attraverso il punto di ingresso, per ciò che una persona vede | il testo che una persona vede |

Il test di un messaggio mostrato a una persona va dove la persona lo vede, non solo in `logic.rs`. Una funzione che produce la frase giusta non prova nulla se nessuno la chiama.

### 14.1. Un solo binario di integrazione

Ogni file messo direttamente in `tests/` è un binario separato, e ogni binario viene linkato separatamente. In un workspace grande significa un minuto per file. Ogni crate ha **un solo** target di integrazione, `tests/it/main.rs`, con un modulo per argomento, e un singolo argomento si esegue con un filtro:

```tree
tests/it/
  main.rs          mod recording_stops_on_time_limit; mod transcript_survives_restart; …
  recording_stops_on_time_limit.rs
  transcript_survives_restart.rs
```

```bash
cargo nextest run --test it recording_stops_on_time_limit::
```

Si esegue con `--no-tests=fail`, così un filtro che non trova nulla è rosso invece che silenziosamente verde.

Gli helper condivisi dai test sono un modulo dello stesso target, `tests/it/support/`. Un file di helper messo direttamente in `tests/` è un binario in più da linkare.

### 14.2. Un driver finto senza trait

Un test ha bisogno di un driver che non avvii processi reali. SLAT vieta un trait con una sola implementazione, e un finto non conta come seconda implementazione reale. Due opzioni rispettano la regola. È preferibile la prima: una feature cambia il modo in cui vengono compilati `drivers` e ogni crate sopra di esso, quindi una build di test con la feature e una build dell'applicazione senza sono due insiemi separati di artefatti (sezione 22.3). Un punto di giunzione sui dati non costa alcun tempo di compilazione.

- **Un punto di giunzione sui dati.** Il servizio riceve l'*output* del driver come valore o come canale, non il driver stesso. Il test invia righe nel canale.
- **Una build di test.** `drivers` espone `#[cfg(any(test, feature = "fake"))] pub mod fake;` con le stesse funzioni del modulo reale, e il crate di test abilita la feature `fake`.

Quando compare una seconda implementazione reale (un secondo provider, una seconda piattaforma), è il momento di introdurre un trait.

### 14.3. Mutanti nel diff

Un test che passa dimostra qualcosa solo se fallirebbe su codice sbagliato. È la sezione 16.2 applicata ai test. `cargo-mutants` modifica il codice (inverte una condizione, sostituisce un valore di ritorno, cancella un'istruzione) e segnala ogni modifica che nessun test ha notato. Va eseguito sulle righe cambiate da una pull request, non sull'intero workspace:

```bash
git diff origin/main...HEAD > changes.diff
cargo mutants --in-diff changes.diff --package quayside-core
```

`logic.rs` e `update.rs` sono i posti in cui questo rende di più. Sono puri, quindi i loro test girano in microsecondi, e un mutante sopravvissuto lì è una regola di business che nessuno verifica. Un mutante sopravvissuto si corregge con un test, mai con un'esclusione.

### 14.4. Test di proprietà per `update`

Un test di `update` verifica una sola sequenza di messaggi. Un test di proprietà verifica migliaia di sequenze casuali rispetto a regole che devono valere sempre. Con `proptest` si genera una sequenza di valori `Msg` e si verificano le invarianti dello stato dopo ogni passo:

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

`messages(n)` è una strategia del modulo di test che costruisce valori `Msg` casuali, e `Msg::generation()` è una piccola funzione di supporto che restituisce la generazione portata da un messaggio. La perdita della sezione 20.2 è esattamente il tipo di bug che un test del genere trova da solo: nessuno deve pensare all'ordine dei messaggi che la provoca.

## 15. Limiti di dimensione

| Unità | Soglia di avviso | Cosa fare |
|---|---|---|
| file | 1.500 righe di codice (senza test) | dividerlo in una cartella con lo stesso ruolo, sezione 6.1 |
| slice | 15.000 righe | dividerla in sotto-slice |
| `core` | 60.000 righe | spostare un gruppo in `core-<group>`, sezione 5.3 |
| comando Tauri | 10 righe | spostare la logica in `service.rs` |
| campo di `AppState` | un sostantivo | vedi sezione 11 |

I file oltre la soglia nel giorno in cui si adotta SLAT finiscono in una **lista di baseline**. La lista può solo ridursi.

## 16. Applicazione delle regole

Prima il meccanismo, poi le parole. Una regola che uno script può verificare non dovrebbe mai dipendere dalla memoria di qualcuno.

| Regola | Chi la fa rispettare |
|---|---|
| solo `app` conosce Tauri | `Cargo.toml` (nessuna dipendenza da `tauri` altrove); `cargo-deny` per le dipendenze transitive (16.5) |
| i tier dipendono solo verso il basso | `Cargo.toml` |
| solo `store` apre la connessione in scrittura | un check con grep: `Connection::open` solo nel crate `store`. I file `store.rs` delle slice usano i tipi di `rusqlite`, quindi la sola dipendenza non basta. |
| `#[tauri::command]` solo in `app/*/commands.rs` | un check con grep |
| ogni comando è registrato | un check che confronta i comandi nelle slice con `generate_handler!` |
| `emit` solo in `app/*/events.rs` | un check con grep |
| nessun import profondo tra slice | un check che cerca `crate::<a>::<layer>::` da un'altra slice |
| nessuno `static` con stato in `core` | un check con grep per `static .*(Mutex|RwLock)` |
| `logic.rs` e `update.rs` non hanno I/O | un check: niente `async`, `tokio::`, `std::fs`, `store::`, `drivers::` in `logic.rs`, `logic/` e `update.rs` |
| il `mod.rs` di una slice contiene solo `mod …;` e `pub use …;` | un check su ogni `mod.rs` sotto `core/src/` |
| nessun ciclo tra slice | un check che costruisce il grafo delle slice dagli import e lo ordina |
| un comando Tauri ha al massimo 10 righe | un check su `app/*/commands.rs` |
| niente `unwrap()` e `panic!` fuori dai test in `core`, `store`, `drivers` | i lint Clippy `unwrap_used` e `panic` (16.5) |
| il sistema operativo solo in `drivers/src/platform/` e `app/src/platform.rs` | un check con grep basato sull'elenco della 12.3 |
| i crate diversi da `app` compilano su ogni piattaforma | `cargo check` su runner CI Ubuntu e Windows |
| limiti di dimensione | un check con una lista di baseline che può solo ridursi |

Ogni check parte da una **lista di baseline** con le violazioni di oggi. Una nuova violazione è rossa. Una violazione corretta va rimossa dalla lista nella stessa pull request, così la lista non può mai tornare a crescere.

### 16.1. Un check con una baseline

Tutti i check hanno la stessa forma: trovano le violazioni, sottraggono la baseline, falliscono su tutto ciò che resta e falliscono anche se la baseline elenca qualcosa di già corretto.

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

### 16.2. Un check deve poter fallire

Prima di fidarsi di un check, si inserisce una violazione reale, si osserva il check diventare rosso e poi la si rimuove. Un check che non è mai stato rosso non è mai stato testato.

I check con grep di SLAT cercano codice vietato, quindi una corrispondenza dentro un commento li fa diventare rossi, non verdi. È fastidioso ma sicuro, e la soluzione è cancellare il codice morto. Un check che legge l'albero sintattico (16.5) non ha questo problema. Il tipo pericoloso è un check che richiede la presenza di una stringa: passa grazie a un commento. Una regola del genere si dimostra eseguendo codice, non leggendo testo.

### 16.3. Il job di piattaforma in CI

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

In un repository reale, le versioni delle action vanno fissate a hash di commit completi. Il job compila soltanto: non esegue test sulle piattaforme che il prodotto non supporta ancora, quindi costa poco. Il passo della cache lo mantiene economico: senza, ogni pull request compila tutte le dipendenze da zero su due sistemi operativi.

### 16.4. I check del set completo

| Check | Regola |
|---|---|
| `checks/slat-commands.sh` | `#[tauri::command]` solo in `src-tauri/src/*/commands.rs` |
| `checks/slat-registered.sh` | ogni comando di una slice compare in `generate_handler!` |
| `checks/slat-emit.sh` | `emit` solo in `src-tauri/src/*/events.rs` |
| `checks/slat-deep-imports.sh` | nessun `crate::<slice>::<layer>::` da un'altra slice |
| `checks/slat-static-state.sh` | nessuno `static … Mutex|RwLock` in `crates/*-core*` |
| `checks/slat-pure.sh` | `logic.rs`, `logic/` e `update.rs` senza `async`, `tokio::`, `std::fs`, `store::`, `drivers::` |
| `checks/slat-slice-mod.sh` | il `mod.rs` di una slice contiene solo `mod …;` e `pub use …;` |
| `checks/slat-slice-cycles.sh` | nessun ciclo tra slice |
| `checks/slat-command-size.sh` | ogni `#[tauri::command]` ha al massimo 10 righe |
| `checks/slat-platform.sh` | i divieti della 12.3 fuori da `platform/` |
| `checks/slat-size.sh` | i file oltre 1.500 righe presenti nella baseline possono solo ridursi |

Il check dei cicli non ha bisogno di una libreria per i grafi. Ogni `use crate::<other>` dentro `core/src/<slice>/` è un arco, e `tsort` segnala un grafo con un ciclo sul suo output di errore:

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

Lo stesso elenco di archi è il grafo delle slice che la sezione 22.4 usa per trovare le slice che una modifica può toccare.

### 16.5. Lint e divieti prima degli script

Alcune regole non hanno bisogno di uno script, perché le può far rispettare uno strumento che il workspace esegue già.

**Clippy, per tier.** Clippy legge prima il `clippy.toml` nella cartella del crate stesso, quindi ogni tier può vietare cose diverse. I lint si attivano in `Cargo.toml`:

```toml
[workspace.lints.clippy]
unwrap_used = "deny"
panic = "deny"
```

```toml
[lints]
workspace = true
```

Il primo blocco va nella radice del workspace, il secondo in `kit`, `store`, `drivers` e `core`. Il crate `app` non li eredita. Un `clippy.toml` nella radice del workspace con `allow-unwrap-in-tests = true` e `allow-panic-in-tests = true` mantiene leggibili i test. Un `clippy.toml` nella cartella di un crate sostituisce quello della radice, quindi ripete quelle due righe. Un `clippy.toml` in `core` può elencare `disallowed-methods` e `disallowed-types`, per esempio `std::process::Command` e `std::sync::Mutex`, così che un processo avviato da una slice o un lock dentro un attore sia un errore di lint, non una corrispondenza di grep.

**`cargo-deny`, per l'intero grafo delle dipendenze.** `Cargo.toml` blocca `use tauri::…` in `core`, ma non una libreria che porta dentro `tauri` dalla porta di servizio. Questa perdita è invisibile in review, e fa compilare ai test di `core` la parte più pesante dell'applicazione. `cargo-deny` verifica l'intero grafo. In `deny.toml`:

```toml
[bans]
deny = [
  { crate = "tauri", wrappers = ["quayside", "tauri-plugin-shell", "tauri-plugin-dialog"] },
]
```

A quel punto `tauri` può comparire solo come dipendenza diretta dei crate in `wrappers`: il crate `app` e i plugin Tauri che usa, che dipendono a loro volta da `tauri`. Un plugin aggiunto all'applicazione entra nell'elenco nella stessa pull request. Qualsiasi altro percorso verso `tauri`, come una libreria usata da `core`, è rosso.

**La sintassi al posto del testo.** I check con grep della 16.4 si possono scrivere come regole `ast-grep`. `ast-grep` confronta l'albero sintattico di Rust, quindi un commento o una stringa non corrispondono mai, e un import diviso su più righe (`use crate::run::{logic::plan, model::Run};`) resta un solo import. Un file di regole per check, con glob `files` e `ignores` presi dai percorsi della 16.4, sostituisce `grep -E`. La lista di baseline (16.1) resta com'è: le regole producono l'elenco delle violazioni, e lo stesso script sottrae la baseline.

## 17. Ricette

Ogni ricetta parte da un test che fallisce sul vecchio codice, su un'asserzione e non in compilazione. In Rust si scrive prima la firma con `todo!()`, così il test compila e fallisce per il motivo giusto.

### 17.1. Una nuova lettura (Query)

1. `core/<s>/model.rs`: il tipo del risultato, se non esiste.
2. `core/<s>/store.rs`: la funzione di lettura. Va testata su un database temporaneo.
3. `core/<s>/service.rs`: `pub async fn <verb>(…)` che chiama store e logic.
4. `core/<s>/mod.rs`: `pub use` della nuova funzione o del nuovo tipo.
5. `app/<s>/dto.rs`: il DTO e `From<model>`.
6. `app/<s>/commands.rs`: un comando di al massimo 10 righe, da registrare.
7. Front-end: il livello data-access chiama il comando.

### 17.2. Una nuova modifica senza stato in background (Command)

Come nella 17.1, ma la decisione (è consentito? che cosa cambia?) si scrive in `logic.rs` come funzione pura con un test. `service.rs` si limita a chiamarla e a eseguire la scrittura.

### 17.3. Una nuova slice

1. Nome: la funzionalità come sostantivo singolare in `snake_case`.
2. `core/src/<s>/mod.rs` più solo i file necessari; `pub mod <s>;` in `core/src/lib.rs`.
3. `app/src/<s>/mod.rs`, `commands.rs`, `dto.rs`; registrare i suoi comandi.
4. Se la slice ha stato in background: ricetta 17.4.

### 17.4. Un nuovo flusso con stato (attore)

1. Verificare le tre condizioni della 9.1. Se una non vale: ricetta 17.2.
2. `msg.rs`, `state.rs`, `snapshot.rs`: i tipi.
3. `update.rs`: prima i test (messaggio in ingresso, effetti e stato attesi in uscita), poi l'implementazione.
4. `effect.rs`: `execute` per ogni effetto; i risultati tornano come `Msg`.
5. `run.rs` e `handle.rs`: il ciclo e la porta.
6. `AppState` riceve esattamente un campo: il registro o l'`Handle`.
7. `app/<s>/events.rs`: iscriversi allo `Snapshot` ed eseguire `emit("<s>:snapshot")`.

### 17.5. Un nuovo driver (il mondo esterno)

1. `drivers/src/<name>.rs` o una cartella. Un driver non conosce né slice né database.
2. Un trait solo quando ci sono almeno due implementazioni.
3. Un processo: gruppo di processi, escalation della terminazione, prova della morte; segreti fuori da argomenti e log. Tutto attraverso i contratti di `platform` (12.2), mai con una chiamata di sistema nel driver.
4. Una slice usa il driver da `service.rs` o da `effect.rs`.

### 17.6. Un nuovo evento per la finestra

1. Una modifica in `core` pubblica uno `Snapshot` o un `Event` su un canale.
2. `app/<s>/events.rs` si iscrive ed emette `<s>:<event>`.
3. Front-end: il livello data-access ascolta e aggiorna il proprio store.

### 17.7. Una nuova piattaforma

Sezione 12.7.

### 17.8. Dove va questo? (albero decisionale)

```
Chiama Tauri, la finestra, MCP o un hub remoto?           → app (commands, events, doors)
Dipende dal sistema operativo?                            → drivers/src/platform/ (sezione 12)
Parla con un processo, la rete, un portachiavi?           → drivers (tramite i contratti di piattaforma)
È una lettura/scrittura del database o lo schema?         → store (connessione) / core/<s>/store.rs (query)
È una decisione pura o un calcolo?                        → core/<s>/logic.rs (o update.rs in un attore)
È un tipo del dominio?                                    → core/<s>/model.rs
È una sequenza di passi con I/O?                          → core/<s>/service.rs
È stato che vive in background e che la finestra osserva? → core/<s>/actor/
Si può disattivare mentre il resto continua a funzionare? → una slice di plugin (sezione 23)
Non ha alcun dominio (tempo, percorsi, id, file)?         → kit
```

## 18. Lavorare con gli agenti di coding

SLAT è nato in un team in cui gran parte del codice è scritta da agenti di coding. Gli agenti seguono una struttura in modo affidabile quando è scritta, breve e verificata da macchine. Tre cose fanno la differenza.

1. **Una struttura fissa è una mappa gratuita.** Un agente a cui si chiede di "aggiungere un filtro alle trascrizioni" apre `core/transcript/` e `app/transcript/` senza cercare. Il tempo che un agente passa a cercare è tempo in cui sbaglia.
2. **Un check batte una frase nel prompt.** "Non emettere eventi da core" scritto in un prompt viene rispettato quasi sempre. Un check rosso viene rispettato sempre. La regola si scrive prima come check, e come riga di prompt solo quando non si può verificare.
3. **Le ricette sono prompt.** La sezione 17 è scritta di proposito come passi numerati: si incolla la ricetta nel task, e l'agente produce i file nei posti attesi e nell'ordine atteso.

Gli agenti cambiano anche il modo in cui si compila un workspace. Più agenti in più copie di lavoro sono più build a freddo delle stesse dipendenze nello stesso momento, cioè il portatile bloccato della sezione 19.2. La sezione 22.5 mostra come ogni copia di lavoro parte calda senza condividere una cartella `target/` con un'altra, e la sezione 22.4 come ognuno esegue solo i test che la propria modifica può toccare.

Una sezione da copiare nella guida per chi contribuisce al repository (`AGENTS.md`, `CLAUDE.md` o equivalente):

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

## 19. Migrare una codebase esistente

Non serve riscrivere tutto. SLAT si adotta con piccole pull request che mantengono l'applicazione funzionante per tutto il tempo, in un ordine che non blocca gli altri branch.

:::diagram migration

### 19.1. L'ordine

1. **Misurare.** Mappare i moduli: righe per modulo, import che puntano verso l'alto, file che usano `tauri::`, numero di `#[tauri::command]`, `static` con stato, campi dello stato dell'applicazione, `#[cfg]` per sistemi operativi. Scrivere tutto in un piano nel repository. Questi numeri sono le baseline.
2. **Invertire le dipendenze verso l'alto.** Le policy che vivono nel livello dei comandi ma sono chiamate dai livelli inferiori scendono in `core/<policy>/`. I tipi che il dominio prende in prestito dal livello di ingresso (un canale di righe, un tipo immagine, una stringa di messaggio) passano alla slice a cui appartengono. Il vecchio percorso resta come `pub use` fino alla fine della migrazione.
3. **Separare `app` e `core`.** Creare il workspace e un crate `core` senza `tauri`. Il codice che conosce Tauri resta in `app`; tutto il resto si sposta con `git mv`. È il passo più meccanico.
4. **Separare `store`, `drivers` e `kit`.** Solo quando il loro codice è già pulito. Quando si separa `drivers`, il codice del sistema operativo va in `platform/`, e il check di piattaforma riceve la sua baseline.
5. **Slice dopo slice.** Una slice per pull request: i comandi in `app/<s>/`, la logica in `core/<s>/` con la struttura fissa. Si parte dalla più piccola e meno condivisa.
6. **`kit::Jobs`.** Le mappe di annullamento escono dallo stato dell'applicazione.
7. **Attori.** Lo stato che vive nello stato dell'applicazione e nelle variabili `static` passa negli attori, un flusso per pull request, con i test di `update` scritti prima, sul comportamento attuale.
8. **Check.** Ogni passo attiva il check della propria regola, con una baseline.

### 19.2. Regole della migrazione

- **Gli spostamenti non cambiano il comportamento.** Una pull request che sposta codice non corregge logica, e una pull request che corregge logica non sposta codice. Quando qualcosa si rompe, si sa quale tipo di modifica l'ha causato.
- **Facade sui vecchi percorsi.** `pub use new::place::*;` nel vecchio percorso del modulo permette di compilare senza modifiche il codice che non si può toccare (o che non si vuole ancora toccare) e i test esistenti. Una facade si rimuove quando nessuno la importa più.
- **Una build pesante alla volta.** Più build `cargo` parallele di un workspace grande possono bloccare un portatile. La migrazione procede in fila.
- **L'intera suite di test si esegue dopo ogni passo**, non dopo ogni commit. La suite è la prova che il comportamento non è cambiato.

### 19.3. Prima la struttura, per partire più in fretta

Se il problema principale è trovare il codice, si può riordinare il lavoro: prima si spostano i **file** nelle cartelle delle slice dentro l'unico crate esistente, senza cambiarne il contenuto, lasciando facade sui vecchi percorsi. Git li registra come rinomine, quindi gli altri branch aperti continuano a fare merge senza problemi. La mappa (la cartella di ogni funzionalità) arriva in un giorno o due; la separazione dei crate, i layer dentro ogni slice e gli attori seguono dopo, su una struttura già leggibile.

Anche qui, due cose non sono gratuite. I file che usano `super::` o `pub(super)` cambiano modulo padre quando si spostano, quindi alcuni percorsi richiedono piccole correzioni meccaniche. E spostare i comandi fuori da un file centrale modifica quel file, il che crea conflitti con i branch che lo toccano: meglio farlo come secondo passo separato.

### 19.4. Cosa va storto di solito

| Problema | Cosa fare |
|---|---|
| Centinaia di test importano vecchi percorsi | Facade sui vecchi percorsi. Non spostare i test nelle stesse pull request. |
| I branch paralleli vanno in conflitto con `git mv` | Separare i crate quando ci sono meno branch aperti. Ogni spostamento è una pull request a sé. |
| Dopo la separazione, elementi `pub(crate)` servono da un altro crate | Renderli `pub`. Dopo la migrazione, verificare cosa può tornare a `pub(crate)`. |
| Il tempo di compilazione cresce con il numero di crate | Al massimo da sei a otto crate. Una build pesante alla volta. Misurare con `cargo build --timings` prima e dopo ogni separazione (22.6). |
| Un refactoring cambia il comportamento senza che nessuno se ne accorga | Prima i test di `update`, sul comportamento di oggi. Spostamenti e correzioni in pull request separate. |
| Una parte del codice non può cambiare affatto (una funzionalità critica, un'area congelata) | Resta dov'è e raggiunge la nuova struttura solo tramite facade. Le facade sono codice aggiuntivo. |

## 20. Caso di studio: Quayside

Quayside è un'applicazione desktop **fittizia**, inventata per questo documento. Si ispira vagamente al tipo di software che costruiamo, ma ogni nome, numero e file qui sotto è inventato. Quayside registra chiamate, le trascrive sul dispositivo, scrive un riassunto con un modello locale o cloud, esegue le attività successive con agenti di coding, sincronizza le azioni da fare su una board condivisa del team e ha un'app companion per il telefono che può seguire una registrazione e aggiungervi una nota.

Da due anni la sviluppa un piccolo team sempre di corsa, e funziona. È anche un manuale di tutto ciò che descrive la sezione 1.

### 20.1. Prima

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

La misurazione del passo 1 della migrazione:

| Cosa | Valore |
|---|---|
| Righe Rust (senza test) | ~78.000 |
| File che usano `tauri::` | 37 su 112 |
| Funzioni `#[tauri::command]` | 148, in 4 file |
| Campi di `AppState` | 41, di cui 14 sono `Mutex<…>` o atomici |
| `static` con stato | 12 |
| Punti che aprono una connessione SQLite in scrittura | 9 |
| File con `#[cfg(target_os = …)]` | 23 |
| Varianti di `start_recording_*` | 7 |
| Tempo per eseguire i test di dominio | richiedono una finestra, quindi nessuno li esegue |

### 20.2. Sintomi nel codice

Lo stato dell'applicazione, in forma ridotta:

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

Uno stop che si trascina da una registrazione all'altra. La persona preme Stop, poi avvia subito una nuova registrazione. Il ciclo della vecchia registrazione non ha ancora letto il flag; la nuova registrazione non azzera nulla; il controllo successivo di `recording_cancel` ferma la **nuova** registrazione:

```rust
static RECORDING_CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn stop_recording() {
    RECORDING_CANCEL.store(true, Ordering::SeqCst);
}
```

Il dominio parla direttamente con la finestra, quindi non si può testare senza:

```rust
pub async fn transcribe(app: AppHandle, file: PathBuf) -> Result<(), String> {
    let mut words = whisper::stream(&file)?;
    while let Some(word) = words.next().await {
        app.emit("transcript-word", &word).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

Le varianti si moltiplicano:

```rust
pub async fn start_recording(…)
pub async fn start_recording_with_limit(…)
pub async fn start_recording_with_limit_and_device(…)
pub async fn start_recording_for_meeting(…)
pub async fn start_recording_for_meeting_with_limit(…)
pub async fn start_recording_from_companion(…)
pub async fn start_recording_with_test_hook(…)
```

E il sistema operativo è ovunque:

```rust
#[cfg(target_os = "macos")]
fn reveal(path: &Path) {
    let _ = Command::new("sh").arg("-c").arg(format!("open -R '{}'", path.display())).spawn();
}
```

Quest'ultimo è anche una shell injection che aspetta solo un nome di file con un apice.

### 20.3. La migrazione, passo dopo passo

**Passo 2: invertire le dipendenze.** Il transcriber smette di ricevere un `AppHandle`. Scrive le parole in un canale limitato che appartiene a `core`; `app` pompa il canale verso la finestra. Il codice di upload smette di leggere `AppState` e riceve come argomenti i due valori che gli servono.

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

**Passo 3: separare `app` e `core`.** Un workspace con `quayside-core` (senza `tauri`) e l'attuale `src-tauri` come `app`. Il `lib.rs` dell'app mantiene `pub use quayside_core::{…};`, così ogni vecchio percorso compila ancora. La prova: inserire `use tauri::Manager;` in `core` produce un errore di compilazione.

**Passo 4: `kit`, `store`, `drivers`.** Le nove aperture di SQLite confluiscono in un unico writer in `quayside-store`. Registratore, transcriber, client dei modelli e `git` passano in `quayside-drivers`. I 23 file con `#[cfg]` diventano una sola cartella `platform/` con `unix.rs`, `macos.rs` e `unsupported.rs`, e `reveal` diventa un contratto:

```rust
pub fn reveal_path(path: &Path) -> Result<(), PlatformError> {
    let status = Command::new("/usr/bin/open").arg("-R").arg(path).status()?;
    status.success().then_some(()).ok_or(PlatformError::Refused("open -R"))
}
```

Niente shell, niente quoting, niente injection.

**Passo 5: slice.** `handlers.rs` e `utils.rs` vengono smontati in slice, partendo dalle più piccole:

```
settings → device → llm → summary → transcript → board → companion → agent → recording
```

**Passo 6: `kit::Jobs`.** `transcribing` e `summarizing` (due mappe con token di annullamento) diventano un `Jobs<TranscriptId>` dentro il servizio delle trascrizioni e un `Jobs<SummaryId>` dentro il servizio dei riassunti.

**Passo 7: attori.** Tre porzioni di stato superano il test della 9.1: la registrazione, le esecuzioni degli agenti e la sincronizzazione della board. La registrazione va per prima, con test di `update` scritti sul comportamento attuale. L'`AtomicBool` sparisce; Stop ora porta la generazione della registrazione a cui si riferisce, e la fuga descritta nella 20.2 diventa un test di una riga che resta verde per sempre. Le sette funzioni `start_recording_*` diventano una sola:

```rust
pub struct StartRecording {
    pub title: String,
    pub device: Option<DeviceId>,
    pub meeting: Option<MeetingId>,
    pub limit: Option<Duration>,
    pub origin: Origin,
}
```

**Passo 8: check.** Ogni check della sezione 16 si attiva con la propria baseline. La maggior parte delle baseline è già vuota, perché i passi precedenti hanno eliminato le violazioni.

### 20.4. Dopo

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

Un comando dopo la migrazione:

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

La stessa misurazione, ripetuta:

| Cosa | Prima | Dopo |
|---|---|---|
| File che usano `tauri::` | 37 | 12, tutti in `src-tauri` |
| Comando più lungo | 140 righe | 9 righe |
| Campi di `AppState` | 41 | 9 |
| `static` con stato | 12 | 0 |
| Connessioni SQLite in scrittura | 9 punti | 1 |
| File con un `#[cfg]` di sistema operativo | 23 | 3, tutti in `platform/` |
| Varianti di `start_recording_*` | 7 | 1 |
| Test di dominio | richiedevano una finestra | girano in pochi secondi, senza finestra |
| Compila per Linux e Windows (tranne `app`) | no | sì, verificato in CI |

Questi numeri sono illustrativi. Conta la forma del cambiamento: ogni riga si è spostata verso un solo proprietario, un solo posto e una sola regola.

## 21. Checklist di adozione e FAQ

### 21.1. Checklist per un nuovo progetto

- Workspace con due crate: `<product>-core` (senza `tauri`) e il crate `app`.
- `kit::paths` dal primo giorno; nessun percorso home o temporaneo scritto a mano.
- `drivers/src/platform/` con `mod.rs`, `unix.rs`, il file della propria piattaforma e `unsupported.rs`, appena compare la prima chiamata di sistema.
- Ogni funzionalità come slice con i file fissi; comandi di al massimo 10 righe.
- Eventi solo da `app/<slice>/events.rs`.
- Un solo target per i test di integrazione, `tests/it/`.
- I check della sezione 16 in CI dalla prima settimana, quando le baseline sono ancora vuote.
- Le impostazioni di build della sezione 22: informazioni di debug con `strip = false`, linker, un solo insieme di feature, `.taurignore`, una cache di compilazione in CI scritta solo da `main`.
- Le librerie native pesanti in un crate driver da cui `core` non dipende (5.3).
- La sezione SLAT della 18 nella guida per chi contribuisce.

### 21.2. Checklist per un progetto esistente

- Tabella delle misurazioni committata come piano (19.1, passo 1).
- Liste di baseline create per ogni check che verrà attivato.
- Una decisione su cosa non può cambiare, e facade per proteggerlo.
- Passi da 2 a 8 pianificati come pull request separate, con le separazioni dei crate programmate quando ci sono pochi branch aperti.

### 21.3. Domande

**SLAT è solo per Tauri?**
No. Basta sostituire "comando Tauri" con il proprio punto di ingresso (handler HTTP, sottocomando CLI, consumer di messaggi) e tenere tutto il resto. Il tier `app` è semplicemente "l'unico crate che conosce il framework del punto di ingresso".

**Perché non un'architettura esagonale con porte ovunque?**
Le porte come trait valgono la pena quando ci sono due implementazioni. La maggior parte dei driver in un'applicazione desktop ne ha una sola. SLAT mantiene tipi concreti finché non esiste una seconda implementazione, e ottiene la testabilità dalle funzioni pure `logic`/`update` e dai punti di giunzione sui dati.

**Cinque tier non sono troppi per un'app piccola?**
Si parte con due (`core` e `app`). Gli altri si aggiungono quando il loro codice esiste ed è pulito.

**Tutte le slice hanno bisogno di tutti i file?**
No. Un file che non serve non esiste. Una slice piccola può essere un unico `mod.rs`.

**Quando qualcosa è un attore e non un servizio?**
Quando valgono tutte e tre le condizioni della 9.1. Nel dubbio, è un servizio. Trasformare più avanti un servizio in un attore è una modifica circoscritta dentro una sola slice.

**E se due slice hanno bisogno l'una dell'altra?**
La parte condivisa diventa una slice a sé, ed entrambe dipendono da essa. I cicli non sono mai ammessi.

**Perché il limite per i comandi è di 10 righe?**
Perché un comando che si limita a tradurre non ha bisogno di un test unitario proprio. Dieci righe bastano per deserializzare, chiamare e convertire; non bastano per nascondere una decisione.

**SLAT rallenta la compilazione?**
Dividere in crate di solito accelera le build incrementali, perché una modifica a una slice non ricompila `kit`, `store` o `drivers`. Può rallentare leggermente una build da zero per i binari di test in più da linkare, ed è per questo che SLAT limita il numero di crate. La sezione 22 elenca le impostazioni che contano più del numero di crate.

**Distribuiamo solo su macOS. La sezione 12 vale la pena già adesso?**
Sì, la sua parte economica: `kit::paths`, contratti per le poche chiamate di sistema già presenti, `unsupported.rs` e il job di compilazione su Linux e Windows. Costa qualche giorno adesso e risparmia più avanti una ricerca nell'intera codebase. I file `linux.rs` e `windows.rs` veri e propri possono aspettare la decisione di fare il port.

**Come se la cavano gli agenti di coding con SLAT?**
Bene, perché la struttura è fissa e le regole importanti sono check, non consigli. Vedi la sezione 18.

## 22. Tempi di build e di test

*Novità della versione 1.2.*

Il risparmio più grande in SLAT viene dalla sezione 5: solo `app` conosce Tauri, quindi i test di ogni altro crate non compilano mai Tauri e la web view che ci sta dietro. Il secondo viene dalla 5.3: una libreria nativa pesante sta in un crate driver da cui `core` non dipende, quindi nemmeno i test di `core` la compilano mai. Il resto del tempo dipende da poche impostazioni e abitudini, ognuna una riga o due di configurazione. Questa sezione le elenca nell'ordine di quanto fanno risparmiare di solito, e si chiude con le cose che fanno ripartire una build da capo quando non dovrebbe.

Prima si misura. `cargo build --timings` scrive un report HTML con il tempo di compilazione di ogni crate e quanti ne sono stati compilati in parallelo. Si conserva il report di prima di una modifica e si confronta.

### 22.1. Dove va il tempo

- **Un crate di libreria viene compilato, non linkato.** Ciò che viene linkato è ogni binario, e in un'esecuzione dei test ogni binario di test.
- **Ogni crate può avere tre tipi di binari di test:** i suoi unit test, ogni file messo direttamente in `tests/` (la sezione 14.1 li riduce a uno, `tests/it`) e i suoi esempi di documentazione. Dall'edizione 2024, gli esempi di documentazione di un crate vengono compilati come un solo binario. Un crate senza esempi di documentazione imposta `doctest = false` sotto `[lib]`.
- **Un'esecuzione dei test sotto `app` non ha mai bisogno di Tauri.** Il comando di tutti i giorni è `cargo nextest run --workspace --exclude quayside`. Solo i test end-to-end della sezione 14 compilano il crate `app`.
- **Una libreria nativa pesante costa più di Tauri.** I sorgenti C e C++ compilati dagli script di build, e i crate di machine learning, prendono la maggior parte di una build pulita e la maggior parte del link di ogni binario che li include. La sezione 5.3 li tiene fuori dai test di `core`.
- **Le informazioni di debug sono una grossa parte del tempo di link.** La maggior parte non viene mai letta.

### 22.2. Impostazioni di build

Nel `Cargo.toml` della radice del workspace:

```toml
[profile.dev]
debug = "line-tables-only"
split-debuginfo = "unpacked"

[profile.dev.package."*"]
debug = false
strip = false
```

I propri crate mantengono file e numeri di riga nei backtrace; le dipendenze non ricevono informazioni di debug. Si torna a `debug = true` per una sessione quando serve un debugger.

`strip = false` non è facoltativo su macOS. Con `debug = false`, Cargo per impostazione predefinita fa anche lo strip di quelle unità, e su macOS 27 lo `strip` di sistema danneggia le librerie dinamiche delle macro procedurali: `serde_derive` non si può più caricare e una build pulita fallisce. `split-debuginfo = "unpacked"` è scritto in modo esplicito, così il fatto che `dsymutil` venga eseguito dopo ogni link su macOS non dipende dal valore predefinito di una certa versione di Cargo.

Il linker conta soprattutto per i binari di test. Su Linux per x86-64, Rust usa `rust-lld` come predefinito dalla versione 1.90. Gli altri target Linux possono usare `mold`. Su macOS, il linker fornito con Xcode 15 e successivi è già veloce, quindi va lasciato com'è. Su Windows, `rust-lld` è di solito molto più veloce del linker predefinito. In `.cargo/config.toml`:

```toml
[target.aarch64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]

[target.x86_64-pc-windows-msvc]
linker = "rust-lld.exe"
```

**Si ottimizzano le dipendenze in cui i test passano il loro tempo.** Una build di sviluppo compila ogni dipendenza senza ottimizzazione, compresi un database cifrato compilato da sorgenti C, un cifrario o una funzione di hash che i test chiamano milioni di volte. Ottimizzare solo quei pacchetti rende i test più veloci e lascia invariata la build di release. In uno dei nostri workspace questo ha portato un'esecuzione dei test da 170 a 102 secondi:

```toml
[profile.dev.package.libsqlite3-sys]
opt-level = 3

[profile.dev.package.sha2]
opt-level = 3
```

Ogni riga costa una ricompilazione di quel pacchetto. Si misura l'esecuzione dei test prima e dopo, e si tengono solo i pacchetti che l'hanno cambiata.

Si rimuovono le dipendenze che nessuno usa: `cargo machete` le elenca, e ognuna è tempo di compilazione per niente.

### 22.3. Un solo insieme di feature

Cargo compila una dipendenza una volta per ogni insieme distinto di feature che gli viene richiesto. In un workspace SLAT, due cose richiedono insiemi diversi:

1. **Comandi diversi.** `cargo test --workspace` unifica le feature di tutti i membri, `cargo test -p quayside-core` solo quelle che servono a `core`. Eseguire entrambi compila due volte `tokio`, `serde` e il resto. `cargo-hakari` risolve il problema: mantiene un crate generato `workspace-hack` da cui dipende ogni membro, con l'unione di tutte le feature, così ogni comando compila le dipendenze allo stesso modo. `cargo hakari generate` lo aggiorna, e `cargo hakari verify` in CI fallisce quando qualcuno se ne è dimenticato.
2. **Feature di test dei propri crate.** La feature `fake` della 14.2 e `test-hooks` della sezione 10 cambiano `drivers` e `core`, quindi ogni crate sopra di essi viene ricompilato quando la feature cambia. È preferibile un punto di giunzione sui dati (14.2), che non richiede alcuna feature. Dove una feature è necessaria, ogni comando di test la attiva allo stesso modo. Quel comando si mette in un solo posto, in `.cargo/config.toml`:

```toml
[alias]
t = "nextest run --workspace --exclude quayside --features quayside-drivers/fake --no-tests=fail"
```

Tutti, compresi gli agenti e la CI, eseguono `cargo t` per l'intera suite, e ogni comando di test più ristretto è `cargo t` con un filtro in più (22.4). Un comando di test con un elenco di pacchetti o di feature diverso è una seconda build.

### 22.4. Eseguire ciò che una modifica può toccare

La struttura fissa dice a quale slice appartiene un file, e il grafo delle slice del check dei cicli (16.4) dice quali slice dipendono da essa. Insieme danno a ogni tipo di modifica il proprio insieme di test:

| Cosa è cambiato | Cosa viene eseguito |
|---|---|
| `logic.rs`, `model.rs`, `store.rs`, `service.rs` o `actor/` dentro una slice, con il suo `mod.rs` invariato | i test di quella slice, e `cargo mutants --in-diff` (14.3) |
| il `mod.rs` di una slice, la sua API pubblica | quella slice e ogni slice che la importa |
| un modulo di `tests/it` | quel modulo |
| `kit`, `store` o `drivers` | ogni crate che ne dipende: `cargo t -E 'rdeps(quayside-store)'` |
| `drivers/src/platform/` | anche il test di contratto (12.5); in CI, il job di piattaforma (16.3) |
| solo `app` | i test end-to-end attraverso il punto di ingresso; in `core` non è cambiato nulla |
| `Cargo.toml`, `Cargo.lock`, `.cargo/`, il file della toolchain | tutto |

Un filtro sceglie quali test vengono **eseguiti**, non cosa viene **compilato**: nextest compila prima ogni pacchetto indicato dalle opzioni di Cargo, poi applica `-E`. Per questo ogni riga mantiene i pacchetti e le feature di `cargo t` e restringe solo con `-E`. La build resta quella che è già in `target/`, e solo l'esecuzione si accorcia. Restringere la build con `-p` fa risparmiare tempo di compilazione solo quando `cargo-hakari` (22.3) mantiene le feature uguali; senza, `-p` è una seconda build delle dipendenze.

I test di una slice sono facili da selezionare perché i loro nomi iniziano con la slice: gli unit test stanno in `core/src/<slice>/`, quindi i loro nomi iniziano con `<slice>::`, e anche i moduli di `tests/it` iniziano con la slice (`recording_stops_on_time_limit`). Una prima versione della selezione sta in uno script breve. Confronta la copia di lavoro con il punto in cui il branch si è staccato da `main`, così contano anche le modifiche non ancora committate, che è ciò che serve al ciclo di un agente:

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

È volutamente prudente: una modifica a qualsiasi `mod.rs`, a un file in cima a `core/src/` o agli helper di test condivisi esegue tutto `core` invece di seguire il grafo delle slice. Quel passo si sostituisce con il grafo quando la suite di `core` diventa lenta.

La selezione serve alla velocità, non alla prova. Si usano tre livelli:

| Dove | Cosa viene eseguito |
|---|---|
| sulla propria macchina e nel ciclo di un agente | la selezione qui sopra |
| in CI su una pull request | ogni crate che dipende da un crate cambiato (`rdeps`) |
| su `main`, o nella merge queue | l'intera suite |

`--no-tests=fail` (14.1) resta attivo a ogni livello, così una selezione che non trova nulla è rossa, non silenziosamente verde.

### 22.5. Molte copie di lavoro

Gli agenti di coding lavorano spesso in parallelo, ognuno nella propria copia di lavoro. Senza attenzione, quattro agenti compilano le stesse dipendenze quattro volte nello stesso momento.

**Ogni copia di lavoro ha il proprio `target/`.** Non si puntano più copie verso una sola cartella, né con un link simbolico né con `CARGO_TARGET_DIR`. Sembra una cache condivisa, ma è un bug di correttezza. Due copie dello stesso workspace producono gli stessi nomi di artefatti e le stesse voci di fingerprint, quindi dopo `build A; build B; build A` Cargo può dare la copia A come `Fresh` mentre la libreria sul disco è stata compilata dai sorgenti di B. Un check allora giudica il codice di qualcun altro e risulta verde. In più, branch diversi si ricompilano a vicenda i crate a ogni cambio.

**Una nuova copia parte calda con un clone, non con una condivisione.** Quando si crea la copia di lavoro, si copia il `target/` della copia principale con un clone copy-on-write: `cp -c -R` su macOS (APFS), `cp --reflink=auto -R` su Btrfs o XFS. Richiede pochi secondi e nessuno spazio su disco finché un file non cambia. Le dipendenze restano aggiornate, e Cargo ricompila solo i propri crate, perché i loro sorgenti sono più recenti di ciò che il clone ha registrato. Si misura una volta la prima build in una nuova copia; dovrebbe essere vicina a una build incrementale, non a una pulita.

**`sccache` è un complemento, non la risposta.** Si imposta come wrapper del compilatore, nel `~/.cargo/config.toml` dell'utente o nell'ambiente (`RUSTC_WRAPPER=sccache`), e la sua cache locale è condivisa da tutte le copie di lavoro sulla macchina. Mette in cache la compilazione delle normali dipendenze di libreria. Non mette in cache le macro procedurali, i binari, i crate `cdylib` né i propri crate, che Cargo compila in modo incrementale, e non mette in cache il link. Linkare i binari di test è ciò che ogni copia di lavoro paga di più, e solo la 14.1, la 22.2 e il clone qui sopra lo riducono.

Con `CARGO_BUILD_JOBS` si limita quanta parte della macchina può prendere una build, per esempio metà dei core, così una seconda build rallenta invece di bloccare la macchina. La regola della sezione 19.2 vale ancora: una build pesante alla volta.

### 22.6. CI

- **Una cache in ogni job Rust**, compreso il job di piattaforma della 16.3. `Swatinem/rust-cache` conserva le dipendenze e la cartella target tra un'esecuzione e l'altra, con `Cargo.lock` e la toolchain come chiave.
- **La cache si scrive solo da `main` e si legge ovunque.** Un'esecuzione di una pull request può leggere la cache del proprio ref e del branch predefinito, nient'altro, quindi una cache scritta da una pull request aiuta solo quella pull request, mentre il branch predefinito, dove guardano tutte le altre pull request, resta vuoto. Si imposta `save-if: ${{ github.ref == 'refs/heads/main' }}` e si esegue il workflow anche su `push` verso `main`, così ogni merge aggiorna la cache e la prima esecuzione di ogni pull request parte calda. In uno dei nostri repository questo ha portato la prima esecuzione da 942 a 478 secondi.
- **`CARGO_INCREMENTAL=0`** in CI. I dati incrementali sono grandi e inutili in un'esecuzione da zero. `Swatinem/rust-cache` lo imposta per conto suo; con qualsiasi altra cache, va impostato a mano.
- **I test sotto `app` su Linux.** Quando l'unico codice macOS sta in `drivers/src/platform/` e nei crate driver nativi della 5.3, i test di `kit`, `store` e `core` non hanno bisogno di macOS. Si eseguono su un runner Linux, che parte più in fretta e costa meno, e il runner macOS si tiene per `drivers`, `app` e il test di contratto.
- **Compilare una volta, testare in parallelo**, quando la suite dura più di qualche minuto: `cargo nextest archive` compila i binari di test in un job, e più job ne eseguono ciascuno una parte con `--partition hash:1/3`, `2/3`, `3/3`.
- **Un report dei tempi su `main`.** `cargo build --timings` come artefatto di ogni build di `main`. Quando la barra di `core` continua ad allungarsi dopo una modifica a una sola slice, quella è la misurazione che la sezione 5.3 chiede prima di una separazione.
- **`cargo hakari verify`** e **`cargo deny check`** accanto ai check della sezione 16. Entrambi richiedono pochi secondi.

### 22.7. Cosa fa ripartire una build da capo

Una build che riparte da capo senza un motivo visibile ha quasi sempre una di queste cause:

- **Uno script di build senza `rerun-if-changed`.** Un `build.rs` che non stampa alcun `cargo:rerun-if-changed` viene eseguito di nuovo dopo una modifica a qualsiasi file del suo pacchetto, e tutto ciò che usa il suo output viene ricompilato. Si stampa una riga per ogni input. Uno script che compila programmi di supporto (Swift, C) elenca i loro sorgenti. Non si elenca mai un percorso che non esiste: Cargo lo considera cambiato a ogni build.
- **`tauri dev` che osserva il proprio output.** Il server di sviluppo ricompila l'app quando cambia un file in `src-tauri/`. Un database, un log o un file generato che l'app scrive lì fa ripartire la build in un ciclo. I dati di runtime vanno sotto `kit::paths` (12.4); i file generati vanno in `.taurignore`.
- **L'editor e il terminale nella stessa cartella.** rust-analyzer esegue `cargo check` con le proprie impostazioni. Nello stesso `target/`, l'editor e il terminale o un agente aspettano il lock l'uno dell'altro e possono invalidare a vicenda il proprio lavoro. Si dà all'editor una cartella propria: `"rust-analyzer.cargo.targetDir": true`.
- **Ambienti diversi.** `RUSTFLAGS`, e le variabili che leggono gli script di build (`MACOSX_DEPLOYMENT_TARGET`, `CC`, `CFLAGS`), fanno parte di ciò che Cargo confronta. Se il terminale, l'editor e la shell di un agente le impostano in modo diverso, ogni passaggio dall'uno all'altro ricompila. Vanno in `.cargo/config.toml` (`[env]`, `[build] rustflags`), non nei profili della shell.
- **Una toolchain che si sposta.** Un nuovo compilatore ricompila tutto. Si fissa la versione completa in `rust-toolchain.toml`, in tre parti (`1.98.1`): un canale in due parti prende ogni nuova patch release senza una modifica nel repository.

### 22.8. Ripulire `target/`

Cargo non cancella mai i vecchi artefatti. Ogni branch, insieme di feature e versione di una dipendenza lascia file dietro di sé, e con centinaia di migliaia di file in `target/` ogni comando di Cargo diventa più lento. In uno dei nostri workspace `cargo clean` ha rimosso circa 960.000 file (119 GiB). Una build completa della libreria e dei suoi test è passata da 7–8 minuti a 36 secondi, e `cargo clippy --all-targets` da diversi minuti a 8 secondi.

Va fatto per regola, non per emergenza: quando `target/debug/deps` supera qualche decina di migliaia di file, o `target/` supera qualche decina di gigabyte, si esegue `cargo clean` e si accetta una build a freddo. `cargo sweep --time 30` è l'opzione più delicata: rimuove solo gli artefatti non usati da 30 giorni. Una copia di lavoro che viene rimossa porta con sé il proprio `target/`.

## 23. Plugin

*Novità della versione 1.3. Facoltativa.* Un prodotto che non ha bisogno di plugin salta questa sezione. Nessun'altra sezione dipende da questa, e un workspace senza plugin segue SLAT per intero.

Un plugin è una funzionalità che l'utente può attivare o disattivare mentre il resto del prodotto continua a funzionare allo stesso modo. Permette a un prodotto di restare piccolo per impostazione predefinita e di crescere per scelta. In SLAT un plugin non è un nuovo tipo di codice. È una slice, o qualcuna, con un manifest e una regola in più sulla direzione degli import. Ogni plugin viene compilato nell'applicazione: disattivarne uno significa che non viene assemblato all'avvio, non che manca dalla build.

:::diagram plugins

### 23.1. Quando una funzionalità è un plugin

Si fa di una funzionalità un plugin solo quando **tutte e tre** le condizioni sono vere:

1. il prodotto è utile senza di essa;
2. disattivarla non perde dati e non rompe nessun'altra funzionalità, tranne i plugin che hanno dichiarato di averne bisogno;
3. decide l'utente, non la build, la piattaforma o il canale di rilascio.

| Candidato | 1 | 2 | 3 | Verdetto |
|---|---|---|---|---|
| sincronizzazione delle azioni da fare con una board del team | sì | sì | sì | plugin |
| app companion per il telefono | sì | sì | sì | plugin |
| registrazione | no, è il prodotto | — | — | slice base |
| una funzionalità ancora in prova nel team | sì | sì | no, decide il team | un'impostazione, non un plugin |
| un menu che esiste solo su macOS | — | — | no, decide la piattaforma | sezione 12 |
| una build con logging extra | — | — | no, decide la build | un profilo Cargo |

Questa sezione usa due termini per le slice in `core`. Una **slice base** è sempre attiva. Una **slice di plugin** appartiene a un plugin. Entrambe vivono nel tier `core`: "base" dice qualcosa del prodotto, "core" del crate.

### 23.2. Struttura

Una slice di plugin ha la struttura della sezione 6 e un file in più in ogni tier:

```tree
core/src/<plugin>/
  plugin.rs     the manifest: id, what it needs, whether it starts on
  hooks.rs      its answers to the hooks of base slices, 23.4
  mod.rs  model.rs  logic.rs  store.rs  service.rs  actor/
app/src/<plugin>/
  mod.rs  commands.rs  dto.rs  events.rs
```

Un plugin con più slice tiene il manifest nella slice che porta il suo nome, e le altre sono sotto-slice di quella slice (6.1).

Il manifest è una costante:

```rust
pub const PLUGIN: Plugin = Plugin {
    id: PluginId("board"),
    needs: &[PluginId("account")],
    on_by_default: false,
};
```

`Plugin`, `PluginId`, il file che ricorda quali plugin sono attivi e la decisione su quali plugin possono essere attivi insieme appartengono a una slice base, `core/src/plugin/`. Ha i file consueti e nessun `plugin.rs`, perché non è a sua volta un plugin. Solo `app` elenca tutti i manifest, perché solo `app` può conoscere tutte le slice. L'elenco vive in `app/src/plugins.rs`:

```rust
pub const PLUGINS: &[Plugin] = &[account::PLUGIN, board::PLUGIN, companion::PLUGIN];
```

### 23.3. Direzione

La regola che fa funzionare i plugin: **una slice base non importa mai una slice di plugin.**

| Da | Può importare |
|---|---|
| una slice base | altre slice base |
| una slice di plugin | slice base; un'altra slice di plugin solo quando quel plugin è nei suoi `needs` |
| `app` | tutto |

Una slice base non nomina nemmeno un plugin: niente `if on.contains("board")`, nessun id di plugin in una stringa. Quando la base ha bisogno dell'aiuto di un plugin, offre un punto di estensione (23.4) e non sa chi risponde. Con tutti i plugin disattivati, la base compila, si avvia e passa i suoi test (23.8). È questo che rende onesto il "disattivato". Nascondere un pulsante mentre la base continua a chiamare il codice del plugin non è disattivarlo.

`needs` non ha cicli, per lo stesso motivo della 7.2.

### 23.4. Punti di estensione

Un plugin raggiunge la base in tre modi, da preferire in quest'ordine.

**1. Ascoltare.** La base pubblica già ciò che cambia, tramite il suo canale `Snapshot` o `Event` (8.3). Un plugin si iscrive nel proprio servizio o attore, e la base non cambia affatto. Esempio: il plugin della board si iscrive ai riassunti completati e trasforma le loro azioni da fare in schede.

**2. Rispondere a un hook.** Quando la base deve chiedere qualcosa in un punto del proprio flusso ("c'è qualcosa da aggiungere a questo riassunto?"), la slice base dichiara un hook nel suo `hooks.rs`, e ogni plugin gli risponde nel proprio `hooks.rs`:

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

Il servizio della slice base riceve i suoi hook quando `app` la assembla, come `Vec<Arc<dyn SummaryNotes>>`, e li interroga uno per uno. Con il plugin disattivato, l'elenco è vuoto e la base fa ciò che faceva prima che esistessero i plugin.

Tre regole per gli hook:

- **Un hook risponde con dati, subito, senza I/O.** Non è `async`. Un plugin che ha bisogno della rete o di un processo per rispondere tiene la risposta pronta nel proprio servizio o attore (qui, l'ultimo snapshot delle schede), e l'hook la legge. La base non aspetta mai un plugin, quindi un plugin lento non può rallentare la base.
- **Un hook non decide al posto della base.** Restituisce materiale, e cosa farne è una decisione nel `logic.rs` della slice base. Un hook che potrebbe rifiutare qualcosa (un controllo di accesso, un budget) è una policy, e una policy è una slice base (6.5): i plugin le aggiungono regole come dati, e decide la slice base.
- **Un trait di hook è l'unico trait ammesso con una sola implementazione.** La sezione 4 e la 14.2 vietano un trait finché non ci sono due implementazioni, perché fino ad allora non astrae nulla. Un hook è diverso: senza di esso la base dovrebbe importare il plugin. Ogni trait di hook sta in un `hooks.rs`, quindi l'eccezione è facile da trovare e da controllare (23.10).

**3. Avere il proprio punto di ingresso.** I comandi, i DTO, gli eventi e i doors del plugin vivono in `app/src/<plugin>/`, come quelli di qualsiasi altra slice. La base non li chiama mai.

### 23.5. Attivo e disattivato

- **Una sola build.** Un plugin non è una feature di Cargo. Una feature per plugin rende ogni combinazione di plugin una build separata e un insieme di test separato (22.3), e l'utente non può attivare o disattivare una feature.
- **La scelta è un file.** La slice `plugin` tiene l'insieme dei plugin attivi in un file sotto `kit::paths::config()` e lo legge una volta all'avvio. Se il file manca, ogni plugin ha il suo `on_by_default`.
- **`app` assembla solo ciò che è attivo.** Un plugin disattivato non ha servizio, attore, hook né ciclo di eventi. Il suo campo in `AppState` lo dice, nella stessa forma dell'account nella sezione 11:

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

`on.start` restituisce `Err(PluginOff)` senza chiamare la closure quando il plugin è disattivato.

- **I comandi di un plugin disattivato restano registrati.** `generate_handler!` è fissato quando l'applicazione viene compilata, quindi il comando esiste e risponde. `From<PluginOff> for IpcError` (sezione 13) dà alla finestra il codice `plugin_off`, e il comando ha ancora una sola riga di logica: `state.boards.as_ref()?.send(…)`.
- **Una modifica ha effetto al prossimo avvio**, e la finestra lo dice in una frase. Cambiare a caldo significa che il registro dei plugin diventa un attore (soddisfa tutte e tre le condizioni della 9.1) e che ogni elenco di hook può cambiare mentre la base è in esecuzione. Conviene farlo solo quando un riavvio è un problema reale.
- **Disattivare non cancella mai.** I file del plugin restano dove sono, le sue tabelle restano nello schema e le migrazioni di ogni plugin girano che sia attivo o no, quindi lo schema è lo stesso per ogni combinazione. Rimuovere i dati di un plugin è un'azione separata che l'utente richiede.
- **`needs` è una funzione pura.** `plugin::logic::resolve(manifests, wanted)` restituisce l'insieme dei plugin che possono essere attivi, oppure la dipendenza mancante. Attivare un plugin la cui dipendenza è disattivata, o disattivare un plugin di cui un altro ha bisogno, viene rifiutato con una frase che nomina l'altro plugin. L'utente cambia entrambi.

### 23.6. Front-end

SLAT non prescrive il front-end (1.2), solo il confine, e un plugin lo attraversa come qualsiasi altra slice. La slice `plugin` ha una query, `plugin_list`, che restituisce ogni manifest con il suo stato, e il front-end mostra le schermate di un plugin solo quando è attivo. La cartella front-end di un plugin ha il nome del plugin, come nella sezione 6. Una schermata di un plugin disattivato non viene renderizzata affatto; renderizzarla e nasconderla con uno stile non è disattivarla.

### 23.7. Un plugin nel proprio crate

Quando un plugin è pesante da compilare (5.3), o si vuole che a sorvegliare la 23.3 sia il compilatore invece di un check, lo si sposta in `<product>-plugin-<name>`. Dipende da `core`, `core` non dipende da esso, e `app` dipende da entrambi. La regola della 23.3 è allora scritta in `Cargo.toml`, come nella 5.1, e `wrappers` in `deny.toml` (16.5) tiene ogni altro crate lontano da esso. Conta tra i sei-otto crate della 5.3, quindi va fatto per un plugin pesante, non per ogni plugin.

### 23.8. Test

| Cosa | Come | Cosa conta come prova |
|---|---|---|
| la base senza plugin | `AppState` assemblato con tutti i plugin disattivati; i test end-to-end della base | le frasi che una persona vede nella base, invariate |
| `plugin::logic::resolve` | un semplice `#[test]` | l'insieme dei plugin, o la dipendenza mancante |
| l'hook di un plugin | un semplice `#[test]` sulla sua implementazione, con un valore di snapshot | i dati restituiti |
| un flusso della base con un hook | il servizio della base con un hook scritto nel modulo di test | la base ha usato ciò che l'hook ha restituito |
| un comando di un plugin disattivato | attraverso il punto di ingresso | la frase che la finestra mostra per `plugin_off` |

L'hook scritto in un modulo di test è la seconda implementazione del trait dell'hook, quindi un hook è il tipo di punto di estensione più facile da testare.

### 23.9. Trasformare una slice esistente in un plugin

1. **Misurare.** Si prendono gli archi dal check dei cicli della 16.4 e si elenca ogni slice base che importa la candidata. Quegli archi sono la baseline del check dei plugin (16.1).
2. **Invertire ogni arco**, una pull request alla volta: la base pubblica e il plugin ascolta (la prima scelta), oppure la base dichiara un hook e il plugin gli risponde. Spostamenti e correzioni restano in pull request separate (19.2).
3. **Aggiungere il manifest**, la sua riga in `PLUGINS` e il campo `Result<…, PluginOff>` in `AppState`. Si imposta `on_by_default: true`, così chi usa la funzionalità oggi la conserva.
4. **Dimostrarlo.** Quando la baseline è vuota, si eseguono i test della base con tutti i plugin disattivati (23.8). Solo allora il plugin può essere disattivato.

### 23.10. Applicazione delle regole

| Regola | Chi la fa rispettare |
|---|---|
| una slice base non importa mai una slice di plugin | `checks/slat-plugins.sh`, qui sotto; oppure `Cargo.toml` per un plugin nel proprio crate (23.7) |
| una slice di plugin importa un altro plugin solo quando è nei suoi `needs` | lo stesso check, confrontato con i `needs` dei manifest |
| nessun id di plugin in una slice base | un check con grep per `PluginId(` nelle slice base fuori da `core/src/plugin/` |
| un trait in `core` con una sola implementazione è un hook in un `hooks.rs` | una regola `ast-grep` per gli elementi `trait` in `core` fuori da `hooks.rs` (16.5), con una lista di base; ogni trait della lista ha due implementazioni (14.2) |
| ogni manifest è in `PLUGINS` | un check che confronta le cartelle con un `plugin.rs` con `app/src/plugins.rs`, come `slat-registered.sh` |
| la base funziona con tutti i plugin disattivati | il test della 23.8, in CI |

Le slice di plugin sono le cartelle che hanno un `plugin.rs`. Il check riusa gli archi del check dei cicli:

```bash
#!/usr/bin/env bash
set -euo pipefail

core="crates/quayside-core/src"
plugins="$(find "$core" -mindepth 2 -maxdepth 2 -name plugin.rs \
  | sed -E "s#^$core/([a-z_]+)/plugin\.rs#\1#" | sort)"
edges="$(grep -roE --include='*.rs' 'crate::[a-z_]+' "$core" \
  | sed -E "s#^$core/([a-z_]+)/[^:]*:crate::([a-z_]+)#\1 \2#" \
  | awk '$1 != $2 && NF == 2' | sort -u)"

wrong="$(awk 'NR == FNR { plugin[$1] = 1; next } !($1 in plugin) && ($2 in plugin)' \
  <(printf '%s\n' "$plugins") <(printf '%s\n' "$edges"))"
if [ -n "$wrong" ]; then
  printf 'a base slice imports a plugin slice:\n%s\n' "$wrong"
  echo "listen to what the base publishes, or answer a hook (23.4)"
  exit 1
fi
echo "plugins: $(printf '%s\n' "$plugins" | sed '/^$/d' | wc -l | tr -d ' ') plugin slices, no base slice imports one"
```

Mentre una slice viene trasformata in plugin (23.9), il check sottrae la sua baseline, come nella 16.1.

### 23.11. Plugin dall'esterno

Il codice scritto da altri e caricato mentre l'applicazione è in esecuzione è fuori da SLAT. Rust non ha un'interfaccia binaria stabile, e il codice caricato nel processo può far cadere con sé l'intera applicazione. Un'estensione dall'esterno gira come processo a sé e parla con l'applicazione attraverso un punto di ingresso in `app/src/doors/`, per esempio un server MCP, con le stesse regole di qualsiasi altro punto di ingresso. Dentro l'applicazione è un punto di ingresso, non un plugin.

## 24. Cronologia delle versioni

| Versione | Data | Modifiche |
|---|---|---|
| 1.3 | 25 ottobre 2026 | Sezione 23, *Plugin*, facoltativa: quando una funzionalità è un plugin, il manifest in `plugin.rs`, slice base che non importano mai slice di plugin, tre punti di estensione (ascoltare, rispondere a un hook, avere il proprio punto di ingresso), gli hook come l'unico trait ammesso con una sola implementazione, una sola build con la scelta in un file letto all'avvio, `Result<…, PluginOff>` in `AppState`, il confine con il front-end, un plugin nel proprio crate, test con tutti i plugin disattivati, trasformare una slice esistente in un plugin, `checks/slat-plugins.sh` e le estensioni dall'esterno come punti di ingresso. Vocabolario: plugin, slice base, hook. L'albero decisionale (17.8) e la sezione per la guida per chi contribuisce (18) citano i plugin. La cronologia delle versioni passa dalla sezione 23 alla sezione 24; le sezioni da 1 a 22 mantengono i loro numeri. |
| 1.2 | 25 ottobre 2026 | Sezione 22, *Tempi di build e di test*: dove va il tempo di compilazione, impostazioni di build (compresi `strip = false` e le dipendenze di test ottimizzate), un solo insieme di feature, eseguire i test che una modifica può toccare, un `target/` separato per ogni copia di lavoro avviato da un clone copy-on-write, CI con una cache scritta solo da `main`, cosa fa ripartire una build da capo e ripulire `target/`. Driver nativi pesanti in un crate da cui `core` non dipende (5.3). Nuove sottosezioni 14.3 (mutanti nel diff), 14.4 (test di proprietà per `update`) e 16.5 (Clippy, `cargo-deny`, `ast-grep`). Check per le regole che non ne avevano: purezza di `logic.rs`, il `mod.rs` di una slice, cicli tra slice, il comando di 10 righe, `unwrap()` e `panic!`. Punti di giunzione sui dati preferiti a una feature `fake`. Corretti il costo di un crate (5.2, 5.3), `resolver = "3"` per l'edizione 2024 (5.1), il passo della cache nel job di piattaforma (16.3). La cronologia delle versioni passa dalla sezione 22 alla sezione 23; le sezioni da 1 a 21 mantengono i loro numeri. |
| 1.1 | 25 ottobre 2026 | Sezione 12, *Piattaforme*: la cartella `platform/` in `drivers`, i contratti di piattaforma, i divieti fuori da `platform/`, le regole per percorsi, file e testo, i test di piattaforma, il job CI di compilazione su Linux e Windows, la ricetta per il port. Aggiunte a tier, applicazione delle regole, ricette e albero decisionale. |
| 1.0 | 24 ottobre 2026 | Prima versione: tier, slice con layer fissi, regole di import, flussi di dati, attori, lo stato dell'applicazione come composition root, errori, test, limiti di dimensione, applicazione delle regole, ricette e migrazione. |

SLAT ha un versionamento come quello di una libreria. Una nuova regola alza la versione minor quando arriva con una baseline: il codice di oggi resta conforme e solo le nuove violazioni sono rosse. È così che la 1.1 ha aggiunto le regole di piattaforma. Una modifica che rende non conforme del codice conforme senza una baseline che la assorba, come rinominare i file di una slice o invertire una dipendenza, alza la versione major. Le correzioni che non cambiano alcuna regola mantengono la versione. Ogni repository che segue SLAT indica nella propria guida per chi contribuisce la versione che adotta.
