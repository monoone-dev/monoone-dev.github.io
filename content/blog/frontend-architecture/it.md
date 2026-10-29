Questa guida descrive come strutturiamo i front-end di grandi dimensioni: un solo workspace, molte applicazioni, molti team e una regola per ogni file. Lo costruiamo con **Nx** e **Angular**, teniamo lo stato condiviso in **NgRx** e mettiamo una **facade opzionale** davanti allo store. Poi mostriamo la stessa architettura, regola per regola, in **React con Next.js** e in **Vue con Nuxt**.

Gli esempi sono scritti per **Angular 22** con NgRx 22, **React 19** con Next.js 16, **TanStack Query** e **Zustand**, e **Vue 3.5** con Nuxt 4 e **Pinia 3**.

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

```tree
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

```tree
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
        ├── util-http/
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

### 6.3. Stili

Gli stili sono soggetti agli stessi confini del TypeScript, ma la regola di confine non li vede: Nx costruisce il grafo delle dipendenze dagli import TypeScript e JavaScript e ignora gli `@use` di SCSS. Per questo gli stili hanno quattro regole proprie:

1. **Un componente ha stili solo per sé, in un file accanto a sé.** Una libreria non definisce mai una classe globale, così `.card` di maintenance e `.card` di billing non possono scontrarsi.
2. **Il design system parla tramite variabili CSS.** I token (colori, spaziature, raggi, tipografia) sono custom property di `shared/ui-design-system`. I componenti dei domini leggono `var(--ds-…)` e non fanno `@use` di file SCSS di altre librerie.
3. **Gli stili globali li ha solo l'applicazione:** reset, font e token, in un unico posto.
4. **Nessuno stilizza l'interno del componente di un altro.** Un componente che deve poter essere personalizzato espone un input, una prop o una variabile CSS.

| | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| Stili del componente | `styleUrl` con l'incapsulamento emulato predefinito | CSS Modules: `*.module.scss` | `<style scoped lang="scss">` |
| Stili globali | `apps/<app>/src/styles.scss` | import in `app/layout.tsx` dell'app | `css` in `nuxt.config.ts` |
| Vietato nelle librerie | `::ng-deep`, `ViewEncapsulation.None` | `:global(...)`, import di un `.css` semplice | `:deep(...)`, `<style>` senza `scoped` |

`libs/shared/ui-design-system/src/styles/tokens.scss`

```scss
:root {
  --ds-surface: #ffffff;
  --ds-text: #1b1f24;
  --ds-text-muted: #59636e;
  --ds-danger: #c62828;
  --ds-radius: 8px;
  --ds-space-2: 8px;
  --ds-space-3: 12px;
}
```

`libs/maintenance/ui-work-order-card/src/lib/work-order-card.component.scss`

```scss
.card {
  display: grid;
  gap: var(--ds-space-2);
  padding: var(--ds-space-3);
  border-radius: var(--ds-radius);
  background: var(--ds-surface);
  color: var(--ds-text);
}

.card--overdue {
  border-left: 4px solid var(--ds-danger);
}

.vehicle,
.due {
  color: var(--ds-text-muted);
}
```

Le stesse regole CSS finiscono in React in `work-order-card.module.scss` e in Vue nel blocco `<style scoped>` del componente. Stylelint in CI rifiuta i selettori dell'ultima riga della tabella (`selector-disallowed-list`). La regola 2 la verifica un solo comando `grep` in CI: un `@use` in una libreria di dominio può puntare solo a file della stessa libreria, mai all'alias `@fleetline/`.

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

```tree
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
import { inject, Service } from '@angular/core';
import { API_BASE_URL } from '@fleetline/shared/data-access-http';
import type { WorkOrder } from '@fleetline/maintenance/model';

@Service()
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

`@Service()` di Angular 22 è la forma breve di `@Injectable({ providedIn: 'root' })`; ottiene le dipendenze solo tramite `inject()`. `HttpClient` usa la Fetch API per impostazione predefinita, quindi la configurazione non ha bisogno di `withFetch()`. `toErrorMessage` vive in `shared/util-http`, una libreria senza framework usata anche dalle versioni React e Vue.

`libs/maintenance/data-access/src/lib/work-orders.effects.ts`

```ts
import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, mergeMap, of, switchMap } from 'rxjs';
import { toErrorMessage } from '@fleetline/shared/util-http';
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
import { inject, Service } from '@angular/core';
import { Store } from '@ngrx/store';
import type { WorkOrder, WorkOrderFilter } from '@fleetline/maintenance/model';
import { workOrdersPage } from './work-orders.events';
import { workOrdersFeature } from './work-orders.feature';

@Service({ autoProvided: false })
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

`autoProvided: false` disattiva la fornitura in `root`. La facade è fornita da `provideWorkOrders()`, quindi esiste esattamente dove esiste la sua feature dello store.

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

Il workspace Angular con tutti i file di questo caso d'uso. Ogni libreria ha anche il proprio `project.json` e `tsconfig.json`; l'albero li mostra solo per l'applicazione e per `data-access`.

```tree
fleetline/
├── nx.json
├── package.json
├── tsconfig.base.json
├── eslint.config.mjs
├── apps/
│   └── ops-portal/
│       ├── project.json
│       ├── tsconfig.json
│       └── src/
│           ├── main.ts
│           ├── index.html
│           ├── styles.scss
│           ├── environments/
│           │   └── environment.ts
│           └── app/
│               ├── app.config.ts
│               └── app.routes.ts
└── libs/
    ├── maintenance/
    │   ├── feature-shell/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           └── maintenance.routes.ts
    │   ├── feature-work-orders/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-orders-page.component.ts
    │   │           └── work-orders-page.component.spec.ts
    │   ├── ui-work-order-card/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-order-card.component.ts
    │   │           ├── work-order-card.component.scss
    │   │           └── status-filter.component.ts
    │   ├── data-access/
    │   │   ├── project.json
    │   │   ├── tsconfig.json
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-orders.api.ts
    │   │           ├── work-orders.events.ts
    │   │           ├── work-orders.feature.ts
    │   │           ├── work-orders.feature.spec.ts
    │   │           ├── work-orders.effects.ts
    │   │           ├── work-orders.facade.ts
    │   │           └── work-orders.providers.ts
    │   └── model/
    │       ├── src/
    │       │   ├── index.ts
    │       │   └── lib/
    │       │       ├── work-order.ts
    │       │       └── work-order.spec.ts
    │       └── testing/
    │           └── src/
    │               └── index.ts
    ├── fleet/
    │   ├── api/
    │   │   └── src/
    │   │       └── index.ts
    │   └── data-access/
    │       └── src/
    │           └── lib/
    │               ├── fleet.api.ts
    │               └── vehicle-summary.store.ts
    ├── identity/
    │   ├── api/
    │   └── data-access/
    └── shared/
        ├── ui-design-system/
        ├── ui-layout/
        ├── data-access-http/
        ├── util-http/
        └── util-date/
```

