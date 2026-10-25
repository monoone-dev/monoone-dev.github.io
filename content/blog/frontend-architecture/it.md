Questa guida descrive come strutturiamo i front-end di grandi dimensioni: un solo workspace, molte applicazioni, molti team e una regola per ogni file. Lo costruiamo con **Nx** e **Angular**, teniamo lo stato condiviso in **NgRx** e mettiamo una **facade opzionale** davanti allo store. Poi mostriamo la stessa architettura, regola per regola, in **React con Next.js** e in **Vue con Nuxt**.

L'architettura non è nostra. Il suo nucleo è stato elaborato e pubblicato da **Manfred Steyer**, formatore e consulente Angular, Google Developer Expert per Angular e la persona dietro [ANGULARarchitects](https://www.angulararchitects.io/). La sua idea è tagliare un front-end **verticalmente per dominio** e **orizzontalmente per tipo di libreria**, far parlare i domini solo attraverso un'API esplicita e far rispettare questi confini da uno strumento, non da una wiki. La sezione 2 elenca con precisione che cosa viene da lui, che cosa viene da Nx e che cosa abbiamo aggiunto noi.

Un esempio piccolo non può mostrare perché tutto questo conta. Un dominio con un solo store sta nella testa di chiunque. Per questo ogni esempio di questa pagina viene da un unico workspace realistico: **Fleetline**, una piattaforma di manutenzione di flotte con tre applicazioni, nove domini, circa settanta librerie e cinque team. Viene presentato nella sezione 5 e usato in tutte le sezioni successive.

> Scritto per i team che hanno già, o avranno presto, più di un'applicazione front-end, più di un team o più di circa 50.000 righe di codice front-end. Sotto questa soglia, leggete prima la sezione 16.4.

## 1. Perché un front-end ha bisogno di un'architettura

Un front-end cresce sempre allo stesso modo. Il primo anno c'è un'applicazione e una cartella `src/app` con `components`, `services` e `store`. Al terzo anno lo stesso progetto di solito ha questo aspetto:

- `shared/` contiene trecento file, e metà di essi è usata da una sola funzionalità;
- un componente di billing importa un selector da maintenance perché era lì;
- lo store radice ha quaranta feature key, e nessuno sa quali servano a una pagina;
- una seconda applicazione nasce copiando la prima, perché estrarre il codice è troppo difficile;
- una modifica a un helper per le date ricompila e ritesta l'intero repository;
- chi entra nel team, persona o agente di coding, impiega giorni a capire dove vive una funzionalità e che cosa può usare.

Niente di tutto questo dipende da ingegneri che lavorano male. Dipende dall'assenza di una risposta condivisa a due domande: **dove va questo file** e **chi può importare chi**. Senza una risposta vince la cartella più vicina, e la cartella più vicina è sempre `shared/`.

L'architettura di questa guida risponde a entrambe le domande una volta per tutte, per ogni tipo di codice front-end, e rende la risposta **meccanica**: una regola di lint rifiuta un import che attraversa un confine, nell'editor e in CI.

### 1.1. Obiettivi

1. **Reperibilità.** Chi conosce il nome di una funzionalità conosce la sua cartella, in ogni applicazione.
2. **Modifiche locali.** Una modifica dentro un dominio non può rompere un altro dominio, perché l'altro dominio non ne vede l'interno.
3. **Feedback rapido anche su larga scala.** La CI compila e testa solo le librerie toccate da una modifica.
4. **Team in parallelo.** Un team possiede domini, non file sparsi in `shared/`.
5. **Stato sostituibile.** Una funzionalità non sa se i suoi dati vengono da NgRx, da un Signal Store, da una cache o dal server.
6. **Un solo regolamento per tre framework.** Le applicazioni Angular, React e Vue della stessa azienda seguono la stessa struttura, e il codice senza framework è condiviso tra loro.

### 1.2. Non-obiettivi

- Non sceglie il vostro back-end, il vostro design system o il vostro CSS.
- Non richiede micro front-end. Tutto qui funziona in un'unica applicazione deployabile; i micro front-end sono una decisione successiva e separata.
- Non sostituisce le regole del vostro prodotto. Dice dove vive il codice e che cosa può usare; il vostro progetto dice che cosa il codice deve fare.

## 2. Da dove viene l'idea

L'architettura combina tre fonti. Le nominiamo perché ognuna merita di essere letta nell'originale.

