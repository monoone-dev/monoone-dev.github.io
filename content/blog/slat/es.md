SLAT es un patrón para organizar el backend de una aplicación de escritorio escrita en Rust, con Tauri como capa de ventana. Responde a tres preguntas que cualquier base de código en crecimiento acaba resolviendo mal: **dónde va este archivo**, **quién puede importar a quién** y **cómo se mueven los datos** entre la ventana, el dominio y el mundo exterior.

El nombre enumera sus cuatro piezas: **S**lice, **L**ayer, **A**ctor, **T**ier. Cada regla de este documento trata de una de ellas.

Esta página es la referencia completa. Está escrita para que un equipo que nunca haya visto SLAT pueda adoptarlo en un proyecto nuevo o migrar uno existente sin tener que preguntarnos nada. Incluye las reglas, sus motivos, código que se puede copiar, los checks que las hacen cumplir y un ejemplo completo de una aplicación desordenada que se pone en orden paso a paso.

Los números de sección son estables. Un repositorio que sigue SLAT guarda una copia breve de las reglas en `docs/slat/SLAT.md` con los mismos números, así que una referencia como «sección 17.8» significa lo mismo en esta página y en el repositorio. Cuando las dos difieren, ambas se corrigen el mismo día. Una sección nueva se añade justo antes del historial de versiones, que siempre queda al final.

> **Versión 1.2** · 25 de octubre de 2026. La versión 1.2 añade la sección 22, *Tiempo de build y de tests*: adónde va el tiempo de compilación en un workspace SLAT, los ajustes que lo reducen, cómo ejecutar solo los tests a los que puede afectar un cambio y qué hace que un build vuelva a empezar cuando no debería. Además, da un check a cada regla de la guía, incluidas la pureza de `logic.rs`, los ciclos entre slices y el comando de 10 líneas. El historial completo está en la sección 23.

## 1. Por qué existe SLAT

Una aplicación Tauri empieza siendo pequeña. Hay un `main.rs`, unas cuantas funciones `#[tauri::command]`, quizá un `state.rs`. Seis meses después, el mismo proyecto suele tener este aspecto:

- uno o dos archivos enormes contienen «los comandos», y los comandos contienen toda la lógica de negocio;
- el estado de la aplicación es un struct con treinta campos, la mitad de ellos `Mutex<Option<…>>` y `AtomicBool`;
- unas cuantas variables `static` guardan más estado que no pertenece a nadie;
- la lógica de dominio llama directamente a `app.emit(…)`, así que nada se puede probar sin una ventana;
- las funciones se multiplican en variantes: `start_with_budget`, `start_with_budget_and_slots`, `start_with_hook`;
- `#[cfg(target_os = "macos")]` aparece repartido por todo el código;
- una persona nueva en el equipo, o un agente de código, necesita un día para encontrar dónde vive una funcionalidad.

Nada de esto lo causa la mala fe. Lo causa la falta de una respuesta compartida a «¿dónde va esto?». Cuando no hay respuesta, gana el archivo más cercano, y el archivo más cercano siempre es el más grande.

SLAT da esa respuesta una sola vez, para cada tipo de código, y convierte sus partes importantes en algo **mecánico**: el compilador y un puñado de scripts pequeños rechazan el código que rompe la estructura, de modo que la estructura sobrevive a los plazos, a las incorporaciones al equipo y a los agentes de código.

SLAT es para un backend en Rust lo que Nx con NgRx es para un front-end: un conjunto de reglas independiente de cualquier aplicación concreta. Lo usamos en todos los productos de MonoOne con backend en Rust y Tauri, entre ellos RigOne e IndexOne.

### 1.1. Objetivos

1. **Localizabilidad.** Una persona o un agente que conoce el nombre de una funcionalidad conoce la carpeta donde vive, a ambos lados de la aplicación.
2. **Pruebas sin ventana.** Todo excepto la fina capa de entrada compila y ejecuta sus tests sin Tauri, sin pantalla y sin procesos reales.
3. **Fronteras que impone el compilador.** La dirección de las dependencias está escrita en `Cargo.toml`, no en una wiki.
4. **Un único propietario para el estado de larga duración.** El trabajo en segundo plano (una ejecución, una grabación, una conversación) tiene exactamente un propietario, y sus reglas son una función pura.
5. **Crecimiento barato.** Una funcionalidad nueva es una carpeta nueva con un conjunto fijo de archivos, no cambios en cinco archivos compartidos.
6. **Portabilidad por construcción.** El código que depende del sistema operativo vive en una sola carpeta, así que una plataforma nueva es un archivo nuevo, no una búsqueda por todo el repositorio.

### 1.2. Lo que SLAT no pretende

- SLAT no prescribe el front-end. Solo fija el contrato en la frontera: comandos, objetos de transferencia de datos (DTO) y eventos.
- SLAT no es un framework. No hay ningún crate del que depender. Es una estructura, un conjunto de reglas y unos pocos scripts.
- SLAT no sustituye a las reglas propias del repositorio. Cuando una regla del proyecto y SLAT no coinciden, **gana la regla del proyecto**. SLAT dice dónde vive cada cosa; el proyecto dice qué está prohibido.

### 1.3. Para quién es

SLAT está pensado para aplicaciones de escritorio en Rust con Tauri, a partir de unas 10.000 líneas de código de backend. Las ideas sirven para cualquier aplicación en Rust con una capa de entrada fina (una CLI, un daemon, un servidor): basta con sustituir «comando de Tauri» por «handler HTTP» o «subcomando de CLI» y todo lo demás se mantiene.

## 2. SLAT en una página

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

Seis frases para recordar:

1. **Solo el crate `app` conoce Tauri.** Todo lo demás compila y se prueba sin ventana.
2. **Una funcionalidad vive en un slice, y un slice tiene archivos fijos.** ¿Buscas el chat? Está en `core/chat/` y en `app/chat/`.
3. **Un comando de Tauri tiene como máximo 10 líneas**: deserializa, llama a una función del slice y convierte el resultado en un DTO.
4. **El estado de larga duración tiene un único propietario: un actor.** Nada de `Mutex<Option<…>>` ni `AtomicBool` en el estado de la aplicación, nada de `static` con estado dentro de los slices.
5. **Las dependencias apuntan hacia abajo.** Un tier inferior nunca importa uno superior, y lo impone el compilador.
6. **Solo `drivers/src/platform/` conoce el sistema operativo.** El resto pide conceptos (grupo de procesos, secreto, carpeta de datos), nunca llamadas al sistema.

## 3. Vocabulario

| Término | Significado | Equivalente en el front-end |
|---|---|---|
| **Tier** (nivel) | Un tipo de crate: `kit`, `store`, `drivers`, `core`, `app`. Los tiers se apilan y solo dependen hacia abajo. | Un tipo de librería en Nx (`type:util`, `type:data-access`, …) |
| **Slice** (porción) | Una funcionalidad del producto, como `run`, `chat` o `skill`. | Una carpeta de dominio, `src/sections/<area>` |
| **Layer** (capa) | Un archivo dentro de un slice con nombre y función fijos: `model.rs`, `logic.rs`, `store.rs`, `service.rs`. | `feature/`, `ui/`, `data-access/`, `util/` |
| **Actor** | El único propietario de un estado de larga duración: `Msg → update → Effect`. | Un store de NgRx: action → reducer → effect |
| **Handle** (asa) | La única puerta de entrada a un actor desde fuera. | `inject(Store)` |
| **Snapshot** (instantánea) | Lo que la ventana ve de un actor, publicado a través de un canal `watch`. | `select(…)` |
| **Entry** (entrada) | Una vía por la que el mundo exterior llama al backend: un comando de Tauri, un servidor MCP, un puente local, un hub remoto. | Un componente de pantalla |
| **Query** (consulta) | Una lectura sin efectos secundarios. | Un selector |
| **Command** (comando) | Un cambio de estado. | Una action |
| **Event** (evento) | El backend avisa al front-end de que algo ha cambiado, sin que se lo pidan. | Un push a un store |
| **Platform** (plataforma) | Un sistema operativo para el que compilamos: `macos`, `linux`, `windows`. | Un navegador de destino |
| **Platform contract** (contrato de plataforma) | Una función de `drivers::platform` que significa lo mismo en todos los sistemas operativos. | Un polyfill |

Tres de estos términos se confunden con facilidad, así que conviene tener presente esta imagen: **los tiers son las plantas de un edificio, los slices son los pisos de la planta `core` y las capas son las habitaciones de cada piso.**

## 4. De dónde viene SLAT

Las piezas de SLAT no son nuevas. Combina cinco ideas conocidas y cierra las decisiones que cada una deja abiertas.

| Idea | Qué toma SLAT de ella | Qué decide SLAT además |
|---|---|---|
| Arquitectura en capas / Clean Architecture | Las dependencias apuntan hacia el dominio; la E/S está en el borde. | Las capas son **crates**, así que el compilador comprueba la dirección. Exactamente cinco tipos. |
| Vertical Slice Architecture | El código se agrupa por funcionalidad, no por función técnica. | Cada slice tiene los **mismos nombres de archivo** con las mismas funciones. |
| The Elm Architecture, NgRx, Redux | El estado cambia mediante mensajes y una función update pura. | Solo para el estado que supera la prueba de las tres preguntas (sección 9.1). Los efectos vuelven como mensajes. |
| Functional core, imperative shell | Las decisiones son puras; los efectos secundarios se ejecutan aparte. | `logic.rs` y `update.rs` son puros por regla, y un script lo comprueba. |
| Puertos y adaptadores (hexagonal) | Al mundo exterior se llega a través de una interfaz. | Ningún trait hasta que haya dos implementaciones. El tier `drivers` y los contratos de plataforma hacen de puertos. |

La diferencia con cada una de ellas por separado es que SLAT es **completo y mecánico**. Cada tipo de código tiene exactamente un lugar, y las reglas importantes las imponen `Cargo.toml` o un check que se ejecuta en CI.

## 5. Tiers

Un workspace SLAT tiene como máximo cinco tipos de crates. Se llaman `<product>-<tier>`, por ejemplo `quayside-core`.

| Tier | Qué vive aquí | Puede depender de | Nunca |
|---|---|---|---|
| `kit` | Tipos y herramientas compartidos sin dominio: identificadores, tiempo, rutas (`kit::paths`), escrituras de archivos duraderas, el tipo de error base, logging. | solo librerías externas | `tauri`, `tokio::process`, SQL, `#[cfg]` de sistema operativo, nada del producto |
| `store` | Persistencia: la conexión de escritura, migraciones, esquema, reconstrucción del índice, cifrado de la base de datos. | `kit` | `tauri`, lógica de dominio, procesos |
| `drivers` | El mundo exterior: procesos, herramientas de línea de comandos de proveedores, HTTP, sidecars. El código que depende del sistema operativo vive solo en `drivers/src/platform/`. | `kit` | `tauri`, `store`, lógica de dominio |
| `core` | Todos los slices de dominio: modelo, lógica, casos de uso, actores. | `kit`, `store`, `drivers` | `tauri` |
| `app` | Entradas: comandos de Tauri, DTO, eventos, servidores de entrada (MCP, puente), el estado de la aplicación, `setup`, `main`. | todos los demás tiers | lógica de dominio (pertenece a `core`) |

