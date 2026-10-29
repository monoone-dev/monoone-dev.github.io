Esta guía describe cómo estructuramos front-ends grandes: un workspace, muchas aplicaciones, muchos equipos y una regla para cada archivo. Lo construimos con **Nx** y **Angular**, guardamos el estado compartido en **NgRx** y ponemos una **fachada opcional** delante del store. Después mostramos la misma arquitectura, regla por regla, en **React con Next.js** y en **Vue con Nuxt**.

Los ejemplos están escritos para **Angular 22** con NgRx 22, **React 19** con Next.js 16, **TanStack Query** y **Zustand**, y **Vue 3.5** con Nuxt 4 y **Pinia 3**.

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

### 6.3. Estilos

Los estilos están sujetos a las mismas fronteras que TypeScript, pero la regla de fronteras no los ve: Nx construye el grafo de dependencias a partir de los imports de TypeScript y JavaScript, y pasa por alto los `@use` de SCSS. Por eso los estilos tienen sus propias cuatro reglas:

1. **Un componente solo tiene estilos para sí mismo, en un archivo junto a él.** Una librería nunca define una clase global, así que la `.card` de mantenimiento y la `.card` de facturación no pueden chocar.
2. **El design system se comunica mediante variables CSS.** Los tokens (colores, espaciados, radios, tipografía) son custom properties de `shared/ui-design-system`. Los componentes de dominio leen `var(--ds-…)` y no hacen `@use` de archivos SCSS de otras librerías.
3. **Solo la aplicación tiene estilos globales:** reset, fuentes y tokens, en un único lugar.
4. **Nadie estiliza el interior de un componente ajeno.** Un componente que deba poder adaptarse expone un input, una prop o una variable CSS.

| | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| Estilos del componente | `styleUrl` con la encapsulación emulada por defecto | CSS Modules: `*.module.scss` | `<style scoped lang="scss">` |
| Estilos globales | `apps/<app>/src/styles.scss` | import en el `app/layout.tsx` de la aplicación | `css` en `nuxt.config.ts` |
| Prohibido en librerías | `::ng-deep`, `ViewEncapsulation.None` | `:global(...)`, import de un `.css` normal | `:deep(...)`, `<style>` sin `scoped` |

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

En React las mismas reglas CSS van a `work-order-card.module.scss`, y en Vue al bloque `<style scoped>` del componente. Stylelint en CI rechaza los selectores de la última fila de la tabla (`selector-disallowed-list`). La regla 2 la comprueba un solo comando `grep` en CI: un `@use` en una librería de dominio solo puede apuntar a archivos de la misma librería, nunca al alias `@fleetline/`.

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

`@Service()` de Angular 22 es la forma corta de `@Injectable({ providedIn: 'root' })`; obtiene sus dependencias solo con `inject()`. `HttpClient` usa la Fetch API por defecto, así que la configuración no necesita `withFetch()`. `toErrorMessage` vive en `shared/util-http`, una librería sin framework que también usan las versiones de React y Vue.

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

`autoProvided: false` desactiva la provisión en `root`. La fachada la proporciona `provideWorkOrders()`, así que existe exactamente donde existe su feature del store.

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

El workspace de Angular con todos los archivos de este caso de uso. Cada librería tiene además su propio `project.json` y `tsconfig.json`; el árbol solo los muestra para la aplicación y para `data-access`.

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

### 11.1. La librería ui

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

La tarjeta conoce `WorkOrder` porque `model` está permitido. Recibe `vehicleLabel` como string, porque una librería `ui` de mantenimiento no puede importar `fleet/api`. En Angular 22 `OnPush` es la estrategia de detección de cambios por defecto, así que los componentes no la declaran; los estilos de la sección 6.3 llegan a través de `styleUrl`.