### 11.1. La libreria ui

`libs/maintenance/ui-work-order-card/src/lib/work-order-card.component.ts`

```ts
import { Component, computed, input, output } from '@angular/core';
import { isOverdue, type WorkOrder } from '@fleetline/maintenance/model';
import { BadgeComponent, MechanicPickerComponent } from '@fleetline/shared/ui-design-system';
import { RelativeDatePipe } from '@fleetline/shared/util-date';

@Component({
  selector: 'mnt-work-order-card',
  imports: [BadgeComponent, MechanicPickerComponent, RelativeDatePipe],
  styleUrl: './work-order-card.component.scss',
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

La card conosce un `WorkOrder` perché `model` è consentito. Riceve `vehicleLabel` come stringa, perché una libreria `ui` di maintenance non può importare `fleet/api`. In Angular 22 `OnPush` è la strategia di change detection predefinita, quindi i componenti non la dichiarano; gli stili della sezione 6.3 arrivano tramite `styleUrl`.

### 11.2. La libreria feature

`libs/maintenance/feature-work-orders/src/lib/work-orders-page.component.ts`

```ts
import { Component, computed, effect, inject, input } from '@angular/core';
import { WorkOrdersFacade } from '@fleetline/maintenance/data-access';
import { StatusFilterComponent, WorkOrderCardComponent } from '@fleetline/maintenance/ui-work-order-card';
import { VehicleSummaryStore } from '@fleetline/fleet/api';
import { EmptyStateComponent, SpinnerComponent } from '@fleetline/shared/ui-design-system';

@Component({
  selector: 'mnt-work-orders-page',
  imports: [StatusFilterComponent, WorkOrderCardComponent, EmptyStateComponent, SpinnerComponent],
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
    provideStoreDevtools({ maxAge: 50 }),
    { provide: API_BASE_URL, useValue: environment.apiUrl },
  ],
};
```

Una nuova applicazione Angular 22 gira senza zone.js e `HttpClient` usa la Fetch API, quindi la configurazione non ha bisogno né di `provideZonelessChangeDetection()` né di `withFetch()`. Questa è l'intera applicazione: due file e un `environment`. `backoffice` monta la stessa `maintenance/feature-shell` con un layout diverso. Una terza applicazione richiederebbe un pomeriggio.

## 12. React e Next.js

L'architettura non dipende da Angular. Librerie, tipi, domini, tag e regola di lint restano gli stessi; Nx genera progetti React e Next.js con `@nx/react` e `@nx/next`. Cambia il modo in cui si implementa ogni tipo di libreria, e Next.js aggiunge una nuova dimensione: il codice che gira solo sul server.

Dividiamo lo stato in due tipi. Lo **stato del server**, cioè i dati che appartengono al backend (l'elenco degli ordini di lavoro), lo gestisce **TanStack Query**. Lo **stato del client**, cioè ciò che esiste solo nel browser (criteri del filtro, selezioni, bozze), lo gestisce **Zustand**. Entrambi sono privati di `data-access`, e la feature vede solo la facade.

Lo stesso workspace con un'applicazione Next.js e tutti i file di questo caso d'uso:

```tree
fleetline/
├── nx.json
├── package.json
├── tsconfig.base.json
├── eslint.config.mjs
├── apps/
│   └── customer/
│       ├── project.json
│       ├── next.config.js
│       ├── tsconfig.json
│       ├── public/
│       └── app/
│           ├── layout.tsx
│           ├── page.tsx
│           └── maintenance/
│               ├── layout.tsx
│               └── depots/
│                   └── [depotId]/
│                       └── work-orders/
│                           ├── page.tsx
│                           └── loading.tsx
└── libs/
    ├── maintenance/
    │   ├── feature-shell/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           └── maintenance-layout.tsx
    │   ├── feature-work-orders/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-orders-route.tsx
    │   │           ├── work-orders-page.tsx
    │   │           └── work-orders-page.spec.tsx
    │   ├── ui-work-order-card/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-order-card.tsx
    │   │           ├── work-order-card.module.scss
    │   │           └── status-filter.tsx
    │   ├── data-access/
    │   │   ├── project.json
    │   │   ├── tsconfig.json
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-orders.http.ts
    │   │           ├── work-orders.queries.ts
    │   │           ├── work-orders.mutations.ts
    │   │           ├── work-orders.store.ts
    │   │           ├── work-orders.store.spec.ts
    │   │           ├── work-orders.provider.tsx
    │   │           └── use-work-orders.ts
    │   ├── data-access-server/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           └── work-orders.ts
    │   └── model/
    │       └── src/
    │           ├── index.ts
    │           └── lib/
    │               └── work-order.ts
    ├── fleet/
    │   ├── api/
    │   │   └── src/
    │   │       └── index.ts
    │   └── data-access/
    │       └── src/
    │           └── lib/
    │               ├── fleet.http.ts
    │               ├── vehicle-summary.store.ts
    │               └── vehicle-summaries.tsx
    ├── identity/
    │   └── api/
    └── shared/
        ├── data-access-query/
        │   └── src/
        │       ├── index.ts
        │       └── lib/
        │           ├── query-client.ts
        │           └── query-provider.tsx
        ├── data-access-server/
        ├── ui-design-system/
        ├── util-http/
        └── util-date/