En este documento, `core/…` y `app/…` abrevian las carpetas de código fuente de esos dos crates. `core/src/<slice>/` es `crates/<product>-core/src/<slice>/`, y `app/src/<slice>/` es `src-tauri/src/<slice>/`, la carpeta que Tauri crea para el crate de la aplicación. Los checks de la sección 16 usan las rutas completas.

### 5.1. El compilador es el guardián

Las flechas entre tiers están escritas en el `Cargo.toml` de cada crate. Si `core` no declara `tauri` como dependencia, `use tauri::Manager;` dentro de `core` es un error de compilación. Es la garantía más fuerte que puede tener una regla: no se puede olvidar, saltar en una revisión ni discutir.

Un workspace mínimo:

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

### 5.2. Con cuántos crates empezar

El mínimo son dos: `core` y `app`. Separa los demás tiers solo cuando su código ya exista y esté limpio, es decir, cuando no importe nada de un tier superior. **Un crate vacío «para más adelante» está prohibido.** Cuesta una ejecución del compilador en cada build y sus propios binarios de test que enlazar en cada ejecución de tests, y no aporta nada.

### 5.3. Cuándo dividir un tier

Cuando `core` supere unas 60.000 líneas, o cuando recompilar `core` entero tras cambiar un solo slice se vuelva molesto, mueve un grupo de slices a `core-<group>`, por ejemplo `quayside-core-run`. Quédate como máximo en seis a ocho crates. Un crate de librería no se enlaza, pero cada crate trae sus propios binarios de test, y cada uno de ellos se enlaza por separado (sección 22.1). En un portátil, una máquina congelada cuesta más que los segundos que ahorraría una división más fina. Decide con una medición, no con una impresión: `cargo build --timings` muestra si `core` es de verdad el cuello de botella (sección 22.6).

**Divide por peso de compilación, no solo por líneas.** Un driver que envuelve una librería nativa o de machine learning grande (reconocimiento de voz, un runtime de inferencia, una base de datos compilada desde fuentes en C) suele pesar más que el propio Tauri. Dentro de `drivers` se compilaría y se enlazaría en cada binario de test de `core`, porque `core` depende de `drivers`. Dale a ese driver su propio crate, `<product>-drivers-<name>`, del que `core` no dependa. `app` depende de él y pasa su resultado al slice a través de una costura de datos (14.2), o el driver se ejecuta como un proceso auxiliar aparte que `app` arranca. Así los tests de `core` nunca lo compilan. `cargo-deny` lo mantiene así: `{ crate = "quayside-drivers-speech", wrappers = ["quayside"] }` en `deny.toml` (16.5) pone en rojo cualquier otro camino hacia ese crate.

### 5.4. Excepción de compatibilidad

Un nombre de librería que ya conocen el bundler de Tauri o los datos del usuario (por ejemplo `quayside_lib`, o una carpeta dentro del directorio personal del usuario) se queda con el crate `app`. Los crates nuevos reciben nombres nuevos.

## 6. Slices

Un slice es una funcionalidad del producto. Su nombre es un sustantivo en singular en `snake_case`: `recording`, `transcript`, `board`, `trigger`. No `recordings_manager`, no `utils`. Cuando el producto tiene front-end, los nombres de los slices coinciden con las carpetas de funcionalidades del front-end, para que la misma palabra encuentre el código a ambos lados.

Un slice existe en dos tiers: su dominio en `core` y su entrada (comandos, DTO, eventos) en `app`.

:::diagram slice

### 6.1. Un slice en `core`

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

Reglas:

- **Un archivo que el slice no necesita no existe.** Un slice pequeño puede ser un único `mod.rs` con su modelo y su servicio hasta que pase de unas 400 líneas.
- **Un archivo que crece se convierte en una carpeta con el mismo nombre**: `logic.rs` pasa a ser `logic/mod.rs` más `logic/<topic>.rs`. La función no cambia, solo el número de archivos.
- **Un slice demasiado grande se divide en sub-slices**: `run/` pasa a ser `run/start/`, `run/step/`, `run/finish/`, cada uno con la misma estructura de archivos. El padre conserva solo un `mod.rs` con reexportaciones.
- **`mod.rs` es la puerta principal del slice**, como el `index.ts` de una librería de Nx. Los demás slices importan solo a través de él.

Un `mod.rs` típico:

```rust
mod logic;
mod model;
mod service;
mod store;

pub use model::{Transcript, TranscriptId, Word};
pub use service::TranscriptService;
```

### 6.2. Un slice en `app`

```
app/src/<slice>/
  mod.rs        `mod …;` and `pub mod commands;` (the command list itself is in lib.rs, 6.4)
  commands.rs   #[tauri::command] functions; at most 10 lines each
  dto.rs        wire types: serde camelCase, #[serde(other)] on enums, From<model>
  events.rs     event names and payloads sent to the window; snapshot subscription loops
```

El resto del crate `app`:

```
app/src/
  main.rs       calls lib::run(); nothing else
  lib.rs        run(): Builder, plugins, setup, generate_handler! with every command, grouped by slice
  state.rs      AppState: the composition root, section 11
  error.rs      entry error → code and text for the window
  platform.rs   optional: window and menu settings that depend on the operating system, section 12.3
  doors/        entries other than the window: MCP server, bridge for agents, remote hub
```

### 6.3. Un comando, la forma de referencia

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

Si un comando necesita un `if`, un bucle o dos llamadas al slice, esa lógica pertenece a `service.rs` o a `logic.rs`. El límite de 10 líneas no es una cuestión de estilo. Un comando que solo traduce no necesita un test unitario propio, porque su lógica está probada en el slice. Lo que queda por demostrar es la frase que ve una persona, y eso se prueba de extremo a extremo a través de la entrada (sección 14).

### 6.4. Registrar los comandos

`tauri::generate_handler!` necesita la ruta completa de cada comando, así que `lib.rs` mantiene una lista. Mantenla agrupada por slice, un bloque por slice, para que añadir un comando sea una línea junto a sus vecinos:

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

Un comando que existe en un slice pero falta en esta lista compila y, en silencio, no hace nada. La sección 16 incluye un pequeño check que compara ambos y falla cuando se desincronizan.

### 6.5. Nombrar los slices

- Un sustantivo por funcionalidad, en singular: `trigger`, no `triggers`.
- El nombre de lo que el usuario reconoce, no de la técnica: `transcript`, no `whisper_pipeline`.
- Cuando dos funcionalidades siempre cambian juntas, son un solo slice. Cuando una funcionalidad tiene partes que cambian de forma independiente, son sub-slices.
- **Las políticas transversales también son un slice**: los controles de acceso, los límites, los presupuestos y la protección de secretos viven en `core/<policy>/` (por ejemplo `core/guard/`) y todos los demás slices los llaman.

## 7. Quién puede importar a quién

### 7.1. Dentro de un slice

| Archivo | Puede importar | No puede importar |
|---|---|---|
| `model.rs` | `kit`; el `model` de otros slices, a través de su `mod.rs` | nada con E/S, `async`, `store`, `drivers` |
| `logic.rs` | `model` | E/S, `async`, `store`, `drivers`, `service` |
| `store.rs` | `model`, el crate `store` | `drivers`, `service`, `logic` de otros slices |
| `service.rs` | `model`, `logic`, `store.rs`, `drivers`, la API pública de otros slices | `tauri`, estado global |
| `actor/*` | `model`, `logic`, `service`, `drivers` | `tauri`; y `update.rs`, además, ninguna E/S |
| `app/<slice>/dto.rs` | el `model` del slice | `service`, `store` |
| `app/<slice>/commands.rs` | la API pública del slice, `dto`, `AppState` | `store`, `drivers`, `logic` |

### 7.2. Entre slices

- **Solo a través de `mod.rs`.** Las rutas profundas como `crate::run::logic::…` desde otro slice están prohibidas.
- **Sin ciclos.** Si `a` necesita a `b` y `b` necesita a `a`, la parte compartida se convierte en su propio slice (normalmente un `model` pequeño o un servicio pequeño), y ambos dependen de él.
- **Una política es un slice, no un comando.** Si una comprobación de presupuesto vive en un comando, toda capa inferior que la necesite tiene que importar hacia arriba. Es la causa más común de ciclos en las aplicaciones Tauri.

### 7.3. Por qué estas líneas en concreto

La tabla de imports está pensada para que lo que es caro de probar (E/S, async, procesos) esté en el menor número posible de archivos, y lo que merece la pena probar (las decisiones) esté en archivos que no tienen nada de eso. Una decisión en `logic.rs` se prueba con un `#[test]` normal en microsegundos. La misma decisión enterrada en un comando necesita una ventana.

## 8. Flujos de datos

:::diagram flows

### 8.1. Query (una lectura)

```
window ─invoke─► app/<s>/commands.rs ─► core/<s>/service.rs ─► core/<s>/store.rs
                        ◄── dto.rs ◄──────── model ◄──────────────────┘
```

Una lectura no pasa por un actor, salvo que lea el estado de ese actor. En ese caso lee el último `Snapshot` del `Handle`, sin enviar ningún mensaje.

### 8.2. Command (un cambio)

Sin estado en segundo plano (guardar un ajuste, crear un archivo):

```
window ─invoke─► commands ─► service ─► logic (decision) ─► store / drivers ─► result
```

Con estado en segundo plano (una ejecución, una conversación, una grabación):

```
window ─invoke─► commands ─► Handle.send(Msg)
                                  │
                 actor ◄──────────┘
                   update(&mut State, Msg) -> Vec<Effect>     pure function
                   for e in effects: execute(e)               I/O: drivers, store, timers
                   snapshot.send(State.view())                the window gets a new view
```

### 8.3. Event (backend → ventana)

Los eventos se emiten **solo** desde `app/<s>/events.rs`. Un slice de `core` publica sus cambios a través de un `watch::Sender<Snapshot>` o de un `broadcast::Sender<Event>`. `events.rs` se suscribe y llama a `emit`. Así `core` no sabe nada de la ventana, y el front-end tiene exactamente un lugar del que llegan los eventos de cada slice. Los nombres de eventos siguen el formato `<slice>:<event>`, por ejemplo `recording:snapshot`.

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

### 8.4. Flujos de gran volumen

Algunos slices producen muchos eventos pequeños: líneas de log, palabras de una transcripción, avisos de progreso. No emitas un evento de Tauri por línea. Da al slice un canal acotado en `core`: un pequeño tipo emisor propio del slice (por ejemplo el `WordSink` de la sección 20.3) cuyo `send` nunca espera y devuelve lo que ha pasado, como `Sent::Delivered`, `Sent::Dropped` o `Sent::Closed`. Deja que `app/<s>/events.rs` tenga una **bomba** que agrupa las líneas en un `tauri::ipc::Channel` cada pocos milisegundos. El canal acotado es la contrapresión: cuando la ventana va lenta, el slice se entera (`Sent::Dropped`) en lugar de llenar la memoria, y cuando ya nadie escucha (`Sent::Closed`) el slice puede detenerse. La agrupación, el canal y la frecuencia de fotogramas son asuntos de la entrada y se quedan en `app`.

## 9. Actores: slices con estado

### 9.1. Cuándo usar un actor

Usa un actor solo cuando se cumplan **las tres** condiciones:

1. el estado vive más que una llamada a un comando;
2. varias fuentes lo cambian de forma concurrente (la ventana, procesos, temporizadores, la red);
3. la ventana lo observa en directo.

