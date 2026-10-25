SLAT est un pattern pour organiser le backend d'une application de bureau écrite en Rust, avec Tauri comme couche de fenêtre. Il répond à trois questions sur lesquelles toute base de code qui grandit finit par se tromper : **où va ce fichier**, **qui peut importer qui**, et **comment circulent les données** entre la fenêtre, le domaine et le monde extérieur.

Le nom énumère ses quatre briques : **S**lice, **L**ayer, **A**ctor, **T**ier. Chaque règle de ce document porte sur l'une d'elles.

Cette page est la référence complète. Elle est écrite pour qu'une équipe qui n'a jamais vu SLAT puisse l'adopter dans un nouveau projet ou y migrer un projet existant, sans rien nous demander. Elle contient les règles, leurs raisons, du code à copier, les checks qui les font respecter, et un exemple complet : une application désordonnée remise en ordre étape par étape.

Les numéros de section sont stables. Un dépôt qui suit SLAT garde une copie courte des règles dans `docs/slat/SLAT.md`, avec les mêmes numéros, si bien qu'une référence comme « section 17.8 » désigne la même chose sur cette page et dans le dépôt. Quand les deux divergent, les deux sont corrigés le jour même. Une nouvelle section s'ajoute juste avant l'historique des versions, qui reste toujours en dernier.

> **Version 1.3** · 25 octobre 2026. La version 1.3 ajoute la section 23, *Plugins*, une partie optionnelle pour les produits qui permettent d'activer et de désactiver des fonctionnalités : quand une fonctionnalité est un plugin, l'unique règle sur le sens des imports (une slice de base n'importe jamais une slice de plugin), les points d'extension, un seul build avec un interrupteur au démarrage, et les checks qui gardent tout cela honnête. Un workspace sans plugins n'a besoin d'aucun changement. L'historique complet se trouve en section 24.

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
| **Plugin** | Une fonctionnalité qu'on peut activer ou désactiver : une ou plusieurs slices avec un manifeste (section 23, optionnelle). | Une bibliothèque de fonctionnalité chargée à la demande |
| **Slice de base** (base slice) | Une slice toujours active ; elle n'importe jamais une slice de plugin. | Une bibliothèque shell |
| **Hook** (crochet) | Un point d'extension qu'une slice de base offre et auquel les plugins répondent avec des données. | Un injection token avec `multi: true` |

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

### 5.2. Avec combien de crates commencer

Le minimum est deux : `core` et `app`. Ne séparez les autres tiers que lorsque leur code existe déjà et qu'il est propre, c'est-à-dire qu'il n'importe rien d'un tier supérieur. **Une crate vide « pour plus tard » est interdite.** Elle coûte un passage du compilateur à chaque build, plus ses propres binaires de test à lier à chaque lancement des tests, et n'apporte rien.

### 5.3. Quand diviser un tier

Quand `core` dépasse environ 60 000 lignes, ou quand reconstruire tout `core` après une modification d'une seule slice devient pénible, déplacez un groupe de slices dans `core-<group>`, par exemple `quayside-core-run`. Restez à six à huit crates au maximum. Une crate de bibliothèque ne passe pas par l'édition de liens, mais chaque crate apporte ses propres binaires de test, et chacun d'eux est lié séparément (section 22.1). Sur un portable, une machine figée coûte plus cher que les secondes qu'un découpage plus fin ferait gagner. Décidez sur une mesure, pas sur une impression : `cargo build --timings` montre si `core` est vraiment le goulot d'étranglement (section 22.6).

**Divisez selon le poids de compilation, pas seulement selon les lignes.** Un driver qui enveloppe une grosse bibliothèque native ou d'apprentissage automatique (reconnaissance vocale, moteur d'inférence, base de données compilée depuis des sources C) est souvent plus lourd que Tauri lui-même. Dans `drivers`, il serait compilé et lié dans chaque binaire de test de `core`, parce que `core` dépend de `drivers`. Donnez à un tel driver sa propre crate, `<product>-drivers-<name>`, dont `core` ne dépend pas. `app` en dépend et passe sa sortie à la slice par une jointure par les données (14.2), ou bien le driver tourne comme un processus auxiliaire séparé que `app` démarre. Les tests de `core` ne le compilent alors jamais. `cargo-deny` le garantit : `{ crate = "quayside-drivers-speech", wrappers = ["quayside"] }` dans `deny.toml` (16.5) rend rouge tout autre chemin vers cette crate.

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

Les appelants écrivent `StartRequest { workflow, budget: Some(limit), ..Default::default() }`. Une nouvelle option est un nouveau champ, pas une nouvelle fonction et une nouvelle ligne chez chaque appelant. Les points d'injection réservés aux tests (`faults`, `hooks`) sont des champs qui n'existent que dans un build de test. `cfg(test)` seul ne couvre que les tests unitaires de la crate elle-même ; les tests d'intégration et les autres crates activent donc ces champs avec une feature `test-hooks`, la même idée que le faux driver de 14.2. Activez-la de la même façon dans chaque commande de test (section 22.3) ; sinon, chaque passage d'un build avec la feature à un build sans elle recompile la crate et tout ce qui est au-dessus.

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

Les helpers partagés par les tests sont un module de la même cible, `tests/it/support/`. Un fichier de helpers placé directement dans `tests/` est un binaire de plus à lier.

### 14.2. Un faux driver sans trait

Un test a besoin d'un driver qui ne lance pas de vrais processus. SLAT interdit un trait à une seule implémentation, et un faux ne compte pas comme une deuxième implémentation réelle. Deux options respectent la règle. Préférez la première : une feature change la façon dont `drivers` et chaque crate au-dessus se compilent, si bien qu'un build de test avec elle et un build de l'application sans elle sont deux ensembles d'artefacts séparés (section 22.3). Une jointure par les données ne coûte aucun temps de compilation.

- **Une jointure par les données.** Le service reçoit la *sortie* du driver sous forme de valeur ou de canal, pas le driver lui-même. Le test envoie des lignes dans le canal.
- **Un build de test.** `drivers` expose `#[cfg(any(test, feature = "fake"))] pub mod fake;` avec les mêmes fonctions que le module réel, et la crate de test active la feature `fake`.

Quand une deuxième implémentation réelle apparaît (un deuxième fournisseur, une deuxième plateforme), c'est le moment d'introduire un trait.

### 14.3. Des mutants dans le diff