```

### 12.1. Che cosa corrisponde a che cosa

| Angular | React / Next.js |
|---|---|
| Componente `feature` | Un container server che carica i dati e un client component che li mostra; entrambi in `feature-*`, e il `page.tsx` si limita a renderizzare il container |
| Componente `ui` con `input()`/`output()` | Un componente con props e callback |
| Route della `shell` | Le route su file restano in `apps/<app>/app/`; la libreria shell esporta il layout del dominio con i provider e il controllo dei permessi |
| `provideWorkOrders()` su una route | `<WorkOrdersProvider>` nel layout della shell |
| NgRx Store ed effect per i dati del server | TanStack Query: `queryOptions`, `useQuery`, `useMutation` |
| Signal Store per lo stato del client | Zustand: `createStore` da una factory, esposto tramite Context |
| `createSelector` | Un selector in `useStore(store, selector)`; i valori derivati li calcola la facade e React Compiler li memoizza |
| `switchMap` in un effect | Chiave della query e `signal` nella `queryFn` |
| Reducer ottimistico e `assignFailed` | `onMutate` e `onError` in `useMutation` |
| Servizio facade | Un hook: `useWorkOrders()` |
| `@Service()` con `HttpClient` | Un modulo di funzioni sopra `createApiClient` di `shared/util-http` |
| `inject()` | Context letto con `use()`, solo per ciò che ha uno scope |
| `provideStoreDevtools` | Il middleware `devtools` di Zustand e i React Query Devtools |

Anche Redux Toolkit si adatta a questa architettura: una slice al posto di una feature NgRx, `createEntityAdapter`, il listener middleware al posto degli effect. Fleetline ha scelto TanStack Query e Zustand perché in Next.js la maggior parte dello stato è stato del server, e ciò che resta sul lato client è poco (sezione 17).

### 12.2. Tag per server e client

Nell'App Router un file è o un server component o un client component. Il codice che legge segreti, cookie o il database non deve mai finire nel bundle del browser. Fleetline aggiunge una seconda libreria data-access per dominio e un tag in più:

| Libreria | Tag | Contiene |
|---|---|---|
| `maintenance/data-access` | `type:data-access`, `platform:client` | Client HTTP, query e mutation di TanStack Query, store Zustand, provider, hook facade |
| `maintenance/data-access-server` | `type:data-access`, `platform:server` | Funzioni fetch `server-only` e server action |

La regola di lint della sezione 8.2 contiene già il vincolo `platform:client` → non `platform:server`. Inoltre ogni file solo server inizia con `import 'server-only'`, così un errore fa fallire la build anche dove il lint non gira. La libreria `feature` non ha un tag `platform`: il suo container server importa `data-access-server`, e il client component solo `data-access`.

### 12.3. HTTP e query client

React non ha DI, quindi il servizio HTTP è un semplice modulo. `createApiClient` di `shared/util-http` è un sottile wrapper di `fetch` senza framework: URL di base, JSON ed errori HTTP come eccezioni. Il modulo contiene solo configurazione, mai dati dell'utente, quindi può vivere a livello di modulo.

`libs/maintenance/data-access/src/lib/work-orders.http.ts`

```ts
import { createApiClient } from '@fleetline/shared/util-http';
import type { WorkOrder } from '@fleetline/maintenance/model';

const api = createApiClient(process.env.NEXT_PUBLIC_API_URL ?? '');

export const workOrdersHttp = {
  list: (depotId: string, signal?: AbortSignal) =>
    api.get<WorkOrder[]>(`/depots/${depotId}/work-orders`, { signal }),
  assign: (id: string, assigneeId: string) =>
    api.put<WorkOrder>(`/work-orders/${id}/assignee`, { assigneeId }),
};
```

La query cache, a differenza della configurazione, contiene dati dell'utente. Per questo il `QueryClient` nasce nel provider: uno per scheda del browser e uno separato per ogni richiesta sul server. Il root layout dell'app monta `QueryProvider` una sola volta, come `provideHttpClient()` in `app.config.ts` di Angular.

`libs/shared/data-access-query/src/lib/query-client.ts`

```ts
import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
}
```

`libs/shared/data-access-query/src/lib/query-provider.tsx`

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from './query-client';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

### 12.4. Query e mutation

`libs/maintenance/data-access/src/lib/work-orders.queries.ts`

```ts
import { queryOptions } from '@tanstack/react-query';
import { workOrdersHttp } from './work-orders.http';

export const workOrdersQuery = (depotId: string) =>
  queryOptions({
    queryKey: ['maintenance', 'work-orders', depotId],
    queryFn: ({ signal }) => workOrdersHttp.list(depotId, signal),
  });
```

La chiave contiene `depotId`, e la `queryFn` passa `signal` a `fetch`. Cambiare deposito abbandona la vecchia query e ne interrompe la richiesta: è la semantica di `switchMap` della sezione 9.4. Due componenti che leggono la stessa chiave condividono una sola richiesta e una sola voce in cache. Il file non ha `'use client'`, perché `workOrdersQuery` è importato anche dal container server (sezione 12.7).

`libs/maintenance/data-access/src/lib/work-orders.mutations.ts`

```ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workOrdersHttp } from './work-orders.http';
import { workOrdersQuery } from './work-orders.queries';

export function useAssignWorkOrder(depotId: string) {
  const client = useQueryClient();
  const { queryKey } = workOrdersQuery(depotId);

  return useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string }) => workOrdersHttp.assign(id, assigneeId),
    onMutate: async ({ id, assigneeId }) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData(queryKey);
      client.setQueryData(queryKey, (orders) =>
        orders?.map((order) => (order.id === id ? { ...order, assigneeId } : order)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => client.setQueryData(queryKey, context?.previous),
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
}
```

Lo stesso aggiornamento ottimistico della sezione 9.3: `onMutate` inserisce subito il nuovo meccanico, `onError` ripristina l'elenco precedente e `onSettled` riallinea lo stato con il server. Le mutation non si interrompono a vicenda, quindi due assegnazioni su due card si concludono entrambe, come con `mergeMap`.

### 12.5. Lo stato del client in Zustand

`libs/maintenance/data-access/src/lib/work-orders.store.ts`

```ts
import { createStore } from 'zustand/vanilla';
import { devtools } from 'zustand/middleware';
import type { WorkOrderFilter } from '@fleetline/maintenance/model';

type Criteria = Omit<WorkOrderFilter, 'depotId'>;

export interface WorkOrdersClientState {
  criteria: Criteria;
  filterChanged: (change: Partial<Criteria>) => void;
}

export function createWorkOrdersStore() {
  return createStore<WorkOrdersClientState>()(
    devtools(
      (set) => ({
        criteria: { status: 'all', query: '' },
        filterChanged: (change) =>
          set((state) => ({ criteria: { ...state.criteria, ...change } }), undefined, 'Work Orders Page/filterChanged'),
      }),
      { name: 'maintenance/work-orders' },
    ),
  );
}

export type WorkOrdersStore = ReturnType<typeof createWorkOrdersStore>;
```

Zustand contiene solo ciò che appartiene al client: i criteri del filtro. L'elenco degli ordini vive nella query cache e non viene copiato qui, perché due fonti di verità prima o poi divergono. Le action prendono il nome degli eventi della sezione 9.2 (`filterChanged`, non `setFilter`), e il terzo argomento di `set` registra quell'evento nei Redux DevTools, così il log degli eventi resta, anche senza reducer.

Lo store nasce dalla factory `createStore`, non da `create()` a livello di modulo. Uno store globale in Next.js sarebbe condiviso sul server tra tutte le richieste, cioè tra tutti gli utenti. La factory la chiama il provider:

`libs/maintenance/data-access/src/lib/work-orders.provider.tsx`

```tsx
'use client';

import { createContext, use, useState, type ReactNode } from 'react';
import { createWorkOrdersStore, type WorkOrdersStore } from './work-orders.store';

const WorkOrdersStoreContext = createContext<WorkOrdersStore | null>(null);

export function WorkOrdersProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createWorkOrdersStore);
  return <WorkOrdersStoreContext value={store}>{children}</WorkOrdersStoreContext>;
}