En cualquier otro caso, usa un `service.rs` normal. No toda funcionalidad de NgRx necesita effects, y no todo slice de SLAT necesita un actor.

| Candidato | 1 | 2 | 3 | Veredicto |
|---|---|---|---|---|
| una ejecución de agente con pasos y procesos | sí | ventana, procesos, temporizadores | sí | actor |
| una grabación en directo | sí | ventana, dispositivo de audio, temporizador | sí | actor |
| una conversación con un modelo | sí | ventana, proceso del modelo, dispositivo remoto | sí | actor |
| generar un borrador una vez y devolverlo | sí | ventana (inicio/parada) | no, un solo resultado | servicio + `kit::Jobs` |
| una caché de precios de modelos | sí | ninguna | no | un campo del servicio del slice |

### 9.2. Archivos

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

### 9.3. El contrato

- **`update` es pura.** Recibe el estado y un mensaje y devuelve una lista de efectos. Cada regla de negocio sobre ese estado se puede probar sin tokio, sin procesos y sin base de datos.
- **Un efecto que produce un resultado lo devuelve como un nuevo `Msg`.** El actor nunca espera a un efecto largo dentro de su bucle. Un efecto largo va a `tokio::spawn`, y su resultado vuelve por el buzón.
- **La cancelación es un mensaje con una generación**, no un flag: `Msg::Cancel { generation }`. El estado guarda `generation: u64`, y `update` ignora una respuesta tardía con una generación antigua. Un `AtomicBool` global se filtra entre operaciones; una generación no.
- **Un resultado es un valor**: `enum Outcome<T> { Done(T), Cancelled }`, nunca `Err(Cancelled)`. Cancelar es algo que el usuario ha pedido, no un fallo.
- **Un límite de tiempo es `Effect::StartTimer`, y su fin es `Msg::TimedOut`.** Matar un proceso tras un límite de tiempo lo hace un driver. Un `tokio::time::timeout` a secas cancela el future de Rust, no el proceso del sistema operativo.
- **Nada de `std::sync::Mutex` dentro de un actor.** Su estado tiene un único propietario, así que no necesita bloqueo.
- **Un actor por instancia de estado**: uno por ejecución, uno por conversación. El registro de instancias vivas es un pequeño actor propio, o un servicio con un mapa de handles.

### 9.4. Un actor pequeño completo

Un actor de grabación que lanza un proceso grabador, impone un límite de tiempo y se puede detener (el archivo se conserva) o cancelar (el archivo se descarta). Todos los nombres de tipos y funciones son ilustrativos.

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

Una grabación nueva puede empezar siempre que no haya nada en curso, también después de que una anterior se haya guardado o cancelado. La última rama es la razón de ser de las generaciones: un mensaje `Level`, `TimedOut` o `Ended` de una grabación anterior llega con una generación antigua y no cambia nada.

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

El bucle guarda solo un emisor débil para los resultados de sus propios efectos. Cuando se suelta el último `Handle`, `recv` devuelve `None` y el actor termina en lugar de esperar para siempre.

Cuando el orden de los efectos importa (persistir antes de notificar, por ejemplo), ejecuta esos efectos en secuencia dentro de una sola tarea lanzada, en lugar de una tarea por efecto. La única regla es que el bucle en sí nunca espera.

### 9.5. Probar un actor

La mayoría de los tests nunca arrancan el actor. Llaman directamente a `update`:

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

Unos pocos tests manejan el actor completo a través de su `Handle` con `tokio::time::pause()`, un driver falso y aserciones sobre la secuencia de snapshots.

## 10. La explosión de variantes

Una familia de funciones como `start_with_budget`, `start_with_slots`, `start_with_snapshot_hook`, `start_with_budget_and_slots` indica que falta un struct de petición. Sustituye la familia por una única función de entrada y un único struct de opciones:

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

Quien llama escribe `StartRequest { workflow, budget: Some(limit), ..Default::default() }`. Una opción nueva es un campo nuevo, no una función nueva y una línea nueva en cada llamada. Los puntos de inyección solo para tests (`faults`, `hooks`) son campos que existen únicamente en un build de test. `cfg(test)` por sí solo cubre únicamente los tests unitarios del propio crate, así que los tests de integración y los demás crates activan esos campos con una feature `test-hooks`, la misma idea que el driver falso de 14.2. Actívala de la misma forma en todos los comandos de test (sección 22.3); si no, cada cambio entre un build con la feature y otro sin ella vuelve a compilar el crate y todo lo que está por encima.

## 11. AppState, la raíz de composición

`AppState` ensambla la aplicación y no hace nada más. Puede contener:

- valores `Arc<…Service>` y `…Handle` de los slices;
- configuración de solo lectura;
- un handle al escritor de la base de datos.

No puede contener:

- `Mutex<Option<…>>`, `AtomicBool` ni `Mutex<HashMap<…>>` que describan algún proceso en segundo plano. Eso es estado de un actor y pertenece a `core/<slice>/actor/state.rs`;
- campos que son un detalle de un solo slice (cachés, mapas de cancelación, colas).

Los slices tampoco pueden esconder estado en variables `static` (`OnceLock<Mutex<…>>`, `LazyLock<Mutex<…>>`). La única excepción es una constante calculada una vez (`OnceLock<PathBuf>`) que no cambia mientras vive el proceso.

**La prueba:** cada campo de `AppState` se puede describir con un sustantivo de un slice («recordings», «runs», «account»). Un campo que necesita una frase para describirse pertenece a un slice.

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

### 11.1. `kit::Jobs`: trabajo puntual en segundo plano

Generar un borrador, comparar dos carpetas o planificar una tarea se ejecuta en segundo plano, se puede detener y produce un único resultado. Eso no necesita un actor. Necesita un mapa de cancelación, y ese mapa pertenece al servicio del slice, no a `AppState`. `kit::Jobs<K>` es un tipo genérico concreto para ello:

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

`begin` cancela cualquier trabajo anterior con la misma clave, guarda una nueva generación y devuelve un guard que elimina la entrada al destruirse, pero solo si la generación sigue coincidiendo. El bloqueo se mantiene solo dentro de estas dos funciones cortas, nunca a través de un `await`. Como `Jobs` es un tipo concreto y no un trait, no rompe la regla contra los traits con una sola implementación.

Esto no es un resquicio en las reglas de la sección 11. Esas reglas tratan de dónde vive el estado, no de su tipo. Un bloqueo dentro de `kit::Jobs`, propiedad del servicio de un solo slice y nunca mantenido a través de un `await`, es un detalle privado de ese slice. El mismo mapa como campo de `AppState` es estado que no pertenece a nadie.

## 12. Plataformas

*Novedad de la versión 1.1.*

Un producto puede distribuirse hoy en un solo sistema operativo (por ejemplo, solo macOS). SLAT organiza el código para que el siguiente sistema operativo sea trabajo en **una sola carpeta**, no una búsqueda por todo el repositorio. Hay una única regla: **solo `drivers/src/platform/` conoce el sistema operativo.** Todo lo demás pide conceptos (un grupo de procesos, un secreto, la carpeta de datos, abrir un archivo), nunca llamadas al sistema.

La lista de plataformas soportadas pertenece al repositorio (a su guía para contribuidores), no a SLAT.

:::diagram platform

### 12.1. Estructura

```
drivers/src/platform/
  mod.rs          the only platform API: selects a file with #[cfg] and pub use; no logic
  unix.rs         shared by macOS and Linux: process groups, signals, file modes
  macos.rs        Keychain, revealing in Finder, the login shell, …
  linux.rs        only when the port starts: Secret Service, xdg-open, …
  windows.rs      only when the port starts: Job Objects, Credential Manager, ACLs, …
  unsupported.rs  every function returns Err(PlatformError::Unsupported)
```

- Un archivo para un sistema operativo que el producto todavía no soporta **no existe**, por la misma razón por la que no existe un crate vacío «para más adelante». `unsupported.rs` ocupa su lugar.
- `unsupported.rs` no es código muerto. Gracias a él, todo el workspace salvo `app` compila para todas las plataformas desde el primer día. Una fuga de código de sistema en `core` se convierte en un error de compilación en CI, no en un descubrimiento el día del port.
- `mod.rs` tiene el mismo aspecto en todos los repositorios:

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

Un port solo cambia esta lista de líneas `cfg`. Cada archivo de plataforma expone **el mismo conjunto de funciones y tipos con las mismas firmas**. Una función que falta es un error de compilación en esa plataforma. No es un trait: en cada build concreto siempre hay exactamente una implementación.

### 12.2. Contratos

Cada concepto tiene un contrato que significa lo mismo en todos los sistemas operativos. Solo cambia el interior.

| Concepto | API en `drivers::platform` | macOS | Linux | Windows |
|---|---|---|---|---|
| grupo de procesos | `ProcessGroup::spawn`, `terminate(grace)`, `proved_dead()` | id del grupo de procesos; SIGTERM, periodo de gracia, SIGKILL; `kill(-pgid, 0)` devuelve `ESRCH` | como macOS | Job Object; `TerminateJobObject`; al job no le quedan procesos |
| secretos | `secret::read`, `secret::write`, `secret::delete` | Keychain | Secret Service (libsecret) | Credential Manager |
| archivo y carpeta privados | `fs::write_private`, `fs::create_private_dir` | modo `0o600` / `0o700` | como macOS | ACL: solo el propietario |
| abrir en el sistema | `open_path`, `reveal_path`, `open_url` | `open`, `open -R` | `xdg-open` | `ShellExecuteW`, `explorer /select,` |
| entorno del usuario | `login_env()` | la shell de inicio de sesión (el `PATH` de una aplicación abierta desde el Dock es mínimo) | como macOS | registro y entorno del proceso |
| encontrar un programa | `which(program)` | `PATH` | `PATH` | `PATH` más `PATHEXT` |
| datos de la máquina | `machine::cores`, `machine::memory`, `machine::free_space` | sysctl, statfs | /proc, statfs | API del sistema |

Reglas de los contratos:

- Una función de contrato no devuelve tipos del sistema (`pid_t`, `HANDLE`). Devuelve tipos de `drivers` o de `kit`.
- **Pruebas, no esperanza**, en todas las plataformas: «el proceso está muerto» es un hecho comprobado, no una señal que se ha enviado.
- Cuando un sistema operativo no puede hacer lo que exige el contrato, la función devuelve un error que dice qué falta, nunca un sustituto silencioso.

Un ejemplo breve de un contrato y su lado de macOS:

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

### 12.3. Qué está prohibido fuera de `platform/`

| Prohibido fuera de `drivers/src/platform/` | Usa en su lugar |
|---|---|
| `#[cfg(unix)]`, `#[cfg(windows)]`, `#[cfg(target_os = …)]` | un contrato de 12.2 |
| `std::os::unix`, `std::os::windows`, `libc`, `nix`, `windows-sys`, `security-framework` | un contrato de 12.2 |
| `sh -c`, `bash`, `zsh`, `cmd /c`, `powershell` | `Command::new(program).args(…)`; si de verdad hace falta una shell, la elige `platform` |
| nombres de programas del sistema: `open`, `xdg-open`, `security`, `osascript`, `explorer` | `open_path`, `secret::*`, … |
| rutas escritas a mano: `~`, `$HOME`, `/tmp`, `/usr/bin`, `/Applications`, `Library/` | `kit::paths` (12.4) |
| unir rutas con una cadena `/` | `Path::join` |
| modos de archivo como números (`0o600`) | `fs::write_private` |