| Fonte | Che cosa apporta |
|---|---|
| **Nx** (il team Nrwl, *Enterprise Angular Monorepo Patterns*) | Il monorepo stesso, le librerie con un `index.ts` pubblico e i tipi di libreria classici: `feature`, `ui`, `data-access`, `util`. I tag sui progetti e la regola di lint `@nx/enforce-module-boundaries`. |
| **Manfred Steyer** (ANGULARarchitects, l'e-book *Enterprise Angular*, i suoi articoli sul design strategico con Nx) | Il Domain-Driven Design applicato ai front-end: **domini come slice verticali**, **tipi di libreria come livelli orizzontali**, due dimensioni di tag (`domain:*` e `type:*`) controllate da un linter, una **libreria API** come unica porta tra i domini e una **facade** tra la UI e la gestione dello stato. In seguito anche **Sheriff**, un controllore di confini per progetti senza Nx. |
| **NgRx** (e prima Redux) | Un solo store per lo stato condiviso, modifiche tramite action e reducer puri, side effect negli effect, letture tramite selector memoizzati. |

Che cosa abbiamo deciso in più, in questa guida:

- un tipo `model` separato per i tipi senza framework e le funzioni di dominio pure, così le librerie `ui` non dipendono mai dalla gestione dello stato;
- un tipo `shell` a sé (il `feature-shell` di Nx) che possiede le route e i provider di un dominio;
- una terza dimensione di tag, `framework:*`, così applicazioni Angular, React e Vue possono vivere in un solo workspace e condividere codice `model` e `util`;
- una quarta dimensione per Next.js, `platform:server` e `platform:client`;
- la regola della sezione 10 su quando una facade conviene e quando saltarla;
- le traduzioni per React/Next e Vue/Nuxt delle sezioni 12 e 13.

Quando qualcosa in questa pagina non concorda con gli articoli originali, l'originale è il riferimento per l'idea; questa pagina è il riferimento per come la applichiamo.

## 3. L'architettura in una pagina

:::diagram fe-grid

```
apps/<app>/                         thin: bootstrap, root routes, root providers
libs/<domain>/feature-<use-case>/   smart components for one use case (a page or a flow)
libs/<domain>/ui-<name>/            presentational components: inputs in, events out
libs/<domain>/data-access/          state, effects, HTTP, facade
libs/<domain>/model/                types and pure domain functions, no framework
libs/<domain>/util-<name>/          technical helpers for this domain
libs/<domain>/api/                  the only thing other domains may import
libs/<domain>/feature-shell/        the domain's routes and providers
libs/shared/<type>-<name>/          used by every domain, knows none of them
```

Sei frasi da ricordare:

1. **Ogni libreria ha un dominio e un tipo**, scritti come tag, e i tag decidono che cosa può importare.
2. **Gli import scendono lungo la scala dei tipi**: feature → ui, data-access → model → util. Mai verso l'alto, mai di lato tra feature.
3. **Un dominio vede un altro dominio solo attraverso la sua libreria `api`.** Tutto il resto di un dominio è privato.
4. **`shared` non conosce nessun dominio.** Se un file "condiviso" parla di ordini di lavoro, appartiene a maintenance.
5. **I componenti non parlano mai con HTTP.** I dati passano per `data-access`; la feature vede una facade o dei selector, mai un URL.
6. **Le applicazioni sono sottili.** Un'app collega route e provider; le funzionalità vivono nelle librerie, quindi una seconda app non costa nulla.

## 4. Vocabolario

| Termine | Significato |
|---|---|
| **Workspace** | Un repository Nx con tutte le applicazioni e le librerie. |
| **Applicazione** | Un front-end deployabile in `apps/`. Contiene quasi nessun codice. |
| **Libreria** | Una cartella in `libs/` con il proprio `project.json`, i propri tag e un `index.ts` pubblico. Si importa solo tramite il suo path alias, ad esempio `@fleetline/maintenance/data-access`. |
| **Dominio** | Una parte del business con un proprio linguaggio e propri dati: manutenzione, flotta, fatturazione. Detto anche bounded context. Una cartella in `libs/`. |
| **Tipo** | Il ruolo tecnico di una libreria: `feature`, `ui`, `data-access`, `model`, `util`, `api`, `shell`. |
| **API pubblica** | L'`index.ts` di una libreria. Ciò che non esporta non esiste per le altre librerie. |
| **Facade** | Una piccola classe, hook o composable che una feature usa al posto dello store: lo stato come signal o ref, le intenzioni come metodi. |
| **Regola di confine** | Una regola di lint che legge i tag di due librerie e fa fallire un import che i tag non consentono. |

## 5. L'esempio: Fleetline

Fleetline gestisce la manutenzione per aziende che operano con camion, furgoni e autobus. I meccanici lavorano nei depositi; i pianificatori assegnano il lavoro; i clienti prenotano interventi e pagano fatture; amministrazione e supporto gestiscono un back office.

### 5.1. Applicazioni

| Applicazione | Utenti | Framework in questa guida |
|---|---|---|
| `ops-portal` | Pianificatori e meccanici nei depositi | Angular |
| `customer` | Clienti con flotte: prenotazioni, veicoli, fatture | Angular (Next.js nella sezione 12) |
| `backoffice` | Amministrazione, supporto, amministratori di sistema | Angular (Nuxt nella sezione 13) |

### 5.2. Domini e team

| Dominio | Possiede | Team | Usato dalle app |
|---|---|---|---|
| `maintenance` | Ordini di lavoro, checklist, tabellone di pianificazione, SLA | Workshop | ops-portal, backoffice |
| `fleet` | Veicoli, contachilometri, storico degli interventi | Workshop | tutte e tre |
| `inventory` | Ricambi, giacenze per deposito, prenotazioni di ricambi | Supply | ops-portal, backoffice |
| `booking` | Slot di intervento, flusso di prenotazione, riprogrammazione | Customer | customer, ops-portal |
| `billing` | Preventivi, fatture, pagamenti | Finance | customer, backoffice |
| `customers` | Account, contratti, contatti | Customer | customer, backoffice |
| `identity` | Accesso, ruoli, permessi | Platform | tutte e tre |
| `notifications` | Inbox nell'app, preferenze e-mail | Platform | tutte e tre |
| `shared` | Design system, layout, configurazione HTTP, date, importi, test | Platform | tutte e tre |

Cinque team, circa trentacinque ingegneri front-end, circa 280.000 righe di TypeScript. `CODEOWNERS` associa ogni cartella `libs/<domain>/` al suo team, quindi una pull request in maintenance chiede la review al team Workshop e a nessun altro.

### 5.3. Il workspace

```text
fleetline/
├── apps/
│   ├── ops-portal/
│   ├── customer/
│   └── backoffice/
└── libs/
    ├── maintenance/
    │   ├── api/
    │   ├── feature-shell/
    │   ├── feature-work-orders/
    │   ├── feature-work-order-detail/
    │   ├── feature-planning-board/
    │   ├── feature-checklist-editor/
    │   ├── ui-work-order-card/
    │   ├── ui-checklist/
    │   ├── ui-planning-grid/
    │   ├── data-access/
    │   ├── model/
    │   └── util-sla/
    ├── fleet/
    │   ├── api/
    │   ├── feature-shell/
    │   ├── feature-vehicle-list/
    │   ├── feature-vehicle-detail/
    │   ├── ui-vehicle-badge/
    │   ├── ui-odometer-chart/
    │   ├── data-access/
    │   └── model/
    ├── inventory/
    ├── booking/
    ├── billing/
    ├── customers/
    ├── identity/
    ├── notifications/
    └── shared/
        ├── ui-design-system/
        ├── ui-layout/
        ├── data-access-http/
        ├── util-date/
        ├── util-money/
        └── util-testing/
```

Solo maintenance ha dodici librerie. È normale: una `feature-*` per caso d'uso, una `ui-*` per ogni gruppo coeso di componenti, una `data-access` e un `model` per dominio finché non diventano troppo grandi (sezione 16.3).

### 5.4. Un caso d'uso attraverso i livelli

Il resto della guida segue un solo caso d'uso: **un pianificatore apre gli ordini di lavoro di un deposito, li filtra e assegna un meccanico**. Tocca quattro librerie di maintenance e una di fleet:

| Libreria | Che cosa apporta |
|---|---|
| `maintenance/feature-work-orders` | La pagina: legge la facade, mostra le card, inoltra i clic |
| `maintenance/ui-work-order-card` | La card e il filtro per stato, niente stato, niente HTTP |
| `maintenance/data-access` | Feature NgRx, effect, client HTTP, facade |
| `maintenance/model` | `WorkOrder`, `WorkOrderFilter`, `matchesFilter`, `isOverdue` |
| `fleet/api` | `VehicleSummaryStore`: targa e modello per un id di veicolo |

## 6. Tipi di libreria

Ogni tipo risponde a una domanda. Se un file risponde a due, sono due file.

| Tipo | Domanda a cui risponde | Contiene | Non deve contenere |
|---|---|---|---|
| `feature` | Che cosa fa questo caso d'uso? | Pagine con route, componenti smart, collegamento tra facade e ui | Chiamate HTTP, componenti visivi riutilizzabili |
| `ui` | Che aspetto ha? | Componenti di presentazione, pipe, direttive | Store iniettati, servizi con stato, HTTP |
| `data-access` | Da dove vengono i dati e come cambiano? | Store, effect, client API, facade, provider | Componenti |
| `model` | Quali sono i termini e le regole del dominio? | Tipi, enum, funzioni pure come `isOverdue` | Import di framework di qualsiasi tipo |
| `util` | Di quali helper tecnici ha bisogno? | Formattazione, parsing, piccoli algoritmi | Termini di dominio, stato di framework |
| `api` | Che cosa possono usare gli altri domini? | Re-export di un sottoinsieme scelto del dominio | Logica propria |
| `shell` | Come viene montato questo dominio? | Route, provider a livello di route, guard | Logica di business |

### 6.1. Chi può importare chi

| Da ↓ può importare → | shell | feature | ui | data-access | model | util | api di un altro dominio |
|---|---|---|---|---|---|---|---|
| **app** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **shell** | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **feature** | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| **api** | – | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **ui** | – | – | ✓ | – | ✓ | ✓ | – |
| **data-access** | – | – | – | ✓ | ✓ | ✓ | – |
| **model** | – | – | – | – | ✓ | ✓ | – |
| **util** | – | – | – | – | – | ✓ | – |

Tre righe di questa tabella portano la maggior parte del valore:

- **feature → feature è vietato.** Due pagine che hanno bisogno della stessa cosa la condividono tramite `ui` o `data-access`. Le pagine sono composte dalla shell o dal router, non importandosi a vicenda.
- **ui → data-access è vietato.** Un componente che inietta uno store non è di presentazione. Per questa regola il tipo `WorkOrder` vive in `model`, non in `data-access`.
- **model non importa nessun framework.** `model` e `util` compilano allo stesso modo in Angular, React, Vue e Node. In un workspace misto sono il codice che si condivide (sezione 8.3).

### 6.2. Quanto è grande una libreria

- **feature:** un caso d'uso, di solito una route e le sue figlie. `feature-work-orders`, non `feature-maintenance`.
- **ui:** un gruppo coeso che cambia insieme. `ui-work-order-card` contiene la card, il chip di stato e il filtro per stato.
- **data-access:** una per dominio, all'inizio. Si divide per sottodominio quando contiene più di tre o quattro feature dello store o quando il team si divide (`data-access-planning`, `data-access-work-orders`).
- **model:** uno per dominio. È piccolo per natura.
- Se una libreria ha un solo file, probabilmente è troppo piccola; se il suo `index.ts` esporta più di una trentina di simboli, probabilmente è troppo grande.

## 7. Domini e confini

Un dominio è una cartella con una porta esplicita. Dentro la cartella valgono le regole sui tipi della sezione 6. Tra cartelle vale una sola regola: **si può importare la libreria `api` di un altro dominio, e nient'altro.**

### 7.1. La libreria API

`fleet/api` decide che cosa fleet offre al resto dell'azienda. Tutto ciò che non è elencato è privato del team Workshop e può cambiare senza chiedere a nessuno.

`libs/fleet/api/src/index.ts`

```ts
export type { VehicleSummary, VehicleId } from '@fleetline/fleet/model';
export { VehicleSummaryStore } from '@fleetline/fleet/data-access';
export { VehicleBadgeComponent } from '@fleetline/fleet/ui-vehicle-badge';
```

Lo store che esporta è un NgRx Signal Store, mentre maintenance usa il classico NgRx Store. Maintenance non ha bisogno di saperlo; vede solo `VehicleSummaryStore`.

`libs/fleet/data-access/src/lib/vehicle-summary.store.ts`

```ts
import { inject } from '@angular/core';
import { patchState, signalStore, withMethods } from '@ngrx/signals';
import { upsertEntities, withEntities } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { tapResponse } from '@ngrx/operators';
import { filter, map, mergeMap, pipe } from 'rxjs';
import type { VehicleSummary } from '@fleetline/fleet/model';
import { FleetApi } from './fleet.api';

export const VehicleSummaryStore = signalStore(
  { providedIn: 'root' },
  withEntities<VehicleSummary>(),
  withMethods((store, api = inject(FleetApi)) => ({
    ensureLoaded: rxMethod<readonly string[]>(
      pipe(
        map((ids) => [...new Set(ids)].filter((id) => !store.entityMap()[id])),
        filter((ids) => ids.length > 0),
        mergeMap((ids) =>
          api.summaries(ids).pipe(
            tapResponse({
              next: (vehicles) => patchState(store, upsertEntities(vehicles)),
              error: (error: unknown) => console.error('fleet summaries', error),
            }),
          ),
        ),
      ),
    ),
  })),
);
```

### 7.2. Anche shared è un dominio

`shared` ha il tag `domain:shared` e può importare solo `domain:shared`. Non conosce nessun termine di business. Una regola pratica per le review: se un file in `shared` contiene la parola di un dominio (ordine di lavoro, fattura, veicolo), si sposta in quel dominio.

### 7.3. Quando due domini hanno bisogno della stessa cosa

| Situazione | Risposta |
|---|---|
| Billing mostra la targa di un veicolo | Billing importa `fleet/api`. |
| Maintenance e inventory hanno bisogno entrambi dell'elenco dei depositi | I depositi sono un concetto a sé: un piccolo dominio `depots`, oppure `fleet` li esporta nella sua API. Non `shared`. |
| Booking deve aprire un ordine di lavoro dopo una prenotazione | Booking chiama il back-end; il back-end crea l'ordine di lavoro. I domini front-end non orchestrano le scritture l'uno dell'altro. |
| Due domini hanno bisogno dello stesso date picker | È una questione tecnica, non di business: `shared/ui-design-system`. |
| Due librerie API vogliono importarsi a vicenda | I domini sono tagliati male. Uniteli o spostate il concetto condiviso in un terzo dominio. |

## 8. Far rispettare le regole

Una regola che non viene controllata è un suggerimento. Nx la controlla con i tag e una sola regola di lint.

### 8.1. Tag

Ogni `project.json` riceve un tag `domain:*` e un tag `type:*`, e in un workspace misto un tag `framework:*`.

`libs/maintenance/data-access/project.json`

```json
{
  "name": "maintenance-data-access",
  "sourceRoot": "libs/maintenance/data-access/src",
  "projectType": "library",
  "tags": ["domain:maintenance", "type:data-access", "framework:angular"]
}
```

`libs/maintenance/model/project.json`

```json
{
  "name": "maintenance-model",
  "sourceRoot": "libs/maintenance/model/src",
  "projectType": "library",
  "tags": ["domain:maintenance", "type:model", "framework:agnostic"]
}
```

I generatori impostano i tag quando la libreria viene creata:

```bash
nx g @nx/angular:library --directory=libs/maintenance/feature-planning-board \
  --tags=domain:maintenance,type:feature,framework:angular
nx g @nx/js:library --directory=libs/maintenance/model \
  --tags=domain:maintenance,type:model,framework:agnostic --bundler=none
```

### 8.2. La regola di lint

`eslint.config.mjs`

```js
import nx from '@nx/eslint-plugin';

const domains = [
  'maintenance', 'fleet', 'inventory', 'booking',
  'billing', 'customers', 'identity', 'notifications',
];

const types = {
  app: ['shell', 'feature', 'ui', 'data-access', 'model', 'util'],
  shell: ['feature', 'ui', 'data-access', 'model', 'util', 'api'],
  feature: ['ui', 'data-access', 'model', 'util', 'api'],
  api: ['feature', 'ui', 'data-access', 'model', 'util'],
  ui: ['ui', 'model', 'util'],
  'data-access': ['data-access', 'model', 'util'],
  model: ['model', 'util'],
  util: ['util'],
};

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.vue'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          banTransitiveDependencies: true,
          depConstraints: [
            ...Object.entries(types).map(([type, allowed]) => ({
              sourceTag: `type:${type}`,
              onlyDependOnLibsWithTags: allowed.map((t) => `type:${t}`),
            })),
            { sourceTag: 'domain:shared', onlyDependOnLibsWithTags: ['domain:shared'] },
            ...domains.map((domain) => ({
              sourceTag: `domain:${domain}`,
              onlyDependOnLibsWithTags: [`domain:${domain}`, 'domain:shared', 'type:api'],
            })),
            { sourceTag: 'framework:agnostic', onlyDependOnLibsWithTags: ['framework:agnostic'] },
            { sourceTag: 'framework:angular', onlyDependOnLibsWithTags: ['framework:angular', 'framework:agnostic'] },
            { sourceTag: 'framework:react', onlyDependOnLibsWithTags: ['framework:react', 'framework:agnostic'] },
            { sourceTag: 'framework:vue', onlyDependOnLibsWithTags: ['framework:vue', 'framework:agnostic'] },
            { sourceTag: 'platform:client', notDependOnLibsWithTags: ['platform:server'] },
          ],
        },
      ],
    },
  },
];
```

Come si combinano le dimensioni: un import deve soddisfare **tutti** i vincoli di tutti i tag della libreria che importa. Una feature di maintenance può importare `fleet/api` perché la sua regola di tipo consente `type:api` e la sua regola di dominio consente `type:api`. Non può importare `fleet/data-access`: la regola di tipo consentirebbe `data-access`, ma la regola di dominio non consente `domain:fleet`. Nemmeno una libreria `ui` di maintenance può importare `fleet/api`: la regola di dominio lo consentirebbe, ma la regola di tipo no.

La stessa regola rifiuta anche gli import relativi verso un'altra libreria, gli import dell'interno di una libreria al posto del suo `index.ts` e le dipendenze circolari tra librerie.

### 8.3. La dimensione framework

L'applicazione `customer` di Fleetline potrebbe passare a Next.js e `backoffice` a Nuxt senza spostare una sola libreria `model` o `util`. Queste hanno il tag `framework:agnostic` e possono importare solo altro codice agnostico, quindi `matchesFilter` e `isOverdue` sono la stessa funzione in tutte e tre le app. Una libreria React che prova a importare una libreria `ui` Angular fallisce il lint.

### 8.4. Senza Nx: Sheriff

Non tutti i team usano Nx. **Sheriff**, dello stesso team di ANGULARarchitects, applica le stesse regole sui tag dentro un singolo progetto TypeScript, per cartella invece che per libreria. È adatto a un'applicazione Next.js o Nuxt che vuole i confini prima ancora di volere un monorepo.

`sheriff.config.ts`

```ts
import { sameTag, type SheriffConfig } from '@softarc/sheriff-core';

export const config: SheriffConfig = {
  modules: {
    'src/domains/<domain>': {
      'feature-<name>': ['domain:<domain>', 'type:feature'],
      'ui-<name>': ['domain:<domain>', 'type:ui'],
      'data-access': ['domain:<domain>', 'type:data-access'],
      model: ['domain:<domain>', 'type:model'],
      api: ['domain:<domain>', 'type:api'],
    },
    'src/shared/ui-<name>': ['domain:shared', 'type:ui'],
    'src/shared/util-<name>': ['domain:shared', 'type:util'],
  },
  depRules: {
    root: ['type:feature', 'type:ui', 'type:data-access', 'type:model', 'type:util', 'domain:shared'],
    'domain:*': [sameTag, 'domain:shared', 'type:api'],
    'type:feature': ['type:ui', 'type:data-access', 'type:model', 'type:util', 'type:api'],
    'type:api': ['type:feature', 'type:ui', 'type:data-access', 'type:model', 'type:util'],
    'type:ui': ['type:ui', 'type:model', 'type:util'],
    'type:data-access': ['type:data-access', 'type:model', 'type:util'],
    'type:model': ['type:model', 'type:util'],
    'type:util': ['type:util'],
  },
};
```

### 8.5. In CI

```bash
nx affected -t lint typecheck test build --base=origin/main
nx graph --affected
```

Poiché il grafo delle dipendenze è esplicito, una modifica in `maintenance/ui-checklist` esegue lint, test e build delle librerie e delle applicazioni che ne dipendono, e di nient'altro. In Fleetline una pull request tipica tocca un dominio ed esegue un quinto del workspace. Con il remote caching, una libreria invariata non viene mai ricompilata su nessuna macchina.

## 9. Lo stato con NgRx

`maintenance/data-access` contiene tutto ciò che riguarda da dove vengono gli ordini di lavoro e come cambiano. Questa sezione la mostra per intero. Ogni file ha un solo compito.

```text
libs/maintenance/data-access/src/
├── index.ts
└── lib/
    ├── work-orders.api.ts
    ├── work-orders.events.ts
    ├── work-orders.feature.ts
    ├── work-orders.effects.ts
    ├── work-orders.facade.ts
    └── work-orders.providers.ts
```

### 9.1. Il model

Il model è senza framework e vive in una libreria propria, così possono usarlo le librerie `ui`, i test e le versioni React e Vue.

`libs/maintenance/model/src/lib/work-order.ts`

```ts
export type WorkOrderStatus = 'open' | 'scheduled' | 'in-progress' | 'waiting-parts' | 'done';
export type WorkOrderPriority = 'low' | 'normal' | 'urgent';

export interface WorkOrder {
  id: string;
  vehicleId: string;
  depotId: string;
  title: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  dueAt: string;
  assigneeId: string | null;
}

export interface WorkOrderFilter {
  depotId: string;
  status: WorkOrderStatus | 'all';
  query: string;
}

export const emptyFilter: WorkOrderFilter = { depotId: '', status: 'all', query: '' };

export function matchesFilter(order: WorkOrder, filter: WorkOrderFilter): boolean {
  const query = filter.query.trim().toLowerCase();
  return (
    (filter.status === 'all' || order.status === filter.status) &&
    (query === '' || order.title.toLowerCase().includes(query))
  );
}

export function isOverdue(order: WorkOrder, now: Date): boolean {
  return order.status !== 'done' && new Date(order.dueAt).getTime() < now.getTime();
}

export function byDueDate(a: WorkOrder, b: WorkOrder): number {
  return a.dueAt.localeCompare(b.dueAt);
}
```

### 9.2. Eventi

Le action prendono il nome da **ciò che è successo**, raggruppate per **dove è successo**. La pagina riporta eventi; non emette comandi come `loadWorkOrders`.

`libs/maintenance/data-access/src/lib/work-orders.events.ts`

```ts
import { createActionGroup, props } from '@ngrx/store';
import type { WorkOrder, WorkOrderFilter } from '@fleetline/maintenance/model';

export const workOrdersPage = createActionGroup({
  source: 'Work Orders Page',
  events: {
    opened: props<{ depotId: string }>(),
    filterChanged: props<{ filter: Partial<Omit<WorkOrderFilter, 'depotId'>> }>(),
    assigneeChosen: props<{ id: string; assigneeId: string; previousAssigneeId: string | null }>(),
  },
});

export const workOrdersApi = createActionGroup({
  source: 'Work Orders API',
  events: {
    loadSucceeded: props<{ workOrders: WorkOrder[] }>(),
    loadFailed: props<{ error: string }>(),
    assignSucceeded: props<{ workOrder: WorkOrder }>(),
    assignFailed: props<{ id: string; previousAssigneeId: string | null; error: string }>(),
  },
});
```

### 9.3. La feature: stato, reducer, selector

`libs/maintenance/data-access/src/lib/work-orders.feature.ts`

```ts
import { createEntityAdapter, type EntityState } from '@ngrx/entity';
import { createFeature, createReducer, createSelector, on } from '@ngrx/store';
import {
  byDueDate, emptyFilter, isOverdue, matchesFilter,
  type WorkOrder, type WorkOrderFilter,
} from '@fleetline/maintenance/model';
import { workOrdersApi, workOrdersPage } from './work-orders.events';

interface WorkOrdersState extends EntityState<WorkOrder> {
  filter: WorkOrderFilter;
  loading: boolean;
  error: string | null;
}

const adapter = createEntityAdapter<WorkOrder>({ sortComparer: byDueDate });

const initialState: WorkOrdersState = adapter.getInitialState({
  filter: emptyFilter,
  loading: false,
  error: null,
});

export const workOrdersFeature = createFeature({
  name: 'workOrders',
  reducer: createReducer(
    initialState,
    on(workOrdersPage.opened, (state, { depotId }) => ({
      ...adapter.removeAll(state),
      filter: { ...emptyFilter, depotId },
      loading: true,
      error: null,
    })),
    on(workOrdersPage.filterChanged, (state, { filter }) => ({
      ...state,
      filter: { ...state.filter, ...filter },
    })),
    on(workOrdersPage.assigneeChosen, (state, { id, assigneeId }) =>
      adapter.updateOne({ id, changes: { assigneeId } }, state),
    ),
    on(workOrdersApi.loadSucceeded, (state, { workOrders }) =>
      adapter.setAll(workOrders, { ...state, loading: false }),
    ),
    on(workOrdersApi.loadFailed, (state, { error }) => ({ ...state, loading: false, error })),
    on(workOrdersApi.assignSucceeded, (state, { workOrder }) => adapter.upsertOne(workOrder, state)),
    on(workOrdersApi.assignFailed, (state, { id, previousAssigneeId, error }) =>
      adapter.updateOne({ id, changes: { assigneeId: previousAssigneeId } }, { ...state, error }),
    ),
  ),
  extraSelectors: ({ selectWorkOrdersState, selectFilter }) => {
    const { selectAll } = adapter.getSelectors(selectWorkOrdersState);
    const selectVisible = createSelector(selectAll, selectFilter, (orders, filter) =>
      orders.filter((order) => matchesFilter(order, filter)),
    );
    const selectOverdueCount = createSelector(
      selectAll,
      (orders) => orders.filter((order) => isOverdue(order, new Date())).length,
    );
    return { selectAll, selectVisible, selectOverdueCount };
  },
});
```

L'assegnazione è **ottimistica**: il reducer applica subito `assigneeChosen`, e `assignFailed` rimette il meccanico precedente. Il valore precedente viaggia nell'evento, perché quando l'effect viene eseguito lo stato contiene già quello nuovo.

### 9.4. HTTP ed effect

`libs/maintenance/data-access/src/lib/work-orders.api.ts`

```ts
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from '@fleetline/shared/data-access-http';
import type { WorkOrder } from '@fleetline/maintenance/model';

@Injectable({ providedIn: 'root' })
export class WorkOrdersHttp {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(depotId: string) {
    return this.http.get<WorkOrder[]>(`${this.baseUrl}/depots/${depotId}/work-orders`);
  }

  assign(id: string, assigneeId: string) {
    return this.http.put<WorkOrder>(`${this.baseUrl}/work-orders/${id}/assignee`, { assigneeId });
  }
}
```

`libs/maintenance/data-access/src/lib/work-orders.effects.ts`

```ts
import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, mergeMap, of, switchMap } from 'rxjs';
import { toErrorMessage } from '@fleetline/shared/data-access-http';
import { WorkOrdersHttp } from './work-orders.api';
import { workOrdersApi, workOrdersPage } from './work-orders.events';

export const loadWorkOrders = createEffect(
  (actions$ = inject(Actions), http = inject(WorkOrdersHttp)) =>
    actions$.pipe(
      ofType(workOrdersPage.opened),
      switchMap(({ depotId }) =>
        http.list(depotId).pipe(
          map((workOrders) => workOrdersApi.loadSucceeded({ workOrders })),
          catchError((error: unknown) => of(workOrdersApi.loadFailed({ error: toErrorMessage(error) }))),
        ),
      ),
    ),
  { functional: true },
);

export const assignWorkOrder = createEffect(
  (actions$ = inject(Actions), http = inject(WorkOrdersHttp)) =>
    actions$.pipe(
      ofType(workOrdersPage.assigneeChosen),
      mergeMap(({ id, assigneeId, previousAssigneeId }) =>
        http.assign(id, assigneeId).pipe(
          map((workOrder) => workOrdersApi.assignSucceeded({ workOrder })),
          catchError((error: unknown) =>
            of(workOrdersApi.assignFailed({ id, previousAssigneeId, error: toErrorMessage(error) })),
          ),
        ),
      ),
    ),
  { functional: true },
);
```

`switchMap` per il caricamento (un deposito più recente annulla la richiesta più vecchia), `mergeMap` per le assegnazioni (due assegnazioni su due card devono concludersi entrambe).

### 9.5. Provider

La feature dello store è registrata sulla route del dominio, non nella radice dell'applicazione. Lo store radice resta vuoto finché un pianificatore non apre maintenance, e il relativo codice viene caricato in lazy loading insieme alla route.

`libs/maintenance/data-access/src/lib/work-orders.providers.ts`

```ts
import { makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';
import * as workOrderEffects from './work-orders.effects';
import { workOrdersFeature } from './work-orders.feature';
import { WorkOrdersFacade } from './work-orders.facade';

export function provideWorkOrders(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideState(workOrdersFeature),
    provideEffects(workOrderEffects),
    WorkOrdersFacade,
  ]);
}
```

### 9.6. L'API pubblica di data-access

`libs/maintenance/data-access/src/index.ts`

```ts
export { provideWorkOrders } from './lib/work-orders.providers';
export { WorkOrdersFacade } from './lib/work-orders.facade';
```

Due export. Action, reducer, selector e client HTTP sono privati. Ogni feature di maintenance passa per la facade, e il team Workshop può ristrutturare lo store senza toccare un solo componente.

## 10. La facade, e quando farne a meno

:::diagram fe-flow

Una facade è un oggetto sottile tra le feature e la gestione dello stato. Espone **stato** (signal in Angular, valori in React, ref in Vue) e **intenzioni** (metodi). Non contiene logica: ogni metodo esegue il dispatch di esattamente un evento, e ogni proprietà è esattamente un selector.

`libs/maintenance/data-access/src/lib/work-orders.facade.ts`

```ts
import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import type { WorkOrder, WorkOrderFilter } from '@fleetline/maintenance/model';
import { workOrdersPage } from './work-orders.events';
import { workOrdersFeature } from './work-orders.feature';

@Injectable()
export class WorkOrdersFacade {
  private readonly store = inject(Store);

  readonly visible = this.store.selectSignal(workOrdersFeature.selectVisible);
  readonly overdueCount = this.store.selectSignal(workOrdersFeature.selectOverdueCount);
  readonly filter = this.store.selectSignal(workOrdersFeature.selectFilter);
  readonly loading = this.store.selectSignal(workOrdersFeature.selectLoading);
  readonly error = this.store.selectSignal(workOrdersFeature.selectError);

  open(depotId: string): void {
    this.store.dispatch(workOrdersPage.opened({ depotId }));
  }

  filterBy(filter: Partial<Omit<WorkOrderFilter, 'depotId'>>): void {
    this.store.dispatch(workOrdersPage.filterChanged({ filter }));
  }

  assign(order: WorkOrder, assigneeId: string): void {
    this.store.dispatch(
      workOrdersPage.assigneeChosen({ id: order.id, assigneeId, previousAssigneeId: order.assigneeId }),
    );
  }
}
```

La facade è fornita da `provideWorkOrders()`, non in `root`, quindi esiste esattamente dove esiste la sua feature dello store.

### 10.1. Perché una facade

- **Stato sostituibile.** Il giorno in cui gli ordini di lavoro passano dal NgRx Store a un Signal Store o a una cache del server, cambia la facade e nessun componente. Fleetline ha fatto esattamente questo per `fleet` (sezione 7.1).
- **Una superficie piccola.** Una feature vede sei membri invece di quattordici action e nove selector.
- **Test semplici.** Un test di feature fornisce un oggetto finto con la stessa forma (sezione 15).
- **La stessa forma in ogni framework.** Qui la classe, `useWorkOrders()` in React e Vue: il codice delle feature si legge quasi allo stesso modo in tutti e tre (sezione 14).

### 10.2. Perché la facade è opzionale

La community di NgRx ha un buon argomento contro le facade: le action dovrebbero descrivere eventi (*"meccanico scelto nella pagina degli ordini di lavoro"*), e una facade con un metodo `assign()` invita a pensare per comandi. Una facade che esegue il dispatch di tre action di fila, o che contiene logica, nasconde il log degli eventi che rende NgRx facile da debuggare.

Per questo nella nostra variante la facade è una regola con condizioni:

| Usate una facade quando | Fatene a meno quando |
|---|---|
| più di una feature usa lo stesso stato | una feature possiede una piccola feature dello store |
| lo stato può cambiare implementazione (Store ↔ Signal Store ↔ cache del server) | lo stato è locale a un componente: usate un Signal Store o semplici signal nel componente |
| i dati sono offerti a un altro dominio tramite `api` | il team preferisce il dispatch diretto degli eventi e il dominio è piccolo |
| la codebase è condivisa con team React o Vue | |

Due regole quando la usate:

1. **I nomi dei metodi mantengono l'evento.** `assign()` esegue il dispatch di `assigneeChosen` dalla source `Work Orders Page`. Se due pagine possono assegnare, ogni pagina ha il proprio evento; la facade ha due metodi o un parametro `source`, mai un generico `update()`.
2. **Niente logica.** Niente `if`, niente cicli, niente chiamate HTTP. Se serve una decisione, la decisione appartiene a un reducer, a un selector o a un effect.

Senza facade, l'`index.ts` di `data-access` esporta invece gli eventi della pagina e i selector, e il componente chiama da sé `store.dispatch()` e `store.selectSignal()`. Entrambe le forme rispettano le regole di confine; sceglietene una per dominio e scrivetela nel README del dominio.

## 11. Angular da cima a fondo

Con `data-access` al suo posto, le librerie rimanenti sono brevi.

### 11.1. La libreria ui

`libs/maintenance/ui-work-order-card/src/lib/work-order-card.component.ts`

```ts
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { isOverdue, type WorkOrder } from '@fleetline/maintenance/model';
import { BadgeComponent, MechanicPickerComponent } from '@fleetline/shared/ui-design-system';
import { RelativeDatePipe } from '@fleetline/shared/util-date';

@Component({
  selector: 'mnt-work-order-card',
  imports: [BadgeComponent, MechanicPickerComponent, RelativeDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card" [class.card--overdue]="overdue()">
      <header>
        <h3>{{ workOrder().title }}</h3>
        <ds-badge [tone]="workOrder().priority === 'urgent' ? 'danger' : 'neutral'">
          {{ workOrder().priority }}
        </ds-badge>
      </header>
      <p class="vehicle">{{ vehicleLabel() }}</p>
      <p class="due">{{ workOrder().dueAt | relativeDate }}</p>
      <ds-mechanic-picker
        [depotId]="workOrder().depotId"
        [value]="workOrder().assigneeId"
        (valueChange)="assign.emit($event)"
      />
    </article>
  `,
})
export class WorkOrderCardComponent {
  readonly workOrder = input.required<WorkOrder>();
  readonly vehicleLabel = input('');
  readonly assign = output<string>();

