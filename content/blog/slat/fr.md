SLAT est un pattern pour organiser le backend d'une application de bureau écrite en Rust, avec Tauri comme couche de fenêtre. Il répond à trois questions sur lesquelles toute base de code qui grandit finit par se tromper : **où va ce fichier**, **qui peut importer qui**, et **comment circulent les données** entre la fenêtre, le domaine et le monde extérieur.

Le nom énumère ses quatre briques : **S**lice, **L**ayer, **A**ctor, **T**ier. Chaque règle de ce document porte sur l'une d'elles.

Cette page est la référence complète. Elle est écrite pour qu'une équipe qui n'a jamais vu SLAT puisse l'adopter dans un nouveau projet ou y migrer un projet existant, sans rien nous demander. Elle contient les règles, leurs raisons, du code à copier, les checks qui les font respecter, et un exemple complet : une application désordonnée remise en ordre étape par étape.

Les numéros de section sont stables. Un dépôt qui suit SLAT garde une copie courte des règles dans `docs/slat/SLAT.md`, avec les mêmes numéros, si bien qu'une référence comme « section 17.8 » désigne la même chose sur cette page et dans le dépôt. Quand les deux divergent, les deux sont corrigés le jour même.

> **Version 1.1** · 25 octobre 2026. La version 1.1 ajoute la section 12, *Plateformes* : comment garder en un seul endroit le code qui dépend du système d'exploitation, pour qu'un futur portage vers Linux ou Windows se fasse dans un seul dossier. L'historique complet se trouve en section 22.

## 1. Pourquoi SLAT existe

Une application Tauri commence petite. Il y a un `main.rs`, quelques fonctions `#[tauri::command]`, peut-être un `state.rs`. Six mois plus tard, le même projet ressemble en général à ceci :

- un ou deux fichiers énormes contiennent « les commandes », et les commandes contiennent toute la logique métier ;
- l'état de l'application est une struct de trente champs, dont la moitié sont des `Mutex<Option<…>>` et des `AtomicBool` ;
- quelques variables `static` gardent encore de l'état qui n'appartient à personne ;
- la logique du domaine appelle directement `app.emit(…)`, donc rien ne se teste sans fenêtre ;
- les fonctions se multiplient en variantes : `start_with_budget`, `start_with_budget_and_slots`, `start_with_hook` ;
- des `#[cfg(target_os = "macos")]` sont dispersés dans toute la base de code ;
- une nouvelle personne dans l'équipe, ou un agent de code, a besoin d'une journée pour trouver où vit une fonctionnalité.

Rien de tout cela ne vient de mauvais développeurs. Cela vient de l'absence d'une réponse commune à la question « où est-ce que ça va ? ». Sans réponse, c'est le fichier le plus proche qui gagne, et le fichier le plus proche est toujours le plus gros.

SLAT donne cette réponse une fois pour toutes, pour chaque type de code, et rend ses parties importantes **mécaniques** : le compilateur et quelques petits scripts refusent le code qui casse l'organisation. Celle-ci survit ainsi aux échéances, aux arrivées dans l'équipe et aux agents de code.

SLAT est à un backend Rust ce que Nx avec NgRx est à un front-end : un ensemble de règles indépendant de toute application particulière. Nous l'utilisons dans tous les produits MonoOne dotés d'un backend Rust et Tauri, dont RigOne et IndexOne.

### 1.1. Objectifs

1. **Retrouvabilité.** Une personne ou un agent qui connaît le nom d'une fonctionnalité connaît le dossier où elle vit, des deux côtés de l'application.
2. **Testabilité sans fenêtre.** Tout, sauf la fine couche d'entrée, compile et exécute ses tests sans Tauri, sans écran et sans vrais processus.
3. **Des frontières garanties par le compilateur.** Le sens des dépendances est écrit dans `Cargo.toml`, pas dans un wiki.
4. **Un seul propriétaire pour l'état durable.** Un travail en arrière-plan (une exécution, un enregistrement, une conversation) a exactement un propriétaire, et ses règles sont une fonction pure.
5. **Une croissance peu coûteuse.** Une nouvelle fonctionnalité est un nouveau dossier avec un jeu de fichiers fixe, pas des modifications dans cinq fichiers partagés.
6. **La portabilité par construction.** Le code qui dépend du système d'exploitation vit dans un seul dossier. Une nouvelle plateforme est donc un nouveau fichier, pas une fouille de tout le dépôt.

### 1.2. Non-objectifs

- SLAT n'impose rien à votre front-end. Il fixe seulement le contrat à la frontière : commandes, objets de transfert de données (DTO) et événements.
- SLAT n'est pas un framework. Il n'y a aucune crate dont dépendre. C'est une organisation, un ensemble de règles et quelques scripts.
- SLAT ne remplace pas les règles propres à votre dépôt. Quand une règle du projet et SLAT divergent, **la règle du projet l'emporte**. SLAT dit où vivent les choses ; le projet dit ce qui est interdit.

### 1.3. À qui il s'adresse

SLAT est conçu pour les applications de bureau Rust avec Tauri, à partir d'environ 10 000 lignes de code backend. Les idées s'appliquent à toute application Rust dotée d'une fine couche d'entrée (une CLI, un daemon, un serveur) : remplacez « commande Tauri » par « handler HTTP » ou « sous-commande CLI », et tout le reste tient.

## 2. SLAT en une page

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

Six phrases à retenir :

1. **Seule la crate `app` connaît Tauri.** Tout le reste compile et se teste sans fenêtre.
2. **Une fonctionnalité vit dans une slice, et une slice a des fichiers fixes.** Vous cherchez le chat ? Il est dans `core/chat/` et `app/chat/`.
3. **Une commande Tauri fait au plus 10 lignes** : désérialiser, appeler une fonction de la slice, convertir le résultat en DTO.
4. **L'état durable a un seul propriétaire : un acteur.** Pas de `Mutex<Option<…>>` ni d'`AtomicBool` dans l'état de l'application, pas de `static` porteur d'état dans les slices.
5. **Les dépendances pointent vers le bas.** Un tier inférieur n'importe jamais un tier supérieur, et le compilateur y veille.
6. **Seul `drivers/src/platform/` connaît le système d'exploitation.** Le reste demande des concepts (groupe de processus, secret, dossier de données), jamais des appels système.

## 3. Vocabulaire

| Terme | Signification | Équivalent front-end |
|---|---|---|
| **Tier** (niveau) | Une sorte de crate : `kit`, `store`, `drivers`, `core`, `app`. Les tiers sont empilés et ne dépendent que vers le bas. | Un type de bibliothèque dans Nx (`type:util`, `type:data-access`, …) |
| **Slice** (tranche) | Une fonctionnalité du produit, comme `run`, `chat` ou `skill`. | Un dossier de domaine, `src/sections/<area>` |
| **Couche** (layer) | Un fichier à l'intérieur d'une slice, avec un nom et un rôle fixes : `model.rs`, `logic.rs`, `store.rs`, `service.rs`. | `feature/`, `ui/`, `data-access/`, `util/` |
| **Acteur** (actor) | L'unique propriétaire d'un état durable : `Msg → update → Effect`. | Un store NgRx : action → reducer → effect |
| **Handle** (poignée) | La seule porte d'entrée vers un acteur depuis l'extérieur. | `inject(Store)` |
| **Snapshot** (instantané) | Ce que la fenêtre voit d'un acteur, publié par un canal `watch`. | `select(…)` |
| **Point d'entrée** (entry) | Une façon dont le monde extérieur appelle le backend : une commande Tauri, un serveur MCP, un pont local, un hub distant. | Un composant d'écran |
| **Query** (requête) | Une lecture sans effet de bord. | Un selector |
| **Command** (commande) | Un changement d'état. | Une action |
| **Événement** (event) | Le backend qui prévient le front-end qu'une chose a changé, sans qu'on le lui demande. | Un push dans un store |
| **Plateforme** (platform) | Un système d'exploitation pour lequel on compile : `macos`, `linux`, `windows`. | Une cible navigateur |
| **Contrat de plateforme** (platform contract) | Une fonction de `drivers::platform` qui signifie la même chose sur chaque système d'exploitation. | Un polyfill |

Trois de ces termes se confondent facilement. Voici l'image à garder en tête : **les tiers sont les étages d'un immeuble, les slices sont les appartements de l'étage `core`, et les couches sont les pièces de chaque appartement.**

## 4. D'où vient SLAT

Les pièces de SLAT ne sont pas nouvelles. Il combine cinq idées connues et tranche les choix que chacune laisse ouverts.

