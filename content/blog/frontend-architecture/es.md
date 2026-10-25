Esta guía describe cómo estructuramos front-ends grandes: un workspace, muchas aplicaciones, muchos equipos y una regla para cada archivo. Lo construimos con **Nx** y **Angular**, guardamos el estado compartido en **NgRx** y ponemos una **fachada opcional** delante del store. Después mostramos la misma arquitectura, regla por regla, en **React con Next.js** y en **Vue con Nuxt**.

La arquitectura no es nuestra. Su núcleo lo elaboró y publicó **Manfred Steyer**, formador y consultor de Angular, Google Developer Expert en Angular y la persona detrás de [ANGULARarchitects](https://www.angulararchitects.io/). Su idea es cortar un front-end **en vertical por dominio** y **en horizontal por tipo de librería**, dejar que los dominios se comuniquen solo a través de una API explícita y dejar que una herramienta, no una wiki, haga cumplir esas líneas. La sección 2 enumera con exactitud qué viene de él, qué viene de Nx y qué hemos añadido nosotros.

Un ejemplo pequeño no puede mostrar por qué importa todo esto. Un dominio con un store cabe en la cabeza de cualquiera. Por eso todos los ejemplos de esta página salen de un único workspace realista: **Fleetline**, una plataforma de mantenimiento de flotas con tres aplicaciones, nueve dominios, unas setenta librerías y cinco equipos. Se presenta en la sección 5 y se usa en todas las secciones posteriores.

> Escrito para equipos que ya tienen, o pronto tendrán, más de una aplicación front-end, más de un equipo o más de unas 50.000 líneas de código front-end. Por debajo de ese tamaño, lee primero la sección 16.4.

## 1. Por qué un front-end necesita una arquitectura

Un front-end crece siempre de la misma manera. El primer año hay una aplicación y una carpeta `src/app` con `components`, `services` y `store`. Al tercer año, el mismo proyecto suele tener este aspecto:

- `shared/` contiene trescientos archivos, y la mitad los usa exactamente una funcionalidad;
- un componente de facturación importa un selector de mantenimiento porque estaba ahí;
- el store raíz tiene cuarenta claves de feature, y nadie sabe cuáles necesita una página;
- una segunda aplicación se crea copiando la primera, porque extraer código es demasiado difícil;
- un cambio en un helper de fechas recompila y vuelve a probar todo el repositorio;
- una persona nueva en el equipo, o un agente de código, necesita días para saber dónde vive una funcionalidad y qué puede usar.

Nada de esto lo causan malos ingenieros. Lo causa la falta de una respuesta compartida a dos preguntas: **dónde va este archivo** y **quién puede importar a quién**. Sin respuesta gana la carpeta más cercana, y la carpeta más cercana siempre es `shared/`.

La arquitectura de esta guía responde a las dos preguntas una sola vez, para cada tipo de código front-end, y hace que la respuesta sea **mecánica**: una regla de lint rechaza un import que cruza una línea, en el editor y en CI.

### 1.1. Objetivos

1. **Localizabilidad.** Conocer el nombre de una funcionalidad te dice su carpeta, en cualquier aplicación.
2. **Cambios locales.** Un cambio dentro de un dominio no puede romper otro dominio, porque el otro dominio no ve sus partes internas.
3. **Feedback rápido a escala.** CI compila y prueba solo las librerías a las que afecta un cambio.
4. **Equipos en paralelo.** Un equipo es dueño de dominios, no de archivos repartidos por `shared/`.
5. **Estado sustituible.** Una funcionalidad no sabe si sus datos vienen de NgRx, de un Signal Store, de una caché o del servidor.
6. **Un reglamento para tres frameworks.** Las aplicaciones Angular, React y Vue de una misma empresa siguen la misma estructura, y el código sin framework se comparte entre ellas.

### 1.2. Lo que no pretende

- No elige tu back-end, tu sistema de diseño ni tu CSS.
- No exige micro front-ends. Todo lo de aquí funciona en una sola aplicación desplegable; los micro front-ends son una decisión posterior e independiente.
- No sustituye las reglas de tu producto. Dice dónde vive el código y qué puede usar; tu proyecto dice qué debe hacer el código.

## 2. De dónde viene la idea

La arquitectura combina tres fuentes. Las nombramos porque vale la pena leer cada una en el original.

| Fuente | Qué aporta |
|---|---|
| **Nx** (el equipo de Nrwl, *Enterprise Angular Monorepo Patterns*) | El propio monorepo, las librerías con un `index.ts` público y los tipos de librería clásicos: `feature`, `ui`, `data-access`, `util`. Los tags en los proyectos y la regla de lint `@nx/enforce-module-boundaries`. |
| **Manfred Steyer** (ANGULARarchitects, el e-book *Enterprise Angular*, sus artículos sobre diseño estratégico con Nx) | Aplicar Domain-Driven Design al front-end: **dominios como cortes verticales**, **tipos de librería como capas horizontales**, dos dimensiones de tags (`domain:*` y `type:*`) comprobadas por un linter, una **librería API** como única puerta entre dominios y una **fachada** entre la UI y la gestión de estado. Más tarde también **Sheriff**, un comprobador de fronteras para proyectos sin Nx. |
| **NgRx** (y antes Redux) | Un store para el estado compartido, cambios mediante acciones y reducers puros, efectos secundarios en effects, lecturas mediante selectores memoizados. |

Lo que hemos decidido encima, en esta guía:

- un tipo `model` aparte para tipos sin framework y funciones de dominio puras, de modo que las librerías `ui` nunca dependan de la gestión de estado;
- un tipo `shell` propio (el `feature-shell` de Nx) que es dueño de las rutas y los providers de un dominio;
- una tercera dimensión de tags, `framework:*`, para que aplicaciones Angular, React y Vue puedan convivir en un workspace y compartir código `model` y `util`;
- una cuarta dimensión para Next.js, `platform:server` y `platform:client`;
- la regla de la sección 10 sobre cuándo compensa una fachada y cuándo prescindir de ella;
- las traducciones a React/Next y Vue/Nuxt de las secciones 12 y 13.

Cuando algo de esta página no coincide con los artículos originales, el original es la referencia para la idea; esta página es la referencia para cómo la aplicamos.

## 3. La arquitectura en una página

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

Seis frases para recordar:

1. **Cada librería tiene un dominio y un tipo**, escritos como tags, y los tags deciden qué puede importar.
2. **Los imports bajan por la escalera de tipos**: feature → ui, data-access → model → util. Nunca hacia arriba, nunca de lado entre features.
3. **Un dominio ve a otro dominio solo a través de su librería `api`.** Todo lo demás de un dominio es privado.
4. **`shared` no conoce ningún dominio.** Si un archivo «compartido» menciona órdenes de trabajo, pertenece a mantenimiento.
5. **Los componentes nunca hablan con HTTP.** Los datos pasan por `data-access`; la feature ve una fachada o selectores, nunca una URL.
6. **Las aplicaciones son finas.** Una app conecta rutas y providers; las features viven en librerías, así que una segunda app no cuesta nada.

## 4. Vocabulario

| Término | Significado |
|---|---|
| **Workspace** | Un repositorio Nx con todas las aplicaciones y librerías. |
| **Aplicación** | Un front-end desplegable en `apps/`. Casi no contiene código. |
| **Librería** | Una carpeta en `libs/` con su propio `project.json`, tags y un `index.ts` público. Se importa solo a través de su alias de ruta, p. ej. `@fleetline/maintenance/data-access`. |
| **Dominio** | Una parte del negocio con su propio lenguaje y sus propios datos: mantenimiento, flota, facturación. También se llama bounded context. Una carpeta en `libs/`. |
| **Tipo** | El papel técnico de una librería: `feature`, `ui`, `data-access`, `model`, `util`, `api`, `shell`. |
| **API pública** | El `index.ts` de una librería. Lo que no exporta no existe para las demás librerías. |
| **Fachada** | Una clase, un hook o un composable pequeño que una feature usa en lugar del store: el estado como signals o refs, las intenciones como métodos. |
| **Regla de fronteras** | Una regla de lint que lee los tags de dos librerías y rechaza un import que los tags no permiten. |

## 5. El ejemplo: Fleetline

Fleetline gestiona el mantenimiento para empresas que operan camiones, furgonetas y autobuses. Los mecánicos trabajan en talleres; los planificadores asignan el trabajo; los clientes reservan servicios y pagan facturas; finanzas y soporte llevan un back office.

### 5.1. Aplicaciones

| Aplicación | Usuarios | Framework en esta guía |
|---|---|---|
| `ops-portal` | Planificadores y mecánicos de los talleres | Angular |
| `customer` | Clientes de flota: reservas, vehículos, facturas | Angular (Next.js en la sección 12) |
| `backoffice` | Finanzas, soporte, administradores | Angular (Nuxt en la sección 13) |

### 5.2. Dominios y equipos

| Dominio | Es dueño de | Equipo | Lo usan las apps |
|---|---|---|---|
| `maintenance` | Órdenes de trabajo, checklists, tablero de planificación, SLA | Workshop | ops-portal, backoffice |
| `fleet` | Vehículos, cuentakilómetros, historial de servicio | Workshop | las tres |
| `inventory` | Piezas, stock por taller, reservas | Supply | ops-portal, backoffice |
| `booking` | Huecos de servicio, flujo de reserva, cambios de cita | Customer | customer, ops-portal |
| `billing` | Presupuestos, facturas, pagos | Finance | customer, backoffice |
| `customers` | Cuentas, contratos, contactos | Customer | customer, backoffice |
| `identity` | Inicio de sesión, roles, permisos | Platform | las tres |
| `notifications` | Bandeja de entrada en la app, preferencias de correo | Platform | las tres |
| `shared` | Sistema de diseño, layout, configuración HTTP, fechas, dinero, testing | Platform | las tres |

Cinco equipos, unos treinta y cinco ingenieros front-end, unas 280.000 líneas de TypeScript. `CODEOWNERS` asigna cada carpeta `libs/<domain>/` a su equipo, así que un pull request en mantenimiento pide revisión al equipo Workshop y a nadie más.

### 5.3. El workspace

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

Solo mantenimiento tiene doce librerías. Es normal: una `feature-*` por caso de uso, una `ui-*` por grupo cohesionado de componentes, una `data-access` y una `model` por dominio hasta que crecen demasiado (sección 16.3).

### 5.4. Un caso de uso a través de las capas

El resto de la guía sigue un caso de uso: **un planificador abre las órdenes de trabajo de un taller, las filtra y asigna un mecánico**. Toca cuatro librerías de mantenimiento y una de flota:

| Librería | Qué aporta |
|---|---|
| `maintenance/feature-work-orders` | La página: lee la fachada, pinta las tarjetas, reenvía los clics |
| `maintenance/ui-work-order-card` | La tarjeta y el filtro de estado, sin estado, sin HTTP |
| `maintenance/data-access` | Feature de NgRx, effects, cliente HTTP, fachada |
| `maintenance/model` | `WorkOrder`, `WorkOrderFilter`, `matchesFilter`, `isOverdue` |
| `fleet/api` | `VehicleSummaryStore`: matrícula y modelo para un id de vehículo |

## 6. Tipos de librería

Cada tipo responde a una pregunta. Si un archivo responde a dos, son dos archivos.

| Tipo | Pregunta a la que responde | Contiene | No debe contener |
|---|---|---|---|
| `feature` | ¿Qué hace este caso de uso? | Páginas con ruta, componentes smart, conexión de la fachada con la ui | Llamadas HTTP, componentes visuales reutilizables |
| `ui` | ¿Qué aspecto tiene? | Componentes de presentación, pipes, directivas | Stores inyectados, servicios con estado, HTTP |
| `data-access` | ¿De dónde vienen los datos y cómo cambian? | Store, effects, clientes de API, fachada, providers | Componentes |
| `model` | ¿Cuáles son los términos y las reglas del dominio? | Tipos, enums, funciones puras como `isOverdue` | Imports de framework de cualquier tipo |
| `util` | ¿Qué helpers técnicos necesita? | Formateo, parseo, algoritmos pequeños | Términos de dominio, estado de framework |
| `api` | ¿Qué pueden usar otros dominios? | Reexportaciones de un subconjunto elegido del dominio | Lógica propia |
| `shell` | ¿Cómo se monta este dominio? | Rutas, providers a nivel de ruta, guards | Lógica de negocio |

### 6.1. Quién puede importar a quién

| Desde ↓ puede importar → | shell | feature | ui | data-access | model | util | api de otro dominio |
|---|---|---|---|---|---|---|---|
| **app** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **shell** | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **feature** | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| **api** | – | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **ui** | – | – | ✓ | – | ✓ | ✓ | – |
| **data-access** | – | – | – | ✓ | ✓ | ✓ | – |
| **model** | – | – | – | – | ✓ | ✓ | – |
| **util** | – | – | – | – | – | ✓ | – |

Tres líneas de esta tabla aportan la mayor parte del valor:

- **feature → feature está prohibido.** Dos páginas que necesitan lo mismo lo comparten a través de `ui` o `data-access`. Las páginas las compone el shell o el router, no importándose entre sí.
- **ui → data-access está prohibido.** Un componente que inyecta un store no es de presentación. Por esta regla el tipo `WorkOrder` vive en `model`, no en `data-access`.
- **model no importa ningún framework.** `model` y `util` compilan igual en Angular, React, Vue y Node. En un workspace mixto son el código que se comparte (sección 8.3).

### 6.2. Qué tamaño tiene una librería

- **feature:** un caso de uso, normalmente una ruta y sus hijas. `feature-work-orders`, no `feature-maintenance`.
- **ui:** un grupo cohesionado que cambia a la vez. `ui-work-order-card` contiene la tarjeta, el chip de estado y el filtro de estado.
- **data-access:** una por dominio para empezar. Se divide por subdominio cuando contiene más de tres o cuatro features de store o cuando el equipo se divide (`data-access-planning`, `data-access-work-orders`).
- **model:** una por dominio. Es pequeña por naturaleza.
- Si una librería tiene un solo archivo, probablemente es demasiado pequeña; si su `index.ts` exporta más de unos treinta símbolos, probablemente es demasiado grande.

## 7. Dominios y fronteras

Un dominio es una carpeta con una puerta explícita. Dentro de la carpeta se aplican las reglas de tipos de la sección 6. Entre carpetas se aplica una sola regla: **puedes importar la librería `api` de otro dominio y nada más.**

### 7.1. La librería API

`fleet/api` decide qué ofrece flota al resto de la empresa. Todo lo que no aparece es privado del equipo Workshop y puede cambiar sin preguntar a nadie.

`libs/fleet/api/src/index.ts`

```ts
export type { VehicleSummary, VehicleId } from '@fleetline/fleet/model';
export { VehicleSummaryStore } from '@fleetline/fleet/data-access';
export { VehicleBadgeComponent } from '@fleetline/fleet/ui-vehicle-badge';
```

El store que exporta es un NgRx Signal Store, mientras que mantenimiento usa el NgRx Store clásico. Mantenimiento no necesita saberlo; solo ve `VehicleSummaryStore`.

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

### 7.2. Shared también es un dominio

`shared` tiene el tag `domain:shared` y solo puede importar `domain:shared`. No conoce ningún término de negocio. Una regla práctica para las revisiones: si un archivo de `shared` contiene una palabra de un dominio (orden de trabajo, factura, vehículo), se mueve a ese dominio.

### 7.3. Cuando dos dominios necesitan lo mismo

| Situación | Respuesta |
|---|---|
| Facturación muestra la matrícula de un vehículo | Facturación importa `fleet/api`. |
| Mantenimiento e inventario necesitan la lista de talleres | Los talleres son un concepto propio: un dominio pequeño `depots`, o `fleet` los exporta en su API. No `shared`. |
| Reservas necesita abrir una orden de trabajo tras una reserva | Reservas llama al back-end; el back-end crea la orden de trabajo. Los dominios front-end no orquestan las escrituras de otros dominios. |
| Dos dominios necesitan el mismo selector de fecha | Es algo técnico, no de negocio: `shared/ui-design-system`. |
| Dos librerías API quieren importarse mutuamente | Los dominios están mal cortados. Fusiónalos o mueve el concepto compartido a un tercer dominio. |

## 8. Hacer cumplir las reglas

Una regla que no se comprueba es una sugerencia. Nx la comprueba con tags y una regla de lint.

### 8.1. Tags

Cada `project.json` recibe un tag `domain:*` y un tag `type:*`, y en un workspace mixto un tag `framework:*`.

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

Los generadores ponen los tags al crear la librería:

```bash
nx g @nx/angular:library --directory=libs/maintenance/feature-planning-board \
  --tags=domain:maintenance,type:feature,framework:angular
nx g @nx/js:library --directory=libs/maintenance/model \
  --tags=domain:maintenance,type:model,framework:agnostic --bundler=none
```

### 8.2. La regla de lint

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

Cómo se combinan las dimensiones: un import debe cumplir **todas** las restricciones de todos los tags de la librería que importa. Una feature de mantenimiento puede importar `fleet/api` porque su regla de tipo permite `type:api` y su regla de dominio permite `type:api`. No puede importar `fleet/data-access`: la regla de tipo permitiría `data-access`, pero la regla de dominio no permite `domain:fleet`. Una librería `ui` de mantenimiento tampoco puede importar `fleet/api`: la regla de dominio lo permitiría, pero la regla de tipo no.

La misma regla rechaza también los imports relativos hacia otra librería, los imports de las partes internas de una librería en lugar de su `index.ts` y las dependencias circulares entre librerías.

### 8.3. La dimensión del framework

La aplicación `customer` de Fleetline podría pasar a Next.js y `backoffice` a Nuxt sin mover ni una sola librería `model` o `util`. Esas llevan el tag `framework:agnostic` y solo pueden importar otro código agnóstico, así que `matchesFilter` e `isOverdue` son la misma función en las tres apps. Una librería React que intenta importar una librería `ui` de Angular falla en el lint.

### 8.4. Sin Nx: Sheriff

No todos los equipos usan Nx. **Sheriff**, del mismo equipo de ANGULARarchitects, aplica las mismas reglas de tags dentro de un único proyecto TypeScript, por carpeta en lugar de por librería. Encaja en una aplicación Next.js o Nuxt que quiere las fronteras antes que un monorepo.

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

Como el grafo de dependencias es explícito, un cambio en `maintenance/ui-checklist` pasa lint, tests y build en las librerías y aplicaciones que dependen de ella, y en nada más. En Fleetline un pull request típico toca un dominio y ejecuta una quinta parte del workspace. Con caché remota, una librería sin cambios no se vuelve a compilar en ninguna máquina.

## 9. Estado con NgRx

`maintenance/data-access` contiene todo lo relativo a de dónde vienen las órdenes de trabajo y cómo cambian. Esta sección la muestra completa. Cada archivo tiene una sola tarea.

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

### 9.1. El modelo

El modelo no tiene framework y vive en su propia librería, para que puedan usarlo las librerías `ui`, los tests y las versiones de React y Vue.

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

### 9.2. Eventos

Las acciones se nombran según **lo que ha pasado** y se agrupan según **dónde ha pasado**. La página informa de eventos; no emite órdenes como `loadWorkOrders`.

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

### 9.3. La feature: estado, reducer, selectores

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

La asignación es **optimista**: el reducer aplica `assigneeChosen` de inmediato, y `assignFailed` devuelve el mecánico anterior. El valor anterior viaja en el evento, porque cuando se ejecuta el effect el estado ya contiene el nuevo.

### 9.4. HTTP y effects

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

`switchMap` para la carga (un taller más reciente cancela la petición anterior), `mergeMap` para las asignaciones (dos asignaciones en dos tarjetas deben terminar las dos).

### 9.5. Providers

La feature del store se registra en la ruta del dominio, no en la raíz de la aplicación. El store raíz queda vacío hasta que un planificador abre mantenimiento, y su código se carga en diferido con la ruta.

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

### 9.6. La API pública de data-access

`libs/maintenance/data-access/src/index.ts`

```ts
export { provideWorkOrders } from './lib/work-orders.providers';
export { WorkOrdersFacade } from './lib/work-orders.facade';
```

Dos exportaciones. Las acciones, el reducer, los selectores y el cliente HTTP son privados. Todas las features de mantenimiento pasan por la fachada, y el equipo Workshop puede reestructurar el store sin tocar ni un componente.

## 10. La fachada, y cuándo prescindir de ella

:::diagram fe-flow

Una fachada es un objeto fino entre las features y la gestión de estado. Expone **estado** (signals en Angular, valores en React, refs en Vue) e **intenciones** (métodos). No contiene lógica: cada método despacha exactamente un evento, y cada propiedad es exactamente un selector.

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

La fachada la proporciona `provideWorkOrders()`, no `root`, así que existe exactamente donde existe su feature del store.

### 10.1. Por qué una fachada

- **Estado sustituible.** El día en que las órdenes de trabajo pasan del NgRx Store a un Signal Store o a una caché de servidor, cambia la fachada y no cambia ningún componente. Fleetline hizo exactamente esto con `fleet` (sección 7.1).
- **Una superficie pequeña.** Una feature ve seis miembros en lugar de catorce acciones y nueve selectores.
- **Tests sencillos.** Un test de feature proporciona un objeto falso con la misma forma (sección 15).
- **La misma forma en cada framework.** La clase aquí, `useWorkOrders()` en React y Vue: el código de la feature se lee casi igual en los tres (sección 14).

### 10.2. Por qué la fachada es opcional

La comunidad de NgRx tiene un buen argumento contra las fachadas: las acciones deben describir eventos (*«mecánico elegido en la página de órdenes de trabajo»*), y una fachada con un método `assign()` invita a pensar en órdenes. Una fachada que despacha tres acciones seguidas, o que contiene lógica, oculta el registro de eventos que hace que NgRx sea depurable.

Por eso, en nuestra variante, la fachada es una regla con condiciones:

| Usa una fachada cuando | Prescinde de ella cuando |
|---|---|
| más de una feature usa el mismo estado | una feature es dueña de una feature de store pequeña |
| el estado puede cambiar de implementación (Store ↔ Signal Store ↔ caché de servidor) | el estado es local de un componente: usa un Signal Store o signals simples en el componente |
| los datos se ofrecen a otro dominio a través de `api` | el equipo prefiere despachar eventos directamente y el dominio es pequeño |
| la base de código se comparte con equipos de React o Vue | |

Dos reglas cuando sí la usas:

1. **Los nombres de los métodos conservan el evento.** `assign()` despacha `assigneeChosen` desde la fuente `Work Orders Page`. Si dos páginas pueden asignar, cada página tiene su propio evento; la fachada tiene dos métodos o un parámetro `source`, nunca un `update()` genérico.
2. **Sin lógica.** Ni `if`, ni bucles, ni llamadas a HTTP. Si hace falta una decisión, la decisión pertenece a un reducer, un selector o un effect.

Sin fachada, el `index.ts` de `data-access` exporta en su lugar los eventos de la página y los selectores, y el componente llama él mismo a `store.dispatch()` y `store.selectSignal()`. Las dos formas cumplen las reglas de fronteras; elige una por dominio y escríbela en el README del dominio.

## 11. Angular de principio a fin

Con `data-access` en su sitio, las librerías restantes son cortas.

### 11.1. La librería ui

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

La tarjeta conoce `WorkOrder` porque `model` está permitido. Recibe `vehicleLabel` como string, porque una librería `ui` de mantenimiento no puede importar `fleet/api`.

### 11.2. La librería feature

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

`depotId` llega desde el parámetro de ruta mediante `withComponentInputBinding()`. `ensureLoaded` es un `rxMethod` y acepta un signal, así que cada vez que cambia la lista visible, flota carga en una sola petición las matrículas que aún no tiene.

### 11.3. El shell

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

El shell importa `identity/api` para el guard de permisos. Los guards, como las matrículas de flota, son una necesidad entre dominios, así que un shell puede usar la API de otro dominio igual que una feature (sección 6.1). Todo lo demás que necesita el shell viene de su propio dominio.

### 11.4. La aplicación

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

Esa es toda la aplicación: dos archivos y un `environment`. `backoffice` monta el mismo `maintenance/feature-shell` con otro layout. Una tercera aplicación llevaría una tarde.

## 12. React y Next.js

La arquitectura no depende de Angular. Las librerías, los tipos, los dominios, los tags y la regla de lint siguen igual; Nx genera proyectos React y Next.js con `@nx/react` y `@nx/next`. Lo que cambia es cómo se implementa cada tipo de librería, y Next.js añade una dimensión nueva: el código que se ejecuta solo en el servidor.

### 12.1. Qué corresponde a qué

| Angular | React / Next.js |
|---|---|
| Componente `feature` | Un client component exportado desde `feature-*`; el `page.tsx` de la app solo lo renderiza |
| Componente `ui` con `input()`/`output()` | Un componente con props y callbacks |
| Rutas del `shell` | Las rutas de archivo se quedan en `apps/<app>/app/`; la librería shell exporta el layout y los providers del dominio |
| NgRx Store, `createFeature` | `createSlice` de Redux Toolkit |
| NgRx Entity | `createEntityAdapter` de Redux Toolkit |
| `createSelector` | `createSelector` (Reselect, parte de Redux Toolkit) |
| Effects | Listener middleware, o thunks en los casos sencillos |
| `provideState` en una ruta | `slice.injectInto(rootReducer)` (slices diferidos) |
| Signal Store | Zustand |
| Servicio fachada | Un hook: `useWorkOrders()` |
| `HttpClient` | `fetch` en una función de servidor o en un módulo de API del cliente |

### 12.2. Tags para servidor y cliente

En el App Router un archivo es o un server component o un client component. El código que lee secretos, cookies o la base de datos nunca debe acabar en el bundle del navegador. Fleetline añade una segunda librería data-access por dominio y un tag más:

| Librería | Tags | Contiene |
|---|---|---|
| `maintenance/data-access` | `type:data-access`, `platform:client` | Slice de Redux, listeners, API del cliente, hook fachada |
| `maintenance/data-access-server` | `type:data-access`, `platform:server` | Funciones fetch `server-only` y server actions |

La regla de lint de la sección 8.2 ya contiene la restricción `platform:client` → no `platform:server`. Además, cada archivo solo de servidor empieza con `import 'server-only'`, así que un error rompe el build incluso donde no se ejecuta el lint.

### 12.3. El store

Redux Toolkit puede inyectar slices en diferido, lo que cumple el papel de `provideState` en una ruta. El reducer raíz vive en `shared` y no conoce ningún dominio.

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

Se crea un store nuevo por petición en un provider de cliente, como recomienda la guía de Redux Toolkit para el App Router.

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

### 12.4. El slice

Los mismos eventos, la misma actualización optimista, las mismas funciones de `model` que en la sección 9.

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

### 12.5. Effects como listeners

Los listeners se añaden cuando el dominio se monta y se eliminan cuando se desmonta, el equivalente de `provideEffects` en una ruta. `cancelActiveListeners()` da la semántica de `switchMap`.

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

### 12.6. El hook fachada

El hook tiene los mismos miembros que la fachada de Angular. Además arranca los listeners e informa de la apertura de la página, así que a una feature le basta una línea para quedar conectada.

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

### 12.7. Feature, ui y ruta

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

El archivo de ruta de la aplicación sigue ocupando unas pocas líneas. La librería shell exporta el layout del dominio con la comprobación de permisos.

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

### 12.8. Estado de servidor: la misma fachada, otro motor

En Next.js, buena parte de lo que una SPA de Angular guarda en NgRx es **estado de servidor**: datos que posee el servidor y que el cliente guarda en caché. Para listas como las órdenes de trabajo, muchos equipos prefieren server components con una caché de consultas antes que Redux. La fachada convierte esto en una decisión privada de `data-access`.

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

El valor devuelto tiene los mismos miembros. `WorkOrdersPage` no cambia, salvo que recibe `initial`, que el `page.tsx` de servidor ha cargado con `listWorkOrders`. La regla de Fleetline: **el estado de servidor en una caché de consultas, el estado propio del cliente en Redux.** El tablero de planificación, donde los planificadores arrastran decenas de órdenes entre mecánicos y días antes de guardar, es estado propio del cliente y se queda en Redux; la lista de órdenes de trabajo es estado de servidor.

### 12.9. Trampas propias de Next.js

- **`'use client'` es una frontera en sí misma.** Ponlo en los archivos de feature y data-access que usan hooks, nunca en `model` ni en `util`.
- **No importes una librería de servidor en un archivo de cliente «solo por el tipo».** Los tipos viven en `model`.
- **Las server actions pertenecen a `data-access-server`.** Una feature las importa a través de reexportaciones de `data-access` solo si los tags de lint lo permiten; si no, la página las pasa como props.
- **Los archivos de ruta siguen siendo finos.** Un `page.tsx` al que le crece lógica es la versión Next.js de un componente de app de Angular demasiado gordo.

## 13. Vue y Nuxt

Vue encaja de forma aún más directa, porque los setup stores de Pinia se parecen mucho a un NgRx Signal Store, y los composables son la forma natural de una fachada. Nx construye proyectos Vue y Nuxt con `@nx/vue` y `@nx/nuxt`.

### 13.1. Qué corresponde a qué

| Angular | Vue / Nuxt |
|---|---|
| Componente `feature` | Un single-file component en `feature-*`; la página en `apps/<app>/app/pages/` solo lo renderiza |
| Componente `ui` | Un componente con `defineProps` y `defineEmits` |
| Rutas del `shell` | Las rutas de archivo se quedan en la app; la librería shell exporta layouts y route middleware |
| NgRx Store / Signal Store | Pinia (setup store) |
| Selectores | `computed` dentro del store |
| Effects | Acciones asíncronas en el store; `useAsyncData` para cargar durante el renderizado en servidor |
| Servicio fachada | Un composable: `useWorkOrders()` |
| `HttpClient` | `$fetch` |

Pinia no separa acciones y reducers. Eso elimina el registro de eventos y la depuración con viaje en el tiempo de NgRx, y también elimina la mayor parte de la ceremonia. Para la arquitectura no cambia nada: el store es privado de `data-access`, y el composable es la puerta.

### 13.2. Desactiva los auto-imports para las librerías

Nuxt importa componentes y composables automáticamente. Es cómodo en una app pequeña y fatal para las fronteras: **un import que nunca se escribe no se puede pasar por el lint.** Si una feature de facturación puede usar `useWorkOrders()` sin una línea `import`, la regla de lint nunca ve el cruce.

Reglas en las aplicaciones Nuxt de Fleetline:

- las librerías se importan con sentencias `import` explícitas a través de sus alias de ruta, nunca se registran como directorios de auto-import;
- los dominios no son layers de Nuxt, porque los layers auto-importan sus componentes y composables en la app;
- la app mantiene los auto-imports de las API de Vue y Nuxt solo en sus propios `pages/` y `layouts/`, y el código de las librerías importa las funciones de Nuxt desde `#imports`.

`apps/backoffice/nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
  components: { dirs: [] },
  imports: { scan: false },
  runtimeConfig: { public: { apiUrl: '' } },
});
```

### 13.3. El store

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

`byId`, `filter` y `error` se devuelven para que Pinia los serialice en el payload renderizado en servidor y el navegador empiece con el mismo estado.

### 13.4. El composable fachada

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

La clave es una función de `depotId`, así que al cambiar de taller se vuelve a cargar. En el servidor, `useAsyncData` espera a los datos; en el navegador, la página se hidrata desde el payload sin una segunda petición.

### 13.5. Feature, ui y página

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

### 13.6. Trampas propias de Nuxt

- **Pasar el lint por archivos `.vue`** requiere `vue-eslint-parser` en la configuración de ESLint; si no, la regla de fronteras se salta en silencio todos los componentes. Por eso el patrón `files` de la sección 8.2 incluye `**/*.vue`.
- **Un store por petición.** Pinia con `@pinia/nuxt` ya crea uno por petición en el servidor. Nunca guardes estado en un `ref` a nivel de módulo en una librería: en el servidor se compartiría entre usuarios.
- **`useAsyncData` va en la fachada**, no en el store. Así el store sigue siendo usable desde los tests y desde código solo de cliente.

## 14. Lado a lado

:::diagram fe-frameworks

El mismo caso de uso en tres frameworks, archivo por archivo:

| Librería | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| `model` | `work-order.ts` | el mismo archivo | el mismo archivo |
| Estado de `data-access` | `createFeature` + `createEntityAdapter` | `createSlice` + `createEntityAdapter` | Setup store de Pinia |
| Effects de `data-access` | `createEffect` funcional | listener middleware | acciones asíncronas del store + `useAsyncData` |
| Fachada de `data-access` | `WorkOrdersFacade` (signals) | `useWorkOrders()` (valores) | `useWorkOrders()` (refs) |
| `ui` | `input()` / `output()` | props / callbacks | `defineProps` / `defineEmits` |
| `feature` | componente standalone | client component | single-file component |
| `shell` | `Routes` con `providers` | componente layout, segmento de ruta | layout + route middleware |
| ruta de la app | `loadChildren` | `page.tsx` | `pages/*.vue` |
| fronteras | `@nx/enforce-module-boundaries` | la misma regla | la misma regla, con `vue-eslint-parser` |

Lo que sigue idéntico en los tres: la carpeta de cada archivo, los tags, la regla de lint, la librería `model`, los miembros de la fachada y los tests de la librería `model`. Lo único que tiene que volver a aprender quien cambia entre las apps de Fleetline es el propio framework.

## 15. Tests por tipo de librería

Cada tipo tiene una forma natural de test, y las fronteras hacen que cada una sea barata.

| Tipo | Test | Velocidad | Qué simula |
|---|---|---|---|
| `model`, `util` | Tests unitarios simples, sin framework | milisegundos | nada |
| Reducers y selectores de `data-access` | Tests de funciones puras | milisegundos | nada |
| Effects / listeners de `data-access` | Tests con un cliente HTTP falso | rápido | HTTP |
| fachada | Integración con el store real | rápido | HTTP |
| `ui` | Tests de componente, stories en Storybook | rápido | nada, solo tiene inputs |
| `feature` | Test de componente con una fachada falsa | rápido | la fachada |
| app | End-to-end con Playwright, unos pocos flujos | lento | el back-end, o nada |

Un test de reducer no necesita TestBed:

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

Un test de feature proporciona una fachada falsa, porque el componente no ve nada más:

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

Los builders de datos de test como `aWorkOrder` viven en un entry point secundario de `model` (`@fleetline/maintenance/model/testing`), así que los tests de todos los frameworks usan los mismos.

## 16. Crecer hasta llegar aquí y migrar

Nadie empieza con setenta librerías. Fleetline empezó como una aplicación Angular con una carpeta `src/app`; los pasos de abajo son el orden que funcionó.

### 16.1. La migración en ocho pasos

1. **Crea el workspace alrededor de la app.** `nx init` en el repositorio existente. Todavía no se mueve nada.
2. **Dibuja los dominios en papel.** Usa las palabras del negocio: ¿de qué hablan los planificadores, los clientes y finanzas? Cuenta con entre seis y diez dominios. Escríbelos en un README.
3. **Activa la regla como aviso.** Añade la configuración de lint de la sección 8.2 con `'warn'`. Cuenta los avisos; esa es tu línea base.
4. **Extrae primero `model` y `util`.** No tienen dependencias, así que moverlos es seguro, y todos los pasos posteriores los necesitan. Usa `nx g @nx/workspace:move`.
5. **Extrae la `ui` de cada dominio.** Se mueve cada componente que solo tiene inputs y outputs. Los componentes que inyectan un store se quedan por ahora.
6. **Separa la `data-access` de cada dominio.** Divide el store raíz por dominio; mueve cada feature del store, sus effects y su HTTP a la `data-access` del dominio y regístrala en la ruta del dominio.
7. **Mueve las páginas a `feature-*` y las rutas a `feature-shell`.** La app se reduce a sus rutas y providers.
8. **Cambia la regla a `'error'` y añade CODEOWNERS.** A partir de ahí, un cruce nuevo rompe CI.

Los pasos 4 a 7 se hacen dominio a dominio, y la aplicación sigue publicándose entre ellos. En Fleetline la migración completa llevó cuatro meses en paralelo con el trabajo de funcionalidades, un dominio cada vez, empezando por el más pequeño (`notifications`) para aprender los movimientos.

### 16.2. Lo que suele salir mal

- **Un dominio llamado `common` o `core`.** Se convierte en el nuevo `shared/`. Todo concepto tiene un dueño en el negocio; encuéntralo.
- **Dominios cortados por página en lugar de por lenguaje de negocio.** «Dashboard» no es un dominio; es una feature que lee de varios dominios a través de sus API.
- **Librerías API que lo reexportan todo.** Entonces la frontera es solo cosmética. Exporta lo que otro equipo usa de verdad, y nada más.
- **Líneas de lint desactivadas.** Un `eslint-disable` para la regla de fronteras se convierte en cuarenta en un año. Las excepciones van en la configuración, con un motivo en el pull request.

### 16.3. Cuándo dividir una librería

- Una `data-access` con más de tres o cuatro features de store, o con dos equipos como dueños: divídela por subdominio.
- Una librería `ui` que importa una sola feature: vuelve a fusionarla con esa feature o mantenla, pero no la muevas a `shared`.
- Una `feature` con varias rutas sin relación: una librería por caso de uso.
- Un dominio cuyas librerías son en su mayoría de otro equipo: el dominio está mal cortado, o lo están las fronteras entre equipos.

### 16.4. Cuándo es demasiado

Para una aplicación, un equipo y uno o dos dominios, la estructura completa cuesta más de lo que ahorra. Empieza en su lugar con carpetas dentro de un proyecto (`src/domains/<domain>/feature-…`, `ui-…`, `data-access`, `model`) y hazlas cumplir con Sheriff (sección 8.4). Pasar esas carpetas a librerías Nx más adelante es un paso mecánico, porque las reglas de dependencias ya se cumplen.

## 17. Preguntas

**¿Necesitamos NgRx para todo el estado?**
No. El estado compartido y de larga duración que leen varias features va a un store. El estado de los formularios, los paneles abiertos o cerrados y cualquier otro estado que pertenece a un componente se quedan en el componente, con signals o con un Signal Store a nivel de componente.

**¿NgRx Store o NgRx Signal Store?**
Los dos encajan en la arquitectura, los dos viven en `data-access`, y la fachada oculta la elección. Fleetline usa el Store donde compensan un registro de eventos y las devtools (mantenimiento, planificación) y el Signal Store en los dominios más sencillos (resúmenes de flota, notificaciones).

**¿No es una fachada solo una capa más?**
Lo es, y la sección 10 dice cuándo merece la pena. En React y Vue, el hook o el composable es de todos modos la forma idiomática de compartir el acceso al estado, así que ahí la fachada no cuesta casi nada.

**¿Debe tener cada dominio una librería `api` desde el primer día?**
No. Créala la primera vez que otro dominio necesite algo. Hasta entonces el dominio es completamente privado, que es la mejor frontera que existe.

**¿Esto son micro front-ends?**
No. Todo lo de aquí se compila en una aplicación por carpeta de app. El mismo corte por dominios es la costura natural para micro front-ends más adelante, si la organización llega a necesitar despliegues independientes.

**¿De verdad pueden compartir librerías React, Vue y Angular?**
Comparten las librerías `model` y `util`, con el tag `framework:agnostic`, y los builders de datos de test. Los componentes y los stores son de cada framework. En Fleetline, aproximadamente una quinta parte del código front-end es agnóstico al framework.

**¿Dónde podemos leer más?**
Los artículos de Manfred Steyer y el e-book gratuito *Enterprise Angular* en [angulararchitects.io](https://www.angulararchitects.io/), la [documentación de Nx](https://nx.dev/) sobre fronteras de módulos, [Sheriff](https://github.com/softarc-consulting/sheriff) y la [documentación de NgRx](https://ngrx.io/).