### 11.2. La librería feature

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
    provideStoreDevtools({ maxAge: 50 }),
    { provide: API_BASE_URL, useValue: environment.apiUrl },
  ],
};
```

Una aplicación nueva en Angular 22 funciona sin zone.js, y `HttpClient` usa la Fetch API, así que la configuración no necesita ni `provideZonelessChangeDetection()` ni `withFetch()`. Esa es toda la aplicación: dos archivos y un `environment`. `backoffice` monta el mismo `maintenance/feature-shell` con otro layout. Una tercera aplicación llevaría una tarde.

## 12. React y Next.js

La arquitectura no depende de Angular. Las librerías, los tipos, los dominios, los tags y la regla de lint siguen igual; Nx genera proyectos React y Next.js con `@nx/react` y `@nx/next`. Lo que cambia es cómo se implementa cada tipo de librería, y Next.js añade una dimensión nueva: el código que se ejecuta solo en el servidor.

Dividimos el estado en dos tipos. El **estado de servidor**, es decir, los datos cuyo dueño es el back-end (la lista de órdenes de trabajo), lo guarda **TanStack Query**. El **estado de cliente**, lo que solo existe en el navegador (los criterios del filtro, las selecciones, los borradores), lo guarda **Zustand**. Los dos son privados de `data-access`, y la feature solo ve la fachada.

El mismo workspace con una aplicación Next.js y todos los archivos de este caso de uso:

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

### 12.1. Qué corresponde a qué

| Angular | React / Next.js |
|---|---|
| Componente `feature` | Un contenedor de servidor que carga los datos y un client component que los muestra; los dos en `feature-*`, y el `page.tsx` solo renderiza el contenedor |
| Componente `ui` con `input()`/`output()` | Un componente con props y callbacks |
| Rutas del `shell` | Las rutas de archivo se quedan en `apps/<app>/app/`; la librería shell exporta el layout del dominio con los providers y la comprobación de permisos |
| `provideWorkOrders()` en una ruta | `<WorkOrdersProvider>` en el layout del shell |
| NgRx Store y effects para los datos del servidor | TanStack Query: `queryOptions`, `useQuery`, `useMutation` |
| Signal Store para el estado de cliente | Zustand: `createStore` desde una factoría, expuesto mediante Context |
| `createSelector` | Un selector en `useStore(store, selector)`; los valores derivados los calcula la fachada y React Compiler los memoiza |
| `switchMap` en un effect | La clave de la consulta y el `signal` en `queryFn` |
| Reducer optimista y `assignFailed` | `onMutate` y `onError` en `useMutation` |
| Servicio fachada | Un hook: `useWorkOrders()` |
| `@Service()` con `HttpClient` | Un módulo con funciones sobre `createApiClient` de `shared/util-http` |
| `inject()` | Context leído con `use()`, solo para lo que tiene un alcance |
| `provideStoreDevtools` | El middleware `devtools` de Zustand y React Query Devtools |

Redux Toolkit también encaja en esta arquitectura: un slice en lugar de una feature de NgRx, `createEntityAdapter`, listener middleware en lugar de effects. Fleetline eligió TanStack Query y Zustand porque en Next.js la mayor parte del estado es estado de servidor, y lo que queda en el cliente es pequeño (sección 17).

### 12.2. Tags para servidor y cliente

En el App Router un archivo es o un server component o un client component. El código que lee secretos, cookies o la base de datos nunca debe acabar en el bundle del navegador. Fleetline añade una segunda librería data-access por dominio y un tag más:

| Librería | Tags | Contiene |
|---|---|---|
| `maintenance/data-access` | `type:data-access`, `platform:client` | Cliente HTTP, consultas y mutaciones de TanStack Query, store de Zustand, provider, hook fachada |
| `maintenance/data-access-server` | `type:data-access`, `platform:server` | Funciones fetch `server-only` y server actions |

La regla de lint de la sección 8.2 ya contiene la restricción `platform:client` → no `platform:server`. Además, cada archivo solo de servidor empieza con `import 'server-only'`, así que un error rompe el build incluso donde no se ejecuta el lint. La librería `feature` no tiene tag `platform`: su contenedor de servidor importa `data-access-server`, y su client component solo `data-access`.

### 12.3. HTTP y el cliente de consultas

React no tiene DI, así que el servicio HTTP es un módulo normal. `createApiClient` de `shared/util-http` es una capa fina sobre `fetch`, sin framework: URL base, JSON y errores HTTP como excepciones. El módulo guarda solo configuración, nunca datos del usuario, así que puede vivir a nivel de módulo.

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

La caché de consultas, a diferencia de la configuración, sí guarda datos del usuario. Por eso el `QueryClient` se crea en un provider: uno por pestaña del navegador y otro distinto para cada petición en el servidor. El root layout de la aplicación monta `QueryProvider` una sola vez, igual que `provideHttpClient()` en el `app.config.ts` de Angular.

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

### 12.4. Consultas y mutaciones

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

La clave contiene `depotId`, y `queryFn` pasa el `signal` a `fetch`. Cambiar de taller abandona la consulta anterior y cancela su petición: es la semántica de `switchMap` de la sección 9.4. Dos componentes que leen la misma clave comparten una petición y una entrada de la caché. El archivo no lleva `'use client'` porque `workOrdersQuery` también lo importa el contenedor de servidor (sección 12.7).

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

La misma actualización optimista que en la sección 9.3: `onMutate` escribe al instante el nuevo mecánico, `onError` restaura la lista anterior y `onSettled` vuelve a traer el estado del servidor. Las mutaciones no se cancelan entre sí, así que dos asignaciones en dos tarjetas terminan las dos, como con `mergeMap`.

### 12.5. Estado de cliente con Zustand

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

Zustand guarda solo lo que pertenece al cliente: los criterios del filtro. La lista de órdenes vive en la caché de consultas y no se copia aquí, porque dos fuentes de verdad acaban divergiendo tarde o temprano. Las acciones se nombran como los eventos de la sección 9.2 (`filterChanged`, no `setFilter`), y el tercer argumento de `set` registra ese evento en Redux DevTools, así que el registro de eventos se conserva, aunque sin reducers.

El store se crea con la factoría `createStore`, no con `create()` a nivel de módulo. En Next.js un store global se compartiría en el servidor entre todas las peticiones, es decir, entre todos los usuarios. La factoría la llama el provider:

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

`WorkOrdersProvider` es el equivalente de `provideWorkOrders()`. Lo monta el layout del shell (sección 12.8), así que el store existe exactamente donde existen las rutas de mantenimiento. React 19 renderiza el contexto directamente como provider y lo lee con `use()`.

### 12.6. El hook fachada

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

El hook tiene los mismos miembros que la fachada de Angular, salvo `open()`: la clave de la consulta incluye `depotId`, así que no hace falta abrirla. La fachada no tiene efectos secundarios. No registra nada ni envía nada al montarse, así que puede usarla cualquier número de componentes, por ejemplo un contador de órdenes atrasadas en la cabecera, sin una segunda petición.

Cada campo del store tiene su propio selector. En Zustand 5, un selector que devuelve un objeto nuevo necesita `useShallow`; si no, el render entra en un bucle. `visible` y `overdueCount` se calculan en cada render; React Compiler los memoiza automáticamente, así que la fachada no necesita `useMemo` ni `useCallback`.

`libs/maintenance/data-access/src/index.ts`

```ts
export { workOrdersQuery } from './lib/work-orders.queries';
export { WorkOrdersProvider } from './lib/work-orders.provider';
export { useWorkOrders } from './lib/use-work-orders';
```

Tres exports. El store de Zustand, las mutaciones y el cliente HTTP son privados.

### 12.7. Feature, ui y ruta

La feature tiene dos contenedores. `WorkOrdersRoute` es un server component: carga las órdenes a través de `data-access-server`, con las cookies del usuario, y las pasa a la caché de consultas mediante `HydrationBoundary`. `WorkOrdersPage` es un client component: lee la fachada y compone las librerías `ui`.

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

El primer render en el navegador ya tiene los datos, sin una segunda petición y sin spinner; el `loading.tsx` de la aplicación solo se ve mientras dura la carga en el servidor.

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

`work-order-card.module.scss` es el archivo de la sección 6.3. CSS Modules convierte `.card` en un nombre único en toda la aplicación, así que una clase de una librería no se filtra a otra.

Los archivos de ruta de la aplicación ocupan unas pocas líneas cada uno.

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

### 12.8. El shell y la API de otro dominio

El layout del shell es un server component. Primero comprueba el permiso en el servidor y después monta los providers del dominio. En Angular lo hacen `canActivate` y `providers` en la ruta (sección 11.3).

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

En Next.js un layout no se desmonta al navegar entre páginas de mantenimiento, así que los stores sobreviven a la navegación dentro del dominio y desaparecen cuando el planificador sale de él.

`useVehicleSummaries` de `fleet/api` es el equivalente de `VehicleSummaryStore` de la sección 7.1, escrito con Zustand: mantenimiento pasa una lista de ids y flota carga en una sola petición las matrículas que faltan.

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

El effect depende de `key`, no del array, porque la feature crea un array nuevo en cada render.

`libs/fleet/api/src/index.ts`

```ts
export type { VehicleSummary, VehicleId } from '@fleetline/fleet/model';
export { VehicleSummaryProvider, useVehicleSummaries } from '@fleetline/fleet/data-access';
export { VehicleBadge } from '@fleetline/fleet/ui-vehicle-badge';
```

### 12.9. Trampas propias de Next.js

- **`'use client'` es una frontera en sí misma.** Ponlo en client components, providers y hooks, nunca en `model`, en `util` ni en el archivo con `queryOptions` que también importa el servidor.
- **Ningún store en una variable de módulo.** `create()` de Zustand o `new QueryClient()` a nivel de módulo comparte el estado entre todas las peticiones en el servidor. Los stores y el cliente de consultas se crean en providers.
- **Zustand no copia los datos del servidor.** La lista de la API vive en la caché de consultas; una copia en el store es una segunda fuente de verdad.
- **No importes una librería de servidor en un archivo de cliente «solo por el tipo».** Los tipos viven en `model`.
- **Las server actions pertenecen a `data-access-server`.** Una feature las importa a través de reexportaciones de `data-access` solo si los tags de lint lo permiten; si no, la página las pasa como props.
- **Los archivos de ruta siguen siendo finos.** Un `page.tsx` al que le crece lógica es la versión Next.js de un componente de app de Angular demasiado gordo.

## 13. Vue y Nuxt

Vue encaja de forma aún más directa, porque los setup stores de Pinia se parecen mucho a un NgRx Signal Store, y los composables son la forma natural de una fachada. Nx construye proyectos Vue y Nuxt con `@nx/vue` y `@nx/nuxt`.

El mismo workspace con una aplicación Nuxt y todos los archivos de este caso de uso:

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

### 13.1. Qué corresponde a qué

| Angular | Vue / Nuxt |
|---|---|
| Componente `feature` | Un single-file component en `feature-*`; la página en `apps/<app>/app/pages/` solo lo renderiza |
| Componente `ui` | Un componente con `defineProps` y `defineEmits`, estilos en `<style scoped>` |
| Rutas del `shell` | Las rutas de archivo se quedan en la app; la librería shell exporta el layout y el route middleware, y la app solo los reexporta |
| `provideWorkOrders()` en una ruta | `provideWorkOrders()` llamado en el layout del shell |
| NgRx Store / Signal Store | Pinia (setup store) |
| Selectores | `computed` dentro del store |
| Effects | Acciones asíncronas en el store; `useAsyncData` para cargar durante el renderizado en servidor |
| `switchMap` en un effect | `AbortController` en una acción del store |
| Servicio fachada | Un composable: `useWorkOrders()` |
| `@Service()` con `HttpClient` | El composable `useWorkOrdersHttp()` con `$fetch.create` y `useRuntimeConfig()` |
| `provideStoreDevtools` | Vue DevTools con la pestaña de Pinia |

Pinia no separa acciones y reducers. Eso elimina el registro de eventos y la depuración con viaje en el tiempo de NgRx, y también elimina la mayor parte de la ceremonia. Para la arquitectura no cambia nada: el store es privado de `data-access`, y el composable es la puerta.

### 13.2. Desactiva los auto-imports para las librerías

Nuxt importa componentes y composables automáticamente. Es cómodo en una app pequeña y fatal para las fronteras: **un import que nunca se escribe no se puede pasar por el lint.** Si una feature de facturación puede usar `useWorkOrders()` sin una línea `import`, la regla de lint nunca ve el cruce.

Reglas en las aplicaciones Nuxt de Fleetline:

- las librerías se importan con sentencias `import` explícitas a través de sus alias de ruta, nunca se registran como directorios de auto-import;
- los dominios no son layers de Nuxt, porque los layers auto-importan sus componentes y composables en la app;
- la app mantiene los auto-imports de las API de Vue y Nuxt solo en sus propios `pages/` y `layouts/`, y el código de las librerías importa las funciones de Nuxt desde `#imports`;
- los layouts y middleware a los que una página se refiere por nombre en `definePageMeta` son en la app reexportaciones de una línea desde `feature-shell` (sección 13.5), porque el lint no puede comprobar un nombre dentro de un string.

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