Un test qui passe ne prouve quelque chose que s'il échouait sur du code faux. C'est la section 16.2 appliquée aux tests. `cargo-mutants` modifie le code (il inverse une condition, remplace une valeur de retour, supprime une instruction) et signale chaque modification qu'aucun test n'a remarquée. Lancez-le sur les lignes qu'une pull request a modifiées, pas sur tout le workspace :

```bash
git diff origin/main...HEAD > changes.diff
cargo mutants --in-diff changes.diff --package quayside-core
```

C'est dans `logic.rs` et `update.rs` que cela rapporte le plus. Ils sont purs, donc leurs tests tournent en quelques microsecondes, et un mutant qui survit là est une règle métier que personne ne vérifie. Un mutant qui survit se corrige avec un test, jamais avec une exclusion.

### 14.4. Des tests de propriétés pour `update`

Un test `update` vérifie un seul scénario de messages. Un test de propriétés vérifie des milliers de scénarios aléatoires contre des règles qui doivent toujours tenir. Avec `proptest`, générez une suite de valeurs `Msg` et vérifiez les invariants de l'état après chaque étape :

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

`messages(n)` est une stratégie du module de test qui construit des valeurs `Msg` aléatoires, et `Msg::generation()` est une petite fonction utilitaire qui renvoie la génération que porte un message. La fuite de la section 20.2 est exactement le genre de bug qu'un tel test trouve tout seul : personne n'a besoin d'imaginer l'ordre des messages qui la provoque.

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
| seule `app` connaît Tauri | `Cargo.toml` (aucune dépendance `tauri` ailleurs) ; `cargo-deny` pour les dépendances transitives (16.5) |
| les tiers ne dépendent que vers le bas | `Cargo.toml` |
| seul `store` ouvre la connexion d'écriture | un check par grep : `Connection::open` uniquement dans la crate `store`. Les fichiers `store.rs` des slices utilisent les types de `rusqlite`, donc la dépendance seule ne suffit pas. |
| `#[tauri::command]` uniquement dans `app/*/commands.rs` | un check par grep |
| chaque commande est enregistrée | un check qui compare les commandes des slices avec `generate_handler!` |
| `emit` uniquement dans `app/*/events.rs` | un check par grep |
| pas d'imports profonds entre slices | un check qui cherche `crate::<a>::<layer>::` depuis une autre slice |
| pas de `static` porteur d'état dans `core` | un check par grep sur `static .*(Mutex|RwLock)` |
| `logic.rs` et `update.rs` ne font pas d'E/S | un check : pas de `async`, `tokio::`, `std::fs`, `store::`, `drivers::` dans `logic.rs`, `logic/` et `update.rs` |
| le `mod.rs` d'une slice ne contient que `mod …;` et `pub use …;` | un check sur chaque `mod.rs` sous `core/src/` |
| pas de cycles entre slices | un check qui construit le graphe des slices à partir des imports et le trie |
| une commande Tauri fait au plus 10 lignes | un check sur `app/*/commands.rs` |
| pas de `unwrap()` ni de `panic!` hors des tests dans `core`, `store`, `drivers` | les lints Clippy `unwrap_used` et `panic` (16.5) |
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

Les checks grep de SLAT cherchent du code interdit, donc une correspondance dans un commentaire les fait passer au rouge, pas au vert. C'est agaçant mais sans danger, et la solution est de supprimer le code mort. Un check qui lit l'arbre syntaxique (16.5) n'a pas ce problème. Le type dangereux est un check qui exige qu'une chaîne soit présente : il passe sur un commentaire. Une règle de ce genre se prouve en exécutant du code, pas en lisant du texte.

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
      - uses: Swatinem/rust-cache@v2
      - run: cargo check --workspace --exclude quayside --all-targets
```

Dans un vrai dépôt, épinglez les versions des actions sur des hashs de commit complets. Le job ne fait que compiler ; il n'exécute aucun test sur les plateformes que le produit ne prend pas encore en charge, il est donc peu coûteux. L'étape de cache le garde peu coûteux : sans elle, chaque pull request compile toutes les dépendances à partir de rien sur deux systèmes d'exploitation.

### 16.4. Les checks au complet

| Check | Règle |
|---|---|
| `checks/slat-commands.sh` | `#[tauri::command]` uniquement dans `src-tauri/src/*/commands.rs` |
| `checks/slat-registered.sh` | chaque commande d'une slice figure dans `generate_handler!` |
| `checks/slat-emit.sh` | `emit` uniquement dans `src-tauri/src/*/events.rs` |
| `checks/slat-deep-imports.sh` | pas de `crate::<slice>::<layer>::` depuis une autre slice |
| `checks/slat-static-state.sh` | pas de `static … Mutex|RwLock` dans `crates/*-core*` |
| `checks/slat-pure.sh` | `logic.rs`, `logic/` et `update.rs` sans `async`, `tokio::`, `std::fs`, `store::`, `drivers::` |
| `checks/slat-slice-mod.sh` | le `mod.rs` d'une slice ne contient que `mod …;` et `pub use …;` |
| `checks/slat-slice-cycles.sh` | pas de cycles entre slices |
| `checks/slat-command-size.sh` | chaque `#[tauri::command]` fait au plus 10 lignes |
| `checks/slat-platform.sh` | les interdictions de 12.3 hors de `platform/` |
| `checks/slat-size.sh` | les fichiers de plus de 1 500 lignes inscrits sur la liste de référence ne peuvent que diminuer |

Le check des cycles n'a besoin d'aucune bibliothèque de graphes. Chaque `use crate::<other>` dans `core/src/<slice>/` est une arête, et `tsort` signale un graphe qui contient une boucle sur sa sortie d'erreur :

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

La même liste d'arêtes est le graphe des slices que la section 22.4 utilise pour trouver les slices qu'un changement peut affecter.

### 16.5. Lints et interdictions avant les scripts

Certaines règles n'ont besoin d'aucun script, parce qu'un outil que le workspace lance déjà peut les faire respecter.

**Clippy, par tier.** Clippy lit d'abord le `clippy.toml` du dossier de la crate, si bien que chaque tier peut interdire des choses différentes. Les lints s'activent dans `Cargo.toml` :

```toml
[workspace.lints.clippy]
unwrap_used = "deny"
panic = "deny"
```

```toml
[lints]
workspace = true
```

Le premier bloc va à la racine du workspace, le second dans `kit`, `store`, `drivers` et `core`. La crate `app` n'en hérite pas. Un `clippy.toml` à la racine du workspace avec `allow-unwrap-in-tests = true` et `allow-panic-in-tests = true` garde les tests lisibles. Un `clippy.toml` dans le dossier d'une crate remplace celui de la racine, il répète donc ces deux lignes. Un `clippy.toml` dans `core` peut lister `disallowed-methods` et `disallowed-types`, par exemple `std::process::Command` et `std::sync::Mutex`, pour qu'un processus lancé depuis une slice ou un verrou dans un acteur soit une erreur de lint, pas une correspondance de grep.