| Idée | Ce que SLAT en reprend | Ce que SLAT décide en plus |
|---|---|---|
| Architecture en couches / Clean Architecture | Les dépendances pointent vers le domaine ; les E/S sont en bordure. | Les couches sont des **crates**, donc le compilateur vérifie le sens. Exactement cinq sortes. |
| Vertical Slice Architecture | Le code est regroupé par fonctionnalité, pas par rôle technique. | Chaque slice a les **mêmes noms de fichiers**, avec les mêmes rôles. |
| The Elm Architecture, NgRx, Redux | L'état change par des messages et une fonction de mise à jour pure. | Seulement pour l'état qui passe le test des trois questions (section 9.1). Les effets reviennent sous forme de messages. |
| Functional core, imperative shell | Les décisions sont pures ; les effets de bord s'exécutent à part. | `logic.rs` et `update.rs` sont purs par règle, et un script le vérifie. |
| Ports et adaptateurs (hexagonale) | On atteint le monde extérieur par une interface. | Pas de trait tant qu'il n'y a pas deux implémentations. Le tier `drivers` et les contrats de plateforme jouent le rôle des ports. |

Ce qui distingue SLAT de chacune de ces idées prise seule, c'est qu'il est **complet et mécanique**. Chaque type de code a exactement une place, et les règles importantes sont garanties par `Cargo.toml` ou par un check qui tourne en CI.

## 5. Tiers

Un workspace SLAT compte au plus cinq sortes de crates. Elles s'appellent `<product>-<tier>`, par exemple `quayside-core`.

| Tier | Ce qui vit ici | Peut dépendre de | Jamais |
|---|---|---|---|
| `kit` | Types et outils partagés sans domaine : identifiants, temps, chemins (`kit::paths`), écritures de fichiers durables, type d'erreur de base, journalisation. | bibliothèques externes uniquement | `tauri`, `tokio::process`, SQL, `#[cfg]` de système d'exploitation, quoi que ce soit du produit |
| `store` | Persistance : la connexion d'écriture, les migrations, le schéma, la reconstruction de l'index, le chiffrement de la base. | `kit` | `tauri`, logique du domaine, processus |
| `drivers` | Le monde extérieur : processus, outils en ligne de commande des fournisseurs, HTTP, sidecars. Le code qui dépend du système d'exploitation vit uniquement dans `drivers/src/platform/`. | `kit` | `tauri`, `store`, logique du domaine |
| `core` | Toutes les slices du domaine : modèle, logique, cas d'usage, acteurs. | `kit`, `store`, `drivers` | `tauri` |
| `app` | Points d'entrée : commandes Tauri, DTO, événements, serveurs d'entrée (MCP, pont), état de l'application, `setup`, `main`. | tous les autres tiers | logique du domaine (elle appartient à `core`) |

Dans ce document, `core/…` et `app/…` abrègent les dossiers sources des deux crates. `core/src/<slice>/` correspond à `crates/<product>-core/src/<slice>/`, et `app/src/<slice>/` à `src-tauri/src/<slice>/`, le dossier que Tauri crée pour la crate de l'application. Les checks de la section 16 utilisent les chemins complets.

Un workspace SLAT complet : Quayside, l'application d'exemple de la section 20, après sa migration.

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

### 5.1. Le compilateur monte la garde

Les flèches entre tiers sont écrites dans le `Cargo.toml` de chaque crate. Si `core` ne déclare pas `tauri` comme dépendance, alors `use tauri::Manager;` dans `core` est une erreur de compilation. C'est la garantie la plus forte qu'une règle puisse avoir : on ne peut ni l'oublier, ni la sauter en revue, ni la contester.

Un workspace minimal :

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

### 5.2. Avec combien de crates commencer

Le minimum est deux : `core` et `app`. Ne séparez les autres tiers que lorsque leur code existe déjà et qu'il est propre, c'est-à-dire qu'il n'importe rien d'un tier supérieur. **Une crate vide « pour plus tard » est interdite.** Elle coûte une étape d'édition de liens à chaque build et n'apporte rien.

### 5.3. Quand diviser un tier

Quand `core` dépasse environ 60 000 lignes, ou quand reconstruire tout `core` après une modification d'une seule slice devient pénible, déplacez un groupe de slices dans `core-<group>`, par exemple `quayside-core-run`. Restez à six à huit crates au maximum. Chaque crate est une étape d'édition de liens séparée, et sur un portable, une machine figée coûte plus cher que les secondes qu'un découpage plus fin ferait gagner.

### 5.4. Exception de compatibilité

Un nom de bibliothèque que le bundler Tauri ou les données de l'utilisateur connaissent déjà (par exemple `quayside_lib`, ou un dossier dans le répertoire personnel) reste avec la crate `app`. Les nouvelles crates reçoivent de nouveaux noms.

## 6. Slices

Une slice est une fonctionnalité du produit. Son nom est un nom commun au singulier en `snake_case` : `recording`, `transcript`, `board`, `trigger`. Pas `recordings_manager`, pas `utils`. Quand le produit a un front-end, les noms des slices correspondent à ses dossiers de fonctionnalités, pour que le même mot retrouve le code des deux côtés.

Une slice existe dans deux tiers : son domaine dans `core`, et son point d'entrée (commandes, DTO, événements) dans `app`.

:::diagram slice

### 6.1. Une slice dans `core`

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

Règles :

- **Un fichier dont la slice n'a pas besoin n'existe pas.** Une petite slice peut tenir dans un seul `mod.rs` qui contient son modèle et son service, jusqu'à environ 400 lignes.
- **Un fichier qui grossit devient un dossier du même nom** : `logic.rs` devient `logic/mod.rs` plus `logic/<topic>.rs`. Le rôle ne change pas, seul le nombre de fichiers change.
- **Une slice trop grande se divise en sous-slices** : `run/` devient `run/start/`, `run/step/`, `run/finish/`, chacune avec la même organisation de fichiers. Le parent ne garde qu'un `mod.rs` avec des réexportations.
- **`mod.rs` est la porte d'entrée de la slice**, comme l'`index.ts` d'une bibliothèque Nx. Les autres slices n'importent que par lui.

Un `mod.rs` typique :

```rust
mod logic;
mod model;
mod service;
mod store;

pub use model::{Transcript, TranscriptId, Word};
pub use service::TranscriptService;
```

### 6.2. Une slice dans `app`

```tree
app/src/<slice>/
  mod.rs        `mod …;` and `pub mod commands;` (the command list itself is in lib.rs, 6.4)
  commands.rs   #[tauri::command] functions; at most 10 lines each
  dto.rs        wire types: serde camelCase, #[serde(other)] on enums, From<model>
  events.rs     event names and payloads sent to the window; snapshot subscription loops
```

Le reste de la crate `app` :

```tree
app/src/
  main.rs       calls lib::run(); nothing else
  lib.rs        run(): Builder, plugins, setup, generate_handler! with every command, grouped by slice
  state.rs      AppState: the composition root, section 11
  error.rs      entry error → code and text for the window
  platform.rs   optional: window and menu settings that depend on the operating system, section 12.3
  doors/        entries other than the window: MCP server, bridge for agents, remote hub
```

### 6.3. Une commande, la forme de référence

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

Si une commande a besoin d'un `if`, d'une boucle ou de deux appels à la slice, cette logique appartient à `service.rs` ou à `logic.rs`. La limite de 10 lignes n'est pas une question de style. Une commande qui ne fait que traduire n'a pas besoin de son propre test unitaire, parce que sa logique est testée dans la slice. Ce qui reste à prouver, c'est la phrase qu'une personne voit, et elle se teste de bout en bout à travers le point d'entrée (section 14).

### 6.4. Enregistrer les commandes

`tauri::generate_handler!` a besoin du chemin complet de chaque commande, donc `lib.rs` tient une liste unique. Gardez-la groupée par slice, un bloc par slice, pour qu'ajouter une commande soit une ligne à côté de ses voisines :

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

Une commande qui existe dans une slice mais manque à cette liste compile et ne fait rien, sans le moindre avertissement. La section 16 propose un petit check qui compare les deux et échoue quand elles divergent.

### 6.5. Nommer les slices

- Un nom par fonctionnalité, au singulier : `trigger`, pas `triggers`.
- Le nom de la chose que l'utilisateur reconnaît, pas celui de la technique : `transcript`, pas `whisper_pipeline`.
- Quand deux fonctionnalités changent toujours ensemble, elles forment une seule slice. Quand une fonctionnalité a des parties qui changent indépendamment, ce sont des sous-slices.
- **Une politique transversale est aussi une slice** : contrôles d'accès, limites, budgets et protection des secrets vivent dans `core/<policy>/` (par exemple `core/guard/`), et toutes les autres slices les appellent.

