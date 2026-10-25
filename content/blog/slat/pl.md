SLAT to wzorzec organizacji backendu aplikacji desktopowej napisanej w Rust, z Tauri jako warstwą okna. Odpowiada na trzy pytania, na które każda rosnąca baza kodu prędzej czy później odpowiada źle: **gdzie trafia ten plik**, **kto może importować kogo** i **jak dane przepływają** między oknem, domeną a światem zewnętrznym.

Nazwa wymienia cztery elementy składowe: **S**lice, **L**ayer, **A**ctor, **T**ier. Każda reguła w tym dokumencie dotyczy jednego z nich.

Ta strona jest kompletną dokumentacją. Napisaliśmy ją tak, żeby zespół, który nigdy nie widział SLAT, mógł wdrożyć go w nowym projekcie albo przenieść na niego istniejący, bez zadawania nam pytań. Zawiera reguły, ich uzasadnienie, kod do skopiowania, checki, które tych reguł pilnują, oraz przykład nieuporządkowanej aplikacji doprowadzanej krok po kroku do porządku.

Numery sekcji są stałe. Repozytorium, które stosuje SLAT, trzyma krótką kopię reguł w `docs/slat/SLAT.md` z tymi samymi numerami, więc odwołanie takie jak „sekcja 17.8” znaczy to samo na tej stronie i w repozytorium. Gdy te dwa teksty się rozchodzą, oba poprawia się tego samego dnia.

> **Wersja 1.1** · 25 października 2026. Wersja 1.1 dodaje sekcję 12, *Platformy*: jak trzymać kod zależny od systemu operacyjnego w jednym miejscu, żeby późniejszy port na Linuksa albo Windows był pracą w jednym folderze. Pełna historia jest w sekcji 22.

## 1. Po co jest SLAT

Aplikacja Tauri zaczyna się skromnie. Jest `main.rs`, kilka funkcji `#[tauri::command]`, może `state.rs`. Pół roku później ten sam projekt wygląda zwykle tak:

- jeden albo dwa ogromne pliki trzymają „komendy”, a komendy trzymają całą logikę biznesową;
- stan aplikacji to struktura z trzydziestoma polami, z czego połowa to `Mutex<Option<…>>` i `AtomicBool`;
- kilka zmiennych `static` trzyma kolejny stan, którego nikt nie jest właścicielem;
- logika domenowa woła `app.emit(…)` bezpośrednio, więc niczego nie da się przetestować bez okna;
- funkcje mnożą się w warianty: `start_with_budget`, `start_with_budget_and_slots`, `start_with_hook`;
- `#[cfg(target_os = "macos")]` jest rozsiane po całej bazie kodu;
- nowa osoba w zespole albo agent kodujący potrzebuje dnia, żeby znaleźć, gdzie mieszka dana funkcja produktu.

Nie powodują tego źli ludzie. Powoduje to brak wspólnej odpowiedzi na pytanie „gdzie to ma trafić?”. Gdy odpowiedzi nie ma, wygrywa najbliższy plik, a najbliższy plik to zawsze ten największy.

SLAT daje tę odpowiedź raz, dla każdego rodzaju kodu, i sprawia, że jej najważniejsze części są **mechaniczne**: kompilator i kilka małych skryptów odrzucają kod, który łamie układ, więc układ przetrwa terminy, nowe osoby w zespole i agentów kodujących.

SLAT jest dla backendu w Rust tym, czym Nx z NgRx jest dla frontendu: zestawem reguł niezależnym od konkretnej aplikacji. Stosujemy go w każdym produkcie MonoOne z backendem w Rust i Tauri, w tym w RigOne i IndexOne.

### 1.1. Cele

1. **Łatwość odnalezienia.** Osoba albo agent, który zna nazwę funkcji produktu, zna folder, w którym ona mieszka, po obu stronach aplikacji.
2. **Testowalność bez okna.** Wszystko poza cienką warstwą wejścia kompiluje się i uruchamia testy bez Tauri, bez ekranu i bez prawdziwych procesów.
3. **Granice, których pilnuje kompilator.** Kierunek zależności jest zapisany w `Cargo.toml`, a nie na wiki.
4. **Jeden właściciel długo żyjącego stanu.** Praca w tle (bieg, nagranie, rozmowa) ma dokładnie jednego właściciela, a jej reguły są czystą funkcją.
5. **Tani wzrost.** Nowa funkcja produktu to nowy folder ze stałym zestawem plików, a nie zmiany w pięciu współdzielonych plikach.
6. **Przenośność z założenia.** Kod zależny od systemu operacyjnego mieszka w jednym folderze, więc nowa platforma to nowy plik, a nie przeszukiwanie całego repozytorium.

### 1.2. Czego SLAT nie robi

- SLAT nie narzuca frontendu. Ustala tylko kontrakt na granicy: komendy, obiekty transferu danych (DTO) i zdarzenia.
- SLAT nie jest frameworkiem. Nie ma crate'a, od którego trzeba zależeć. To układ, zestaw reguł i kilka skryptów.
- SLAT nie zastępuje reguł waszego repozytorium. Gdy reguła projektu i SLAT się nie zgadzają, **wygrywa reguła projektu**. SLAT mówi, gdzie co leży; projekt mówi, co jest zakazane.

### 1.3. Dla kogo

SLAT jest zaprojektowany dla aplikacji desktopowych w Rust z Tauri, od około 10 000 linii kodu backendu wzwyż. Pomysły przenoszą się na każdą aplikację w Rust z cienką warstwą wejścia (CLI, demon, serwer): wystarczy zastąpić „komendę Tauri” „handlerem HTTP” albo „podkomendą CLI”, a cała reszta pozostaje w mocy.

## 2. SLAT na jednej stronie

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

Sześć zdań do zapamiętania:

1. **Tylko crate `app` zna Tauri.** Cała reszta kompiluje się i jest testowana bez okna.
2. **Funkcja produktu mieszka w jednym slice'ie, a slice ma stałe pliki.** Szukasz czatu? Jest w `core/chat/` i `app/chat/`.
3. **Komenda Tauri ma najwyżej 10 linii**: deserializacja, wywołanie jednej funkcji slice'a, zamiana wyniku na DTO.
4. **Długo żyjący stan ma jednego właściciela: aktora.** Żadnych `Mutex<Option<…>>` ani `AtomicBool` w stanie aplikacji, żadnych `static` ze stanem wewnątrz slice'ów.
5. **Zależności wskazują w dół.** Niższy tier nigdy nie importuje wyższego, a pilnuje tego kompilator.
6. **Tylko `drivers/src/platform/` zna system operacyjny.** Reszta prosi o pojęcia (grupa procesów, sekret, folder danych), nigdy o wywołania systemowe.

## 3. Słownik

| Termin | Znaczenie | Odpowiednik we frontendzie |
|---|---|---|
| **Tier** (piętro) | Rodzaj crate'a: `kit`, `store`, `drivers`, `core`, `app`. Tiery są ułożone jeden na drugim i zależą tylko w dół. | Typ biblioteki w Nx (`type:util`, `type:data-access`, …) |
| **Slice** (wycinek) | Jedna funkcja produktu, na przykład `run`, `chat` albo `skill`. | Folder domeny, `src/sections/<area>` |
| **Layer** (warstwa) | Plik wewnątrz slice'a o stałej nazwie i roli: `model.rs`, `logic.rs`, `store.rs`, `service.rs`. | `feature/`, `ui/`, `data-access/`, `util/` |
| **Actor** (aktor) | Jedyny właściciel długo żyjącego stanu: `Msg → update → Effect`. | Store NgRx: action → reducer → effect |
| **Handle** (uchwyt) | Jedyne drzwi do aktora z zewnątrz. | `inject(Store)` |
| **Snapshot** (migawka) | To, co okno widzi z aktora, publikowane przez kanał `watch`. | `select(…)` |
| **Entry** (wejście) | Sposób, w jaki świat zewnętrzny woła backend: komenda Tauri, serwer MCP, lokalny most, zdalny hub. | Komponent ekranu |
| **Query** (zapytanie) | Odczyt bez efektów ubocznych. | Selektor |
| **Command** (polecenie) | Zmiana stanu. | Akcja |
| **Event** (zdarzenie) | Backend informuje frontend, że coś się zmieniło, bez pytania. | Wypchnięcie do store'a |
| **Platform** (platforma) | System operacyjny, na który budujemy: `macos`, `linux`, `windows`. | Docelowa przeglądarka |
| **Platform contract** (kontrakt platformy) | Funkcja w `drivers::platform`, która znaczy to samo na każdym systemie operacyjnym. | Polyfill |

Trzy z tych pojęć łatwo pomylić, więc warto mieć w głowie taki obraz: **tiery to piętra budynku, slice'y to mieszkania na piętrze `core`, a warstwy to pokoje w każdym mieszkaniu.**

## 4. Skąd się wziął SLAT

Części SLAT nie są nowe. Łączy pięć znanych pomysłów i rozstrzyga wybory, które każdy z nich zostawia otwarte.