### 13.3. El store

El servicio HTTP es un composable. Toma la configuración del `runtimeConfig` de la aplicación, es decir, de la DI de Nuxt, igual que `WorkOrdersHttp` en Angular toma `API_BASE_URL` con `inject()`.

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

`open` cancela la petición anterior antes de enviar la nueva: es el `switchMap` de la sección 9.4 escrito a mano. Sin esto, un cambio rápido de taller permitiría que una respuesta antigua sobrescribiera otra más reciente. `assign` no cancela nada, como `mergeMap`, y si falla restaura la orden guardada. El store captura los errores y los guarda en `error`, como el reducer de la sección 9.3.

`byId`, `filter` y `error` se devuelven para que Pinia los serialice en el payload renderizado en servidor y el navegador empiece con el mismo estado. `inflight` no se devuelve, así que sigue siendo privado de la instancia del store. Un setup store no recibe `$reset` gratis, así que lo define él mismo.

### 13.4. El composable fachada y el alcance del store

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

Pinia mantiene un store por aplicación, y en el servidor uno por petición. Sin un paso adicional, el estado de mantenimiento seguiría en memoria después de salir del dominio. `provideWorkOrders()` da el mismo alcance que un provider en una ruta de Angular:

`libs/maintenance/data-access/src/lib/work-orders.providers.ts`

