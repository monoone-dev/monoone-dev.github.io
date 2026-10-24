SLAT é um padrão para organizar o backend de um aplicativo desktop escrito em Rust, com Tauri como camada de janela. Ele responde a três perguntas que toda base de código em crescimento acaba errando: **onde fica este arquivo**, **quem pode importar quem** e **como os dados circulam** entre a janela, o domínio e o mundo externo.

O nome lista seus quatro blocos de construção: **S**lice, **L**ayer, **A**ctor, **T**ier. Cada regra deste documento trata de um deles.

Esta página é a referência completa. Ela foi escrita para que uma equipe que nunca viu o SLAT consiga adotá-lo em um projeto novo ou migrar um projeto existente sem precisar nos perguntar nada. Ela traz as regras, os motivos por trás delas, código que pode ser copiado, as verificações que as garantem e um exemplo prático de um aplicativo bagunçado que é colocado em ordem passo a passo.

> **Versão 1.1** · 25 de outubro de 2026. A versão 1.1 acrescenta a seção 12, *Plataformas*: como manter em um só lugar o código que depende do sistema operacional, para que um futuro port para Linux ou Windows seja trabalho em uma única pasta. O histórico completo está na seção 22.

## 1. Por que o SLAT existe

Um aplicativo Tauri começa pequeno. Há um `main.rs`, algumas funções `#[tauri::command]`, talvez um `state.rs`. Seis meses depois, o mesmo projeto costuma ficar assim:

- um ou dois arquivos enormes guardam "os comandos", e os comandos guardam toda a lógica de negócio;
- o estado do aplicativo é uma struct com trinta campos, metade deles `Mutex<Option<…>>` e `AtomicBool`;
- algumas variáveis `static` guardam mais estado, que não pertence a ninguém;
- a lógica de domínio chama `app.emit(…)` diretamente, então nada pode ser testado sem uma janela;
- as funções se multiplicam em variantes: `start_with_budget`, `start_with_budget_and_slots`, `start_with_hook`;
- `#[cfg(target_os = "macos")]` aparece espalhado por toda a base de código;
- uma pessoa nova na equipe, ou um agente de código, precisa de um dia para descobrir onde uma funcionalidade mora.

Nada disso é culpa de pessoas ruins. É consequência da falta de uma resposta compartilhada para "onde isto fica?". Quando não há resposta, vence o arquivo mais próximo, e o arquivo mais próximo é sempre o maior.

O SLAT dá essa resposta uma vez, para todo tipo de código, e torna **mecânicas** as partes importantes dela: o compilador e um punhado de scripts pequenos recusam código que quebra a organização, e assim a organização sobrevive a prazos apertados, a pessoas novas na equipe e a agentes de código.

O SLAT está para um backend em Rust assim como Nx com NgRx está para um front-end: um conjunto de regras independente de qualquer aplicativo específico. Nós o usamos em todos os produtos da MonoOne com backend em Rust e Tauri, incluindo RigOne e IndexOne.

### 1.1. Objetivos

1. **Localização fácil.** Uma pessoa ou um agente que sabe o nome de uma funcionalidade sabe em que pasta ela mora, nos dois lados do aplicativo.
2. **Testes sem janela.** Tudo, exceto a fina camada de entrada, compila e roda seus testes sem Tauri, sem tela e sem processos reais.
3. **Fronteiras garantidas pelo compilador.** A direção das dependências está escrita no `Cargo.toml`, não em uma wiki.
4. **Um único dono para estado de longa duração.** O trabalho em segundo plano (uma execução, uma gravação, uma conversa) tem exatamente um dono, e suas regras são uma função pura.
5. **Crescimento barato.** Uma funcionalidade nova é uma pasta nova com um conjunto fixo de arquivos, e não edições em cinco arquivos compartilhados.
6. **Portabilidade por construção.** O código que depende do sistema operacional mora em uma única pasta, então uma plataforma nova é um arquivo novo, e não uma busca pelo repositório inteiro.

### 1.2. Não objetivos

- O SLAT não define o seu front-end. Ele só fixa o contrato na fronteira: comandos, objetos de transferência de dados (DTOs) e eventos.
- O SLAT não é um framework. Não há crate do qual depender. É uma organização, um conjunto de regras e alguns scripts.
- O SLAT não substitui as regras do seu próprio repositório. Quando uma regra do projeto e o SLAT discordam, **vence a regra do projeto**. O SLAT diz onde as coisas moram; o projeto diz o que é proibido.

### 1.3. Para quem é

O SLAT foi pensado para aplicativos desktop em Rust com Tauri, a partir de cerca de 10.000 linhas de código de backend. As ideias valem para qualquer aplicativo Rust com uma camada de entrada fina (uma CLI, um daemon, um servidor): troque "comando Tauri" por "handler HTTP" ou "subcomando de CLI" e todo o resto continua valendo.

## 2. O SLAT em uma página

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

Seis frases para guardar:

1. **Só o crate `app` conhece o Tauri.** Todo o resto compila e é testado sem janela.
2. **Uma funcionalidade mora em um slice, e um slice tem arquivos fixos.** Procurando o chat? Ele está em `core/chat/` e `app/chat/`.
3. **Um comando Tauri tem no máximo 10 linhas**: desserializar, chamar uma função do slice, mapear o resultado para um DTO.
4. **Estado de longa duração tem um único dono: um ator.** Nada de `Mutex<Option<…>>` ou `AtomicBool` no estado do aplicativo, nada de `static` com estado dentro dos slices.
5. **As dependências apontam para baixo.** Um tier inferior nunca importa um superior, e o compilador garante isso.
6. **Só `drivers/src/platform/` conhece o sistema operacional.** O resto pede conceitos (grupo de processos, segredo, pasta de dados), nunca chamadas de sistema.

## 3. Vocabulário

| Termo | Significado | Equivalente no front-end |
|---|---|---|
| **Tier** (nível) | Um tipo de crate: `kit`, `store`, `drivers`, `core`, `app`. Os tiers ficam empilhados e só dependem para baixo. | Um tipo de biblioteca no Nx (`type:util`, `type:data-access`, …) |
| **Slice** (fatia) | Uma funcionalidade do produto, como `run`, `chat` ou `skill`. | Uma pasta de domínio, `src/sections/<area>` |
| **Layer** (camada) | Um arquivo dentro de um slice com nome e papel fixos: `model.rs`, `logic.rs`, `store.rs`, `service.rs`. | `feature/`, `ui/`, `data-access/`, `util/` |
| **Actor** (ator) | O dono único de um estado de longa duração: `Msg → update → Effect`. | Uma store do NgRx: action → reducer → effect |
| **Handle** | A única porta de entrada para um ator a partir de fora. | `inject(Store)` |
| **Snapshot** | O que a janela vê de um ator, publicado por um canal `watch`. | `select(…)` |
| **Entrada** (entry) | Uma forma de o mundo externo chamar o backend: um comando Tauri, um servidor MCP, uma ponte local, um hub remoto. | Um componente de tela |
| **Query** | Uma leitura sem efeitos colaterais. | Um selector |
| **Command** | Uma mudança de estado. | Uma action |
| **Evento** (event) | O backend avisando ao front-end que algo mudou, sem ter sido perguntado. | Um push para uma store |
| **Plataforma** | Um sistema operacional para o qual compilamos: `macos`, `linux`, `windows`. | Um navegador-alvo |
| **Contrato de plataforma** | Uma função em `drivers::platform` que significa a mesma coisa em todo sistema operacional. | Um polyfill |

Três desses termos são fáceis de confundir, então guarde esta imagem: **tiers são os andares de um prédio, slices são os apartamentos do andar `core`, e camadas são os cômodos dentro de cada apartamento.**