| Pomysł | Co SLAT z niego bierze | Co SLAT rozstrzyga dodatkowo |
|---|---|---|
| Architektura warstwowa / Clean Architecture | Zależności wskazują w stronę domeny; I/O siedzi na brzegu. | Warstwy to **crate'y**, więc kierunek sprawdza kompilator. Dokładnie pięć rodzajów. |
| Vertical Slice Architecture | Kod jest grupowany według funkcji produktu, nie według roli technicznej. | Każdy slice ma **te same nazwy plików** o tych samych rolach. |
| The Elm Architecture, NgRx, Redux | Stan zmienia się przez komunikaty i czystą funkcję aktualizującą. | Tylko dla stanu, który przechodzi test trzech pytań (sekcja 9.1). Efekty wracają jako komunikaty. |
| Funkcyjny rdzeń, imperatywna powłoka | Decyzje są czyste; efekty uboczne wykonuje się osobno. | `logic.rs` i `update.rs` są czyste z założenia, a sprawdza to skrypt. |
| Porty i adaptery (architektura heksagonalna) | Do świata zewnętrznego sięga się przez interfejs. | Żadnego traita, dopóki nie ma dwóch implementacji. Rolę portów pełnią tier `drivers` i kontrakty platformy. |

Od każdego z nich osobno SLAT różni się tym, że jest **kompletny i mechaniczny**. Każdy rodzaj kodu ma dokładnie jedno miejsce, a najważniejszych reguł pilnuje `Cargo.toml` albo check uruchamiany w CI.

## 5. Tiery

Workspace SLAT ma najwyżej pięć rodzajów crate'ów. Ich nazwy mają postać `<product>-<tier>`, na przykład `quayside-core`.

| Tier | Co tu mieszka | Może zależeć od | Nigdy |
|---|---|---|---|
| `kit` | Wspólne typy i narzędzia bez domeny: identyfikatory, czas, ścieżki (`kit::paths`), trwały zapis plików, bazowy typ błędu, logowanie. | tylko zewnętrznych bibliotek | `tauri`, `tokio::process`, SQL, `#[cfg]` systemu operacyjnego, cokolwiek z produktu |
| `store` | Trwałość danych: połączenie zapisujące, migracje, schemat, przebudowa indeksu, szyfrowanie bazy. | `kit` | `tauri`, logika domenowa, procesy |
| `drivers` | Świat zewnętrzny: procesy, narzędzia wiersza poleceń dostawców, HTTP, sidecary. Kod zależny od systemu operacyjnego mieszka wyłącznie w `drivers/src/platform/`. | `kit` | `tauri`, `store`, logika domenowa |
| `core` | Wszystkie slice'y domenowe: model, logika, przypadki użycia, aktorzy. | `kit`, `store`, `drivers` | `tauri` |
| `app` | Wejścia: komendy Tauri, DTO, zdarzenia, serwery wejściowe (MCP, most), stan aplikacji, `setup`, `main`. | każdego innego tieru | logika domenowa (jej miejsce jest w `core`) |

W tym dokumencie `core/…` i `app/…` to skróty od folderów źródłowych obu crate'ów. `core/src/<slice>/` to `crates/<product>-core/src/<slice>/`, a `app/src/<slice>/` to `src-tauri/src/<slice>/`, czyli folder, który Tauri tworzy dla crate'a aplikacji. Checki z sekcji 16 używają pełnych ścieżek.

### 5.1. Strażnikiem jest kompilator

Strzałki między tierami są zapisane w `Cargo.toml` każdego crate'a. Jeśli `core` nie wymienia `tauri` jako zależności, to `use tauri::Manager;` wewnątrz `core` jest błędem kompilacji. To najsilniejsza gwarancja, jaką może mieć reguła: nie da się jej zapomnieć, pominąć w code review ani się z nią spierać.

Minimalny workspace:

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
quayside-store = { path = "../crates/quayside-store" }
quayside-kit = { path = "../crates/quayside-kit" }
tauri = { version = "2", features = [] }
```

### 5.2. Od ilu crate'ów zacząć

Minimum to dwa: `core` i `app`. Pozostałe tiery wydzielaj dopiero wtedy, gdy ich kod już istnieje i jest czysty, czyli nie importuje niczego z wyższego tieru. **Pusty crate „na później” jest zakazany.** Kosztuje krok linkowania przy każdym buildzie i niczego nie uczy.

### 5.3. Kiedy podzielić tier

Gdy `core` przekroczy około 60 000 linii albo pełna przebudowa `core` po zmianie w jednym slice'ie zaczyna boleć, przenieś grupę slice'ów do `core-<group>`, na przykład `quayside-core-run`. Poprzestań na najwyżej sześciu do ośmiu crate'ach. Każdy crate to osobny krok linkowania, a na laptopie zamrożona maszyna kosztuje więcej niż sekundy, które zaoszczędziłby drobniejszy podział.

### 5.4. Wyjątek dla zgodności

Nazwa biblioteki, którą zna już bundler Tauri albo dane użytkownika (na przykład `quayside_lib` albo folder w katalogu domowym użytkownika), zostaje przy crate'cie `app`. Nowe crate'y dostają nowe nazwy.

## 6. Slice'y

Slice to jedna funkcja produktu. Jego nazwa to rzeczownik w liczbie pojedynczej, w `snake_case`: `recording`, `transcript`, `board`, `trigger`. Nie `recordings_manager`, nie `utils`. Jeśli produkt ma frontend, nazwy slice'ów odpowiadają folderom funkcji we frontendzie, żeby to samo słowo prowadziło do kodu po obu stronach.

Slice istnieje w dwóch tierach: jego domena w `core`, a jego wejścia (komendy, DTO, zdarzenia) w `app`.

:::diagram slice

### 6.1. Slice w `core`

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

Reguły:

- **Plik, którego slice nie potrzebuje, nie istnieje.** Mały slice może być jednym `mod.rs` z modelem i serwisem, dopóki nie przekroczy około 400 linii.
- **Rosnący plik staje się folderem o tej samej nazwie**: `logic.rs` staje się `logic/mod.rs` plus `logic/<topic>.rs`. Rola się nie zmienia, zmienia się tylko liczba plików.
- **Za duży slice dzieli się na sub-slice'y**: `run/` staje się `run/start/`, `run/step/`, `run/finish/`, każdy z tym samym układem plików. Rodzic zachowuje tylko `mod.rs` z reeksportami.
- **`mod.rs` to drzwi frontowe slice'a**, jak `index.ts` biblioteki Nx. Inne slice'y importują wyłącznie przez nie.

Typowy `mod.rs`:

```rust
mod logic;
mod model;
mod service;
mod store;

pub use model::{Transcript, TranscriptId, Word};
pub use service::TranscriptService;
```

### 6.2. Slice w `app`

```
app/src/<slice>/
  mod.rs        `mod …;` and `pub mod commands;` (the command list itself is in lib.rs, 6.4)
  commands.rs   #[tauri::command] functions; at most 10 lines each
  dto.rs        wire types: serde camelCase, #[serde(other)] on enums, From<model>
  events.rs     event names and payloads sent to the window; snapshot subscription loops
```

Reszta crate'a `app`:

```
app/src/
  main.rs       calls lib::run(); nothing else
  lib.rs        run(): Builder, plugins, setup, generate_handler! with every command, grouped by slice
  state.rs      AppState: the composition root, section 11
  error.rs      entry error → code and text for the window
  platform.rs   optional: window and menu settings that depend on the operating system, section 12.3
  doors/        entries other than the window: MCP server, bridge for agents, remote hub