  protected readonly overdue = computed(() => isOverdue(this.workOrder(), new Date()));
}
```

La card conosce un `WorkOrder` perché `model` è consentito. Riceve `vehicleLabel` come stringa, perché una libreria `ui` di maintenance non può importare `fleet/api`.

### 11.2. La libreria feature

`libs/maintenance/feature-work-orders/src/lib/work-orders-page.component.ts`

```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { WorkOrdersFacade } from '@fleetline/maintenance/data-access';
import { StatusFilterComponent, WorkOrderCardComponent } from '@fleetline/maintenance/ui-work-order-card';
import { VehicleSummaryStore } from '@fleetline/fleet/api';
import { EmptyStateComponent, SpinnerComponent } from '@fleetline/shared/ui-design-system';

@Component({
  selector: 'mnt-work-orders-page',
  imports: [StatusFilterComponent, WorkOrderCardComponent, EmptyStateComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Work orders <small>{{ facade.overdueCount() }} overdue</small></h1>

    <mnt-status-filter
      [status]="facade.filter().status"
      [query]="facade.filter().query"
      (statusChange)="facade.filterBy({ status: $event })"
      (queryChange)="facade.filterBy({ query: $event })"
    />

    @if (facade.loading()) {
      <ds-spinner />
    } @else {
      @for (order of facade.visible(); track order.id) {
        <mnt-work-order-card
          [workOrder]="order"
          [vehicleLabel]="vehicles.entityMap()[order.vehicleId]?.plate ?? ''"
          (assign)="facade.assign(order, $event)"
        />
      } @empty {
        <ds-empty-state title="No work orders match this filter" />
      }
    }
  `,
})
export class WorkOrdersPageComponent {
  readonly depotId = input.required<string>();

  protected readonly facade = inject(WorkOrdersFacade);
  protected readonly vehicles = inject(VehicleSummaryStore);

  constructor() {
    effect(() => this.facade.open(this.depotId()));
    this.vehicles.ensureLoaded(computed(() => this.facade.visible().map((order) => order.vehicleId)));
  }
}
```

`depotId` arriva dal parametro della route tramite `withComponentInputBinding()`. `ensureLoaded` è un `rxMethod` e accetta un signal, quindi ogni volta che l'elenco visibile cambia, fleet carica le targhe che non ha ancora, in una sola richiesta.

### 11.3. La shell

`libs/maintenance/feature-shell/src/lib/maintenance.routes.ts`

```ts
import type { Routes } from '@angular/router';
import { provideWorkOrders } from '@fleetline/maintenance/data-access';
import { requirePermission } from '@fleetline/identity/api';

export const maintenanceRoutes: Routes = [
  {
    path: '',
    providers: [provideWorkOrders()],
    canActivate: [requirePermission('maintenance:read')],
    children: [
      {
        path: 'depots/:depotId/work-orders',
        loadComponent: () =>
          import('@fleetline/maintenance/feature-work-orders').then((m) => m.WorkOrdersPageComponent),
      },
      {
        path: 'work-orders/:workOrderId',
        loadComponent: () =>
          import('@fleetline/maintenance/feature-work-order-detail').then((m) => m.WorkOrderDetailPageComponent),
      },
      {
        path: 'planning',
        loadChildren: () =>
          import('@fleetline/maintenance/feature-planning-board').then((m) => m.planningRoutes),
      },
    ],
  },
];
```

La shell importa `identity/api` per la guard dei permessi. Le guard, come le targhe di fleet, sono una questione trasversale ai domini, quindi una shell può usare l'API di un altro dominio proprio come una feature (sezione 6.1). Tutto il resto di cui la shell ha bisogno viene dal suo dominio.

### 11.4. L'applicazione

`apps/ops-portal/src/app/app.routes.ts`

```ts
import type { Routes } from '@angular/router';
import { authGuard } from '@fleetline/identity/data-access';
import { AppLayoutComponent } from '@fleetline/shared/ui-layout';

export const appRoutes: Routes = [
  {
    path: '',
    component: AppLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'maintenance', loadChildren: () => import('@fleetline/maintenance/feature-shell').then((m) => m.maintenanceRoutes) },
      { path: 'fleet', loadChildren: () => import('@fleetline/fleet/feature-shell').then((m) => m.fleetRoutes) },
      { path: 'inventory', loadChildren: () => import('@fleetline/inventory/feature-shell').then((m) => m.inventoryRoutes) },
      { path: 'inbox', loadChildren: () => import('@fleetline/notifications/feature-shell').then((m) => m.inboxRoutes) },
      { path: '', pathMatch: 'full', redirectTo: 'maintenance/planning' },
    ],
  },
];
```

`apps/ops-portal/src/app/app.config.ts`

```ts
import type { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { authInterceptor } from '@fleetline/identity/data-access';
import { API_BASE_URL } from '@fleetline/shared/data-access-http';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideStore(),
    provideEffects(),
    provideStoreDevtools({ maxAge: 50, connectInZone: true }),
    { provide: API_BASE_URL, useValue: environment.apiUrl },
  ],
};
```

Questa è l'intera applicazione: due file e un `environment`. `backoffice` monta la stessa `maintenance/feature-shell` con un layout diverso. Una terza applicazione richiederebbe un pomeriggio.

## 12. React e Next.js

L'architettura non dipende da Angular. Librerie, tipi, domini, tag e regola di lint restano gli stessi; Nx genera progetti React e Next.js con `@nx/react` e `@nx/next`. Cambia il modo in cui si implementa ogni tipo di libreria, e Next.js aggiunge una nuova dimensione: il codice che gira solo sul server.

### 12.1. Che cosa corrisponde a che cosa

| Angular | React / Next.js |
|---|---|
| Componente `feature` | Un client component esportato da `feature-*`; il `page.tsx` nell'app si limita a renderizzarlo |
| Componente `ui` con `input()`/`output()` | Un componente con props e callback |
| Route della `shell` | Le route su file restano in `apps/<app>/app/`; la libreria shell esporta il layout e i provider del dominio |
| NgRx Store, `createFeature` | Redux Toolkit `createSlice` |
| NgRx Entity | `createEntityAdapter` di Redux Toolkit |
| `createSelector` | `createSelector` (Reselect, parte di Redux Toolkit) |
| Effect | Listener middleware, o thunk nei casi semplici |
| `provideState` su una route | `slice.injectInto(rootReducer)` (slice in lazy loading) |
| Signal Store | Zustand |
| Servizio facade | Un hook: `useWorkOrders()` |
| `HttpClient` | `fetch` in una funzione server o in un modulo API client |

### 12.2. Tag per server e client

Nell'App Router un file è o un server component o un client component. Il codice che legge segreti, cookie o il database non deve mai finire nel bundle del browser. Fleetline aggiunge una seconda libreria data-access per dominio e un tag in più:

| Libreria | Tag | Contiene |
|---|---|---|
| `maintenance/data-access` | `type:data-access`, `platform:client` | Slice Redux, listener, API client, hook facade |
| `maintenance/data-access-server` | `type:data-access`, `platform:server` | Funzioni fetch `server-only` e server action |

La regola di lint della sezione 8.2 contiene già il vincolo `platform:client` → non `platform:server`. Inoltre ogni file solo server inizia con `import 'server-only'`, così un errore fa fallire la build anche dove il lint non gira.

### 12.3. Lo store

Redux Toolkit può iniettare le slice in lazy loading, e questo fa la parte di `provideState` su una route. Il root reducer vive in `shared` e non conosce nessun dominio.

`libs/shared/data-access-store/src/lib/store.ts`

```ts
import { combineSlices, configureStore, createListenerMiddleware, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';

const layoutSlice = createSlice({
  name: 'layout',
  initialState: { sidebarOpen: true },
  reducers: {
    sidebarToggled(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
    sidebarSet(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload;
    },
  },
});

export interface LazyLoadedSlices {}

export const rootReducer = combineSlices(layoutSlice).withLazyLoadedSlices<LazyLoadedSlices>();

export function makeStore() {
  const listener = createListenerMiddleware();
  return configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().prepend(listener.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const { sidebarToggled, sidebarSet } = layoutSlice.actions;
```

Uno store nuovo per ogni richiesta viene creato in un provider client, come raccomanda la guida di Redux Toolkit per l'App Router.

`libs/shared/data-access-store/src/lib/store-provider.tsx`

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from './store';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(makeStore);
  return <Provider store={store}>{children}</Provider>;
}
```

### 12.4. La slice

Gli stessi eventi, lo stesso aggiornamento ottimistico, le stesse funzioni di `model` della sezione 9.

`libs/maintenance/data-access/src/lib/work-orders.slice.ts`

```ts
import { createEntityAdapter, createSelector, createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import { rootReducer, type RootState } from '@fleetline/shared/data-access-store';
import {
  byDueDate, emptyFilter, isOverdue, matchesFilter,
  type WorkOrder, type WorkOrderFilter,
} from '@fleetline/maintenance/model';

const adapter = createEntityAdapter<WorkOrder>({ sortComparer: byDueDate });

export const workOrdersSlice = createSlice({
  name: 'workOrders',
  initialState: adapter.getInitialState({
    filter: emptyFilter as WorkOrderFilter,
    loading: false,
    error: null as string | null,
  }),
  reducers: {
    opened(state, action: PayloadAction<{ depotId: string }>) {
      adapter.removeAll(state);
      state.filter = { ...emptyFilter, depotId: action.payload.depotId };
      state.loading = true;
      state.error = null;
    },
    filterChanged(state, action: PayloadAction<Partial<Omit<WorkOrderFilter, 'depotId'>>>) {
      Object.assign(state.filter, action.payload);
    },
    assigneeChosen(state, action: PayloadAction<{ id: string; assigneeId: string; previousAssigneeId: string | null }>) {
      adapter.updateOne(state, { id: action.payload.id, changes: { assigneeId: action.payload.assigneeId } });
    },
    loadSucceeded(state, action: PayloadAction<WorkOrder[]>) {
      adapter.setAll(state, action.payload);
      state.loading = false;
    },
    loadFailed(state, action: PayloadAction<string>) {
      state.loading = false;
      state.error = action.payload;
    },
    assignSucceeded(state, action: PayloadAction<WorkOrder>) {
      adapter.upsertOne(state, action.payload);
    },
    assignFailed(state, action: PayloadAction<{ id: string; previousAssigneeId: string | null; error: string }>) {
      adapter.updateOne(state, { id: action.payload.id, changes: { assigneeId: action.payload.previousAssigneeId } });
      state.error = action.payload.error;
    },
  },
});

declare module '@fleetline/shared/data-access-store' {
  export interface LazyLoadedSlices extends WithSlice<typeof workOrdersSlice> {}
}

const injected = workOrdersSlice.injectInto(rootReducer);
const selectState = (state: RootState) => injected.selectSlice(state);
const entities = adapter.getSelectors(selectState);

export const selectFilter = (state: RootState) => selectState(state).filter;
export const selectLoading = (state: RootState) => selectState(state).loading;
export const selectError = (state: RootState) => selectState(state).error;
export const selectVisible = createSelector([entities.selectAll, selectFilter], (orders, filter) =>
  orders.filter((order) => matchesFilter(order, filter)),
);
export const selectOverdueCount = createSelector([entities.selectAll], (orders) =>
  orders.filter((order) => isOverdue(order, new Date())).length,
);
export const workOrdersActions = workOrdersSlice.actions;
```

### 12.5. Gli effect come listener

I listener vengono aggiunti quando il dominio viene montato e rimossi quando viene smontato: è il corrispettivo di `provideEffects` su una route. `cancelActiveListeners()` dà la semantica di `switchMap`.

`libs/maintenance/data-access/src/lib/work-orders.listeners.ts`

```ts
import { addListener, type UnsubscribeListener } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from '@fleetline/shared/data-access-store';
import { toErrorMessage } from '@fleetline/shared/data-access-http';
import { workOrdersHttp } from './work-orders.http';
import { workOrdersActions as actions } from './work-orders.slice';

const addAppListener = addListener.withTypes<RootState, AppDispatch>();

export function startWorkOrderListeners(dispatch: AppDispatch): UnsubscribeListener {
  const stops = [
    dispatch(
      addAppListener({
        actionCreator: actions.opened,
        effect: async ({ payload }, api) => {
          api.cancelActiveListeners();
          try {
            const orders = await workOrdersHttp.list(payload.depotId, api.signal);
            api.dispatch(actions.loadSucceeded(orders));
          } catch (error) {
            if (!api.signal.aborted) api.dispatch(actions.loadFailed(toErrorMessage(error)));
          }
        },
      }),
    ),
    dispatch(
      addAppListener({
        actionCreator: actions.assigneeChosen,
        effect: async ({ payload }, api) => {
          try {
            api.dispatch(actions.assignSucceeded(await workOrdersHttp.assign(payload.id, payload.assigneeId)));
          } catch (error) {
            api.dispatch(actions.assignFailed({ ...payload, error: toErrorMessage(error) }));
          }
        },
      }),
    ),
  ];
  return () => stops.forEach((stop) => stop());
}
```

### 12.6. L'hook facade

L'hook ha gli stessi membri della facade Angular. Inoltre avvia i listener e segnala l'apertura della pagina, così per collegare una feature basta una riga.

`libs/maintenance/data-access/src/lib/use-work-orders.ts`

```ts
'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@fleetline/shared/data-access-store';
import type { WorkOrder, WorkOrderFilter } from '@fleetline/maintenance/model';
import { startWorkOrderListeners } from './work-orders.listeners';
import {
  selectError, selectFilter, selectLoading, selectOverdueCount, selectVisible,
  workOrdersActions as actions,
} from './work-orders.slice';

export function useWorkOrders(depotId: string) {
  const dispatch = useAppDispatch();

  useEffect(() => startWorkOrderListeners(dispatch), [dispatch]);
  useEffect(() => {
    dispatch(actions.opened({ depotId }));
  }, [dispatch, depotId]);

  return {
    visible: useAppSelector(selectVisible),
    overdueCount: useAppSelector(selectOverdueCount),
    filter: useAppSelector(selectFilter),
    loading: useAppSelector(selectLoading),
    error: useAppSelector(selectError),
    filterBy: (filter: Partial<Omit<WorkOrderFilter, 'depotId'>>) => dispatch(actions.filterChanged(filter)),
    assign: (order: WorkOrder, assigneeId: string) =>
      dispatch(actions.assigneeChosen({ id: order.id, assigneeId, previousAssigneeId: order.assigneeId })),
  };
}
```

`libs/maintenance/data-access/src/index.ts`

```ts
export { useWorkOrders } from './lib/use-work-orders';
```

### 12.7. Feature, ui e route

`libs/maintenance/feature-work-orders/src/lib/work-orders-page.tsx`

```tsx
'use client';

import { useWorkOrders } from '@fleetline/maintenance/data-access';
import { StatusFilter, WorkOrderCard } from '@fleetline/maintenance/ui-work-order-card';
import { useVehicleSummaries } from '@fleetline/fleet/api';
import { EmptyState, Spinner } from '@fleetline/shared/ui-design-system';

export function WorkOrdersPage({ depotId }: { depotId: string }) {
  const workOrders = useWorkOrders(depotId);
  const vehicles = useVehicleSummaries(workOrders.visible.map((order) => order.vehicleId));

  return (
    <>
      <h1>
        Work orders <small>{workOrders.overdueCount} overdue</small>
      </h1>
      <StatusFilter
        status={workOrders.filter.status}
        query={workOrders.filter.query}
        onStatusChange={(status) => workOrders.filterBy({ status })}
        onQueryChange={(query) => workOrders.filterBy({ query })}
      />
      {workOrders.loading ? (
        <Spinner />
      ) : workOrders.visible.length === 0 ? (
        <EmptyState title="No work orders match this filter" />
      ) : (
        workOrders.visible.map((order) => (
          <WorkOrderCard
            key={order.id}
            workOrder={order}
            vehicleLabel={vehicles[order.vehicleId]?.plate ?? ''}
            onAssign={(assigneeId) => workOrders.assign(order, assigneeId)}
          />
        ))
      )}
    </>
  );
}
```

`libs/maintenance/ui-work-order-card/src/lib/work-order-card.tsx`

```tsx
import { isOverdue, type WorkOrder } from '@fleetline/maintenance/model';
import { Badge, MechanicPicker } from '@fleetline/shared/ui-design-system';
import { formatRelative } from '@fleetline/shared/util-date';

interface WorkOrderCardProps {
  workOrder: WorkOrder;
  vehicleLabel: string;
  onAssign: (assigneeId: string) => void;
}

export function WorkOrderCard({ workOrder, vehicleLabel, onAssign }: WorkOrderCardProps) {
  return (
    <article className={isOverdue(workOrder, new Date()) ? 'card card--overdue' : 'card'}>
      <header>
        <h3>{workOrder.title}</h3>
        <Badge tone={workOrder.priority === 'urgent' ? 'danger' : 'neutral'}>{workOrder.priority}</Badge>
      </header>
      <p className="vehicle">{vehicleLabel}</p>
      <p className="due">{formatRelative(workOrder.dueAt)}</p>
      <MechanicPicker depotId={workOrder.depotId} value={workOrder.assigneeId} onChange={onAssign} />
    </article>
  );
}
```

Il file di route nell'applicazione resta lungo poche righe. La libreria shell esporta il layout del dominio con il controllo dei permessi.

`apps/customer/app/maintenance/layout.tsx`

```tsx
import type { ReactNode } from 'react';
import { MaintenanceLayout } from '@fleetline/maintenance/feature-shell';

export default function Layout({ children }: { children: ReactNode }) {
  return <MaintenanceLayout>{children}</MaintenanceLayout>;
}
```

`apps/customer/app/maintenance/depots/[depotId]/work-orders/page.tsx`

```tsx
import { WorkOrdersPage } from '@fleetline/maintenance/feature-work-orders';

export default async function Page({ params }: { params: Promise<{ depotId: string }> }) {
  const { depotId } = await params;
  return <WorkOrdersPage depotId={depotId} />;
}
```

### 12.8. Stato del server: la stessa facade, un altro motore

In Next.js gran parte di ciò che una SPA Angular tiene in NgRx è **stato del server**: dati che il server possiede e il client mette in cache. Per elenchi come gli ordini di lavoro, molti team preferiscono server component più una query cache a Redux. La facade rende questa scelta una decisione privata di `data-access`.

`libs/maintenance/data-access-server/src/lib/work-orders.ts`

```ts
import 'server-only';
import { apiFetch } from '@fleetline/shared/data-access-server';
import type { WorkOrder } from '@fleetline/maintenance/model';

export function listWorkOrders(depotId: string): Promise<WorkOrder[]> {
  return apiFetch<WorkOrder[]>(`/depots/${depotId}/work-orders`, { next: { tags: [`work-orders:${depotId}`] } });
}
```

`libs/maintenance/data-access/src/lib/use-work-orders.query.ts`

```ts
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  emptyFilter, isOverdue, matchesFilter,
  type WorkOrder, type WorkOrderFilter,
} from '@fleetline/maintenance/model';
import { workOrdersHttp } from './work-orders.http';

export function useWorkOrders(depotId: string, initial?: WorkOrder[]) {
  const client = useQueryClient();
  const key = ['work-orders', depotId] as const;
  const [filter, setFilter] = useState<WorkOrderFilter>({ ...emptyFilter, depotId });

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => workOrdersHttp.list(depotId, signal),
    initialData: initial,
  });

  const assignment = useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string }) => workOrdersHttp.assign(id, assigneeId),
    onMutate: async ({ id, assigneeId }) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<WorkOrder[]>(key);
      client.setQueryData<WorkOrder[]>(key, (orders) =>
        orders?.map((order) => (order.id === id ? { ...order, assigneeId } : order)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => client.setQueryData(key, context?.previous),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });

  const all = query.data ?? [];
  const visible = all.filter((order) => matchesFilter(order, filter));

  return {
    visible,
    overdueCount: all.filter((order) => isOverdue(order, new Date())).length,
    filter,
    loading: query.isPending,
    error: query.error ? String(query.error) : null,
    filterBy: (change: Partial<Omit<WorkOrderFilter, 'depotId'>>) => setFilter((current) => ({ ...current, ...change })),
    assign: (order: WorkOrder, assigneeId: string) => assignment.mutate({ id: order.id, assigneeId }),
  };
}
```

Il valore restituito ha gli stessi membri. `WorkOrdersPage` non cambia, a parte il passaggio di `initial`, che il `page.tsx` lato server ha caricato con `listWorkOrders`. La regola di Fleetline: **lo stato del server in una query cache, lo stato posseduto dal client in Redux.** Il tabellone di pianificazione, dove i pianificatori trascinano decine di ordini tra meccanici e giorni prima di salvare, è stato del client e resta in Redux; l'elenco degli ordini di lavoro è stato del server.

### 12.9. Insidie specifiche di Next.js

- **`'use client'` è un confine a sé.** Mettetelo nei file di feature e data-access che usano hook, mai in `model` o `util`.
- **Non importate una libreria server in un file client "solo per il tipo".** I tipi vivono in `model`.
- **Le server action appartengono a `data-access-server`.** Una feature le importa tramite re-export di `data-access` solo se i tag di lint lo consentono; altrimenti la pagina le passa come props.
- **I file di route restano sottili.** Un `page.tsx` che accumula logica è la versione Next.js di un app component Angular obeso.

## 13. Vue e Nuxt

Vue si traduce in modo ancora più diretto, perché i setup store di Pinia somigliano molto a un NgRx Signal Store, e i composable sono la forma naturale di una facade. Nx genera progetti Vue e Nuxt con `@nx/vue` e `@nx/nuxt`.

### 13.1. Che cosa corrisponde a che cosa

| Angular | Vue / Nuxt |
|---|---|
| Componente `feature` | Un single-file component in `feature-*`; la pagina in `apps/<app>/app/pages/` si limita a renderizzarlo |
| Componente `ui` | Un componente con `defineProps` e `defineEmits` |
| Route della `shell` | Le route su file restano nell'app; la libreria shell esporta layout e route middleware |
| NgRx Store / Signal Store | Pinia (setup store) |
| Selector | `computed` dentro lo store |
| Effect | Action asincrone nello store; `useAsyncData` per il caricamento durante il rendering lato server |
| Servizio facade | Un composable: `useWorkOrders()` |
| `HttpClient` | `$fetch` |

Pinia non separa action e reducer. Questo elimina il log degli eventi e il time-travel debugging di NgRx, ma elimina anche gran parte della cerimonia. Per l'architettura non cambia nulla: lo store è privato di `data-access`, e il composable è la porta.

### 13.2. Disattivate gli auto-import per le librerie

Nuxt importa automaticamente componenti e composable. In una piccola app è comodo, per i confini è fatale: **un import mai scritto non può passare dal lint.** Se una feature di billing può usare `useWorkOrders()` senza una riga `import`, la regola di lint non vede mai l'attraversamento.

Le regole nelle applicazioni Nuxt di Fleetline:

- le librerie si importano con istruzioni `import` esplicite tramite i loro path alias, mai registrate come cartelle di auto-import;
- i domini non sono layer di Nuxt, perché i layer importano automaticamente nell'app i propri componenti e composable;
- l'app mantiene gli auto-import delle API di Vue e Nuxt solo nelle proprie `pages/` e `layouts/`, e il codice delle librerie importa le funzioni di Nuxt da `#imports`.