La única excepción es `app/src/platform.rs`, para lo que solo conoce Tauri: el estilo de la barra de título, el menú de la aplicación, la política de activación de la ventana. Nada más que ajustes de ventana.

### 12.4. Rutas, archivos y texto

- **Las carpetas salen solo de `kit::paths`**: `data()`, `config()`, `cache()`, `logs()`, `temp()`. Por debajo hay una librería que sigue la convención de cada sistema (macOS `~/Library/Application Support/<App>`, XDG en Linux, `%APPDATA%` en Windows). Los datos que ya viven en una ruta antigua se quedan allí en el sistema donde se crearon (la excepción de compatibilidad de 5.4); en ese sistema `kit::paths` devuelve la ruta antigua, así que el código sigue preguntando solo a `kit::paths`. `kit` en sí no tiene ningún `#[cfg]`: la convención del sistema la aporta la librería.
- **Los nombres de archivo que crea la aplicación van en minúsculas** y nunca se diferencian solo por mayúsculas y minúsculas. Los sistemas de archivos por defecto de macOS y Windows no los distinguen; Linux sí.
- **No renombres ni borres un archivo que alguien tiene abierto.** Windows lo rechaza. Las escrituras atómicas pasan por `kit::durable_file`, que cierra el archivo antes de sustituirlo.
- **Rutas largas.** Windows limita las rutas a unos 260 caracteres sin el prefijo `\\?\`. Mantén poco profundas las copias de trabajo y las carpetas de ejecución; el prefijo lo añade `platform`, nunca un slice.
- **El texto que llega de los procesos** se lee tolerando `\r\n`. Los archivos que escribe la aplicación usan `\n`.
- **Una ruta enviada a la ventana** va en UTF-8. Una ruta que no se puede escribir en UTF-8 es un error que nombra el archivo, nunca un `unwrap()`.

### 12.5. Tests de plataforma

- **El test de contrato** vive en `drivers/tests/it/platform_contract.rs`, un módulo del único target de integración del crate (14.1), y es el mismo para todos los sistemas operativos: un proceso está muerto después de `terminate`, un secreto vuelve después de escribirse y desaparece después de borrarse, otro usuario no puede leer un archivo privado. Todas las plataformas soportadas pasan **el mismo** conjunto.
- **Los tests fuera de `drivers` no usan una shell ni señales.** Un proceso que necesita un test es un pequeño programa en Rust (un binario en un crate de test), no `sh -c 'sleep 10'`.
- Un `#[cfg]` de plataforma en los tests solo está permitido en los tests de `drivers`.

### 12.6. Cumplimiento

| Regla | Quién la hace cumplir |
|---|---|
| las prohibiciones de 12.3 | un check con grep y una lista base (sección 16) |
| los crates distintos de `app` compilan en todas las plataformas | `cargo check --workspace --exclude <app>` en runners nativos de CI para Ubuntu y Windows. No una compilación cruzada desde macOS: los build scripts con código C necesitan el compilador del destino. |
| el contrato funciona | `platform_contract.rs` en un runner para cada plataforma **soportada** |

### 12.7. Portar a un sistema operativo nuevo

1. `drivers/src/platform/<system>.rs`: todas las funciones del contrato. El compilador enumera lo que falta.
2. `mod.rs`: el `cfg` del nuevo sistema deja de apuntar a `unsupported.rs`.
3. `platform_contract.rs` está en verde en el runner de ese sistema, y el runner se incorpora a CI.
4. `app`: configuración de empaquetado y firma para el sistema, y `app/src/platform.rs` si hace falta.
5. La guía para contribuidores del repositorio añade el sistema a la lista de plataformas soportadas.

Si un port exige un cambio en `core`, algo se ha filtrado. Primero, un pull request aparte mueve la fuga detrás de un contrato; después continúa el port.

## 13. Errores

- **Cada crate tiene su propio enum de errores** (con `thiserror`). Un slice puede tener el suyo en `error.rs`.
- **`core` devuelve errores de dominio.** `app/error.rs` los convierte en un código y una frase para la ventana. La frase sale de tu tabla de traducciones, nunca del `Display` de un enum que llega por el cable.
- **Un evento desconocido que llega por el cable no es un error.** Usa `#[serde(other)]` en los enums y `Option<T>` en los campos que no son esenciales. Registra la línea desconocida para depuración y sigue adelante. Una nueva versión de la herramienta de línea de comandos de un proveedor nunca debe detener una ejecución.
- **`unwrap()` y `panic!` están prohibidos** fuera de los tests en `core`, `store` y `drivers`. Usa `?` con una variante de error, o `expect()` con un motivo que explique por qué el valor no puede faltar.

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

## 14. Tests por capa

| Capa | Cómo probarla | Qué cuenta como prueba |
|---|---|---|
| `logic.rs`, `update.rs` | un `#[test]` normal, sin tokio | una aserción sobre un valor o sobre la lista de efectos |
| `store.rs` | una base de datos en una carpeta temporal | la fila que devuelve una lectura |
| `service.rs` | `#[tokio::test]` con un store real y un driver falso | el estado de los archivos o de la base de datos tras la llamada |
| `actor/` | un `Handle` más un guion de mensajes; el tiempo con `tokio::time::pause` | la secuencia de `Snapshot` |
| `drivers` | un proceso real o un flujo grabado | el proceso está muerto (`ESRCH` o un job vacío), las líneas que llegan por el cable |
| `app/commands` | ningún test unitario; un test end-to-end o de integración a través de la entrada, para lo que ve una persona | el texto que ve una persona |

Un test de un mensaje que se muestra a una persona va donde la persona lo ve, no solo en `logic.rs`. Una función que produce la frase correcta no demuestra nada si nadie la llama.

### 14.1. Un único binario de integración

Cada archivo que está directamente en `tests/` es un binario aparte, y cada binario se enlaza por separado. En un workspace grande eso supone un minuto por archivo. Da a cada crate **un único** target de integración, `tests/it/main.rs`, con un módulo por tema, y ejecuta un solo tema con un filtro:

```
tests/it/
  main.rs          mod recording_stops_on_time_limit; mod transcript_survives_restart; …
  recording_stops_on_time_limit.rs
  transcript_survives_restart.rs
```

```bash
cargo nextest run --test it recording_stops_on_time_limit::
```

Ejecútalo con `--no-tests=fail`, para que un filtro que no encuentra nada salga en rojo en lugar de en un verde silencioso.

Las utilidades que comparten los tests son un módulo del mismo target, `tests/it/support/`. Un archivo de utilidades puesto directamente en `tests/` es un binario más que enlazar.

### 14.2. Un driver falso sin trait

Un test necesita un driver que no lance procesos reales. SLAT prohíbe un trait con una sola implementación, y una falsa no cuenta como una segunda implementación real. Dos opciones respetan la regla. Prefiere la primera: una feature cambia cómo se compilan `drivers` y todos los crates que están por encima, así que un build de test con ella y un build de la aplicación sin ella son dos conjuntos de artefactos separados (sección 22.3). Una costura de datos no cuesta nada de tiempo de compilación.

- **Una costura de datos.** El servicio recibe la *salida* del driver como un valor o un canal, no el driver en sí. El test envía líneas al canal.
- **Un build de test.** `drivers` expone `#[cfg(any(test, feature = "fake"))] pub mod fake;` con las mismas funciones que el módulo real, y el crate de test activa la feature `fake`.

Cuando aparece una segunda implementación real (un segundo proveedor, una segunda plataforma), ese es el momento de un trait.

### 14.3. Mutantes en el diff

Un test que pasa solo demuestra algo si fallaría con código incorrecto. Es la sección 16.2 aplicada a los tests. `cargo-mutants` cambia el código (invierte una condición, sustituye un valor de retorno, borra una instrucción) e informa de cada cambio que ningún test ha detectado. Ejecútalo sobre las líneas que ha cambiado un pull request, no sobre todo el workspace:

```bash
git diff origin/main...HEAD > changes.diff
cargo mutants --in-diff changes.diff --package quayside-core
```

`logic.rs` y `update.rs` son donde más rinde. Son puros, así que sus tests se ejecutan en microsegundos, y un mutante que sobrevive ahí es una regla de negocio que nadie comprueba. Un mutante que sobrevive se corrige con un test, nunca con una exclusión.

### 14.4. Tests de propiedades para `update`

Un test de `update` comprueba un guion de mensajes. Un test de propiedades comprueba miles de guiones aleatorios contra reglas que siempre deben cumplirse. Con `proptest`, genera una secuencia de valores `Msg` y comprueba los invariantes del estado después de cada paso:

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

`messages(n)` es una estrategia del módulo de test que construye valores `Msg` aleatorios, y `Msg::generation()` es una pequeña función auxiliar que devuelve la generación que lleva un mensaje. La fuga de la sección 20.2 es exactamente el tipo de error que un test así encuentra por sí solo: nadie tiene que imaginar el orden de mensajes que la provoca.

## 15. Límites de tamaño

| Unidad | Umbral de aviso | Qué hacer |
|---|---|---|
| archivo | 1500 líneas de código (sin tests) | dividirlo en una carpeta con la misma función, sección 6.1 |
| slice | 15.000 líneas | dividirlo en sub-slices |
| `core` | 60.000 líneas | mover un grupo a `core-<group>`, sección 5.3 |
| comando de Tauri | 10 líneas | mover la lógica a `service.rs` |
| campo de `AppState` | un sustantivo | ver la sección 11 |

Los archivos que superan el umbral el día en que se adopta SLAT van a una **lista base**. La lista solo puede reducirse.

## 16. Cumplimiento

Primero el mecanismo, después las palabras. Una regla que un script puede comprobar nunca debería depender de que alguien la recuerde.

| Regla | Quién la hace cumplir |
|---|---|
| solo `app` conoce Tauri | `Cargo.toml` (ninguna dependencia de `tauri` en otro sitio); `cargo-deny` para las dependencias transitivas (16.5) |
| los tiers solo dependen hacia abajo | `Cargo.toml` |
| solo `store` abre la conexión de escritura | un check con grep: `Connection::open` solo en el crate `store`. Los archivos `store.rs` de los slices usan tipos de `rusqlite`, así que la dependencia por sí sola no basta. |
| `#[tauri::command]` solo en `app/*/commands.rs` | un check con grep |
| todos los comandos están registrados | un check que compara los comandos de los slices con `generate_handler!` |
| `emit` solo en `app/*/events.rs` | un check con grep |
| ningún import profundo entre slices | un check que busca `crate::<a>::<layer>::` desde otro slice |
| ningún `static` con estado en `core` | un check con grep de `static .*(Mutex|RwLock)` |
| `logic.rs` y `update.rs` no tienen E/S | un check: ni `async`, ni `tokio::`, ni `std::fs`, ni `store::`, ni `drivers::` en `logic.rs`, `logic/` y `update.rs` |
| el `mod.rs` de un slice contiene solo `mod …;` y `pub use …;` | un check sobre cada `mod.rs` bajo `core/src/` |
| ningún ciclo entre slices | un check que construye el grafo de slices a partir de los imports y lo ordena |
| un comando de Tauri tiene como máximo 10 líneas | un check sobre `app/*/commands.rs` |
| ni `unwrap()` ni `panic!` fuera de los tests en `core`, `store`, `drivers` | los lints de Clippy `unwrap_used` y `panic` (16.5) |
| el sistema operativo solo en `drivers/src/platform/` y `app/src/platform.rs` | un check con grep y la lista de 12.3 |
| los crates distintos de `app` compilan en todas las plataformas | `cargo check` en runners de CI de Ubuntu y Windows |
| límites de tamaño | un check con una lista base que solo puede reducirse |