## 4. De onde vem o SLAT

O SLAT não é novo em suas partes. Ele combina cinco ideias conhecidas e fixa as escolhas que cada uma delas deixa em aberto.

| Ideia | O que o SLAT aproveita dela | O que o SLAT decide além disso |
|---|---|---|
| Arquitetura em camadas / Clean Architecture | As dependências apontam para o domínio; a I/O fica na borda. | As camadas são **crates**, então o compilador verifica a direção. Exatamente cinco tipos. |
| Vertical Slice Architecture | O código é agrupado por funcionalidade, não por papel técnico. | Todo slice tem os **mesmos nomes de arquivo**, com os mesmos papéis. |
| The Elm Architecture, NgRx, Redux | O estado muda por meio de mensagens e de uma função de atualização pura. | Só para estado que passa no teste das três perguntas (seção 9.1). Os efeitos voltam como mensagens. |
| Núcleo funcional, casca imperativa | As decisões são puras; os efeitos colaterais são executados à parte. | `logic.rs` e `update.rs` são puros por regra, e um script verifica isso. |
| Ports and adapters (hexagonal) | O mundo externo é acessado por meio de uma interface. | Nada de trait até existirem duas implementações. O tier `drivers` e os contratos de plataforma fazem o papel de ports. |

A diferença em relação a cada uma delas isoladamente é que o SLAT é **completo e mecânico**. Todo tipo de código tem exatamente um lugar, e as regras importantes são garantidas pelo `Cargo.toml` ou por uma verificação que roda na CI.

## 5. Tiers

Um workspace SLAT tem no máximo cinco tipos de crate. Eles se chamam `<product>-<tier>`, por exemplo `quayside-core`.

| Tier | O que mora aqui | Pode depender de | Nunca |
|---|---|---|---|
| `kit` | Tipos e ferramentas compartilhados sem domínio: identificadores, tempo, caminhos (`kit::paths`), gravação durável de arquivos, o tipo de erro base, logging. | só bibliotecas externas | `tauri`, `tokio::process`, SQL, `#[cfg]` de sistema operacional, qualquer coisa do produto |
| `store` | Persistência: a conexão de escrita, migrações, schema, reconstrução do índice, criptografia do banco de dados. | `kit` | `tauri`, lógica de domínio, processos |
| `drivers` | O mundo externo: processos, ferramentas de linha de comando de provedores, HTTP, sidecars. O código que depende do sistema operacional mora só em `drivers/src/platform/`. | `kit` | `tauri`, `store`, lógica de domínio |
| `core` | Todos os slices de domínio: modelo, lógica, casos de uso, atores. | `kit`, `store`, `drivers` | `tauri` |
| `app` | Entradas: comandos Tauri, DTOs, eventos, servidores de entrada (MCP, ponte), o estado do aplicativo, `setup`, `main`. | tudo o que está acima | lógica de domínio (ela pertence ao `core`) |

### 5.1. O compilador é o guarda

As setas entre os tiers estão escritas no `Cargo.toml` de cada crate. Se o `core` não lista `tauri` como dependência, então `use tauri::Manager;` dentro do `core` é um erro de compilação. Essa é a garantia mais forte que uma regra pode ter: ela não pode ser esquecida, pulada na revisão nem contestada.

Um workspace mínimo:

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

### 5.2. Com quantos crates começar

O mínimo são dois: `core` e `app`. Separe os outros tiers só quando o código deles já existir e estiver limpo, ou seja, quando não importar nada de um tier superior. **Um crate vazio "para depois" é proibido.** Ele custa uma etapa de link a cada build e não ensina nada.

### 5.3. Quando dividir um tier

Quando o `core` passar de cerca de 60.000 linhas, ou quando recompilar o `core` inteiro depois de mudar um único slice ficar doloroso, mova um grupo de slices para `core-<group>`, por exemplo `quayside-core-run`. Nunca passe de cerca de oito crates. Cada crate é uma etapa de link separada, e em um notebook uma máquina travada custa mais do que os segundos que uma divisão mais fina economizaria.

### 5.4. Exceção de compatibilidade

Um nome de biblioteca que o bundler do Tauri ou os dados do usuário já conhecem (por exemplo `quayside_lib`, ou uma pasta dentro do diretório pessoal do usuário) continua com o crate `app`. Crates novos ganham nomes novos.

## 6. Slices

Um slice é uma funcionalidade do produto. Seu nome é um substantivo no singular em `snake_case`: `recording`, `transcript`, `board`, `trigger`. Não `recordings_manager`, não `utils`. Quando o produto tem front-end, os nomes dos slices batem com as pastas de funcionalidades do front-end, para que a mesma palavra encontre o código dos dois lados.

Um slice existe em dois tiers: seu domínio no `core` e sua entrada (comandos, DTOs, eventos) no `app`.

:::diagram slice

### 6.1. Um slice em `core`

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

Regras:

- **Um arquivo de que o slice não precisa não existe.** Um slice pequeno pode ser um único `mod.rs` com seu modelo e seu serviço, até passar de cerca de 400 linhas.
- **Um arquivo que cresce vira uma pasta com o mesmo nome**: `logic.rs` vira `logic/mod.rs` mais `logic/<topic>.rs`. O papel não muda, só o número de arquivos.
- **Um slice grande demais se divide em sub-slices**: `run/` vira `run/start/`, `run/step/`, `run/finish/`, cada um com a mesma organização de arquivos. O pai fica só com um `mod.rs` de reexportações.
- **`mod.rs` é a porta da frente do slice**, como o `index.ts` de uma biblioteca Nx. Os outros slices importam apenas por ele.

Um `mod.rs` típico:

```rust
mod logic;
mod model;
mod service;
mod store;

pub use model::{Recording, RecordingId, RecordingState};
pub use service::RecordingService;
```

### 6.2. Um slice em `app`

```
app/src/<slice>/
  mod.rs        `mod …;` plus the list of commands for `generate_handler!`
  commands.rs   #[tauri::command] functions; at most 10 lines each
  dto.rs        wire types: serde camelCase, #[serde(other)] on enums, From<model>
  events.rs     event names and payloads sent to the window; snapshot subscription loops
```

O resto do crate `app`:

```
app/src/
  main.rs       calls lib::run(); nothing else
  lib.rs        run(): Builder, plugins, setup, generate_handler! assembled from <slice>::COMMANDS
  state.rs      AppState: the composition root, section 11
  error.rs      entry error → code and text for the window
  platform.rs   optional: window and menu settings that depend on the operating system, section 12.3
  doors/        entries other than the window: MCP server, bridge for agents, remote hub
```

### 6.3. Um comando, o formato de referência

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

Se um comando precisa de um `if`, de um laço ou de duas chamadas ao slice, essa lógica pertence a `service.rs` ou `logic.rs`. O limite de 10 linhas não é questão de estilo. Um comando que só traduz é um comando que nunca precisa de teste próprio, porque tudo o que ele faz já é testado no slice.

### 6.4. Registrando comandos

`tauri::generate_handler!` precisa do caminho completo de cada comando, então o `lib.rs` mantém uma lista. Mantenha-a agrupada por slice, um bloco por slice, para que adicionar um comando seja uma linha ao lado das vizinhas:

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

Um comando que existe em um slice mas falta nessa lista compila e, silenciosamente, não faz nada. A seção 16 inclui uma pequena verificação que compara as duas listas e falha quando elas divergem.

### 6.5. Como nomear slices