**`cargo-deny`, pour tout le graphe des dépendances.** `Cargo.toml` empêche `use tauri::…` dans `core`, mais pas une bibliothèque qui fait entrer `tauri` par la porte de derrière. Cette fuite est invisible en revue, et elle oblige les tests de `core` à compiler la partie la plus lourde de l'application. `cargo-deny` vérifie tout le graphe. Dans `deny.toml` :

```toml
[bans]
deny = [
  { crate = "tauri", wrappers = ["quayside", "tauri-plugin-shell", "tauri-plugin-dialog"] },
]
```

`tauri` ne peut alors apparaître que comme dépendance directe des crates listées dans `wrappers` : la crate `app` et les plugins Tauri qu'elle utilise, qui dépendent eux-mêmes de `tauri`. Un plugin ajouté à l'application rejoint la liste dans la même pull request. Tout autre chemin vers `tauri`, par exemple une bibliothèque qu'utilise `core`, est rouge.

**La syntaxe plutôt que le texte.** Les checks grep de 16.4 peuvent s'écrire sous forme de règles `ast-grep`. `ast-grep` compare l'arbre syntaxique de Rust, donc un commentaire ou une chaîne ne correspond jamais, et un import réparti sur plusieurs lignes (`use crate::run::{logic::plan, model::Run};`) reste un seul import. Un fichier de règle par check, avec des globs `files` et `ignores` repris des chemins de 16.4, remplace `grep -E`. La liste de référence (16.1) reste telle quelle : les règles produisent la liste des violations, et le même script soustrait la liste de référence.

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
Peut-on le désactiver sans que le reste cesse de marcher ?             → une slice de plugin (section 23)
Est-ce sans aucun domaine (temps, chemins, identifiants, fichiers) ?   → kit
```

## 18. Travailler avec des agents de code

SLAT a été conçu dans une équipe où une grande partie du code est écrite par des agents de code. Les agents suivent une organisation de façon fiable quand elle est écrite, courte et vérifiée par des machines. Trois choses font la différence.

1. **Une organisation fixe est une carte gratuite.** Un agent à qui l'on demande d'« ajouter un filtre aux transcriptions » ouvre `core/transcript/` et `app/transcript/` sans chercher. Le temps qu'un agent passe à chercher est le temps qu'il passe à se tromper.
2. **Un check vaut mieux qu'une phrase dans le prompt.** « N'émets pas depuis core » dans un prompt est respecté la plupart du temps. Un check rouge est respecté à chaque fois. Écrivez d'abord la règle sous forme de check, et sous forme de ligne de prompt seulement si elle ne peut pas être vérifiée.
3. **Les recettes sont des prompts.** La section 17 est volontairement écrite en étapes numérotées : collez la recette dans la tâche, et l'agent produit les fichiers aux endroits attendus, dans l'ordre attendu.

Les agents changent aussi la façon dont un workspace se compile. Plusieurs agents dans plusieurs copies de travail, ce sont plusieurs builds à froid des mêmes dépendances en même temps : c'est le portable figé de la section 19.2. La section 22.5 montre comment chaque copie de travail démarre à chaud sans partager un dossier `target/` avec une autre, et la section 22.4 comment chacun lance uniquement les tests que son changement peut affecter.

Une section à copier dans le guide de contribution de votre dépôt (`AGENTS.md`, `CLAUDE.md` ou équivalent) :

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
| Le temps de compilation augmente avec le nombre de crates | Six à huit crates au maximum. Un seul build lourd à la fois. Mesurez avec `cargo build --timings` avant et après chaque séparation (22.6). |
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
- Les réglages de build de la section 22 : informations de débogage avec `strip = false`, éditeur de liens, un seul ensemble de features, `.taurignore`, un cache de compilation en CI écrit uniquement depuis `main`.
- Les bibliothèques natives lourdes dans une crate de driver dont `core` ne dépend pas (5.3).
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
Le découpage en crates accélère en général les builds incrémentaux, car un changement dans une slice ne reconstruit ni `kit`, ni `store`, ni `drivers`. Il peut ralentir légèrement un build complet à cause des binaires de test supplémentaires à lier ; c'est pourquoi SLAT plafonne le nombre de crates. La section 22 liste les réglages qui comptent plus que le nombre de crates.

**Nous ne livrons que sur macOS. La section 12 vaut-elle le coup dès maintenant ?**
Oui, pour sa partie bon marché : `kit::paths`, des contrats pour les quelques appels système que vous avez déjà, `unsupported.rs`, et le job de compilation sous Linux et Windows. Cela coûte quelques jours maintenant et évite plus tard une fouille de toute la base de code. Les fichiers `linux.rs` et `windows.rs` eux-mêmes attendent que vous décidiez de porter.

**Comment les agents de code s'en sortent-ils avec SLAT ?**
Bien, parce que l'organisation est fixe et que les règles importantes sont des checks, pas des conseils. Voir la section 18.

## 22. Temps de build et de test

*Nouveau dans la version 1.2.*

Le plus gros gain de SLAT vient de la section 5 : seule `app` connaît Tauri, donc les tests de toutes les autres crates ne compilent jamais Tauri ni la web view derrière lui. Le deuxième vient de 5.3 : une bibliothèque native lourde vit dans une crate de driver dont `core` ne dépend pas, donc les tests de `core` ne la compilent jamais non plus. Le reste du temps part dans quelques réglages et habitudes, chacun d'une ligne ou deux de configuration. Cette section les liste dans l'ordre de ce qu'ils font gagner en général, et se termine par ce qui fait repartir un build de zéro alors qu'il ne le devrait pas.

Mesurez d'abord. `cargo build --timings` écrit un rapport HTML du temps de compilation de chaque crate et du nombre de compilations menées en parallèle. Gardez le rapport d'avant un changement et comparez.

### 22.1. Où part le temps

- **Une crate de bibliothèque est compilée, pas liée.** Ce qui passe par l'édition de liens, c'est chaque binaire, et lors d'un lancement des tests, chaque binaire de test.
- **Chaque crate peut avoir trois sortes de binaires de test :** ses tests unitaires, chaque fichier placé directement dans `tests/` (la section 14.1 réduit cela à un seul, `tests/it`), et ses exemples de documentation. Depuis l'édition 2024, les exemples de documentation d'une crate sont compilés en un seul binaire. Une crate sans exemples de documentation met `doctest = false` sous `[lib]`.
- **Un lancement des tests sous `app` n'a jamais besoin de Tauri.** La commande de tous les jours est `cargo nextest run --workspace --exclude quayside`. Seuls les tests de bout en bout de la section 14 compilent la crate `app`.
- **Une bibliothèque native lourde coûte plus cher que Tauri.** Les sources C et C++ compilées par des scripts de build, et les crates d'apprentissage automatique, prennent la plus grande partie d'un build propre et la plus grande partie de l'édition de liens de chaque binaire qui les inclut. La section 5.3 les tient à l'écart des tests de `core`.
- **Les informations de débogage représentent une grande part du temps d'édition de liens.** La plupart ne sont jamais lues.

### 22.2. Réglages de build

Dans le `Cargo.toml` à la racine du workspace :

```toml
[profile.dev]
debug = "line-tables-only"
split-debuginfo = "unpacked"