export function useWorkOrdersStore(): WorkOrdersStore {
  const store = use(WorkOrdersStoreContext);
  if (!store) throw new Error('useWorkOrdersStore must be used inside <WorkOrdersProvider>');
  return store;
}
```

`WorkOrdersProvider` è il corrispettivo di `provideWorkOrders()`. Lo monta il layout della shell (sezione 12.8), quindi lo store esiste esattamente dove esistono le route di maintenance. React 19 renderizza il context direttamente come provider e lo legge con `use()`.

### 12.6. L'hook facade

`libs/maintenance/data-access/src/lib/use-work-orders.ts`

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { isOverdue, matchesFilter, type WorkOrder } from '@fleetline/maintenance/model';
import { toErrorMessage } from '@fleetline/shared/util-http';
import { useAssignWorkOrder } from './work-orders.mutations';
import { useWorkOrdersStore } from './work-orders.provider';
import { workOrdersQuery } from './work-orders.queries';

export function useWorkOrders(depotId: string) {
  const store = useWorkOrdersStore();
  const criteria = useStore(store, (state) => state.criteria);
  const filterChanged = useStore(store, (state) => state.filterChanged);
  const query = useQuery(workOrdersQuery(depotId));
  const assignment = useAssignWorkOrder(depotId);

  const all = query.data ?? [];
  const filter = { ...criteria, depotId };
  const failure = query.error ?? assignment.error;

  return {
    visible: all.filter((order) => matchesFilter(order, filter)),
    overdueCount: all.filter((order) => isOverdue(order, new Date())).length,
    filter,
    loading: query.isPending,
    error: failure ? toErrorMessage(failure) : null,
    filterBy: filterChanged,
    assign: (order: WorkOrder, assigneeId: string) => assignment.mutate({ id: order.id, assigneeId }),
  };
}
```

L'hook ha gli stessi membri della facade Angular, tranne `open()`: la query è indicizzata per `depotId`, quindi non serve aprirla. La facade non ha effetti collaterali. Non registra nulla e non invia nulla al montaggio, quindi può usarla un numero qualsiasi di componenti, per esempio un contatore degli ordini in ritardo nell'header, senza una seconda richiesta.

Ogni campo dello store ha un selector separato. In Zustand 5 un selector che restituisce un nuovo oggetto richiede `useShallow`, altrimenti il render va in loop. `visible` e `overdueCount` vengono calcolati a ogni render; React Compiler li memoizza automaticamente, quindi la facade non ha bisogno di `useMemo` né di `useCallback`.

`libs/maintenance/data-access/src/index.ts`

```ts
export { workOrdersQuery } from './lib/work-orders.queries';
export { WorkOrdersProvider } from './lib/work-orders.provider';
export { useWorkOrders } from './lib/use-work-orders';
```

Tre export. Lo store Zustand, le mutation e il client HTTP sono privati.

### 12.7. Feature, ui e route

La feature ha due container. `WorkOrdersRoute` è un server component: carica gli ordini tramite `data-access-server`, con i cookie dell'utente, e li passa alla query cache tramite `HydrationBoundary`. `WorkOrdersPage` è un client component: legge la facade e compone le librerie `ui`.

`libs/maintenance/feature-work-orders/src/lib/work-orders-route.tsx`

```tsx
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { workOrdersQuery } from '@fleetline/maintenance/data-access';
import { listWorkOrders } from '@fleetline/maintenance/data-access-server';
import { makeQueryClient } from '@fleetline/shared/data-access-query';
import { WorkOrdersPage } from './work-orders-page';

export async function WorkOrdersRoute({ depotId }: { depotId: string }) {
  const client = makeQueryClient();
  await client.prefetchQuery({ ...workOrdersQuery(depotId), queryFn: () => listWorkOrders(depotId) });

  return (
    <HydrationBoundary state={dehydrate(client)}>
      <WorkOrdersPage depotId={depotId} />
    </HydrationBoundary>
  );
}
```

`libs/maintenance/data-access-server/src/lib/work-orders.ts`

```ts
import 'server-only';
import { apiFetch } from '@fleetline/shared/data-access-server';
import type { WorkOrder } from '@fleetline/maintenance/model';

export function listWorkOrders(depotId: string): Promise<WorkOrder[]> {
  return apiFetch<WorkOrder[]>(`/depots/${depotId}/work-orders`);
}
```

Il primo render nel browser ha già i dati, senza una seconda richiesta e senza spinner; il `loading.tsx` dell'app si vede solo durante il caricamento sul server.

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
import styles from './work-order-card.module.scss';

interface WorkOrderCardProps {
  workOrder: WorkOrder;
  vehicleLabel: string;
  onAssign: (assigneeId: string) => void;
}

export function WorkOrderCard({ workOrder, vehicleLabel, onAssign }: WorkOrderCardProps) {
  const overdue = isOverdue(workOrder, new Date());

  return (
    <article className={overdue ? `${styles.card} ${styles['card--overdue']}` : styles.card}>
      <header>
        <h3>{workOrder.title}</h3>
        <Badge tone={workOrder.priority === 'urgent' ? 'danger' : 'neutral'}>{workOrder.priority}</Badge>
      </header>
      <p className={styles.vehicle}>{vehicleLabel}</p>
      <p className={styles.due}>{formatRelative(workOrder.dueAt)}</p>
      <MechanicPicker depotId={workOrder.depotId} value={workOrder.assigneeId} onChange={onAssign} />
    </article>
  );
}
```

`work-order-card.module.scss` è il file della sezione 6.3. CSS Modules trasforma `.card` in un nome unico in tutta l'applicazione, quindi una classe di una libreria non può finire in un'altra.

I file di route nell'app sono di poche righe ciascuno.

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
import { WorkOrdersRoute } from '@fleetline/maintenance/feature-work-orders';

export default async function Page({ params }: { params: Promise<{ depotId: string }> }) {
  const { depotId } = await params;
  return <WorkOrdersRoute depotId={depotId} />;
}
```

### 12.8. La shell e l'API di un altro dominio

Il layout della shell è un server component. Prima verifica il permesso lato server, poi monta i provider del dominio. In Angular lo fanno `canActivate` e `providers` sulla route (sezione 11.3).

`libs/maintenance/feature-shell/src/lib/maintenance-layout.tsx`