- Um substantivo por funcionalidade, no singular: `trigger`, não `triggers`.
- O nome da coisa que o usuário reconhece, não da técnica: `transcript`, não `whisper_pipeline`.
- Quando duas funcionalidades sempre mudam juntas, elas são um slice só. Quando uma funcionalidade tem partes que mudam de forma independente, elas são sub-slices.
- **Política transversal também é um slice**: controles de acesso, limites, orçamentos e proteção de segredos moram em `core/<policy>/` (por exemplo `core/guard/`), e todos os outros slices os chamam.

## 7. Quem pode importar quem

### 7.1. Dentro de um slice

| Arquivo | Pode importar | Não pode importar |
|---|---|---|
| `model.rs` | `kit`; o `model` de outros slices, pelo `mod.rs` deles | qualquer coisa com I/O, `async`, `store`, `drivers` |
| `logic.rs` | `model` | I/O, `async`, `store`, `drivers`, `service` |
| `store.rs` | `model`, o crate `store` | `drivers`, `service`, `logic` de outros slices |
| `service.rs` | `model`, `logic`, `store.rs`, `drivers`, a API pública de outros slices | `tauri`, estado global |
| `actor/*` | `model`, `logic`, `service`, `drivers` | `tauri`; e `update.rs` também não faz I/O |
| `app/<slice>/dto.rs` | o `model` do slice | `service`, `store` |
| `app/<slice>/commands.rs` | a API pública do slice, `dto`, `AppState` | `store`, `drivers`, `logic` |

### 7.2. Entre slices

- **Só pelo `mod.rs`.** Caminhos profundos como `crate::run::logic::…` a partir de outro slice são proibidos.
- **Sem ciclos.** Se `a` precisa de `b` e `b` precisa de `a`, a parte compartilhada vira um slice próprio (geralmente um `model` pequeno ou um serviço pequeno), e os dois dependem dele.
- **Política é um slice, não um comando.** Se uma verificação de orçamento mora em um comando, toda camada inferior que precisar dela terá de importar para cima. Essa é a causa mais comum de ciclos em aplicativos Tauri.

### 7.3. Por que exatamente essas linhas

A tabela de imports foi montada para que as coisas caras de testar (I/O, async, processos) fiquem no menor número possível de arquivos, e as coisas valiosas de testar (decisões) fiquem em arquivos que não têm nenhuma delas. Uma decisão em `logic.rs` é testada com um `#[test]` simples, em microssegundos. A mesma decisão enterrada em um comando precisa de uma janela.

## 8. Fluxos de dados

:::diagram flows

### 8.1. Query (uma leitura)

```
window ─invoke─► app/<s>/commands.rs ─► core/<s>/service.rs ─► core/<s>/store.rs
                        ◄── dto.rs ◄──────── model ◄──────────────────┘
```

Uma leitura não passa por um ator, a menos que leia o estado desse ator. Nesse caso, ela lê o `Snapshot` mais recente a partir do `Handle`, sem enviar mensagem.

### 8.2. Command (uma mudança)

Sem estado em segundo plano (salvar uma configuração, criar um arquivo):

```
window ─invoke─► commands ─► service ─► logic (decision) ─► store / drivers ─► result
```

Com estado em segundo plano (uma execução, uma conversa, uma gravação):

```
window ─invoke─► commands ─► Handle.send(Msg)
                                  │
                 actor ◄──────────┘
                   update(&mut State, Msg) -> Vec<Effect>     pure function
                   for e in effects: execute(e)               I/O: drivers, store, timers
                   snapshot.send(State.view())                the window gets a new view
```

### 8.3. Evento (backend → janela)

Os eventos são emitidos **somente** a partir de `app/<s>/events.rs`. Um slice no `core` publica mudanças por meio de um `watch::Sender<Snapshot>` ou de um `broadcast::Sender<Event>`. O `events.rs` se inscreve e chama `emit`. Isso mantém o `core` sem conhecimento da janela e dá ao front-end exatamente um lugar de onde vêm os eventos de cada slice. Os nomes dos eventos seguem `<slice>:<event>`, por exemplo `recording:snapshot`.

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

### 8.4. Fluxos de alto volume

Alguns slices produzem muitos eventos pequenos: linhas de log, palavras de transcrição, avisos de progresso. Não emita um evento Tauri por linha. Dê ao slice um canal limitado no `core` e deixe o `app` ser dono de uma **bomba** que agrupa as linhas em um `tauri::ipc::Channel` a cada poucos milissegundos. O canal limitado é a contrapressão: quando a janela está lenta, o slice fica sabendo (`Sent::Dropped`) em vez de encher a memória. O agrupamento, o canal e a taxa de quadros são assuntos da entrada e ficam no `app`.

## 9. Atores: slices com estado

### 9.1. Quando usar um ator

Use um ator só quando **as três** condições forem verdadeiras:

1. o estado vive mais do que uma chamada de comando;
2. várias fontes o alteram ao mesmo tempo (a janela, processos, timers, a rede);
3. a janela o acompanha ao vivo.

Em todos os outros casos, use um `service.rs` simples. Nem toda funcionalidade NgRx precisa de effects, e nem todo slice SLAT precisa de um ator.

| Candidato | 1 | 2 | 3 | Veredito |
|---|---|---|---|---|
| uma execução de agente com etapas e processos | sim | janela, processos, timers | sim | ator |
| uma gravação ao vivo | sim | janela, dispositivo de áudio, timer | sim | ator |
| uma conversa com um modelo | sim | janela, processo do modelo, dispositivo remoto | sim | ator |
| gerar um rascunho uma vez e devolvê-lo | sim | janela (iniciar/parar) | não, um único resultado | serviço + `kit::Jobs` |
| um cache de preços de modelos | sim | nenhuma | não | um campo do serviço do slice |

### 9.2. Arquivos

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

### 9.3. O contrato

- **`update` é pura.** Ela recebe o estado e uma mensagem e devolve uma lista de efeitos. Toda regra de negócio sobre esse estado pode ser testada sem tokio, processos ou banco de dados.
- **Um efeito que produz um resultado o devolve como uma nova `Msg`.** O ator nunca espera por um efeito longo dentro do seu laço. Um efeito longo vai para `tokio::spawn`, e o resultado volta pela caixa de entrada.
- **O cancelamento é uma mensagem com uma geração**, não uma flag: `Msg::Cancel { generation }`. O estado guarda `generation: u64`, e uma resposta atrasada com uma geração antiga é ignorada em `update`. Um `AtomicBool` global vaza entre operações; uma geração não vaza.
- **Um resultado é um valor**: `enum Outcome<T> { Done(T), Cancelled }`, nunca `Err(Cancelled)`. Cancelar é algo que o usuário pediu, não uma falha.
- **Um limite de tempo é `Effect::StartTimer`, e o fim dele é `Msg::TimedOut`.** Encerrar um processo depois de um limite de tempo é trabalho de um driver. Um `tokio::time::timeout` puro cancela a future do Rust, não o processo do sistema operacional.
- **Nada de `std::sync::Mutex` dentro de um ator.** O estado dele tem um único dono, então não precisa de lock.
- **Um ator por instância de estado**: um por execução, um por conversa. O registro das instâncias vivas é um pequeno ator próprio, ou um serviço com um mapa de handles.

### 9.4. Um ator pequeno e completo

Um ator de gravação que inicia um processo gravador, aplica um limite de tempo e pode ser cancelado. Todos os nomes de tipos e funções são ilustrativos.

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

O último braço é o motivo de existirem gerações: uma mensagem `Level`, `TimedOut` ou `Ended` de uma gravação anterior chega com uma geração antiga e não muda nada.

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

Quando a ordem dos efeitos importa (persistir antes de notificar, por exemplo), execute esses efeitos em sequência dentro de uma única tarefa, em vez de uma tarefa por efeito. A regra é apenas que o próprio laço nunca espera.

### 9.5. Testando um ator