Cada check empieza con una **lista base** de las infracciones actuales. Una infracción nueva sale en rojo. Una infracción que se corrige debe quitarse de la lista en el mismo pull request, así que la lista nunca puede volver a crecer.

### 16.1. Un check con lista base

Todos los checks siguen la misma forma: buscar infracciones, restar la lista base, fallar con lo que quede y fallar si la lista base incluye algo que ya está corregido.

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

### 16.2. Un check tiene que poder fallar

Antes de fiarte de un check, introduce una infracción real, comprueba que se pone en rojo y quítala. Un check que nunca ha estado en rojo nunca se ha probado.

Los checks con grep de SLAT buscan código prohibido, así que una coincidencia dentro de un comentario los pone en rojo, no en verde. Es molesto pero seguro, y la solución es borrar el código muerto. Un check que lee el árbol sintáctico (16.5) no tiene este problema. El tipo peligroso es un check que exige que una cadena esté presente: pasa con un comentario. Una regla así se demuestra ejecutando código, no leyendo texto.

### 16.3. El job de plataformas en CI

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

En un repositorio real, fija las versiones de las actions con hashes de commit completos. El job solo compila; no ejecuta tests en plataformas que el producto aún no soporta, así que es barato. El paso de caché lo mantiene barato: sin él, cada pull request compila todas las dependencias desde cero en dos sistemas operativos.

### 16.4. Checks del conjunto completo

| Check | Regla |
|---|---|
| `checks/slat-commands.sh` | `#[tauri::command]` solo en `src-tauri/src/*/commands.rs` |
| `checks/slat-registered.sh` | cada comando de un slice aparece en `generate_handler!` |
| `checks/slat-emit.sh` | `emit` solo en `src-tauri/src/*/events.rs` |
| `checks/slat-deep-imports.sh` | ningún `crate::<slice>::<layer>::` desde otro slice |
| `checks/slat-static-state.sh` | ningún `static … Mutex|RwLock` en `crates/*-core*` |
| `checks/slat-pure.sh` | `logic.rs`, `logic/` y `update.rs` sin `async`, `tokio::`, `std::fs`, `store::`, `drivers::` |
| `checks/slat-slice-mod.sh` | el `mod.rs` de un slice contiene solo `mod …;` y `pub use …;` |
| `checks/slat-slice-cycles.sh` | ningún ciclo entre slices |
| `checks/slat-command-size.sh` | cada `#[tauri::command]` tiene como máximo 10 líneas |
| `checks/slat-platform.sh` | las prohibiciones de 12.3 fuera de `platform/` |
| `checks/slat-size.sh` | los archivos de más de 1500 líneas de la lista base solo pueden reducirse |

El check de ciclos no necesita ninguna librería de grafos. Cada `use crate::<other>` dentro de `core/src/<slice>/` es una arista, y `tsort` informa de un grafo con un bucle en su salida de error:

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

La misma lista de aristas es el grafo de slices que usa la sección 22.4 para encontrar los slices a los que puede afectar un cambio.

### 16.5. Lints y prohibiciones antes que scripts

Algunas reglas no necesitan ningún script, porque las puede hacer cumplir una herramienta que el workspace ya ejecuta.

**Clippy, por tier.** Clippy lee primero el `clippy.toml` de la carpeta del propio crate, así que cada tier puede prohibir cosas distintas. Los lints se activan en `Cargo.toml`:

```toml
[workspace.lints.clippy]
unwrap_used = "deny"
panic = "deny"
```

```toml
[lints]
workspace = true
```

El primer bloque va en la raíz del workspace, el segundo en `kit`, `store`, `drivers` y `core`. El crate `app` no los hereda. Un `clippy.toml` en la raíz del workspace con `allow-unwrap-in-tests = true` y `allow-panic-in-tests = true` mantiene legibles los tests. Un `clippy.toml` en la carpeta de un crate sustituye al de la raíz, así que repite esas dos líneas. Un `clippy.toml` en `core` puede enumerar `disallowed-methods` y `disallowed-types`, por ejemplo `std::process::Command` y `std::sync::Mutex`, para que un proceso lanzado desde un slice o un bloqueo dentro de un actor sea un error de lint, no una coincidencia de grep.

**`cargo-deny`, para todo el grafo de dependencias.** `Cargo.toml` impide `use tauri::…` en `core`, pero no una librería que mete `tauri` por la puerta de atrás. Esa fuga no se ve en una revisión, y hace que los tests de `core` compilen la parte más pesada de la aplicación. `cargo-deny` comprueba todo el grafo. En `deny.toml`:

```toml
[bans]
deny = [
  { crate = "tauri", wrappers = ["quayside", "tauri-plugin-shell", "tauri-plugin-dialog"] },
]
```

Así, `tauri` solo puede aparecer como dependencia directa de los crates de `wrappers`: el crate `app` y los plugins de Tauri que usa, que dependen ellos mismos de `tauri`. Un plugin que se añade a la aplicación entra en la lista en el mismo pull request. Cualquier otro camino hasta `tauri`, como una librería que usa `core`, sale en rojo.

**Sintaxis en lugar de texto.** Los checks con grep de 16.4 se pueden escribir como reglas de `ast-grep`. `ast-grep` busca en el árbol sintáctico de Rust, así que un comentario o una cadena nunca coinciden, y un import repartido en varias líneas (`use crate::run::{logic::plan, model::Run};`) sigue siendo un solo import. Un archivo de reglas por check, con globs `files` e `ignores` tomados de las rutas de 16.4, sustituye a `grep -E`. La lista base (16.1) se queda como está: las reglas producen la lista de infracciones, y el mismo script resta la lista base.

## 17. Recetas

Cada receta empieza con un test que falla con el código antiguo, en una aserción y no en la compilación. En Rust, escribe primero la firma con `todo!()`, para que el test compile y falle por el motivo correcto.

### 17.1. Una lectura nueva (Query)

1. `core/<s>/model.rs`: el tipo del resultado, si no existe.
2. `core/<s>/store.rs`: la función de lectura. Pruébala con una base de datos temporal.
3. `core/<s>/service.rs`: `pub async fn <verb>(…)`, que llama a store y a logic.
4. `core/<s>/mod.rs`: `pub use` de la nueva función o del nuevo tipo.
5. `app/<s>/dto.rs`: el DTO y `From<model>`.
6. `app/<s>/commands.rs`: un comando de 10 líneas como máximo; regístralo.
7. Front-end: la capa de acceso a datos llama al comando.

### 17.2. Un cambio nuevo sin estado en segundo plano (Command)

Igual que 17.1, y la decisión (si está permitido, qué cambia) se escribe en `logic.rs` como función pura con su test. `service.rs` solo la llama y hace la escritura.

### 17.3. Un slice nuevo

1. Nombre: la funcionalidad como sustantivo en singular en `snake_case`.
2. `core/src/<s>/mod.rs` más solo los archivos que necesite; `pub mod <s>;` en `core/src/lib.rs`.
3. `app/src/<s>/mod.rs`, `commands.rs`, `dto.rs`; registra sus comandos.
4. Si el slice tiene estado en segundo plano: receta 17.4.

### 17.4. Un flujo nuevo con estado (actor)

1. Comprueba las tres condiciones de 9.1. Si falla una: receta 17.2.
2. `msg.rs`, `state.rs`, `snapshot.rs`: los tipos.
3. `update.rs`: primero los tests (entra un mensaje, salen los efectos y el estado esperados), después la implementación.
4. `effect.rs`: `execute` para cada efecto; los resultados vuelven como `Msg`.
5. `run.rs` y `handle.rs`: el bucle y la puerta.
6. `AppState` recibe exactamente un campo: el registro o el `Handle`.
7. `app/<s>/events.rs`: suscribirse al `Snapshot` y `emit("<s>:snapshot")`.

### 17.5. Un driver nuevo (el mundo exterior)

1. `drivers/src/<name>.rs` o una carpeta. Un driver no conoce ningún slice ni la base de datos.
2. Un trait solo cuando haya al menos dos implementaciones.
3. Un proceso: grupo de procesos, escalada al matarlo, prueba de que ha muerto; secretos fuera de los argumentos y de los logs. Todo ello a través de los contratos de `platform` (12.2), nunca mediante una llamada al sistema en el driver.
4. Un slice usa el driver desde `service.rs` o desde `effect.rs`.

### 17.6. Un evento nuevo para la ventana

1. Un cambio en `core` publica un `Snapshot` o un `Event` en un canal.
2. `app/<s>/events.rs` se suscribe y emite `<s>:<event>`.
3. Front-end: la capa de acceso a datos escucha y actualiza su store.

### 17.7. Una plataforma nueva

Sección 12.7.

### 17.8. ¿Dónde va esto? (árbol de decisión)

```
¿Llama a Tauri, a la ventana, a MCP o a un hub remoto?         → app (commands, events, doors)
¿Depende del sistema operativo?                                → drivers/src/platform/ (sección 12)
¿Habla con un proceso, la red o un llavero?                    → drivers (mediante contratos de plataforma)
¿Es una lectura/escritura de la base de datos o el esquema?    → store (conexión) / core/<s>/store.rs (consultas)
¿Es una decisión pura o un cálculo?                            → core/<s>/logic.rs (o update.rs en un actor)
¿Es un tipo de dominio?                                        → core/<s>/model.rs
¿Es una secuencia de pasos con E/S?                            → core/<s>/service.rs
¿Es estado que vive en segundo plano y que la ventana observa? → core/<s>/actor/
¿No tiene dominio alguno (tiempo, rutas, ids, archivos)?       → kit
```

## 18. Trabajar con agentes de código

SLAT se diseñó en un equipo en el que buena parte del código la escriben agentes de código. Los agentes siguen una estructura de forma fiable cuando está escrita, es breve y la comprueban las máquinas. Tres cosas marcan la diferencia.

1. **Una estructura fija es un mapa gratuito.** Un agente al que se le pide «añadir un filtro a las transcripciones» abre `core/transcript/` y `app/transcript/` sin buscar. El tiempo que un agente pasa buscando es el tiempo que pasa equivocándose.
2. **Un check vale más que una frase en el prompt.** «No emitas desde core» en un prompt se cumple la mayoría de las veces. Un check en rojo se cumple siempre. Escribe primero la regla como check, y como línea del prompt solo cuando no se pueda comprobar.
3. **Las recetas son prompts.** La sección 17 está escrita a propósito como pasos numerados: pega la receta en la tarea y el agente creará los archivos en los lugares esperados y en el orden esperado.

Los agentes también cambian cómo se compila un workspace. Varios agentes en varias copias de trabajo son varios builds en frío de las mismas dependencias a la vez, que es el portátil congelado de la sección 19.2. La sección 22.5 muestra cómo cada copia de trabajo arranca en caliente sin compartir una carpeta `target/` con otra, y la sección 22.4 cómo cada uno ejecuta solo los tests a los que puede afectar su cambio.