[profile.dev.package."*"]
debug = false
strip = false
```

Vos propres crates gardent les fichiers et les numéros de ligne dans les backtraces ; les dépendances n'ont aucune information de débogage. Remontez à `debug = true` le temps d'une session quand vous avez besoin d'un débogueur.

`strip = false` n'est pas optionnel sous macOS. Avec `debug = false`, Cargo retire aussi par défaut les symboles de ces unités, et sous macOS 27 le `strip` du système abîme les bibliothèques dynamiques des macros procédurales : `serde_derive` ne peut plus être chargée et un build propre échoue. `split-debuginfo = "unpacked"` est écrit en toutes lettres pour que le lancement de `dsymutil` après chaque édition de liens sous macOS ne dépende pas de la valeur par défaut d'une version donnée de Cargo.

L'éditeur de liens compte surtout pour les binaires de test. Sous Linux pour x86-64, Rust utilise `rust-lld` par défaut depuis la version 1.90. Les autres cibles Linux peuvent utiliser `mold`. Sous macOS, l'éditeur de liens fourni avec Xcode 15 et suivants est déjà rapide, laissez-le tel quel. Sous Windows, `rust-lld` est en général bien plus rapide que l'éditeur de liens par défaut. Dans `.cargo/config.toml` :

```toml
[target.aarch64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]

[target.x86_64-pc-windows-msvc]
linker = "rust-lld.exe"
```

**Optimisez les dépendances dans lesquelles vos tests passent leur temps.** Un build de dev compile chaque dépendance sans optimisation, y compris une base de données chiffrée compilée depuis des sources C, un algorithme de chiffrement ou une fonction de hachage que les tests appellent des millions de fois. N'optimiser que ces paquets rend les tests plus rapides et laisse le build de release inchangé. Dans l'un de nos workspaces, cela a fait passer un lancement des tests de 170 à 102 secondes :

```toml
[profile.dev.package.libsqlite3-sys]
opt-level = 3

