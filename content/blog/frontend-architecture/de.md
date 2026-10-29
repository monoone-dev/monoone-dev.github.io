Dieser Leitfaden beschreibt, wie wir große Frontends strukturieren: ein Workspace, viele Anwendungen, viele Teams und eine Regel für jede Datei. Wir bauen das mit **Nx** und **Angular**, halten gemeinsamen Zustand in **NgRx** und setzen eine **optionale Facade** vor den Store. Danach zeigen wir dieselbe Architektur, Regel für Regel, in **React mit Next.js** und in **Vue mit Nuxt**.

Die Beispiele sind für **Angular 22** mit NgRx 22, **React 19** mit Next.js 16, **TanStack Query** und **Zustand** sowie **Vue 3.5** mit Nuxt 4 und **Pinia 3** geschrieben.

Die Architektur stammt nicht von uns. Ihren Kern hat **Manfred Steyer** ausgearbeitet und veröffentlicht: Angular-Trainer und -Berater, Google Developer Expert für Angular und der Kopf hinter [ANGULARarchitects](https://www.angulararchitects.io/). Seine Idee: ein Frontend **vertikal nach Domänen** und **horizontal nach Bibliothekstypen** schneiden, Domänen nur über eine explizite API miteinander sprechen lassen und diese Grenzen von einem Werkzeug durchsetzen lassen, nicht von einem Wiki. Abschnitt 2 listet genau auf, was von ihm kommt, was von Nx und was wir ergänzt haben.

Ein kleines Beispiel kann nicht zeigen, warum das alles wichtig ist. Eine Domäne mit einem Store passt in jeden Kopf. Deshalb stammt jedes Beispiel auf dieser Seite aus einem realistischen Workspace: **Fleetline**, eine Plattform für Flottenwartung mit drei Anwendungen, neun Domänen, etwa siebzig Bibliotheken und fünf Teams. Sie wird in Abschnitt 5 vorgestellt und in jedem folgenden Abschnitt verwendet.

> Geschrieben für Teams, die schon mehr als eine Frontend-Anwendung, mehr als ein Team oder mehr als etwa 50.000 Zeilen Frontend-Code haben oder bald haben werden. Unterhalb dieser Größe zuerst Abschnitt 16.4 lesen.

## 1. Warum Frontends eine Architektur brauchen

Ein Frontend wächst jedes Mal auf dieselbe Weise. Im ersten Jahr gibt es eine Anwendung und einen Ordner `src/app` mit `components`, `services` und `store`. Im dritten Jahr sieht dasselbe Projekt meist so aus:

- `shared/` enthält dreihundert Dateien, und die Hälfte davon wird von genau einem Feature genutzt;
- eine Komponente in Billing importiert einen Selector aus Maintenance, weil er gerade da war;
- der Root-Store hat vierzig Feature-Keys, und niemand weiß, welche davon eine Seite braucht;
- eine zweite Anwendung entsteht als Kopie der ersten, weil das Herauslösen von Code zu schwer ist;
- eine Änderung an einem Datums-Helper baut und testet das ganze Repository neu;
- neue Entwicklerinnen und Entwickler oder ein Coding-Agent brauchen Tage, um zu lernen, wo ein Feature liegt und was es nutzen darf.

Nichts davon liegt an schlechten Entwicklern. Es liegt daran, dass es keine gemeinsame Antwort auf zwei Fragen gibt: **Wohin gehört diese Datei?** und **Wer darf wen importieren?** Ohne Antwort gewinnt der nächstgelegene Ordner, und der nächstgelegene Ordner ist immer `shared/`.

Die Architektur in diesem Leitfaden beantwortet beide Fragen einmal, für jede Art von Frontend-Code, und macht die Antwort **mechanisch**: Eine Lint-Regel lehnt einen Import ab, der eine Grenze überschreitet, im Editor und in der CI.

### 1.1. Ziele

1. **Auffindbarkeit.** Wer den Namen eines Features kennt, kennt auch seinen Ordner, in jeder Anwendung.
2. **Lokale Änderungen.** Eine Änderung in einer Domäne kann keine andere Domäne kaputt machen, weil die andere Domäne ihre Interna nicht sieht.
3. **Schnelles Feedback bei großem Umfang.** Die CI baut und testet nur die Bibliotheken, die eine Änderung betrifft.
4. **Parallele Teams.** Ein Team besitzt Domänen, keine über `shared/` verstreuten Dateien.
5. **Austauschbarer Zustand.** Ein Feature weiß nicht, ob seine Daten aus NgRx, einem Signal Store, einem Cache oder vom Server kommen.
6. **Ein Regelwerk für drei Frameworks.** Angular-, React- und Vue-Anwendungen im selben Unternehmen folgen derselben Struktur, und frameworkfreier Code wird zwischen ihnen geteilt.

### 1.2. Nicht-Ziele

- Sie legt weder das Backend noch das Design-System noch das CSS fest.
- Sie verlangt keine Micro-Frontends. Alles hier funktioniert in einer einzigen deploybaren Anwendung; Micro-Frontends sind eine spätere, eigene Entscheidung.
- Sie ersetzt nicht die Produktregeln. Sie sagt, wo Code liegt und was er nutzen darf; das Projekt sagt, was der Code tun muss.

## 2. Woher die Idee kommt

Die Architektur verbindet drei Quellen. Wir nennen sie, weil jede davon im Original lesenswert ist.

| Quelle | Was sie beiträgt |
|---|---|
| **Nx** (das Nrwl-Team, *Enterprise Angular Monorepo Patterns*) | Das Monorepo selbst, Bibliotheken mit einer öffentlichen `index.ts` und die klassischen Bibliothekstypen: `feature`, `ui`, `data-access`, `util`. Tags an Projekten und die Lint-Regel `@nx/enforce-module-boundaries`. |
| **Manfred Steyer** (ANGULARarchitects, das E-Book *Enterprise Angular*, seine Artikel über strategisches Design mit Nx) | Domain-Driven Design für Frontends: **Domänen als vertikale Schnitte**, **Bibliothekstypen als horizontale Schichten**, zwei Tag-Dimensionen (`domain:*` und `type:*`), die ein Linter prüft, eine **API-Bibliothek** als einzige Tür zwischen Domänen und eine **Facade** zwischen UI und State-Management. Später auch **Sheriff**, ein Grenzprüfer für Projekte ohne Nx. |
| **NgRx** (und davor Redux) | Ein Store für gemeinsamen Zustand, Änderungen über Actions und reine Reducer, Seiteneffekte in Effects, Lesen über memoisierte Selectors. |

Was wir in diesem Leitfaden zusätzlich festgelegt haben:

- einen eigenen Typ `model` für frameworkfreie Typen und reine Domänenfunktionen, damit `ui`-Bibliotheken nie vom State-Management abhängen;
- einen eigenen Typ `shell` (Nx' `feature-shell`), dem die Routen und Provider einer Domäne gehören;
- eine dritte Tag-Dimension, `framework:*`, damit Angular-, React- und Vue-Anwendungen in einem Workspace leben und `model`- und `util`-Code teilen können;
- eine vierte Dimension für Next.js, `platform:server` und `platform:client`;
- die Regel aus Abschnitt 10, wann sich eine Facade lohnt und wann man sie weglässt;
- die Übertragungen auf React/Next und Vue/Nuxt in den Abschnitten 12 und 13.

Widerspricht etwas auf dieser Seite den Originalartikeln, ist das Original die Referenz für die Idee; diese Seite ist die Referenz dafür, wie wir sie anwenden.

## 3. Die Architektur auf einer Seite

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

Sechs Sätze zum Merken:

1. **Jede Bibliothek hat eine Domäne und einen Typ**, als Tags notiert, und die Tags entscheiden, was sie importieren darf.
2. **Imports zeigen die Typ-Leiter hinunter**: feature → ui, data-access → model → util. Nie nach oben, nie seitwärts zwischen Features.
3. **Eine Domäne sieht eine andere Domäne nur über deren `api`-Bibliothek.** Alles andere in einer Domäne ist privat.
4. **`shared` kennt keine Domäne.** Wenn eine „gemeinsame“ Datei Arbeitsaufträge erwähnt, gehört sie zu Maintenance.
5. **Komponenten sprechen nie mit HTTP.** Daten fließen über `data-access`; das Feature sieht eine Facade oder Selectors, nie eine URL.
6. **Anwendungen sind dünn.** Eine App verdrahtet Routen und Provider; Features liegen in Bibliotheken, also kostet eine zweite App nichts.

## 4. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Workspace** | Ein Nx-Repository mit allen Anwendungen und Bibliotheken. |
| **Anwendung** | Ein deploybares Frontend in `apps/`. Enthält fast keinen Code. |
| **Bibliothek** | Ein Ordner in `libs/` mit eigener `project.json`, Tags und einer öffentlichen `index.ts`. Wird nur über seinen Pfad-Alias importiert, z. B. `@fleetline/maintenance/data-access`. |
| **Domäne** | Ein Teil des Geschäfts mit eigener Sprache und eigenen Daten: Wartung, Flotte, Abrechnung. Auch Bounded Context genannt. Ein Ordner in `libs/`. |
| **Typ** | Die technische Rolle einer Bibliothek: `feature`, `ui`, `data-access`, `model`, `util`, `api`, `shell`. |
| **Öffentliche API** | Die `index.ts` einer Bibliothek. Was sie nicht exportiert, existiert für andere Bibliotheken nicht. |
| **Facade** | Eine kleine Klasse, ein Hook oder ein Composable, das ein Feature statt des Stores nutzt: Zustand als Signals oder Refs, Absichten als Methoden. |
| **Grenzregel** | Eine Lint-Regel, die die Tags zweier Bibliotheken liest und einen Import ablehnt, den die Tags nicht erlauben. |

## 5. Das Beispiel: Fleetline

Fleetline übernimmt die Wartung für Unternehmen, die Lkw, Transporter und Busse betreiben. Mechaniker arbeiten in Depots; Disponenten verteilen die Arbeit; Kunden buchen Services und bezahlen Rechnungen; Finanzen und Support betreiben ein Backoffice.

### 5.1. Anwendungen

| Anwendung | Nutzer | Framework in diesem Leitfaden |
|---|---|---|
| `ops-portal` | Disponenten und Mechaniker in den Depots | Angular |
| `customer` | Flottenkunden: Buchungen, Fahrzeuge, Rechnungen | Angular (Next.js in Abschnitt 12) |
| `backoffice` | Finanzen, Support, Administratoren | Angular (Nuxt in Abschnitt 13) |

### 5.2. Domänen und Teams

| Domäne | Besitzt | Team | Genutzt von Apps |
|---|---|---|---|
| `maintenance` | Arbeitsaufträge, Checklisten, Planungstafel, SLAs | Workshop | ops-portal, backoffice |
| `fleet` | Fahrzeuge, Kilometerstand, Servicehistorie | Workshop | alle drei |
| `inventory` | Teile, Bestand pro Depot, Reservierungen | Supply | ops-portal, backoffice |
| `booking` | Service-Slots, Buchungsablauf, Umbuchung | Customer | customer, ops-portal |
| `billing` | Angebote, Rechnungen, Zahlungen | Finance | customer, backoffice |
| `customers` | Konten, Verträge, Kontakte | Customer | customer, backoffice |
| `identity` | Anmeldung, Rollen, Berechtigungen | Platform | alle drei |
| `notifications` | In-App-Posteingang, E-Mail-Einstellungen | Platform | alle drei |
| `shared` | Design-System, Layout, HTTP-Setup, Datum, Geld, Testen | Platform | alle drei |

Fünf Teams, etwa fünfunddreißig Frontend-Entwicklerinnen und -Entwickler, etwa 280.000 Zeilen TypeScript. `CODEOWNERS` ordnet jeden Ordner `libs/<domain>/` seinem Team zu, sodass ein Pull Request in Maintenance das Workshop-Team um ein Review bittet und sonst niemanden.

### 5.3. Der Workspace

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

Maintenance allein hat zwölf Bibliotheken. Das ist normal: ein `feature-*` pro Use Case, ein `ui-*` pro zusammengehöriger Gruppe von Komponenten, ein `data-access` und ein `model` pro Domäne, bis sie zu groß werden (Abschnitt 16.3).

### 5.4. Ein Use Case durch die Schichten

Der Rest des Leitfadens folgt einem Use Case: **Ein Disponent öffnet die Arbeitsaufträge eines Depots, filtert sie und weist einen Mechaniker zu.** Er berührt vier Bibliotheken von Maintenance und eine von Fleet:

| Bibliothek | Was sie beiträgt |
|---|---|
| `maintenance/feature-work-orders` | Die Seite: liest die Facade, rendert Karten, leitet Klicks weiter |
| `maintenance/ui-work-order-card` | Die Karte und der Statusfilter, kein Zustand, kein HTTP |
| `maintenance/data-access` | NgRx-Feature, Effects, HTTP-Client, Facade |
| `maintenance/model` | `WorkOrder`, `WorkOrderFilter`, `matchesFilter`, `isOverdue` |
| `fleet/api` | `VehicleSummaryStore`: Kennzeichen und Modell zu einer Fahrzeug-ID |

## 6. Bibliothekstypen

Jeder Typ beantwortet eine Frage. Wenn eine Datei zwei beantwortet, sind es zwei Dateien.

| Typ | Frage, die er beantwortet | Enthält | Darf nicht enthalten |
|---|---|---|---|
| `feature` | Was tut dieser Use Case? | Geroutete Seiten, Smart Components, Verdrahtung von Facade und UI | HTTP-Aufrufe, wiederverwendbare visuelle Komponenten |
| `ui` | Wie sieht es aus? | Präsentationskomponenten, Pipes, Direktiven | Injizierte Stores, Services mit Zustand, HTTP |
| `data-access` | Woher kommen die Daten und wie ändern sie sich? | Store, Effects, API-Clients, Facade, Provider | Komponenten |
| `model` | Was sind die Begriffe und Regeln der Domäne? | Typen, Enums, reine Funktionen wie `isOverdue` | Framework-Imports jeder Art |
| `util` | Welche technischen Helfer braucht es? | Formatieren, Parsen, kleine Algorithmen | Domänenbegriffe, Framework-Zustand |
| `api` | Was dürfen andere Domänen nutzen? | Re-Exports einer ausgewählten Teilmenge der Domäne | Eigene Logik |
| `shell` | Wie wird diese Domäne eingehängt? | Routen, Provider auf Routenebene, Guards | Geschäftslogik |

### 6.1. Wer wen importieren darf

| Von ↓ darf importieren → | shell | feature | ui | data-access | model | util | api einer anderen Domäne |
|---|---|---|---|---|---|---|---|
| **app** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **shell** | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **feature** | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| **api** | – | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **ui** | – | – | ✓ | – | ✓ | ✓ | – |
| **data-access** | – | – | – | ✓ | ✓ | ✓ | – |
| **model** | – | – | – | – | ✓ | ✓ | – |
| **util** | – | – | – | – | – | ✓ | – |

Drei Zeilen dieser Tabelle tragen den größten Teil des Nutzens:

- **feature → feature ist verboten.** Zwei Seiten, die dasselbe brauchen, teilen es über `ui` oder `data-access`. Seiten werden von der Shell oder dem Router zusammengesetzt, nicht dadurch, dass sie sich gegenseitig importieren.
- **ui → data-access ist verboten.** Eine Komponente, die einen Store injiziert, ist keine Präsentationskomponente. Wegen dieser Regel liegt der Typ `WorkOrder` in `model`, nicht in `data-access`.
- **model importiert kein Framework.** `model` und `util` kompilieren in Angular, React, Vue und Node gleichermaßen. In einem gemischten Workspace sind sie der Code, den man teilt (Abschnitt 8.3).

### 6.2. Wie groß eine Bibliothek ist

- **feature:** ein Use Case, meist eine Route und ihre Kinder. `feature-work-orders`, nicht `feature-maintenance`.
- **ui:** eine zusammengehörige Gruppe, die sich gemeinsam ändert. `ui-work-order-card` enthält die Karte, den Status-Chip und den Statusfilter.
- **data-access:** zu Beginn eine pro Domäne. Nach Subdomäne aufteilen, wenn sie mehr als drei oder vier Store-Features enthält oder sich das Team aufteilt (`data-access-planning`, `data-access-work-orders`).
- **model:** eine pro Domäne. Sie ist von Natur aus klein.
- Hat eine Bibliothek nur eine Datei, ist sie wahrscheinlich zu klein; exportiert ihre `index.ts` mehr als etwa dreißig Symbole, ist sie wahrscheinlich zu groß.

### 6.3. Styles

Styles unterliegen denselben Grenzen wie TypeScript, aber die Grenzregel sieht sie nicht: Nx baut den Abhängigkeitsgraphen aus TypeScript- und JavaScript-Imports und übergeht `@use` in SCSS. Deshalb haben Styles vier eigene Regeln:

1. **Eine Komponente hat Styles nur für sich selbst, in einer Datei direkt daneben.** Eine Bibliothek definiert nie eine globale Klasse, sodass `.card` aus Maintenance und `.card` aus Billing nicht kollidieren können.
2. **Das Design-System spricht über CSS-Variablen.** Tokens (Farben, Abstände, Radien, Typografie) sind Custom Properties aus `shared/ui-design-system`. Domänenkomponenten lesen `var(--ds-…)` und binden keine SCSS-Dateien anderer Bibliotheken per `@use` ein.
3. **Globale Styles hat nur die Anwendung:** Reset, Fonts und Tokens, an einer Stelle.
4. **Niemand stylt das Innere einer fremden Komponente.** Eine Komponente, die sich anpassen lassen soll, bietet einen Input, ein Prop oder eine CSS-Variable an.

| | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| Komponenten-Styles | `styleUrl` mit der standardmäßig emulierten Kapselung | CSS Modules: `*.module.scss` | `<style scoped lang="scss">` |
| Globale Styles | `apps/<app>/src/styles.scss` | Import in `app/layout.tsx` der App | `css` in `nuxt.config.ts` |
| In Bibliotheken verboten | `::ng-deep`, `ViewEncapsulation.None` | `:global(...)`, Import einer einfachen `.css`-Datei | `:deep(...)`, `<style>` ohne `scoped` |

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

Dieselben CSS-Regeln landen in React in `work-order-card.module.scss` und in Vue im `<style scoped>`-Block der Komponente. Stylelint lehnt in der CI die Selektoren aus der letzten Tabellenzeile ab (`selector-disallowed-list`). Regel 2 prüft ein einziger `grep`-Befehl in der CI: `@use` in einer Domänenbibliothek darf nur auf Dateien derselben Bibliothek zeigen, nie auf den Alias `@fleetline/`.

## 7. Domänen und Grenzen

Eine Domäne ist ein Ordner mit einer expliziten Tür. Innerhalb des Ordners gelten die Typregeln aus Abschnitt 6. Über Ordner hinweg gilt eine einzige Regel: **Man darf die `api`-Bibliothek einer anderen Domäne importieren und sonst nichts.**

### 7.1. Die API-Bibliothek

`fleet/api` entscheidet, was Fleet dem Rest des Unternehmens anbietet. Alles, was nicht aufgeführt ist, ist privat für das Workshop-Team und kann sich ändern, ohne dass jemand gefragt werden muss.

`libs/fleet/api/src/index.ts`

```ts
export type { VehicleSummary, VehicleId } from '@fleetline/fleet/model';
export { VehicleSummaryStore } from '@fleetline/fleet/data-access';
export { VehicleBadgeComponent } from '@fleetline/fleet/ui-vehicle-badge';
```

Der exportierte Store ist ein NgRx Signal Store, während Maintenance den klassischen NgRx Store nutzt. Maintenance muss das nicht wissen; es sieht nur `VehicleSummaryStore`.

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

### 7.2. Shared ist auch eine Domäne

`shared` hat das Tag `domain:shared` und darf nur `domain:shared` importieren. Es kennt keinen Geschäftsbegriff. Eine Faustregel für Reviews: Enthält eine Datei in `shared` das Wort einer Domäne (Arbeitsauftrag, Rechnung, Fahrzeug), zieht sie in diese Domäne um.

### 7.3. Wenn zwei Domänen dasselbe brauchen

| Situation | Antwort |
|---|---|
| Billing zeigt das Kennzeichen eines Fahrzeugs | Billing importiert `fleet/api`. |
| Maintenance und Inventory brauchen beide die Depotliste | Depots sind ein eigenes Konzept: eine kleine Domäne `depots`, oder `fleet` exportiert sie in seiner API. Nicht `shared`. |
| Booking muss nach einer Buchung einen Arbeitsauftrag öffnen | Booking ruft das Backend auf; das Backend legt den Arbeitsauftrag an. Frontend-Domänen orchestrieren nicht die Schreibvorgänge der anderen. |
| Zwei Domänen brauchen denselben Datepicker | Das ist technisch, nicht fachlich: `shared/ui-design-system`. |
| Zwei API-Bibliotheken wollen sich gegenseitig importieren | Die Domänen sind falsch geschnitten. Zusammenlegen oder das gemeinsame Konzept in eine dritte Domäne verschieben. |

## 8. Die Regeln durchsetzen

Eine Regel, die nicht geprüft wird, ist ein Vorschlag. Nx prüft sie mit Tags und einer Lint-Regel.

### 8.1. Tags

Jede `project.json` bekommt ein `domain:*`- und ein `type:*`-Tag, in einem gemischten Workspace zusätzlich ein `framework:*`-Tag.

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

Generatoren setzen die Tags beim Anlegen der Bibliothek:

```bash
nx g @nx/angular:library --directory=libs/maintenance/feature-planning-board \
  --tags=domain:maintenance,type:feature,framework:angular
nx g @nx/js:library --directory=libs/maintenance/model \
  --tags=domain:maintenance,type:model,framework:agnostic --bundler=none
```

### 8.2. Die Lint-Regel

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

So wirken die Dimensionen zusammen: Ein Import muss **jede** Bedingung jedes Tags der importierenden Bibliothek erfüllen. Ein Maintenance-Feature darf `fleet/api` importieren, weil seine Typregel `type:api` erlaubt und seine Domänenregel `type:api` erlaubt. Es darf `fleet/data-access` nicht importieren: Die Typregel würde `data-access` erlauben, die Domänenregel aber nicht `domain:fleet`. Eine `ui`-Bibliothek von Maintenance darf `fleet/api` ebenfalls nicht importieren: Die Domänenregel würde es erlauben, die Typregel aber nicht.

Dieselbe Regel lehnt auch relative Imports in eine andere Bibliothek ab, Imports von Interna einer Bibliothek statt ihrer `index.ts` sowie zirkuläre Abhängigkeiten zwischen Bibliotheken.

### 8.3. Die Framework-Dimension

Fleetlines Anwendung `customer` könnte nach Next.js umziehen und `backoffice` nach Nuxt, ohne eine einzige `model`- oder `util`-Bibliothek zu verschieben. Diese sind mit `framework:agnostic` getaggt und dürfen nur anderen agnostischen Code importieren, also sind `matchesFilter` und `isOverdue` in allen drei Apps dieselbe Funktion. Eine React-Bibliothek, die versucht, eine Angular-`ui`-Bibliothek zu importieren, scheitert am Lint.

### 8.4. Ohne Nx: Sheriff

Nicht jedes Team setzt Nx ein. **Sheriff**, vom selben ANGULARarchitects-Team, setzt dieselben Tag-Regeln innerhalb eines einzelnen TypeScript-Projekts durch, nach Ordnern statt nach Bibliotheken. Es passt zu einer Next.js- oder Nuxt-Anwendung, die die Grenzen will, bevor sie ein Monorepo will.

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

### 8.5. In der CI

```bash
nx affected -t lint typecheck test build --base=origin/main
nx graph --affected
```

Weil der Abhängigkeitsgraph explizit ist, lintet, testet und baut eine Änderung in `maintenance/ui-checklist` die Bibliotheken und Anwendungen, die davon abhängen, und sonst nichts. Bei Fleetline berührt ein typischer Pull Request eine Domäne und lässt ein Fünftel des Workspace laufen. Mit Remote Caching wird eine unveränderte Bibliothek auf keiner Maschine je neu gebaut.

## 9. Zustand mit NgRx

`maintenance/data-access` enthält alles darüber, woher Arbeitsaufträge kommen und wie sie sich ändern. Dieser Abschnitt zeigt die Bibliothek vollständig. Jede Datei hat eine Aufgabe.

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

### 9.1. Das Model

Das Model ist frameworkfrei und liegt in einer eigenen Bibliothek, damit `ui`-Bibliotheken, Tests und die React- und Vue-Versionen es nutzen können.

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

Actions werden danach benannt, **was passiert ist**, und danach gruppiert, **wo es passiert ist**. Die Seite meldet Ereignisse; sie gibt keine Befehle wie `loadWorkOrders`.

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

### 9.3. Das Feature: Zustand, Reducer, Selectors

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

Die Zuweisung ist **optimistisch**: Der Reducer wendet `assigneeChosen` sofort an, und `assignFailed` setzt den vorherigen Mechaniker zurück. Der vorherige Wert reist im Event mit, denn wenn der Effect läuft, enthält der Zustand bereits den neuen.

### 9.4. HTTP und Effects

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

`@Service()` aus Angular 22 ist die Kurzform von `@Injectable({ providedIn: 'root' })`; Abhängigkeiten holt es ausschließlich über `inject()`. `HttpClient` nutzt standardmäßig die Fetch API, daher braucht die Konfiguration kein `withFetch()`. `toErrorMessage` liegt in `shared/util-http`, einer frameworkfreien Bibliothek, die auch die React- und die Vue-Version nutzen.

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

`switchMap` zum Laden (ein neueres Depot bricht die ältere Anfrage ab), `mergeMap` für Zuweisungen (zwei Zuweisungen auf zwei Karten müssen beide abgeschlossen werden).

### 9.5. Provider

Das Store-Feature wird an der Route der Domäne registriert, nicht im Root der Anwendung. Der Root-Store bleibt leer, bis ein Disponent Maintenance öffnet, und der Code dafür wird mit der Route per Lazy Loading geladen.

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

### 9.6. Die öffentliche API von data-access

`libs/maintenance/data-access/src/index.ts`

```ts
export { provideWorkOrders } from './lib/work-orders.providers';
export { WorkOrdersFacade } from './lib/work-orders.facade';
```

Zwei Exports. Actions, Reducer, Selectors und der HTTP-Client sind privat. Jedes Feature in Maintenance geht über die Facade, und das Workshop-Team kann den Store umbauen, ohne eine einzige Komponente anzufassen.

## 10. Die Facade, und wann man sie weglässt

:::diagram fe-flow

Eine Facade ist ein dünnes Objekt zwischen Features und State-Management. Sie stellt **Zustand** bereit (Signals in Angular, Werte in React, Refs in Vue) und **Absichten** (Methoden). Sie enthält keine Logik: Jede Methode dispatcht genau ein Event, und jede Property ist genau ein Selector.

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

`autoProvided: false` schaltet die Bereitstellung in `root` ab. Die Facade wird von `provideWorkOrders()` bereitgestellt, sodass sie genau dort existiert, wo auch ihr Store-Feature existiert.

### 10.1. Warum eine Facade

- **Austauschbarer Zustand.** An dem Tag, an dem Arbeitsaufträge vom NgRx Store in einen Signal Store oder einen Server-Cache umziehen, ändert sich die Facade und keine Komponente. Fleetline hat genau das für `fleet` getan (Abschnitt 7.1).
- **Eine kleine Oberfläche.** Ein Feature sieht sechs Member statt vierzehn Actions und neun Selectors.
- **Einfache Tests.** Ein Feature-Test stellt ein Fake-Objekt mit derselben Form bereit (Abschnitt 15).
- **Dieselbe Form in jedem Framework.** Hier die Klasse, in React und Vue `useWorkOrders()`: Der Feature-Code liest sich in allen dreien fast gleich (Abschnitt 14).

### 10.2. Warum die Facade optional ist

Die NgRx-Community hat ein gutes Argument gegen Facades: Actions sollen Ereignisse beschreiben (*„Bearbeiter auf der Arbeitsauftragsseite gewählt“*), und eine Facade mit einer Methode `assign()` lädt dazu ein, in Befehlen zu denken. Eine Facade, die drei Actions hintereinander dispatcht oder Logik enthält, versteckt das Event-Log, das NgRx debugbar macht.

Deshalb ist die Facade in unserer Variante eine Regel mit Bedingungen:

| Facade verwenden, wenn | Weglassen, wenn |
|---|---|
| mehr als ein Feature denselben Zustand nutzt | ein Feature ein kleines Store-Feature besitzt |
| sich die Implementierung des Zustands ändern kann (Store ↔ Signal Store ↔ Server-Cache) | der Zustand lokal zu einer Komponente ist: einen Signal Store oder einfache Signals in der Komponente verwenden |
| die Daten einer anderen Domäne über `api` angeboten werden | das Team Events lieber direkt dispatcht und die Domäne klein ist |
| die Codebasis mit React- oder Vue-Teams geteilt wird | |

Zwei Regeln, wenn man eine verwendet:

1. **Methodennamen behalten das Event.** `assign()` dispatcht `assigneeChosen` aus der Quelle `Work Orders Page`. Wenn zwei Seiten zuweisen können, bekommt jede Seite ihr eigenes Event; die Facade bekommt zwei Methoden oder einen Parameter `source`, nie ein generisches `update()`.
2. **Keine Logik.** Kein `if`, keine Schleife, kein HTTP-Aufruf. Wenn eine Entscheidung nötig ist, gehört sie in einen Reducer, einen Selector oder einen Effect.

Ohne Facade exportiert die `index.ts` von `data-access` stattdessen die Seiten-Events und die Selectors, und die Komponente ruft `store.dispatch()` und `store.selectSignal()` selbst auf. Beide Formen bestehen die Grenzregeln; man wählt eine pro Domäne und schreibt sie in die README der Domäne.

## 11. Angular von Anfang bis Ende

Mit `data-access` an Ort und Stelle sind die übrigen Bibliotheken kurz.

Der Angular-Workspace mit allen Dateien dieses Anwendungsfalls. Jede Bibliothek hat außerdem eine eigene `project.json` und `tsconfig.json`; der Baum zeigt sie nur für die Anwendung und für `data-access`.

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

### 11.1. Die ui-Bibliothek

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

Die Karte kennt einen `WorkOrder`, weil `model` erlaubt ist. Sie bekommt `vehicleLabel` als String, weil eine `ui`-Bibliothek von Maintenance `fleet/api` nicht importieren darf. In Angular 22 ist `OnPush` die Standardstrategie der Change Detection, daher deklarieren Komponenten sie nicht; die Styles aus Abschnitt 6.3 kommen über `styleUrl` hinzu.

### 11.2. Die Feature-Bibliothek

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

`depotId` kommt über `withComponentInputBinding()` aus dem Routenparameter. `ensureLoaded` ist eine `rxMethod` und akzeptiert ein Signal, sodass Fleet bei jeder Änderung der sichtbaren Liste die Kennzeichen, die ihm noch fehlen, in einer Anfrage nachlädt.

### 11.3. Die Shell

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

Die Shell importiert `identity/api` für den Berechtigungs-Guard. Guards sind, wie die Kennzeichen aus Fleet, ein domänenübergreifendes Anliegen, also darf eine Shell die API einer anderen Domäne genauso nutzen wie ein Feature (Abschnitt 6.1). Alles andere, was die Shell braucht, kommt aus ihrer eigenen Domäne.

### 11.4. Die Anwendung

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

Eine neue Angular-22-Anwendung läuft ohne zone.js, und `HttpClient` nutzt die Fetch API, daher braucht die Konfiguration weder `provideZonelessChangeDetection()` noch `withFetch()`. Das ist die ganze Anwendung: zwei Dateien und ein `environment`. `backoffice` hängt dieselbe `maintenance/feature-shell` mit einem anderen Layout ein. Eine dritte Anwendung wäre ein Nachmittag Arbeit.

## 12. React und Next.js

Die Architektur hängt nicht von Angular ab. Bibliotheken, Typen, Domänen, Tags und die Lint-Regel bleiben gleich; Nx erzeugt React- und Next.js-Projekte mit `@nx/react` und `@nx/next`. Was sich ändert, ist die Implementierung der einzelnen Bibliothekstypen, und Next.js bringt eine neue Dimension mit: Code, der nur auf dem Server läuft.

Wir teilen Zustand in zwei Arten. **Serverzustand**, also Daten, die dem Backend gehören (die Liste der Arbeitsaufträge), hält **TanStack Query**. **Clientzustand**, also das, was nur im Browser existiert (Filterkriterien, Auswahlen, Entwürfe), hält **Zustand**. Beide sind privat in `data-access`, und das Feature sieht nur die Facade.

Derselbe Workspace mit einer Next.js-Anwendung und allen Dateien dieses Anwendungsfalls:

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

### 12.1. Was worauf abgebildet wird

| Angular | React / Next.js |
|---|---|
| `feature`-Komponente | Ein Server-Container, der die Daten lädt, und eine Client-Komponente, die sie anzeigt; beide in `feature-*`, und die `page.tsx` rendert nur den Container |
| `ui`-Komponente mit `input()`/`output()` | Eine Komponente mit Props und Callbacks |
| `shell`-Routen | Dateirouten bleiben in `apps/<app>/app/`; die Shell-Bibliothek exportiert das Domänen-Layout mit Providern und Berechtigungsprüfung |
| `provideWorkOrders()` an einer Route | `<WorkOrdersProvider>` im Layout der Shell |
| NgRx Store und Effects für Serverdaten | TanStack Query: `queryOptions`, `useQuery`, `useMutation` |
| Signal Store für Clientzustand | Zustand: `createStore` aus einer Factory, bereitgestellt über Context |
| `createSelector` | Selector in `useStore(store, selector)`; abgeleitete Werte berechnet die Facade, und der React Compiler memoisiert sie |
| `switchMap` in einem Effect | Query-Key und `signal` in der `queryFn` |
| Optimistischer Reducer und `assignFailed` | `onMutate` und `onError` in `useMutation` |
| Facade-Service | Ein Hook: `useWorkOrders()` |
| `@Service()` mit `HttpClient` | Ein Modul mit Funktionen über `createApiClient` aus `shared/util-http` |
| `inject()` | Context, gelesen mit `use()`, nur für Dinge mit einem Gültigkeitsbereich |
| `provideStoreDevtools` | Die `devtools`-Middleware von Zustand und die React Query Devtools |

Redux Toolkit passt ebenfalls zu dieser Architektur: ein Slice statt eines NgRx-Features, `createEntityAdapter`, Listener-Middleware statt Effects. Fleetline hat sich für TanStack Query und Zustand entschieden, weil in Next.js der größte Teil des Zustands Serverzustand ist und das, was auf der Clientseite übrig bleibt, klein ist (Abschnitt 17).

### 12.2. Tags für Server und Client

Im App Router ist eine Datei entweder eine Server-Komponente oder eine Client-Komponente. Code, der Secrets, Cookies oder die Datenbank liest, darf nie im Browser-Bundle landen. Fleetline ergänzt pro Domäne eine zweite Data-Access-Bibliothek und ein weiteres Tag:

| Bibliothek | Tags | Enthält |
|---|---|---|
| `maintenance/data-access` | `type:data-access`, `platform:client` | HTTP-Client, Queries und Mutations von TanStack Query, Zustand-Store, Provider, Facade-Hook |
| `maintenance/data-access-server` | `type:data-access`, `platform:server` | `server-only`-Fetch-Funktionen und Server Actions |

Die Lint-Regel aus Abschnitt 8.2 enthält bereits die Bedingung `platform:client` → nicht `platform:server`. Jede Server-only-Datei beginnt außerdem mit `import 'server-only'`, sodass ein Fehler den Build scheitern lässt, auch wo kein Lint läuft. Die `feature`-Bibliothek hat kein `platform`-Tag: Ihr Server-Container importiert `data-access-server`, die Client-Komponente nur `data-access`.

### 12.3. HTTP und Query-Client

React hat kein DI, daher ist der HTTP-Service ein gewöhnliches Modul. `createApiClient` aus `shared/util-http` ist eine dünne, frameworkfreie Schicht über `fetch`: Basis-URL, JSON und HTTP-Fehler als Exceptions. Das Modul hält nur Konfiguration, nie Nutzerdaten, und darf deshalb auf Modulebene leben.

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

Der Query-Cache hält, anders als die Konfiguration, Nutzerdaten. Deshalb entsteht der `QueryClient` in einem Provider: einer pro Browser-Tab und ein eigener für jeden Request auf dem Server. Das Root-Layout der App hängt den `QueryProvider` einmal ein, so wie `provideHttpClient()` in der `app.config.ts` von Angular.

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

### 12.4. Queries und Mutations

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

Der Key enthält `depotId`, und die `queryFn` reicht `signal` an `fetch` weiter. Ein Depotwechsel verwirft die alte Query und bricht ihren Request ab: die Semantik von `switchMap` aus Abschnitt 9.4. Zwei Komponenten, die denselben Key lesen, teilen sich einen Request und einen Cache-Eintrag. Die Datei hat kein `'use client'`, weil `workOrdersQuery` auch vom Server-Container importiert wird (Abschnitt 12.7).

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

Dasselbe optimistische Update wie in Abschnitt 9.3: `onMutate` trägt den neuen Mechaniker sofort ein, `onError` stellt die vorherige Liste wieder her, und `onSettled` holt den Stand vom Server nach. Mutations brechen einander nicht ab, sodass zwei Zuweisungen auf zwei Karten beide abgeschlossen werden, wie bei `mergeMap`.

### 12.5. Clientzustand in Zustand

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

Zustand hält nur, was dem Client gehört: die Filterkriterien. Die Liste der Aufträge liegt im Query-Cache und wird hier nicht kopiert, weil zwei Quellen der Wahrheit früher oder später auseinanderlaufen. Actions benennen wir wie die Events aus Abschnitt 9.2 (`filterChanged`, nicht `setFilter`), und das dritte Argument von `set` schreibt dieses Event in die Redux DevTools, sodass das Event-Log erhalten bleibt, wenn auch ohne Reducer.

Der Store entsteht aus der Factory `createStore`, nicht aus `create()` auf Modulebene. Ein globaler Store wäre in Next.js auf dem Server für alle Requests geteilt, also für alle Nutzer. Die Factory ruft ein Provider auf:

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

`WorkOrdersProvider` ist das Gegenstück zu `provideWorkOrders()`. Das Layout der Shell hängt ihn ein (Abschnitt 12.8), sodass der Store genau dort existiert, wo die Maintenance-Routen sind. React 19 rendert einen Context direkt als Provider und liest ihn mit `use()`.

### 12.6. Der Facade-Hook

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

Der Hook hat dieselben Member wie die Facade in Angular, bis auf `open()`: Der Query-Key enthält `depotId`, die Query muss also nicht geöffnet werden. Die Facade hat keine Seiteneffekte. Sie registriert nichts und sendet beim Einhängen nichts, sodass beliebig viele Komponenten sie nutzen können, etwa ein Zähler überfälliger Aufträge im Header, ohne zweiten Request.

Jedes Feld des Stores hat einen eigenen Selector. In Zustand 5 braucht ein Selector, der ein neues Objekt zurückgibt, `useShallow`, sonst rendert die Komponente in einer Endlosschleife. `visible` und `overdueCount` werden bei jedem Render berechnet; der React Compiler memoisiert sie automatisch, daher braucht die Facade weder `useMemo` noch `useCallback`.

`libs/maintenance/data-access/src/index.ts`

```ts
export { workOrdersQuery } from './lib/work-orders.queries';
export { WorkOrdersProvider } from './lib/work-orders.provider';
export { useWorkOrders } from './lib/use-work-orders';
```

Drei Exporte. Der Zustand-Store, die Mutations und der HTTP-Client sind privat.

### 12.7. Feature, ui und Route

Das Feature hat zwei Container. `WorkOrdersRoute` ist eine Server-Komponente: Sie lädt die Aufträge über `data-access-server`, mit den Cookies des Nutzers, und übergibt sie über `HydrationBoundary` an den Query-Cache. `WorkOrdersPage` ist eine Client-Komponente: Sie liest die Facade und setzt die `ui`-Bibliotheken zusammen.

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

Der erste Render im Browser hat die Daten bereits, ohne zweiten Request und ohne Spinner; `loading.tsx` in der App ist nur während des Ladens auf dem Server zu sehen.

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

`work-order-card.module.scss` ist die Datei aus Abschnitt 6.3. CSS Modules machen aus `.card` einen in der ganzen App eindeutigen Namen, sodass eine Klasse aus einer Bibliothek nicht in eine andere durchsickert.

Die Routendateien in der Anwendung bleiben jeweils wenige Zeilen lang.

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

### 12.8. Shell und die API einer anderen Domäne

Das Layout der Shell ist eine Server-Komponente. Es prüft zuerst die Berechtigung auf dem Server und hängt dann die Provider der Domäne ein. In Angular erledigen das `canActivate` und `providers` an der Route (Abschnitt 11.3).

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

Ein Layout in Next.js wird bei Übergängen zwischen Maintenance-Seiten nicht ausgehängt, sodass die Stores die Navigation innerhalb der Domäne überleben und verschwinden, wenn der Disponent sie verlässt.

`useVehicleSummaries` aus `fleet/api` ist das Gegenstück zum `VehicleSummaryStore` aus Abschnitt 7.1, geschrieben mit Zustand: Maintenance übergibt eine Liste von IDs, und Fleet lädt die fehlenden Kennzeichen in einem Request nach.

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

Der Effect hängt von `key` ab, nicht vom Array, weil das Feature bei jedem Render ein neues Array erzeugt.

`libs/fleet/api/src/index.ts`

```ts
export type { VehicleSummary, VehicleId } from '@fleetline/fleet/model';
export { VehicleSummaryProvider, useVehicleSummaries } from '@fleetline/fleet/data-access';
export { VehicleBadge } from '@fleetline/fleet/ui-vehicle-badge';
```

### 12.9. Fallstricke speziell in Next.js

- **`'use client'` ist eine eigene Grenze.** Es gehört in Client-Komponenten, Provider und Hooks, nie in `model`, `util` oder in die Datei mit `queryOptions`, die auch der Server importiert.
- **Kein Store in einer Modulvariable.** `create()` von Zustand oder `new QueryClient()` auf Modulebene teilt den Zustand zwischen allen Requests auf dem Server. Stores und der Query-Client entstehen in Providern.
- **Zustand kopiert keine Serverdaten.** Die Liste aus der API liegt im Query-Cache; eine Kopie davon im Store ist eine zweite Quelle der Wahrheit.
- **Keine Server-Bibliothek in eine Client-Datei importieren, „nur wegen des Typs“.** Typen liegen in `model`.
- **Server Actions gehören in `data-access-server`.** Ein Feature importiert sie über Re-Exports von `data-access` nur, wenn die Lint-Tags es erlauben; sonst reicht die Seite sie als Props weiter.
- **Routendateien bleiben dünn.** Eine `page.tsx`, in der Logik wächst, ist die Next.js-Version einer aufgeblähten Angular-App-Komponente.

## 13. Vue und Nuxt

Vue lässt sich noch direkter abbilden, weil Pinia-Setup-Stores einem NgRx Signal Store sehr ähneln und Composables die natürliche Form einer Facade sind. Nx baut Vue- und Nuxt-Projekte mit `@nx/vue` und `@nx/nuxt`.

Derselbe Workspace mit einer Nuxt-Anwendung und allen Dateien dieses Anwendungsfalls:

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

### 13.1. Was worauf abgebildet wird

| Angular | Vue / Nuxt |
|---|---|
| `feature`-Komponente | Eine Single-File-Komponente in `feature-*`; die Seite in `apps/<app>/app/pages/` rendert sie nur |
| `ui`-Komponente | Eine Komponente mit `defineProps` und `defineEmits`, Styles in `<style scoped>` |
| `shell`-Routen | Dateirouten bleiben in der App; die Shell-Bibliothek exportiert Layout und Routen-Middleware, und die App re-exportiert sie nur |
| `provideWorkOrders()` an einer Route | `provideWorkOrders()`, aufgerufen im Layout der Shell |
| NgRx Store / Signal Store | Pinia (Setup-Store) |
| Selectors | `computed` im Store |
| Effects | Asynchrone Actions im Store; `useAsyncData` zum Laden beim Server-Rendering |
| `switchMap` in einem Effect | `AbortController` in einer Store-Action |
| Facade-Service | Ein Composable: `useWorkOrders()` |
| `@Service()` mit `HttpClient` | Ein Composable `useWorkOrdersHttp()` mit `$fetch.create` und `useRuntimeConfig()` |
| `provideStoreDevtools` | Vue DevTools mit dem Pinia-Tab |

Pinia trennt nicht zwischen Actions und Reducern. Damit fallen das Event-Log und das Time-Travel-Debugging von NgRx weg, aber auch der größte Teil der Zeremonie. Für die Architektur ändert das nichts: Der Store ist privat in `data-access`, und das Composable ist die Tür.

### 13.2. Auto-Imports für Bibliotheken abschalten

Nuxt importiert Komponenten und Composables automatisch. Das ist in einer kleinen App bequem und für Grenzen fatal: **Ein Import, der nie geschrieben wird, lässt sich nicht linten.** Wenn ein Feature in Billing `useWorkOrders()` ohne `import`-Zeile nutzen kann, sieht die Lint-Regel die Grenzüberschreitung nie.

Regeln in Fleetlines Nuxt-Anwendungen:

- Bibliotheken werden mit expliziten `import`-Anweisungen über ihre Pfad-Aliase importiert, nie als Auto-Import-Verzeichnisse registriert;
- Domänen sind keine Nuxt-Layer, weil Layer ihre Komponenten und Composables automatisch in die App importieren;
- die App behält Auto-Imports für Vue- und Nuxt-APIs nur in ihren eigenen `pages/` und `layouts/`, und Bibliothekscode importiert Nuxt-Funktionen aus `#imports`;
- Layouts und Middleware, auf die eine Seite in `definePageMeta` per Name verweist, sind in der App einzeilige Re-Exports aus `feature-shell` (Abschnitt 13.5), weil die Lint-Regel Namen in einem String nicht prüfen kann.

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

### 13.3. Der Store

Der HTTP-Service ist ein Composable. Seine Konfiguration nimmt er aus der `runtimeConfig` der App, also aus Nuxts DI, so wie `WorkOrdersHttp` in Angular `API_BASE_URL` über `inject()` bekommt.

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

`open` bricht den vorherigen Request ab, bevor es einen neuen sendet: `switchMap` aus Abschnitt 9.4, von Hand geschrieben. Ohne das könnte bei einem schnellen Depotwechsel eine ältere Antwort eine neuere überschreiben. `assign` bricht nichts ab, wie `mergeMap`, und stellt bei einem Fehler den gemerkten Auftrag wieder her. Fehler fängt der Store und schreibt sie in `error`, wie der Reducer in Abschnitt 9.3.

`byId`, `filter` und `error` werden zurückgegeben, damit Pinia sie in den serverseitig gerenderten Payload serialisiert und der Browser mit demselben Zustand startet. `inflight` wird nicht zurückgegeben und bleibt daher privat für die Store-Instanz. Ein Setup-Store bekommt `$reset` nicht geschenkt, also definiert er es selbst.

### 13.4. Das Facade-Composable und der Gültigkeitsbereich des Stores

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

Der Key ist eine Funktion von `depotId`, sodass ein Depotwechsel neu lädt. Auf dem Server wartet `useAsyncData` auf die Daten; im Browser hydriert die Seite aus dem Payload ohne zweite Anfrage.

Pinia hält einen Store pro Anwendung, auf dem Server einen pro Request. Ohne einen zusätzlichen Schritt bliebe der Maintenance-Zustand nach dem Verlassen der Domäne im Speicher. `provideWorkOrders()` gibt ihm denselben Gültigkeitsbereich wie ein Provider an einer Route in Angular:

`libs/maintenance/data-access/src/lib/work-orders.providers.ts`

```ts
import { onUnmounted } from 'vue';
import { useWorkOrdersStore } from './work-orders.store';

export function provideWorkOrders() {
  const store = useWorkOrdersStore();
  onUnmounted(() => store.$reset());
}
```

`onUnmounted` läuft auf dem Server nicht, daher landet der Zustand vor der Hydration im Payload und verschwindet im Browser, wenn der Disponent Maintenance verlässt.

`libs/maintenance/data-access/src/index.ts`

```ts
export { provideWorkOrders } from './lib/work-orders.providers';
export { useWorkOrders } from './lib/use-work-orders';
```

Ein Team, das die Trennung in Server- und Clientzustand wie in React bevorzugt, greift zu **Pinia Colada**, der offiziellen Query-Schicht für Pinia: das Gegenstück zu TanStack Query mit Keys, Cache und optimistischen Mutations. Facade und Feature ändern sich nicht.

### 13.5. Feature, ui, Shell und Seite

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

Vue 3.5 behält die Reaktivität von Props nach der Destrukturierung bei, daher verfolgt `() => depotId` den Routenwechsel.

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

Die Shell exportiert ein Layout, das `provideWorkOrders()` aufruft, und eine Middleware mit der Berechtigungsprüfung:

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

Die App re-exportiert sie nur, sodass die Lint-Regel den Import aus `feature-shell` sieht:

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

`useVehicleSummaries` aus `fleet/api` ist in Vue ein kleiner Pinia-Store mit der Action `ensureLoaded`, derselben wie in Abschnitt 12.8, und ein Composable, das sie aufruft:

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

### 13.6. Fallstricke speziell in Nuxt

- **Das Linten von `.vue`-Dateien** braucht `vue-eslint-parser` in der ESLint-Konfiguration, sonst überspringt die Grenzregel stillschweigend jede Komponente. Das `files`-Muster in Abschnitt 8.2 enthält deshalb `**/*.vue`.
- **Ein Store pro Request.** Pinia mit `@pinia/nuxt` erzeugt auf dem Server bereits einen pro Request. Niemals Zustand in einem `ref` auf Modulebene in einer Bibliothek halten: Auf dem Server würde er zwischen Nutzern geteilt.
- **`useAsyncData` gehört in die Facade**, nicht in den Store. Der Store bleibt so aus Tests und aus reinem Client-Code nutzbar.
- **`await` auf oberster Ebene von `<script setup>`** braucht ein `<Suspense>` über der Komponente. Nuxt-Seiten haben eines; eine Feature-Komponente, die anderswo gerendert wird, muss man darin einbetten.
- **Styles nur `scoped`.** Ein `<style>`-Block ohne `scoped` in einer Bibliothek landet im globalen CSS der ganzen Anwendung.

## 14. Nebeneinander

:::diagram fe-frameworks

Derselbe Use Case in drei Frameworks, Datei für Datei:

| Bibliothek | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| `model` | `work-order.ts` | dieselbe Datei | dieselbe Datei |
| `data-access`-Zustand | `createFeature` + `createEntityAdapter` | TanStack Query (Server) + Zustand (Client) | Pinia-Setup-Store |
| `data-access`-Effects | funktionales `createEffect` | `queryFn` und `useMutation` | asynchrone Store-Actions + `useAsyncData` |
| Nebenläufigkeit | `switchMap` / `mergeMap` | Query-Key + `signal` | `AbortController` |
| HTTP-Service | `@Service()` + `HttpClient` | Modul über `createApiClient` | Composable mit `$fetch.create` |
| `data-access`-Facade | `WorkOrdersFacade` (Signals) | `useWorkOrders()` (Werte) | `useWorkOrders()` (Refs) |
| Gültigkeitsbereich des Zustands | `provideWorkOrders()` an der Route | `<WorkOrdersProvider>` im Layout der Shell | `provideWorkOrders()` im Layout der Shell |
| `ui` | `input()` / `output()` | Props / Callbacks | `defineProps` / `defineEmits` |
| `ui`-Styles | `styleUrl`, emulierte Kapselung | CSS Modules | `<style scoped>` |
| `feature` | Standalone-Komponente, standardmäßig `OnPush` | Server-Container + Client-Komponente | Single-File-Komponente |
| `shell` | `Routes` mit `providers` und `canActivate` | Server-Layout mit Providern | Layout + Routen-Middleware |
| App-Route | `loadChildren` | `page.tsx` | `pages/*.vue` |
| Facade-Attrappe im Test | Provider im `TestBed` | `vi.mock` des Moduls | `vi.mock` des Moduls |
| Grenzen | `@nx/enforce-module-boundaries` | dieselbe Regel | dieselbe Regel, mit `vue-eslint-parser` |

Was in allen dreien identisch bleibt: der Ordner jeder Datei, die Tags, die Lint-Regel, die `model`-Bibliothek, die Member der Facade (in React ohne `open()`, weil sich die Query selbst öffnet), die Komponenten-Styles und die Tests der `model`-Bibliothek. Wer zwischen Fleetlines Apps wechselt, muss nur das Framework selbst neu lernen.

## 15. Testen pro Bibliothekstyp

Jeder Typ hat eine natürliche Art von Test, und die Grenzen machen jeden davon günstig.

| Typ | Test | Geschwindigkeit | Was er fälscht |
|---|---|---|---|
| `model`, `util` | Einfache Unit-Tests, kein Framework | Millisekunden | nichts |
| `data-access`-Reducer, -Selectors | Tests reiner Funktionen | Millisekunden | nichts |
| `data-access`-Effects, -Queries und -Mutations | Tests mit per MSW ersetztem Netzwerk | schnell | HTTP |
| Facade | Integration mit dem echten Store | schnell | HTTP (MSW) |
| `ui` | Komponententests, Stories in Storybook | schnell | nichts, sie hat nur Inputs |
| `feature` | Komponententest mit einer Fake-Facade | schnell | die Facade |
| App | End-to-End mit Playwright, wenige Abläufe | langsam | das Backend, oder nichts |

Ein Reducer-Test braucht kein TestBed:

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

Ein Feature-Test stellt eine Fake-Facade bereit, weil die Komponente nichts anderes sieht:

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

In React und Vue kommt die Facade nicht über DI, daher ersetzt der Feature-Test das Modul. Das Prinzip ist dasselbe: Die Komponente sieht nichts außer der Facade und den `ui`-Bibliotheken.

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

In Vue schreibt man denselben Test mit `@vue/test-utils` und demselben `vi.mock`, und eine Komponente mit `await` in `<script setup>` wird mit `mountSuspended` aus `@nuxt/test-utils` eingehängt. Pinia-Stores ersetzt in den Integrationstests der Facade `createTestingPinia` aus `@pinia/testing`, und das Netzwerk ersetzt in allen drei Frameworks MSW, sodass die `data-access`-Tests nicht davon abhängen, wie der HTTP-Service seine Konfiguration bekommt.

Testdaten-Builder wie `aWorkOrder` liegen in einem sekundären Entry Point von `model` (`@fleetline/maintenance/model/testing`), sodass die Tests jedes Frameworks dieselben verwenden.

## 16. Hineinwachsen und migrieren

Niemand beginnt mit siebzig Bibliotheken. Fleetline begann als eine Angular-Anwendung mit einem Ordner `src/app`; die folgenden Schritte sind die Reihenfolge, die funktioniert hat.

### 16.1. Migration in acht Schritten

1. **Den Workspace um die App herum anlegen.** `nx init` im bestehenden Repository. Noch wird nichts verschoben.
2. **Die Domänen auf Papier zeichnen.** Die Begriffe des Geschäfts verwenden: Worüber sprechen Disponenten, Kunden und die Finanzabteilung? Mit sechs bis zehn Domänen rechnen. In eine README schreiben.
3. **Die Regel als Warnung einschalten.** Die Lint-Konfiguration aus Abschnitt 8.2 mit `'warn'` hinzufügen. Die Warnungen zählen; das ist die Ausgangsbasis.
4. **Zuerst `model` und `util` herauslösen.** Sie haben keine Abhängigkeiten, das Verschieben ist also sicher, und jeder spätere Schritt braucht sie. `nx g @nx/workspace:move` verwenden.
5. **`ui` pro Domäne herauslösen.** Jede Komponente, die nur Inputs und Outputs hat, zieht um. Komponenten, die einen Store injizieren, bleiben vorerst.
6. **`data-access` pro Domäne herausschneiden.** Den Root-Store nach Domänen aufteilen; jedes Store-Feature mit seinen Effects und seinem HTTP in das `data-access` der Domäne verschieben und an der Route der Domäne registrieren.
7. **Seiten in `feature-*` und Routen in `feature-shell` verschieben.** Die App schrumpft auf ihre Routen und Provider.
8. **Die Regel auf `'error'` umstellen und CODEOWNERS ergänzen.** Ab jetzt lässt jede neue Grenzüberschreitung die CI scheitern.

Die Schritte 4 bis 7 laufen Domäne für Domäne, und die Anwendung wird zwischendurch weiter ausgeliefert. Bei Fleetline dauerte die ganze Migration vier Monate neben der Feature-Arbeit, eine Domäne nach der anderen, beginnend mit der kleinsten (`notifications`), um die Handgriffe zu lernen.

### 16.2. Was üblicherweise schiefgeht

- **Eine Domäne namens `common` oder `core`.** Sie wird zum neuen `shared/`. Jedes Konzept hat einen fachlichen Besitzer; den gilt es zu finden.
- **Domänen nach Seiten statt nach Fachsprache geschnitten.** „Dashboard“ ist keine Domäne; es ist ein Feature, das über deren APIs aus mehreren Domänen liest.
- **API-Bibliotheken, die alles re-exportieren.** Dann ist die Grenze nur kosmetisch. Exportieren, was ein anderes Team tatsächlich nutzt, und sonst nichts.
- **Deaktivierte Lint-Zeilen.** Aus einem `eslint-disable` für die Grenzregel werden innerhalb eines Jahres vierzig. Ausnahmen gehören in die Konfiguration, mit einer Begründung im Pull Request.

### 16.3. Wann man eine Bibliothek aufteilt

- Ein `data-access` mit mehr als drei oder vier Store-Features oder mit zwei Teams als Besitzer: nach Subdomäne aufteilen.
- Eine `ui`-Bibliothek, die nur ein Feature importiert: zurück in dieses Feature mergen oder behalten, aber nicht nach `shared` verschieben.
- Ein `feature` mit mehreren voneinander unabhängigen Routen: eine Bibliothek pro Use Case.
- Eine Domäne, deren Bibliotheken größtenteils einem anderen Team gehören: Die Domäne ist falsch geschnitten, oder die Teamgrenzen sind es.

### 16.4. Wann das zu viel ist

Für eine Anwendung, ein Team und eine oder zwei Domänen kostet die volle Struktur mehr, als sie spart. Dann besser mit Ordnern innerhalb eines Projekts beginnen (`src/domains/<domain>/feature-…`, `ui-…`, `data-access`, `model`) und sie mit Sheriff durchsetzen (Abschnitt 8.4). Diese Ordner später in Nx-Bibliotheken zu verschieben, ist ein mechanischer Schritt, weil die Abhängigkeitsregeln dann schon stimmen.

## 17. Fragen

**Brauchen wir NgRx für allen Zustand?**
Nein. Gemeinsamer, langlebiger Zustand, den mehrere Features lesen, kommt in einen Store. Formularzustand, offene oder geschlossene Panels und anderer Zustand, der einer Komponente gehört, bleiben in der Komponente, mit Signals oder einem Signal Store auf Komponentenebene.

**NgRx Store oder NgRx Signal Store?**
Beide passen zur Architektur, beide liegen in `data-access`, und die Facade verbirgt die Wahl. Fleetline nutzt den Store dort, wo sich ein Event-Log und die Devtools auszahlen (Maintenance, Planung), und den Signal Store für einfachere Domänen (Fleet-Übersichten, Benachrichtigungen). Das Events-Plugin des Signal Store (`@ngrx/signals/events`) bringt Events im Flux-Stil dorthin, sodass das Event-Log nicht mehr das einzige Argument für den klassischen Store ist.

**Und Serverzustand in Angular?**
In Angular 22 sind `resource`, `rxResource` und `httpResource` stabil, und bei zwei überlappenden Requests zählt nur der neueste, wie bei `switchMap`. Für Daten, die überwiegend gelesen werden, ist das Angulars Gegenstück zu TanStack Query und Pinia Colada: `data-access` hält die `httpResource`, und die Facade stellt deren `value()` und `isLoading()` bereit. Das Feature ändert sich nicht.

**Warum in React Zustand und TanStack Query und nicht Redux Toolkit?**
Beide Varianten erfüllen dieselben Grenzregeln, und beide verstecken sich hinter derselben Facade. Redux Toolkit bietet, was NgRx Store bietet: Slices, `createEntityAdapter`, Listener-Middleware und ein vollständiges Event-Log. In Next.js ist der größte Teil des Zustands jedoch Serverzustand, und was auf der Clientseite übrig bleibt, ist klein. Fleetline hält die Daten deshalb im Query-Cache und den Rest in kleinen Zustand-Stores mit benannten Actions in den Devtools. Ein Team, das in einer großen clientseitigen Domäne ein Event-Log braucht, kann dort Redux Toolkit verwenden.

**Ist eine Facade nicht nur eine zusätzliche Schicht?**
Doch, und Abschnitt 10 sagt, wann sie sich lohnt. In React und Vue ist der Hook oder das Composable ohnehin der idiomatische Weg, Zugriff auf Zustand zu teilen, dort kostet die Facade also fast nichts.

**Sollte jede Domäne vom ersten Tag an eine `api`-Bibliothek haben?**
Nein. Sie entsteht, wenn eine andere Domäne zum ersten Mal etwas braucht. Bis dahin ist die Domäne vollständig privat, und das ist die beste Grenze, die es gibt.

**Sind das Micro-Frontends?**
Nein. Alles hier wird pro App-Ordner zu einer Anwendung gebaut. Derselbe Domänenschnitt ist später die natürliche Naht für Micro-Frontends, falls die Organisation jemals unabhängige Deployments braucht.

**Können React, Vue und Angular wirklich Bibliotheken teilen?**
Sie teilen `model`- und `util`-Bibliotheken mit dem Tag `framework:agnostic` sowie Testdaten-Builder. Komponenten und Stores gibt es pro Framework. Bei Fleetline ist etwa ein Fünftel des Frontend-Codes frameworkunabhängig.

**Wo können wir mehr lesen?**
Manfred Steyers Artikel und das kostenlose E-Book *Enterprise Angular* auf [angulararchitects.io](https://www.angulararchitects.io/), die [Nx-Dokumentation](https://nx.dev/) zu Modulgrenzen, [Sheriff](https://github.com/softarc-consulting/sheriff), die [NgRx-Dokumentation](https://ngrx.io/), [TanStack Query](https://tanstack.com/query), [Zustand](https://zustand.docs.pmnd.rs/) und [Pinia](https://pinia.vuejs.org/).
