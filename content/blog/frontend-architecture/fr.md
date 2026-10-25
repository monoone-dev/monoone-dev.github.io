Ce guide décrit comment nous structurons les gros front-ends : un workspace, de nombreuses applications, de nombreuses équipes, et une règle pour chaque fichier. Nous le construisons avec **Nx** et **Angular**, nous gardons l'état partagé dans **NgRx**, et nous plaçons une **facade optionnelle** devant le store. Ensuite, nous montrons la même architecture, règle par règle, en **React avec Next.js** et en **Vue avec Nuxt**.

Cette architecture n'est pas la nôtre. Son cœur a été élaboré et publié par **Manfred Steyer**, formateur et consultant Angular, Google Developer Expert pour Angular et la personne derrière [ANGULARarchitects](https://www.angulararchitects.io/). Son idée : découper un front-end **verticalement par domaine** et **horizontalement par type de bibliothèque**, ne laisser les domaines communiquer qu'à travers une API explicite, et confier ces frontières à un outil, pas à un wiki. La section 2 dit précisément ce qui vient de lui, ce qui vient de Nx et ce que nous avons ajouté.

Un petit exemple ne peut pas montrer pourquoi tout cela compte. Un domaine avec un seul store tient dans la tête de n'importe qui. Tous les exemples de cette page viennent donc d'un seul workspace réaliste : **Fleetline**, une plateforme de maintenance de flottes avec trois applications, neuf domaines, environ soixante-dix bibliothèques et cinq équipes. Il est présenté en section 5 et utilisé dans toutes les sections suivantes.

> Écrit pour les équipes qui ont déjà, ou auront bientôt, plus d'une application front-end, plus d'une équipe, ou plus d'environ 50 000 lignes de code front-end. En dessous de cette taille, lisez d'abord la section 16.4.

## 1. Pourquoi un front-end a besoin d'une architecture

Un front-end grandit toujours de la même façon. La première année, il y a une application et un dossier `src/app` avec `components`, `services` et `store`. La troisième année, le même projet ressemble en général à ceci :

- `shared/` contient trois cents fichiers, dont la moitié sont utilisés par une seule fonctionnalité ;
- un composant de billing importe un selector de maintenance parce qu'il était là ;
- le store racine a quarante clés de feature, et personne ne sait lesquelles une page utilise ;
- une deuxième application naît d'une copie de la première, parce qu'extraire du code est trop difficile ;
- une modification d'un helper de dates reconstruit et reteste tout le dépôt ;
- une nouvelle personne dans l'équipe, ou un agent de code, a besoin de plusieurs jours pour savoir où vit une fonctionnalité et ce qu'elle a le droit d'utiliser.

Rien de tout cela ne vient de mauvais développeurs. Cela vient de l'absence d'une réponse commune à deux questions : **où va ce fichier**, et **qui peut importer qui**. Sans réponse, c'est le dossier le plus proche qui gagne, et le dossier le plus proche est toujours `shared/`.

L'architecture de ce guide répond aux deux questions une fois pour toutes, pour chaque type de code front-end, et rend la réponse **mécanique** : une règle de lint refuse un import qui franchit une frontière, dans l'éditeur et en CI.

### 1.1. Objectifs

1. **Retrouvabilité.** Connaître le nom d'une fonctionnalité, c'est connaître son dossier, dans chaque application.
2. **Des changements locaux.** Une modification dans un domaine ne peut pas casser un autre domaine, car l'autre domaine ne voit pas ses détails internes.
3. **Un retour rapide à grande échelle.** La CI ne construit et ne teste que les bibliothèques touchées par une modification.
4. **Des équipes en parallèle.** Une équipe possède des domaines, pas des fichiers éparpillés dans `shared/`.
5. **Un état remplaçable.** Une fonctionnalité ne sait pas si ses données viennent de NgRx, d'un Signal Store, d'un cache ou du serveur.
6. **Un seul règlement pour trois frameworks.** Les applications Angular, React et Vue d'une même entreprise suivent la même structure, et le code sans framework est partagé entre elles.

### 1.2. Non-objectifs

- Elle ne choisit ni votre backend, ni votre design system, ni votre CSS.
- Elle n'exige pas de micro front-ends. Tout ici fonctionne dans une seule application déployable ; les micro front-ends sont une décision ultérieure et séparée.
- Elle ne remplace pas vos règles produit. Elle dit où vit le code et ce qu'il peut utiliser ; votre projet dit ce que le code doit faire.

## 2. D'où vient l'idée

L'architecture combine trois sources. Nous les citons parce que chacune mérite d'être lue dans l'original.