[profile.dev.package.sha2]
opt-level = 3
```

Chaque ligne coûte une recompilation de ce paquet. Mesurez le lancement des tests avant et après, et ne gardez que les paquets qui l'ont fait bouger.

Supprimez les dépendances que personne n'utilise : `cargo machete` les liste, et chacune est du temps de compilation pour rien.

### 22.3. Un seul ensemble de features

Cargo compile une dépendance une fois pour chaque ensemble distinct de features qu'on lui demande. Deux choses dans un workspace SLAT demandent des ensembles différents :

1. **Des commandes différentes.** `cargo test --workspace` unifie les features de tous les membres, `cargo test -p quayside-core` seulement celles dont `core` a besoin. Lancer les deux compile `tokio`, `serde` et le reste deux fois. `cargo-hakari` règle cela : il maintient une crate générée `workspace-hack` dont dépend chaque membre, avec l'union de toutes les features, si bien que chaque commande compile les dépendances de la même façon. `cargo hakari generate` la met à jour, et `cargo hakari verify` en CI échoue quand quelqu'un a oublié.
2. **Les features de test de vos propres crates.** La feature `fake` de 14.2 et `test-hooks` de la section 10 modifient `drivers` et `core`, donc chaque crate au-dessus est recompilée quand la feature change. Préférez une jointure par les données (14.2), qui n'a besoin d'aucune feature. Là où une feature est nécessaire, chaque commande de test l'active de la même façon. Mettez cette commande à un seul endroit, dans `.cargo/config.toml` :

```toml
[alias]
t = "nextest run --workspace --exclude quayside --features quayside-drivers/fake --no-tests=fail"
```

Tout le monde, agents et CI compris, lance `cargo t` pour toute la suite, et chaque commande de test plus ciblée est `cargo t` avec un filtre en plus (22.4). Une commande de test avec une autre liste de paquets ou de features, c'est un deuxième build.

### 22.4. Lancer ce qu'un changement peut affecter

L'organisation fixe dit à quelle slice appartient un fichier, et le graphe des slices issu du check des cycles (16.4) dit quelles slices en dépendent. Ensemble, ils donnent à chaque type de changement son propre ensemble de tests :

| Ce qui a changé | Ce qui est lancé |
|---|---|
| `logic.rs`, `model.rs`, `store.rs`, `service.rs` ou `actor/` dans une seule slice, son `mod.rs` inchangé | les tests de cette slice, et `cargo mutants --in-diff` (14.3) |
| le `mod.rs` d'une slice, son API publique | cette slice et chaque slice qui l'importe |
| un module de `tests/it` | ce module |
| `kit`, `store` ou `drivers` | chaque crate qui en dépend : `cargo t -E 'rdeps(quayside-store)'` |
| `drivers/src/platform/` | aussi le test de contrat (12.5) ; en CI, le job de plateforme (16.3) |
| uniquement `app` | les tests de bout en bout à travers le point d'entrée ; rien n'a changé dans `core` |
| `Cargo.toml`, `Cargo.lock`, `.cargo/`, le fichier de toolchain | tout |

Un filtre choisit quels tests sont **lancés**, pas ce qui est **compilé** : nextest compile d'abord chaque paquet que nomment les options de Cargo, puis applique `-E`. C'est pourquoi chaque ligne garde les paquets et les features de `cargo t` et ne réduit qu'avec `-E`. Le build reste celui qui est déjà dans `target/`, et seul le lancement raccourcit. Réduire le build avec `-p` ne fait gagner du temps de compilation que quand `cargo-hakari` (22.3) garde les features identiques ; sans lui, `-p` est un deuxième build des dépendances.

Les tests d'une slice sont faciles à sélectionner, parce que leurs noms commencent par la slice : les tests unitaires vivent dans `core/src/<slice>/`, donc leurs noms commencent par `<slice>::`, et les modules de `tests/it` commencent aussi par la slice (`recording_stops_on_time_limit`). Une première version de la sélection tient dans un court script. Il compare la copie de travail avec le point où la branche a quitté `main`, donc les changements pas encore commités comptent aussi, et c'est ce dont la boucle d'un agent a besoin :

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

Il est volontairement prudent : un changement dans n'importe quel `mod.rs`, dans un fichier au sommet de `core/src/` ou dans les helpers de test partagés lance tout `core` au lieu de suivre le graphe des slices. Remplacez cette étape par le graphe quand la suite de `core` devient lente.

La sélection sert à la vitesse, pas à la preuve. Utilisez trois niveaux :

| Où | Ce qui est lancé |
|---|---|
| sur votre machine et dans la boucle d'un agent | la sélection ci-dessus |
| en CI sur une pull request | chaque crate qui dépend d'une crate modifiée (`rdeps`) |
| sur `main`, ou dans la merge queue | toute la suite |

`--no-tests=fail` (14.1) reste activé à chaque niveau, pour qu'une sélection qui ne correspond à rien soit rouge, pas verte en silence.

### 22.5. Plusieurs copies de travail

Les agents de code travaillent souvent en parallèle, chacun dans sa propre copie de travail. Sans précaution, quatre agents compilent les mêmes dépendances quatre fois au même moment.

**Chaque copie de travail a son propre `target/`.** Ne faites pas pointer plusieurs copies vers un seul dossier, ni avec un lien symbolique, ni avec `CARGO_TARGET_DIR`. Cela ressemble à un cache partagé, mais c'est un bug de correction. Deux copies du même workspace produisent les mêmes noms d'artefacts et les mêmes entrées d'empreinte, donc après `build A; build B; build A`, Cargo peut déclarer la copie A `Fresh` alors que la bibliothèque sur le disque a été compilée à partir des sources de B. Un check juge alors le code de quelqu'un d'autre et annonce vert. En plus, des branches qui diffèrent recompilent les crates l'une de l'autre à chaque changement.

**Démarrez une nouvelle copie à chaud en clonant, pas en partageant.** Quand la copie de travail est créée, copiez le `target/` de la copie principale avec un clone copy-on-write : `cp -c -R` sous macOS (APFS), `cp --reflink=auto -R` sous Btrfs ou XFS. Cela prend quelques secondes et aucun espace disque tant qu'aucun fichier ne change. Les dépendances restent à jour, et Cargo ne recompile que vos propres crates, parce que leurs sources sont plus récentes que ce que le clone a enregistré. Mesurez une fois le premier build dans une nouvelle copie ; il doit être proche d'un build incrémental, pas d'un build propre.

**`sccache` est un complément, pas la réponse.** Définissez-le comme wrapper du compilateur, dans le `~/.cargo/config.toml` de l'utilisateur ou dans l'environnement (`RUSTC_WRAPPER=sccache`), et son cache local est partagé par toutes les copies de travail de la machine. Il met en cache la compilation des dépendances de bibliothèque ordinaires. Il ne met pas en cache les macros procédurales, les binaires, les crates `cdylib` ni vos propres crates, que Cargo compile de façon incrémentale, et il ne met pas en cache l'édition de liens. L'édition de liens des binaires de test est ce que chaque copie de travail paie le plus, et seuls 14.1, 22.2 et le clone ci-dessus la réduisent.

Limitez la part de la machine qu'un build peut prendre avec `CARGO_BUILD_JOBS`, par exemple la moitié des cœurs, pour qu'un deuxième build ralentisse au lieu de figer la machine. La règle de la section 19.2 tient toujours : un seul build lourd à la fois.

### 22.6. CI

- **Un cache dans chaque job Rust**, y compris le job de plateforme de 16.3. `Swatinem/rust-cache` garde les dépendances et le dossier target d'un lancement à l'autre, avec `Cargo.lock` et la toolchain comme clé.
- **Écrire le cache uniquement depuis `main`, le lire partout.** Un lancement de pull request peut lire le cache de sa propre ref et de la branche par défaut, rien d'autre, donc un cache écrit par une pull request n'aide que cette pull request, tandis que la branche par défaut, où toutes les autres pull requests regardent, reste vide. Mettez `save-if: ${{ github.ref == 'refs/heads/main' }}` et lancez aussi le workflow sur `push` vers `main`, pour que chaque merge rafraîchisse le cache et que le premier lancement de chaque pull request démarre à chaud. Dans l'un de nos dépôts, cela a fait passer le premier lancement de 942 à 478 secondes.
- **`CARGO_INCREMENTAL=0`** en CI. Les données incrémentales sont lourdes et inutiles dans un lancement neuf. `Swatinem/rust-cache` le règle pour vous ; avec un autre cache, réglez-le vous-même.
- **Les tests sous `app` sous Linux.** Quand le seul code macOS se trouve dans `drivers/src/platform/` et dans les crates de drivers natifs de 5.3, les tests de `kit`, `store` et `core` n'ont pas besoin de macOS. Lancez-les sur un runner Linux, qui démarre plus vite et coûte moins cher, et gardez le runner macOS pour `drivers`, `app` et le test de contrat.
- **Compiler une fois, tester en parallèle**, quand la suite dure plus de quelques minutes : `cargo nextest archive` compile les binaires de test dans un job, et plusieurs jobs en lancent chacun une part avec `--partition hash:1/3`, `2/3`, `3/3`.
- **Un rapport de timings sur `main`.** `cargo build --timings` comme artefact de chaque build de `main`. Quand la barre de `core` ne cesse de s'allonger après un changement dans une seule slice, c'est la mesure que la section 5.3 demande avant une séparation.
- **`cargo hakari verify`** et **`cargo deny check`** à côté des checks de la section 16. Les deux prennent quelques secondes.

### 22.7. Ce qui fait repartir un build de zéro

Un build qui repart de zéro sans raison visible a presque toujours l'une de ces causes :

- **Un script de build sans `rerun-if-changed`.** Un `build.rs` qui n'affiche aucun `cargo:rerun-if-changed` est relancé après un changement dans n'importe quel fichier de son paquet, et tout ce qui utilise sa sortie est recompilé. Affichez une ligne par entrée. Un script qui compile des programmes auxiliaires (Swift, C) liste leurs sources. Ne listez jamais un chemin qui n'existe pas : Cargo le considère comme modifié à chaque build.
- **`tauri dev` qui surveille sa propre sortie.** Le serveur de développement recompile l'application quand un fichier de `src-tauri/` change. Une base de données, un log ou un fichier généré que l'application écrit là relance le build en boucle. Les données d'exécution vont sous `kit::paths` (12.4) ; les fichiers générés vont dans `.taurignore`.
- **L'éditeur et le terminal dans un seul dossier.** rust-analyzer lance `cargo check` avec ses propres réglages. Dans le même `target/`, l'éditeur et le terminal ou un agent attendent le verrou l'un de l'autre et peuvent invalider le travail l'un de l'autre. Donnez à l'éditeur son propre dossier : `"rust-analyzer.cargo.targetDir": true`.
- **Des environnements différents.** `RUSTFLAGS`, et les variables que lisent les scripts de build (`MACOSX_DEPLOYMENT_TARGET`, `CC`, `CFLAGS`), font partie de ce que Cargo compare. Si le terminal, l'éditeur et le shell d'un agent les règlent différemment, chaque passage de l'un à l'autre recompile. Mettez-les dans `.cargo/config.toml` (`[env]`, `[build] rustflags`), pas dans les profils du shell.
- **Une toolchain qui bouge.** Un nouveau compilateur recompile tout. Fixez la version complète dans `rust-toolchain.toml`, en trois parties (`1.98.1`) : un canal en deux parties prend chaque nouvelle version de correctif sans aucun changement dans le dépôt.

### 22.8. Nettoyer `target/`

Cargo ne supprime jamais les anciens artefacts. Chaque branche, chaque ensemble de features et chaque version de dépendance laisse des fichiers derrière lui, et avec des centaines de milliers de fichiers dans `target/`, chaque commande Cargo ralentit. Dans l'un de nos workspaces, `cargo clean` a supprimé environ 960 000 fichiers (119 GiB). Un build complet de la bibliothèque et de ses tests est passé de 7–8 minutes à 36 secondes, et `cargo clippy --all-targets` de plusieurs minutes à 8 secondes.

Faites-en une règle, pas un sauvetage : quand `target/debug/deps` dépasse quelques dizaines de milliers de fichiers, ou que `target/` dépasse quelques dizaines de gigaoctets, lancez `cargo clean` et acceptez un build à froid. `cargo sweep --time 30` est l'option plus douce : il ne supprime que les artefacts inutilisés depuis 30 jours. Une copie de travail supprimée emporte son `target/` avec elle.

## 23. Plugins

*Nouveau dans la version 1.3. Optionnel.* Un produit qui n'a pas besoin de plugins saute cette section. Aucune autre section n'en dépend, et un workspace sans plugins suit SLAT entièrement.

Un plugin est une fonctionnalité qu'on peut activer ou désactiver pendant que le reste du produit continue de fonctionner de la même façon. Il permet à un produit de rester petit par défaut et de grandir par choix. Dans SLAT, un plugin n'est pas une nouvelle sorte de code. C'est une slice, ou quelques-unes, avec un manifeste et une règle de plus sur le sens des imports. Chaque plugin est compilé dans l'application : en désactiver un veut dire qu'il n'est pas assemblé au démarrage, pas qu'il manque dans le build.

:::diagram plugins

### 23.1. Quand une fonctionnalité est un plugin

Ne faites d'une fonctionnalité un plugin que si **les trois** conditions sont vraies :

1. le produit est utile sans elle ;
2. la désactiver ne fait perdre aucune donnée et ne casse aucune autre fonctionnalité, sauf les plugins qui ont déclaré en avoir besoin ;
3. c'est la personne qui utilise le produit qui décide, pas le build, la plateforme ni le canal de publication.

| Candidat | 1 | 2 | 3 | Verdict |
|---|---|---|---|---|
| synchroniser les actions à mener avec un tableau d'équipe | oui | oui | oui | plugin |
| une application compagnon sur téléphone | oui | oui | oui | plugin |
| l'enregistrement | non, c'est le produit | — | — | slice de base |
| une fonctionnalité que l'équipe teste encore | oui | oui | non, l'équipe décide | un réglage, pas un plugin |
| un menu qui n'existe que sous macOS | — | — | non, la plateforme décide | section 12 |
| un build avec plus de logs | — | — | non, le build décide | un profil Cargo |

Cette section utilise deux termes pour les slices de `core`. Une **slice de base** est toujours active. Une **slice de plugin** appartient à un plugin. Les deux vivent dans le tier `core` : « de base » dit quelque chose du produit, « core » de la crate.

### 23.2. Organisation

Une slice de plugin a l'organisation de la section 6, avec un fichier de plus dans chaque tier :

```tree
core/src/<plugin>/
  plugin.rs     the manifest: id, what it needs, whether it starts on
  hooks.rs      its answers to the hooks of base slices, 23.4
  mod.rs  model.rs  logic.rs  store.rs  service.rs  actor/