```tsx
import type { ReactNode } from 'react';
import { WorkOrdersProvider } from '@fleetline/maintenance/data-access';
import { VehicleSummaryProvider } from '@fleetline/fleet/api';
import { requirePermission } from '@fleetline/identity/api';

export async function MaintenanceLayout({ children }: { children: ReactNode }) {
  await requirePermission('maintenance:read');

  return (
    <VehicleSummaryProvider>
      <WorkOrdersProvider>{children}</WorkOrdersProvider>
    </VehicleSummaryProvider>
  );
}
```

In Next.js un layout non viene smontato durante la navigazione tra le pagine di maintenance, quindi gli store sopravvivono alla navigazione all'interno del dominio e spariscono quando il pianificatore ne esce.

`useVehicleSummaries` di `fleet/api` è il corrispettivo del `VehicleSummaryStore` della sezione 7.1, scritto in Zustand: maintenance passa un elenco di id e fleet carica le targhe mancanti in una sola richiesta.

`libs/fleet/data-access/src/lib/vehicle-summary.store.ts`

```ts
import { createStore } from 'zustand/vanilla';
import type { VehicleSummary } from '@fleetline/fleet/model';
import { toErrorMessage } from '@fleetline/shared/util-http';
import { fleetHttp } from './fleet.http';

export interface VehicleSummaryState {
  entities: Record<string, VehicleSummary>;
  ensureLoaded: (ids: readonly string[]) => Promise<void>;
}

export function createVehicleSummaryStore() {
  return createStore<VehicleSummaryState>()((set, get) => ({
    entities: {},
    ensureLoaded: async (ids) => {
      const missing = [...new Set(ids)].filter((id) => !get().entities[id]);
      if (missing.length === 0) return;
      try {
        const vehicles = await fleetHttp.summaries(missing);
        set((state) => ({
          entities: { ...state.entities, ...Object.fromEntries(vehicles.map((vehicle) => [vehicle.id, vehicle])) },
        }));
      } catch (error) {
        console.error('fleet summaries', toErrorMessage(error));
      }
    },
  }));
}

export type VehicleSummaryStore = ReturnType<typeof createVehicleSummaryStore>;
```

`libs/fleet/data-access/src/lib/vehicle-summaries.tsx`

```tsx
'use client';

import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createVehicleSummaryStore, type VehicleSummaryStore } from './vehicle-summary.store';

const VehicleSummaryContext = createContext<VehicleSummaryStore | null>(null);

export function VehicleSummaryProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createVehicleSummaryStore);
  return <VehicleSummaryContext value={store}>{children}</VehicleSummaryContext>;
}

export function useVehicleSummaries(ids: readonly string[]) {
  const store = use(VehicleSummaryContext);
  if (!store) throw new Error('useVehicleSummaries must be used inside <VehicleSummaryProvider>');
  const entities = useStore(store, (state) => state.entities);
  const key = ids.join(',');

  useEffect(() => {
    void store.getState().ensureLoaded(key ? key.split(',') : []);
  }, [store, key]);

  return entities;
}
```

L'effect dipende da `key`, non dall'array, perché la feature crea un nuovo array a ogni render.

`libs/fleet/api/src/index.ts`

```ts
export type { VehicleSummary, VehicleId } from '@fleetline/fleet/model';
export { VehicleSummaryProvider, useVehicleSummaries } from '@fleetline/fleet/data-access';
export { VehicleBadge } from '@fleetline/fleet/ui-vehicle-badge';
```

### 12.9. Insidie specifiche di Next.js

- **`'use client'` è un confine a sé.** Mettetelo nei client component, nei provider e negli hook, mai in `model`, `util` o nel file con le `queryOptions`, che importa anche il server.
- **Nessuno store in una variabile di modulo.** `create()` di Zustand o `new QueryClient()` a livello di modulo condivide lo stato tra tutte le richieste sul server. Store e query client nascono nei provider.
- **Zustand non copia i dati del server.** L'elenco dall'API vive nella query cache; una sua copia nello store è una seconda fonte di verità.
- **Non importate una libreria server in un file client "solo per il tipo".** I tipi vivono in `model`.
- **Le server action appartengono a `data-access-server`.** Una feature le importa tramite re-export di `data-access` solo se i tag di lint lo consentono; altrimenti la pagina le passa come props.
- **I file di route restano sottili.** Un `page.tsx` che accumula logica è la versione Next.js di un app component Angular obeso.

## 13. Vue e Nuxt

Vue si traduce in modo ancora più diretto, perché i setup store di Pinia somigliano molto a un NgRx Signal Store, e i composable sono la forma naturale di una facade. Nx genera progetti Vue e Nuxt con `@nx/vue` e `@nx/nuxt`.

Lo stesso workspace con un'applicazione Nuxt e tutti i file di questo caso d'uso:

```tree
fleetline/
├── nx.json
├── package.json
├── tsconfig.base.json
├── eslint.config.mjs
├── apps/
│   └── backoffice/
│       ├── project.json
│       ├── nuxt.config.ts
│       ├── tsconfig.json
│       ├── public/
│       └── app/
│           ├── app.vue
│           ├── layouts/
│           │   ├── default.vue
│           │   └── maintenance.vue
│           ├── middleware/
│           │   └── maintenance-read.ts
│           └── pages/
│               ├── index.vue
│               └── maintenance/
│                   └── depots/
│                       └── [depotId]/
│                           └── work-orders.vue
└── libs/
    ├── maintenance/
    │   ├── feature-shell/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── MaintenanceLayout.vue
    │   │           └── require-maintenance-read.ts
    │   ├── feature-work-orders/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── WorkOrdersPage.vue
    │   │           └── WorkOrdersPage.spec.ts
    │   ├── ui-work-order-card/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── WorkOrderCard.vue
    │   │           └── StatusFilter.vue
    │   ├── data-access/
    │   │   ├── project.json
    │   │   ├── tsconfig.json
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-orders.http.ts
    │   │           ├── work-orders.store.ts
    │   │           ├── work-orders.store.spec.ts
    │   │           ├── work-orders.providers.ts
    │   │           └── use-work-orders.ts
    │   └── model/
    │       └── src/
    │           ├── index.ts
    │           └── lib/
    │               └── work-order.ts
    ├── fleet/
    │   ├── api/
    │   │   └── src/
    │   │       └── index.ts
    │   └── data-access/
    │       └── src/
    │           └── lib/
    │               ├── vehicle-summary.store.ts
    │               └── use-vehicle-summaries.ts
    ├── identity/
    │   └── api/
    └── shared/
        ├── ui-design-system/
        ├── ui-layout/
        ├── util-http/
        └── util-date/
```

### 13.1. Che cosa corrisponde a che cosa