## 7. Qui peut importer qui

### 7.1. À l'intérieur d'une slice

| Fichier | Peut importer | Ne peut pas importer |
|---|---|---|
| `model.rs` | `kit` ; le `model` des autres slices, via leur `mod.rs` | tout ce qui fait des E/S, `async`, `store`, `drivers` |
| `logic.rs` | `model` | E/S, `async`, `store`, `drivers`, `service` |
| `store.rs` | `model`, la crate `store` | `drivers`, `service`, `logic` des autres slices |
| `service.rs` | `model`, `logic`, `store.rs`, `drivers`, l'API publique des autres slices | `tauri`, état global |
| `actor/*` | `model`, `logic`, `service`, `drivers` | `tauri` ; et pour `update.rs`, aucune E/S non plus |
| `app/<slice>/dto.rs` | le `model` de la slice | `service`, `store` |
| `app/<slice>/commands.rs` | l'API publique de la slice, `dto`, `AppState` | `store`, `drivers`, `logic` |

### 7.2. Entre slices

- **Uniquement par `mod.rs`.** Les chemins profonds comme `crate::run::logic::…` depuis une autre slice sont interdits.
- **Pas de cycles.** Si `a` a besoin de `b` et `b` a besoin de `a`, la partie commune devient sa propre slice (en général un petit `model` ou un petit service), et les deux en dépendent.
- **Une politique est une slice, pas une commande.** Si une vérification de budget vit dans une commande, chaque couche inférieure qui en a besoin doit importer vers le haut. C'est la cause de cycles la plus fréquente dans les applications Tauri.

### 7.3. Pourquoi ces lignes précisément

La table des imports est construite pour que ce qui coûte cher à tester (E/S, async, processus) tienne dans le moins de fichiers possible, et que ce qui a le plus de valeur à tester (les décisions) se trouve dans des fichiers qui n'ont rien de tout cela. Une décision dans `logic.rs` se teste avec un simple `#[test]`, en quelques microsecondes. La même décision enfouie dans une commande a besoin d'une fenêtre.

## 8. Flux de données

:::diagram flows

### 8.1. Query (une lecture)

```
window ─invoke─► app/<s>/commands.rs ─► core/<s>/service.rs ─► core/<s>/store.rs
                        ◄── dto.rs ◄──────── model ◄──────────────────┘
```

Une lecture ne passe pas par un acteur, sauf si elle lit l'état de cet acteur. Elle lit alors le dernier `Snapshot` depuis le `Handle`, sans envoyer de message.

### 8.2. Command (un changement)

Sans état d'arrière-plan (enregistrer un réglage, créer un fichier) :

```
window ─invoke─► commands ─► service ─► logic (decision) ─► store / drivers ─► result
```

Avec un état d'arrière-plan (une exécution, une conversation, un enregistrement) :

```
window ─invoke─► commands ─► Handle.send(Msg)
                                  │
                 actor ◄──────────┘
                   update(&mut State, Msg) -> Vec<Effect>     pure function
                   for e in effects: execute(e)               I/O: drivers, store, timers
                   snapshot.send(State.view())                the window gets a new view
```

### 8.3. Événement (backend → fenêtre)

Les événements sont émis **uniquement** depuis `app/<s>/events.rs`. Une slice de `core` publie ses changements par un `watch::Sender<Snapshot>` ou un `broadcast::Sender<Event>`. `events.rs` s'y abonne et appelle `emit`. Ainsi, `core` ignore tout de la fenêtre, et le front-end dispose d'un seul endroit d'où viennent les événements de chaque slice. Les noms d'événements suivent le format `<slice>:<event>`, par exemple `recording:snapshot`.

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

### 8.4. Flux à fort volume

Certaines slices produisent beaucoup de petits événements : lignes de log, mots d'une transcription, signaux de progression. N'émettez pas un événement Tauri par ligne. Donnez à la slice un canal borné dans `core` : un petit type d'émetteur propre à la slice (par exemple le `WordSink` de la section 20.3), dont le `send` n'attend jamais et renvoie ce qui s'est passé, comme `Sent::Delivered`, `Sent::Dropped` ou `Sent::Closed`. Laissez `app/<s>/events.rs` posséder une **pompe** qui regroupe les lignes dans un `tauri::ipc::Channel` toutes les quelques millisecondes. Le canal borné assure la contre-pression : quand la fenêtre est lente, la slice l'apprend (`Sent::Dropped`) au lieu de remplir la mémoire, et quand plus personne n'écoute (`Sent::Closed`), la slice peut s'arrêter. Le regroupement, le canal et la cadence d'affichage relèvent du point d'entrée et restent dans `app`.

## 9. Acteurs : des slices avec état

### 9.1. Quand utiliser un acteur

N'utilisez un acteur que si **les trois** conditions sont vraies :

1. l'état vit plus longtemps qu'un appel de commande ;
2. plusieurs sources le modifient en concurrence (la fenêtre, des processus, des minuteries, le réseau) ;
3. la fenêtre le suit en direct.

Dans tous les autres cas, utilisez un simple `service.rs`. Toutes les fonctionnalités NgRx n'ont pas besoin d'effects, et toutes les slices SLAT n'ont pas besoin d'un acteur.

| Candidat | 1 | 2 | 3 | Verdict |
|---|---|---|---|---|
| une exécution d'agent avec étapes et processus | oui | fenêtre, processus, minuteries | oui | acteur |
| un enregistrement en direct | oui | fenêtre, périphérique audio, minuterie | oui | acteur |
| une conversation avec un modèle | oui | fenêtre, processus du modèle, appareil distant | oui | acteur |
| générer un brouillon une fois et le renvoyer | oui | fenêtre (démarrer/arrêter) | non, un seul résultat | service + `kit::Jobs` |
| un cache des prix des modèles | oui | aucune | non | un champ du service de la slice |

### 9.2. Fichiers

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

### 9.3. Le contrat

- **`update` est pure.** Elle reçoit l'état et un message, et renvoie une liste d'effets. Chaque règle métier sur cet état se teste sans tokio, sans processus et sans base de données.
- **Un effet qui produit un résultat le renvoie sous forme d'un nouveau `Msg`.** L'acteur n'attend jamais un effet long dans sa boucle. Un effet long part dans `tokio::spawn`, et son résultat revient par la boîte aux lettres.
- **L'annulation est un message avec une génération**, pas un drapeau : `Msg::Cancel { generation }`. L'état contient `generation: u64`, et une réponse tardive portant une ancienne génération est ignorée dans `update`. Un `AtomicBool` global fuit d'une opération à l'autre ; une génération, non.
- **Un résultat est une valeur** : `enum Outcome<T> { Done(T), Cancelled }`, jamais `Err(Cancelled)`. Annuler est une demande de l'utilisateur, pas un échec.
- **Une limite de temps est un `Effect::StartTimer`, et son expiration est un `Msg::TimedOut`.** Tuer un processus après une limite de temps est le travail d'un driver. Un simple `tokio::time::timeout` annule la future Rust, pas le processus du système d'exploitation.
- **Pas de `std::sync::Mutex` dans un acteur.** Son état a un seul propriétaire, il n'a donc pas besoin de verrou.
- **Un acteur par instance d'état** : un par exécution, un par conversation. Le registre des instances actives est lui-même un petit acteur, ou un service avec une table de handles.

### 9.4. Un petit acteur complet

Un acteur d'enregistrement qui lance un processus d'enregistrement, applique une limite de temps, et peut être arrêté (le fichier est conservé) ou annulé (le fichier est jeté). Tous les noms de types et de fonctions sont donnés à titre d'exemple.

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

Un nouvel enregistrement peut démarrer dès que rien n'est en cours, y compris après qu'un précédent a été sauvegardé ou annulé. La dernière branche est tout l'intérêt des générations : un message `Level`, `TimedOut` ou `Ended` venant d'un enregistrement précédent arrive avec une ancienne génération et ne change rien.

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

La boucle ne garde qu'un émetteur faible pour les résultats de ses propres effets. Quand le dernier `Handle` est détruit, `recv` renvoie `None` et l'acteur se termine au lieu d'attendre indéfiniment.

Quand l'ordre des effets compte (persister avant de notifier, par exemple), exécutez ces effets en séquence dans une seule tâche lancée, au lieu d'une tâche par effet. La seule règle est que la boucle elle-même n'attend jamais.

### 9.5. Tester un acteur

La plupart des tests ne démarrent jamais l'acteur. Ils appellent directement `update` :

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

Quelques tests pilotent l'acteur entier via son `Handle`, avec `tokio::time::pause()`, un faux driver et des assertions sur la séquence de snapshots.