A maioria dos testes nunca inicia o ator. Eles chamam `update` diretamente:

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

Alguns testes conduzem o ator inteiro pelo seu `Handle`, com `tokio::time::pause()`, um driver falso e asserções sobre a sequência de snapshots.

## 10. A explosão de variantes

Uma família de funções como `start_with_budget`, `start_with_slots`, `start_with_snapshot_hook`, `start_with_budget_and_slots` é sinal de que falta uma struct de requisição. Substitua a família por uma única função de entrada e uma única struct de opções:

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

Quem chama escreve `StartRequest { workflow, budget: Some(limit), ..Default::default() }`. Uma opção nova é um campo novo, e não uma função nova e uma linha nova em cada chamador. Pontos de injeção só para testes (`faults`, `hooks`) são campos que existem apenas no build de testes.

## 11. AppState, a raiz de composição

O `AppState` monta o aplicativo e não faz mais nada. Ele pode guardar:

- valores `Arc<…Service>` e `…Handle` dos slices;
- configuração somente leitura;
- um handle para o writer do banco de dados.

Ele não pode guardar:

- `Mutex<Option<…>>`, `AtomicBool` ou `Mutex<HashMap<…>>` que descrevem algum processo em segundo plano. Isso é estado de ator e pertence a `core/<slice>/actor/state.rs`;
- campos que são detalhe de um único slice (caches, mapas de cancelamento, filas);
- e os slices não podem esconder estado em variáveis `static` (`OnceLock<Mutex<…>>`, `LazyLock<Mutex<…>>`). A única exceção é uma constante calculada uma vez (`OnceLock<PathBuf>`) que nunca muda enquanto o processo vive.

**O teste:** cada campo do `AppState` pode ser descrito com um substantivo de um slice ("gravações", "execuções", "conta"). Um campo que precisa de uma frase para ser descrito pertence a um slice.

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

### 11.1. `kit::Jobs`: trabalho pontual em segundo plano

Gerar um rascunho, comparar duas pastas ou planejar uma tarefa roda em segundo plano, pode ser interrompido e produz um único resultado. Isso não precisa de um ator. Precisa de um mapa de cancelamento, e esse mapa pertence ao serviço do slice, não ao `AppState`. `kit::Jobs<K>` é um tipo genérico concreto para isso:

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

`begin` cancela qualquer job anterior com a mesma chave, guarda uma nova geração e devolve um guard que remove a entrada quando é descartado, mas só se a geração ainda for a mesma. O lock é mantido apenas dentro dessas duas funções curtas, nunca através de um `await`. Como `Jobs` é um tipo concreto e não uma trait, ele não fere a regra contra traits com uma única implementação.

## 12. Plataformas

*Novo na versão 1.1.*

Um produto pode ser distribuído hoje para um único sistema operacional (por exemplo, só macOS). O SLAT organiza o código para que o próximo sistema operacional seja trabalho em **uma pasta**, e não uma busca pelo repositório inteiro. Há uma regra: **só `drivers/src/platform/` conhece o sistema operacional.** Todo o resto pede conceitos (um grupo de processos, um segredo, a pasta de dados, abrir um arquivo), nunca chamadas de sistema.

A lista de plataformas suportadas pertence ao repositório (ao guia de contribuição dele), não ao SLAT.

:::diagram platform

### 12.1. Organização

```
drivers/src/platform/
  mod.rs          the only platform API: selects a file with #[cfg] and pub use; no logic
  unix.rs         shared by macOS and Linux: process groups, signals, file modes
  macos.rs        Keychain, revealing in Finder, the login shell, …
  linux.rs        only when the port starts: Secret Service, xdg-open, …
  windows.rs      only when the port starts: Job Objects, Credential Manager, ACLs, …
  unsupported.rs  every function returns Err(PlatformError::Unsupported)
```

- Um arquivo para um sistema operacional que o produto ainda não suporta **não existe**, pelo mesmo motivo que não existe um crate vazio "para depois". O `unsupported.rs` ocupa o lugar dele.
- O `unsupported.rs` não é código morto. Graças a ele, todo o workspace, exceto o `app`, compila para todas as plataformas desde o primeiro dia. Um vazamento de código de sistema para o `core` vira um erro de compilação na CI, e não uma descoberta no dia do port.
- O `mod.rs` é igual em todo repositório:

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

Um port muda só essa lista de linhas `cfg`. Todo arquivo de plataforma expõe **o mesmo conjunto de funções e tipos, com as mesmas assinaturas**. Uma função que falta é um erro de compilação naquela plataforma. Isso não é uma trait: em qualquer build existe sempre exatamente uma implementação.

### 12.2. Contratos

Cada conceito tem um contrato que significa a mesma coisa em todo sistema operacional. Só o lado de dentro muda.

| Conceito | API em `drivers::platform` | macOS | Linux | Windows |
|---|---|---|---|---|
| grupo de processos | `ProcessGroup::spawn`, `terminate(grace)`, `proved_dead()` | id do grupo de processos; SIGTERM, período de tolerância, SIGKILL; `kill(-pgid, 0)` retorna `ESRCH` | igual ao macOS | Job Object; `TerminateJobObject`; o job não tem mais processos |
| segredos | `secret::read`, `secret::write`, `secret::delete` | Keychain | Secret Service (libsecret) | Credential Manager |
| arquivo e pasta privados | `fs::write_private`, `fs::create_private_dir` | modo `0o600` / `0o700` | igual ao macOS | ACL: só o dono |
| abrir no sistema | `open_path`, `reveal_path`, `open_url` | `open`, `open -R` | `xdg-open` | `ShellExecuteW`, `explorer /select,` |
| ambiente do usuário | `login_env()` | o shell de login (o `PATH` de um app aberto pelo Dock é mínimo) | igual ao macOS | registro e ambiente do processo |
| encontrar um programa | `which(program)` | `PATH` | `PATH` | `PATH` mais `PATHEXT` |
| dados da máquina | `machine::cores`, `machine::memory`, `machine::free_space` | sysctl, statfs | /proc, statfs | API do sistema |

Regras dos contratos:

- Uma função de contrato não retorna tipos do sistema (`pid_t`, `HANDLE`). Ela retorna tipos de `drivers` ou de `kit`.
- **Prova, não esperança**, em toda plataforma: "o processo está morto" é um fato comprovado, não um sinal que foi enviado.
- Quando um sistema operacional não consegue fazer o que o contrato exige, a função retorna um erro que diz o que falta, nunca um substituto silencioso.

Um exemplo curto de um contrato e do seu lado macOS:

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

### 12.3. O que é proibido fora de `platform/`

| Proibido fora de `drivers/src/platform/` | Use em vez disso |
|---|---|
| `#[cfg(unix)]`, `#[cfg(windows)]`, `#[cfg(target_os = …)]` | um contrato da 12.2 |
| `std::os::unix`, `std::os::windows`, `libc`, `nix`, `windows-sys`, `security-framework` | um contrato da 12.2 |
| `sh -c`, `bash`, `zsh`, `cmd /c`, `powershell` | `Command::new(program).args(…)`; se um shell for realmente necessário, quem escolhe é o `platform` |
| nomes de programas do sistema: `open`, `xdg-open`, `security`, `osascript`, `explorer` | `open_path`, `secret::*`, … |
| caminhos fixos no código: `~`, `$HOME`, `/tmp`, `/usr/bin`, `/Applications`, `Library/` | `kit::paths` (12.4) |
| juntar caminhos com uma string `/` | `Path::join` |
| modos de arquivo como números (`0o600`) | `fs::write_private` |

A única exceção é `app/src/platform.rs`, para coisas que só o Tauri conhece: o estilo da barra de título, o menu do aplicativo, a política de ativação da janela. Nada além de configurações de janela.