| Angular | Vue / Nuxt |
|---|---|
| Componente `feature` | Un single-file component in `feature-*`; la pagina in `apps/<app>/app/pages/` si limita a renderizzarlo |
| Componente `ui` | Un componente con `defineProps` e `defineEmits`, stili in `<style scoped>` |
| Route della `shell` | Le route su file restano nell'app; la libreria shell esporta il layout e il route middleware, e l'app si limita a riesportarli |
| `provideWorkOrders()` su una route | `provideWorkOrders()` chiamato nel layout della shell |
| NgRx Store / Signal Store | Pinia (setup store) |
| Selector | `computed` dentro lo store |
| Effect | Action asincrone nello store; `useAsyncData` per il caricamento durante il rendering lato server |
| `switchMap` in un effect | `AbortController` in un'action dello store |
| Servizio facade | Un composable: `useWorkOrders()` |
| `@Service()` con `HttpClient` | Il composable `useWorkOrdersHttp()` con `$fetch.create` e `useRuntimeConfig()` |
| `provideStoreDevtools` | Vue DevTools con la scheda di Pinia |

Pinia non separa action e reducer. Questo elimina il log degli eventi e il time-travel debugging di NgRx, ma elimina anche gran parte della cerimonia. Per l'architettura non cambia nulla: lo store è privato di `data-access`, e il composable è la porta.

### 13.2. Disattivate gli auto-import per le librerie

Nuxt importa automaticamente componenti e composable. In una piccola app è comodo, per i confini è fatale: **un import mai scritto non può passare dal lint.** Se una feature di billing può usare `useWorkOrders()` senza una riga `import`, la regola di lint non vede mai l'attraversamento.

Le regole nelle applicazioni Nuxt di Fleetline:

- le librerie si importano con istruzioni `import` esplicite tramite i loro path alias, mai registrate come cartelle di auto-import;
- i domini non sono layer di Nuxt, perché i layer importano automaticamente nell'app i propri componenti e composable;
- l'app mantiene gli auto-import delle API di Vue e Nuxt solo nelle proprie `pages/` e `layouts/`, e il codice delle librerie importa le funzioni di Nuxt da `#imports`;
- i layout e i middleware a cui una pagina fa riferimento per nome in `definePageMeta` sono nell'app riesportazioni di una riga da `feature-shell` (sezione 13.5), perché un nome in una stringa il lint non lo può verificare.

`apps/backoffice/nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
  components: { dirs: [] },
  imports: { scan: false },
  css: ['../../libs/shared/ui-design-system/src/styles/tokens.scss'],
  runtimeConfig: { public: { apiUrl: '' } },
});
```

### 13.3. Lo store

Il servizio HTTP è un composable. Prende la configurazione dal `runtimeConfig` dell'app, cioè dalla DI di Nuxt, come `WorkOrdersHttp` in Angular prende `API_BASE_URL` da `inject()`.

`libs/maintenance/data-access/src/lib/work-orders.http.ts`

```ts
import { useRuntimeConfig } from '#imports';
import type { WorkOrder } from '@fleetline/maintenance/model';

export function useWorkOrdersHttp() {
  const api = $fetch.create({ baseURL: useRuntimeConfig().public.apiUrl });

  return {
    list: (depotId: string, signal?: AbortSignal) => api<WorkOrder[]>(`/depots/${depotId}/work-orders`, { signal }),
    assign: (id: string, assigneeId: string) =>
      api<WorkOrder>(`/work-orders/${id}/assignee`, { method: 'PUT', body: { assigneeId } }),
  };
}
```

`libs/maintenance/data-access/src/lib/work-orders.store.ts`

```ts
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  byDueDate, emptyFilter, isOverdue, matchesFilter,
  type WorkOrder, type WorkOrderFilter,
} from '@fleetline/maintenance/model';
import { toErrorMessage } from '@fleetline/shared/util-http';
import { useWorkOrdersHttp } from './work-orders.http';

export const useWorkOrdersStore = defineStore('maintenance/work-orders', () => {
  const http = useWorkOrdersHttp();

  const byId = ref<Record<string, WorkOrder>>({});
  const filter = ref<WorkOrderFilter>({ ...emptyFilter });
  const error = ref<string | null>(null);
  let inflight: AbortController | undefined;

  const all = computed(() => Object.values(byId.value).sort(byDueDate));
  const visible = computed(() => all.value.filter((order) => matchesFilter(order, filter.value)));
  const overdueCount = computed(() => all.value.filter((order) => isOverdue(order, new Date())).length);

  async function open(depotId: string) {
    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    filter.value = { ...emptyFilter, depotId };
    error.value = null;
    try {
      const orders = await http.list(depotId, controller.signal);
      byId.value = Object.fromEntries(orders.map((order) => [order.id, order]));
    } catch (cause) {
      if (!controller.signal.aborted) error.value = toErrorMessage(cause);
    }
  }

  function filterBy(change: Partial<Omit<WorkOrderFilter, 'depotId'>>) {
    filter.value = { ...filter.value, ...change };
  }

  async function assign(id: string, assigneeId: string) {
    const order = byId.value[id];
    if (!order) return;
    byId.value[id] = { ...order, assigneeId };
    try {
      byId.value[id] = await http.assign(id, assigneeId);
    } catch (cause) {
      byId.value[id] = order;
      error.value = toErrorMessage(cause);
    }
  }

  function $reset() {
    inflight?.abort();
    byId.value = {};
    filter.value = { ...emptyFilter };
    error.value = null;
  }

  return { byId, filter, error, visible, overdueCount, open, filterBy, assign, $reset };
});
```

`open` interrompe la richiesta precedente prima di inviarne una nuova: è lo `switchMap` della sezione 9.4 scritto a mano. Senza, un cambio rapido di deposito lascerebbe che una risposta più vecchia sovrascriva una più recente. `assign` non interrompe nulla, come `mergeMap`, e in caso di errore ripristina l'ordine salvato. Gli errori li cattura lo store e li scrive in `error`, come il reducer della sezione 9.3.

`byId`, `filter` ed `error` vengono restituiti perché Pinia li serializzi nel payload renderizzato dal server e il browser parta con lo stesso stato. `inflight` non viene restituito, quindi resta privato dell'istanza dello store. Un setup store non riceve `$reset` gratis, quindi lo definisce da sé.

### 13.4. Il composable facade e lo scope dello store

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

Pinia tiene uno store per applicazione, e sul server uno per richiesta. Senza un passo in più, lo stato di maintenance resterebbe in memoria dopo l'uscita dal dominio. `provideWorkOrders()` dà lo stesso scope di un provider su una route in Angular:

`libs/maintenance/data-access/src/lib/work-orders.providers.ts`

```ts
import { onUnmounted } from 'vue';
import { useWorkOrdersStore } from './work-orders.store';

export function provideWorkOrders() {
  const store = useWorkOrdersStore();
  onUnmounted(() => store.$reset());
}
```