## 10. L'explosion des variantes

Une famille de fonctions comme `start_with_budget`, `start_with_slots`, `start_with_snapshot_hook`, `start_with_budget_and_slots` signale qu'il manque une struct de requête. Remplacez la famille par une seule fonction d'entrée et une seule struct d'options :

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

Les appelants écrivent `StartRequest { workflow, budget: Some(limit), ..Default::default() }`. Une nouvelle option est un nouveau champ, pas une nouvelle fonction et une nouvelle ligne chez chaque appelant. Les points d'injection réservés aux tests (`faults`, `hooks`) sont des champs qui n'existent que dans un build de test. `cfg(test)` seul ne couvre que les tests unitaires de la crate elle-même ; les tests d'intégration et les autres crates activent donc ces champs avec une feature `test-hooks`, la même idée que le faux driver de 14.2.

## 11. AppState, la racine de composition

`AppState` assemble l'application et ne fait rien d'autre. Elle peut contenir :

- des valeurs `Arc<…Service>` et `…Handle` des slices ;
- de la configuration en lecture seule ;
- un handle vers l'écrivain de la base de données.

Elle ne peut pas contenir :

- des `Mutex<Option<…>>`, `AtomicBool` ou `Mutex<HashMap<…>>` qui décrivent un processus d'arrière-plan. C'est de l'état d'acteur, qui appartient à `core/<slice>/actor/state.rs` ;
- des champs qui sont un détail d'une seule slice (caches, tables d'annulation, files d'attente).

Les slices ne peuvent pas non plus cacher d'état dans des variables `static` (`OnceLock<Mutex<…>>`, `LazyLock<Mutex<…>>`). La seule exception est une constante calculée une fois (`OnceLock<PathBuf>`) qui ne change jamais pendant la vie du processus.

**Le test :** chaque champ d'`AppState` se décrit avec un seul nom tiré d'une slice (« recordings », « runs », « account »). Un champ qui demande une phrase pour être décrit appartient à une slice.

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

### 11.1. `kit::Jobs` : le travail ponctuel en arrière-plan

Générer un brouillon, comparer deux dossiers ou planifier une tâche s'exécute en arrière-plan, peut être arrêté et produit un seul résultat. Cela ne demande pas d'acteur. Cela demande une table d'annulation, et cette table appartient au service de la slice, pas à `AppState`. `kit::Jobs<K>` est un type générique concret prévu pour cela :

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

`begin` annule tout job antérieur ayant la même clé, enregistre une nouvelle génération et renvoie un garde qui retire l'entrée lorsqu'il est détruit, mais seulement si la génération correspond toujours. Le verrou n'est tenu qu'à l'intérieur de ces deux fonctions courtes, jamais à travers un `await`. Comme `Jobs` est un type concret et non un trait, il ne contrevient pas à la règle contre les traits à une seule implémentation.

Ce n'est pas une échappatoire aux règles de la section 11. Elles portent sur l'endroit où vit l'état, pas sur son type. Un verrou à l'intérieur de `kit::Jobs`, possédé par le service d'une seule slice et jamais tenu à travers un `await`, est un détail privé de cette slice. La même table comme champ d'`AppState` est un état qui n'appartient à personne.

## 12. Plateformes

*Nouveau dans la version 1.1.*

Un produit peut n'être livré aujourd'hui que sur un seul système d'exploitation (par exemple, uniquement macOS). SLAT organise le code pour que le système d'exploitation suivant soit un travail dans **un seul dossier**, pas une fouille de tout le dépôt. Il y a une seule règle : **seul `drivers/src/platform/` connaît le système d'exploitation.** Tout le reste demande des concepts (un groupe de processus, un secret, le dossier de données, l'ouverture d'un fichier), jamais des appels système.

La liste des plateformes prises en charge appartient au dépôt (à son guide de contribution), pas à SLAT.

:::diagram platform

### 12.1. Organisation

```tree
drivers/src/platform/
  mod.rs          the only platform API: selects a file with #[cfg] and pub use; no logic
  unix.rs         shared by macOS and Linux: process groups, signals, file modes
  macos.rs        Keychain, revealing in Finder, the login shell, …
  linux.rs        only when the port starts: Secret Service, xdg-open, …
  windows.rs      only when the port starts: Job Objects, Credential Manager, ACLs, …
  unsupported.rs  every function returns Err(PlatformError::Unsupported)
```

- Un fichier pour un système d'exploitation que le produit ne prend pas encore en charge **n'existe pas**, pour la même raison qu'une crate vide « pour plus tard » n'existe pas. `unsupported.rs` en tient lieu.
- `unsupported.rs` n'est pas du code mort. Grâce à lui, tout le workspace sauf `app` compile pour chaque plateforme dès le premier jour. Une fuite de code système dans `core` devient une erreur de compilation en CI, pas une découverte le jour du portage.
- `mod.rs` est identique dans tous les dépôts :

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

Un portage ne modifie que cette liste de lignes `cfg`. Chaque fichier de plateforme expose **le même ensemble de fonctions et de types, avec les mêmes signatures**. Une fonction manquante est une erreur de compilation sur cette plateforme. Ce n'est pas un trait : pour un build donné, il y a toujours exactement une implémentation.

### 12.2. Contrats

Chaque concept a un contrat qui signifie la même chose sur chaque système d'exploitation. Seul l'intérieur diffère.

| Concept | API dans `drivers::platform` | macOS | Linux | Windows |
|---|---|---|---|---|
| groupe de processus | `ProcessGroup::spawn`, `terminate(grace)`, `proved_dead()` | identifiant de groupe de processus ; SIGTERM, délai de grâce, SIGKILL ; `kill(-pgid, 0)` renvoie `ESRCH` | comme macOS | Job Object ; `TerminateJobObject` ; le job n'a plus aucun processus |
| secrets | `secret::read`, `secret::write`, `secret::delete` | Keychain | Secret Service (libsecret) | Credential Manager |
| fichier et dossier privés | `fs::write_private`, `fs::create_private_dir` | mode `0o600` / `0o700` | comme macOS | ACL : propriétaire uniquement |
| ouvrir dans le système | `open_path`, `reveal_path`, `open_url` | `open`, `open -R` | `xdg-open` | `ShellExecuteW`, `explorer /select,` |
| environnement de l'utilisateur | `login_env()` | le shell de connexion (le `PATH` d'une application lancée depuis le Dock est minimal) | comme macOS | registre et environnement du processus |
| trouver un programme | `which(program)` | `PATH` | `PATH` | `PATH` plus `PATHEXT` |
| informations sur la machine | `machine::cores`, `machine::memory`, `machine::free_space` | sysctl, statfs | /proc, statfs | API système |

Règles des contrats :

- Une fonction de contrat ne renvoie pas de types système (`pid_t`, `HANDLE`). Elle renvoie des types de `drivers` ou de `kit`.
- **Une preuve, pas un espoir**, sur chaque plateforme : « le processus est mort » est un fait établi, pas un signal envoyé.
- Quand un système d'exploitation ne peut pas faire ce que le contrat exige, la fonction renvoie une erreur qui nomme ce qui manque, jamais un substitut silencieux.

Un court exemple de contrat et de son côté macOS :

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

### 12.3. Ce qui est interdit hors de `platform/`

| Interdit hors de `drivers/src/platform/` | À utiliser à la place |
|---|---|
| `#[cfg(unix)]`, `#[cfg(windows)]`, `#[cfg(target_os = …)]` | un contrat de 12.2 |
| `std::os::unix`, `std::os::windows`, `libc`, `nix`, `windows-sys`, `security-framework` | un contrat de 12.2 |
| `sh -c`, `bash`, `zsh`, `cmd /c`, `powershell` | `Command::new(program).args(…)` ; si un shell est vraiment nécessaire, c'est `platform` qui le choisit |
| noms de programmes système : `open`, `xdg-open`, `security`, `osascript`, `explorer` | `open_path`, `secret::*`, … |
| chemins codés en dur : `~`, `$HOME`, `/tmp`, `/usr/bin`, `/Applications`, `Library/` | `kit::paths` (12.4) |
| concaténation de chemins avec la chaîne `/` | `Path::join` |
| modes de fichier sous forme de nombres (`0o600`) | `fs::write_private` |

La seule exception est `app/src/platform.rs`, pour ce que seul Tauri connaît : le style de la barre de titre, le menu de l'application, la politique d'activation de la fenêtre. Rien d'autre que des réglages de fenêtre.

### 12.4. Chemins, fichiers et texte