### 12.4. Caminhos, arquivos e texto

- **As pastas vêm só de `kit::paths`**: `data()`, `config()`, `cache()`, `logs()`, `temp()`. Por baixo há uma biblioteca que segue a convenção de cada sistema (macOS `~/Library/Application Support/<App>`, Linux XDG, Windows `%APPDATA%`). Dados que já moram em um caminho antigo continuam lá no sistema em que foram criados (a exceção de compatibilidade da 5.4).
- **Os nomes de arquivo que o aplicativo cria são em minúsculas** e nunca diferem apenas por maiúsculas e minúsculas. Os sistemas de arquivos padrão do macOS e do Windows não distinguem uns dos outros; o do Linux distingue.
- **Não renomeie nem apague um arquivo que alguém mantém aberto.** O Windows recusa. Gravações atômicas passam por `kit::durable_file`, que fecha o arquivo antes de substituí-lo.
- **Caminhos longos.** O Windows limita os caminhos a cerca de 260 caracteres sem o prefixo `\\?\`. Mantenha as cópias de trabalho e as pastas de execução rasas; o prefixo é adicionado pelo `platform`, nunca por um slice.
- **O texto vindo de processos** é lido tolerando `\r\n`. Os arquivos que o aplicativo grava usam `\n`.
- **Um caminho enviado à janela** é UTF-8. Um caminho que não pode ser escrito em UTF-8 é um erro que nomeia o arquivo, nunca um `unwrap()`.

### 12.5. Testes de plataforma

- **O teste de contrato** mora em `drivers/tests/platform_contract.rs` e é o mesmo para todo sistema operacional: um processo está morto depois de `terminate`, um segredo volta depois de gravado e some depois de apagado, um arquivo privado não pode ser lido por outro usuário. Toda plataforma suportada passa **o mesmo** conjunto.
- **Testes fora de `drivers` não usam shell nem sinais.** Um processo de que um teste precise é um pequeno programa em Rust (um binário em um crate de testes), não `sh -c 'sleep 10'`.
- Um `#[cfg]` de plataforma em testes só é permitido nos testes de `drivers`.

### 12.6. Como é garantido

| Regra | Quem garante |
|---|---|
| as proibições da 12.3 | uma verificação por grep com lista de baseline (seção 16) |
| os crates, exceto `app`, compilam em todas as plataformas | `cargo check --workspace --exclude <app>` em runners nativos de CI para Ubuntu e Windows. Não é uma verificação cruzada a partir do macOS: build scripts com código C precisam do compilador do alvo. |
| o contrato funciona | `platform_contract.rs` em um runner para cada plataforma **suportada** |

### 12.7. Portando para um novo sistema operacional

1. `drivers/src/platform/<system>.rs`: todas as funções do contrato. O compilador lista o que falta.
2. `mod.rs`: o `cfg` do novo sistema deixa de apontar para `unsupported.rs`.
3. `platform_contract.rs` fica verde no runner desse sistema, e o runner entra na CI.
4. `app`: configuração de bundle e assinatura para o sistema e, se necessário, `app/src/platform.rs`.
5. O guia de contribuição do repositório acrescenta o sistema à lista de plataformas suportadas.

Se um port exigir uma mudança no `core`, algo vazou. Primeiro, um pull request separado move o vazamento para trás de um contrato; depois, o port continua.

## 13. Erros

- **Cada crate tem seu próprio enum de erro** (com `thiserror`). Um slice pode ter o seu em `error.rs`.
- **O `core` retorna erros de domínio.** O `app/error.rs` os transforma em um código e uma frase para a janela. A frase vem da sua tabela de traduções, nunca do `Display` de um enum do protocolo.
- **Um evento desconhecido vindo do protocolo não é um erro.** Use `#[serde(other)]` nos enums e `Option<T>` nos campos que não são essenciais. Registre a linha desconhecida no log de depuração e siga em frente. Uma nova versão da ferramenta de linha de comando de um provedor nunca deve interromper uma execução.
- **`unwrap()` e `panic!` são proibidos** fora dos testes em `core`, `store` e `drivers`. Use `?` com uma variante de erro, ou `expect()` com um motivo que explique por que o valor não pode faltar.

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

## 14. Testes por camada

| Camada | Como testar | O que conta como prova |
|---|---|---|
| `logic.rs`, `update.rs` | um `#[test]` simples, sem tokio | uma asserção sobre um valor ou sobre a lista de efeitos |
| `store.rs` | um banco de dados em uma pasta temporária | a linha que volta de uma leitura |
| `service.rs` | `#[tokio::test]` com uma store real e um driver falso | o estado dos arquivos ou do banco de dados depois da chamada |
| `actor/` | um `Handle` mais um roteiro de mensagens; tempo com `tokio::time::pause` | a sequência de `Snapshot`s |
| `drivers` | um processo real ou um fluxo gravado | o processo está morto (`ESRCH` ou um job vazio), as linhas que vêm do protocolo |
| `app/commands` | um teste de integração pela entrada (end-to-end ou um alvo de integração) | o texto que uma pessoa vê |

Um teste para uma mensagem mostrada a uma pessoa fica onde a pessoa a vê, não só em `logic.rs`. Uma função que produz a frase certa não prova nada se ninguém a chama.

### 14.1. Um único binário de integração

Cada arquivo colocado diretamente em `tests/` é um binário separado, e cada binário passa por link separadamente. Em um workspace grande, isso dá um minuto por arquivo. Coloque os testes de integração em **um** alvo, `tests/it/main.rs`, com um módulo por tema, e rode um único tema com um filtro:

```
tests/it/
  main.rs          mod recording_stops_on_time_limit; mod transcript_survives_restart; …
  recording_stops_on_time_limit.rs
  transcript_survives_restart.rs
```

```bash
cargo nextest run --test it recording_stops_on_time_limit::
```

Rode com `--no-tests=fail`, para que um filtro que não encontra nada fique vermelho em vez de discretamente verde.

### 14.2. Um driver falso sem trait

Um teste precisa de um driver que não inicie processos reais. O SLAT proíbe uma trait com uma única implementação, e um falso não conta como uma segunda implementação real. Duas opções respeitam a regra:

- **Uma costura de dados.** O serviço recebe a *saída* do driver como valor ou canal, e não o próprio driver. O teste envia linhas para o canal.
- **Um build de testes.** O `drivers` expõe `#[cfg(any(test, feature = "fake"))] pub mod fake;` com as mesmas funções do módulo real, e o crate de testes ativa a feature `fake`.

Quando aparece uma segunda implementação real (um segundo provedor, uma segunda plataforma), esse é o momento para uma trait.

## 15. Limites de tamanho

| Unidade | Limite de alerta | O que fazer |
|---|---|---|
| arquivo | 1.500 linhas de código (sem testes) | dividir em uma pasta com o mesmo papel, seção 6.1 |
| slice | 15.000 linhas | dividir em sub-slices |
| `core` | 60.000 linhas | mover um grupo para `core-<group>`, seção 5.3 |
| comando Tauri | 10 linhas | mover a lógica para `service.rs` |
| campo do `AppState` | um substantivo | ver a seção 11 |

Os arquivos acima do limite no dia em que você adota o SLAT entram em uma **lista de baseline**. A lista só pode diminuir.

## 16. Como as regras são garantidas

Primeiro o mecanismo, depois as palavras. Uma regra que um script pode verificar nunca deve depender de alguém se lembrar dela.