```ts
import { onUnmounted } from 'vue';
import { useWorkOrdersStore } from './work-orders.store';

export function provideWorkOrders() {
  const store = useWorkOrdersStore();
  onUnmounted(() => store.$reset());
}
```

`onUnmounted` no se ejecuta en el servidor, así que el estado llega al payload antes de la hidratación, y en el navegador desaparece cuando el planificador sale de mantenimiento.

`libs/maintenance/data-access/src/index.ts`

```ts
export { provideWorkOrders } from './lib/work-orders.providers';
export { useWorkOrders } from './lib/use-work-orders';
```

Un equipo que prefiera separar el estado de servidor y el estado de cliente como en React recurre a **Pinia Colada**, la capa oficial de consultas para Pinia: el equivalente de TanStack Query, con claves, caché y mutaciones optimistas. La fachada y la feature no cambian.

### 13.5. Feature, ui, shell y página

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

Vue 3.5 mantiene la reactividad de las props tras la desestructuración, así que `() => depotId` sigue el cambio de ruta.

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

El shell exporta un layout que llama a `provideWorkOrders()` y un middleware con la comprobación de permisos:

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

La app solo los reexporta, así que el lint ve el import desde `feature-shell`:

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

En Vue, `useVehicleSummaries` de `fleet/api` es un pequeño store de Pinia con una acción `ensureLoaded`, igual que en la sección 12.8, y un composable que la llama:

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