`onUnmounted` non viene eseguito sul server, quindi lo stato finisce nel payload prima dell'idratazione, e nel browser sparisce quando il pianificatore lascia maintenance.

`libs/maintenance/data-access/src/index.ts`

```ts
export { provideWorkOrders } from './lib/work-orders.providers';
export { useWorkOrders } from './lib/use-work-orders';
```

Un team che preferisce la separazione tra stato del server e stato del client come in React usa **Pinia Colada**, il livello di query ufficiale per Pinia: il corrispettivo di TanStack Query, con chiavi, cache e mutation ottimistiche. La facade e la feature non cambiano.

### 13.5. Feature, ui, shell e pagina

`libs/maintenance/feature-work-orders/src/lib/WorkOrdersPage.vue`

```vue
<script setup lang="ts">
import { useWorkOrders } from '@fleetline/maintenance/data-access';
import { StatusFilter, WorkOrderCard } from '@fleetline/maintenance/ui-work-order-card';
import { useVehicleSummaries } from '@fleetline/fleet/api';
import { EmptyState, Spinner } from '@fleetline/shared/ui-design-system';

const { depotId } = defineProps<{ depotId: string }>();

const { visible, overdueCount, filter, loading, filterBy, assign } = await useWorkOrders(() => depotId);
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

Vue 3.5 mantiene la reattività delle props dopo la destrutturazione, quindi `() => depotId` segue il cambio di route.

`libs/maintenance/ui-work-order-card/src/lib/WorkOrderCard.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { isOverdue, type WorkOrder } from '@fleetline/maintenance/model';
import { Badge, MechanicPicker } from '@fleetline/shared/ui-design-system';
import { formatRelative } from '@fleetline/shared/util-date';

const { workOrder, vehicleLabel } = defineProps<{ workOrder: WorkOrder; vehicleLabel: string }>();
const emit = defineEmits<{ assign: [assigneeId: string] }>();

const overdue = computed(() => isOverdue(workOrder, new Date()));
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

<style scoped lang="scss">
.card {
  display: grid;
  gap: var(--ds-space-2);
  padding: var(--ds-space-3);
  border-radius: var(--ds-radius);
  background: var(--ds-surface);
  color: var(--ds-text);
}

.card--overdue {
  border-left: 4px solid var(--ds-danger);
}

.vehicle,
.due {
  color: var(--ds-text-muted);
}
</style>
```

La shell esporta un layout che chiama `provideWorkOrders()` e un middleware con il controllo dei permessi:

`libs/maintenance/feature-shell/src/lib/MaintenanceLayout.vue`

```vue
<script setup lang="ts">
import { provideWorkOrders } from '@fleetline/maintenance/data-access';
import { AppLayout } from '@fleetline/shared/ui-layout';

provideWorkOrders();
</script>

<template>
  <AppLayout>
    <slot />
  </AppLayout>
</template>
```

`libs/maintenance/feature-shell/src/lib/require-maintenance-read.ts`

```ts
import { abortNavigation, defineNuxtRouteMiddleware } from '#imports';
import { hasPermission } from '@fleetline/identity/api';

export const requireMaintenanceRead = defineNuxtRouteMiddleware(() => {
  if (!hasPermission('maintenance:read')) return abortNavigation({ statusCode: 403 });
});
```

L'app si limita a riesportarli, così il lint vede l'import da `feature-shell`:

`apps/backoffice/app/layouts/maintenance.vue`

```vue
<script setup lang="ts">
import { MaintenanceLayout } from '@fleetline/maintenance/feature-shell';
</script>

<template>
  <MaintenanceLayout>
    <slot />
  </MaintenanceLayout>
</template>
```

`apps/backoffice/app/middleware/maintenance-read.ts`

```ts
export { requireMaintenanceRead as default } from '@fleetline/maintenance/feature-shell';
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

In Vue `useVehicleSummaries` di `fleet/api` è un piccolo store Pinia con un'action `ensureLoaded`, uguale a quella della sezione 12.8, e un composable che la chiama:

`libs/fleet/data-access/src/lib/use-vehicle-summaries.ts`

```ts
import { storeToRefs } from 'pinia';
import { toValue, watch, type MaybeRefOrGetter } from 'vue';
import { useVehicleSummaryStore } from './vehicle-summary.store';

export function useVehicleSummaries(ids: MaybeRefOrGetter<readonly string[]>) {
  const store = useVehicleSummaryStore();
  watch(() => toValue(ids).join(','), (key) => store.ensureLoaded(key ? key.split(',') : []), { immediate: true });
  return storeToRefs(store).entities;
}
```

### 13.6. Insidie specifiche di Nuxt

- **Il lint dei file `.vue`** richiede `vue-eslint-parser` nella configurazione di ESLint, altrimenti la regola di confine salta in silenzio ogni componente. Per questo il pattern `files` della sezione 8.2 include `**/*.vue`.
- **Uno store per richiesta.** Pinia con `@pinia/nuxt` ne crea già uno per richiesta sul server. Non tenete mai stato in un `ref` a livello di modulo in una libreria: sul server sarebbe condiviso tra gli utenti.
- **`useAsyncData` appartiene alla facade**, non allo store. Lo store resta utilizzabile dai test e dal codice solo client.
- **Un `await` al livello più alto di `<script setup>`** richiede un `<Suspense>` sopra il componente. Le pagine di Nuxt ce l'hanno; un componente feature renderizzato altrove va avvolto in uno.
- **Solo stili `scoped`.** Un blocco `<style>` senza `scoped` in una libreria finisce nel CSS globale di tutta l'applicazione.

## 14. Fianco a fianco

:::diagram fe-frameworks

Lo stesso caso d'uso in tre framework, file per file:

| Libreria | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| `model` | `work-order.ts` | lo stesso file | lo stesso file |
| stato in `data-access` | `createFeature` + `createEntityAdapter` | TanStack Query (server) + Zustand (client) | setup store di Pinia |
| effect in `data-access` | `createEffect` funzionale | `queryFn` e `useMutation` | action asincrone dello store + `useAsyncData` |
| concorrenza | `switchMap` / `mergeMap` | chiave della query + `signal` | `AbortController` |
| servizio HTTP | `@Service()` + `HttpClient` | modulo sopra `createApiClient` | composable con `$fetch.create` |
| facade in `data-access` | `WorkOrdersFacade` (signal) | `useWorkOrders()` (valori) | `useWorkOrders()` (ref) |
| scope dello stato | `provideWorkOrders()` sulla route | `<WorkOrdersProvider>` nel layout della shell | `provideWorkOrders()` nel layout della shell |
| `ui` | `input()` / `output()` | props / callback | `defineProps` / `defineEmits` |
| stili `ui` | `styleUrl`, incapsulamento emulato | CSS Modules | `<style scoped>` |
| `feature` | componente standalone, `OnPush` predefinito | container server + client component | single-file component |
| `shell` | `Routes` con `providers` e `canActivate` | layout server con provider | layout + route middleware |
| route dell'app | `loadChildren` | `page.tsx` | `pages/*.vue` |
| facade finta nei test | provider in `TestBed` | `vi.mock` del modulo | `vi.mock` del modulo |
| confini | `@nx/enforce-module-boundaries` | la stessa regola | la stessa regola, con `vue-eslint-parser` |