`apps/backoffice/nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
  components: { dirs: [] },
  imports: { scan: false },
  runtimeConfig: { public: { apiUrl: '' } },
});
```

### 13.3. Lo store

`libs/maintenance/data-access/src/lib/work-orders.store.ts`

```ts
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  byDueDate, emptyFilter, isOverdue, matchesFilter,
  type WorkOrder, type WorkOrderFilter,
} from '@fleetline/maintenance/model';
import { toErrorMessage } from '@fleetline/shared/data-access-http';
import { useWorkOrdersHttp } from './work-orders.http';

export const useWorkOrdersStore = defineStore('maintenance/work-orders', () => {
  const http = useWorkOrdersHttp();

  const byId = ref<Record<string, WorkOrder>>({});
  const filter = ref<WorkOrderFilter>({ ...emptyFilter });
  const error = ref<string | null>(null);

  const all = computed(() => Object.values(byId.value).sort(byDueDate));
  const visible = computed(() => all.value.filter((order) => matchesFilter(order, filter.value)));
  const overdueCount = computed(() => all.value.filter((order) => isOverdue(order, new Date())).length);

  async function open(depotId: string) {
    filter.value = { ...emptyFilter, depotId };
    error.value = null;
    const orders = await http.list(depotId);
    byId.value = Object.fromEntries(orders.map((order) => [order.id, order]));
  }

  function filterBy(change: Partial<Omit<WorkOrderFilter, 'depotId'>>) {
    filter.value = { ...filter.value, ...change };
  }

  async function assign(id: string, assigneeId: string) {
    const order = byId.value[id];
    if (!order) return;
    const previousAssigneeId = order.assigneeId;
    byId.value[id] = { ...order, assigneeId };
    try {
      byId.value[id] = await http.assign(id, assigneeId);
    } catch (cause) {
      byId.value[id] = { ...order, assigneeId: previousAssigneeId };
      error.value = toErrorMessage(cause);
    }
  }

  return { byId, filter, error, visible, overdueCount, open, filterBy, assign };
});
```