- **Les dossiers viennent uniquement de `kit::paths`** : `data()`, `config()`, `cache()`, `logs()`, `temp()`. En dessous se trouve une bibliothèque qui suit la convention de chaque système (macOS `~/Library/Application Support/<App>`, Linux XDG, Windows `%APPDATA%`). Les données qui vivent déjà sous un ancien chemin y restent, sur le système où elles ont été créées (l'exception de compatibilité de 5.4) ; sur ce système, `kit::paths` renvoie l'ancien chemin, si bien que le code ne s'adresse toujours qu'à `kit::paths`. `kit` lui-même n'a aucun `#[cfg]` : la convention du système vient de la bibliothèque.
- **Les noms de fichiers créés par l'application sont en minuscules** et ne diffèrent jamais uniquement par la casse. Les systèmes de fichiers par défaut de macOS et de Windows ne les distinguent pas ; Linux, si.
- **Ne renommez pas et ne supprimez pas un fichier que quelqu'un tient ouvert.** Windows refuse. Les écritures atomiques passent par `kit::durable_file`, qui ferme le fichier avant de le remplacer.
- **Chemins longs.** Windows limite les chemins à environ 260 caractères sans le préfixe `\\?\`. Gardez peu profonds les copies de travail et les dossiers d'exécution ; le préfixe est ajouté par `platform`, jamais par une slice.
- **Le texte venant des processus** est lu en tolérant `\r\n`. Les fichiers écrits par l'application utilisent `\n`.
- **Un chemin envoyé à la fenêtre** est en UTF-8. Un chemin qui ne peut pas s'écrire en UTF-8 est une erreur qui nomme le fichier, jamais un `unwrap()`.

### 12.5. Tests de plateforme

- **Le test de contrat** vit dans `drivers/tests/it/platform_contract.rs`, un module de l'unique cible d'intégration de la crate (14.1), et est le même pour chaque système d'exploitation : un processus est mort après `terminate`, un secret se relit après avoir été écrit et disparaît après avoir été supprimé, un fichier privé ne peut pas être lu par un autre utilisateur. Chaque plateforme prise en charge passe **le même** ensemble.
- **Les tests hors de `drivers` n'utilisent ni shell ni signaux.** Un processus dont un test a besoin est un petit programme Rust (un binaire dans une crate de test), pas `sh -c 'sleep 10'`.
- Un `#[cfg]` de plateforme dans les tests n'est autorisé que dans les tests de `drivers`.

### 12.6. Application des règles

| Règle | Qui la fait respecter |
|---|---|
| les interdictions de 12.3 | un check par grep avec une liste de référence (section 16) |
| les crates autres que `app` compilent sur chaque plateforme | `cargo check --workspace --exclude <app>` sur des runners CI natifs Ubuntu et Windows. Pas de vérification croisée depuis macOS : les scripts de build contenant du code C ont besoin du compilateur de la cible. |
| le contrat fonctionne | `platform_contract.rs` sur un runner pour chaque plateforme **prise en charge** |

### 12.7. Porter vers un nouveau système d'exploitation

1. `drivers/src/platform/<system>.rs` : chaque fonction du contrat. Le compilateur liste ce qui manque.
2. `mod.rs` : le `cfg` du nouveau système cesse de pointer vers `unsupported.rs`.
3. `platform_contract.rs` est vert sur le runner de ce système, et ce runner rejoint la CI.
4. `app` : configuration de packaging et de signature pour le système, et `app/src/platform.rs` si nécessaire.
5. Le guide de contribution du dépôt ajoute le système à la liste des plateformes prises en charge.

Si un portage exige une modification dans `core`, c'est que quelque chose a fui. Une pull request séparée déplace d'abord la fuite derrière un contrat, puis le portage reprend.

## 13. Erreurs

- **Chaque crate a sa propre enum d'erreurs** (avec `thiserror`). Une slice peut avoir la sienne dans `error.rs`.
- **`core` renvoie des erreurs du domaine.** `app/error.rs` les transforme en un code et une phrase pour la fenêtre. La phrase vient de votre table de traductions, jamais du `Display` d'une enum transmise sur le fil.
- **Un événement inconnu venant du fil n'est pas une erreur.** Utilisez `#[serde(other)]` sur les enums et `Option<T>` sur les champs non essentiels. Journalisez la ligne inconnue pour le débogage et passez à la suite. Une nouvelle version de l'outil en ligne de commande d'un fournisseur ne doit jamais interrompre une exécution.
- **`unwrap()` et `panic!` sont interdits** hors des tests dans `core`, `store` et `drivers`. Utilisez `?` avec une variante d'erreur, ou `expect()` avec une raison qui explique pourquoi la valeur ne peut pas manquer.

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

## 14. Tester par couche

| Couche | Comment tester | Ce qui compte comme preuve |
|---|---|---|
| `logic.rs`, `update.rs` | un simple `#[test]`, sans tokio | une assertion sur une valeur ou sur la liste des effets |
| `store.rs` | une base de données dans un dossier temporaire | la ligne renvoyée par une lecture |
| `service.rs` | `#[tokio::test]` avec un vrai store et un faux driver | l'état des fichiers ou de la base après l'appel |
| `actor/` | un `Handle` plus un scénario de messages ; le temps avec `tokio::time::pause` | la séquence de `Snapshot` |
| `drivers` | un vrai processus ou un flux enregistré | le processus est mort (`ESRCH` ou job vide), les lignes reçues sur le fil |
| `app/commands` | pas de test unitaire ; un test de bout en bout ou d'intégration à travers le point d'entrée, pour ce qu'une personne voit | le texte qu'une personne voit |

Le test d'un message affiché à une personne se place là où cette personne le voit, pas seulement dans `logic.rs`. Une fonction qui produit la bonne phrase ne prouve rien si personne ne l'appelle.

### 14.1. Un seul binaire d'intégration

Chaque fichier placé directement dans `tests/` est un binaire séparé, et chaque binaire passe par sa propre édition de liens. Sur un gros workspace, cela fait une minute par fichier. Donnez à chaque crate **une seule** cible d'intégration, `tests/it/main.rs`, avec un module par sujet, et lancez un seul sujet avec un filtre :

```tree
tests/it/
  main.rs          mod recording_stops_on_time_limit; mod transcript_survives_restart; …
  recording_stops_on_time_limit.rs
  transcript_survives_restart.rs
```

```bash
cargo nextest run --test it recording_stops_on_time_limit::
```

Lancez avec `--no-tests=fail`, pour qu'un filtre qui ne correspond à rien soit rouge au lieu d'être vert en silence.

### 14.2. Un faux driver sans trait

Un test a besoin d'un driver qui ne lance pas de vrais processus. SLAT interdit un trait à une seule implémentation, et un faux ne compte pas comme une deuxième implémentation réelle. Deux options respectent la règle :

- **Une jointure par les données.** Le service reçoit la *sortie* du driver sous forme de valeur ou de canal, pas le driver lui-même. Le test envoie des lignes dans le canal.
- **Un build de test.** `drivers` expose `#[cfg(any(test, feature = "fake"))] pub mod fake;` avec les mêmes fonctions que le module réel, et la crate de test active la feature `fake`.

Quand une deuxième implémentation réelle apparaît (un deuxième fournisseur, une deuxième plateforme), c'est le moment d'introduire un trait.

## 15. Limites de taille

| Unité | Seuil d'alerte | Que faire |
|---|---|---|
| fichier | 1 500 lignes de code (hors tests) | le diviser en un dossier de même rôle, section 6.1 |
| slice | 15 000 lignes | la diviser en sous-slices |
| `core` | 60 000 lignes | déplacer un groupe dans `core-<group>`, section 5.3 |
| commande Tauri | 10 lignes | déplacer la logique dans `service.rs` |
| champ d'`AppState` | un seul nom | voir la section 11 |

Les fichiers qui dépassent le seuil le jour où vous adoptez SLAT vont sur une **liste de référence** (baseline). Cette liste ne peut que diminuer.

## 16. Application des règles

Le mécanisme d'abord, les mots ensuite. Une règle qu'un script peut vérifier ne doit jamais dépendre de la mémoire de quelqu'un.

| Règle | Qui la fait respecter |
|---|---|
| seule `app` connaît Tauri | `Cargo.toml` (aucune dépendance `tauri` ailleurs) |
| les tiers ne dépendent que vers le bas | `Cargo.toml` |
| seul `store` ouvre la connexion d'écriture | un check par grep : `Connection::open` uniquement dans la crate `store`. Les fichiers `store.rs` des slices utilisent les types de `rusqlite`, donc la dépendance seule ne suffit pas. |
| `#[tauri::command]` uniquement dans `app/*/commands.rs` | un check par grep |
| chaque commande est enregistrée | un check qui compare les commandes des slices avec `generate_handler!` |
| `emit` uniquement dans `app/*/events.rs` | un check par grep |
| pas d'imports profonds entre slices | un check qui cherche `crate::<a>::<layer>::` depuis une autre slice |
| pas de `static` porteur d'état dans `core` | un check par grep sur `static .*(Mutex|RwLock)` |
| `update.rs` ne fait pas d'E/S | un check : pas de `async`, `tokio::`, `std::fs`, `store::` dans `update.rs` |
| système d'exploitation uniquement dans `drivers/src/platform/` et `app/src/platform.rs` | un check par grep avec la liste de 12.3 |
| les crates autres que `app` compilent sur chaque plateforme | `cargo check` sur des runners CI Ubuntu et Windows |
| limites de taille | un check avec une liste de référence qui ne peut que diminuer |

Chaque check commence avec une **liste de référence** des violations actuelles. Une nouvelle violation est rouge. Une violation corrigée doit être retirée de la liste dans la même pull request, pour que la liste ne puisse jamais regrossir.

### 16.1. Un check avec une liste de référence

Tous les checks suivent la même forme : trouver les violations, soustraire la liste de référence, échouer sur tout ce qui reste, et échouer si la liste mentionne quelque chose de déjà corrigé.

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

### 16.2. Un check doit pouvoir échouer

Avant de faire confiance à un check, introduisez une vraie violation, regardez-le passer au rouge, puis retirez-la. Un check qui n'a jamais été rouge n'a jamais été testé.

Les checks grep de SLAT cherchent du code interdit, donc une correspondance dans un commentaire les fait passer au rouge, pas au vert. C'est agaçant mais sans danger, et la solution est de supprimer le code mort. Le type dangereux est un check qui exige qu'une chaîne soit présente : il passe sur un commentaire. Une règle de ce genre se prouve en exécutant du code, pas en lisant du texte.

### 16.3. Le job de plateforme en CI

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

Dans un vrai dépôt, épinglez les versions des actions sur des hashs de commit complets. Le job ne fait que compiler ; il n'exécute aucun test sur les plateformes que le produit ne prend pas encore en charge, il est donc peu coûteux.

### 16.4. Les checks au complet

| Check | Règle |
|---|---|
| `checks/slat-commands.sh` | `#[tauri::command]` uniquement dans `src-tauri/src/*/commands.rs` |
| `checks/slat-registered.sh` | chaque commande d'une slice figure dans `generate_handler!` |
| `checks/slat-emit.sh` | `emit` uniquement dans `src-tauri/src/*/events.rs` |
| `checks/slat-deep-imports.sh` | pas de `crate::<slice>::<layer>::` depuis une autre slice |
| `checks/slat-static-state.sh` | pas de `static … Mutex|RwLock` dans `crates/*-core*` |
| `checks/slat-pure-update.sh` | `update.rs` sans `async`, `tokio::`, `std::fs`, `store::` |
| `checks/slat-platform.sh` | les interdictions de 12.3 hors de `platform/` |
| `checks/slat-size.sh` | les fichiers de plus de 1 500 lignes inscrits sur la liste de référence ne peuvent que diminuer |

## 17. Recettes

Chaque recette commence par un test qui échoue sur l'ancien code, sur une assertion et non à la compilation. En Rust, écrivez d'abord la signature avec `todo!()`, pour que le test compile et échoue pour la bonne raison.

### 17.1. Une nouvelle lecture (Query)

1. `core/<s>/model.rs` : le type du résultat, s'il n'existe pas.
2. `core/<s>/store.rs` : la fonction de lecture. Testez-la sur une base de données temporaire.
3. `core/<s>/service.rs` : `pub async fn <verb>(…)` qui appelle store et logic.
4. `core/<s>/mod.rs` : `pub use` de la nouvelle fonction ou du nouveau type.
5. `app/<s>/dto.rs` : le DTO et `From<model>`.
6. `app/<s>/commands.rs` : une commande de 10 lignes au plus ; enregistrez-la.
7. Front-end : la couche data-access appelle la commande.

### 17.2. Un nouveau changement sans état d'arrière-plan (Command)

Comme 17.1, et la décision (est-ce autorisé, qu'est-ce qui change) s'écrit dans `logic.rs` sous forme de fonction pure, avec un test. `service.rs` se contente de l'appeler et d'effectuer l'écriture.

### 17.3. Une nouvelle slice

1. Nom : la fonctionnalité, en nom commun au singulier en `snake_case`.
2. `core/src/<s>/mod.rs` plus uniquement les fichiers nécessaires ; `pub mod <s>;` dans `core/src/lib.rs`.
3. `app/src/<s>/mod.rs`, `commands.rs`, `dto.rs` ; enregistrez ses commandes.
4. Si la slice a un état d'arrière-plan : recette 17.4.

### 17.4. Un nouveau flux avec état (acteur)

1. Vérifiez les trois conditions de 9.1. Si l'une n'est pas remplie : recette 17.2.
2. `msg.rs`, `state.rs`, `snapshot.rs` : les types.
3. `update.rs` : les tests d'abord (un message en entrée, les effets et l'état attendus en sortie), puis l'implémentation.
4. `effect.rs` : `execute` pour chaque effet ; les résultats reviennent sous forme de `Msg`.
5. `run.rs` et `handle.rs` : la boucle et la porte.
6. `AppState` reçoit exactement un champ : le registre ou le `Handle`.
7. `app/<s>/events.rs` : s'abonner au `Snapshot` et `emit("<s>:snapshot")`.

### 17.5. Un nouveau driver (le monde extérieur)

1. `drivers/src/<name>.rs` ou un dossier. Un driver ne connaît ni les slices ni la base de données.
2. Un trait seulement à partir de deux implémentations.
3. Un processus : groupe de processus, escalade de l'arrêt, preuve de la mort ; secrets tenus hors des arguments et des logs. Le tout via les contrats de `platform` (12.2), jamais par un appel système dans le driver.
4. Une slice utilise le driver depuis `service.rs` ou depuis `effect.rs`.

### 17.6. Un nouvel événement pour la fenêtre

1. Un changement dans `core` publie un `Snapshot` ou un `Event` sur un canal.
2. `app/<s>/events.rs` s'y abonne et émet `<s>:<event>`.
3. Front-end : la couche data-access écoute et met à jour son store.

### 17.7. Une nouvelle plateforme

Section 12.7.

### 17.8. Où est-ce que ça va ? (arbre de décision)

```
Est-ce que ça appelle Tauri, la fenêtre, MCP ou un hub distant ?       → app (commands, events, doors)
Est-ce que ça dépend du système d'exploitation ?                       → drivers/src/platform/ (section 12)
Est-ce que ça parle à un processus, au réseau, à un trousseau ?        → drivers (via les contrats de plateforme)
Est-ce une lecture ou une écriture en base, ou le schéma ?             → store (connexion) / core/<s>/store.rs (requêtes)
Est-ce une décision pure ou un calcul ?                                → core/<s>/logic.rs (ou update.rs dans un acteur)
Est-ce un type du domaine ?                                            → core/<s>/model.rs
Est-ce une suite d'étapes avec des E/S ?                               → core/<s>/service.rs
Est-ce un état qui vit en arrière-plan et que la fenêtre observe ?     → core/<s>/actor/
Est-ce sans aucun domaine (temps, chemins, identifiants, fichiers) ?   → kit
```

## 18. Travailler avec des agents de code

SLAT a été conçu dans une équipe où une grande partie du code est écrite par des agents de code. Les agents suivent une organisation de façon fiable quand elle est écrite, courte et vérifiée par des machines. Trois choses font la différence.

1. **Une organisation fixe est une carte gratuite.** Un agent à qui l'on demande d'« ajouter un filtre aux transcriptions » ouvre `core/transcript/` et `app/transcript/` sans chercher. Le temps qu'un agent passe à chercher est le temps qu'il passe à se tromper.
2. **Un check vaut mieux qu'une phrase dans le prompt.** « N'émets pas depuis core » dans un prompt est respecté la plupart du temps. Un check rouge est respecté à chaque fois. Écrivez d'abord la règle sous forme de check, et sous forme de ligne de prompt seulement si elle ne peut pas être vérifiée.
3. **Les recettes sont des prompts.** La section 17 est volontairement écrite en étapes numérotées : collez la recette dans la tâche, et l'agent produit les fichiers aux endroits attendus, dans l'ordre attendu.

Une section à copier dans le guide de contribution de votre dépôt (`AGENTS.md`, `CLAUDE.md` ou équivalent) :

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

## 19. Migrer une base de code existante

Pas besoin de tout réécrire. SLAT s'adopte par petites pull requests qui gardent l'application fonctionnelle en permanence, dans un ordre qui ne bloque pas les autres branches.

:::diagram migration

### 19.1. L'ordre

1. **Mesurer.** Cartographiez les modules : lignes par module, imports qui pointent vers le haut, fichiers qui utilisent `tauri::`, nombre de `#[tauri::command]`, `static` porteurs d'état, champs de l'état de l'application, `#[cfg]` de système d'exploitation. Consignez-le dans un plan versionné dans le dépôt. Ces chiffres sont vos listes de référence.
2. **Inverser les dépendances montantes.** Les politiques qui vivent dans la couche des commandes mais sont appelées par des couches inférieures descendent dans `core/<policy>/`. Les types que le domaine emprunte à la couche d'entrée (un canal de lignes, un type d'image, une chaîne de message) partent dans la slice à laquelle ils appartiennent. L'ancien chemin reste sous forme de `pub use` jusqu'à la fin de la migration.
3. **Séparer `app` et `core`.** Créez le workspace et une crate `core` sans `tauri`. Le code qui connaît Tauri reste dans `app` ; tout le reste est déplacé avec `git mv`. C'est l'étape la plus mécanique.
4. **Séparer `store`, `drivers` et `kit`.** Seulement quand leur code est déjà propre. En séparant `drivers`, déplacez le code propre au système d'exploitation dans `platform/` et donnez au check de plateforme sa liste de référence.
5. **Slice par slice.** Une slice par pull request : les commandes dans `app/<s>/`, la logique dans `core/<s>/` selon l'organisation fixe. Commencez par la plus petite et la moins partagée.
6. **`kit::Jobs`.** Les tables d'annulation quittent l'état de l'application.
7. **Acteurs.** L'état venant de l'état de l'application et des variables `static` part dans des acteurs, un flux par pull request, avec des tests `update` écrits d'abord contre le comportement actuel.
8. **Checks.** Chaque étape active le check de sa règle, avec une liste de référence.