app/src/<plugin>/
  mod.rs  commands.rs  dto.rs  events.rs
```

Un plugin à plusieurs slices garde son manifeste dans la slice qui porte son nom, et les autres sont des sous-slices de celle-ci (6.1).

Le manifeste est une constante :

```rust
pub const PLUGIN: Plugin = Plugin {
    id: PluginId("board"),
    needs: &[PluginId("account")],
    on_by_default: false,
};
```

`Plugin`, `PluginId`, le fichier qui retient quels plugins sont actifs, et la décision sur les plugins qui peuvent être actifs ensemble appartiennent à une slice de base, `core/src/plugin/`. Elle a les fichiers habituels et pas de `plugin.rs`, parce qu'elle n'est pas elle-même un plugin. Seule `app` liste tous les manifestes, parce que seule `app` peut connaître toutes les slices. La liste vit dans `app/src/plugins.rs` :

```rust
pub const PLUGINS: &[Plugin] = &[account::PLUGIN, board::PLUGIN, companion::PLUGIN];
```

### 23.3. Direction

La règle qui fait fonctionner les plugins : **une slice de base n'importe jamais une slice de plugin.**

| Depuis | Peut importer |
|---|---|
| une slice de base | d'autres slices de base |
| une slice de plugin | les slices de base ; une autre slice de plugin seulement quand ce plugin figure dans ses `needs` |
| `app` | tout |

Une slice de base ne nomme pas non plus de plugin : pas de `if on.contains("board")`, pas d'identifiant de plugin dans une chaîne. Quand la base a besoin de l'aide d'un plugin, elle offre un point d'extension (23.4) et ne sait pas qui répond. Avec tous les plugins désactivés, la base compile, démarre et passe ses tests (23.8). C'est ce qui rend « désactivé » honnête. Cacher un bouton pendant que la base appelle encore le code du plugin, ce n'est pas désactiver.

`needs` n'a pas de cycles, pour la même raison qu'en 7.2.

### 23.4. Points d'extension

Un plugin atteint la base de trois façons. Préférez-les dans cet ordre.

**1. Écouter.** La base publie déjà ce qui change, par son canal `Snapshot` ou `Event` (8.3). Un plugin s'y abonne dans son propre service ou acteur, et la base ne change pas du tout. Exemple : le plugin de tableau s'abonne aux résumés terminés et transforme leurs actions à mener en cartes.

**2. Répondre à un hook.** Quand la base doit demander quelque chose à un moment de son propre flux (« y a-t-il quelque chose à ajouter à ce résumé ? »), la slice de base déclare un hook dans son `hooks.rs`, et chaque plugin y répond dans son propre `hooks.rs` :

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

Le service de la slice de base reçoit ses hooks quand `app` l'assemble, sous forme de `Vec<Arc<dyn SummaryNotes>>`, et les interroge un par un. Avec le plugin désactivé, la liste est vide et la base fait ce qu'elle faisait avant que les plugins existent.

Trois règles pour les hooks :

- **Un hook répond avec des données, tout de suite, sans E/S.** Il n'est pas `async`. Un plugin qui a besoin du réseau ou d'un processus pour répondre garde la réponse prête dans son propre service ou acteur (ici, le dernier snapshot des cartes), et le hook la lit. La base n'attend jamais un plugin, donc un plugin lent ne peut pas ralentir la base.
- **Un hook ne décide pas à la place de la base.** Il renvoie de la matière, et ce qu'on en fait est une décision dans le `logic.rs` de la slice de base. Un hook qui pourrait refuser quelque chose (un contrôle d'accès, un budget) est une politique, et une politique est une slice de base (6.5) : les plugins y ajoutent des règles sous forme de données, et la slice de base décide.
- **Un trait de hook est le seul trait autorisé avec une seule implémentation.** La section 4 et 14.2 interdisent un trait tant qu'il n'a pas deux implémentations, parce que jusque-là il n'abstrait rien. Un hook est différent : sans lui, la base devrait importer le plugin. Chaque trait de hook se trouve dans un `hooks.rs`, si bien que l'exception est facile à trouver et à vérifier (23.10).

**3. Posséder le point d'entrée.** Les commandes, DTO, événements et portes (`doors/`) du plugin vivent dans `app/src/<plugin>/`, comme ceux de toute autre slice. La base ne les appelle jamais.

### 23.5. Activé et désactivé

- **Un seul build.** Un plugin n'est pas une feature Cargo. Une feature par plugin fait de chaque combinaison de plugins un build distinct avec son propre ensemble de tests (22.3), et la personne qui utilise le produit ne peut pas basculer une feature Cargo.
- **Le choix est un fichier.** La slice `plugin` garde l'ensemble des plugins actifs dans un fichier sous `kit::paths::config()` et le lit une fois au démarrage. Si le fichier manque, chaque plugin prend son `on_by_default`.
- **`app` n'assemble que ce qui est actif.** Un plugin désactivé n'a ni service, ni acteur, ni hook, ni boucle d'événements. Son champ dans `AppState` le dit, sous la même forme que le compte de la section 11 :

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

`on.start` renvoie `Err(PluginOff)` sans appeler la closure quand le plugin est désactivé.

- **Les commandes d'un plugin désactivé restent enregistrées.** `generate_handler!` est fixé à la compilation de l'application, donc la commande existe et répond. `From<PluginOff> for IpcError` (section 13) donne à la fenêtre le code `plugin_off`, et la commande garde une seule ligne de logique : `state.boards.as_ref()?.send(…)`.
- **Un changement prend effet au prochain démarrage**, et la fenêtre le dit en une phrase. Basculer en direct veut dire que le registre des plugins devient un acteur (il passe les trois questions de 9.1) et que chaque liste de hooks peut changer pendant que la base tourne. Ne le faites que si un redémarrage pose un vrai problème.
- **Désactiver ne supprime jamais rien.** Les fichiers du plugin restent où ils sont, ses tables restent dans le schéma, et les migrations de chaque plugin s'exécutent qu'il soit actif ou non, si bien que le schéma est le même pour chaque combinaison. Supprimer les données d'un plugin est une action séparée, demandée explicitement.
- **`needs` est une fonction pure.** `plugin::logic::resolve(manifests, wanted)` renvoie l'ensemble des plugins qui peuvent être actifs, ou la dépendance qui manque. Activer un plugin dont une dépendance est désactivée, ou désactiver un plugin dont un autre a besoin, est refusé avec une phrase qui nomme l'autre plugin. Il faut alors basculer les deux.

### 23.6. Front-end

SLAT ne prescrit pas le front-end (1.2), seulement la frontière, et un plugin la traverse comme toute autre slice. La slice `plugin` a une query, `plugin_list`, qui renvoie chaque manifeste avec son état, et le front-end n'affiche les écrans d'un plugin que s'il est actif. Le dossier front-end d'un plugin porte le nom du plugin, comme en section 6. Un écran d'un plugin désactivé n'est pas rendu du tout ; le rendre puis le cacher par un style, ce n'est pas désactiver.

### 23.7. Un plugin dans sa propre crate

Quand un plugin est lourd à compiler (5.3), ou que vous voulez que le compilateur garde 23.3 à la place d'un check, déplacez-le dans `<product>-plugin-<name>`. Cette crate dépend de `core`, `core` ne dépend pas d'elle, et `app` dépend des deux. La règle de 23.3 est alors écrite dans `Cargo.toml`, comme en 5.1, et `wrappers` dans `deny.toml` (16.5) en tient toutes les autres crates à l'écart. Elle compte parmi les six à huit crates de 5.3 : faites-le pour un plugin lourd, pas pour chaque plugin.

### 23.8. Tests

| Quoi | Comment | Ce qui compte comme preuve |
|---|---|---|
| la base sans plugins | `AppState` assemblée avec tous les plugins désactivés ; les tests de bout en bout de la base | les phrases qu'une personne voit dans la base, inchangées |
| `plugin::logic::resolve` | un simple `#[test]` | l'ensemble des plugins, ou la dépendance qui manque |
| le hook d'un plugin | un simple `#[test]` sur son implémentation, avec une valeur de snapshot | les données renvoyées |
| un flux de la base avec un hook | le service de la base avec un hook écrit dans le module de test | la base a utilisé ce que le hook a renvoyé |
| une commande d'un plugin désactivé | à travers le point d'entrée | la phrase que la fenêtre affiche pour `plugin_off` |