| Source | Ce qu'elle apporte |
|---|---|
| **Nx** (l'équipe Nrwl, *Enterprise Angular Monorepo Patterns*) | Le monorepo lui-même, des bibliothèques avec un `index.ts` public, et les types de bibliothèques classiques : `feature`, `ui`, `data-access`, `util`. Les tags sur les projets et la règle de lint `@nx/enforce-module-boundaries`. |
| **Manfred Steyer** (ANGULARarchitects, l'e-book *Enterprise Angular*, ses articles sur le design stratégique avec Nx) | L'application du Domain-Driven Design aux front-ends : **les domaines comme tranches verticales**, **les types de bibliothèques comme couches horizontales**, deux dimensions de tags (`domain:*` et `type:*`) vérifiées par un linter, une **bibliothèque API** comme seule porte entre domaines, et une **facade** entre l'UI et la gestion d'état. Plus tard aussi **Sheriff**, un vérificateur de frontières pour les projets sans Nx. |
| **NgRx** (et Redux avant lui) | Un store pour l'état partagé, des changements par actions et reducers purs, des effets de bord dans les effects, des lectures par selectors mémoïsés. |

Ce que nous avons décidé en plus, dans ce guide :

- un type `model` séparé pour les types sans framework et les fonctions de domaine pures, afin que les bibliothèques `ui` ne dépendent jamais de la gestion d'état ;
- un type `shell` à part entière (le `feature-shell` de Nx), qui possède les routes et les providers d'un domaine ;
- une troisième dimension de tags, `framework:*`, pour que des applications Angular, React et Vue vivent dans un même workspace et partagent le code `model` et `util` ;
- une quatrième dimension pour Next.js, `platform:server` et `platform:client` ;
- la règle de la section 10, qui dit quand une facade est rentable et quand s'en passer ;
- les transpositions React/Next et Vue/Nuxt des sections 12 et 13.

Quand un point de cette page contredit les articles d'origine, l'original fait référence pour l'idée ; cette page fait référence pour la manière dont nous l'appliquons.

## 3. L'architecture en une page

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

Six phrases à retenir :

1. **Chaque bibliothèque a un domaine et un type**, écrits sous forme de tags, et ces tags décident de ce qu'elle peut importer.
2. **Les imports descendent l'échelle des types** : feature → ui, data-access → model → util. Jamais vers le haut, jamais de côté entre features.
3. **Un domaine ne voit un autre domaine qu'à travers sa bibliothèque `api`.** Tout le reste d'un domaine est privé.
4. **`shared` ne connaît aucun domaine.** Si un fichier « partagé » parle d'ordres de travail, il appartient à maintenance.
5. **Les composants ne parlent jamais à HTTP.** Les données passent par `data-access` ; la feature voit une facade ou des selectors, jamais une URL.
6. **Les applications sont fines.** Une app branche des routes et des providers ; les features vivent dans des bibliothèques, si bien qu'une deuxième app ne coûte rien.

## 4. Vocabulaire

| Terme | Signification |
|---|---|
| **Workspace** | Un dépôt Nx avec toutes les applications et bibliothèques. |
| **Application** | Un front-end déployable dans `apps/`. Ne contient presque pas de code. |
| **Bibliothèque** | Un dossier dans `libs/` avec son propre `project.json`, ses tags et un `index.ts` public. Importée uniquement par son alias de chemin, par exemple `@fleetline/maintenance/data-access`. |
| **Domaine** | Une partie du métier avec son propre langage et ses propres données : maintenance, flotte, facturation. On dit aussi bounded context. Un dossier dans `libs/`. |
| **Type** | Le rôle technique d'une bibliothèque : `feature`, `ui`, `data-access`, `model`, `util`, `api`, `shell`. |
| **API publique** | L'`index.ts` d'une bibliothèque. Ce qu'il n'exporte pas n'existe pas pour les autres bibliothèques. |
| **Facade** | Une petite classe, un hook ou un composable qu'une feature utilise à la place du store : l'état sous forme de signals ou de refs, les intentions sous forme de méthodes. |
| **Règle de frontière** | Une règle de lint qui lit les tags de deux bibliothèques et refuse un import que les tags n'autorisent pas. |

## 5. L'exemple : Fleetline

Fleetline gère la maintenance pour des entreprises qui exploitent des camions, des utilitaires et des bus. Les mécaniciens travaillent dans des dépôts ; les planificateurs répartissent le travail ; les clients réservent des interventions et paient des factures ; la finance et le support font tourner un back-office.

### 5.1. Applications

| Application | Utilisateurs | Framework dans ce guide |
|---|---|---|
| `ops-portal` | Planificateurs et mécaniciens dans les dépôts | Angular |
| `customer` | Clients de flotte : réservations, véhicules, factures | Angular (Next.js en section 12) |
| `backoffice` | Finance, support, administrateurs | Angular (Nuxt en section 13) |

### 5.2. Domaines et équipes

| Domaine | Possède | Équipe | Utilisé par les apps |
|---|---|---|---|
| `maintenance` | Ordres de travail, checklists, tableau de planification, SLA | Workshop | ops-portal, backoffice |
| `fleet` | Véhicules, kilométrage, historique d'entretien | Workshop | les trois |
| `inventory` | Pièces, stock par dépôt, réservations | Supply | ops-portal, backoffice |
| `booking` | Créneaux d'intervention, parcours de réservation, reprogrammation | Customer | customer, ops-portal |
| `billing` | Devis, factures, paiements | Finance | customer, backoffice |
| `customers` | Comptes, contrats, contacts | Customer | customer, backoffice |
| `identity` | Connexion, rôles, permissions | Platform | les trois |
| `notifications` | Boîte de réception dans l'app, préférences e-mail | Platform | les trois |
| `shared` | Design system, mise en page, configuration HTTP, dates, montants, tests | Platform | les trois |

Cinq équipes, environ trente-cinq développeurs front-end, environ 280 000 lignes de TypeScript. `CODEOWNERS` associe chaque dossier `libs/<domain>/` à son équipe, si bien qu'une pull request dans maintenance demande une revue à l'équipe Workshop et à personne d'autre.

### 5.3. Le workspace

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

Maintenance compte à elle seule douze bibliothèques. C'est normal : une `feature-*` par cas d'usage, une `ui-*` par groupe cohérent de composants, une `data-access` et un `model` par domaine, jusqu'à ce qu'ils deviennent trop gros (section 16.3).

### 5.4. Un cas d'usage à travers les couches

La suite du guide suit un seul cas d'usage : **un planificateur ouvre les ordres de travail d'un dépôt, les filtre et assigne un mécanicien**. Il touche quatre bibliothèques de maintenance et une de fleet :

| Bibliothèque | Ce qu'elle apporte |
|---|---|
| `maintenance/feature-work-orders` | La page : lit la facade, affiche les cartes, transmet les clics |
| `maintenance/ui-work-order-card` | La carte et le filtre de statut, sans état, sans HTTP |
| `maintenance/data-access` | Feature NgRx, effects, client HTTP, facade |
| `maintenance/model` | `WorkOrder`, `WorkOrderFilter`, `matchesFilter`, `isOverdue` |
| `fleet/api` | `VehicleSummaryStore` : immatriculation et modèle pour un identifiant de véhicule |

## 6. Types de bibliothèques

Chaque type répond à une seule question. Si un fichier répond à deux, ce sont deux fichiers.

| Type | Question à laquelle il répond | Contient | Ne doit pas contenir |
|---|---|---|---|
| `feature` | Que fait ce cas d'usage ? | Pages routées, composants smart, branchement de la facade sur l'ui | Appels HTTP, composants visuels réutilisables |
| `ui` | À quoi ça ressemble ? | Composants de présentation, pipes, directives | Stores injectés, services avec état, HTTP |
| `data-access` | D'où viennent les données et comment changent-elles ? | Store, effects, clients d'API, facade, providers | Composants |
| `model` | Quels sont les termes et les règles du domaine ? | Types, enums, fonctions pures comme `isOverdue` | Imports de framework, quels qu'ils soient |
| `util` | De quels helpers techniques a-t-on besoin ? | Formatage, parsing, petits algorithmes | Termes du domaine, état de framework |
| `api` | Que peuvent utiliser les autres domaines ? | Réexports d'un sous-ensemble choisi du domaine | Sa propre logique |
| `shell` | Comment ce domaine est-il monté ? | Routes, providers au niveau des routes, guards | Logique métier |

### 6.1. Qui peut importer qui

| Depuis ↓ peut importer → | shell | feature | ui | data-access | model | util | api d'un autre domaine |
|---|---|---|---|---|---|---|---|
| **app** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **shell** | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **feature** | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| **api** | – | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **ui** | – | – | ✓ | – | ✓ | ✓ | – |
| **data-access** | – | – | – | ✓ | ✓ | ✓ | – |
| **model** | – | – | – | – | ✓ | ✓ | – |
| **util** | – | – | – | – | – | ✓ | – |

Trois lignes de ce tableau portent l'essentiel de la valeur :

- **feature → feature est interdit.** Deux pages qui ont besoin de la même chose la partagent via `ui` ou `data-access`. Les pages sont composées par le shell ou le routeur, pas en s'important l'une l'autre.
- **ui → data-access est interdit.** Un composant qui injecte un store n'est pas un composant de présentation. C'est à cause de cette règle que le type `WorkOrder` vit dans `model`, pas dans `data-access`.
- **model n'importe aucun framework.** `model` et `util` compilent aussi bien en Angular, React, Vue que Node. Dans un workspace mixte, c'est le code que l'on partage (section 8.3).

### 6.2. Quelle taille pour une bibliothèque

- **feature :** un cas d'usage, en général une route et ses enfants. `feature-work-orders`, pas `feature-maintenance`.
- **ui :** un groupe cohérent qui change ensemble. `ui-work-order-card` contient la carte, la puce de statut et le filtre de statut.
- **data-access :** une par domaine pour commencer. On la découpe par sous-domaine quand elle contient plus de trois ou quatre features de store ou que l'équipe se divise (`data-access-planning`, `data-access-work-orders`).
- **model :** un par domaine. Il est petit par nature.
- Si une bibliothèque n'a qu'un fichier, elle est probablement trop petite ; si son `index.ts` exporte plus d'une trentaine de symboles, elle est probablement trop grosse.

## 7. Domaines et frontières

Un domaine est un dossier avec une porte explicite. À l'intérieur du dossier, les règles de types de la section 6 s'appliquent. Entre dossiers, une seule règle s'applique : **vous pouvez importer la bibliothèque `api` d'un autre domaine, et rien d'autre.**

### 7.1. La bibliothèque API

`fleet/api` décide de ce que fleet offre au reste de l'entreprise. Tout ce qui n'y figure pas est privé à l'équipe Workshop et peut changer sans demander l'avis de personne.

`libs/fleet/api/src/index.ts`

```ts
export type { VehicleSummary, VehicleId } from '@fleetline/fleet/model';
export { VehicleSummaryStore } from '@fleetline/fleet/data-access';
export { VehicleBadgeComponent } from '@fleetline/fleet/ui-vehicle-badge';
```

Le store qu'elle exporte est un NgRx Signal Store, alors que maintenance utilise le NgRx Store classique. Maintenance n'a pas besoin de le savoir ; elle ne voit que `VehicleSummaryStore`.

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

### 7.2. Shared est aussi un domaine

`shared` porte le tag `domain:shared` et ne peut importer que `domain:shared`. Il ne connaît aucun terme métier. Une règle simple pour les revues : si un fichier de `shared` contient un mot d'un domaine (ordre de travail, facture, véhicule), il part dans ce domaine.

### 7.3. Quand deux domaines ont besoin de la même chose

| Situation | Réponse |
|---|---|
| Billing affiche l'immatriculation d'un véhicule | Billing importe `fleet/api`. |
| Maintenance et inventory ont tous deux besoin de la liste des dépôts | Les dépôts sont un concept à part entière : un petit domaine `depots`, ou `fleet` les exporte dans son API. Pas `shared`. |
| Booking doit ouvrir un ordre de travail après une réservation | Booking appelle le backend ; le backend crée l'ordre de travail. Les domaines front-end n'orchestrent pas les écritures les uns des autres. |
| Deux domaines ont besoin du même sélecteur de date | C'est technique, pas métier : `shared/ui-design-system`. |
| Deux bibliothèques API veulent s'importer mutuellement | Les domaines sont mal découpés. Fusionnez-les ou déplacez le concept commun dans un troisième domaine. |

## 8. Faire respecter les règles

Une règle qui n'est pas vérifiée est une suggestion. Nx la vérifie avec des tags et une seule règle de lint.

### 8.1. Tags

Chaque `project.json` reçoit un tag `domain:*` et un tag `type:*`, et dans un workspace mixte un tag `framework:*`.

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

Les générateurs posent les tags à la création de la bibliothèque :

```bash
nx g @nx/angular:library --directory=libs/maintenance/feature-planning-board \
  --tags=domain:maintenance,type:feature,framework:angular
nx g @nx/js:library --directory=libs/maintenance/model \
  --tags=domain:maintenance,type:model,framework:agnostic --bundler=none
```

### 8.2. La règle de lint

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

Comment les dimensions se combinent : un import doit satisfaire **toutes** les contraintes de tous les tags de la bibliothèque qui importe. Une feature de maintenance peut importer `fleet/api`, parce que sa règle de type autorise `type:api` et que sa règle de domaine autorise `type:api`. Elle ne peut pas importer `fleet/data-access` : la règle de type autoriserait `data-access`, mais la règle de domaine n'autorise pas `domain:fleet`. Une bibliothèque `ui` de maintenance ne peut pas non plus importer `fleet/api` : la règle de domaine l'autoriserait, mais pas la règle de type.

La même règle refuse aussi les imports relatifs vers une autre bibliothèque, les imports des détails internes d'une bibliothèque au lieu de son `index.ts`, et les dépendances circulaires entre bibliothèques.

### 8.3. La dimension framework

L'application `customer` de Fleetline pourrait passer à Next.js, et `backoffice` à Nuxt, sans déplacer une seule bibliothèque `model` ou `util`. Celles-ci portent le tag `framework:agnostic` et ne peuvent importer que du code agnostique, si bien que `matchesFilter` et `isOverdue` sont la même fonction dans les trois apps. Une bibliothèque React qui tente d'importer une bibliothèque `ui` Angular échoue au lint.

### 8.4. Sans Nx : Sheriff

Toutes les équipes n'utilisent pas Nx. **Sheriff**, de la même équipe ANGULARarchitects, applique les mêmes règles de tags à l'intérieur d'un seul projet TypeScript, par dossier au lieu de par bibliothèque. Il convient à une application Next.js ou Nuxt qui veut les frontières avant de vouloir un monorepo.

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

### 8.5. En CI

```bash
nx affected -t lint typecheck test build --base=origin/main
nx graph --affected
```

Comme le graphe de dépendances est explicite, une modification dans `maintenance/ui-checklist` lance le lint, les tests et le build des bibliothèques et applications qui en dépendent, et de rien d'autre. Chez Fleetline, une pull request typique touche un domaine et exécute un cinquième du workspace. Avec le cache distant, une bibliothèque inchangée n'est jamais reconstruite, sur aucune machine.

## 9. L'état avec NgRx

`maintenance/data-access` contient tout ce qui concerne l'origine des ordres de travail et la façon dont ils changent. Cette section la montre en entier. Chaque fichier a une seule tâche.

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

### 9.1. Le model

Le model est sans framework et vit dans sa propre bibliothèque, pour que les bibliothèques `ui`, les tests et les versions React et Vue puissent l'utiliser.

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

### 9.2. Les événements

Les actions sont nommées d'après **ce qui s'est passé**, et regroupées selon **l'endroit où c'est arrivé**. La page signale des événements ; elle n'émet pas de commandes comme `loadWorkOrders`.

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

### 9.3. La feature : état, reducer, selectors

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

L'assignation est **optimiste** : le reducer applique `assigneeChosen` immédiatement, et `assignFailed` remet le mécanicien précédent. La valeur précédente voyage dans l'événement, car au moment où l'effect s'exécute, l'état contient déjà la nouvelle.

### 9.4. HTTP et effects

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

`switchMap` pour le chargement (un dépôt plus récent annule la requête précédente), `mergeMap` pour les assignations (deux assignations sur deux cartes doivent toutes deux aboutir).

### 9.5. Providers

La feature du store est enregistrée sur la route du domaine, pas à la racine de l'application. Le store racine reste vide jusqu'à ce qu'un planificateur ouvre maintenance, et son code est chargé en lazy loading avec la route.

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

### 9.6. L'API publique de data-access

`libs/maintenance/data-access/src/index.ts`

```ts
export { provideWorkOrders } from './lib/work-orders.providers';
export { WorkOrdersFacade } from './lib/work-orders.facade';
```

Deux exports. Les actions, le reducer, les selectors et le client HTTP sont privés. Chaque feature de maintenance passe par la facade, et l'équipe Workshop peut restructurer le store sans toucher à un seul composant.

## 10. La facade, et quand s'en passer

:::diagram fe-flow

Une facade est un objet fin entre les features et la gestion d'état. Elle expose un **état** (des signals en Angular, des valeurs en React, des refs en Vue) et des **intentions** (des méthodes). Elle ne contient aucune logique : chaque méthode dispatche exactement un événement, et chaque propriété est exactement un selector.

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

La facade est fournie par `provideWorkOrders()`, pas dans `root`, si bien qu'elle existe exactement là où existe sa feature de store.

### 10.1. Pourquoi une facade

- **Un état remplaçable.** Le jour où les ordres de travail passent du NgRx Store à un Signal Store ou à un cache serveur, la facade change et aucun composant ne change. Fleetline a fait exactement cela pour `fleet` (section 7.1).
- **Une petite surface.** Une feature voit six membres au lieu de quatorze actions et neuf selectors.
- **Des tests faciles.** Un test de feature fournit un faux objet de même forme (section 15).
- **La même forme dans chaque framework.** La classe ici, `useWorkOrders()` en React et en Vue : le code des features se lit presque pareil dans les trois (section 14).

### 10.2. Pourquoi la facade est optionnelle

La communauté NgRx a un bon argument contre les facades : les actions doivent décrire des événements (*« mécanicien choisi sur la page des ordres de travail »*), et une facade avec une méthode `assign()` pousse à penser en commandes. Une facade qui dispatche trois actions d'affilée, ou qui contient de la logique, masque le journal d'événements qui rend NgRx débogable.

Dans notre variante, la facade est donc une règle avec conditions :

| Utilisez une facade quand | Passez-vous-en quand |
|---|---|
| plus d'une feature utilise le même état | une feature possède une petite feature de store |
| l'implémentation de l'état peut changer (Store ↔ Signal Store ↔ cache serveur) | l'état est local à un composant : utilisez un Signal Store ou de simples signals dans le composant |
| les données sont offertes à un autre domaine via `api` | l'équipe préfère dispatcher les événements directement et le domaine est petit |
| la base de code est partagée avec des équipes React ou Vue | |

Deux règles quand vous en utilisez une :

1. **Les noms de méthodes gardent l'événement.** `assign()` dispatche `assigneeChosen` depuis la source `Work Orders Page`. Si deux pages peuvent assigner, chaque page a son propre événement ; la facade a deux méthodes ou un paramètre `source`, jamais un `update()` générique.
2. **Aucune logique.** Pas de `if`, pas de boucle, pas d'appel HTTP. S'il faut une décision, elle appartient à un reducer, un selector ou un effect.

Sans facade, l'`index.ts` de `data-access` exporte à la place les événements de la page et les selectors, et le composant appelle lui-même `store.dispatch()` et `store.selectSignal()`. Les deux formes respectent les règles de frontières ; choisissez-en une par domaine et écrivez-la dans le README du domaine.

## 11. Angular de bout en bout

Une fois `data-access` en place, les bibliothèques restantes sont courtes.

### 11.1. La bibliothèque ui

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

La carte connaît un `WorkOrder` parce que `model` est autorisé. Elle reçoit `vehicleLabel` sous forme de chaîne, parce qu'une bibliothèque `ui` de maintenance ne peut pas importer `fleet/api`.

### 11.2. La bibliothèque feature

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

`depotId` vient du paramètre de route grâce à `withComponentInputBinding()`. `ensureLoaded` est un `rxMethod` et accepte un signal : chaque fois que la liste visible change, fleet charge en une seule requête les immatriculations qu'il n'a pas encore.

### 11.3. Le shell

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

Le shell importe `identity/api` pour le guard de permission. Les guards, comme les immatriculations venant de fleet, sont une préoccupation transverse aux domaines : un shell peut donc utiliser l'API d'un autre domaine, tout comme une feature (section 6.1). Tout le reste de ce dont le shell a besoin vient de son propre domaine.

### 11.4. L'application

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

C'est toute l'application : deux fichiers et un `environment`. `backoffice` monte le même `maintenance/feature-shell` avec une autre mise en page. Une troisième application prendrait un après-midi.

## 12. React et Next.js

L'architecture ne dépend pas d'Angular. Bibliothèques, types, domaines, tags et règle de lint restent les mêmes ; Nx génère les projets React et Next.js avec `@nx/react` et `@nx/next`. Ce qui change, c'est la façon d'implémenter chaque type de bibliothèque, et Next.js ajoute une nouvelle dimension : le code qui ne s'exécute que sur le serveur.

### 12.1. Les correspondances

| Angular | React / Next.js |
|---|---|
| Composant `feature` | Un client component exporté depuis `feature-*` ; le `page.tsx` de l'app se contente de l'afficher |
| Composant `ui` avec `input()`/`output()` | Un composant avec des props et des callbacks |
| Routes du `shell` | Les routes fichiers restent dans `apps/<app>/app/` ; la bibliothèque shell exporte le layout et les providers du domaine |
| NgRx Store, `createFeature` | Redux Toolkit `createSlice` |
| NgRx Entity | `createEntityAdapter` de Redux Toolkit |
| `createSelector` | `createSelector` (Reselect, inclus dans Redux Toolkit) |
| Effects | Listener middleware, ou thunks pour les cas simples |
| `provideState` sur une route | `slice.injectInto(rootReducer)` (slices chargées en lazy) |
| Signal Store | Zustand |
| Service facade | Un hook : `useWorkOrders()` |
| `HttpClient` | `fetch` dans une fonction serveur ou un module d'API client |

### 12.2. Des tags pour le serveur et le client

Dans l'App Router, un fichier est soit un server component, soit un client component. Le code qui lit des secrets, des cookies ou la base de données ne doit jamais se retrouver dans le bundle du navigateur. Fleetline ajoute une deuxième bibliothèque data-access par domaine et un tag de plus :

| Bibliothèque | Tags | Contient |
|---|---|---|
| `maintenance/data-access` | `type:data-access`, `platform:client` | Slice Redux, listeners, API client, hook facade |
| `maintenance/data-access-server` | `type:data-access`, `platform:server` | Fonctions fetch `server-only` et server actions |

La règle de lint de la section 8.2 contient déjà la contrainte `platform:client` → pas `platform:server`. Chaque fichier server-only commence en plus par `import 'server-only'`, si bien qu'une erreur fait échouer le build même là où le lint ne tourne pas.

### 12.3. Le store

Redux Toolkit peut injecter des slices en lazy, ce qui joue le rôle de `provideState` sur une route. Le reducer racine vit dans `shared` et ne connaît aucun domaine.

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

Un nouveau store par requête est créé dans un provider client, comme le recommande le guide Redux Toolkit pour l'App Router.

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

Les mêmes événements, la même mise à jour optimiste, les mêmes fonctions `model` qu'en section 9.

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

### 12.5. Les effects sous forme de listeners

Les listeners sont ajoutés quand le domaine est monté et retirés quand il est démonté : c'est l'équivalent de `provideEffects` sur une route. `cancelActiveListeners()` donne la sémantique de `switchMap`.

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

### 12.6. Le hook facade

Le hook a les mêmes membres que la facade Angular. Il démarre aussi les listeners et signale l'ouverture de la page, si bien qu'une feature n'a besoin que d'une ligne pour être branchée.

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

### 12.7. Feature, ui et route

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

Le fichier de route de l'application reste long de quelques lignes. La bibliothèque shell exporte le layout du domaine avec la vérification de permission.

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

### 12.8. L'état serveur : la même facade, un autre moteur

Dans Next.js, une grande partie de ce qu'une SPA Angular garde dans NgRx est de l'**état serveur** : des données que le serveur possède et que le client met en cache. Pour des listes comme les ordres de travail, beaucoup d'équipes préfèrent les server components et un cache de requêtes à Redux. La facade en fait une décision privée de `data-access`.

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

La valeur de retour a les mêmes membres. `WorkOrdersPage` ne change pas, sauf qu'il reçoit `initial`, chargé par le `page.tsx` serveur avec `listWorkOrders`. La règle de Fleetline : **l'état serveur dans un cache de requêtes, l'état possédé par le client dans Redux.** Le tableau de planification, où les planificateurs déplacent des dizaines d'ordres entre mécaniciens et entre jours avant d'enregistrer, est possédé par le client et reste dans Redux ; la liste des ordres de travail est de l'état serveur.

### 12.9. Les pièges propres à Next.js

- **`'use client'` est une frontière à part entière.** Mettez-le dans les fichiers feature et data-access qui utilisent des hooks, jamais dans `model` ou `util`.
- **N'importez pas une bibliothèque serveur dans un fichier client « juste pour le type ».** Les types vivent dans `model`.
- **Les server actions appartiennent à `data-access-server`.** Une feature ne les importe via des réexports de `data-access` que si les tags de lint le permettent ; sinon, la page les passe en props.
- **Les fichiers de route restent fins.** Un `page.tsx` qui accumule de la logique est la version Next.js d'un gros composant d'app Angular.

## 13. Vue et Nuxt

Vue se transpose encore plus directement, car les setup stores Pinia ressemblent beaucoup à un NgRx Signal Store, et les composables sont la forme naturelle d'une facade. Nx construit les projets Vue et Nuxt avec `@nx/vue` et `@nx/nuxt`.

### 13.1. Les correspondances

| Angular | Vue / Nuxt |
|---|---|
| Composant `feature` | Un single-file component dans `feature-*` ; la page dans `apps/<app>/app/pages/` se contente de l'afficher |
| Composant `ui` | Un composant avec `defineProps` et `defineEmits` |
| Routes du `shell` | Les routes fichiers restent dans l'app ; la bibliothèque shell exporte les layouts et le route middleware |
| NgRx Store / Signal Store | Pinia (setup store) |
| Selectors | `computed` dans le store |
| Effects | Actions asynchrones dans le store ; `useAsyncData` pour le chargement pendant le rendu serveur |
| Service facade | Un composable : `useWorkOrders()` |
| `HttpClient` | `$fetch` |

Pinia ne sépare pas actions et reducers. Cela supprime le journal d'événements et le time-travel debugging de NgRx, mais aussi l'essentiel du cérémonial. Pour l'architecture, cela ne change rien : le store est privé à `data-access`, et le composable est la porte.

### 13.2. Désactiver les auto-imports pour les bibliothèques

Nuxt importe automatiquement les composants et les composables. C'est pratique dans une petite app et fatal pour les frontières : **un import qui n'est jamais écrit ne peut pas être linté.** Si une feature de billing peut utiliser `useWorkOrders()` sans ligne `import`, la règle de lint ne voit jamais le franchissement.

Les règles dans les applications Nuxt de Fleetline :

- les bibliothèques sont importées par des instructions `import` explicites via leurs alias de chemin, jamais enregistrées comme dossiers d'auto-import ;
- les domaines ne sont pas des layers Nuxt, parce que les layers auto-importent leurs composants et composables dans l'app ;
- l'app garde les auto-imports pour les API Vue et Nuxt uniquement dans ses propres `pages/` et `layouts/`, et le code des bibliothèques importe les fonctions Nuxt depuis `#imports`.

`apps/backoffice/nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
  components: { dirs: [] },
  imports: { scan: false },
  runtimeConfig: { public: { apiUrl: '' } },
});
```

### 13.3. Le store

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

`byId`, `filter` et `error` sont retournés pour que Pinia les sérialise dans le payload du rendu serveur et que le navigateur démarre avec le même état.

### 13.4. Le composable facade

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

La clé est une fonction de `depotId` : changer de dépôt relance donc le chargement. Sur le serveur, `useAsyncData` attend les données ; dans le navigateur, la page s'hydrate à partir du payload sans seconde requête.

### 13.5. Feature, ui et page

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

### 13.6. Les pièges propres à Nuxt

- **Linter les fichiers `.vue`** demande `vue-eslint-parser` dans la configuration ESLint ; sinon la règle de frontière ignore silencieusement chaque composant. C'est pour cette raison que le motif `files` de la section 8.2 inclut `**/*.vue`.
- **Un store par requête.** Pinia avec `@pinia/nuxt` en crée déjà un par requête côté serveur. Ne gardez jamais d'état dans un `ref` au niveau du module dans une bibliothèque : côté serveur, il serait partagé entre utilisateurs.
- **`useAsyncData` a sa place dans la facade**, pas dans le store. Le store reste utilisable depuis les tests et depuis du code exclusivement client.

## 14. Côte à côte

:::diagram fe-frameworks

Le même cas d'usage dans trois frameworks, fichier par fichier :

| Bibliothèque | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| `model` | `work-order.ts` | le même fichier | le même fichier |
| état de `data-access` | `createFeature` + `createEntityAdapter` | `createSlice` + `createEntityAdapter` | setup store Pinia |
| effects de `data-access` | `createEffect` fonctionnel | listener middleware | actions asynchrones du store + `useAsyncData` |
| facade de `data-access` | `WorkOrdersFacade` (signals) | `useWorkOrders()` (valeurs) | `useWorkOrders()` (refs) |
| `ui` | `input()` / `output()` | props / callbacks | `defineProps` / `defineEmits` |
| `feature` | composant standalone | client component | single-file component |
| `shell` | `Routes` avec `providers` | composant layout, segment de route | layout + route middleware |
| route de l'app | `loadChildren` | `page.tsx` | `pages/*.vue` |
| frontières | `@nx/enforce-module-boundaries` | la même règle | la même règle, avec `vue-eslint-parser` |

Ce qui reste identique dans les trois : le dossier de chaque fichier, les tags, la règle de lint, la bibliothèque `model`, les membres de la facade et les tests de la bibliothèque `model`. Un développeur qui passe d'une app Fleetline à l'autre n'a à réapprendre que le framework lui-même.

## 15. Tester par type de bibliothèque

Chaque type a sa forme naturelle de test, et les frontières rendent chacune peu coûteuse.

| Type | Test | Vitesse | Ce qu'il simule |
|---|---|---|---|
| `model`, `util` | Tests unitaires simples, sans framework | millisecondes | rien |
| reducers, selectors de `data-access` | Tests de fonctions pures | millisecondes | rien |
| effects / listeners de `data-access` | Tests avec un faux client HTTP | rapide | HTTP |
| facade | Intégration avec le vrai store | rapide | HTTP |
| `ui` | Tests de composants, stories dans Storybook | rapide | rien, il n'a que des entrées |
| `feature` | Test de composant avec une fausse facade | rapide | la facade |
| app | End-to-end avec Playwright, quelques parcours | lent | le backend, ou rien |

Un test de reducer n'a pas besoin de TestBed :

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

Un test de feature fournit une fausse facade, car le composant ne voit rien d'autre :

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

Les builders de données de test comme `aWorkOrder` vivent dans un point d'entrée secondaire de `model` (`@fleetline/maintenance/model/testing`), si bien que les tests de chaque framework utilisent les mêmes.

## 16. Grandir vers cette architecture et migrer

Personne ne commence avec soixante-dix bibliothèques. Fleetline a démarré comme une seule application Angular avec un dossier `src/app` ; les étapes ci-dessous sont l'ordre qui a fonctionné.

### 16.1. La migration en huit étapes

1. **Créer le workspace autour de l'app.** `nx init` dans le dépôt existant. Rien ne bouge encore.
2. **Dessiner les domaines sur papier.** Utilisez les mots du métier : de quoi parlent les planificateurs, les clients et la finance ? Comptez six à dix domaines. Écrivez-les dans un README.
3. **Activer la règle en avertissement.** Ajoutez la configuration de lint de la section 8.2 avec `'warn'`. Comptez les avertissements : c'est votre point de départ.
4. **Extraire d'abord `model` et `util`.** Ils n'ont aucune dépendance, donc les déplacer est sans risque, et toutes les étapes suivantes en ont besoin. Utilisez `nx g @nx/workspace:move`.
5. **Extraire `ui` par domaine.** Tout composant qui n'a que des entrées et des sorties est déplacé. Les composants qui injectent un store restent en place pour l'instant.
6. **Découper `data-access` par domaine.** Découpez le store racine par domaine ; déplacez chaque feature de store, ses effects et son HTTP dans la `data-access` du domaine, et enregistrez-la sur la route du domaine.
7. **Déplacer les pages dans `feature-*` et les routes dans `feature-shell`.** L'app se réduit à ses routes et à ses providers.
8. **Passer la règle en `'error'` et ajouter CODEOWNERS.** Désormais, tout nouveau franchissement fait échouer la CI.

Les étapes 4 à 7 se font domaine par domaine, et l'application continue d'être livrée entre-temps. Chez Fleetline, toute la migration a pris quatre mois en parallèle du travail sur les fonctionnalités, un domaine à la fois, en commençant par le plus petit (`notifications`) pour apprendre les gestes.

### 16.2. Ce qui tourne mal d'habitude

- **Un domaine appelé `common` ou `core`.** Il devient le nouveau `shared/`. Chaque concept a un propriétaire métier ; trouvez-le.
- **Des domaines découpés par page plutôt que par langage métier.** « Dashboard » n'est pas un domaine ; c'est une feature qui lit plusieurs domaines à travers leurs API.
- **Des bibliothèques API qui réexportent tout.** La frontière n'est alors que cosmétique. Exportez ce qu'une autre équipe utilise vraiment, et rien d'autre.
- **Des lignes de lint désactivées.** Un `eslint-disable` pour la règle de frontière devient quarante en un an. Les exceptions vont dans la configuration, avec une justification dans la pull request.

### 16.3. Quand découper une bibliothèque

- Une `data-access` avec plus de trois ou quatre features de store, ou possédée par deux équipes : découpez par sous-domaine.
- Une bibliothèque `ui` importée par une seule feature : réintégrez-la dans cette feature ou gardez-la, mais ne la déplacez pas dans `shared`.
- Une `feature` avec plusieurs routes sans rapport : une bibliothèque par cas d'usage.
- Un domaine dont les bibliothèques appartiennent surtout à une autre équipe : le domaine est mal découpé, ou ce sont les frontières des équipes qui le sont.

### 16.4. Quand c'est trop

Pour une application, une équipe et un ou deux domaines, la structure complète coûte plus qu'elle ne rapporte. Commencez plutôt par des dossiers dans un seul projet (`src/domains/<domain>/feature-…`, `ui-…`, `data-access`, `model`) et faites-les respecter avec Sheriff (section 8.4). Transformer plus tard ces dossiers en bibliothèques Nx est une étape mécanique, puisque les règles de dépendances sont déjà vraies.

## 17. Questions

**Faut-il NgRx pour tout l'état ?**
Non. L'état partagé et durable que plusieurs features lisent va dans un store. L'état des formulaires, les panneaux ouverts ou fermés et tout autre état possédé par un seul composant restent dans le composant, avec des signals ou un Signal Store au niveau du composant.

**NgRx Store ou NgRx Signal Store ?**
Les deux conviennent à l'architecture, les deux vivent dans `data-access`, et la facade masque le choix. Fleetline utilise le Store là où un journal d'événements et les devtools sont rentables (maintenance, planification) et le Signal Store pour les domaines plus simples (résumés de flotte, notifications).

**Une facade, ce n'est pas juste une couche de plus ?**
Si, et la section 10 dit quand elle en vaut la peine. En React et en Vue, le hook ou le composable est de toute façon la manière idiomatique de partager l'accès à l'état, donc là, la facade ne coûte presque rien.

**Chaque domaine doit-il avoir une bibliothèque `api` dès le premier jour ?**
Non. Créez-la la première fois qu'un autre domaine a besoin de quelque chose. Avant cela, le domaine est entièrement privé, ce qui est la meilleure frontière qui soit.

**Est-ce que ce sont des micro front-ends ?**
Non. Tout ici se construit en une seule application par dossier d'app. Le même découpage en domaines est la ligne de coupe naturelle pour des micro front-ends plus tard, si l'organisation a un jour besoin de déploiements indépendants.

**React, Vue et Angular peuvent-ils vraiment partager des bibliothèques ?**
Ils partagent les bibliothèques `model` et `util`, taguées `framework:agnostic`, ainsi que les builders de données de test. Les composants et les stores sont propres à chaque framework. Chez Fleetline, environ un cinquième du code front-end est agnostique.

**Où en lire davantage ?**
Les articles de Manfred Steyer et l'e-book gratuit *Enterprise Angular* sur [angulararchitects.io](https://www.angulararchitects.io/), la [documentation Nx](https://nx.dev/) sur les frontières de modules, [Sheriff](https://github.com/softarc-consulting/sheriff), et la [documentation NgRx](https://ngrx.io/).