Una sección que puedes copiar en la guía para contribuidores de tu repositorio (`AGENTS.md`, `CLAUDE.md` o equivalente):

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

## 19. Migrar una base de código existente

No hace falta reescribir nada. SLAT se adopta en pull requests pequeños que mantienen la aplicación funcionando en todo momento, en un orden que no bloquea otras ramas.

:::diagram migration

### 19.1. El orden

1. **Medir.** Haz un mapa de los módulos: líneas por módulo, imports que apuntan hacia arriba, archivos que usan `tauri::`, número de `#[tauri::command]`, `static` con estado, campos del estado de la aplicación, `#[cfg]` de sistema operativo. Anótalo en un plan dentro del repositorio. Estas cifras son tus listas base.
2. **Invertir las dependencias que apuntan hacia arriba.** Las políticas que viven en la capa de comandos pero que llaman las capas inferiores bajan a `core/<policy>/`. Los tipos que el dominio toma prestados de la capa de entrada (un canal de líneas, un tipo de imagen, una cadena de mensaje) se mueven al slice al que pertenecen. La ruta antigua se queda como `pub use` hasta que termina la migración.
3. **Separar `app` y `core`.** Crea el workspace y un crate `core` sin `tauri`. El código que conoce Tauri se queda en `app`; todo lo demás se mueve con `git mv`. Es el paso más mecánico.
4. **Separar `store`, `drivers` y `kit`.** Solo cuando su código ya esté limpio. Al separar `drivers`, mueve el código de sistema operativo a `platform/` y dale al check de plataforma su lista base.
5. **Slice a slice.** Un slice por pull request: los comandos a `app/<s>/`, la lógica a `core/<s>/` con la estructura fija. Empieza por el más pequeño y menos compartido.
6. **`kit::Jobs`.** Los mapas de cancelación salen del estado de la aplicación.
7. **Actores.** El estado que hay en el estado de la aplicación y en las variables `static` pasa a actores, un flujo por pull request, escribiendo primero los tests de `update` contra el comportamiento actual.
8. **Checks.** Cada paso activa el check de su regla, con una lista base.

### 19.2. Reglas de la migración

- **Mover no cambia el comportamiento.** Un pull request que mueve código no corrige lógica, y un pull request que corrige lógica no mueve código. Cuando algo se rompe, sabes qué tipo de cambio lo ha causado.
- **Fachadas en las rutas antiguas.** `pub use new::place::*;` en la ruta del módulo antiguo permite que el código que no se puede tocar (o que aún no se quiere tocar) y los tests existentes compilen sin cambios. Una fachada se elimina cuando nada la importa.
- **Un build pesado cada vez.** Varios builds de `cargo` en paralelo de un workspace grande pueden congelar un portátil. Migra en una sola fila.
- **Ejecuta toda la suite de tests después de cada paso**, no después de cada commit. La suite es la prueba de que el comportamiento no se ha movido.

### 19.3. Primero la estructura: un arranque más rápido

Si la localizabilidad es lo que más te duele, puedes reordenar el trabajo: primero mueve los **archivos** a carpetas de slice dentro del único crate existente, sin cambiar su contenido, y deja fachadas en las rutas antiguas. Git los registra como renombrados, así que las demás ramas abiertas siguen fusionándose sin problemas. Consigues el mapa (la carpeta de cada funcionalidad) en uno o dos días, y la división en crates, las capas dentro de cada slice y los actores llegan después, sobre una estructura que ya se lee bien.

Dos cosas no salen gratis ni siquiera aquí. Los archivos que usan `super::` o `pub(super)` cambian de módulo padre al moverse, así que algunas rutas necesitan pequeños arreglos mecánicos. Y sacar los comandos de un archivo central cambia ese archivo, lo que choca con las ramas que lo editan, así que es mejor hacerlo como un segundo paso aparte.

### 19.4. Lo que suele salir mal

| Problema | Qué hacer |
|---|---|
| Cientos de tests importan rutas antiguas | Fachadas en las rutas antiguas. No muevas los tests en los mismos pull requests. |
| Las ramas paralelas entran en conflicto con `git mv` | Haz las divisiones de crates cuando haya menos ramas abiertas. Cada movimiento es su propio pull request. |
| Tras la división, se necesitan elementos `pub(crate)` desde otro crate | Amplíalos a `pub`. Tras la migración, revisa qué puede volver a `pub(crate)`. |
| El tiempo de compilación crece con el número de crates | Como máximo seis a ocho crates. Un build pesado cada vez. Mide con `cargo build --timings` antes y después de cada división (22.6). |
| Un refactor cambia el comportamiento sin que se note | Primero los tests de `update`, contra el comportamiento actual. Movimientos y correcciones en pull requests separados. |
| Una parte del código no puede cambiar en absoluto (una funcionalidad crítica, una zona congelada) | Se queda donde está y llega a la nueva estructura solo a través de fachadas. Las fachadas son código añadido. |

## 20. Caso práctico: Quayside

Quayside es una aplicación de escritorio **ficticia**, inventada para este documento. Se inspira vagamente en el tipo de software que hacemos, pero todos los nombres, cifras y archivos que aparecen a continuación son inventados. Quayside graba llamadas, las transcribe en el dispositivo, redacta un resumen con un modelo local o en la nube, ejecuta tareas de seguimiento con agentes de código, sincroniza las acciones pendientes con un tablero compartido del equipo y tiene una aplicación complementaria para el móvil que puede seguir una grabación y enviarle una nota.

Lleva dos años construyéndola un equipo pequeño con prisas, y funciona. También es un catálogo de todo lo que describía la sección 1.

### 20.1. Antes

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

La medición del paso 1 de la migración:

| Qué | Valor |
|---|---|
| Líneas de Rust (sin tests) | ~78.000 |
| Archivos que usan `tauri::` | 37 de 112 |
| Funciones `#[tauri::command]` | 148, en 4 archivos |
| Campos de `AppState` | 41, de los cuales 14 son `Mutex<…>` o atómicos |
| `static` con estado | 12 |
| Lugares que abren una conexión de escritura a SQLite | 9 |
| Archivos con `#[cfg(target_os = …)]` | 23 |
| Variantes de `start_recording_*` | 7 |
| Tiempo para ejecutar los tests de dominio | necesitan una ventana, así que nadie los ejecuta |

### 20.2. Síntomas en el código

El estado de la aplicación, abreviado:

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

Una parada que se filtra entre grabaciones. El usuario pulsa Stop y enseguida inicia una grabación nueva. El bucle de la grabación anterior todavía no ha leído el flag; la grabación nueva no reinicia nada; la siguiente comprobación de `recording_cancel` detiene la grabación **nueva**:

```rust
static RECORDING_CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn stop_recording() {
    RECORDING_CANCEL.store(true, Ordering::SeqCst);
}
```

El dominio habla directamente con la ventana, así que no se puede probar sin ella:

```rust
pub async fn transcribe(app: AppHandle, file: PathBuf) -> Result<(), String> {
    let mut words = whisper::stream(&file)?;
    while let Some(word) = words.next().await {
        app.emit("transcript-word", &word).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

Las variantes se multiplican:

```rust
pub async fn start_recording(…)
pub async fn start_recording_with_limit(…)
pub async fn start_recording_with_limit_and_device(…)
pub async fn start_recording_for_meeting(…)
pub async fn start_recording_for_meeting_with_limit(…)
pub async fn start_recording_from_companion(…)
pub async fn start_recording_with_test_hook(…)
```

Y el sistema operativo está por todas partes:

```rust
#[cfg(target_os = "macos")]
fn reveal(path: &Path) {
    let _ = Command::new("sh").arg("-c").arg(format!("open -R '{}'", path.display())).spawn();
}
```

Esto último, además, es una inyección de shell esperando a un nombre de archivo que contenga una comilla.

### 20.3. La migración, paso a paso

**Paso 2: invertir las dependencias.** El transcriptor deja de recibir un `AppHandle`. Escribe las palabras en un canal acotado que pertenece a `core`; `app` bombea el canal hacia la ventana. El código de subida deja de leer `AppState` y recibe como argumentos los dos valores que necesita.

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

**Paso 3: separar `app` y `core`.** Un workspace con `quayside-core` (sin `tauri`) y el `src-tauri` existente como `app`. El `lib.rs` de la aplicación conserva `pub use quayside_core::{…};` para que todas las rutas antiguas sigan compilando. Prueba: introducir `use tauri::Manager;` en `core` provoca un error de compilación.

**Paso 4: `kit`, `store`, `drivers`.** Las nueve aperturas de SQLite se reducen a un único escritor en `quayside-store`. El grabador, el transcriptor, los clientes de modelos y `git` van a `quayside-drivers`. Los 23 archivos con `#[cfg]` se convierten en una sola carpeta `platform/` con `unix.rs`, `macos.rs` y `unsupported.rs`, y `reveal` pasa a ser un contrato:

```rust
pub fn reveal_path(path: &Path) -> Result<(), PlatformError> {
    let status = Command::new("/usr/bin/open").arg("-R").arg(path).status()?;
    status.success().then_some(()).ok_or(PlatformError::Refused("open -R"))
}
```

Sin shell, sin comillas, sin inyección.

**Paso 5: slices.** `handlers.rs` y `utils.rs` se desmontan en slices, empezando por los más pequeños:

```
settings → device → llm → summary → transcript → board → companion → agent → recording
```

**Paso 6: `kit::Jobs`.** `transcribing` y `summarizing` (dos mapas con tokens de cancelación) pasan a ser un `Jobs<TranscriptId>` dentro del servicio de transcripción y un `Jobs<SummaryId>` dentro del servicio de resúmenes.

**Paso 7: actores.** Tres piezas de estado superan la prueba de 9.1: la grabación, las ejecuciones de agentes y la sincronización del tablero. La grabación va primero, con tests de `update` escritos contra el comportamiento actual. El `AtomicBool` desaparece; Stop lleva ahora la generación de la grabación a la que se refiere, y la fuga de 20.2 se convierte en un test de una línea que queda en verde para siempre. Las siete funciones `start_recording_*` se convierten en una:

```rust
pub struct StartRecording {
    pub title: String,
    pub device: Option<DeviceId>,
    pub meeting: Option<MeetingId>,
    pub limit: Option<Duration>,
    pub origin: Origin,
}
```

**Paso 8: checks.** Cada check de la sección 16 se activa con su lista base. La mayoría de las listas base ya están vacías, porque los pasos anteriores eliminaron las infracciones.

### 20.4. Después

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

Un comando después de la migración:

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

La misma medición, repetida:

| Qué | Antes | Después |
|---|---|---|
| Archivos que usan `tauri::` | 37 | 12, todos en `src-tauri` |
| Comando más largo | 140 líneas | 9 líneas |
| Campos de `AppState` | 41 | 9 |
| `static` con estado | 12 | 0 |
| Conexiones de escritura a SQLite | 9 lugares | 1 |
| Archivos con `#[cfg]` de sistema operativo | 23 | 3, todos en `platform/` |
| Variantes de `start_recording_*` | 7 | 1 |
| Tests de dominio | necesitaban una ventana | se ejecutan en unos segundos, sin ventana |
| Compila para Linux y Windows (salvo `app`) | no | sí, comprobado en CI |