| Regra | Quem garante |
|---|---|
| só o `app` conhece o Tauri | `Cargo.toml` (nenhuma dependência de `tauri` em outro lugar) |
| os tiers só dependem para baixo | `Cargo.toml` |
| só o `store` abre a conexão de escrita | uma verificação por grep: `Connection::open` só no crate `store`. Os arquivos `store.rs` dos slices usam tipos do `rusqlite`, então só a dependência não basta. |
| `#[tauri::command]` só em `app/*/commands.rs` | uma verificação por grep |
| todo comando está registrado | uma verificação que compara os comandos dos slices com `generate_handler!` |
| `emit` só em `app/*/events.rs` | uma verificação por grep |
| nenhum import profundo entre slices | uma verificação de `crate::<a>::<layer>::` a partir de outro slice |
| nenhum `static` com estado no `core` | uma verificação por grep de `static .*(Mutex|RwLock)` |
| `update.rs` não faz I/O | uma verificação: nada de `async`, `tokio::`, `std::fs`, `store::` em `update.rs` |
| sistema operacional só em `drivers/src/platform/` e `app/src/platform.rs` | uma verificação por grep com a lista da 12.3 |
| os crates, exceto `app`, compilam em todas as plataformas | `cargo check` em runners de CI com Ubuntu e Windows |
| limites de tamanho | uma verificação com lista de baseline que só pode diminuir |

Toda verificação começa com uma **lista de baseline** das violações de hoje. Uma violação nova fica vermelha. Uma violação corrigida precisa sair da lista no mesmo pull request, para que a lista nunca volte a crescer.

### 16.1. Uma verificação com baseline

Todas as verificações seguem o mesmo formato: encontrar as violações, subtrair a baseline, falhar com qualquer coisa que sobrar e falhar se a baseline listar algo que já foi corrigido.

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

### 16.2. Uma verificação precisa conseguir falhar

Antes de confiar em uma verificação, plante uma violação real, veja a verificação ficar vermelha e remova a violação. Uma verificação que nunca ficou vermelha nunca foi testada. Uma verificação que procura uma string por grep pode passar porque a string aparece em um comentário; é por isso que os padrões acima casam com formas de código (`\.emit(`), e não com palavras.

### 16.3. O job de plataformas na CI

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

Em um repositório real, fixe as versões das actions em hashes de commit completos. O job só compila; ele não roda testes nas plataformas que o produto ainda não suporta, então é barato.

### 16.4. Verificações do conjunto completo

| Verificação | Regra |
|---|---|
| `checks/slat-commands.sh` | `#[tauri::command]` só em `src-tauri/src/*/commands.rs` |
| `checks/slat-registered.sh` | todo comando de um slice aparece em `generate_handler!` |
| `checks/slat-emit.sh` | `emit` só em `src-tauri/src/*/events.rs` |
| `checks/slat-deep-imports.sh` | nenhum `crate::<slice>::<layer>::` a partir de outro slice |
| `checks/slat-static-state.sh` | nenhum `static … Mutex|RwLock` em `crates/*-core*` |
| `checks/slat-pure-update.sh` | `update.rs` sem `async`, `tokio::`, `std::fs`, `store::` |
| `checks/slat-platform.sh` | as proibições da 12.3 fora de `platform/` |
| `checks/slat-size.sh` | os arquivos da baseline com mais de 1.500 linhas só podem diminuir |

## 17. Receitas

Toda receita começa com um teste que falha no código antigo, em uma asserção e não na compilação. Em Rust, escreva primeiro a assinatura com `todo!()`, para que o teste compile e falhe pelo motivo certo.

### 17.1. Uma nova leitura (Query)

1. `core/<s>/model.rs`: o tipo do resultado, se ainda não existir.
2. `core/<s>/store.rs`: a função de leitura. Teste-a em um banco de dados temporário.
3. `core/<s>/service.rs`: `pub async fn <verb>(…)`, que chama store e logic.
4. `core/<s>/mod.rs`: `pub use` da nova função ou do novo tipo.
5. `app/<s>/dto.rs`: o DTO e o `From<model>`.
6. `app/<s>/commands.rs`: um comando de no máximo 10 linhas; registre-o.
7. Front-end: a camada de acesso a dados chama o comando.

### 17.2. Uma nova mudança sem estado em segundo plano (Command)

Como na 17.1, e a decisão (se é permitido, o que muda) é escrita em `logic.rs` como uma função pura, com teste. O `service.rs` só a chama e executa a gravação.

### 17.3. Um novo slice

1. Nome: a funcionalidade como substantivo no singular em `snake_case`.
2. `core/src/<s>/mod.rs` mais apenas os arquivos de que ele precisa; `pub mod <s>;` em `core/src/lib.rs`.
3. `app/src/<s>/mod.rs`, `commands.rs`, `dto.rs`; registre os comandos dele.
4. Se o slice tem estado em segundo plano: receita 17.4.

### 17.4. Um novo fluxo com estado (ator)

1. Confira as três condições da 9.1. Se uma delas falhar: receita 17.2.
2. `msg.rs`, `state.rs`, `snapshot.rs`: os tipos.
3. `update.rs`: primeiro os testes (mensagem na entrada, efeitos e estado esperados na saída), depois a implementação.
4. `effect.rs`: `execute` para cada efeito; os resultados voltam como `Msg`.
5. `run.rs` e `handle.rs`: o laço e a porta.
6. O `AppState` ganha exatamente um campo: o registro ou o `Handle`.
7. `app/<s>/events.rs`: inscrever-se no `Snapshot` e `emit("<s>:snapshot")`.

### 17.5. Um novo driver (o mundo externo)

1. `drivers/src/<name>.rs` ou uma pasta. Um driver não conhece slices nem o banco de dados.
2. Uma trait só quando houver pelo menos duas implementações.
3. Um processo: grupo de processos, escalonamento do encerramento, prova de morte; segredos mantidos fora dos argumentos e dos logs. Tudo isso pelos contratos do `platform` (12.2), nunca por uma chamada de sistema dentro do driver.
4. Um slice usa o driver a partir de `service.rs` ou de `effect.rs`.

### 17.6. Um novo evento para a janela

1. Uma mudança no `core` publica um `Snapshot` ou um `Event` em um canal.
2. `app/<s>/events.rs` se inscreve e emite `<s>:<event>`.
3. Front-end: a camada de acesso a dados escuta e atualiza sua store.

### 17.7. Uma nova plataforma

Seção 12.7.

### 17.8. Onde isto fica? (árvore de decisão)

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

## 18. Trabalhando com agentes de código

O SLAT foi desenhado em uma equipe em que boa parte do código é escrita por agentes de código. Os agentes seguem uma organização de forma confiável quando ela está escrita, é curta e é verificada por máquinas. Três coisas fazem a diferença.

1. **Uma organização fixa é um mapa de graça.** Um agente que recebe a tarefa de "adicionar um filtro às transcrições" abre `core/transcript/` e `app/transcript/` sem procurar. O tempo que um agente passa procurando é o tempo que ele passa errando.
2. **Uma verificação vale mais do que uma frase no prompt.** "Não emita a partir do core" em um prompt é seguido na maior parte das vezes. Uma verificação vermelha é seguida todas as vezes. Escreva a regra primeiro como verificação, e como linha de prompt só quando ela não puder ser verificada.
3. **As receitas são prompts.** A seção 17 foi escrita como passos numerados de propósito: cole a receita na tarefa, e o agente produz os arquivos nos lugares esperados, na ordem esperada.

Uma seção que você pode copiar para o guia de contribuição do seu repositório (`AGENTS.md`, `CLAUDE.md` ou equivalente):

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

## 19. Migrando uma base de código existente

Você não precisa reescrever nada. O SLAT é adotado em pull requests pequenos, que mantêm o aplicativo funcionando o tempo todo, em uma ordem que não bloqueia outras branches.

:::diagram migration

### 19.1. A ordem