```

### 6.3. Komenda: kształt wzorcowy

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

Jeśli komenda potrzebuje `if`, pętli albo dwóch wywołań slice'a, ta logika należy do `service.rs` albo `logic.rs`. Limit 10 linii nie dotyczy stylu. Komenda, która tylko tłumaczy, nie potrzebuje własnego testu jednostkowego, bo jej logika jest przetestowana w slice'ie. Do udowodnienia zostaje zdanie, które widzi człowiek, a to testuje się end-to-end przez wejście (sekcja 14).

### 6.4. Rejestrowanie komend

`tauri::generate_handler!` potrzebuje pełnej ścieżki każdej komendy, więc `lib.rs` trzyma jedną listę. Trzymaj ją pogrupowaną według slice'ów, po jednym bloku na slice, żeby dodanie komendy było jedną linią obok sąsiadek:

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

Komenda, która istnieje w slice'ie, ale brakuje jej na tej liście, kompiluje się i po cichu nic nie robi. Sekcja 16 zawiera mały check, który porównuje oba miejsca i pada, gdy się rozjadą.

### 6.5. Nazywanie slice'ów

- Jeden rzeczownik na funkcję produktu, w liczbie pojedynczej: `trigger`, nie `triggers`.
- Nazwa rzeczy, którą rozpoznaje użytkownik, a nie techniki: `transcript`, nie `whisper_pipeline`.
- Gdy dwie funkcje zawsze zmieniają się razem, są jednym slice'em. Gdy jedna funkcja ma części, które zmieniają się niezależnie, są to sub-slice'y.
- **Polityka przekrojowa też jest slice'em**: bramki dostępu, limity, budżety i ochrona sekretów mieszkają w `core/<policy>/` (na przykład `core/guard/`), a każdy inny slice je woła.

## 7. Kto może importować kogo

### 7.1. Wewnątrz slice'a

| Plik | Może importować | Nie może importować |
|---|---|---|
| `model.rs` | `kit`; `model` innych slice'ów, przez ich `mod.rs` | niczego z I/O, `async`, `store`, `drivers` |
| `logic.rs` | `model` | I/O, `async`, `store`, `drivers`, `service` |
| `store.rs` | `model`, crate `store` | `drivers`, `service`, `logic` innych slice'ów |
| `service.rs` | `model`, `logic`, `store.rs`, `drivers`, publiczne API innych slice'ów | `tauri`, stanu globalnego |
| `actor/*` | `model`, `logic`, `service`, `drivers` | `tauri`; a `update.rs` także żadnego I/O |
| `app/<slice>/dto.rs` | `model` slice'a | `service`, `store` |
| `app/<slice>/commands.rs` | publiczne API slice'a, `dto`, `AppState` | `store`, `drivers`, `logic` |

### 7.2. Między slice'ami

- **Tylko przez `mod.rs`.** Głębokie ścieżki, takie jak `crate::run::logic::…` z innego slice'a, są zakazane.
- **Bez cykli.** Jeśli `a` potrzebuje `b`, a `b` potrzebuje `a`, wspólny kawałek staje się osobnym slice'em (zwykle małym `model` albo małym serwisem) i oba od niego zależą.
- **Polityka to slice, nie komenda.** Jeśli sprawdzanie budżetu mieszka w komendzie, to każda niższa warstwa, która go potrzebuje, musi importować w górę. To najczęstsza przyczyna cykli w aplikacjach Tauri.

### 7.3. Dlaczego akurat te granice

Tabela importów jest ułożona tak, żeby rzeczy drogie w testowaniu (I/O, async, procesy) siedziały w jak najmniejszej liczbie plików, a rzeczy cenne do przetestowania (decyzje) w plikach, które nie mają żadnej z nich. Decyzję w `logic.rs` testuje się zwykłym `#[test]` w mikrosekundach. Ta sama decyzja zakopana w komendzie wymaga okna.

## 8. Przepływy danych

:::diagram flows

### 8.1. Query (odczyt)

```
window ─invoke─► app/<s>/commands.rs ─► core/<s>/service.rs ─► core/<s>/store.rs
                        ◄── dto.rs ◄──────── model ◄──────────────────┘
```

Odczyt nie przechodzi przez aktora, chyba że czyta stan tego aktora. Wtedy czyta ostatni `Snapshot` z `Handle`, bez wysyłania komunikatu.

### 8.2. Command (zmiana)

Bez stanu w tle (zapisanie ustawienia, utworzenie pliku):

```
window ─invoke─► commands ─► service ─► logic (decision) ─► store / drivers ─► result
```

Ze stanem w tle (bieg, rozmowa, nagranie):

```
window ─invoke─► commands ─► Handle.send(Msg)
                                  │
                 actor ◄──────────┘
                   update(&mut State, Msg) -> Vec<Effect>     pure function
                   for e in effects: execute(e)               I/O: drivers, store, timers
                   snapshot.send(State.view())                the window gets a new view
```

### 8.3. Zdarzenie (backend → okno)

Zdarzenia są emitowane **wyłącznie** z `app/<s>/events.rs`. Slice w `core` publikuje zmiany przez `watch::Sender<Snapshot>` albo `broadcast::Sender<Event>`. `events.rs` subskrybuje i woła `emit`. Dzięki temu `core` nie wie o istnieniu okna, a frontend ma dokładnie jedno miejsce, z którego przychodzą zdarzenia każdego slice'a. Nazwy zdarzeń mają postać `<slice>:<event>`, na przykład `recording:snapshot`.

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

### 8.4. Strumienie o dużym natężeniu

Niektóre slice'y produkują wiele małych zdarzeń: linie logów, słowa transkrypcji, kolejne kroki postępu. Nie emituj jednego zdarzenia Tauri na linię. Daj slice'owi ograniczony kanał w `core`: mały, własny typ nadawcy slice'a (na przykład `WordSink` z sekcji 20.3), którego `send` nigdy nie czeka i zwraca, co się stało, na przykład `Sent::Delivered`, `Sent::Dropped` albo `Sent::Closed`. Niech `app/<s>/events.rs` ma **pompę**, która co kilka milisekund zbiera linie w paczki i wysyła je do `tauri::ipc::Channel`. Ograniczony kanał daje backpressure: gdy okno nie nadąża, slice się o tym dowiaduje (`Sent::Dropped`), zamiast zapełniać pamięć, a gdy nikt już nie słucha (`Sent::Closed`), slice może przestać. Paczkowanie, kanał i częstotliwość klatek to sprawy wejścia i zostają w `app`.

## 9. Aktorzy: slice'y ze stanem

### 9.1. Kiedy użyć aktora

Aktora używaj tylko wtedy, gdy **wszystkie trzy** warunki są spełnione:

1. stan żyje dłużej niż jedno wywołanie komendy;
2. kilka źródeł zmienia go współbieżnie (okno, procesy, timery, sieć);
3. okno obserwuje go na żywo.

W każdym innym przypadku użyj zwykłego `service.rs`. Nie każda funkcja w NgRx potrzebuje efektów i nie każdy slice SLAT potrzebuje aktora.

| Kandydat | 1 | 2 | 3 | Werdykt |
|---|---|---|---|---|
| bieg agenta z krokami i procesami | tak | okno, procesy, timery | tak | aktor |
| nagranie na żywo | tak | okno, urządzenie audio, timer | tak | aktor |
| rozmowa z modelem | tak | okno, proces modelu, zdalne urządzenie | tak | aktor |
| jednorazowe wygenerowanie szkicu i zwrócenie go | tak | okno (start/stop) | nie, jeden wynik | serwis + `kit::Jobs` |
| cache cen modeli | tak | brak | nie | pole serwisu slice'a |

### 9.2. Pliki

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

### 9.3. Kontrakt

- **`update` jest czysta.** Dostaje stan i komunikat, zwraca listę efektów. Każdą regułę biznesową dotyczącą tego stanu da się przetestować bez tokio, procesów i bazy danych.
- **Efekt, który daje wynik, zwraca go jako nowy `Msg`.** Aktor nigdy nie czeka na długi efekt wewnątrz swojej pętli. Długi efekt trafia do `tokio::spawn`, a jego wynik wraca przez skrzynkę odbiorczą.
- **Anulowanie to komunikat z generacją**, a nie flaga: `Msg::Cancel { generation }`. Stan trzyma `generation: u64`, a spóźniona odpowiedź ze starą generacją jest ignorowana w `update`. Globalny `AtomicBool` przecieka między operacjami; generacja nie może.
- **Wynik jest wartością**: `enum Outcome<T> { Done(T), Cancelled }`, nigdy `Err(Cancelled)`. Anulowanie to coś, o co poprosił użytkownik, a nie porażka.
- **Limit czasu to `Effect::StartTimer`, a jego koniec to `Msg::TimedOut`.** Zabicie procesu po upływie limitu wykonuje driver. Samo `tokio::time::timeout` anuluje future w Rust, a nie proces systemu operacyjnego.
- **Żadnego `std::sync::Mutex` wewnątrz aktora.** Jego stan ma jednego właściciela, więc nie potrzebuje blokady.
- **Jeden aktor na instancję stanu**: jeden na bieg, jeden na rozmowę. Rejestr żywych instancji to osobny mały aktor albo serwis z mapą handle'i.

### 9.4. Kompletny mały aktor

Aktor nagrywania, który uruchamia proces rejestratora, pilnuje limitu czasu i da się go zatrzymać (plik zostaje) albo anulować (plik jest odrzucany). Wszystkie nazwy typów i funkcji są przykładowe.

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

Nowe nagranie może się zacząć zawsze, gdy nic nie jest w toku, także po tym, jak wcześniejsze zostało zapisane albo anulowane. Ostatnie ramię to cały sens generacji: komunikat `Level`, `TimedOut` albo `Ended` z wcześniejszego nagrania przychodzi ze starą generacją i niczego nie zmienia.

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

Na wyniki własnych efektów pętla trzyma tylko słabą referencję do nadawcy. Gdy ostatni `Handle` zostanie zwolniony, `recv` zwraca `None` i aktor kończy pracę, zamiast czekać w nieskończoność.

Gdy kolejność efektów ma znaczenie (na przykład zapis przed powiadomieniem), wykonaj te efekty po kolei w jednym uruchomionym zadaniu zamiast jednego zadania na efekt. Reguła mówi tylko tyle, że sama pętla nigdy nie czeka.

### 9.5. Testowanie aktora

Większość testów w ogóle nie uruchamia aktora. Wołają `update` bezpośrednio:

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

Kilka testów steruje całym aktorem przez jego `Handle` z `tokio::time::pause()`, fałszywym driverem i asercjami na sekwencji snapshotów.

## 10. Eksplozja wariantów

Rodzina funkcji takich jak `start_with_budget`, `start_with_slots`, `start_with_snapshot_hook`, `start_with_budget_and_slots` to sygnał, że brakuje struktury żądania. Zastąp całą rodzinę jedną funkcją wejściową i jedną strukturą opcji:

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

Wywołujący piszą `StartRequest { workflow, budget: Some(limit), ..Default::default() }`. Nowa opcja to jedno nowe pole, a nie nowa funkcja i nowa linia w każdym miejscu wywołania. Punkty wstrzyknięć tylko dla testów (`faults`, `hooks`) to pola, które istnieją wyłącznie w buildzie testowym. Samo `cfg(test)` obejmuje tylko testy jednostkowe danego crate'a, więc testy integracyjne i inne crate'y włączają te pola feature'em `test-hooks`, na tej samej zasadzie co fałszywy driver z 14.2.

## 11. AppState, korzeń kompozycji

`AppState` składa aplikację i nie robi nic więcej. Może trzymać:

- wartości `Arc<…Service>` i `…Handle` slice'ów;
- konfigurację tylko do odczytu;
- handle do writera bazy danych.

Nie może trzymać:

- `Mutex<Option<…>>`, `AtomicBool` ani `Mutex<HashMap<…>>`, które opisują jakiś proces w tle. To stan aktora i jego miejsce jest w `core/<slice>/actor/state.rs`;
- pól, które są szczegółem jednego slice'a (cache, mapy anulowania, kolejki).

Slice'y nie mogą też ukrywać stanu w zmiennych `static` (`OnceLock<Mutex<…>>`, `LazyLock<Mutex<…>>`). Jedynym wyjątkiem jest stała obliczona raz (`OnceLock<PathBuf>`), która nie zmienia się przez cały czas życia procesu.

**Test:** każde pole `AppState` da się opisać jednym rzeczownikiem ze slice'a („recordings”, „runs”, „account”). Pole, które wymaga zdania, żeby je opisać, należy do wnętrza slice'a.

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

### 11.1. `kit::Jobs`: jednorazowa praca w tle

Generowanie szkicu, porównanie dwóch folderów albo planowanie zadania działa w tle, da się zatrzymać i daje jeden wynik. Do tego nie trzeba aktora. Trzeba mapy anulowania, a ta mapa należy do serwisu slice'a, nie do `AppState`. `kit::Jobs<K>` to jeden konkretny typ generyczny do tego celu:

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

`begin` anuluje każde wcześniejsze zadanie z tym samym kluczem, zapisuje nową generację i zwraca strażnika, który usuwa wpis, gdy zostanie zwolniony, ale tylko jeśli generacja nadal się zgadza. Blokada jest trzymana tylko wewnątrz tych dwóch krótkich funkcji, nigdy przez `await`. Ponieważ `Jobs` to konkretny typ, a nie trait, nie łamie reguły zakazującej traitów z jedną implementacją.

To nie jest furtka w regułach sekcji 11. Dotyczą one tego, gdzie mieszka stan, a nie jego typu. Blokada wewnątrz `kit::Jobs`, której właścicielem jest serwis jednego slice'a i która nigdy nie jest trzymana przez `await`, to prywatny szczegół tego slice'a. Ta sama mapa jako pole `AppState` to stan, którego nikt nie jest właścicielem.

## 12. Platformy

*Nowość w wersji 1.1.*

Produkt może dziś działać tylko na jednym systemie operacyjnym (na przykład wyłącznie na macOS). SLAT układa kod tak, żeby kolejny system operacyjny był pracą w **jednym folderze**, a nie przeszukiwaniem całego repozytorium. Reguła jest jedna: **tylko `drivers/src/platform/` zna system operacyjny.** Cała reszta prosi o pojęcia (grupa procesów, sekret, folder danych, otwarcie pliku), nigdy o wywołania systemowe.

Lista wspieranych platform należy do repozytorium (jego przewodnika dla kontrybutorów), a nie do SLAT.

:::diagram platform

### 12.1. Układ

```
drivers/src/platform/
  mod.rs          the only platform API: selects a file with #[cfg] and pub use; no logic
  unix.rs         shared by macOS and Linux: process groups, signals, file modes
  macos.rs        Keychain, revealing in Finder, the login shell, …
  linux.rs        only when the port starts: Secret Service, xdg-open, …
  windows.rs      only when the port starts: Job Objects, Credential Manager, ACLs, …
  unsupported.rs  every function returns Err(PlatformError::Unsupported)
```

- Plik dla systemu operacyjnego, którego produkt jeszcze nie wspiera, **nie istnieje**, z tego samego powodu, dla którego nie istnieje pusty crate „na później”. Jego miejsce zajmuje `unsupported.rs`.
- `unsupported.rs` nie jest martwym kodem. Dzięki niemu cały workspace poza `app` kompiluje się na każdą platformę od pierwszego dnia. Przeciek kodu systemowego do `core` staje się błędem kompilacji w CI, a nie odkryciem w dniu portu.
- `mod.rs` wygląda tak samo w każdym repozytorium:

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

Port zmienia tylko tę listę linii `cfg`. Każdy plik platformy wystawia **ten sam zestaw funkcji i typów z tymi samymi sygnaturami**. Brakująca funkcja to błąd kompilacji na tej platformie. To nie jest trait: w danym buildzie zawsze istnieje dokładnie jedna implementacja.

### 12.2. Kontrakty

Każde pojęcie ma kontrakt, który znaczy to samo na każdym systemie operacyjnym. Różni się tylko wnętrze.

| Pojęcie | API w `drivers::platform` | macOS | Linux | Windows |
|---|---|---|---|---|
| grupa procesów | `ProcessGroup::spawn`, `terminate(grace)`, `proved_dead()` | identyfikator grupy procesów; SIGTERM, okres łaski, SIGKILL; `kill(-pgid, 0)` zwraca `ESRCH` | jak macOS | Job Object; `TerminateJobObject`; w jobie nie został żaden proces |
| sekrety | `secret::read`, `secret::write`, `secret::delete` | Keychain | Secret Service (libsecret) | Credential Manager |
| prywatny plik i folder | `fs::write_private`, `fs::create_private_dir` | tryb `0o600` / `0o700` | jak macOS | ACL: tylko właściciel |
| otwarcie w systemie | `open_path`, `reveal_path`, `open_url` | `open`, `open -R` | `xdg-open` | `ShellExecuteW`, `explorer /select,` |
| środowisko użytkownika | `login_env()` | powłoka logowania (`PATH` aplikacji uruchomionej z Docka jest minimalny) | jak macOS | rejestr i środowisko procesu |
| znalezienie programu | `which(program)` | `PATH` | `PATH` | `PATH` plus `PATHEXT` |
| fakty o maszynie | `machine::cores`, `machine::memory`, `machine::free_space` | sysctl, statfs | /proc, statfs | API systemu |

Reguły kontraktów:

- Funkcja kontraktu nie zwraca typów systemowych (`pid_t`, `HANDLE`). Zwraca typy z `drivers` albo `kit`.
- **Dowód, nie nadzieja**, na każdej platformie: „proces nie żyje” to ustalony fakt, a nie wysłany sygnał.
- Gdy system operacyjny nie potrafi zrobić tego, czego wymaga kontrakt, funkcja zwraca błąd, który nazywa brakującą rzecz, nigdy cichy zamiennik.

Krótki przykład kontraktu i jego strony macOS:

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

### 12.3. Co jest zakazane poza `platform/`

| Zakazane poza `drivers/src/platform/` | Zamiast tego |
|---|---|
| `#[cfg(unix)]`, `#[cfg(windows)]`, `#[cfg(target_os = …)]` | kontrakt z 12.2 |
| `std::os::unix`, `std::os::windows`, `libc`, `nix`, `windows-sys`, `security-framework` | kontrakt z 12.2 |
| `sh -c`, `bash`, `zsh`, `cmd /c`, `powershell` | `Command::new(program).args(…)`; jeśli powłoka jest naprawdę potrzebna, wybiera ją `platform` |
| nazwy programów systemowych: `open`, `xdg-open`, `security`, `osascript`, `explorer` | `open_path`, `secret::*`, … |
| zaszyte na sztywno ścieżki: `~`, `$HOME`, `/tmp`, `/usr/bin`, `/Applications`, `Library/` | `kit::paths` (12.4) |
| łączenie ścieżek napisem `/` | `Path::join` |
| tryby plików jako liczby (`0o600`) | `fs::write_private` |

Jedynym wyjątkiem jest `app/src/platform.rs`, na rzeczy, które zna tylko Tauri: styl paska tytułu, menu aplikacji, polityka aktywacji okna. Nic poza ustawieniami okna.

### 12.4. Ścieżki, pliki i tekst

- **Foldery pochodzą wyłącznie z `kit::paths`**: `data()`, `config()`, `cache()`, `logs()`, `temp()`. Pod spodem jest biblioteka, która stosuje konwencję każdego systemu (macOS `~/Library/Application Support/<App>`, Linux XDG, Windows `%APPDATA%`). Dane, które już leżą pod starszą ścieżką, zostają tam na systemie, na którym powstały (wyjątek dla zgodności z 5.4); na tym systemie `kit::paths` zwraca starszą ścieżkę, więc kod nadal pyta wyłącznie `kit::paths`. Sam `kit` nie ma `#[cfg]`: konwencję systemu dostarcza biblioteka.
- **Nazwy plików tworzonych przez aplikację są pisane małymi literami** i nigdy nie różnią się wyłącznie wielkością liter. Domyślne systemy plików macOS i Windows ich nie rozróżniają; Linux tak.
- **Nie zmieniaj nazwy ani nie usuwaj pliku, który ktoś trzyma otwarty.** Windows odmówi. Atomowe zapisy przechodzą przez `kit::durable_file`, który zamyka plik przed jego podmianą.
- **Długie ścieżki.** Windows ogranicza ścieżki do około 260 znaków bez prefiksu `\\?\`. Kopie robocze i foldery biegów trzymaj płytko; prefiks dodaje `platform`, nigdy slice.
- **Tekst z procesów** jest czytany z tolerancją na `\r\n`. Pliki zapisywane przez aplikację używają `\n`.
- **Ścieżka wysyłana do okna** jest w UTF-8. Ścieżka, której nie da się zapisać w UTF-8, to błąd nazywający plik, nigdy `unwrap()`.

### 12.5. Testy platformy

- **Test kontraktu** mieszka w `drivers/tests/it/platform_contract.rs`, module jedynego celu integracyjnego crate'a (14.1), i jest taki sam dla każdego systemu operacyjnego: proces nie żyje po `terminate`, sekret wraca po zapisaniu i znika po usunięciu, prywatnego pliku nie może odczytać inny użytkownik. Każda wspierana platforma przechodzi **ten sam** zestaw.
- **Testy poza `drivers` nie używają powłoki ani sygnałów.** Proces potrzebny w teście to mały program w Rust (binarka w crate'cie testowym), a nie `sh -c 'sleep 10'`.
- `#[cfg]` platformy w testach jest dozwolony tylko w testach `drivers`.

### 12.6. Egzekwowanie

| Reguła | Kto jej pilnuje |
|---|---|
| zakazy z 12.3 | check oparty na grepie z listą bazową (sekcja 16) |
| crate'y inne niż `app` kompilują się na każdą platformę | `cargo check --workspace --exclude <app>` na natywnych runnerach CI dla Ubuntu i Windows. Nie cross-check z macOS: skrypty budujące z kodem w C potrzebują kompilatora platformy docelowej. |
| kontrakt działa | `platform_contract.rs` na runnerze dla każdej **wspieranej** platformy |

### 12.7. Port na nowy system operacyjny

1. `drivers/src/platform/<system>.rs`: każda funkcja kontraktu. Kompilator wypisze, czego brakuje.
2. `mod.rs`: `cfg` nowego systemu przestaje wskazywać na `unsupported.rs`.
3. `platform_contract.rs` jest zielony na runnerze tego systemu, a runner dołącza do CI.
4. `app`: konfiguracja paczki i podpisywania dla tego systemu oraz, w razie potrzeby, `app/src/platform.rs`.
5. Przewodnik dla kontrybutorów w repozytorium dopisuje system do listy wspieranych platform.

Jeśli port wymaga zmiany w `core`, coś przeciekło. Najpierw osobny pull request przenosi przeciek za kontrakt, potem port jest kontynuowany.

## 13. Błędy

- **Każdy crate ma własny enum błędów** (z `thiserror`). Slice może mieć własny w `error.rs`.
- **`core` zwraca błędy domenowe.** `app/error.rs` zamienia je na kod i zdanie dla okna. Zdanie pochodzi z waszej tabeli tłumaczeń, nigdy z `Display` enuma przesyłanego przez granicę.
- **Nieznane zdarzenie z zewnątrz to nie błąd.** Używaj `#[serde(other)]` na enumach i `Option<T>` na polach, które nie są niezbędne. Zaloguj nieznaną linię do debugowania i idź dalej. Nowa wersja narzędzia wiersza poleceń dostawcy nie może nigdy zatrzymać biegu.
- **`unwrap()` i `panic!` są zakazane** poza testami w `core`, `store` i `drivers`. Używaj `?` z wariantem błędu albo `expect()` z powodem, który wyjaśnia, dlaczego wartości nie może zabraknąć.

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

## 14. Testowanie według warstw

| Warstwa | Jak testować | Co jest dowodem |
|---|---|---|
| `logic.rs`, `update.rs` | zwykły `#[test]`, bez tokio | asercja na wartości albo na liście efektów |
| `store.rs` | baza danych w folderze tymczasowym | wiersz zwrócony przez odczyt |
| `service.rs` | `#[tokio::test]` z prawdziwym store'em i fałszywym driverem | stan plików albo bazy danych po wywołaniu |
| `actor/` | `Handle` plus scenariusz komunikatów; czas przez `tokio::time::pause` | sekwencja `Snapshot`ów |
| `drivers` | prawdziwy proces albo nagrany strumień | proces nie żyje (`ESRCH` albo pusty job), linie z zewnątrz |
| `app/commands` | bez testu jednostkowego; test end-to-end albo integracyjny przez wejście, dla tego, co widzi człowiek | tekst, który widzi człowiek |

Test komunikatu pokazywanego człowiekowi należy tam, gdzie człowiek go widzi, a nie tylko do `logic.rs`. Funkcja, która tworzy właściwe zdanie, niczego nie dowodzi, jeśli nikt jej nie woła.

### 14.1. Jedna binarka integracyjna

Każdy plik leżący bezpośrednio w `tests/` to osobna binarka, a każda binarka jest linkowana osobno. W dużym workspace to minuta na plik. Daj każdemu crate'owi **jeden** cel integracyjny, `tests/it/main.rs`, z jednym modułem na temat, a pojedynczy temat uruchamiaj z filtrem:

```
tests/it/
  main.rs          mod recording_stops_on_time_limit; mod transcript_survives_restart; …
  recording_stops_on_time_limit.rs
  transcript_survives_restart.rs
```

```bash
cargo nextest run --test it recording_stops_on_time_limit::
```

Uruchamiaj z `--no-tests=fail`, żeby filtr, który niczego nie dopasował, był czerwony, a nie po cichu zielony.

### 14.2. Fałszywy driver bez traita

Test potrzebuje drivera, który nie uruchamia prawdziwych procesów. SLAT zakazuje traita z jedną implementacją, a fałszywka nie liczy się jako druga prawdziwa. Regułę zachowują dwie opcje:

- **Szew na danych.** Serwis przyjmuje *wyjście* drivera jako wartość albo kanał, a nie sam driver. Test wysyła linie do kanału.
- **Build testowy.** `drivers` wystawia `#[cfg(any(test, feature = "fake"))] pub mod fake;` z tymi samymi funkcjami co prawdziwy moduł, a crate testowy włącza feature `fake`.

Gdy pojawi się druga prawdziwa implementacja (drugi dostawca, druga platforma), to jest właściwy moment na trait.

## 15. Limity rozmiaru

| Jednostka | Próg ostrzeżenia | Co zrobić |
|---|---|---|
| plik | 1500 linii kodu (bez testów) | podzielić na folder o tej samej roli, sekcja 6.1 |
| slice | 15 000 linii | podzielić na sub-slice'y |
| `core` | 60 000 linii | przenieść grupę do `core-<group>`, sekcja 5.3 |
| komenda Tauri | 10 linii | przenieść logikę do `service.rs` |
| pole `AppState` | jeden rzeczownik | zob. sekcja 11 |

Pliki powyżej progu w dniu wdrożenia SLAT trafiają na **listę bazową**. Ta lista może się tylko skracać.

## 16. Egzekwowanie

Najpierw mechanizm, potem słowa. Reguła, którą może sprawdzić skrypt, nigdy nie powinna zależeć od tego, czy ktoś o niej pamięta.

| Reguła | Kto jej pilnuje |
|---|---|
| tylko `app` zna Tauri | `Cargo.toml` (nigdzie indziej nie ma zależności `tauri`) |
| tiery zależą tylko w dół | `Cargo.toml` |
| tylko `store` otwiera połączenie zapisujące | check oparty na grepie: `Connection::open` tylko w crate'cie `store`. Pliki `store.rs` slice'ów używają typów `rusqlite`, więc sama zależność nie wystarcza. |
| `#[tauri::command]` tylko w `app/*/commands.rs` | check oparty na grepie |
| każda komenda jest zarejestrowana | check porównujący komendy w slice'ach z `generate_handler!` |
| `emit` tylko w `app/*/events.rs` | check oparty na grepie |
| żadnych głębokich importów między slice'ami | check szukający `crate::<a>::<layer>::` z innego slice'a |
| żadnych `static` ze stanem w `core` | check oparty na grepie szukający `static .*(Mutex|RwLock)` |
| `update.rs` nie ma I/O | check: żadnego `async`, `tokio::`, `std::fs`, `store::` w `update.rs` |
| system operacyjny tylko w `drivers/src/platform/` i `app/src/platform.rs` | check oparty na grepie z listą z 12.3 |
| crate'y inne niż `app` kompilują się na każdą platformę | `cargo check` na runnerach CI z Ubuntu i Windows |
| limity rozmiaru | check z listą bazową, która może się tylko skracać |

Każdy check zaczyna od **listy bazowej** dzisiejszych naruszeń. Nowe naruszenie jest czerwone. Naruszenie, które zostało naprawione, musi zniknąć z listy w tym samym pull requeście, więc lista nigdy nie może z powrotem urosnąć.

### 16.1. Check z listą bazową

Wszystkie checki mają jeden kształt: znajdź naruszenia, odejmij listę bazową, padnij na wszystkim, co zostało, i padnij, jeśli lista bazowa wymienia coś, co już naprawiono.

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

### 16.2. Check musi umieć paść

Zanim zaufasz checkowi, podłóż prawdziwe naruszenie, zobacz, że robi się czerwony, i usuń je. Check, który nigdy nie był czerwony, nigdy nie został przetestowany.

Checki oparte na grepie w SLAT szukają zakazanego kodu, więc dopasowanie w komentarzu robi je czerwonymi, a nie zielonymi. To irytujące, ale bezpieczne, a naprawa polega na usunięciu martwego kodu. Niebezpieczny jest check, który wymaga obecności napisu: przechodzi na komentarzu. Regułę tego rodzaju udowadniaj, uruchamiając kod, a nie czytając tekst.

### 16.3. Job platform w CI

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

W prawdziwym repozytorium przypnij wersje akcji do pełnych hashy commitów. Job tylko kompiluje; nie uruchamia testów na platformach, których produkt jeszcze nie wspiera, więc jest tani.

### 16.4. Checki dla całego zestawu

| Check | Reguła |
|---|---|
| `checks/slat-commands.sh` | `#[tauri::command]` tylko w `src-tauri/src/*/commands.rs` |
| `checks/slat-registered.sh` | każda komenda w slice'ie występuje w `generate_handler!` |
| `checks/slat-emit.sh` | `emit` tylko w `src-tauri/src/*/events.rs` |
| `checks/slat-deep-imports.sh` | żadnego `crate::<slice>::<layer>::` z innego slice'a |
| `checks/slat-static-state.sh` | żadnego `static … Mutex|RwLock` w `crates/*-core*` |
| `checks/slat-pure-update.sh` | `update.rs` bez `async`, `tokio::`, `std::fs`, `store::` |
| `checks/slat-platform.sh` | zakazy z 12.3 poza `platform/` |
| `checks/slat-size.sh` | pliki powyżej 1500 linii z listy bazowej mogą się tylko zmniejszać |

## 17. Przepisy

Każdy przepis zaczyna się od testu, który pada na starym kodzie, na asercji, a nie na kompilacji. W Rust najpierw napisz sygnaturę z `todo!()`, żeby test się skompilował i padł z właściwego powodu.

### 17.1. Nowy odczyt (Query)

1. `core/<s>/model.rs`: typ wyniku, jeśli nie istnieje.
2. `core/<s>/store.rs`: funkcja odczytu. Przetestuj ją na tymczasowej bazie danych.
3. `core/<s>/service.rs`: `pub async fn <verb>(…)`, która woła store i logic.
4. `core/<s>/mod.rs`: `pub use` nowej funkcji albo typu.
5. `app/<s>/dto.rs`: DTO i `From<model>`.
6. `app/<s>/commands.rs`: komenda o najwyżej 10 liniach; zarejestruj ją.
7. Frontend: warstwa data-access woła komendę.

### 17.2. Nowa zmiana bez stanu w tle (Command)

Jak w 17.1, a decyzja (czy wolno, co się zmienia) jest zapisana w `logic.rs` jako czysta funkcja z testem. `service.rs` tylko ją woła i wykonuje zapis.

### 17.3. Nowy slice

1. Nazwa: funkcja produktu jako rzeczownik w liczbie pojedynczej, w `snake_case`.
2. `core/src/<s>/mod.rs` plus tylko te pliki, których potrzebuje; `pub mod <s>;` w `core/src/lib.rs`.
3. `app/src/<s>/mod.rs`, `commands.rs`, `dto.rs`; zarejestruj jego komendy.
4. Jeśli slice ma stan w tle: przepis 17.4.

### 17.4. Nowy przepływ ze stanem (aktor)

1. Sprawdź trzy warunki z 9.1. Jeśli któryś nie jest spełniony: przepis 17.2.
2. `msg.rs`, `state.rs`, `snapshot.rs`: typy.
3. `update.rs`: najpierw testy (komunikat na wejściu, oczekiwane efekty i stan na wyjściu), potem implementacja.
4. `effect.rs`: `execute` dla każdego efektu; wyniki wracają jako `Msg`.
5. `run.rs` i `handle.rs`: pętla i drzwi.
6. `AppState` dostaje dokładnie jedno pole: rejestr albo `Handle`.
7. `app/<s>/events.rs`: subskrypcja `Snapshot` i `emit("<s>:snapshot")`.

### 17.5. Nowy driver (świat zewnętrzny)

1. `drivers/src/<name>.rs` albo folder. Driver nie zna żadnych slice'ów ani bazy danych.
2. Trait tylko wtedy, gdy są co najmniej dwie implementacje.
3. Proces: grupa procesów, eskalacja zabijania, dowód śmierci; sekrety poza argumentami i logami. Wszystko przez kontrakty `platform` (12.2), nigdy przez wywołanie systemowe w driverze.
4. Slice używa drivera z `service.rs` albo z `effect.rs`.

### 17.6. Nowe zdarzenie dla okna

1. Zmiana w `core` publikuje `Snapshot` albo `Event` na kanale.
2. `app/<s>/events.rs` subskrybuje i emituje `<s>:<event>`.
3. Frontend: warstwa data-access nasłuchuje i aktualizuje swój store.

### 17.7. Nowa platforma

Sekcja 12.7.

### 17.8. Gdzie to ma trafić? (drzewo decyzyjne)

```
Czy woła Tauri, okno, MCP albo zdalny hub?              → app (commands, events, doors)
Czy zależy od systemu operacyjnego?                     → drivers/src/platform/ (sekcja 12)
Czy rozmawia z procesem, siecią, pękiem kluczy?         → drivers (przez kontrakty platformy)
Czy to odczyt/zapis w bazie danych albo schemat?        → store (połączenie) / core/<s>/store.rs (zapytania)
Czy to czysta decyzja albo obliczenie?                  → core/<s>/logic.rs (albo update.rs w aktorze)
Czy to typ domenowy?                                    → core/<s>/model.rs
Czy to sekwencja kroków z I/O?                          → core/<s>/service.rs
Czy to stan, który żyje w tle, a okno go obserwuje?     → core/<s>/actor/
Czy w ogóle nie ma domeny (czas, ścieżki, id, pliki)?   → kit
```

## 18. Praca z agentami kodującymi

SLAT powstał w zespole, w którym dużą część kodu piszą agenci kodujący. Agenci niezawodnie trzymają się układu, gdy jest spisany, krótki i sprawdzany przez maszyny. Różnicę robią trzy rzeczy.

1. **Stały układ to darmowa mapa.** Agent, który ma „dodać filtr do transkrypcji”, otwiera `core/transcript/` i `app/transcript/` bez szukania. Czas, który agent spędza na szukaniu, to czas, w którym się myli.
2. **Check wygrywa ze zdaniem w prompcie.** „Nie emituj z core” w prompcie jest przestrzegane przez większość czasu. Czerwony check jest przestrzegany zawsze. Najpierw zapisz regułę jako check, a jako linię promptu tylko wtedy, gdy nie da się jej sprawdzić.
3. **Przepisy są promptami.** Sekcja 17 jest celowo napisana jako ponumerowane kroki: wklej przepis do zadania, a agent utworzy pliki w oczekiwanych miejscach i w oczekiwanej kolejności.

Sekcja do skopiowania do przewodnika dla kontrybutorów w waszym repozytorium (`AGENTS.md`, `CLAUDE.md` albo odpowiednik):

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
- Before adding code, find its place with the decision tree (SLAT section 17.8,
  https://monoone.dev/blog/slat/recipes/).
- Checks in `checks/slat-*.sh` enforce this. Do not edit a check to make it pass;
  report it instead.
```

## 19. Migracja istniejącej bazy kodu

Nie trzeba niczego przepisywać od zera. SLAT wdraża się małymi pull requestami, przy których aplikacja cały czas działa, w kolejności, która nie blokuje innych gałęzi.

:::diagram migration

### 19.1. Kolejność

1. **Zmierz.** Zmapuj moduły: linie na moduł, importy wskazujące w górę, pliki używające `tauri::`, liczbę `#[tauri::command]`, `static` ze stanem, pola stanu aplikacji, `#[cfg]` dla systemów operacyjnych. Zapisz to w planie w repozytorium. Te liczby to wasze listy bazowe.
2. **Odwróć zależności skierowane w górę.** Polityki, które mieszkają w warstwie komend, ale są wołane przez niższe warstwy, schodzą do `core/<policy>/`. Typy, które domena pożycza z warstwy wejścia (kanał linii, typ obrazu, tekst komunikatu), przechodzą do slice'a, do którego należą. Stara ścieżka zostaje jako `pub use` do końca migracji.
3. **Rozdziel `app` i `core`.** Utwórz workspace i crate `core` bez `tauri`. Kod, który zna Tauri, zostaje w `app`; wszystko inne przenosi się przez `git mv`. To najbardziej mechaniczny krok.
4. **Wydziel `store`, `drivers` i `kit`.** Dopiero wtedy, gdy ich kod jest już czysty. Przy wydzielaniu `drivers` przenieś kod systemu operacyjnego do `platform/` i daj checkowi platformy jego listę bazową.
5. **Slice po slice'ie.** Jeden slice na pull request: komendy do `app/<s>/`, logika do `core/<s>/` w stałym układzie. Zacznij od najmniejszego i najmniej współdzielonego.
6. **`kit::Jobs`.** Mapy anulowania opuszczają stan aplikacji.
7. **Aktorzy.** Stan ze stanu aplikacji i ze zmiennych `static` przechodzi do aktorów, jeden przepływ na pull request, z testami `update` napisanymi najpierw względem obecnego zachowania.
8. **Checki.** Każdy krok włącza check dla swojej reguły, z listą bazową.

### 19.2. Zasady migracji

- **Przeniesienia nie zmieniają zachowania.** Pull request, który przenosi kod, nie poprawia logiki, a pull request, który poprawia logikę, nie przenosi kodu. Gdy coś się zepsuje, wiadomo, który rodzaj zmiany to spowodował.
- **Fasady na starych ścieżkach.** `pub use new::place::*;` pod starą ścieżką modułu pozwala, żeby kod, którego nie wolno ruszać (albo którego nie chcecie jeszcze ruszać), i istniejące testy kompilowały się bez zmian. Fasadę usuwa się, gdy nic jej już nie importuje.
- **Jeden ciężki build naraz.** Kilka równoległych buildów `cargo` dużego workspace'u potrafi zamrozić laptopa. Migrujcie po kolei.
- **Uruchamiaj całą suitę testów po każdym kroku**, a nie po każdym commicie. Suita jest dowodem, że zachowanie nigdzie się nie przesunęło.

### 19.3. Najpierw układ, czyli szybszy start

Jeśli największym bólem jest odnajdywanie kodu, można zmienić kolejność prac: najpierw przenieść **pliki** do folderów slice'ów wewnątrz jedynego istniejącego crate'a, bez zmian w ich treści, i zostawić fasady pod starymi ścieżkami. Git zapisuje to jako zmiany nazw, więc inne otwarte gałęzie nadal scalają się bez konfliktów. Mapę (folder każdej funkcji produktu) dostaje się w dzień albo dwa, a podział na crate'y, warstwy wewnątrz slice'ów i aktorzy przychodzą później, na układzie, który już jest czytelny.

Dwie rzeczy nie są darmowe nawet tutaj. Pliki, które używają `super::` albo `pub(super)`, zmieniają przy przenosinach moduł nadrzędny, więc kilka ścieżek wymaga drobnych mechanicznych poprawek. A przeniesienie komend z centralnego pliku zmienia ten plik, co wchodzi w konflikt z gałęziami, które go edytują, więc lepiej zrobić to jako osobny, drugi krok.

### 19.4. Co zwykle idzie źle

| Problem | Co zrobić |
|---|---|
| Setki testów importują stare ścieżki | Fasady pod starymi ścieżkami. Nie przenoś testów w tych samych pull requestach. |
| Równoległe gałęzie są w konflikcie z `git mv` | Dziel crate'y wtedy, gdy otwartych gałęzi jest najmniej. Każde przeniesienie to osobny pull request. |
| Po podziale elementy `pub(crate)` są potrzebne w innym crate'cie | Rozszerz je do `pub`. Po migracji przejrzyj, co może wrócić do `pub(crate)`. |
| Czas kompilacji rośnie z liczbą crate'ów | Najwyżej sześć do ośmiu crate'ów. Jeden ciężki build naraz. |
| Refaktoryzacja po cichu zmienia zachowanie | Najpierw testy `update`, względem dzisiejszego zachowania. Przeniesienia i poprawki w osobnych pull requestach. |
| Część kodu nie może się w ogóle zmienić (krytyczna funkcja, zamrożony obszar) | Zostaje tam, gdzie jest, i łączy się z nowym układem tylko przez fasady. Fasady to kod addytywny. |

## 20. Studium przypadku: Quayside

Quayside to **fikcyjna** aplikacja desktopowa, wymyślona na potrzeby tego dokumentu. Luźno przypomina rodzaj oprogramowania, które budujemy, ale każda nazwa, liczba i plik poniżej są zmyślone. Quayside nagrywa rozmowy, transkrybuje je na urządzeniu, pisze podsumowanie lokalnym albo chmurowym modelem, uruchamia zadania uzupełniające z agentami kodującymi, synchronizuje zadania do wykonania ze wspólną tablicą zespołu i ma aplikację towarzyszącą na telefon, która może obserwować nagranie i wysłać do niego notatkę.

Od dwóch lat buduje ją w pośpiechu mały zespół i aplikacja działa. Jest też podręcznikowym przykładem wszystkiego, co opisała sekcja 1.

### 20.1. Przed

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

Pomiar z kroku 1 migracji:

| Co | Wartość |
|---|---|
| Linie Rust (bez testów) | ~78 000 |
| Pliki używające `tauri::` | 37 ze 112 |
| Funkcje `#[tauri::command]` | 148, w 4 plikach |
| Pola `AppState` | 41, z czego 14 to `Mutex<…>` albo atomiki |
| `static` ze stanem | 12 |
| Miejsca otwierające zapisujące połączenie SQLite | 9 |
| Pliki z `#[cfg(target_os = …)]` | 23 |
| Warianty `start_recording_*` | 7 |
| Czas uruchomienia testów domenowych | wymagają okna, więc nikt ich nie uruchamia |

### 20.2. Objawy w kodzie

Stan aplikacji, w skrócie:

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

Stop, który przecieka między nagraniami. Użytkownik naciska Stop, a zaraz potem zaczyna nowe nagranie. Pętla starego nagrania nie zdążyła jeszcze odczytać flagi; nowe nagranie niczego nie resetuje; następne sprawdzenie `recording_cancel` zatrzymuje **nowe** nagranie:

```rust
static RECORDING_CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn stop_recording() {
    RECORDING_CANCEL.store(true, Ordering::SeqCst);
}
```

Domena rozmawia z oknem bezpośrednio, więc nie da się jej przetestować bez okna:

```rust
pub async fn transcribe(app: AppHandle, file: PathBuf) -> Result<(), String> {
    let mut words = whisper::stream(&file)?;
    while let Some(word) = words.next().await {
        app.emit("transcript-word", &word).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

Warianty się mnożą:

```rust
pub async fn start_recording(…)
pub async fn start_recording_with_limit(…)
pub async fn start_recording_with_limit_and_device(…)
pub async fn start_recording_for_meeting(…)
pub async fn start_recording_for_meeting_with_limit(…)
pub async fn start_recording_from_companion(…)
pub async fn start_recording_with_test_hook(…)
```

A system operacyjny jest wszędzie:

```rust
#[cfg(target_os = "macos")]
fn reveal(path: &Path) {
    let _ = Command::new("sh").arg("-c").arg(format!("open -R '{}'", path.display())).spawn();
}
```

Ten ostatni przykład to przy okazji wstrzyknięcie do powłoki, które czeka tylko na nazwę pliku z apostrofem.

### 20.3. Migracja krok po kroku

**Krok 2: odwrócenie zależności.** Transkrybent przestaje przyjmować `AppHandle`. Zapisuje słowa do ograniczonego kanału, którego właścicielem jest `core`; `app` pompuje ten kanał do okna. Kod wysyłania plików przestaje czytać `AppState` i dostaje dwie potrzebne mu wartości jako argumenty.

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

**Krok 3: rozdzielenie `app` i `core`.** Workspace z `quayside-core` (bez `tauri`) i istniejącym `src-tauri` jako `app`. `lib.rs` w aplikacji zachowuje `pub use quayside_core::{…};`, więc każda stara ścieżka nadal się kompiluje. Dowód: podłożone `use tauri::Manager;` w `core` nie kompiluje się.

**Krok 4: `kit`, `store`, `drivers`.** Dziewięć miejsc otwierających SQLite zwija się do jednego writera w `quayside-store`. Rejestrator, transkrybent, klienci modeli i `git` trafiają do `quayside-drivers`. 23 pliki z `#[cfg]` stają się jednym folderem `platform/` z `unix.rs`, `macos.rs` i `unsupported.rs`, a `reveal` staje się kontraktem:

```rust
pub fn reveal_path(path: &Path) -> Result<(), PlatformError> {
    let status = Command::new("/usr/bin/open").arg("-R").arg(path).status()?;
    status.success().then_some(()).ok_or(PlatformError::Refused("open -R"))
}
```

Bez powłoki, bez cudzysłowów, bez wstrzyknięcia.

**Krok 5: slice'y.** `handlers.rs` i `utils.rs` są rozbierane na slice'y, od najmniejszego:

```
settings → device → llm → summary → transcript → board → companion → agent → recording
```

**Krok 6: `kit::Jobs`.** `transcribing` i `summarizing` (dwie mapy z tokenami anulowania) stają się jednym `Jobs<TranscriptId>` w serwisie transkrypcji i jednym `Jobs<SummaryId>` w serwisie podsumowań.

**Krok 7: aktorzy.** Trzy fragmenty stanu przechodzą test z 9.1: nagranie, biegi agentów i synchronizacja tablicy. Nagranie idzie pierwsze, z testami `update` napisanymi względem dzisiejszego zachowania. `AtomicBool` znika; Stop niesie teraz generację nagrania, którego dotyczy, a przeciek z 20.2 staje się jednolinijkowym testem, który zostaje zielony na zawsze. Siedem funkcji `start_recording_*` staje się jedną:

```rust
pub struct StartRecording {
    pub title: String,
    pub device: Option<DeviceId>,
    pub meeting: Option<MeetingId>,
    pub limit: Option<Duration>,
    pub origin: Origin,
}
```

**Krok 8: checki.** Każdy check z sekcji 16 zostaje włączony ze swoją listą bazową. Większość list bazowych jest już pusta, bo powyższe kroki usunęły naruszenia.

### 20.4. Po

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

Komenda po migracji:

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

Ten sam pomiar, powtórzony:

| Co | Przed | Po |
|---|---|---|
| Pliki używające `tauri::` | 37 | 12, wszystkie w `src-tauri` |
| Najdłuższa komenda | 140 linii | 9 linii |
| Pola `AppState` | 41 | 9 |
| `static` ze stanem | 12 | 0 |
| Zapisujące połączenia SQLite | 9 miejsc | 1 |
| Pliki z `#[cfg]` systemu operacyjnego | 23 | 3, wszystkie w `platform/` |
| Warianty `start_recording_*` | 7 | 1 |
| Testy domenowe | wymagały okna | działają w kilka sekund, bez okna |
| Kompiluje się na Linuksa i Windows (poza `app`) | nie | tak, sprawdzane w CI |

Te liczby są przykładowe. Liczy się kształt zmiany: każdy wiersz przesunął się w stronę jednego właściciela, jednego miejsca i jednej reguły.

## 21. Lista kontrolna wdrożenia i FAQ

### 21.1. Lista kontrolna dla nowego projektu

- Workspace z dwoma crate'ami: `<product>-core` (bez `tauri`) i crate `app`.
- `kit::paths` od pierwszego dnia; żadnych zaszytych na sztywno ścieżek domowych ani tymczasowych.
- `drivers/src/platform/` z `mod.rs`, `unix.rs`, plikiem waszej platformy i `unsupported.rs`, gdy tylko pojawi się pierwsze wywołanie systemowe.
- Każda funkcja produktu jako slice ze stałymi plikami; komendy o najwyżej 10 liniach.
- Zdarzenia tylko z `app/<slice>/events.rs`.
- Jeden cel testów integracyjnych, `tests/it/`.
- Checki z sekcji 16 w CI od pierwszego tygodnia, póki listy bazowe są jeszcze puste.
- Sekcja SLAT z 18 w przewodniku dla kontrybutorów.

### 21.2. Lista kontrolna dla istniejącego projektu

- Tabela pomiarów zacommitowana jako plan (19.1, krok 1).
- Listy bazowe utworzone dla każdego checku, który zostanie włączony.
- Decyzja, co nie może się zmienić, i fasady dla tej części.
- Kroki od 2 do 8 zaplanowane jako osobne pull requesty, podziały crate'ów zgrane z momentem, gdy otwartych gałęzi jest mało.

### 21.3. Pytania

**Czy SLAT jest tylko dla Tauri?**
Nie. Zastąp „komendę Tauri” swoim wejściem (handler HTTP, podkomenda CLI, konsument komunikatów), a całą resztę zostaw. Tier `app` to po prostu „jedyny crate, który zna framework wejścia”.

**Dlaczego nie architektura heksagonalna z portami wszędzie?**
Porty jako traity opłacają się wtedy, gdy są dwie implementacje. Większość driverów w aplikacji desktopowej ma jedną. SLAT trzyma konkretne typy, dopóki nie powstanie druga implementacja, a testowalność bierze zamiast tego z czystych funkcji `logic`/`update` i szwów na danych.

**Czy pięć tierów to za dużo dla małej aplikacji?**
Zacznij od dwóch (`core` i `app`). Pozostałe dodawaj, gdy ich kod istnieje i jest czysty.

**Czy wszystkie slice'y potrzebują wszystkich plików?**
Nie. Plik, który nie jest potrzebny, nie istnieje. Mały slice może być pojedynczym `mod.rs`.

**Kiedy coś jest aktorem, a nie serwisem?**
Gdy spełnione są wszystkie trzy warunki z 9.1. W razie wątpliwości to serwis. Późniejsza zamiana serwisu w aktora to zmiana zamknięta w jednym slice'ie.

**Co, jeśli dwa slice'y potrzebują siebie nawzajem?**
Wspólna część staje się osobnym slice'em i oba od niej zależą. Cykle nigdy nie są dozwolone.

**Dlaczego limit komendy to 10 linii?**
Bo komenda, która tylko tłumaczy, nie potrzebuje własnego testu jednostkowego. Dziesięć linii wystarcza, żeby zdeserializować, wywołać i zmapować; nie wystarcza, żeby ukryć decyzję.

**Czy SLAT spowalnia kompilację?**
Podział na crate'y zwykle przyspiesza buildy przyrostowe, bo zmiana w jednym slice'ie nie przebudowuje `kit`, `store` ani `drivers`. Może nieco spowolnić czysty build przez dodatkowe kroki linkowania i dlatego SLAT ogranicza liczbę crate'ów.

**Wydajemy tylko na macOS. Czy sekcja 12 opłaca się już teraz?**
Tak, jej tania część: `kit::paths`, kontrakty dla tych kilku wywołań systemowych, które już macie, `unsupported.rs` i job kompilacji na Linuksie i Windows. To kosztuje dni teraz i oszczędza przeszukiwanie całej bazy kodu później. Same pliki `linux.rs` i `windows.rs` czekają, aż zapadnie decyzja o porcie.

**Jak agenci kodujący radzą sobie ze SLAT?**
Dobrze, bo układ jest stały, a najważniejsze reguły to checki, a nie rady. Zob. sekcja 18.

## 22. Historia wersji

| Wersja | Data | Zmiany |
|---|---|---|
| 1.1 | 25 października 2026 | Sekcja 12, *Platformy*: folder `platform/` w `drivers`, kontrakty platformy, zakazy poza `platform/`, reguły dla ścieżek, plików i tekstu, testy platformy, job kompilacji w CI na Linuksie i Windows, przepis na port. Uzupełnienia w tierach, egzekwowaniu, przepisach i drzewie decyzyjnym. |
| 1.0 | 24 października 2026 | Pierwsza wersja: tiery, slice'y ze stałymi warstwami, reguły importów, przepływy danych, aktorzy, stan aplikacji jako korzeń kompozycji, błędy, testowanie, limity rozmiaru, egzekwowanie, przepisy i migracja. |

SLAT jest wersjonowany jak biblioteka. Nowa reguła podnosi wersję minor, gdy przychodzi z listą bazową: dzisiejszy kod pozostaje zgodny, a czerwone są tylko nowe naruszenia. Tak wersja 1.1 dodała reguły platform. Zmiana, która sprawia, że zgodny kod przestaje być zgodny, a nie ma listy bazowej, która by to wchłonęła, na przykład zmiana nazw plików slice'a albo odwrócenie zależności, podnosi wersję major. Poprawki, które nie zmieniają żadnej reguły, zachowują wersję. Każde repozytorium, które stosuje SLAT, podaje w przewodniku dla kontrybutorów wersję, której się trzyma.