### 19.2. Règles de migration

- **Les déplacements ne changent pas le comportement.** Une pull request qui déplace du code ne corrige pas de logique, et une pull request qui corrige de la logique ne déplace pas de code. Quand quelque chose casse, on sait quel type de changement en est la cause.
- **Des façades sur les anciens chemins.** Un `pub use new::place::*;` à l'ancien chemin de module permet au code qu'on n'a pas le droit de toucher (ou qu'on ne veut pas encore toucher), ainsi qu'aux tests existants, de compiler sans modification. Une façade est supprimée quand plus rien ne l'importe.
- **Un seul build lourd à la fois.** Plusieurs builds `cargo` parallèles d'un gros workspace peuvent figer un portable. Migrez en file indienne.
- **Lancez toute la suite de tests après chaque étape**, pas après chaque commit. La suite est votre preuve que rien n'a bougé dans le comportement.

### 19.3. L'organisation d'abord, pour démarrer plus vite

Si la retrouvabilité est votre plus gros problème, vous pouvez réordonner le travail : déplacez d'abord les **fichiers** dans des dossiers de slices à l'intérieur de l'unique crate existante, sans toucher à leur contenu, et laissez des façades aux anciens chemins. Git enregistre ces opérations comme des renommages, donc les autres branches ouvertes fusionnent toujours proprement. Vous obtenez la carte (le dossier de chaque fonctionnalité) en un jour ou deux ; la séparation en crates, les couches de chaque slice et les acteurs viennent ensuite, sur une organisation déjà lisible.