`byId`, `filter` ed `error` vengono restituiti perché Pinia li serializzi nel payload renderizzato dal server e il browser parta con lo stesso stato.

### 13.4. Il composable facade

`libs/maintenance/data-access/src/lib/use-work-orders.ts`

```ts
import { useAsyncData } from '#imports';
import { storeToRefs } from 'pinia';
import { toValue, type MaybeRefOrGetter } from 'vue';
import type { WorkOrder } from '@fleetline/maintenance/model';
import { useWorkOrdersStore } from './work-orders.store';

export async function useWorkOrders(depotId: MaybeRefOrGetter<string>) {
  const store = useWorkOrdersStore();
  const { visible, overdueCount, filter, error } = storeToRefs(store);

  const { pending } = await useAsyncData(
    () => `maintenance:work-orders:${toValue(depotId)}`,
    () => store.open(toValue(depotId)).then(() => true),
  );

  return {
    visible,
    overdueCount,
    filter,
    error,
    loading: pending,
    filterBy: store.filterBy,
    assign: (order: WorkOrder, assigneeId: string) => store.assign(order.id, assigneeId),
  };
}
```

La chiave è una funzione di `depotId`, quindi cambiare deposito fa ripartire il caricamento. Sul server `useAsyncData` aspetta i dati; nel browser la pagina si idrata dal payload senza una seconda richiesta.