### 13.6. Trampas propias de Nuxt

- **Pasar el lint por archivos `.vue`** requiere `vue-eslint-parser` en la configuración de ESLint; si no, la regla de fronteras se salta en silencio todos los componentes. Por eso el patrón `files` de la sección 8.2 incluye `**/*.vue`.
- **Un store por petición.** Pinia con `@pinia/nuxt` ya crea uno por petición en el servidor. Nunca guardes estado en un `ref` a nivel de módulo en una librería: en el servidor se compartiría entre usuarios.
- **`useAsyncData` va en la fachada**, no en el store. Así el store sigue siendo usable desde los tests y desde código solo de cliente.
- **Un `await` en el nivel superior de `<script setup>`** requiere un `<Suspense>` por encima del componente. Las páginas de Nuxt lo tienen; un componente de feature que se renderiza en otro sitio hay que envolverlo en uno.
- **Solo estilos `scoped`.** Un bloque `<style>` sin `scoped` en una librería acaba en el CSS global de toda la aplicación.

## 14. Lado a lado

:::diagram fe-frameworks

El mismo caso de uso en tres frameworks, archivo por archivo:

| Librería | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| `model` | `work-order.ts` | el mismo archivo | el mismo archivo |
| Estado de `data-access` | `createFeature` + `createEntityAdapter` | TanStack Query (servidor) + Zustand (cliente) | Setup store de Pinia |
| Effects de `data-access` | `createEffect` funcional | `queryFn` y `useMutation` | acciones asíncronas del store + `useAsyncData` |
| Concurrencia | `switchMap` / `mergeMap` | clave de consulta + `signal` | `AbortController` |
| Servicio HTTP | `@Service()` + `HttpClient` | módulo sobre `createApiClient` | composable con `$fetch.create` |
| Fachada de `data-access` | `WorkOrdersFacade` (signals) | `useWorkOrders()` (valores) | `useWorkOrders()` (refs) |
| Alcance del estado | `provideWorkOrders()` en la ruta | `<WorkOrdersProvider>` en el layout del shell | `provideWorkOrders()` en el layout del shell |
| `ui` | `input()` / `output()` | props / callbacks | `defineProps` / `defineEmits` |
| Estilos de `ui` | `styleUrl`, encapsulación emulada | CSS Modules | `<style scoped>` |
| `feature` | componente standalone, `OnPush` por defecto | contenedor de servidor + client component | single-file component |
| `shell` | `Routes` con `providers` y `canActivate` | layout de servidor con providers | layout + route middleware |
| ruta de la app | `loadChildren` | `page.tsx` | `pages/*.vue` |
| Fachada falsa en el test | provider en `TestBed` | `vi.mock` del módulo | `vi.mock` del módulo |
| fronteras | `@nx/enforce-module-boundaries` | la misma regla | la misma regla, con `vue-eslint-parser` |