1. **Meça.** Mapeie os módulos: linhas por módulo, imports que apontam para cima, arquivos que usam `tauri::`, número de `#[tauri::command]`, `static` com estado, campos do estado do aplicativo, `#[cfg]` de sistema operacional. Registre tudo em um plano dentro do repositório. Esses números são as suas baselines.
2. **Inverta as dependências para cima.** Políticas que moram na camada de comandos mas são chamadas por camadas inferiores descem para `core/<policy>/`. Tipos que o domínio pega emprestados da camada de entrada (um canal de linhas, um tipo de imagem, uma string de mensagem) vão para o slice ao qual pertencem. O caminho antigo continua como `pub use` até o fim da migração.
3. **Separe `app` e `core`.** Crie o workspace e um crate `core` sem `tauri`. O código que conhece o Tauri fica no `app`; todo o resto é movido com `git mv`. Este é o passo mais mecânico.
4. **Separe `store`, `drivers` e `kit`.** Só quando o código deles já estiver limpo. Ao separar `drivers`, mova o código de sistema operacional para `platform/` e dê à verificação de plataforma a sua baseline.
5. **Slice por slice.** Um slice por pull request: os comandos para `app/<s>/`, a lógica para `core/<s>/`, na organização fixa. Comece pelo menor e menos compartilhado.
6. **`kit::Jobs`.** Os mapas de cancelamento saem do estado do aplicativo.
7. **Atores.** O estado que está no estado do aplicativo e em variáveis `static` vai para atores, um fluxo por pull request, com os testes de `update` escritos primeiro contra o comportamento atual.
8. **Verificações.** Cada passo ativa a verificação da sua regra, com uma baseline.

### 19.2. Regras da migração

- **Mover não muda comportamento.** Um pull request que move código não corrige lógica, e um pull request que corrige lógica não move código. Quando algo quebra, você sabe que tipo de mudança causou o problema.
- **Fachadas nos caminhos antigos.** `pub use new::place::*;` no caminho do módulo antigo permite que o código que você não pode tocar (ou ainda não quer tocar) e os testes existentes compilem sem mudanças. Uma fachada é removida quando nada mais a importa.
- **Um build pesado por vez.** Vários builds `cargo` paralelos de um workspace grande podem travar um notebook. Migre em uma única linha.
- **Rode a suíte de testes inteira depois de cada passo**, não depois de cada commit. A suíte é a sua prova de que nada mudou no comportamento.

### 19.3. Organização primeiro, um começo mais rápido

Se a localização do código é a sua maior dor, você pode reordenar o trabalho: primeiro mova os **arquivos** para pastas de slices dentro do único crate existente, sem mudar o conteúdo deles, e deixe fachadas nos caminhos antigos. O Git registra isso como renomeações, então as outras branches abertas continuam fazendo merge sem conflitos. Você ganha o mapa (a pasta de cada funcionalidade) em um ou dois dias, e a separação dos crates, as camadas dentro de cada slice e os atores vêm depois, sobre uma organização que já é legível.

Duas coisas não saem de graça nem aqui. Arquivos que usam `super::` ou `pub(super)` mudam de módulo pai quando são movidos, então alguns caminhos precisam de pequenas correções mecânicas. E tirar os comandos de um arquivo central altera esse arquivo, o que gera conflito com as branches que o editam; por isso é melhor fazer isso como um segundo passo separado.

### 19.4. O que costuma dar errado

| Problema | O que fazer |
|---|---|
| Centenas de testes importam caminhos antigos | Fachadas nos caminhos antigos. Não mova os testes nos mesmos pull requests. |
| Branches paralelas entram em conflito com `git mv` | Separe os crates quando houver o menor número possível de branches abertas. Cada movimentação é um pull request próprio. |
| Itens `pub(crate)` passam a ser necessários em outro crate depois da separação | Amplie-os para `pub`. Depois da migração, revise o que pode voltar a ser `pub(crate)`. |
| O tempo de compilação cresce com o número de crates | No máximo seis a oito crates. Um build pesado por vez. |
| Uma refatoração muda o comportamento sem ninguém perceber | Testes de `update` primeiro, contra o comportamento de hoje. Movimentações e correções em pull requests separados. |
| Uma parte do código não pode mudar de jeito nenhum (uma funcionalidade crítica, uma área congelada) | Ela fica onde está e só chega à nova organização por meio de fachadas. Fachadas são código aditivo. |

## 20. Estudo de caso: Quayside

Quayside é um aplicativo desktop **fictício**, inventado para este documento. Ele se inspira livremente no tipo de software que construímos, mas todos os nomes, números e arquivos abaixo são inventados. O Quayside grava chamadas, transcreve no próprio dispositivo, escreve um resumo com um modelo local ou na nuvem, executa tarefas de acompanhamento com agentes de código, sincroniza itens de ação com um quadro compartilhado da equipe e tem um app companheiro para celular que pode acompanhar uma gravação e enviar uma anotação para ela.

Ele vem sendo construído há dois anos por uma equipe pequena e com pressa, e funciona. Também é um exemplo clássico de tudo o que a seção 1 descreveu.

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

A medição do passo 1 da migração:

| O quê | Valor |
|---|---|
| Linhas de Rust (sem testes) | ~78.000 |
| Arquivos que usam `tauri::` | 37 de 112 |
| Funções `#[tauri::command]` | 148, em 4 arquivos |
| Campos do `AppState` | 41, dos quais 14 são `Mutex<…>` ou atômicos |
| `static` com estado | 12 |
| Lugares que abrem uma conexão de escrita no SQLite | 9 |
| Arquivos com `#[cfg(target_os = …)]` | 23 |
| Variantes de `start_recording_*` | 7 |
| Tempo para rodar os testes de domínio | eles precisam de uma janela, então ninguém os roda |

### 20.2. Sintomas no código

O estado do aplicativo, resumido:

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

Um Stop que vaza entre gravações. O usuário aperta Stop e logo em seguida inicia uma nova gravação. O laço da gravação antiga ainda não leu a flag; a nova gravação não reinicia nada; a próxima leitura de `recording_cancel` interrompe a gravação **nova**:

```rust
static RECORDING_CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn stop_recording() {
    RECORDING_CANCEL.store(true, Ordering::SeqCst);
}
```

O domínio fala diretamente com a janela, então não pode ser testado sem uma:

```rust
pub async fn transcribe(app: AppHandle, file: PathBuf) -> Result<(), String> {
    let mut words = whisper::stream(&file)?;
    while let Some(word) = words.next().await {
        app.emit("transcript-word", &word).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

As variantes se multiplicam:

```rust
pub async fn start_recording(…)
pub async fn start_recording_with_limit(…)
pub async fn start_recording_with_limit_and_device(…)
pub async fn start_recording_for_meeting(…)
pub async fn start_recording_for_meeting_with_limit(…)
pub async fn start_recording_from_companion(…)
pub async fn start_recording_with_test_hook(…)
```

E o sistema operacional está em todo lugar:

```rust
#[cfg(target_os = "macos")]
fn reveal(path: &Path) {
    let _ = Command::new("sh").arg("-c").arg(format!("open -R '{}'", path.display())).spawn();
}
```

Este último também é uma injeção de shell esperando por um nome de arquivo com aspas.

### 20.3. A migração, passo a passo

**Passo 1: inverter as dependências.** O transcritor deixa de receber um `AppHandle`. Ele escreve as palavras em um canal limitado que pertence ao `core`; o `app` bombeia o canal para a janela. O código de upload deixa de ler o `AppState` e recebe como argumentos os dois valores de que precisa.

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

**Passo 2: separar `app` e `core`.** Um workspace com `quayside-core` (sem `tauri`) e o `src-tauri` existente como `app`. O `lib.rs` do app mantém `pub use quayside_core::{…};`, para que todos os caminhos antigos continuem compilando. Prova: plantar `use tauri::Manager;` no `core` gera erro de compilação.

**Passo 3: `kit`, `store`, `drivers`.** As nove aberturas de SQLite se reduzem a um único writer em `quayside-store`. O gravador, o transcritor, os clientes de modelos e o `git` vão para `quayside-drivers`. Os 23 arquivos com `#[cfg]` viram uma única pasta `platform/` com `unix.rs`, `macos.rs` e `unsupported.rs`, e `reveal` vira um contrato:

```rust
pub fn reveal_path(path: &Path) -> Result<(), PlatformError> {
    let status = Command::new("/usr/bin/open").arg("-R").arg(path).status()?;
    status.success().then_some(()).ok_or(PlatformError::Refused("open -R"))
}
```

Sem shell, sem aspas, sem injeção.

**Passo 4: slices.** `handlers.rs` e `utils.rs` são desmontados em slices, começando pelos menores:

```
settings → device → model → summary → transcript → board → companion → agent → recording
```

**Passo 5: `kit::Jobs`.** `transcribing` e `summarizing` (dois mapas com tokens de cancelamento) viram um `Jobs<TranscriptId>` dentro do serviço de transcrição e um `Jobs<SummaryId>` dentro do serviço de resumo.

**Passo 6: atores.** Três partes do estado passam no teste da 9.1: a gravação, as execuções de agentes e a sincronização do quadro. A gravação vai primeiro, com os testes de `update` escritos contra o comportamento de hoje. O `AtomicBool` desaparece; o Stop agora carrega a geração da gravação a que se refere, e o vazamento da 20.2 vira um teste de uma linha que fica verde para sempre. As sete funções `start_recording_*` viram uma só:

```rust
pub struct StartRecording {
    pub title: String,
    pub device: Option<DeviceId>,
    pub meeting: Option<MeetingId>,
    pub limit: Option<Duration>,
    pub origin: Origin,
}
```

**Passo 7: verificações.** Cada verificação da seção 16 é ativada com sua baseline. A maioria das baselines já está vazia, porque os passos anteriores removeram as violações.

### 20.4. Depois

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

Um comando depois da migração:

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

A mesma medição, repetida:

| O quê | Antes | Depois |
|---|---|---|
| Arquivos que usam `tauri::` | 37 | 12, todos em `src-tauri` |
| Comando mais longo | 140 linhas | 9 linhas |
| Campos do `AppState` | 41 | 9 |
| `static` com estado | 12 | 0 |
| Conexões de escrita no SQLite | 9 lugares | 1 |
| Arquivos com `#[cfg]` de sistema operacional | 23 | 3, todos em `platform/` |
| Variantes de `start_recording_*` | 7 | 1 |
| Testes de domínio | precisavam de uma janela | rodam em poucos segundos, sem janela |
| Compila para Linux e Windows (exceto o `app`) | não | sim, verificado na CI |

Esses números são ilustrativos. O que importa é o formato da mudança: cada linha andou na direção de um único dono, um único lugar e uma única regra.

## 21. Checklist de adoção e perguntas frequentes

### 21.1. Checklist para um projeto novo

- Workspace com dois crates: `<product>-core` (sem `tauri`) e o crate `app`.
- `kit::paths` desde o primeiro dia; nenhum caminho pessoal ou temporário fixo no código.
- `drivers/src/platform/` com `mod.rs`, `unix.rs`, o arquivo da sua plataforma e `unsupported.rs`, assim que aparecer a primeira chamada de sistema.
- Cada funcionalidade como um slice com os arquivos fixos; comandos de no máximo 10 linhas.
- Eventos só a partir de `app/<slice>/events.rs`.
- Um único alvo de testes de integração, `tests/it/`.
- As verificações da seção 16 na CI desde a primeira semana, enquanto as baselines ainda estão vazias.
- A seção SLAT da 18 no guia de contribuição.

### 21.2. Checklist para um projeto existente

- Tabela de medição commitada como plano (19.1, passo 1).
- Listas de baseline criadas para cada verificação que você vai ativar.
- Uma decisão sobre o que não pode mudar, e fachadas para isso.
- Os passos 2 a 8 planejados como pull requests separados, com as separações de crates marcadas para momentos com poucas branches abertas.

### 21.3. Perguntas

**O SLAT é só para Tauri?**
Não. Troque "comando Tauri" pela sua entrada (handler HTTP, subcomando de CLI, consumidor de mensagens) e mantenha todo o resto. O tier `app` é simplesmente "o único crate que conhece o framework de entrada".

**Por que não usar arquitetura hexagonal com ports em todo lugar?**
Ports como traits valem a pena quando existem duas implementações. A maioria dos drivers em um aplicativo desktop tem uma. O SLAT mantém tipos concretos até existir uma segunda implementação e, em vez disso, obtém testabilidade com funções puras de `logic`/`update` e com costuras de dados.

**Cinco tiers não são demais para um app pequeno?**
Comece com dois (`core` e `app`). Acrescente os outros quando o código deles existir e estiver limpo.

**Todos os slices precisam de todos os arquivos?**
Não. Um arquivo que não é necessário não existe. Um slice pequeno pode ser um único `mod.rs`.

**Quando algo é um ator e não um serviço?**
Quando as três condições da 9.1 são verdadeiras. Na dúvida, é um serviço. Transformar um serviço em ator depois é uma mudança contida dentro de um único slice.

**E se dois slices precisarem um do outro?**
A parte compartilhada vira um slice próprio, e os dois dependem dele. Ciclos nunca são permitidos.

**Por que o limite de um comando é de 10 linhas?**
Porque um comando que só traduz não precisa de teste próprio. Dez linhas bastam para desserializar, chamar e mapear; não bastam para esconder uma decisão.

**O SLAT deixa a compilação mais lenta?**
Dividir em crates costuma acelerar os builds incrementais, porque uma mudança em um slice não recompila `kit`, `store` nem `drivers`. Pode deixar um build limpo um pouco mais lento por causa das etapas de link extras, e é por isso que o SLAT limita o número de crates.

**Só distribuímos para macOS. A seção 12 vale a pena agora?**
Sim, a parte barata dela: `kit::paths`, contratos para as poucas chamadas de sistema que você já tem, `unsupported.rs` e o job de compilação em Linux e Windows. Isso custa dias agora e poupa uma busca pela base de código inteira depois. Os arquivos `linux.rs` e `windows.rs` em si esperam até você decidir fazer o port.

**Como os agentes de código lidam com o SLAT?**
Bem, porque a organização é fixa e as regras importantes são verificações, não conselhos. Veja a seção 18.

## 22. Histórico de versões

| Versão | Data | Mudanças |
|---|---|---|
| 1.1 | 25 de outubro de 2026 | Seção 12, *Plataformas*: a pasta `platform/` em `drivers`, contratos de plataforma, proibições fora de `platform/`, regras para caminhos, arquivos e texto, testes de plataforma, job de compilação na CI para Linux e Windows, receita de port. Acréscimos sobre tiers, garantia das regras, receitas e árvore de decisão. |
| 1.0 | 24 de outubro de 2026 | Primeira versão: tiers, slices com camadas fixas, regras de import, fluxos de dados, atores, o estado do aplicativo como raiz de composição, erros, testes, limites de tamanho, garantia das regras, receitas e migração. |

O SLAT é versionado como uma biblioteca. Uma mudança em uma regra aumenta a versão minor; uma mudança que torna não conforme um código que antes era conforme aumenta a versão major. Todo repositório que segue o SLAT informa, no seu guia de contribuição, a versão que segue.