Le hook écrit dans un module de test est la deuxième implémentation du trait de hook, ce qui fait du hook le point d'extension le plus facile à tester.

### 23.9. Transformer une slice existante en plugin

1. **Mesurer.** Prenez les arêtes du check de cycles de 16.4 et listez chaque slice de base qui importe la candidate. Ces arêtes sont la liste de référence du check des plugins (16.1).
2. **Inverser chaque arête**, une pull request à la fois : la base publie et le plugin écoute (le premier choix), ou la base déclare un hook et le plugin y répond. Déplacements et corrections restent dans des pull requests séparées (19.2).
3. **Ajouter le manifeste**, sa ligne dans `PLUGINS` et le champ `Result<…, PluginOff>` dans `AppState`. Mettez `on_by_default: true`, pour que les personnes qui utilisent la fonctionnalité aujourd'hui la gardent.
4. **Le prouver.** Quand la liste de référence est vide, lancez les tests de la base avec tous les plugins désactivés (23.8). Seulement alors le plugin peut être désactivé.

### 23.10. Application des règles

| Règle | Qui la fait respecter |
|---|---|
| une slice de base n'importe jamais une slice de plugin | `checks/slat-plugins.sh`, ci-dessous ; ou `Cargo.toml` pour un plugin dans sa propre crate (23.7) |
| une slice de plugin n'importe un autre plugin que s'il figure dans ses `needs` | le même check, comparé aux `needs` des manifestes |
| pas d'identifiant de plugin dans une slice de base | un check par grep sur `PluginId(` dans les slices de base hors de `core/src/plugin/` |
| un trait dans `core` avec une seule implémentation est un hook dans un `hooks.rs` | une règle `ast-grep` pour les éléments `trait` dans `core` hors de `hooks.rs` (16.5), avec une liste de référence ; chaque trait de la liste a deux implémentations (14.2) |
| chaque manifeste est dans `PLUGINS` | un check qui compare les dossiers ayant un `plugin.rs` avec `app/src/plugins.rs`, comme `slat-registered.sh` |
| la base fonctionne avec tous les plugins désactivés | le test de 23.8, en CI |