Deux choses ne sont pas gratuites, même ici. Les fichiers qui utilisent `super::` ou `pub(super)` changent de module parent quand ils bougent, donc quelques chemins demandent de petites corrections mécaniques. Et sortir les commandes d'un fichier central modifie ce fichier, ce qui entre en conflit avec les branches qui l'éditent ; mieux vaut donc en faire une deuxième étape séparée.

### 19.4. Ce qui coince en général

| Problème | Que faire |
|---|---|
| Des centaines de tests importent les anciens chemins | Des façades aux anciens chemins. Ne déplacez pas les tests dans les mêmes pull requests. |
| Les branches parallèles entrent en conflit avec `git mv` | Faites les séparations en crates quand le moins de branches possible sont ouvertes. Chaque déplacement est sa propre pull request. |
| Des éléments `pub(crate)` sont nécessaires depuis une autre crate après la séparation | Élargissez-les en `pub`. Après la migration, revoyez ce qui peut repasser en `pub(crate)`. |
| Le temps de compilation augmente avec le nombre de crates | Six à huit crates au maximum. Un seul build lourd à la fois. |
| Un refactoring change le comportement en silence | Les tests `update` d'abord, contre le comportement actuel. Déplacements et corrections dans des pull requests séparées. |
| Une partie du code ne doit pas changer du tout (une fonctionnalité critique, une zone gelée) | Elle reste où elle est et n'atteint la nouvelle organisation que par des façades. Les façades sont du code additif. |

## 20. Étude de cas : Quayside

Quayside est une application de bureau **fictive**, inventée pour ce document. Elle s'inspire librement du type de logiciel que nous construisons, mais chaque nom, chiffre et fichier ci-dessous est inventé. Quayside enregistre des appels, les transcrit sur l'appareil, rédige un résumé avec un modèle local ou cloud, lance des tâches de suivi avec des agents de code, synchronise les actions à mener vers un tableau d'équipe partagé, et dispose d'une application compagnon sur téléphone qui peut suivre un enregistrement et y envoyer une note.

Elle est développée depuis deux ans par une petite équipe pressée, et elle fonctionne. C'est aussi un cas d'école de tout ce que décrit la section 1.

### 20.1. Avant

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

La mesure de l'étape 1 de la migration :

| Quoi | Valeur |
|---|---|
| Lignes Rust (hors tests) | ~78 000 |
| Fichiers qui utilisent `tauri::` | 37 sur 112 |
| Fonctions `#[tauri::command]` | 148, dans 4 fichiers |
| Champs d'`AppState` | 41, dont 14 sont des `Mutex<…>` ou des atomiques |
| `static` porteurs d'état | 12 |
| Endroits qui ouvrent une connexion SQLite en écriture | 9 |
| Fichiers avec `#[cfg(target_os = …)]` | 23 |
| Variantes de `start_recording_*` | 7 |
| Durée des tests du domaine | ils ont besoin d'une fenêtre, donc personne ne les lance |

### 20.2. Les symptômes dans le code

L'état de l'application, abrégé :

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

Un arrêt qui fuit d'un enregistrement à l'autre. L'utilisateur appuie sur Stop, puis démarre vite un nouvel enregistrement. La boucle de l'ancien enregistrement n'a pas encore lu le drapeau ; le nouvel enregistrement ne réinitialise rien ; la vérification suivante de `recording_cancel` arrête le **nouvel** enregistrement :

```rust
static RECORDING_CANCEL: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn stop_recording() {
    RECORDING_CANCEL.store(true, Ordering::SeqCst);
}
```

Le domaine parle directement à la fenêtre, donc il ne se teste pas sans elle :

```rust
pub async fn transcribe(app: AppHandle, file: PathBuf) -> Result<(), String> {
    let mut words = whisper::stream(&file)?;
    while let Some(word) = words.next().await {
        app.emit("transcript-word", &word).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

Les variantes se multiplient :

```rust
pub async fn start_recording(…)
pub async fn start_recording_with_limit(…)
pub async fn start_recording_with_limit_and_device(…)
pub async fn start_recording_for_meeting(…)
pub async fn start_recording_for_meeting_with_limit(…)
pub async fn start_recording_from_companion(…)
pub async fn start_recording_with_test_hook(…)
```

Et le système d'exploitation est partout :

```rust
#[cfg(target_os = "macos")]
fn reveal(path: &Path) {
    let _ = Command::new("sh").arg("-c").arg(format!("open -R '{}'", path.display())).spawn();
}
```

Ce dernier exemple est aussi une injection shell qui n'attend qu'un nom de fichier contenant une apostrophe.

### 20.3. La migration, étape par étape

**Étape 2 : inverser les dépendances.** Le transcripteur cesse de recevoir un `AppHandle`. Il écrit les mots dans un canal borné que possède `core` ; `app` pompe ce canal vers la fenêtre. Le code d'envoi cesse de lire `AppState` et reçoit en arguments les deux valeurs dont il a besoin.

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

**Étape 3 : séparer `app` et `core`.** Un workspace avec `quayside-core` (sans `tauri`) et le `src-tauri` existant dans le rôle d'`app`. `lib.rs` dans l'application garde `pub use quayside_core::{…};`, pour que chaque ancien chemin compile toujours. Preuve : introduire `use tauri::Manager;` dans `core` fait échouer la compilation.

**Étape 4 : `kit`, `store`, `drivers`.** Les neuf ouvertures SQLite se réduisent à un seul écrivain dans `quayside-store`. L'enregistreur, le transcripteur, les clients de modèles et `git` partent dans `quayside-drivers`. Les 23 fichiers avec `#[cfg]` deviennent un seul dossier `platform/` avec `unix.rs`, `macos.rs` et `unsupported.rs`, et `reveal` devient un contrat :

