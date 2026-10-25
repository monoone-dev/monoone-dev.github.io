Ten przewodnik opisuje, jak budujemy duże frontendy: jeden workspace, wiele aplikacji, wiele zespołów i reguła dla każdego pliku. Budujemy go w **Nx** i **Angular**, wspólny stan trzymamy w **NgRx**, a przed store'em stawiamy **opcjonalną fasadę**. Potem pokazujemy tę samą architekturę, reguła po regule, w **React z Next.js** i w **Vue z Nuxt**.

Ta architektura nie jest nasza. Jej rdzeń opracował i opublikował **Manfred Steyer**, trener i konsultant Angulara, Google Developer Expert for Angular i twórca [ANGULARarchitects](https://www.angulararchitects.io/). Jego pomysł polega na tym, żeby ciąć frontend **pionowo według domen** i **poziomo według typów bibliotek**, pozwolić domenom rozmawiać tylko przez jawne API i zostawić pilnowanie tych granic narzędziu, a nie wiki. Sekcja 2 wymienia dokładnie, co pochodzi od niego, co od Nx, a co dodaliśmy my.

Mały przykład nie pokaże, dlaczego to wszystko ma znaczenie. Jedna domena z jednym store'em mieści się każdemu w głowie. Dlatego każdy przykład na tej stronie pochodzi z jednego realistycznego workspace'u: **Fleetline**, platformy do obsługi serwisowej flot z trzema aplikacjami, dziewięcioma domenami, około siedemdziesięcioma bibliotekami i pięcioma zespołami. Przedstawiamy go w sekcji 5 i używamy w każdej kolejnej.

> Dla zespołów, które już mają albo wkrótce będą mieć więcej niż jedną aplikację frontendową, więcej niż jeden zespół albo więcej niż około 50 000 linii kodu frontendu. Poniżej tej skali zacznijcie od sekcji 16.4.

## 1. Po co frontendowi architektura

Frontend rośnie za każdym razem tak samo. W pierwszym roku jest jedna aplikacja i folder `src/app` z `components`, `services` i `store`. W trzecim roku ten sam projekt wygląda zwykle tak:

- `shared/` trzyma trzysta plików, a połowy z nich używa dokładnie jedna funkcja;
- komponent w billingu importuje selektor z maintenance, bo akurat tam był;
- główny store ma czterdzieści kluczy feature'ów i nikt nie wie, których potrzebuje dana strona;
- druga aplikacja powstaje przez skopiowanie pierwszej, bo wydzielenie kodu jest zbyt trudne;
- jedna zmiana w helperze do dat przebudowuje i testuje od nowa całe repozytorium;
- nowa osoba w zespole albo agent kodujący potrzebuje dni, żeby ustalić, gdzie mieszka dana funkcja i czego może używać.

Nie powodują tego źli inżynierowie. Powoduje to brak wspólnej odpowiedzi na dwa pytania: **gdzie trafia ten plik** i **kto może importować kogo**. Bez odpowiedzi wygrywa najbliższy folder, a najbliższy folder to zawsze `shared/`.

Architektura z tego przewodnika odpowiada na oba pytania raz, dla każdego rodzaju kodu frontendu, i sprawia, że odpowiedź jest **mechaniczna**: reguła lintera odrzuca import, który przekracza granicę, w edytorze i w CI.

### 1.1. Cele

1. **Łatwość odnalezienia.** Kto zna nazwę funkcji, zna jej folder, w każdej aplikacji.
2. **Lokalne zmiany.** Zmiana wewnątrz jednej domeny nie zepsuje innej, bo inna domena nie widzi jej wnętrza.
3. **Szybka informacja zwrotna w dużej skali.** CI buduje i testuje tylko biblioteki, których dotyczy zmiana.
4. **Równoległe zespoły.** Zespół jest właścicielem domen, a nie plików rozsianych po `shared/`.
5. **Wymienny stan.** Funkcja nie wie, czy jej dane pochodzą z NgRx, z Signal Store, z cache'a czy z serwera.
6. **Jeden zbiór reguł dla trzech frameworków.** Aplikacje w Angularze, Reakcie i Vue w tej samej firmie mają tę samą strukturę, a kod niezależny od frameworka jest między nimi współdzielony.

### 1.2. Czego ta architektura nie robi

- Nie wybiera backendu, design systemu ani CSS.
- Nie wymaga mikrofrontendów. Wszystko tutaj działa w jednej wdrażanej aplikacji; mikrofrontendy to późniejsza, osobna decyzja.
- Nie zastępuje reguł produktu. Mówi, gdzie mieszka kod i czego może używać; wasz projekt mówi, co ten kod ma robić.

## 2. Skąd się wziął ten pomysł

Architektura łączy trzy źródła. Wymieniamy je, bo każde warto przeczytać w oryginale.

| Źródło | Co wnosi |
|---|---|
| **Nx** (zespół Nrwl, *Enterprise Angular Monorepo Patterns*) | Samo monorepo, biblioteki z publicznym `index.ts` i klasyczne typy bibliotek: `feature`, `ui`, `data-access`, `util`. Tagi na projektach i regułę lintera `@nx/enforce-module-boundaries`. |
| **Manfred Steyer** (ANGULARarchitects, e-book *Enterprise Angular*, jego artykuły o projektowaniu strategicznym z Nx) | Zastosowanie Domain-Driven Design we frontendzie: **domeny jako pionowe wycinki**, **typy bibliotek jako poziome warstwy**, dwa wymiary tagów (`domain:*` i `type:*`) sprawdzane przez linter, **biblioteka API** jako jedyne drzwi między domenami i **fasada** między UI a zarządzaniem stanem. Później także **Sheriff**, narzędzie do sprawdzania granic w projektach bez Nx. |
| **NgRx** (a przed nim Redux) | Jeden store na wspólny stan, zmiany przez akcje i czyste reducery, efekty uboczne w efektach, odczyty przez memoizowane selektory. |

Co zdecydowaliśmy dodatkowo, w tym przewodniku:

- osobny typ `model` na typy niezależne od frameworka i czyste funkcje domenowe, żeby biblioteki `ui` nigdy nie zależały od zarządzania stanem;
- osobny typ `shell` (`feature-shell` z Nx), który jest właścicielem tras i providerów domeny;
- trzeci wymiar tagów, `framework:*`, żeby aplikacje w Angularze, Reakcie i Vue mogły żyć w jednym workspace'ie i współdzielić kod `model` i `util`;
- czwarty wymiar dla Next.js, `platform:server` i `platform:client`;
- regułę z sekcji 10, kiedy fasada się opłaca, a kiedy ją pominąć;
- przełożenie na React/Next i Vue/Nuxt w sekcjach 12 i 13.

Gdy coś na tej stronie nie zgadza się z oryginalnymi artykułami, punktem odniesienia dla samego pomysłu jest oryginał; ta strona jest punktem odniesienia dla tego, jak go stosujemy.

## 3. Architektura na jednej stronie

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

Sześć zdań do zapamiętania:

1. **Każda biblioteka ma jedną domenę i jeden typ**, zapisane jako tagi, a tagi decydują, co może importować.
2. **Importy wskazują w dół drabiny typów**: feature → ui, data-access → model → util. Nigdy w górę, nigdy w bok między feature'ami.
3. **Domena widzi inną domenę tylko przez jej bibliotekę `api`.** Cała reszta domeny jest prywatna.
4. **`shared` nie zna żadnej domeny.** Jeśli „wspólny” plik wspomina o zleceniach serwisowych, należy do maintenance.
5. **Komponenty nigdy nie rozmawiają z HTTP.** Dane płyną przez `data-access`; feature widzi fasadę albo selektory, nigdy URL.
6. **Aplikacje są cienkie.** Aplikacja spina trasy i providery; funkcje mieszkają w bibliotekach, więc druga aplikacja nic nie kosztuje.

## 4. Słownik

| Termin | Znaczenie |
|---|---|
| **Workspace** | Jedno repozytorium Nx ze wszystkimi aplikacjami i bibliotekami. |
| **Aplikacja** | Wdrażany frontend w `apps/`. Prawie nie zawiera kodu. |
| **Biblioteka** | Folder w `libs/` z własnym `project.json`, tagami i publicznym `index.ts`. Importowana tylko przez alias ścieżki, np. `@fleetline/maintenance/data-access`. |
| **Domena** | Część biznesu z własnym językiem i danymi: obsługa serwisowa, flota, rozliczenia. Nazywana też bounded contextem. Jeden folder w `libs/`. |
| **Typ** | Techniczna rola biblioteki: `feature`, `ui`, `data-access`, `model`, `util`, `api`, `shell`. |
| **Publiczne API** | `index.ts` biblioteki. To, czego nie eksportuje, dla innych bibliotek nie istnieje. |
| **Fasada** | Mała klasa, hook albo composable, której feature używa zamiast store'a: stan jako sygnały albo refy, intencje jako metody. |
| **Reguła granic** | Reguła lintera, która czyta tagi dwóch bibliotek i odrzuca import, na który tagi nie pozwalają. |

## 5. Przykład: Fleetline

Fleetline obsługuje serwis dla firm, które eksploatują ciężarówki, dostawczaki i autobusy. Mechanicy pracują w zajezdniach; planiści przydzielają pracę; klienci rezerwują usługi i płacą faktury; finanse i wsparcie prowadzą back office.

### 5.1. Aplikacje

| Aplikacja | Użytkownicy | Framework w tym przewodniku |
|---|---|---|
| `ops-portal` | Planiści i mechanicy w zajezdniach | Angular |
| `customer` | Klienci flotowi: rezerwacje, pojazdy, faktury | Angular (Next.js w sekcji 12) |
| `backoffice` | Finanse, wsparcie, administratorzy | Angular (Nuxt w sekcji 13) |

### 5.2. Domeny i zespoły

| Domena | Jest właścicielem | Zespół | Używana przez aplikacje |
|---|---|---|---|
| `maintenance` | Zlecenia serwisowe, checklisty, tablica planowania, SLA | Workshop | ops-portal, backoffice |
| `fleet` | Pojazdy, licznik przebiegu, historia serwisowa | Workshop | wszystkie trzy |
| `inventory` | Części, stany magazynowe na zajezdnię, rezerwacje | Supply | ops-portal, backoffice |
| `booking` | Terminy serwisu, proces rezerwacji, zmiana terminu | Customer | customer, ops-portal |
| `billing` | Wyceny, faktury, płatności | Finance | customer, backoffice |
| `customers` | Konta, umowy, kontakty | Customer | customer, backoffice |
| `identity` | Logowanie, role, uprawnienia | Platform | wszystkie trzy |
| `notifications` | Skrzynka w aplikacji, preferencje e-mail | Platform | wszystkie trzy |
| `shared` | Design system, layout, konfiguracja HTTP, daty, kwoty, testy | Platform | wszystkie trzy |

Pięć zespołów, około trzydziestu pięciu inżynierów frontendu, około 280 000 linii TypeScriptu. `CODEOWNERS` przypisuje każdy folder `libs/<domain>/` do jego zespołu, więc pull request do maintenance prosi o review zespół Workshop i nikogo więcej.

### 5.3. Workspace

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

Samo maintenance ma dwanaście bibliotek. To normalne: jeden `feature-*` na przypadek użycia, jeden `ui-*` na spójną grupę komponentów, jeden `data-access` i jeden `model` na domenę, dopóki nie urosną za bardzo (sekcja 16.3).

### 5.4. Jeden przypadek użycia przez wszystkie warstwy

Reszta przewodnika śledzi jeden przypadek użycia: **planista otwiera zlecenia serwisowe zajezdni, filtruje je i przydziela mechanika**. Dotyka on czterech bibliotek maintenance i jednej z fleet:

| Biblioteka | Co wnosi |
|---|---|
| `maintenance/feature-work-orders` | Stronę: czyta fasadę, renderuje karty, przekazuje kliknięcia |
| `maintenance/ui-work-order-card` | Kartę i filtr statusu, bez stanu, bez HTTP |
| `maintenance/data-access` | Feature NgRx, efekty, klienta HTTP, fasadę |
| `maintenance/model` | `WorkOrder`, `WorkOrderFilter`, `matchesFilter`, `isOverdue` |
| `fleet/api` | `VehicleSummaryStore`: numer rejestracyjny i model dla id pojazdu |

## 6. Typy bibliotek

Każdy typ odpowiada na jedno pytanie. Jeśli plik odpowiada na dwa, to są dwa pliki.

| Typ | Na jakie pytanie odpowiada | Zawiera | Nie może zawierać |
|---|---|---|---|
| `feature` | Co robi ten przypadek użycia? | Strony z trasą, komponenty smart, spięcie fasady z ui | Wywołań HTTP, wielokrotnie używanych komponentów wizualnych |
| `ui` | Jak to wygląda? | Komponenty prezentacyjne, pipe'y, dyrektywy | Wstrzykiwanych store'ów, serwisów ze stanem, HTTP |
| `data-access` | Skąd pochodzą dane i jak się zmieniają? | Store, efekty, klienty API, fasadę, providery | Komponentów |
| `model` | Jakie są pojęcia i reguły domeny? | Typy, enumy, czyste funkcje, takie jak `isOverdue` | Jakichkolwiek importów frameworka |
| `util` | Jakich technicznych helperów to potrzebuje? | Formatowanie, parsowanie, małe algorytmy | Pojęć domenowych, stanu frameworka |
| `api` | Czego mogą używać inne domeny? | Reeksporty wybranego podzbioru domeny | Własnej logiki |
| `shell` | Jak ta domena jest montowana? | Trasy, providery na poziomie trasy, guardy | Logiki biznesowej |

### 6.1. Kto może importować kogo

| Z ↓ może importować → | shell | feature | ui | data-access | model | util | api innej domeny |
|---|---|---|---|---|---|---|---|
| **app** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **shell** | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **feature** | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| **api** | – | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **ui** | – | – | ✓ | – | ✓ | ✓ | – |
| **data-access** | – | – | – | ✓ | ✓ | ✓ | – |
| **model** | – | – | – | – | ✓ | ✓ | – |
| **util** | – | – | – | – | – | ✓ | – |

Większość wartości tej tabeli niosą trzy wiersze:

- **feature → feature jest zabronione.** Dwie strony, które potrzebują tego samego, współdzielą to przez `ui` albo `data-access`. Strony składa shell albo router, a nie wzajemne importy.
- **ui → data-access jest zabronione.** Komponent, który wstrzykuje store, nie jest prezentacyjny. Z powodu tej reguły typ `WorkOrder` mieszka w `model`, a nie w `data-access`.
- **model nie importuje żadnego frameworka.** `model` i `util` kompilują się tak samo w Angularze, Reakcie, Vue i Node. We wspólnym workspace'ie to właśnie ten kod się współdzieli (sekcja 8.3).

### 6.2. Jak duża jest biblioteka

- **feature:** jeden przypadek użycia, zwykle jedna trasa i jej dzieci. `feature-work-orders`, a nie `feature-maintenance`.
- **ui:** jedna spójna grupa, która zmienia się razem. `ui-work-order-card` trzyma kartę, chip statusu i filtr statusu.
- **data-access:** na start jedna na domenę. Dzielimy ją według poddomen, gdy trzyma więcej niż trzy, cztery feature'y store'a albo gdy zespół się dzieli (`data-access-planning`, `data-access-work-orders`).
- **model:** jeden na domenę. Z natury jest mały.
- Jeśli biblioteka ma jeden plik, to pewnie jest za mała; jeśli jej `index.ts` eksportuje więcej niż około trzydziestu symboli, to pewnie jest za duża.

## 7. Domeny i granice

Domena to folder z jawnymi drzwiami. Wewnątrz folderu obowiązują reguły typów z sekcji 6. Między folderami obowiązuje jedna reguła: **wolno importować bibliotekę `api` innej domeny i nic poza nią.**

### 7.1. Biblioteka API

`fleet/api` decyduje, co fleet oferuje reszcie firmy. Wszystko, czego tu nie ma, jest prywatne dla zespołu Workshop i może się zmienić bez pytania kogokolwiek.

`libs/fleet/api/src/index.ts`

```ts
export type { VehicleSummary, VehicleId } from '@fleetline/fleet/model';
export { VehicleSummaryStore } from '@fleetline/fleet/data-access';
export { VehicleBadgeComponent } from '@fleetline/fleet/ui-vehicle-badge';
```

Store, który eksportuje, to NgRx Signal Store, a maintenance używa klasycznego NgRx Store. Maintenance nie musi o tym wiedzieć; widzi tylko `VehicleSummaryStore`.

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

### 7.2. Shared to też domena

`shared` ma tag `domain:shared` i może importować tylko `domain:shared`. Nie zna żadnego pojęcia biznesowego. Praktyczna reguła na review: jeśli plik w `shared` zawiera słowo z jakiejś domeny (zlecenie serwisowe, faktura, pojazd), przenosi się do tej domeny.

### 7.3. Gdy dwie domeny potrzebują tego samego

| Sytuacja | Odpowiedź |
|---|---|
| Billing pokazuje numer rejestracyjny pojazdu | Billing importuje `fleet/api`. |
| Maintenance i inventory potrzebują listy zajezdni | Zajezdnie to osobne pojęcie: mała domena `depots` albo `fleet` eksportuje je w swoim API. Nie `shared`. |
| Booking musi otworzyć zlecenie serwisowe po rezerwacji | Booking woła backend; backend tworzy zlecenie. Domeny frontendu nie orkiestrują nawzajem swoich zapisów. |
| Dwie domeny potrzebują tego samego date pickera | To sprawa techniczna, nie biznesowa: `shared/ui-design-system`. |
| Dwie biblioteki API chcą importować siebie nawzajem | Domeny są źle pocięte. Połączcie je albo przenieście wspólne pojęcie do trzeciej domeny. |

## 8. Egzekwowanie reguł

Reguła, której nikt nie sprawdza, jest tylko sugestią. Nx sprawdza ją tagami i jedną regułą lintera.

### 8.1. Tagi

Każdy `project.json` dostaje jeden tag `domain:*` i jeden `type:*`, a we wspólnym workspace'ie także jeden tag `framework:*`.

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

Generatory ustawiają tagi przy tworzeniu biblioteki:

```bash
nx g @nx/angular:library --directory=libs/maintenance/feature-planning-board \
  --tags=domain:maintenance,type:feature,framework:angular
nx g @nx/js:library --directory=libs/maintenance/model \
  --tags=domain:maintenance,type:model,framework:agnostic --bundler=none
```

### 8.2. Reguła lintera

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

Jak łączą się wymiary: import musi spełnić **każde** ograniczenie każdego tagu biblioteki importującej. Feature z maintenance może importować `fleet/api`, bo reguła typu pozwala na `type:api` i reguła domeny pozwala na `type:api`. Nie może importować `fleet/data-access`: reguła typu pozwoliłaby na `data-access`, ale reguła domeny nie pozwala na `domain:fleet`. Biblioteka `ui` z maintenance też nie może importować `fleet/api`: reguła domeny by na to pozwoliła, ale reguła typu nie.

Ta sama reguła odrzuca też względne importy do innej biblioteki, importy wnętrza biblioteki zamiast jej `index.ts` oraz cykliczne zależności między bibliotekami.

### 8.3. Wymiar frameworka

Aplikacja `customer` z Fleetline mogłaby przejść na Next.js, a `backoffice` na Nuxt, bez przenoszenia ani jednej biblioteki `model` czy `util`. Mają one tag `framework:agnostic` i mogą importować tylko inny kod niezależny od frameworka, więc `matchesFilter` i `isOverdue` to ta sama funkcja we wszystkich trzech aplikacjach. Biblioteka w Reakcie, która próbuje zaimportować bibliotekę `ui` z Angulara, nie przechodzi lintera.

### 8.4. Bez Nx: Sheriff

Nie każdy zespół używa Nx. **Sheriff**, od tego samego zespołu ANGULARarchitects, egzekwuje te same reguły tagów wewnątrz jednego projektu TypeScript, według folderów zamiast bibliotek. Pasuje do aplikacji w Next.js albo Nuxt, która chce mieć granice, zanim zechce mieć monorepo.

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

### 8.5. W CI

```bash
nx affected -t lint typecheck test build --base=origin/main
nx graph --affected
```

Ponieważ graf zależności jest jawny, zmiana w `maintenance/ui-checklist` uruchamia lint, testy i build bibliotek i aplikacji, które od niej zależą, i niczego więcej. W Fleetline typowy pull request dotyka jednej domeny i uruchamia jedną piątą workspace'u. Ze zdalnym cache'em niezmieniona biblioteka nigdy nie jest budowana ponownie, na żadnej maszynie.

## 9. Stan w NgRx

`maintenance/data-access` trzyma wszystko o tym, skąd pochodzą zlecenia serwisowe i jak się zmieniają. Ta sekcja pokazuje ją w całości. Każdy plik ma jedno zadanie.

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

### 9.1. Model

Model jest niezależny od frameworka i mieszka we własnej bibliotece, więc mogą go używać biblioteki `ui`, testy oraz wersje w Reakcie i Vue.

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

### 9.2. Zdarzenia

Akcje nazywamy od tego, **co się stało**, i grupujemy według tego, **gdzie się stało**. Strona zgłasza zdarzenia; nie wydaje poleceń takich jak `loadWorkOrders`.

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

### 9.3. Feature: stan, reducer, selektory

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

Przydział jest **optymistyczny**: reducer od razu stosuje `assigneeChosen`, a `assignFailed` przywraca poprzedniego mechanika. Poprzednia wartość podróżuje w zdarzeniu, bo zanim uruchomi się efekt, stan trzyma już nową.

### 9.4. HTTP i efekty

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

`switchMap` do ładowania (nowsza zajezdnia anuluje starsze żądanie), `mergeMap` do przydziałów (dwa przydziały na dwóch kartach muszą się oba zakończyć).

### 9.5. Providery

Feature store'a rejestrujemy na trasie domeny, a nie w korzeniu aplikacji. Główny store pozostaje pusty, dopóki planista nie otworzy maintenance, a jego kod ładuje się leniwie razem z trasą.

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

### 9.6. Publiczne API data-access

`libs/maintenance/data-access/src/index.ts`

```ts
export { provideWorkOrders } from './lib/work-orders.providers';
export { WorkOrdersFacade } from './lib/work-orders.facade';
```

Dwa eksporty. Akcje, reducer, selektory i klient HTTP są prywatne. Każdy feature w maintenance przechodzi przez fasadę, a zespół Workshop może przebudować store bez dotykania ani jednego komponentu.

## 10. Fasada i kiedy ją pominąć

:::diagram fe-flow

Fasada to cienki obiekt między feature'ami a zarządzaniem stanem. Udostępnia **stan** (sygnały w Angularze, wartości w Reakcie, refy w Vue) i **intencje** (metody). Nie zawiera logiki: każda metoda wysyła dokładnie jedno zdarzenie, a każda właściwość to dokładnie jeden selektor.

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

Fasadę dostarcza `provideWorkOrders()`, a nie `root`, więc istnieje dokładnie tam, gdzie istnieje jej feature store'a.

### 10.1. Po co fasada

- **Wymienny stan.** W dniu, w którym zlecenia serwisowe przejdą z NgRx Store do Signal Store albo do cache'a serwera, zmienia się fasada, a żaden komponent. Fleetline zrobił dokładnie to dla `fleet` (sekcja 7.1).
- **Mała powierzchnia.** Feature widzi sześć składowych zamiast czternastu akcji i dziewięciu selektorów.
- **Łatwe testy.** Test feature'a dostarcza atrapę o tym samym kształcie (sekcja 15).
- **Ten sam kształt w każdym frameworku.** Tutaj klasa, w Reakcie i Vue `useWorkOrders()`: kod feature'a czyta się prawie tak samo we wszystkich trzech (sekcja 14).

### 10.2. Dlaczego fasada jest opcjonalna

Społeczność NgRx ma dobry argument przeciwko fasadom: akcje powinny opisywać zdarzenia (*„wybrano osobę przypisaną na stronie zleceń serwisowych”*), a fasada z metodą `assign()` skłania do myślenia w poleceniach. Fasada, która wysyła trzy akcje pod rząd albo trzyma logikę, ukrywa log zdarzeń, dzięki któremu NgRx da się debugować.

Dlatego w naszym wariancie fasada to reguła z warunkami:

| Użyj fasady, gdy | Pomiń ją, gdy |
|---|---|
| ten sam stan wykorzystuje więcej niż jeden feature | jeden feature jest właścicielem jednego małego feature'a store'a |
| stan może zmienić implementację (Store ↔ Signal Store ↔ cache serwera) | stan jest lokalny dla komponentu: użyj Signal Store albo zwykłych sygnałów w komponencie |
| dane są oferowane innej domenie przez `api` | zespół woli wysyłać zdarzenia bezpośrednio, a domena jest mała |
| baza kodu jest współdzielona z zespołami Reacta albo Vue | |

Dwie reguły, gdy już jej używacie:

1. **Nazwy metod zachowują zdarzenie.** `assign()` wysyła `assigneeChosen` ze źródła `Work Orders Page`. Jeśli przydzielać mogą dwie strony, każda dostaje własne zdarzenie; fasada dostaje dwie metody albo parametr `source`, nigdy jedno ogólne `update()`.
2. **Żadnej logiki.** Żadnego `if`, żadnej pętli, żadnego wywołania HTTP. Jeśli potrzebna jest decyzja, należy ona do reducera, selektora albo efektu.

Bez fasady `index.ts` biblioteki `data-access` eksportuje zamiast niej zdarzenia strony i selektory, a komponent sam woła `store.dispatch()` i `store.selectSignal()`. Oba kształty przechodzą reguły granic; wybierzcie jeden na domenę i zapiszcie go w README domeny.

## 11. Angular od początku do końca

Gdy `data-access` jest na miejscu, pozostałe biblioteki są krótkie.

Workspace Angulara ze wszystkimi plikami tego przypadku użycia. Każda biblioteka ma też własne `project.json` i `tsconfig.json`; drzewo pokazuje je tylko dla aplikacji i dla `data-access`.

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

### 11.1. Biblioteka ui

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

Karta zna `WorkOrder`, bo `model` jest dozwolony. `vehicleLabel` dostaje jako string, bo biblioteka `ui` z maintenance nie może importować `fleet/api`.

### 11.2. Biblioteka feature

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

`depotId` pochodzi z parametru trasy przez `withComponentInputBinding()`. `ensureLoaded` to `rxMethod` i przyjmuje sygnał, więc za każdym razem, gdy zmienia się widoczna lista, fleet ładuje brakujące numery rejestracyjne jednym żądaniem.

### 11.3. Shell

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

Shell importuje `identity/api` dla guarda uprawnień. Guardy, tak jak numery rejestracyjne z fleet, to sprawa przekraczająca domeny, więc shell może używać API innej domeny tak samo jak feature (sekcja 6.1). Wszystko inne, czego shell potrzebuje, pochodzi z jego własnej domeny.

### 11.4. Aplikacja

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

To cała aplikacja: dwa pliki i `environment`. `backoffice` montuje ten sam `maintenance/feature-shell` z innym layoutem. Trzecia aplikacja zajęłaby jedno popołudnie.

## 12. React i Next.js

Architektura nie zależy od Angulara. Biblioteki, typy, domeny, tagi i reguła lintera zostają takie same; Nx generuje projekty React i Next.js przez `@nx/react` i `@nx/next`. Zmienia się sposób implementacji każdego typu biblioteki, a Next.js dodaje jeden nowy wymiar: kod, który działa tylko na serwerze.

Ten sam workspace z aplikacją Next.js i wszystkimi plikami tego przypadku użycia:

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

### 12.1. Co odpowiada czemu

| Angular | React / Next.js |
|---|---|
| Komponent `feature` | Komponent kliencki eksportowany z `feature-*`; `page.tsx` w aplikacji tylko go renderuje |
| Komponent `ui` z `input()`/`output()` | Komponent z propsami i callbackami |
| Trasy `shell` | Trasy plikowe zostają w `apps/<app>/app/`; biblioteka shell eksportuje layout i providery domeny |
| NgRx Store, `createFeature` | Redux Toolkit `createSlice` |
| NgRx Entity | `createEntityAdapter` z Redux Toolkit |
| `createSelector` | `createSelector` (Reselect, część Redux Toolkit) |
| Efekty | Listener middleware albo thunki w prostych przypadkach |
| `provideState` na trasie | `slice.injectInto(rootReducer)` (leniwe slice'y) |
| Signal Store | Zustand |
| Serwis fasady | Hook: `useWorkOrders()` |
| `HttpClient` | `fetch` w funkcji serwerowej albo w klienckim module API |

### 12.2. Tagi dla serwera i klienta

W App Routerze plik jest albo komponentem serwerowym, albo klienckim. Kod, który czyta sekrety, cookies albo bazę danych, nigdy nie może trafić do bundla przeglądarki. Fleetline dodaje drugą bibliotekę data-access na domenę i jeden tag więcej:

| Biblioteka | Tagi | Zawiera |
|---|---|---|
| `maintenance/data-access` | `type:data-access`, `platform:client` | Slice Reduxa, listenery, klienckie API, hook fasady |
| `maintenance/data-access-server` | `type:data-access`, `platform:server` | Funkcje fetch `server-only` i server actions |

Reguła lintera z sekcji 8.2 zawiera już ograniczenie `platform:client` → nie `platform:server`. Każdy plik tylko dla serwera zaczyna się też od `import 'server-only'`, więc pomyłka psuje build nawet tam, gdzie linter nie działa.

### 12.3. Store

Redux Toolkit potrafi wstrzykiwać slice'y leniwie, co pełni rolę `provideState` na trasie. Główny reducer mieszka w `shared` i nie zna żadnej domeny.

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

Nowy store na każde żądanie tworzy kliencki provider, tak jak zaleca przewodnik Redux Toolkit dla App Routera.

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

### 12.4. Slice

Te same zdarzenia, ta sama optymistyczna aktualizacja, te same funkcje `model` co w sekcji 9.

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

### 12.5. Efekty jako listenery

Listenery dodajemy, gdy domena się montuje, i usuwamy, gdy się odmontowuje; to odpowiednik `provideEffects` na trasie. `cancelActiveListeners()` daje semantykę `switchMap`.

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

### 12.6. Hook fasady

Hook ma te same składowe co fasada w Angularze. Uruchamia też listenery i zgłasza otwarcie strony, więc do spięcia feature'a wystarcza jedna linia.

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

### 12.7. Feature, ui i trasa

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

Plik trasy w aplikacji ma kilka linii. Biblioteka shell eksportuje layout domeny ze sprawdzeniem uprawnień.

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

### 12.8. Stan serwera: ta sama fasada, inny silnik

W Next.js wiele z tego, co SPA w Angularze trzyma w NgRx, to **stan serwera**: dane, których właścicielem jest serwer, a klient je cache'uje. Przy listach takich jak zlecenia serwisowe wiele zespołów woli komponenty serwerowe z cache'em zapytań od Reduxa. Dzięki fasadzie to prywatna decyzja `data-access`.

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

Zwracana wartość ma te same składowe. `WorkOrdersPage` się nie zmienia, poza przekazaniem `initial`, które serwerowy `page.tsx` załadował przez `listWorkOrders`. Reguła Fleetline: **stan serwera w cache'u zapytań, stan należący do klienta w Reduxie.** Tablica planowania, na której planiści przeciągają dziesiątki zleceń między mechanikami i dniami przed zapisem, należy do klienta i zostaje w Reduxie; lista zleceń serwisowych to stan serwera.

### 12.9. Pułapki specyficzne dla Next.js

- **`'use client'` to osobna granica.** Umieszczajcie je w plikach feature i data-access, które używają hooków, nigdy w `model` ani `util`.
- **Nie importujcie biblioteki serwerowej do pliku klienckiego „tylko dla typu”.** Typy mieszkają w `model`.
- **Server actions należą do `data-access-server`.** Feature importuje je przez reeksporty z `data-access` tylko wtedy, gdy pozwalają na to tagi lintera; w przeciwnym razie strona przekazuje je jako propsy.
- **Pliki tras zostają cienkie.** `page.tsx`, w którym rośnie logika, to wersja Next.js grubego komponentu aplikacji w Angularze.

## 13. Vue i Nuxt

Vue przekłada się jeszcze bardziej bezpośrednio, bo setup store'y Pinii przypominają NgRx Signal Store, a composable to naturalny kształt fasady. Nx buduje projekty Vue i Nuxt przez `@nx/vue` i `@nx/nuxt`.

Ten sam workspace z aplikacją Nuxt i wszystkimi plikami tego przypadku użycia:

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

### 13.1. Co odpowiada czemu

| Angular | Vue / Nuxt |
|---|---|
| Komponent `feature` | Single-file component w `feature-*`; strona w `apps/<app>/app/pages/` tylko go renderuje |
| Komponent `ui` | Komponent z `defineProps` i `defineEmits` |
| Trasy `shell` | Trasy plikowe zostają w aplikacji; biblioteka shell eksportuje layouty i route middleware |
| NgRx Store / Signal Store | Pinia (setup store) |
| Selektory | `computed` wewnątrz store'a |
| Efekty | Asynchroniczne akcje w store'ze; `useAsyncData` do ładowania podczas renderowania na serwerze |
| Serwis fasady | Composable: `useWorkOrders()` |
| `HttpClient` | `$fetch` |

Pinia nie ma podziału na akcje i reducery. To usuwa log zdarzeń i debugowanie z podróżą w czasie znane z NgRx, ale usuwa też większość ceremonii. Dla architektury nic to nie zmienia: store jest prywatny dla `data-access`, a composable to drzwi.

### 13.2. Wyłączcie auto-importy dla bibliotek

Nuxt importuje komponenty i composable automatycznie. W małej aplikacji to wygodne, dla granic zabójcze: **importu, którego nikt nie napisał, linter nie sprawdzi.** Jeśli feature w billingu może użyć `useWorkOrders()` bez linii `import`, reguła lintera nigdy nie zobaczy przekroczenia granicy.

Reguły w aplikacjach Nuxt we Fleetline:

- biblioteki importuje się jawnymi instrukcjami `import` przez aliasy ścieżek, nigdy nie rejestruje się ich jako katalogów auto-importu;
- domeny nie są warstwami Nuxt (layers), bo warstwy auto-importują swoje komponenty i composable do aplikacji;
- aplikacja zostawia auto-importy API Vue i Nuxt tylko we własnych `pages/` i `layouts/`, a kod bibliotek importuje funkcje Nuxt z `#imports`.

`apps/backoffice/nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
  components: { dirs: [] },
  imports: { scan: false },
  runtimeConfig: { public: { apiUrl: '' } },
});
```

### 13.3. Store

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

`byId`, `filter` i `error` są zwracane, żeby Pinia zserializowała je do payloadu renderowanego na serwerze, a przeglądarka zaczynała z tym samym stanem.

### 13.4. Composable fasady

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

Klucz jest funkcją `depotId`, więc zmiana zajezdni pobiera dane od nowa. Na serwerze `useAsyncData` czeka na dane; w przeglądarce strona hydratuje się z payloadu bez drugiego żądania.

### 13.5. Feature, ui i strona

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

### 13.6. Pułapki specyficzne dla Nuxt

- **Lintowanie plików `.vue`** wymaga `vue-eslint-parser` w konfiguracji ESLint, inaczej reguła granic po cichu pomija każdy komponent. Z tego powodu wzorzec `files` w sekcji 8.2 obejmuje `**/*.vue`.
- **Jeden store na żądanie.** Pinia z `@pinia/nuxt` już tworzy jeden na żądanie po stronie serwera. Nigdy nie trzymajcie stanu w `ref` na poziomie modułu w bibliotece: na serwerze byłby współdzielony między użytkownikami.
- **`useAsyncData` należy do fasady**, a nie do store'a. Store pozostaje wtedy używalny w testach i w kodzie działającym tylko po stronie klienta.

## 14. Obok siebie

:::diagram fe-frameworks

Ten sam przypadek użycia w trzech frameworkach, plik po pliku:

| Biblioteka | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| `model` | `work-order.ts` | ten sam plik | ten sam plik |
| stan w `data-access` | `createFeature` + `createEntityAdapter` | `createSlice` + `createEntityAdapter` | setup store Pinii |
| efekty w `data-access` | funkcyjny `createEffect` | listener middleware | asynchroniczne akcje store'a + `useAsyncData` |
| fasada w `data-access` | `WorkOrdersFacade` (sygnały) | `useWorkOrders()` (wartości) | `useWorkOrders()` (refy) |
| `ui` | `input()` / `output()` | propsy / callbacki | `defineProps` / `defineEmits` |
| `feature` | komponent standalone | komponent kliencki | single-file component |
| `shell` | `Routes` z `providers` | komponent layoutu, segment trasy | layout + route middleware |
| trasa aplikacji | `loadChildren` | `page.tsx` | `pages/*.vue` |
| granice | `@nx/enforce-module-boundaries` | ta sama reguła | ta sama reguła, z `vue-eslint-parser` |

Co zostaje identyczne we wszystkich trzech: folder każdego pliku, tagi, reguła lintera, biblioteka `model`, składowe fasady i testy biblioteki `model`. Osoba, która przechodzi między aplikacjami Fleetline, musi nauczyć się od nowa tylko samego frameworka.

## 15. Testy według typu biblioteki

Każdy typ ma naturalny rodzaj testu, a granice sprawiają, że każdy z nich jest tani.

| Typ | Test | Szybkość | Co podmienia |
|---|---|---|---|
| `model`, `util` | Zwykłe testy jednostkowe, bez frameworka | milisekundy | nic |
| reducery, selektory w `data-access` | Testy czystych funkcji | milisekundy | nic |
| efekty / listenery w `data-access` | Testy z atrapą klienta HTTP | szybkie | HTTP |
| fasada | Integracja z prawdziwym store'em | szybkie | HTTP |
| `ui` | Testy komponentów, stories w Storybook | szybkie | nic, ma tylko wejścia |
| `feature` | Test komponentu z atrapą fasady | szybkie | fasadę |
| aplikacja | End-to-end w Playwright, kilka ścieżek | wolne | backend albo nic |

Test reducera nie potrzebuje TestBed:

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

Test feature'a dostarcza atrapę fasady, bo komponent nie widzi niczego innego:

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

Buildery danych testowych, takie jak `aWorkOrder`, mieszkają w drugim punkcie wejścia `model` (`@fleetline/maintenance/model/testing`), więc testy w każdym frameworku używają tych samych.

## 16. Dorastanie do tej architektury i migracja

Nikt nie zaczyna od siedemdziesięciu bibliotek. Fleetline zaczął jako jedna aplikacja w Angularze z folderem `src/app`; poniższe kroki to kolejność, która się sprawdziła.

### 16.1. Migracja w ośmiu krokach

1. **Utwórzcie workspace wokół aplikacji.** `nx init` w istniejącym repozytorium. Na razie nic się nie przesuwa.
2. **Narysujcie domeny na papierze.** Używajcie słów biznesu: o czym rozmawiają planiści, klienci i finanse? Spodziewajcie się sześciu do dziesięciu domen. Zapiszcie je w README.
3. **Włączcie regułę jako ostrzeżenie.** Dodajcie konfigurację lintera z sekcji 8.2 z `'warn'`. Policzcie ostrzeżenia; to wasz punkt wyjścia.
4. **Najpierw wydzielcie `model` i `util`.** Nie mają zależności, więc ich przeniesienie jest bezpieczne, a każdy kolejny krok ich potrzebuje. Użyjcie `nx g @nx/workspace:move`.
5. **Wydzielcie `ui` dla każdej domeny.** Przenosi się każdy komponent, który ma tylko wejścia i wyjścia. Komponenty, które wstrzykują store, na razie zostają.
6. **Wykrójcie `data-access` dla każdej domeny.** Podzielcie główny store według domen; przenieście każdy feature store'a, jego efekty i HTTP do `data-access` domeny i zarejestrujcie go na trasie domeny.
7. **Przenieście strony do `feature-*`, a trasy do `feature-shell`.** Aplikacja kurczy się do swoich tras i providerów.
8. **Przełączcie regułę na `'error'` i dodajcie CODEOWNERS.** Od teraz każde nowe przekroczenie granicy psuje CI.

Kroki od 4 do 7 idą domena po domenie, a aplikacja w międzyczasie dalej trafia na produkcję. We Fleetline cała migracja zajęła cztery miesiące równolegle z pracą nad funkcjami, po jednej domenie naraz, zaczynając od najmniejszej (`notifications`), żeby nauczyć się ruchów.

### 16.2. Co zwykle idzie źle

- **Domena o nazwie `common` albo `core`.** Staje się nowym `shared/`. Każde pojęcie ma właściciela biznesowego; znajdźcie go.
- **Domeny cięte według stron zamiast według języka biznesu.** „Dashboard” nie jest domeną; to feature, który czyta z kilku domen przez ich API.
- **Biblioteki API, które reeksportują wszystko.** Wtedy granica jest tylko kosmetyczna. Eksportujcie to, czego inny zespół faktycznie używa, i nic więcej.
- **Wyłączone linie lintera.** Jedno `eslint-disable` dla reguły granic w ciągu roku zamienia się w czterdzieści. Wyjątki trafiają do konfiguracji, z uzasadnieniem w pull requeście.

### 16.3. Kiedy podzielić bibliotekę

- `data-access` z więcej niż trzema, czterema feature'ami store'a albo z dwoma zespołami-właścicielami: podzielcie według poddomen.
- Biblioteka `ui` importowana tylko przez jeden feature: włączcie ją z powrotem do tego feature'a albo zostawcie, ale nie przenoście do `shared`.
- `feature` z kilkoma niepowiązanymi trasami: jedna biblioteka na przypadek użycia.
- Domena, której bibliotekami w większości zarządza inny zespół: domena jest źle pocięta albo granice zespołów są.

### 16.4. Kiedy to za dużo

Przy jednej aplikacji, jednym zespole i jednej, dwóch domenach pełna struktura kosztuje więcej, niż oszczędza. Zacznijcie wtedy od folderów wewnątrz jednego projektu (`src/domains/<domain>/feature-…`, `ui-…`, `data-access`, `model`) i egzekwujcie je Sheriffem (sekcja 8.4). Późniejsze przeniesienie tych folderów do bibliotek Nx to krok mechaniczny, bo reguły zależności już są spełnione.

## 17. Pytania

**Czy potrzebujemy NgRx dla całego stanu?**
Nie. Do store'a trafia wspólny, długo żyjący stan, który czyta kilka feature'ów. Stan formularzy, otwarte i zamknięte panele i inny stan, którego właścicielem jest jeden komponent, zostają w komponencie, w sygnałach albo w Signal Store na poziomie komponentu.

**NgRx Store czy NgRx Signal Store?**
Oba pasują do architektury, oba mieszkają w `data-access`, a fasada ukrywa wybór. Fleetline używa Store tam, gdzie log zdarzeń i devtools się opłacają (maintenance, planowanie), a Signal Store w prostszych domenach (podsumowania floty, powiadomienia).

**Czy fasada to nie po prostu dodatkowa warstwa?**
Tak, i sekcja 10 mówi, kiedy jest tego warta. W Reakcie i Vue hook albo composable to i tak idiomatyczny sposób współdzielenia dostępu do stanu, więc tam fasada nie kosztuje prawie nic.

**Czy każda domena powinna mieć bibliotekę `api` od pierwszego dnia?**
Nie. Utwórzcie ją, gdy pierwszy raz inna domena czegoś potrzebuje. Wcześniej domena jest w pełni prywatna, a to najlepsza granica, jaka istnieje.

**Czy to mikrofrontendy?**
Nie. Wszystko tutaj buduje się do jednej aplikacji na folder aplikacji. Ten sam podział na domeny to naturalne miejsce cięcia pod mikrofrontendy w przyszłości, jeśli organizacja kiedyś będzie potrzebować niezależnych wdrożeń.

**Czy React, Vue i Angular naprawdę mogą współdzielić biblioteki?**
Współdzielą biblioteki `model` i `util` z tagiem `framework:agnostic` oraz buildery danych testowych. Komponenty i store'y są osobne dla każdego frameworka. We Fleetline około jednej piątej kodu frontendu jest niezależne od frameworka.

**Gdzie czytać dalej?**
Artykuły Manfreda Steyera i darmowy e-book *Enterprise Angular* na [angulararchitects.io](https://www.angulararchitects.io/), [dokumentacja Nx](https://nx.dev/) o granicach modułów, [Sheriff](https://github.com/softarc-consulting/sheriff) i [dokumentacja NgRx](https://ngrx.io/).