### 13.5. Feature, ui e pagina

`libs/maintenance/feature-work-orders/src/lib/WorkOrdersPage.vue`

```vue
<script setup lang="ts">
import { useWorkOrders } from '@fleetline/maintenance/data-access';
import { StatusFilter, WorkOrderCard } from '@fleetline/maintenance/ui-work-order-card';
import { useVehicleSummaries } from '@fleetline/fleet/api';
import { EmptyState, Spinner } from '@fleetline/shared/ui-design-system';

const props = defineProps<{ depotId: string }>();

const { visible, overdueCount, filter, loading, filterBy, assign } = await useWorkOrders(() => props.depotId);
const vehicles = useVehicleSummaries(() => visible.value.map((order) => order.vehicleId));
</script>

<template>
  <h1>Work orders <small>{{ overdueCount }} overdue</small></h1>
  <StatusFilter
    :status="filter.status"
    :query="filter.query"
    @update:status="(status) => filterBy({ status })"
    @update:query="(query) => filterBy({ query })"
  />
  <Spinner v-if="loading" />
  <template v-else>
    <WorkOrderCard
      v-for="order in visible"
      :key="order.id"
      :work-order="order"
      :vehicle-label="vehicles[order.vehicleId]?.plate ?? ''"
      @assign="(assigneeId) => assign(order, assigneeId)"
    />
    <EmptyState v-if="visible.length === 0" title="No work orders match this filter" />
  </template>
</template>
```