Les slices de plugin sont les dossiers qui ont un `plugin.rs`. Le check réutilise les arêtes du check de cycles :

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

Pendant qu'une slice est transformée en plugin (23.9), le check soustrait sa liste de référence, comme en 16.1.

### 23.11. Plugins venus de l'extérieur

Du code écrit par quelqu'un d'autre et chargé pendant que l'application tourne est hors de SLAT. Rust n'a pas d'interface binaire stable, et du code chargé dans le processus peut faire tomber toute l'application avec lui. Une extension venue de l'extérieur tourne dans son propre processus et parle à l'application par un point d'entrée dans `app/src/doors/`, par exemple un serveur MCP, avec les mêmes règles que tout autre point d'entrée. Dans l'application, c'est un point d'entrée, pas un plugin.

## 24. Historique des versions

| Version | Date | Changements |
|---|---|---|
| 1.3 | 25 octobre 2026 | Section 23, *Plugins*, optionnelle : quand une fonctionnalité est un plugin, le manifeste dans `plugin.rs`, des slices de base qui n'importent jamais de slices de plugin, trois points d'extension (écouter, répondre à un hook, posséder le point d'entrée), les hooks comme seul trait autorisé avec une seule implémentation, un seul build avec le choix dans un fichier lu au démarrage, `Result<…, PluginOff>` dans `AppState`, la frontière avec le front-end, un plugin dans sa propre crate, les tests avec tous les plugins désactivés, la transformation d'une slice existante en plugin, `checks/slat-plugins.sh`, et les extensions venues de l'extérieur comme points d'entrée. Vocabulaire : plugin, slice de base, hook. L'arbre de décision (17.8) et la section pour le guide de contribution (18) mentionnent les plugins. L'historique des versions passe de la section 23 à la section 24 ; les sections 1 à 22 gardent leurs numéros. |
| 1.2 | 25 octobre 2026 | Section 22, *Temps de build et de test* : où part le temps de compilation, les réglages de build (y compris `strip = false` et les dépendances de test optimisées), un seul ensemble de features, lancer les tests qu'un changement peut affecter, un `target/` séparé pour chaque copie de travail, démarré depuis un clone copy-on-write, la CI avec un cache écrit uniquement depuis `main`, ce qui fait repartir un build de zéro, et le nettoyage de `target/`. Les drivers natifs lourds dans une crate dont `core` ne dépend pas (5.3). Nouvelles sous-sections 14.3 (des mutants dans le diff), 14.4 (des tests de propriétés pour `update`) et 16.5 (Clippy, `cargo-deny`, `ast-grep`). Des checks pour les règles qui n'en avaient pas : la pureté de `logic.rs`, le `mod.rs` d'une slice, les cycles entre slices, la commande de 10 lignes, `unwrap()` et `panic!`. Les jointures par les données préférées à une feature `fake`. Corrections : le coût d'une crate (5.2, 5.3), `resolver = "3"` pour l'édition 2024 (5.1), l'étape de cache dans le job de plateforme (16.3). L'historique des versions passe de la section 22 à la section 23 ; les sections 1 à 21 gardent leurs numéros. |
| 1.1 | 25 octobre 2026 | Section 12, *Plateformes* : le dossier `platform/` dans `drivers`, les contrats de plateforme, les interdictions hors de `platform/`, les règles sur les chemins, les fichiers et le texte, les tests de plateforme, le job de compilation en CI sous Linux et Windows, la recette de portage. Ajouts aux tiers, à l'application des règles, aux recettes et à l'arbre de décision. |
| 1.0 | 24 octobre 2026 | Première version : tiers, slices aux couches fixes, règles d'import, flux de données, acteurs, l'état de l'application comme racine de composition, erreurs, tests, limites de taille, application des règles, recettes et migration. |

SLAT est versionné comme une bibliothèque. Une nouvelle règle augmente la version mineure quand elle arrive avec une liste de référence : le code actuel reste conforme et seules les nouvelles violations sont rouges. C'est ainsi que la 1.1 a ajouté les règles de plateforme. Un changement qui rend non conforme du code conforme sans liste de référence pour l'absorber, comme renommer les fichiers d'une slice ou inverser une dépendance, augmente la version majeure. Les corrections qui ne changent aucune règle gardent la version. Chaque dépôt qui suit SLAT indique dans son guide de contribution la version qu'il suit.