Estas cifras son ilustrativas. Lo que importa es la forma del cambio: cada fila se ha movido hacia un único propietario, un único lugar y una única regla.

## 21. Lista de adopción y preguntas frecuentes

### 21.1. Lista para un proyecto nuevo

- Workspace con dos crates: `<product>-core` (sin `tauri`) y el crate `app`.
- `kit::paths` desde el primer día; nada de rutas personales o temporales escritas a mano.
- `drivers/src/platform/` con `mod.rs`, `unix.rs`, el archivo de tu plataforma y `unsupported.rs`, en cuanto aparezca la primera llamada al sistema.
- Cada funcionalidad como un slice con los archivos fijos; comandos de 10 líneas como máximo.
- Eventos solo desde `app/<slice>/events.rs`.
- Un único target de tests de integración, `tests/it/`.
- Los checks de la sección 16 en CI desde la primera semana, cuando las listas base todavía están vacías.
- Los ajustes de build de la sección 22: información de depuración con `strip = false`, enlazador, un solo conjunto de features, `.taurignore`, una caché de compilación en CI que solo se escribe desde `main`.
- Las librerías nativas pesadas en un crate de driver del que `core` no depende (5.3).
- La sección de SLAT del apartado 18 en la guía para contribuidores.

### 21.2. Lista para un proyecto existente

- Tabla de mediciones confirmada en el repositorio como plan (19.1, paso 1).
- Listas base creadas para cada check que se vaya a activar.
- Una decisión sobre qué no puede cambiar, y fachadas para ello.
- Pasos 2 a 8 planificados como pull requests separados, con las divisiones de crates en momentos con pocas ramas abiertas.

### 21.3. Preguntas

**¿SLAT es solo para Tauri?**
No. Sustituye «comando de Tauri» por tu entrada (handler HTTP, subcomando de CLI, consumidor de mensajes) y mantén todo lo demás. El tier `app` es simplemente «el único crate que conoce el framework de entrada».

**¿Por qué no una arquitectura hexagonal con puertos por todas partes?**
Los puertos como traits merecen la pena cuando hay dos implementaciones. La mayoría de los drivers de una aplicación de escritorio tienen una. SLAT mantiene tipos concretos hasta que existe una segunda implementación, y obtiene la facilidad de prueba de las funciones puras `logic`/`update` y de las costuras de datos.

**¿Cinco tiers no son demasiados para una aplicación pequeña?**
Empieza con dos (`core` y `app`). Añade los demás cuando su código exista y esté limpio.

**¿Todos los slices necesitan todos los archivos?**
No. Un archivo que no se necesita no existe. Un slice pequeño puede ser un único `mod.rs`.

**¿Cuándo algo es un actor y no un servicio?**
Cuando se cumplen las tres condiciones de 9.1. Si hay dudas, es un servicio. Convertir más adelante un servicio en un actor es un cambio acotado dentro de un solo slice.

**¿Y si dos slices se necesitan mutuamente?**
La parte compartida se convierte en su propio slice, y ambos dependen de él. Los ciclos nunca están permitidos.

**¿Por qué el límite de un comando es de 10 líneas?**
Porque un comando que solo traduce no necesita un test unitario propio. Diez líneas bastan para deserializar, llamar y convertir; no bastan para esconder una decisión.

**¿SLAT ralentiza la compilación?**
Dividir en crates suele acelerar los builds incrementales, porque un cambio en un slice no recompila `kit`, `store` ni `drivers`. Puede ralentizar un poco un build limpio por los binarios de test adicionales que hay que enlazar, y por eso SLAT limita el número de crates. La sección 22 enumera los ajustes que importan más que el número de crates.

**Solo distribuimos en macOS. ¿Merece la pena la sección 12 ya?**
Sí, su parte barata: `kit::paths`, contratos para las pocas llamadas al sistema que ya tienes, `unsupported.rs` y el job de compilación en Linux y Windows. Eso cuesta unos días ahora y ahorra más adelante una búsqueda por toda la base de código. Los archivos `linux.rs` y `windows.rs` en sí esperan hasta que se decida hacer el port.

**¿Cómo se manejan los agentes de código con SLAT?**
Bien, porque la estructura es fija y las reglas importantes son checks, no consejos. Consulta la sección 18.

## 22. Tiempo de build y de tests

*Novedad de la versión 1.2.*

El mayor ahorro de SLAT viene de la sección 5: solo `app` conoce Tauri, así que los tests de todos los demás crates nunca compilan Tauri ni la vista web que hay detrás. El segundo mayor viene de 5.3: una librería nativa pesada vive en un crate de driver del que `core` no depende, así que los tests de `core` tampoco la compilan nunca. El resto del tiempo depende de unos pocos ajustes y hábitos, cada uno de una o dos líneas de configuración. Esta sección los enumera por orden de lo que suelen ahorrar, y termina con lo que hace que un build vuelva a empezar cuando no debería.

Primero, mide. `cargo build --timings` escribe un informe HTML con el tiempo de compilación de cada crate y cuántos se compilaron en paralelo. Guarda el informe de antes de un cambio y compáralo.

### 22.1. Adónde va el tiempo

- **Un crate de librería se compila, no se enlaza.** Lo que se enlaza es cada binario y, en una ejecución de tests, cada binario de test.
- **Cada crate puede tener tres tipos de binarios de test:** sus tests unitarios, cada archivo que está directamente en `tests/` (la sección 14.1 lo reduce a uno, `tests/it`) y sus ejemplos de documentación. Desde la edición 2024, los ejemplos de documentación de un crate se compilan como un solo binario. Un crate sin ejemplos de documentación pone `doctest = false` bajo `[lib]`.
- **Una ejecución de tests por debajo de `app` nunca necesita Tauri.** El comando de cada día es `cargo nextest run --workspace --exclude quayside`. Solo los tests end-to-end de la sección 14 compilan el crate `app`.
- **Una librería nativa pesada cuesta más que Tauri.** Las fuentes en C y C++ que compilan los build scripts, y los crates de machine learning, se llevan la mayor parte de un build limpio y la mayor parte del enlazado de cada binario que los incluye. La sección 5.3 los mantiene fuera de los tests de `core`.
- **La información de depuración es una gran parte del tiempo de enlazado.** La mayor parte nunca se lee.

### 22.2. Ajustes de build

En el `Cargo.toml` de la raíz del workspace:

```toml
[profile.dev]
debug = "line-tables-only"
split-debuginfo = "unpacked"

[profile.dev.package."*"]
debug = false
strip = false
```

Tus propios crates conservan los archivos y los números de línea en los backtraces; las dependencias no reciben información de depuración. Vuelve a subirla a `debug = true` durante una sesión cuando necesites un depurador.

`strip = false` no es opcional en macOS. Con `debug = false`, Cargo también hace strip de esas unidades por defecto, y en macOS 27 el `strip` del sistema estropea las librerías dinámicas de las macros procedurales: `serde_derive` ya no se puede cargar y un build limpio falla. `split-debuginfo = "unpacked"` se escribe explícitamente para que el hecho de que `dsymutil` se ejecute o no tras cada enlazado en macOS no dependa del valor por defecto de una versión concreta de Cargo.

El enlazador importa sobre todo para los binarios de test. En Linux para x86-64, Rust usa `rust-lld` por defecto desde la versión 1.90. Los demás destinos de Linux pueden usar `mold`. En macOS, el enlazador que viene con Xcode 15 y posteriores ya es rápido, así que déjalo como está. En Windows, `rust-lld` suele ser mucho más rápido que el enlazador por defecto. En `.cargo/config.toml`:

```toml
[target.aarch64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]

[target.x86_64-pc-windows-msvc]
linker = "rust-lld.exe"
```

**Optimiza las dependencias en las que tus tests pasan el tiempo.** Un build de desarrollo compila todas las dependencias sin optimizar, incluidas una base de datos cifrada compilada desde fuentes en C, un cifrado o una función hash que los tests llaman millones de veces. Optimizar solo esos paquetes hace los tests más rápidos y deja el build de release igual. En uno de nuestros workspaces, esto bajó una ejecución de tests de 170 a 102 segundos:

```toml
[profile.dev.package.libsqlite3-sys]
opt-level = 3

[profile.dev.package.sha2]
opt-level = 3
```

Cada línea cuesta una recompilación de ese paquete. Mide la ejecución de tests antes y después, y quédate solo con los paquetes que la mejoraron.

Elimina las dependencias que nadie usa: `cargo machete` las enumera, y cada una es tiempo de compilación para nada.

### 22.3. Un solo conjunto de features

Cargo compila una dependencia una vez por cada conjunto distinto de features que se le pide. En un workspace SLAT, dos cosas piden conjuntos distintos:

1. **Comandos distintos.** `cargo test --workspace` unifica las features de todos los miembros; `cargo test -p quayside-core`, solo las que necesita `core`. Ejecutar ambos compila dos veces `tokio`, `serde` y todo lo demás. `cargo-hakari` lo resuelve: mantiene un crate generado, `workspace-hack`, del que dependen todos los miembros, con la unión de todas las features, así que todos los comandos compilan las dependencias de la misma forma. `cargo hakari generate` lo actualiza, y `cargo hakari verify` en CI falla cuando alguien lo ha olvidado.
2. **Features de test de tus propios crates.** La feature `fake` de 14.2 y `test-hooks` de la sección 10 cambian `drivers` y `core`, así que todos los crates que están por encima se vuelven a compilar cuando la feature cambia. Prefiere una costura de datos (14.2), que no necesita ninguna feature. Donde una feature sea necesaria, todos los comandos de test la activan de la misma forma. Pon ese comando en un solo lugar, en `.cargo/config.toml`:

```toml
[alias]
t = "nextest run --workspace --exclude quayside --features quayside-drivers/fake --no-tests=fail"
```

Todo el mundo, incluidos los agentes y CI, ejecuta `cargo t` para la suite completa, y cada comando de test más acotado es `cargo t` con un filtro añadido (22.4). Un comando de test con otra lista de paquetes o de features es un segundo build.

### 22.4. Ejecutar lo que un cambio puede afectar

La estructura fija dice a qué slice pertenece un archivo, y el grafo de slices del check de ciclos (16.4) dice qué slices dependen de él. Juntos dan a cada tipo de cambio su propio conjunto de tests:

| Qué ha cambiado | Qué se ejecuta |
|---|---|
| `logic.rs`, `model.rs`, `store.rs`, `service.rs` o `actor/` dentro de un slice, sin cambios en su `mod.rs` | los tests de ese slice, y `cargo mutants --in-diff` (14.3) |
| el `mod.rs` de un slice, su API pública | ese slice y todos los slices que lo importan |
| un módulo de `tests/it` | ese módulo |
| `kit`, `store` o `drivers` | todos los crates que dependen de él: `cargo t -E 'rdeps(quayside-store)'` |
| `drivers/src/platform/` | también el test de contrato (12.5); en CI, el job de plataformas (16.3) |
| solo `app` | los tests end-to-end a través de la entrada; nada ha cambiado en `core` |
| `Cargo.toml`, `Cargo.lock`, `.cargo/`, el archivo del toolchain | todo |