`libs/maintenance/ui-work-order-card/src/lib/WorkOrderCard.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { isOverdue, type WorkOrder } from '@fleetline/maintenance/model';
import { Badge, MechanicPicker } from '@fleetline/shared/ui-design-system';
import { formatRelative } from '@fleetline/shared/util-date';

const props = defineProps<{ workOrder: WorkOrder; vehicleLabel: string }>();
const emit = defineEmits<{ assign: [assigneeId: string] }>();

const overdue = computed(() => isOverdue(props.workOrder, new Date()));
</script>

<template>
  <article class="card" :class="{ 'card--overdue': overdue }">
    <header>
      <h3>{{ workOrder.title }}</h3>
      <Badge :tone="workOrder.priority === 'urgent' ? 'danger' : 'neutral'">{{ workOrder.priority }}</Badge>
    </header>
    <p class="vehicle">{{ vehicleLabel }}</p>
    <p class="due">{{ formatRelative(workOrder.dueAt) }}</p>
    <MechanicPicker
      :depot-id="workOrder.depotId"
      :model-value="workOrder.assigneeId"
      @update:model-value="(id) => emit('assign', id)"
    />
  </article>
</template>
```

`apps/backoffice/app/pages/maintenance/depots/[depotId]/work-orders.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { definePageMeta, useRoute } from '#imports';
import { WorkOrdersPage } from '@fleetline/maintenance/feature-work-orders';

definePageMeta({ layout: 'maintenance', middleware: ['maintenance-read'] });

const route = useRoute();
const depotId = computed(() => String(route.params.depotId));
</script>

<template>
  <WorkOrdersPage :depot-id="depotId" />
</template>
```

### 13.6. Insidie specifiche di Nuxt

- **Il lint dei file `.vue`** richiede `vue-eslint-parser` nella configurazione di ESLint, altrimenti la regola di confine salta in silenzio ogni componente. Per questo il pattern `files` della sezione 8.2 include `**/*.vue`.
- **Uno store per richiesta.** Pinia con `@pinia/nuxt` ne crea già uno per richiesta sul server. Non tenete mai stato in un `ref` a livello di modulo in una libreria: sul server sarebbe condiviso tra gli utenti.
- **`useAsyncData` appartiene alla facade**, non allo store. Lo store resta utilizzabile dai test e dal codice solo client.

## 14. Fianco a fianco

:::diagram fe-frameworks

Lo stesso caso d'uso in tre framework, file per file:

| Libreria | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| `model` | `work-order.ts` | lo stesso file | lo stesso file |
| stato in `data-access` | `createFeature` + `createEntityAdapter` | `createSlice` + `createEntityAdapter` | setup store di Pinia |
| effect in `data-access` | `createEffect` funzionale | listener middleware | action asincrone dello store + `useAsyncData` |
| facade in `data-access` | `WorkOrdersFacade` (signal) | `useWorkOrders()` (valori) | `useWorkOrders()` (ref) |
| `ui` | `input()` / `output()` | props / callback | `defineProps` / `defineEmits` |
| `feature` | componente standalone | client component | single-file component |
| `shell` | `Routes` con `providers` | componente di layout, segmento di route | layout + route middleware |
| route dell'app | `loadChildren` | `page.tsx` | `pages/*.vue` |
| confini | `@nx/enforce-module-boundaries` | la stessa regola | la stessa regola, con `vue-eslint-parser` |

Ciò che resta identico in tutti e tre: la cartella di ogni file, i tag, la regola di lint, la libreria `model`, i membri della facade e i test della libreria `model`. Chi passa da un'app di Fleetline all'altra deve reimparare solo il framework.

## 15. Test per tipo di libreria

Ogni tipo ha un genere di test naturale, e i confini rendono ognuno di essi economico.

| Tipo | Test | Velocità | Che cosa simula |
|---|---|---|---|
| `model`, `util` | Semplici unit test, senza framework | millisecondi | niente |
| reducer e selector di `data-access` | Test di funzioni pure | millisecondi | niente |
| effect / listener di `data-access` | Test con un client HTTP finto | veloce | HTTP |
| facade | Integrazione con lo store reale | veloce | HTTP |
| `ui` | Test di componente, story in Storybook | veloce | niente, ha solo input |
| `feature` | Test di componente con una facade finta | veloce | la facade |
| app | End-to-end con Playwright, pochi flussi | lento | il back-end, o niente |

Un test del reducer non ha bisogno del TestBed:

```ts
import { describe, expect, it } from 'vitest';
import { workOrdersApi, workOrdersPage } from './work-orders.events';
import { workOrdersFeature } from './work-orders.feature';
import { aWorkOrder } from '@fleetline/maintenance/model/testing';

describe('work orders reducer', () => {
  it('puts the previous mechanic back when an assignment fails', () => {
    const order = aWorkOrder({ id: 'wo-1', assigneeId: 'mech-1' });
    const loaded = workOrdersFeature.reducer(undefined, workOrdersApi.loadSucceeded({ workOrders: [order] }));
    const optimistic = workOrdersFeature.reducer(
      loaded,
      workOrdersPage.assigneeChosen({ id: 'wo-1', assigneeId: 'mech-2', previousAssigneeId: 'mech-1' }),
    );
    const failed = workOrdersFeature.reducer(
      optimistic,
      workOrdersApi.assignFailed({ id: 'wo-1', previousAssigneeId: 'mech-1', error: 'conflict' }),
    );

    expect(optimistic.entities['wo-1']?.assigneeId).toBe('mech-2');
    expect(failed.entities['wo-1']?.assigneeId).toBe('mech-1');
    expect(failed.error).toBe('conflict');
  });
});
```

Un test di feature fornisce una facade finta, perché il componente non vede nient'altro:

```ts
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect, it, vi } from 'vitest';
import { WorkOrdersFacade } from '@fleetline/maintenance/data-access';
import { VehicleSummaryStore } from '@fleetline/fleet/api';
import { aWorkOrder } from '@fleetline/maintenance/model/testing';
import { WorkOrdersPageComponent } from './work-orders-page.component';

it('assigns the chosen mechanic', async () => {
  const order = aWorkOrder({ id: 'wo-1' });
  const facade = {
    visible: signal([order]),
    overdueCount: signal(0),
    filter: signal({ depotId: 'd-1', status: 'all' as const, query: '' }),
    loading: signal(false),
    error: signal(null),
    open: vi.fn(),
    filterBy: vi.fn(),
    assign: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkOrdersFacade, useValue: facade },
      { provide: VehicleSummaryStore, useValue: { entityMap: signal({}), ensureLoaded: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(WorkOrdersPageComponent);
  fixture.componentRef.setInput('depotId', 'd-1');
  await fixture.whenStable();

  fixture.debugElement.query((el) => el.name === 'mnt-work-order-card').triggerEventHandler('assign', 'mech-7');

  expect(facade.open).toHaveBeenCalledWith('d-1');
  expect(facade.assign).toHaveBeenCalledWith(order, 'mech-7');
});
```

I builder dei dati di test come `aWorkOrder` vivono in un entry point secondario di `model` (`@fleetline/maintenance/model/testing`), così i test di ogni framework usano gli stessi.

## 16. Crescere fino a questa struttura e migrare

Nessuno parte con settanta librerie. Fleetline è nata come un'unica applicazione Angular con una cartella `src/app`; i passi seguenti sono l'ordine che ha funzionato.

### 16.1. La migrazione in otto passi

1. **Create il workspace attorno all'app.** `nx init` nel repository esistente. Per ora non si sposta niente.
2. **Disegnate i domini su carta.** Usate le parole del business: di che cosa parlano pianificatori, clienti e amministrazione? Aspettatevi da sei a dieci domini. Scriveteli in un README.
3. **Attivate la regola come warning.** Aggiungete la configurazione di lint della sezione 8.2 con `'warn'`. Contate i warning: quella è la vostra baseline.
4. **Estraete prima `model` e `util`.** Non hanno dipendenze, quindi spostarli è sicuro, e ogni passo successivo ne ha bisogno. Usate `nx g @nx/workspace:move`.
5. **Estraete `ui` per dominio.** Si sposta ogni componente che ha solo input e output. I componenti che iniettano uno store restano dove sono, per ora.
6. **Ritagliate `data-access` per dominio.** Dividete lo store radice per dominio; spostate ogni feature dello store, i suoi effect e il suo HTTP nella `data-access` del dominio e registratela sulla route del dominio.
7. **Spostate le pagine in `feature-*` e le route in `feature-shell`.** L'app si riduce alle sue route e ai suoi provider.
8. **Passate la regola a `'error'` e aggiungete CODEOWNERS.** Da qui in poi, un nuovo attraversamento fa fallire la CI.

I passi da 4 a 7 procedono dominio per dominio, e l'applicazione continua a essere rilasciata nel frattempo. In Fleetline l'intera migrazione ha richiesto quattro mesi accanto allo sviluppo delle funzionalità, un dominio alla volta, partendo dal più piccolo (`notifications`) per imparare le mosse.

### 16.2. Che cosa va storto di solito

- **Un dominio chiamato `common` o `core`.** Diventa il nuovo `shared/`. Ogni concetto ha un responsabile nel business; trovatelo.
- **Domini tagliati per pagina invece che per linguaggio del business.** "Dashboard" non è un dominio; è una feature che legge da più domini tramite le loro API.
- **Librerie API che riesportano tutto.** Allora il confine è solo cosmetico. Esportate ciò che un altro team usa davvero, e nient'altro.
- **Righe di lint disattivate.** Un `eslint-disable` per la regola di confine diventa quaranta in un anno. Le eccezioni vanno nella configurazione, con una motivazione nella pull request.

### 16.3. Quando dividere una libreria

- Una `data-access` con più di tre o quattro feature dello store, o posseduta da due team: dividetela per sottodominio.
- Una libreria `ui` importata da una sola feature: riunitela a quella feature o tenetela, ma non spostatela in `shared`.
- Una `feature` con più route non correlate: una libreria per caso d'uso.
- Un dominio le cui librerie sono possedute per lo più da un altro team: il dominio è tagliato male, oppure lo sono i confini tra i team.

### 16.4. Quando è troppo

Per un'applicazione, un team e uno o due domini, la struttura completa costa più di quanto fa risparmiare. Partite invece con cartelle dentro un solo progetto (`src/domains/<domain>/feature-…`, `ui-…`, `data-access`, `model`) e fatele rispettare con Sheriff (sezione 8.4). Spostare più tardi quelle cartelle in librerie Nx è un passo meccanico, perché le regole sulle dipendenze sono già rispettate.

## 17. Domande

**Serve NgRx per tutto lo stato?**
No. Lo stato condiviso e di lunga durata che più feature leggono va in uno store. Lo stato dei form, i pannelli aperti o chiusi e altro stato posseduto da un solo componente restano nel componente, con signal o con un Signal Store a livello di componente.

**NgRx Store o NgRx Signal Store?**
Entrambi si adattano all'architettura, entrambi vivono in `data-access`, e la facade nasconde la scelta. Fleetline usa lo Store dove un log degli eventi e i devtools ripagano (manutenzione, pianificazione) e il Signal Store per i domini più semplici (riepiloghi dei veicoli, notifiche).

**Una facade non è solo un livello in più?**
Sì, e la sezione 10 dice quando ne vale la pena. In React e Vue, l'hook o il composable è comunque il modo idiomatico di condividere l'accesso allo stato, quindi lì la facade non costa quasi nulla.

**Ogni dominio deve avere una libreria `api` fin dal primo giorno?**
No. Createla la prima volta che un altro dominio ha bisogno di qualcosa. Prima di allora il dominio è completamente privato, che è il miglior confine possibile.

**Sono micro front-end?**
No. Tutto qui viene compilato in un'unica applicazione per ogni cartella di app. Lo stesso taglio per domini è la giuntura naturale per i micro front-end in futuro, se l'organizzazione avrà mai bisogno di deploy indipendenti.

**React, Vue e Angular possono davvero condividere librerie?**
Condividono le librerie `model` e `util`, con il tag `framework:agnostic`, e i builder dei dati di test. Componenti e store sono specifici di ogni framework. In Fleetline circa un quinto del codice front-end è agnostico rispetto al framework.

**Dove approfondire?**
Gli articoli di Manfred Steyer e l'e-book gratuito *Enterprise Angular* su [angulararchitects.io](https://www.angulararchitects.io/), la [documentazione di Nx](https://nx.dev/) sui confini tra moduli, [Sheriff](https://github.com/softarc-consulting/sheriff) e la [documentazione di NgRx](https://ngrx.io/).