Lo que sigue idéntico en los tres: la carpeta de cada archivo, los tags, la regla de lint, la librería `model`, los miembros de la fachada (en React sin `open()`, porque la consulta se abre sola), los estilos de los componentes y los tests de la librería `model`. Lo único que tiene que volver a aprender quien cambia entre las apps de Fleetline es el propio framework.

## 15. Tests por tipo de librería

Cada tipo tiene una forma natural de test, y las fronteras hacen que cada una sea barata.

| Tipo | Test | Velocidad | Qué simula |
|---|---|---|---|
| `model`, `util` | Tests unitarios simples, sin framework | milisegundos | nada |
| Reducers y selectores de `data-access` | Tests de funciones puras | milisegundos | nada |
| Effects, consultas y mutaciones de `data-access` | Tests con la red simulada por MSW | rápido | HTTP |
| fachada | Integración con el store real | rápido | HTTP (MSW) |
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

En React y Vue la fachada no llega por DI, así que el test de la feature sustituye el módulo. El principio es el mismo: el componente no ve nada más que la fachada y las librerías `ui`.

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

En Vue el mismo test se escribe con `@vue/test-utils` y el mismo `vi.mock`, y un componente con `await` en `<script setup>` se monta con `mountSuspended` de `@nuxt/test-utils`. En los tests de integración de la fachada, los stores de Pinia los sustituye `createTestingPinia` de `@pinia/testing`, y la red, en los tres frameworks, la sustituye MSW, así que los tests de `data-access` no dependen de cómo obtiene su configuración el servicio HTTP.

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
Los dos encajan en la arquitectura, los dos viven en `data-access`, y la fachada oculta la elección. Fleetline usa el Store donde compensan un registro de eventos y las devtools (mantenimiento, planificación) y el Signal Store en los dominios más sencillos (resúmenes de flota, notificaciones). El plugin de eventos del Signal Store (`@ngrx/signals/events`) le aporta eventos al estilo Flux, así que el registro de eventos deja de ser el único argumento a favor del Store clásico.