Un filtro elige qué tests se **ejecutan**, no qué se **compila**: nextest primero compila todos los paquetes que nombran las opciones de Cargo y después aplica `-E`. Por eso cada fila mantiene los paquetes y las features de `cargo t` y solo acota con `-E`. El build sigue siendo el que ya está en `target/`, y solo la ejecución se acorta. Acotar el build con `-p` ahorra tiempo de compilación solo cuando `cargo-hakari` (22.3) mantiene las features iguales; sin él, `-p` es un segundo build de las dependencias.

Los tests de un slice son fáciles de seleccionar porque sus nombres empiezan por el slice: los tests unitarios viven en `core/src/<slice>/`, así que sus nombres empiezan por `<slice>::`, y los módulos de `tests/it` también empiezan por el slice (`recording_stops_on_time_limit`). Una primera versión de la selección cabe en un script corto. Compara la copia de trabajo con el punto en el que la rama salió de `main`, así que también cuentan los cambios que todavía no tienen commit, que es lo que necesita el bucle de un agente:

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

Es prudente a propósito: un cambio en cualquier `mod.rs`, en un archivo de la raíz de `core/src/` o en las utilidades compartidas de los tests ejecuta todo `core` en lugar de seguir el grafo de slices. Sustituye ese paso por el grafo cuando la suite de `core` se vuelva lenta.

La selección sirve para ir rápido, no como prueba. Usa tres niveles:

| Dónde | Qué se ejecuta |
|---|---|
| en tu máquina y en el bucle de un agente | la selección de arriba |
| en CI, en un pull request | todos los crates que dependen de un crate cambiado (`rdeps`) |
| en `main`, o en la cola de merge | la suite completa |

`--no-tests=fail` (14.1) sigue activado en todos los niveles, así que una selección que no encuentra nada sale en rojo, no en un verde silencioso.

### 22.5. Muchas copias de trabajo

Los agentes de código suelen trabajar en paralelo, cada uno en su propia copia de trabajo. Sin cuidado, cuatro agentes compilan las mismas dependencias cuatro veces en el mismo momento.

**Cada copia de trabajo tiene su propio `target/`.** No apuntes varias copias a una misma carpeta, ni con un enlace simbólico ni con `CARGO_TARGET_DIR`. Parece una caché compartida, pero es un error de corrección. Dos copias del mismo workspace producen los mismos nombres de artefactos y las mismas entradas de fingerprint, así que tras `build A; build B; build A` Cargo puede dar la copia A por `Fresh` mientras la librería que hay en disco se compiló con las fuentes de B. Entonces un check juzga el código de otro y sale en verde. Además, las ramas que difieren recompilan los crates de la otra en cada cambio.

**Arranca una copia nueva en caliente clonando, no compartiendo.** Al crear la copia de trabajo, copia el `target/` de la copia principal con un clon copy-on-write: `cp -c -R` en macOS (APFS), `cp --reflink=auto -R` en Btrfs o XFS. Tarda segundos y no ocupa espacio en disco hasta que cambia un archivo. Las dependencias siguen al día, y Cargo solo recompila tus propios crates, porque sus fuentes son más recientes que lo que registró el clon. Mide una vez el primer build en una copia nueva; debería parecerse a un build incremental, no a uno limpio.

**`sccache` es un complemento, no la solución.** Configúralo como envoltorio del compilador, en el `~/.cargo/config.toml` del usuario o en el entorno (`RUSTC_WRAPPER=sccache`), y su caché local la comparten todas las copias de trabajo de la máquina. Guarda en caché la compilación de las dependencias de librería normales. No guarda en caché las macros procedurales, los binarios, los crates `cdylib` ni tus propios crates, que Cargo compila de forma incremental, y tampoco el enlazado. Enlazar los binarios de test es lo que más paga cada copia de trabajo, y solo 14.1, 22.2 y el clon de arriba lo reducen.

Limita cuánta máquina puede ocupar un build con `CARGO_BUILD_JOBS`, por ejemplo la mitad de los núcleos, para que un segundo build vaya más lento en lugar de congelar la máquina. La regla de la sección 19.2 sigue vigente: un build pesado cada vez.

### 22.6. CI

- **Una caché en cada job de Rust**, incluido el job de plataformas de 16.3. `Swatinem/rust-cache` conserva las dependencias y la carpeta target entre ejecuciones, con `Cargo.lock` y el toolchain como clave.
- **Escribe la caché solo desde `main` y léela en todas partes.** Una ejecución de un pull request puede leer la caché de su propia ref y la de la rama por defecto, nada más, así que una caché escrita por un pull request solo ayuda a ese pull request, mientras que la rama por defecto, donde miran todos los demás pull requests, se queda vacía. Pon `save-if: ${{ github.ref == 'refs/heads/main' }}` y ejecuta el workflow también en `push` a `main`, para que cada merge renueve la caché y la primera ejecución de cada pull request arranque en caliente. En uno de nuestros repositorios eso bajó la primera ejecución de 942 a 478 segundos.
- **`CARGO_INCREMENTAL=0`** en CI. Los datos incrementales son grandes e inútiles en una ejecución desde cero. `Swatinem/rust-cache` lo pone por ti; con cualquier otra caché, ponlo tú.
- **Los tests por debajo de `app` en Linux.** Cuando el único código de macOS está en `drivers/src/platform/` y en los crates de drivers nativos de 5.3, los tests de `kit`, `store` y `core` no necesitan macOS. Ejecútalos en un runner de Linux, que arranca más rápido y cuesta menos, y deja el runner de macOS para `drivers`, `app` y el test de contrato.
- **Compilar una vez, probar en paralelo**, cuando la suite tarda más de unos minutos: `cargo nextest archive` compila los binarios de test en un job, y varios jobs ejecutan su parte con `--partition hash:1/3`, `2/3`, `3/3`.
- **Un informe de tiempos en `main`.** `cargo build --timings` como artefacto de cada build de `main`. Cuando la barra de `core` se alarga cada vez más tras cambiar un solo slice, esa es la medición que pide la sección 5.3 antes de una división.
- **`cargo hakari verify`** y **`cargo deny check`** junto a los checks de la sección 16. Los dos tardan segundos.

### 22.7. Qué hace que un build vuelva a empezar

Un build que vuelve a empezar sin motivo visible casi siempre tiene una de estas causas:

- **Un build script sin `rerun-if-changed`.** Un `build.rs` que no imprime ningún `cargo:rerun-if-changed` se vuelve a ejecutar tras un cambio en cualquier archivo de su paquete, y todo lo que usa su salida se vuelve a compilar. Imprime una línea por cada entrada. Un script que compila programas auxiliares (Swift, C) enumera sus fuentes. Nunca enumeres una ruta que no existe: Cargo la trata como cambiada en cada build.
- **`tauri dev` vigilando su propia salida.** El servidor de desarrollo recompila la aplicación cuando cambia un archivo en `src-tauri/`. Una base de datos, un log o un archivo generado que la aplicación escribe ahí reinicia el build en bucle. Los datos de ejecución van bajo `kit::paths` (12.4); los archivos generados van en `.taurignore`.
- **El editor y la terminal en una misma carpeta.** rust-analyzer ejecuta `cargo check` con sus propios ajustes. En el mismo `target/`, el editor y la terminal o un agente esperan al bloqueo del otro y pueden invalidar el trabajo del otro. Dale al editor su propia carpeta: `"rust-analyzer.cargo.targetDir": true`.
- **Entornos distintos.** `RUSTFLAGS` y las variables que leen los build scripts (`MACOSX_DEPLOYMENT_TARGET`, `CC`, `CFLAGS`) forman parte de lo que Cargo compara. Si la terminal, el editor y la shell de un agente las ponen de forma distinta, cada cambio entre ellos recompila. Ponlas en `.cargo/config.toml` (`[env]`, `[build] rustflags`), no en los perfiles de la shell.
- **Un toolchain que se mueve.** Un compilador nuevo lo recompila todo. Fija la versión completa en `rust-toolchain.toml`, con tres partes (`1.98.1`): un canal de dos partes recoge cada nueva versión de parche sin ningún cambio en el repositorio.

### 22.8. Limpiar `target/`

Cargo nunca borra los artefactos antiguos. Cada rama, conjunto de features y versión de una dependencia deja archivos atrás, y con cientos de miles de archivos en `target/` cada comando de Cargo se vuelve más lento. En uno de nuestros workspaces, `cargo clean` eliminó unos 960.000 archivos (119 GiB). Un build completo de la librería y sus tests pasó de 7–8 minutos a 36 segundos, y `cargo clippy --all-targets` de varios minutos a 8 segundos.

Hazlo una regla, no un rescate: cuando `target/debug/deps` pase de unas decenas de miles de archivos, o `target/` pase de unas decenas de gigabytes, ejecuta `cargo clean` y acepta un build en frío. `cargo sweep --time 30` es la opción más suave: elimina solo los artefactos que no se han usado en 30 días. Una copia de trabajo que se elimina se lleva su `target/` con ella.

## 23. Historial de versiones

| Versión | Fecha | Cambios |
|---|---|---|
| 1.2 | 25 de octubre de 2026 | Sección 22, *Tiempo de build y de tests*: adónde va el tiempo de compilación, ajustes de build (incluidos `strip = false` y las dependencias de test optimizadas), un solo conjunto de features, ejecutar los tests a los que puede afectar un cambio, un `target/` propio para cada copia de trabajo creado a partir de un clon copy-on-write, CI con una caché que solo se escribe desde `main`, qué hace que un build vuelva a empezar y limpiar `target/`. Drivers nativos pesados en un crate del que `core` no depende (5.3). Nuevos apartados 14.3 (mutantes en el diff), 14.4 (tests de propiedades para `update`) y 16.5 (Clippy, `cargo-deny`, `ast-grep`). Checks para reglas que no tenían ninguno: pureza de `logic.rs`, el `mod.rs` de un slice, ciclos entre slices, el comando de 10 líneas, `unwrap()` y `panic!`. Se prefieren las costuras de datos a una feature `fake`. Corregidos el coste de un crate (5.2, 5.3), `resolver = "3"` para la edición 2024 (5.1) y el paso de caché en el job de plataformas (16.3). El historial de versiones pasa de la sección 22 a la sección 23; las secciones 1 a 21 conservan sus números. |
| 1.1 | 25 de octubre de 2026 | Sección 12, *Plataformas*: la carpeta `platform/` en `drivers`, contratos de plataforma, prohibiciones fuera de `platform/`, reglas para rutas, archivos y texto, tests de plataforma, job de compilación en CI para Linux y Windows, receta de port. Añadidos en tiers, cumplimiento, recetas y el árbol de decisión. |
| 1.0 | 24 de octubre de 2026 | Primera versión: tiers, slices con capas fijas, reglas de imports, flujos de datos, actores, el estado de la aplicación como raíz de composición, errores, tests, límites de tamaño, cumplimiento, recetas y migración. |

SLAT se versiona como una librería. Una regla nueva sube la versión menor cuando llega con una lista base: el código actual sigue cumpliendo y solo las infracciones nuevas salen en rojo. Así añadió la 1.1 las reglas de plataforma. Un cambio que hace que el código que cumplía deje de cumplir sin una lista base que lo absorba, como renombrar los archivos de un slice o invertir una dependencia, sube la versión mayor. Las correcciones que no cambian ninguna regla mantienen la versión. Cada repositorio que sigue SLAT indica en su guía para contribuidores la versión que sigue.