```rust
pub fn reveal_path(path: &Path) -> Result<(), PlatformError> {
    let status = Command::new("/usr/bin/open").arg("-R").arg(path).status()?;
    status.success().then_some(()).ok_or(PlatformError::Refused("open -R"))
}
```

Pas de shell, pas d'échappement, pas d'injection.

**Étape 5 : les slices.** `handlers.rs` et `utils.rs` sont démontés en slices, les plus petites d'abord :

```
settings → device → llm → summary → transcript → board → companion → agent → recording
```

**Étape 6 : `kit::Jobs`.** `transcribing` et `summarizing` (deux tables de jetons d'annulation) deviennent un `Jobs<TranscriptId>` dans le service de transcription et un `Jobs<SummaryId>` dans le service de résumé.

**Étape 7 : les acteurs.** Trois éléments d'état passent le test de 9.1 : l'enregistrement, les exécutions d'agents et la synchronisation du tableau. L'enregistrement passe en premier, avec des tests `update` écrits contre le comportement actuel. L'`AtomicBool` disparaît ; Stop porte désormais la génération de l'enregistrement qu'il vise, et la fuite de 20.2 devient un test d'une ligne qui restera vert pour toujours. Les sept fonctions `start_recording_*` n'en font plus qu'une :

```rust
pub struct StartRecording {
    pub title: String,
    pub device: Option<DeviceId>,
    pub meeting: Option<MeetingId>,
    pub limit: Option<Duration>,
    pub origin: Origin,
}
```

**Étape 8 : les checks.** Chaque check de la section 16 s'active avec sa liste de référence. La plupart des listes sont déjà vides, parce que les étapes précédentes ont supprimé les violations.

### 20.4. Après

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

Une commande après la migration :

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

La même mesure, refaite :

| Quoi | Avant | Après |
|---|---|---|
| Fichiers qui utilisent `tauri::` | 37 | 12, tous dans `src-tauri` |
| Commande la plus longue | 140 lignes | 9 lignes |
| Champs d'`AppState` | 41 | 9 |
| `static` porteurs d'état | 12 | 0 |
| Connexions SQLite en écriture | 9 endroits | 1 |
| Fichiers avec un `#[cfg]` de système d'exploitation | 23 | 3, tous dans `platform/` |
| Variantes de `start_recording_*` | 7 | 1 |
| Tests du domaine | avaient besoin d'une fenêtre | tournent en quelques secondes, sans fenêtre |
| Compile pour Linux et Windows (sauf `app`) | non | oui, vérifié en CI |

Ces chiffres sont illustratifs. C'est la forme du changement qui compte : chaque ligne a bougé dans le sens d'un seul propriétaire, d'un seul endroit et d'une seule règle.

## 21. Liste de contrôle d'adoption et FAQ

### 21.1. Liste de contrôle pour un nouveau projet

- Un workspace avec deux crates : `<product>-core` (sans `tauri`) et la crate `app`.
- `kit::paths` dès le premier jour ; aucun chemin personnel ou temporaire codé en dur.
- `drivers/src/platform/` avec `mod.rs`, `unix.rs`, le fichier de votre plateforme et `unsupported.rs`, dès le premier appel système.
- Chaque fonctionnalité sous forme de slice avec les fichiers fixes ; des commandes de 10 lignes au plus.
- Des événements uniquement depuis `app/<slice>/events.rs`.
- Une seule cible de tests d'intégration, `tests/it/`.
- Les checks de la section 16 en CI dès la première semaine, quand les listes de référence sont encore vides.
- La section SLAT de la partie 18 dans le guide de contribution.

### 21.2. Liste de contrôle pour un projet existant

- La table de mesures versionnée sous forme de plan (19.1, étape 1).
- Des listes de référence créées pour chaque check que vous allez activer.
- Une décision sur ce qui ne doit pas changer, et des façades pour cela.
- Les étapes 2 à 8 planifiées en pull requests séparées, les séparations en crates calées sur des moments où peu de branches sont ouvertes.

### 21.3. Questions

**SLAT est-il réservé à Tauri ?**
Non. Remplacez « commande Tauri » par votre point d'entrée (handler HTTP, sous-commande CLI, consommateur de messages) et gardez tout le reste. Le tier `app` est simplement « la seule crate qui connaît le framework d'entrée ».

**Pourquoi pas une architecture hexagonale avec des ports partout ?**
Des ports sous forme de traits valent le coup quand il existe deux implémentations. La plupart des drivers d'une application de bureau n'en ont qu'une. SLAT garde des types concrets tant qu'une deuxième implémentation n'existe pas, et obtient la testabilité par des fonctions `logic`/`update` pures et des jointures par les données.

**Cinq tiers, n'est-ce pas trop pour une petite application ?**
Commencez avec deux (`core` et `app`). Ajoutez les autres quand leur code existe et qu'il est propre.

**Toutes les slices ont-elles besoin de tous les fichiers ?**
Non. Un fichier inutile n'existe pas. Une petite slice peut tenir dans un seul `mod.rs`.

**Quand une chose est-elle un acteur plutôt qu'un service ?**
Quand les trois conditions de 9.1 sont réunies. En cas de doute, c'est un service. Transformer plus tard un service en acteur est un changement circonscrit à une seule slice.

**Et si deux slices ont besoin l'une de l'autre ?**
La partie commune devient sa propre slice, et les deux en dépendent. Les cycles ne sont jamais autorisés.

**Pourquoi la limite des commandes est-elle de 10 lignes ?**
Parce qu'une commande qui ne fait que traduire n'a pas besoin de son propre test unitaire. Dix lignes suffisent pour désérialiser, appeler et convertir ; elles ne suffisent pas pour cacher une décision.

**SLAT ralentit-il la compilation ?**
Le découpage en crates accélère en général les builds incrémentaux, car un changement dans une slice ne reconstruit ni `kit`, ni `store`, ni `drivers`. Il peut ralentir légèrement un build complet à cause des étapes d'édition de liens supplémentaires ; c'est pourquoi SLAT plafonne le nombre de crates.

**Nous ne livrons que sur macOS. La section 12 vaut-elle le coup dès maintenant ?**
Oui, pour sa partie bon marché : `kit::paths`, des contrats pour les quelques appels système que vous avez déjà, `unsupported.rs`, et le job de compilation sous Linux et Windows. Cela coûte quelques jours maintenant et évite plus tard une fouille de toute la base de code. Les fichiers `linux.rs` et `windows.rs` eux-mêmes attendent que vous décidiez de porter.

**Comment les agents de code s'en sortent-ils avec SLAT ?**
Bien, parce que l'organisation est fixe et que les règles importantes sont des checks, pas des conseils. Voir la section 18.

## 22. Historique des versions

| Version | Date | Changements |
|---|---|---|
| 1.1 | 25 octobre 2026 | Section 12, *Plateformes* : le dossier `platform/` dans `drivers`, les contrats de plateforme, les interdictions hors de `platform/`, les règles sur les chemins, les fichiers et le texte, les tests de plateforme, le job de compilation en CI sous Linux et Windows, la recette de portage. Ajouts aux tiers, à l'application des règles, aux recettes et à l'arbre de décision. |
| 1.0 | 24 octobre 2026 | Première version : tiers, slices aux couches fixes, règles d'import, flux de données, acteurs, l'état de l'application comme racine de composition, erreurs, tests, limites de taille, application des règles, recettes et migration. |

SLAT est versionné comme une bibliothèque. Une nouvelle règle augmente la version mineure quand elle arrive avec une liste de référence : le code actuel reste conforme et seules les nouvelles violations sont rouges. C'est ainsi que la 1.1 a ajouté les règles de plateforme. Un changement qui rend non conforme du code conforme sans liste de référence pour l'absorber, comme renommer les fichiers d'une slice ou inverser une dépendance, augmente la version majeure. Les corrections qui ne changent aucune règle gardent la version. Chaque dépôt qui suit SLAT indique dans son guide de contribution la version qu'il suit.