Ciò che resta identico in tutti e tre: la cartella di ogni file, i tag, la regola di lint, la libreria `model`, i membri della facade (in React senza `open()`, perché la query si apre da sola), gli stili dei componenti e i test della libreria `model`. Chi passa da un'app di Fleetline all'altra deve reimparare solo il framework.

## 15. Test per tipo di libreria

Ogni tipo ha un genere di test naturale, e i confini rendono ognuno di essi economico.

| Tipo | Test | Velocità | Che cosa simula |
|---|---|---|---|
| `model`, `util` | Semplici unit test, senza framework | millisecondi | niente |
| reducer e selector di `data-access` | Test di funzioni pure | millisecondi | niente |
| effect, query e mutation di `data-access` | Test con la rete simulata da MSW | veloce | HTTP |
| facade | Integrazione con lo store reale | veloce | HTTP (MSW) |
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

In React e Vue la facade non arriva tramite DI, quindi il test della feature sostituisce il modulo. Il principio è lo stesso: il componente non vede nulla oltre alla facade e alle librerie `ui`.

`libs/maintenance/feature-work-orders/src/lib/work-orders-page.spec.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { useWorkOrders } from '@fleetline/maintenance/data-access';
import { aWorkOrder } from '@fleetline/maintenance/model/testing';
import { WorkOrdersPage } from './work-orders-page';

vi.mock('@fleetline/maintenance/data-access', () => ({ useWorkOrders: vi.fn() }));
vi.mock('@fleetline/fleet/api', () => ({ useVehicleSummaries: () => ({}) }));
vi.mock('@fleetline/maintenance/ui-work-order-card', () => ({
  StatusFilter: () => null,
  WorkOrderCard: ({ onAssign }: { onAssign: (assigneeId: string) => void }) => (
    <button type="button" onClick={() => onAssign('mech-7')}>
      assign
    </button>
  ),
}));

it('assigns the chosen mechanic', async () => {
  const order = aWorkOrder({ id: 'wo-1' });
  const assign = vi.fn();
  vi.mocked(useWorkOrders).mockReturnValue({
    visible: [order],
    overdueCount: 0,
    filter: { depotId: 'd-1', status: 'all', query: '' },
    loading: false,
    error: null,
    filterBy: vi.fn(),
    assign,
  });

  render(<WorkOrdersPage depotId="d-1" />);
  await userEvent.click(screen.getByRole('button', { name: 'assign' }));

  expect(useWorkOrders).toHaveBeenCalledWith('d-1');
  expect(assign).toHaveBeenCalledWith(order, 'mech-7');
});
```

In Vue lo stesso test si scrive con `@vue/test-utils` e lo stesso `vi.mock`, e un componente con `await` in `<script setup>` si monta con `mountSuspended` di `@nuxt/test-utils`. Nei test di integrazione della facade gli store Pinia li sostituisce `createTestingPinia` di `@pinia/testing`, e la rete in tutti e tre i framework la simula MSW, così i test di `data-access` non dipendono da come il servizio HTTP riceve la configurazione.

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
Entrambi si adattano all'architettura, entrambi vivono in `data-access`, e la facade nasconde la scelta. Fleetline usa lo Store dove un log degli eventi e i devtools ripagano (manutenzione, pianificazione) e il Signal Store per i domini più semplici (riepiloghi dei veicoli, notifiche). Il plugin degli eventi del Signal Store (`@ngrx/signals/events`) gli porta eventi in stile Flux, quindi il log degli eventi non è più l'unico argomento a favore dello Store classico.

**E lo stato del server in Angular?**
In Angular 22 `resource`, `rxResource` e `httpResource` sono stabili, e quando due richieste si sovrappongono conta solo la più recente, come con `switchMap`. Per i dati che si leggono soprattutto, sono il corrispettivo Angular di TanStack Query e Pinia Colada: `data-access` contiene un `httpResource` e la facade ne espone `value()` e `isLoading()`. La feature non cambia.

**Perché in React Zustand e TanStack Query, e non Redux Toolkit?**
Entrambe le varianti rispettano le stesse regole di confine ed entrambe si nascondono dietro la stessa facade. Redux Toolkit offre ciò che offre NgRx Store: slice, `createEntityAdapter`, listener middleware e un log degli eventi completo. In Next.js però la maggior parte dello stato è stato del server, e ciò che resta sul lato client è poco, quindi Fleetline tiene i dati nella query cache e il resto in piccoli store Zustand con action con nome nei devtools. Un team che ha bisogno di un log degli eventi in un grande dominio client può usare lì Redux Toolkit.

**Una facade non è solo un livello in più?**
Sì, e la sezione 10 dice quando ne vale la pena. In React e Vue, l'hook o il composable è comunque il modo idiomatico di condividere l'accesso allo stato, quindi lì la facade non costa quasi nulla.

**Ogni dominio deve avere una libreria `api` fin dal primo giorno?**
No. Createla la prima volta che un altro dominio ha bisogno di qualcosa. Prima di allora il dominio è completamente privato, che è il miglior confine possibile.

**Sono micro front-end?**
No. Tutto qui viene compilato in un'unica applicazione per ogni cartella di app. Lo stesso taglio per domini è la giuntura naturale per i micro front-end in futuro, se l'organizzazione avrà mai bisogno di deploy indipendenti.

**React, Vue e Angular possono davvero condividere librerie?**
Condividono le librerie `model` e `util`, con il tag `framework:agnostic`, e i builder dei dati di test. Componenti e store sono specifici di ogni framework. In Fleetline circa un quinto del codice front-end è agnostico rispetto al framework.

**Dove approfondire?**
Gli articoli di Manfred Steyer e l'e-book gratuito *Enterprise Angular* su [angulararchitects.io](https://www.angulararchitects.io/), la [documentazione di Nx](https://nx.dev/) sui confini tra moduli, [Sheriff](https://github.com/softarc-consulting/sheriff), la [documentazione di NgRx](https://ngrx.io/), [TanStack Query](https://tanstack.com/query), [Zustand](https://zustand.docs.pmnd.rs/) e [Pinia](https://pinia.vuejs.org/).