**¿Y el estado de servidor en Angular?**
En Angular 22, `resource`, `rxResource` y `httpResource` son estables, y cuando dos peticiones se solapan solo cuenta la más reciente, como con `switchMap`. Para datos que sobre todo se leen, son el equivalente en Angular de TanStack Query y Pinia Colada: `data-access` guarda el `httpResource`, y la fachada expone su `value()` y su `isLoading()`. La feature no cambia.

**¿Por qué Zustand y TanStack Query en React, y no Redux Toolkit?**
Las dos variantes cumplen las mismas reglas de fronteras y las dos se esconden detrás de la misma fachada. Redux Toolkit ofrece lo mismo que NgRx Store: slices, `createEntityAdapter`, listener middleware y un registro de eventos completo. Pero en Next.js la mayor parte del estado es estado de servidor, y lo que queda en el cliente es pequeño, así que Fleetline guarda los datos en la caché de consultas y el resto en pequeños stores de Zustand con acciones con nombre en las devtools. Un equipo que necesite un registro de eventos en un dominio de cliente grande puede usar Redux Toolkit ahí.

**¿No es una fachada solo una capa más?**
Lo es, y la sección 10 dice cuándo merece la pena. En React y Vue, el hook o el composable es de todos modos la forma idiomática de compartir el acceso al estado, así que ahí la fachada no cuesta casi nada.

**¿Debe tener cada dominio una librería `api` desde el primer día?**
No. Créala la primera vez que otro dominio necesite algo. Hasta entonces el dominio es completamente privado, que es la mejor frontera que existe.

**¿Esto son micro front-ends?**
No. Todo lo de aquí se compila en una aplicación por carpeta de app. El mismo corte por dominios es la costura natural para micro front-ends más adelante, si la organización llega a necesitar despliegues independientes.

**¿De verdad pueden compartir librerías React, Vue y Angular?**
Comparten las librerías `model` y `util`, con el tag `framework:agnostic`, y los builders de datos de test. Los componentes y los stores son de cada framework. En Fleetline, aproximadamente una quinta parte del código front-end es agnóstico al framework.

**¿Dónde podemos leer más?**
Los artículos de Manfred Steyer y el e-book gratuito *Enterprise Angular* en [angulararchitects.io](https://www.angulararchitects.io/), la [documentación de Nx](https://nx.dev/) sobre fronteras de módulos, [Sheriff](https://github.com/softarc-consulting/sheriff), la [documentación de NgRx](https://ngrx.io/), [TanStack Query](https://tanstack.com/query), [Zustand](https://zustand.docs.pmnd.rs/) y [Pinia](https://pinia.vuejs.org/).
