This guide describes how we structure large front-ends: one workspace, many applications, many teams, and a rule for every file. We build it with **Nx** and **Angular**, keep shared state in **NgRx**, and put an **optional facade** in front of the store. Then we show the same architecture, rule for rule, in **React with Next.js** and in **Vue with Nuxt**.

The architecture is not ours. Its core was worked out and published by **Manfred Steyer**, Angular trainer and consultant, Google Developer Expert for Angular and the person behind [ANGULARarchitects](https://www.angulararchitects.io/). His idea is to cut a front-end **vertically by domain** and **horizontally by library type**, to let domains talk only through an explicit API, and to let a tool, not a wiki, enforce those lines. Section 2 lists exactly what comes from him, what comes from Nx and what we added.

A small example cannot show why any of this matters. One domain with one store fits in anyone's head. So every example on this page comes from one realistic workspace: **Fleetline**, a fleet maintenance platform with three applications, nine domains, about seventy libraries and five teams. It is introduced in section 5 and used in every section after it.

> Written for teams that already have, or will soon have, more than one front-end application, more than one team, or more than about 50,000 lines of front-end code. Below that size, read section 16.4 first.

## 1. Why front-ends need an architecture

A front-end grows the same way every time. The first year there is one application and a `src/app` folder with `components`, `services` and `store`. By the third year the same project usually looks like this:

- `shared/` holds three hundred files, and half of them are used by exactly one feature;
- a component in billing imports a selector from maintenance because it was there;
- the root store has forty feature keys, and nobody knows which ones a page needs;
- a second application is created by copying the first one, because extracting code is too hard;
- one change to a date helper rebuilds and retests the whole repository;
- a new developer, or a coding agent, needs days to learn where a feature lives and what it may use.

None of this comes from bad engineers. It comes from the absence of a shared answer to two questions: **where does this file go**, and **who may import whom**. Without an answer the nearest folder wins, and the nearest folder is always `shared/`.

The architecture in this guide answers both questions once, for every kind of front-end code, and makes the answer **mechanical**: a lint rule rejects an import that crosses a line, in the editor and in CI.

### 1.1. Goals

1. **Findability.** Knowing the name of a feature tells you its folder, in every application.
2. **Local changes.** A change inside one domain cannot break another domain, because the other domain cannot see its internals.
3. **Fast feedback at scale.** CI builds and tests only the libraries a change affects.
4. **Parallel teams.** A team owns domains, not files scattered across `shared/`.
5. **Replaceable state.** A feature does not know whether its data comes from NgRx, a Signal Store, a cache or the server.
6. **One rulebook for three frameworks.** Angular, React and Vue applications in the same company follow the same structure, and framework-free code is shared between them.

### 1.2. Non-goals

- It does not choose your back-end, your design system or your CSS.
- It does not require micro front-ends. Everything here works in one deployable application; micro front-ends are a later, separate decision.
- It does not replace your product rules. It says where code lives and what it may use; your project says what the code must do.

## 2. Where the idea comes from

The architecture combines three sources. We name them because each one is worth reading in the original.

| Source | What it contributes |
|---|---|
| **Nx** (the Nrwl team, *Enterprise Angular Monorepo Patterns*) | The monorepo itself, libraries with a public `index.ts`, and the classic library types: `feature`, `ui`, `data-access`, `util`. Tags on projects and the `@nx/enforce-module-boundaries` lint rule. |
| **Manfred Steyer** (ANGULARarchitects, the e-book *Enterprise Angular*, his articles on strategic design with Nx) | Applying Domain-Driven Design to front-ends: **domains as vertical slices**, **library types as horizontal layers**, two tag dimensions (`domain:*` and `type:*`) checked by a linter, an **API library** as the only door between domains, and a **facade** between the UI and the state management. Later also **Sheriff**, a boundary checker for projects without Nx. |
| **NgRx** (and Redux before it) | One store for shared state, changes through actions and pure reducers, side effects in effects, reads through memoized selectors. |

What we decided on top, in this guide:

- a separate `model` type for framework-free types and pure domain functions, so that `ui` libraries never depend on state management;
- a `shell` type of its own (Nx's `feature-shell`) that owns a domain's routes and providers;
- a third tag dimension, `framework:*`, so Angular, React and Vue applications can live in one workspace and share `model` and `util` code;
- a fourth dimension for Next.js, `platform:server` and `platform:client`;
- the rule of section 10 for when a facade pays off and when to skip it;
- the React/Next and Vue/Nuxt translations in sections 12 and 13.

When something on this page disagrees with the original articles, the original is the reference for the idea; this page is the reference for how we apply it.

## 3. The architecture on one page

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

Six sentences to remember:

1. **Every library has one domain and one type**, written as tags, and the tags decide what it may import.
2. **Imports point down the type ladder**: feature → ui, data-access → model → util. Never up, never sideways between features.
3. **A domain sees another domain only through its `api` library.** Everything else in a domain is private.
4. **`shared` knows no domain.** If a "shared" file mentions work orders, it belongs to maintenance.
5. **Components never talk to HTTP.** Data flows through `data-access`; the feature sees a facade or selectors, never a URL.
6. **Applications are thin.** An app wires routes and providers; features live in libraries, so a second app costs nothing.

## 4. Vocabulary

| Term | Meaning |
|---|---|
| **Workspace** | One Nx repository with all applications and libraries. |
| **Application** | A deployable front-end in `apps/`. Contains almost no code. |
| **Library** | A folder in `libs/` with its own `project.json`, tags and a public `index.ts`. Imported only through its path alias, e.g. `@fleetline/maintenance/data-access`. |
| **Domain** | A part of the business with its own language and data: maintenance, fleet, billing. Also called a bounded context. One folder in `libs/`. |
| **Type** | The technical role of a library: `feature`, `ui`, `data-access`, `model`, `util`, `api`, `shell`. |
| **Public API** | The `index.ts` of a library. Whatever it does not export does not exist for other libraries. |
| **Facade** | A small class, hook or composable that a feature uses instead of the store: state as signals or refs, intentions as methods. |
| **Boundary rule** | A lint rule that reads the tags of two libraries and fails an import that the tags do not allow. |

## 5. The example: Fleetline

Fleetline runs maintenance for companies that operate trucks, vans and buses. Mechanics work in depots; planners assign work; customers book services and pay invoices; finance and support run a back office.

### 5.1. Applications

| Application | Users | Framework in this guide |
|---|---|---|
| `ops-portal` | Planners and mechanics in the depots | Angular |
| `customer` | Fleet customers: bookings, vehicles, invoices | Angular (Next.js in section 12) |
| `backoffice` | Finance, support, administrators | Angular (Nuxt in section 13) |

### 5.2. Domains and teams

| Domain | Owns | Team | Used by apps |
|---|---|---|---|
| `maintenance` | Work orders, checklists, planning board, SLAs | Workshop | ops-portal, backoffice |
| `fleet` | Vehicles, odometer, service history | Workshop | all three |
| `inventory` | Parts, stock per depot, reservations | Supply | ops-portal, backoffice |
| `booking` | Service slots, booking flow, rescheduling | Customer | customer, ops-portal |
| `billing` | Quotes, invoices, payments | Finance | customer, backoffice |
| `customers` | Accounts, contracts, contacts | Customer | customer, backoffice |
| `identity` | Sign-in, roles, permissions | Platform | all three |
| `notifications` | In-app inbox, e-mail preferences | Platform | all three |
| `shared` | Design system, layout, HTTP setup, dates, money, testing | Platform | all three |

Five teams, about thirty-five front-end engineers, about 280,000 lines of TypeScript. `CODEOWNERS` maps each `libs/<domain>/` folder to its team, so a pull request into maintenance asks the Workshop team for review and nobody else.

### 5.3. The workspace

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
        ├── util-date/
        ├── util-money/
        └── util-testing/
```

Maintenance alone has twelve libraries. That is normal: one `feature-*` per use case, one `ui-*` per cohesive group of components, one `data-access` and one `model` per domain until they grow too big (section 16.3).

### 5.4. One use case through the layers

The rest of the guide follows one use case: **a planner opens the work orders of a depot, filters them, and assigns a mechanic**. It touches four libraries of maintenance and one of fleet:

| Library | What it contributes |
|---|---|
| `maintenance/feature-work-orders` | The page: reads the facade, renders cards, forwards clicks |
| `maintenance/ui-work-order-card` | The card and the status filter, no state, no HTTP |
| `maintenance/data-access` | NgRx feature, effects, HTTP client, facade |
| `maintenance/model` | `WorkOrder`, `WorkOrderFilter`, `matchesFilter`, `isOverdue` |
| `fleet/api` | `VehicleSummaryStore`: plate and model for a vehicle id |

## 6. Library types

Each type answers one question. If a file answers two, it is two files.

| Type | Question it answers | Contains | Must not contain |
|---|---|---|---|
| `feature` | What does this use case do? | Routed pages, smart components, wiring of facade to ui | HTTP calls, reusable visual components |
| `ui` | How does it look? | Presentational components, pipes, directives | Injected stores, services with state, HTTP |
| `data-access` | Where does the data come from and how does it change? | Store, effects, API clients, facade, providers | Components |
| `model` | What are the domain's terms and rules? | Types, enums, pure functions such as `isOverdue` | Framework imports of any kind |
| `util` | Which technical helpers does this need? | Formatting, parsing, small algorithms | Domain terms, framework state |
| `api` | What may other domains use? | Re-exports of a chosen subset of the domain | Its own logic |
| `shell` | How is this domain mounted? | Routes, route-level providers, guards | Business logic |

### 6.1. Who may import whom

| From ↓ may import → | shell | feature | ui | data-access | model | util | api of another domain |
|---|---|---|---|---|---|---|---|
| **app** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **shell** | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **feature** | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| **api** | – | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **ui** | – | – | ✓ | – | ✓ | ✓ | – |
| **data-access** | – | – | – | ✓ | ✓ | ✓ | – |
| **model** | – | – | – | – | ✓ | ✓ | – |
| **util** | – | – | – | – | – | ✓ | – |

Three lines in this table carry most of the value:

- **feature → feature is forbidden.** Two pages that need the same thing share it through `ui` or `data-access`. Pages are composed by the shell or the router, not by importing each other.
- **ui → data-access is forbidden.** A component that injects a store is not presentational. Because of this rule the `WorkOrder` type lives in `model`, not in `data-access`.
- **model imports no framework.** `model` and `util` compile in Angular, React, Vue and Node alike. In a mixed workspace they are the code you share (section 8.3).

### 6.2. How big is a library

- **feature:** one use case, usually one route and its children. `feature-work-orders`, not `feature-maintenance`.
- **ui:** one cohesive group that changes together. `ui-work-order-card` holds the card, the status chip and the status filter.
- **data-access:** one per domain to start. Split by sub-domain when it holds more than three or four store features or the team splits (`data-access-planning`, `data-access-work-orders`).
- **model:** one per domain. It is small by nature.
- If a library has one file, it is probably too small; if its `index.ts` exports more than about thirty symbols, it is probably too big.

## 7. Domains and boundaries

A domain is a folder with an explicit door. Inside the folder, the type rules of section 6 apply. Across folders, a single rule applies: **you may import another domain's `api` library and nothing else.**

### 7.1. The API library

`fleet/api` decides what fleet offers to the rest of the company. Everything not listed is private to the Workshop team and can change without asking anybody.

`libs/fleet/api/src/index.ts`

```ts
export type { VehicleSummary, VehicleId } from '@fleetline/fleet/model';
export { VehicleSummaryStore } from '@fleetline/fleet/data-access';
export { VehicleBadgeComponent } from '@fleetline/fleet/ui-vehicle-badge';
```

The store it exports is an NgRx Signal Store, while maintenance uses the classic NgRx Store. Maintenance does not need to know; it only sees `VehicleSummaryStore`.

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

### 7.2. Shared is a domain too

`shared` has the tag `domain:shared` and may import only `domain:shared`. It knows no business term. A rule of thumb for reviews: if a file in `shared` contains the word of a domain (work order, invoice, vehicle), it moves into that domain.

### 7.3. When two domains need the same thing

| Situation | Answer |
|---|---|
| Billing shows a vehicle's plate | Billing imports `fleet/api`. |
| Maintenance and inventory both need the depot list | Depots are a concept of their own: a small `depots` domain, or `fleet` exports them in its API. Not `shared`. |
| Booking needs to open a work order after a booking | Booking calls the back-end; the back-end creates the work order. Front-end domains do not orchestrate each other's writes. |
| Two domains need the same date picker | It is technical, not business: `shared/ui-design-system`. |
| Two API libraries want to import each other | The domains are cut wrong. Merge them or move the shared concept into a third domain. |

## 8. Enforcing the rules

A rule that is not checked is a suggestion. Nx checks it with tags and one lint rule.

### 8.1. Tags

Every `project.json` gets one `domain:*` and one `type:*` tag, and in a mixed workspace one `framework:*` tag.

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

Generators set the tags when the library is created:

```bash
nx g @nx/angular:library --directory=libs/maintenance/feature-planning-board \
  --tags=domain:maintenance,type:feature,framework:angular
nx g @nx/js:library --directory=libs/maintenance/model \
  --tags=domain:maintenance,type:model,framework:agnostic --bundler=none
```

### 8.2. The lint rule

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

How the dimensions combine: an import must satisfy **every** constraint of every tag of the importing library. A maintenance feature may import `fleet/api` because its type rule allows `type:api` and its domain rule allows `type:api`. It may not import `fleet/data-access`: the type rule would allow `data-access`, but the domain rule does not allow `domain:fleet`. A maintenance `ui` library may not import `fleet/api` either: the domain rule would allow it, but the type rule does not.

The same rule also rejects relative imports into another library, imports of a library's internals instead of its `index.ts`, and circular dependencies between libraries.

### 8.3. The framework dimension

Fleetline's `customer` application could move to Next.js and `backoffice` to Nuxt without moving a single `model` or `util` library. Those are tagged `framework:agnostic` and may import only other agnostic code, so `matchesFilter` and `isOverdue` are the same function in all three apps. A React library that tries to import an Angular `ui` library fails lint.

### 8.4. Without Nx: Sheriff

Not every team runs Nx. **Sheriff**, from the same ANGULARarchitects team, enforces the same tag rules inside a single TypeScript project, by folder instead of by library. It suits a Next.js or Nuxt application that wants the boundaries before it wants a monorepo.

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

Because the dependency graph is explicit, a change in `maintenance/ui-checklist` lints, tests and builds the libraries and applications that depend on it, and nothing else. In Fleetline a typical pull request touches one domain and runs a fifth of the workspace. With remote caching, an unchanged library is never rebuilt on any machine.

## 9. State with NgRx

`maintenance/data-access` holds everything about where work orders come from and how they change. This section shows it complete. Each file has one job.

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

### 9.1. The model

The model is framework-free and lives in its own library, so `ui` libraries, tests and the React and Vue versions can use it.

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

### 9.2. Events

Actions are named after **what happened**, grouped by **where it happened**. The page reports events; it does not issue commands such as `loadWorkOrders`.

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

### 9.3. The feature: state, reducer, selectors

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

The assignment is **optimistic**: the reducer applies `assigneeChosen` at once, and `assignFailed` puts the previous mechanic back. The previous value travels in the event, because by the time the effect runs, the state already holds the new one.

### 9.4. HTTP and effects

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

`switchMap` for loading (a newer depot cancels the older request), `mergeMap` for assignments (two assignments on two cards must both finish).

### 9.5. Providers

The store feature is registered on the domain's route, not in the application root. The root store stays empty until a planner opens maintenance, and the code for it is lazy-loaded with the route.

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

### 9.6. The public API of data-access

`libs/maintenance/data-access/src/index.ts`

```ts
export { provideWorkOrders } from './lib/work-orders.providers';
export { WorkOrdersFacade } from './lib/work-orders.facade';
```

Two exports. Actions, reducer, selectors and the HTTP client are private. Every feature in maintenance goes through the facade, and the Workshop team can restructure the store without touching a single component.

## 10. The facade, and when to skip it

:::diagram fe-flow

A facade is a thin object between features and state management. It exposes **state** (signals in Angular, values in React, refs in Vue) and **intentions** (methods). It contains no logic: each method dispatches exactly one event, and each property is exactly one selector.

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

The facade is provided by `provideWorkOrders()`, not in `root`, so it exists exactly where its store feature exists.

### 10.1. Why a facade

- **Replaceable state.** The day work orders move from the NgRx Store to a Signal Store or to a server cache, the facade changes and no component does. Fleetline did exactly this for `fleet` (section 7.1).
- **A small surface.** A feature sees six members instead of fourteen actions and nine selectors.
- **Easy tests.** A feature test provides a fake object with the same shape (section 15).
- **The same shape in every framework.** The class here, `useWorkOrders()` in React and Vue: the feature code reads almost the same in all three (section 14).

### 10.2. Why the facade is optional

The NgRx community has a good argument against facades: actions should describe events (*"assignee chosen on the work orders page"*), and a facade with a method `assign()` invites thinking in commands. A facade that dispatches three actions in a row, or that holds logic, hides the event log that makes NgRx debuggable.

So in our variant the facade is a rule with conditions:

| Use a facade when | Skip it when |
|---|---|
| more than one feature uses the same state | one feature owns one small store feature |
| the state may change implementation (Store ↔ Signal Store ↔ server cache) | the state is local to a component: use a Signal Store or plain signals in the component |
| the data is offered to another domain through `api` | the team prefers dispatching events directly and the domain is small |
| the code base is shared with React or Vue teams | |

Two rules when you do use one:

1. **Method names keep the event.** `assign()` dispatches `assigneeChosen` from the `Work Orders Page` source. If two pages can assign, each page gets its own event; the facade gets two methods or a `source` parameter, never one generic `update()`.
2. **No logic.** No `if`, no loop, no call to HTTP. If it needs a decision, the decision belongs in a reducer, a selector or an effect.

Without a facade, the `index.ts` of `data-access` exports the page events and the selectors instead, and the component calls `store.dispatch()` and `store.selectSignal()` itself. Both shapes pass the boundary rules; pick one per domain and write it in the domain's README.

## 11. Angular end to end

With `data-access` in place, the remaining libraries are short.

The Angular workspace with every file of this use case. Every library also has its own `project.json` and `tsconfig.json`; the tree shows them only for the application and for `data-access`.

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
        └── util-date/
```

### 11.1. The ui library

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

The card knows a `WorkOrder` because `model` is allowed. It receives `vehicleLabel` as a string, because a maintenance `ui` library may not import `fleet/api`.

### 11.2. The feature library

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

`depotId` comes from the route parameter through `withComponentInputBinding()`. `ensureLoaded` is an `rxMethod` and accepts a signal, so whenever the visible list changes, fleet loads the plates it does not have yet, in one request.

### 11.3. The shell

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

The shell imports `identity/api` for the permission guard. Guards, like the plates from fleet, are a cross-domain concern, so a shell may use another domain's API just as a feature may (section 6.1). Everything else the shell needs comes from its own domain.

### 11.4. The application

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

That is the whole application: two files and an `environment`. `backoffice` mounts the same `maintenance/feature-shell` with a different layout. A third application would take an afternoon.

## 12. React and Next.js

The architecture does not depend on Angular. Libraries, types, domains, tags and the lint rule stay the same; Nx generates React and Next.js projects with `@nx/react` and `@nx/next`. What changes is how each library type is implemented, and Next.js adds one new dimension: code that runs only on the server.

The same workspace with a Next.js application, and every file of this use case:

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
    │   │           ├── work-orders-page.tsx
    │   │           └── work-orders-page.spec.tsx
    │   ├── ui-work-order-card/
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-order-card.tsx
    │   │           ├── work-order-card.module.css
    │   │           └── status-filter.tsx
    │   ├── data-access/
    │   │   ├── project.json
    │   │   ├── tsconfig.json
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── lib/
    │   │           ├── work-orders.http.ts
    │   │           ├── work-orders.slice.ts
    │   │           ├── work-orders.slice.spec.ts
    │   │           ├── work-orders.listeners.ts
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
    │               └── use-vehicle-summaries.ts
    └── shared/
        ├── data-access-store/
        │   └── src/
        │       ├── index.ts
        │       └── lib/
        │           ├── store.ts
        │           └── store-provider.tsx
        ├── data-access-server/
        ├── data-access-http/
        ├── ui-design-system/
        └── util-date/
```

### 12.1. What maps to what

| Angular | React / Next.js |
|---|---|
| `feature` component | A client component exported from `feature-*`; the `page.tsx` in the app only renders it |
| `ui` component with `input()`/`output()` | A component with props and callbacks |
| `shell` routes | File routes stay in `apps/<app>/app/`; the shell library exports the domain's layout and providers |
| NgRx Store, `createFeature` | Redux Toolkit `createSlice` |
| NgRx Entity | `createEntityAdapter` from Redux Toolkit |
| `createSelector` | `createSelector` (Reselect, part of Redux Toolkit) |
| Effects | Listener middleware, or thunks for simple cases |
| `provideState` on a route | `slice.injectInto(rootReducer)` (lazy slices) |
| Signal Store | Zustand |
| Facade service | A hook: `useWorkOrders()` |
| `HttpClient` | `fetch` in a server function or a client API module |

### 12.2. Tags for server and client

In the App Router a file is either a server component or a client component. Code that reads secrets, cookies or the database must never end up in the browser bundle. Fleetline adds a second data-access library per domain and one more tag:

| Library | Tags | Contains |
|---|---|---|
| `maintenance/data-access` | `type:data-access`, `platform:client` | Redux slice, listeners, client API, facade hook |
| `maintenance/data-access-server` | `type:data-access`, `platform:server` | `server-only` fetch functions and server actions |

The lint rule from section 8.2 already contains the constraint `platform:client` → not `platform:server`. Every server-only file also starts with `import 'server-only'`, so a mistake fails the build even where lint does not run.

### 12.3. The store

Redux Toolkit can inject slices lazily, which plays the role of `provideState` on a route. The root reducer lives in `shared` and knows no domain.

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

A new store per request is created in a client provider, as the Redux Toolkit guide for the App Router recommends.

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

### 12.4. The slice

The same events, the same optimistic update, the same `model` functions as in section 9.

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

### 12.5. Effects as listeners

Listeners are added when the domain mounts and removed when it unmounts, the counterpart of `provideEffects` on a route. `cancelActiveListeners()` gives `switchMap` semantics.

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

### 12.6. The facade hook

The hook has the same members as the Angular facade. It also starts the listeners and reports the page opening, so a feature needs one line to be wired.

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

### 12.7. Feature, ui and route

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

The route file in the application stays a few lines long. The shell library exports the domain layout with the permission check.

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

### 12.8. Server state: the same facade, another engine

In Next.js much of what an Angular SPA keeps in NgRx is **server state**: data the server owns and the client caches. For lists like work orders, many teams prefer server components plus a query cache over Redux. The facade makes this a private decision of `data-access`.

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

The return value has the same members. `WorkOrdersPage` does not change, apart from passing `initial` that the server `page.tsx` loaded with `listWorkOrders`. Fleetline's rule: **server state in a query cache, client-owned state in Redux.** The planning board, where planners drag dozens of orders between mechanics and days before saving, is client-owned and stays in Redux; the work order list is server state.

### 12.9. Pitfalls specific to Next.js

- **`'use client'` is a boundary of its own.** Put it in feature and data-access files that use hooks, never in `model` or `util`.
- **Do not import a server library into a client file "just for the type".** Types live in `model`.
- **Server actions belong to `data-access-server`.** A feature imports them through `data-access` re-exports only if the lint tags allow it; otherwise the page passes them as props.
- **Route files stay thin.** A `page.tsx` that grows logic is the Next.js version of a fat Angular app component.

## 13. Vue and Nuxt

Vue maps even more directly, because Pinia setup stores look much like an NgRx Signal Store, and composables are the natural shape of a facade. Nx builds Vue and Nuxt projects with `@nx/vue` and `@nx/nuxt`.

The same workspace with a Nuxt application, and every file of this use case:

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
    │               └── use-vehicle-summaries.ts
    └── shared/
        ├── data-access-http/
        ├── ui-design-system/
        └── util-date/
```

### 13.1. What maps to what

| Angular | Vue / Nuxt |
|---|---|
| `feature` component | A single-file component in `feature-*`; the page in `apps/<app>/app/pages/` only renders it |
| `ui` component | A component with `defineProps` and `defineEmits` |
| `shell` routes | File routes stay in the app; the shell library exports layouts and route middleware |
| NgRx Store / Signal Store | Pinia (setup store) |
| Selectors | `computed` inside the store |
| Effects | Async actions in the store; `useAsyncData` for loading during server rendering |
| Facade service | A composable: `useWorkOrders()` |
| `HttpClient` | `$fetch` |

Pinia has no actions-and-reducers split. That removes the event log and the time-travel debugging of NgRx, and it also removes most of the ceremony. For the architecture it changes nothing: the store is private to `data-access`, and the composable is the door.

### 13.2. Turn off auto-imports for libraries

Nuxt imports components and composables automatically. That is convenient in a small app and fatal for boundaries: **an import that is never written cannot be linted.** If a feature in billing can use `useWorkOrders()` without an `import` line, the lint rule never sees the crossing.

Rules in Fleetline's Nuxt applications:

- libraries are imported with explicit `import` statements through their path aliases, never registered as auto-import directories;
- domains are not Nuxt layers, because layers auto-import their components and composables into the app;
- the app keeps auto-imports for Vue and Nuxt APIs in its own `pages/` and `layouts/` only, and library code imports Nuxt functions from `#imports`.

`apps/backoffice/nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
  components: { dirs: [] },
  imports: { scan: false },
  runtimeConfig: { public: { apiUrl: '' } },
});
```

### 13.3. The store

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

`byId`, `filter` and `error` are returned so that Pinia serializes them into the server-rendered payload and the browser starts with the same state.

### 13.4. The facade composable

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

The key is a function of `depotId`, so switching depots fetches again. On the server `useAsyncData` waits for the data; in the browser the page hydrates from the payload without a second request.

### 13.5. Feature, ui and page

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

### 13.6. Pitfalls specific to Nuxt

- **Linting `.vue` files** needs `vue-eslint-parser` in the ESLint config, otherwise the boundary rule silently skips every component. The `files` pattern in section 8.2 includes `**/*.vue` for this reason.
- **One store per request.** Pinia with `@pinia/nuxt` already creates one per request on the server. Never keep state in a module-level `ref` in a library: on the server it would be shared between users.
- **`useAsyncData` belongs in the facade**, not in the store. The store stays usable from tests and from client-only code.

## 14. Side by side

:::diagram fe-frameworks

The same use case in three frameworks, file by file:

| Library | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| `model` | `work-order.ts` | the same file | the same file |
| `data-access` state | `createFeature` + `createEntityAdapter` | `createSlice` + `createEntityAdapter` | Pinia setup store |
| `data-access` effects | functional `createEffect` | listener middleware | async store actions + `useAsyncData` |
| `data-access` facade | `WorkOrdersFacade` (signals) | `useWorkOrders()` (values) | `useWorkOrders()` (refs) |
| `ui` | `input()` / `output()` | props / callbacks | `defineProps` / `defineEmits` |
| `feature` | standalone component | client component | single-file component |
| `shell` | `Routes` with `providers` | layout component, route segment | layout + route middleware |
| app route | `loadChildren` | `page.tsx` | `pages/*.vue` |
| boundaries | `@nx/enforce-module-boundaries` | the same rule | the same rule, with `vue-eslint-parser` |

What stays identical in all three: the folder of every file, the tags, the lint rule, the `model` library, the members of the facade and the tests of the `model` library. What a developer switching between Fleetline's apps has to relearn is only the framework itself.

## 15. Testing per library type

Each type has a natural kind of test, and the boundaries make each one cheap.

| Type | Test | Speed | What it fakes |
|---|---|---|---|
| `model`, `util` | Plain unit tests, no framework | milliseconds | nothing |
| `data-access` reducers, selectors | Pure function tests | milliseconds | nothing |
| `data-access` effects / listeners | Tests with a fake HTTP client | fast | HTTP |
| facade | Integration with the real store | fast | HTTP |
| `ui` | Component tests, stories in Storybook | fast | nothing, it has only inputs |
| `feature` | Component test with a fake facade | fast | the facade |
| app | End-to-end with Playwright, a few flows | slow | the back-end, or nothing |

A reducer test needs no TestBed:

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

A feature test provides a fake facade, because the component sees nothing else:

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

Test data builders such as `aWorkOrder` live in a secondary entry point of `model` (`@fleetline/maintenance/model/testing`), so every framework's tests use the same ones.

## 16. Growing into it and migrating

Nobody starts with seventy libraries. Fleetline started as one Angular application with a `src/app` folder; the steps below are the order that worked.

### 16.1. Migration in eight steps

1. **Create the workspace around the app.** `nx init` in the existing repository. Nothing moves yet.
2. **Draw the domains on paper.** Use the business words: what do planners, customers and finance talk about? Expect six to ten domains. Write them into a README.
3. **Turn on the rule as a warning.** Add the lint config of section 8.2 with `'warn'`. Count the warnings; that is your baseline.
4. **Extract `model` and `util` first.** They have no dependencies, so moving them is safe, and every later step needs them. Use `nx g @nx/workspace:move`.
5. **Extract `ui` per domain.** Every component that only has inputs and outputs moves. Components that inject a store stay for now.
6. **Carve `data-access` per domain.** Split the root store by domain; move each store feature, its effects and HTTP into the domain's `data-access` and register it on the domain's route.
7. **Move pages into `feature-*` and routes into `feature-shell`.** The app shrinks to its routes and providers.
8. **Switch the rule to `'error'` and add CODEOWNERS.** From now on, a new crossing fails CI.

Steps 4 to 7 run domain by domain, and the application keeps shipping between them. In Fleetline the whole migration took four months next to feature work, one domain at a time, starting with the smallest one (`notifications`) to learn the moves.

### 16.2. What usually goes wrong

- **A domain called `common` or `core`.** It becomes the new `shared/`. Every concept has a business owner; find it.
- **Domains cut by page instead of by business language.** "Dashboard" is not a domain; it is a feature that reads from several domains through their APIs.
- **API libraries that re-export everything.** Then the boundary is only cosmetic. Export what another team actually uses, and nothing else.
- **Disabled lint lines.** One `eslint-disable` for the boundary rule becomes forty within a year. Exceptions go into the config, with a reason in the pull request.

### 16.3. When to split a library

- A `data-access` with more than three or four store features, or owned by two teams: split by sub-domain.
- A `ui` library imported by only one feature: merge it back into that feature or keep it, but do not move it to `shared`.
- A `feature` with several unrelated routes: one library per use case.
- A domain whose libraries are mostly owned by another team: the domain is cut wrong, or the team boundaries are.

### 16.4. When this is too much

For one application, one team and one or two domains, the full structure costs more than it saves. Start with folders inside one project instead (`src/domains/<domain>/feature-…`, `ui-…`, `data-access`, `model`) and enforce them with Sheriff (section 8.4). Moving those folders into Nx libraries later is a mechanical step, because the dependency rules are already true.

## 17. Questions

**Do we need NgRx for all state?**
No. Shared, long-lived state that several features read goes into a store. Form state, open/closed panels and other state that one component owns stay in the component, with signals or a component-level Signal Store.

**NgRx Store or NgRx Signal Store?**
Both fit the architecture, both live in `data-access`, and the facade hides the choice. Fleetline uses the Store where an event log and devtools pay off (maintenance, planning) and the Signal Store for simpler domains (fleet summaries, notifications).

**Is a facade not just an extra layer?**
It is, and section 10 says when it is worth it. In React and Vue, the hook or composable is the idiomatic way to share state access anyway, so there the facade costs almost nothing.

**Should every domain have an `api` library from day one?**
No. Create it the first time another domain needs something. Before that, the domain is fully private, which is the best boundary there is.

**Is this micro front-ends?**
No. Everything here builds into one application per app folder. The same domain cut is the natural seam for micro front-ends later, if the organisation ever needs independent deployments.

**Can React, Vue and Angular really share libraries?**
They share `model` and `util` libraries, tagged `framework:agnostic`, and test data builders. Components and stores are per framework. In Fleetline, about a fifth of the front-end code is framework-agnostic.

**Where should we read more?**
Manfred Steyer's articles and the free e-book *Enterprise Angular* on [angulararchitects.io](https://www.angulararchitects.io/), the [Nx documentation](https://nx.dev/) on module boundaries, [Sheriff](https://github.com/softarc-consulting/sheriff), and the [NgRx documentation](https://ngrx.io/).
