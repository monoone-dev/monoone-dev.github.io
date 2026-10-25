Este guia descreve como estruturamos front-ends grandes: um workspace, muitas aplicações, muitas equipes e uma regra para cada arquivo. Nós o construímos com **Nx** e **Angular**, mantemos o estado compartilhado no **NgRx** e colocamos uma **facade opcional** na frente do store. Depois mostramos a mesma arquitetura, regra por regra, em **React com Next.js** e em **Vue com Nuxt**.

A arquitetura não é nossa. Seu núcleo foi elaborado e publicado por **Manfred Steyer**, instrutor e consultor de Angular, Google Developer Expert em Angular e a pessoa por trás da [ANGULARarchitects](https://www.angulararchitects.io/). A ideia dele é cortar um front-end **verticalmente por domínio** e **horizontalmente por tipo de biblioteca**, deixar que os domínios conversem apenas por uma API explícita e deixar que uma ferramenta, e não uma wiki, garanta essas linhas. A seção 2 lista exatamente o que vem dele, o que vem do Nx e o que nós acrescentamos.

Um exemplo pequeno não consegue mostrar por que nada disso importa. Um domínio com um store cabe na cabeça de qualquer pessoa. Por isso todos os exemplos desta página vêm de um único workspace realista: **Fleetline**, uma plataforma de manutenção de frotas com três aplicações, nove domínios, cerca de setenta bibliotecas e cinco equipes. Ela é apresentada na seção 5 e usada em todas as seções seguintes.

> Escrito para equipes que já têm, ou logo terão, mais de uma aplicação front-end, mais de uma equipe ou mais de cerca de 50.000 linhas de código front-end. Abaixo desse tamanho, leia primeiro a seção 16.4.

## 1. Por que front-ends precisam de uma arquitetura

Um front-end cresce sempre do mesmo jeito. No primeiro ano há uma aplicação e uma pasta `src/app` com `components`, `services` e `store`. No terceiro ano, o mesmo projeto costuma ficar assim:

- `shared/` guarda trezentos arquivos, e metade deles é usada por exatamente uma funcionalidade;
- um componente de faturamento importa um seletor de manutenção porque ele estava ali;
- o store raiz tem quarenta chaves de feature, e ninguém sabe de quais uma página precisa;
- uma segunda aplicação é criada copiando a primeira, porque extrair código é difícil demais;
- uma mudança em um helper de datas recompila e testa de novo o repositório inteiro;
- uma pessoa nova na equipe, ou um agente de código, precisa de dias para descobrir onde uma funcionalidade mora e o que ela pode usar.

Nada disso é culpa de engenheiros ruins. É consequência da falta de uma resposta compartilhada para duas perguntas: **onde fica este arquivo** e **quem pode importar quem**. Sem resposta, vence a pasta mais próxima, e a pasta mais próxima é sempre `shared/`.

A arquitetura deste guia responde às duas perguntas uma vez, para todo tipo de código front-end, e torna a resposta **mecânica**: uma regra de lint recusa um import que cruza uma linha, no editor e no CI.

### 1.1. Objetivos

1. **Localização fácil.** Saber o nome de uma funcionalidade diz em que pasta ela está, em todas as aplicações.
2. **Mudanças locais.** Uma mudança dentro de um domínio não consegue quebrar outro domínio, porque o outro domínio não enxerga seus detalhes internos.
3. **Feedback rápido em escala.** O CI compila e testa apenas as bibliotecas afetadas por uma mudança.
4. **Equipes em paralelo.** Uma equipe é dona de domínios, e não de arquivos espalhados por `shared/`.
5. **Estado substituível.** Uma funcionalidade não sabe se seus dados vêm do NgRx, de um Signal Store, de um cache ou do servidor.
6. **Um único conjunto de regras para três frameworks.** Aplicações Angular, React e Vue da mesma empresa seguem a mesma estrutura, e o código sem framework é compartilhado entre elas.

### 1.2. Não objetivos

- Ela não escolhe o seu back-end, o seu design system nem o seu CSS.
- Ela não exige micro front-ends. Tudo aqui funciona em uma única aplicação implantável; micro front-ends são uma decisão posterior e separada.
- Ela não substitui as regras do seu produto. Ela diz onde o código mora e o que ele pode usar; o seu projeto diz o que o código precisa fazer.

## 2. De onde vem a ideia

A arquitetura combina três fontes. Nós as citamos porque vale a pena ler cada uma no original.

| Fonte | O que ela traz |
|---|---|
| **Nx** (a equipe da Nrwl, *Enterprise Angular Monorepo Patterns*) | O próprio monorepo, bibliotecas com um `index.ts` público e os tipos clássicos de biblioteca: `feature`, `ui`, `data-access`, `util`. Tags nos projetos e a regra de lint `@nx/enforce-module-boundaries`. |
| **Manfred Steyer** (ANGULARarchitects, o e-book *Enterprise Angular*, seus artigos sobre design estratégico com Nx) | A aplicação de Domain-Driven Design a front-ends: **domínios como fatias verticais**, **tipos de biblioteca como camadas horizontais**, duas dimensões de tags (`domain:*` e `type:*`) verificadas por um linter, uma **biblioteca de API** como única porta entre domínios e uma **facade** entre a UI e o gerenciamento de estado. Mais tarde também o **Sheriff**, um verificador de fronteiras para projetos sem Nx. |
| **NgRx** (e o Redux antes dele) | Um store para o estado compartilhado, mudanças por meio de actions e reducers puros, efeitos colaterais em effects, leituras por meio de seletores memoizados. |

O que nós decidimos por cima disso, neste guia:

- um tipo `model` separado para tipos sem framework e funções de domínio puras, para que as bibliotecas `ui` nunca dependam do gerenciamento de estado;
- um tipo `shell` próprio (o `feature-shell` do Nx), que é dono das rotas e dos providers de um domínio;
- uma terceira dimensão de tags, `framework:*`, para que aplicações Angular, React e Vue possam viver em um único workspace e compartilhar código de `model` e `util`;
- uma quarta dimensão para Next.js, `platform:server` e `platform:client`;
- a regra da seção 10 sobre quando uma facade compensa e quando dispensá-la;
- as traduções para React/Next e Vue/Nuxt nas seções 12 e 13.

Quando algo nesta página discorda dos artigos originais, o original é a referência para a ideia; esta página é a referência para a forma como nós a aplicamos.

## 3. A arquitetura em uma página

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

Seis frases para lembrar:

1. **Toda biblioteca tem um domínio e um tipo**, escritos como tags, e as tags decidem o que ela pode importar.
2. **Os imports descem a escada de tipos**: feature → ui, data-access → model → util. Nunca para cima, nunca para os lados entre features.
3. **Um domínio enxerga outro domínio apenas pela biblioteca `api` dele.** Todo o resto de um domínio é privado.
4. **`shared` não conhece nenhum domínio.** Se um arquivo "compartilhado" menciona ordens de serviço, ele pertence a manutenção.
5. **Componentes nunca falam com HTTP.** Os dados passam por `data-access`; a feature vê uma facade ou seletores, nunca uma URL.
6. **As aplicações são finas.** Uma aplicação liga rotas e providers; as features moram em bibliotecas, então uma segunda aplicação não custa nada.

## 4. Vocabulário

| Termo | Significado |
|---|---|
| **Workspace** | Um repositório Nx com todas as aplicações e bibliotecas. |
| **Aplicação** | Um front-end implantável em `apps/`. Quase não contém código. |
| **Biblioteca** | Uma pasta em `libs/` com seu próprio `project.json`, tags e um `index.ts` público. É importada apenas pelo seu alias de caminho, por exemplo `@fleetline/maintenance/data-access`. |
| **Domínio** | Uma parte do negócio com linguagem e dados próprios: manutenção, frota, faturamento. Também chamado de bounded context. Uma pasta em `libs/`. |
| **Tipo** | O papel técnico de uma biblioteca: `feature`, `ui`, `data-access`, `model`, `util`, `api`, `shell`. |
| **API pública** | O `index.ts` de uma biblioteca. O que ele não exporta não existe para outras bibliotecas. |
| **Facade** | Uma pequena classe, hook ou composable que uma feature usa no lugar do store: estado como signals ou refs, intenções como métodos. |
| **Regra de fronteira** | Uma regra de lint que lê as tags de duas bibliotecas e reprova um import que as tags não permitem. |

## 5. O exemplo: Fleetline

A Fleetline cuida da manutenção para empresas que operam caminhões, vans e ônibus. Mecânicos trabalham em oficinas; planejadores distribuem o trabalho; clientes agendam serviços e pagam faturas; financeiro e suporte cuidam do back office.

### 5.1. Aplicações

| Aplicação | Usuários | Framework neste guia |
|---|---|---|
| `ops-portal` | Planejadores e mecânicos nas oficinas | Angular |
| `customer` | Clientes de frota: agendamentos, veículos, faturas | Angular (Next.js na seção 12) |
| `backoffice` | Financeiro, suporte, administradores | Angular (Nuxt na seção 13) |

### 5.2. Domínios e equipes

| Domínio | É dono de | Equipe | Usado pelas aplicações |
|---|---|---|---|
| `maintenance` | Ordens de serviço, checklists, quadro de planejamento, SLAs | Workshop | ops-portal, backoffice |
| `fleet` | Veículos, hodômetro, histórico de serviços | Workshop | as três |
| `inventory` | Peças, estoque por oficina, reservas | Supply | ops-portal, backoffice |
| `booking` | Horários de serviço, fluxo de agendamento, reagendamento | Customer | customer, ops-portal |
| `billing` | Orçamentos, faturas, pagamentos | Finance | customer, backoffice |
| `customers` | Contas, contratos, contatos | Customer | customer, backoffice |
| `identity` | Login, papéis, permissões | Platform | as três |
| `notifications` | Caixa de entrada no app, preferências de e-mail | Platform | as três |
| `shared` | Design system, layout, configuração de HTTP, datas, valores monetários, testes | Platform | as três |

Cinco equipes, cerca de trinta e cinco engenheiros front-end, cerca de 280.000 linhas de TypeScript. O `CODEOWNERS` associa cada pasta `libs/<domain>/` à sua equipe, então um pull request em maintenance pede revisão à equipe Workshop e a mais ninguém.

### 5.3. O workspace

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

Só maintenance tem doze bibliotecas. Isso é normal: um `feature-*` por caso de uso, um `ui-*` por grupo coeso de componentes, um `data-access` e um `model` por domínio, até que fiquem grandes demais (seção 16.3).

### 5.4. Um caso de uso pelas camadas

O restante do guia acompanha um único caso de uso: **um planejador abre as ordens de serviço de uma oficina, filtra a lista e atribui um mecânico**. Ele passa por quatro bibliotecas de maintenance e uma de fleet:

| Biblioteca | O que ela traz |
|---|---|
| `maintenance/feature-work-orders` | A página: lê a facade, renderiza os cards, repassa os cliques |
| `maintenance/ui-work-order-card` | O card e o filtro de status, sem estado, sem HTTP |
| `maintenance/data-access` | Feature do NgRx, effects, cliente HTTP, facade |
| `maintenance/model` | `WorkOrder`, `WorkOrderFilter`, `matchesFilter`, `isOverdue` |
| `fleet/api` | `VehicleSummaryStore`: placa e modelo para um id de veículo |

## 6. Tipos de biblioteca

Cada tipo responde a uma pergunta. Se um arquivo responde a duas, são dois arquivos.

| Tipo | Pergunta que responde | Contém | Não pode conter |
|---|---|---|---|
| `feature` | O que este caso de uso faz? | Páginas roteadas, componentes smart, ligação da facade com a ui | Chamadas HTTP, componentes visuais reutilizáveis |
| `ui` | Qual é a aparência? | Componentes de apresentação, pipes, diretivas | Stores injetados, serviços com estado, HTTP |
| `data-access` | De onde vêm os dados e como eles mudam? | Store, effects, clientes de API, facade, providers | Componentes |
| `model` | Quais são os termos e as regras do domínio? | Tipos, enums, funções puras como `isOverdue` | Imports de framework de qualquer tipo |
| `util` | De quais helpers técnicos isto precisa? | Formatação, parsing, algoritmos pequenos | Termos de domínio, estado de framework |
| `api` | O que outros domínios podem usar? | Reexportações de um subconjunto escolhido do domínio | Lógica própria |
| `shell` | Como este domínio é montado? | Rotas, providers no nível da rota, guards | Lógica de negócio |

### 6.1. Quem pode importar quem

| De ↓ pode importar → | shell | feature | ui | data-access | model | util | api de outro domínio |
|---|---|---|---|---|---|---|---|
| **app** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **shell** | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **feature** | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| **api** | – | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **ui** | – | – | ✓ | – | ✓ | ✓ | – |
| **data-access** | – | – | – | ✓ | ✓ | ✓ | – |
| **model** | – | – | – | – | ✓ | ✓ | – |
| **util** | – | – | – | – | – | ✓ | – |

Três linhas desta tabela concentram a maior parte do valor:

- **feature → feature é proibido.** Duas páginas que precisam da mesma coisa a compartilham por meio de `ui` ou `data-access`. Páginas são compostas pelo shell ou pelo roteador, e não importando uma à outra.
- **ui → data-access é proibido.** Um componente que injeta um store não é de apresentação. Por causa dessa regra, o tipo `WorkOrder` mora em `model`, e não em `data-access`.
- **model não importa nenhum framework.** `model` e `util` compilam igualmente em Angular, React, Vue e Node. Em um workspace misto, eles são o código que você compartilha (seção 8.3).

### 6.2. Qual o tamanho de uma biblioteca

- **feature:** um caso de uso, normalmente uma rota e suas filhas. `feature-work-orders`, e não `feature-maintenance`.
- **ui:** um grupo coeso que muda junto. `ui-work-order-card` contém o card, o chip de status e o filtro de status.
- **data-access:** um por domínio, para começar. Divida por subdomínio quando ele tiver mais de três ou quatro features de store ou quando a equipe se dividir (`data-access-planning`, `data-access-work-orders`).
- **model:** um por domínio. Ele é pequeno por natureza.
- Se uma biblioteca tem um único arquivo, provavelmente é pequena demais; se o seu `index.ts` exporta mais de uns trinta símbolos, provavelmente é grande demais.

## 7. Domínios e fronteiras

Um domínio é uma pasta com uma porta explícita. Dentro da pasta valem as regras de tipo da seção 6. Entre pastas vale uma única regra: **você pode importar a biblioteca `api` de outro domínio, e nada mais.**

### 7.1. A biblioteca de API

`fleet/api` decide o que fleet oferece ao resto da empresa. Tudo o que não está listado é privado da equipe Workshop e pode mudar sem perguntar a ninguém.

`libs/fleet/api/src/index.ts`

```ts
export type { VehicleSummary, VehicleId } from '@fleetline/fleet/model';
export { VehicleSummaryStore } from '@fleetline/fleet/data-access';
export { VehicleBadgeComponent } from '@fleetline/fleet/ui-vehicle-badge';
```

O store que ela exporta é um NgRx Signal Store, enquanto maintenance usa o NgRx Store clássico. Maintenance não precisa saber disso; ela só vê `VehicleSummaryStore`.

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

### 7.2. Shared também é um domínio

`shared` tem a tag `domain:shared` e só pode importar `domain:shared`. Ele não conhece nenhum termo de negócio. Uma regra prática para revisões: se um arquivo em `shared` contém uma palavra de um domínio (ordem de serviço, fatura, veículo), ele vai para esse domínio.

### 7.3. Quando dois domínios precisam da mesma coisa

| Situação | Resposta |
|---|---|
| Faturamento mostra a placa de um veículo | Billing importa `fleet/api`. |
| Manutenção e estoque precisam ambos da lista de oficinas | Oficinas são um conceito próprio: um pequeno domínio `depots`, ou `fleet` as exporta na sua API. Não `shared`. |
| Agendamento precisa abrir uma ordem de serviço depois de um agendamento | Booking chama o back-end; o back-end cria a ordem de serviço. Domínios de front-end não orquestram as escritas uns dos outros. |
| Dois domínios precisam do mesmo seletor de data | É algo técnico, não de negócio: `shared/ui-design-system`. |
| Duas bibliotecas de API querem importar uma à outra | Os domínios estão mal cortados. Junte-os ou mova o conceito compartilhado para um terceiro domínio. |

## 8. Garantindo as regras

Uma regra que não é verificada é uma sugestão. O Nx a verifica com tags e uma regra de lint.

### 8.1. Tags

Todo `project.json` recebe uma tag `domain:*` e uma tag `type:*` e, em um workspace misto, uma tag `framework:*`.

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

Os generators definem as tags quando a biblioteca é criada:

```bash
nx g @nx/angular:library --directory=libs/maintenance/feature-planning-board \
  --tags=domain:maintenance,type:feature,framework:angular
nx g @nx/js:library --directory=libs/maintenance/model \
  --tags=domain:maintenance,type:model,framework:agnostic --bundler=none
```

### 8.2. A regra de lint

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

Como as dimensões se combinam: um import precisa satisfazer **todas** as restrições de todas as tags da biblioteca que importa. Uma feature de maintenance pode importar `fleet/api` porque a sua regra de tipo permite `type:api` e a sua regra de domínio permite `type:api`. Ela não pode importar `fleet/data-access`: a regra de tipo permitiria `data-access`, mas a regra de domínio não permite `domain:fleet`. Uma biblioteca `ui` de maintenance também não pode importar `fleet/api`: a regra de domínio permitiria, mas a regra de tipo não.

A mesma regra também recusa imports relativos para dentro de outra biblioteca, imports dos detalhes internos de uma biblioteca em vez do seu `index.ts` e dependências circulares entre bibliotecas.

### 8.3. A dimensão de framework

A aplicação `customer` da Fleetline poderia migrar para Next.js e a `backoffice` para Nuxt sem mover uma única biblioteca `model` ou `util`. Elas têm a tag `framework:agnostic` e só podem importar outro código agnóstico, então `matchesFilter` e `isOverdue` são a mesma função nas três aplicações. Uma biblioteca React que tenta importar uma biblioteca `ui` de Angular falha no lint.

### 8.4. Sem Nx: Sheriff

Nem toda equipe usa Nx. O **Sheriff**, da mesma equipe da ANGULARarchitects, garante as mesmas regras de tags dentro de um único projeto TypeScript, por pasta em vez de por biblioteca. Ele serve para uma aplicação Next.js ou Nuxt que quer as fronteiras antes de querer um monorepo.

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

### 8.5. No CI

```bash
nx affected -t lint typecheck test build --base=origin/main
nx graph --affected
```

Como o grafo de dependências é explícito, uma mudança em `maintenance/ui-checklist` executa lint, testes e build das bibliotecas e aplicações que dependem dela, e de mais nada. Na Fleetline, um pull request típico mexe em um domínio e executa um quinto do workspace. Com cache remoto, uma biblioteca que não mudou nunca é recompilada em nenhuma máquina.

## 9. Estado com NgRx

`maintenance/data-access` contém tudo sobre de onde vêm as ordens de serviço e como elas mudam. Esta seção mostra a biblioteca completa. Cada arquivo tem uma única tarefa.

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

### 9.1. O model

O model não depende de framework e mora em sua própria biblioteca, para que as bibliotecas `ui`, os testes e as versões React e Vue possam usá-lo.

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

As actions recebem o nome do **que aconteceu**, agrupadas por **onde aconteceu**. A página relata eventos; ela não emite comandos como `loadWorkOrders`.

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

### 9.3. A feature: estado, reducer, seletores

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

A atribuição é **otimista**: o reducer aplica `assigneeChosen` na hora, e `assignFailed` devolve o mecânico anterior. O valor anterior viaja no evento, porque, quando o effect executa, o estado já contém o novo.

### 9.4. HTTP e effects

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

`switchMap` para o carregamento (uma oficina mais recente cancela a requisição mais antiga), `mergeMap` para as atribuições (duas atribuições em dois cards precisam terminar ambas).

### 9.5. Providers

A feature do store é registrada na rota do domínio, e não na raiz da aplicação. O store raiz fica vazio até que um planejador abra maintenance, e o código dela é carregado sob demanda junto com a rota.

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

### 9.6. A API pública de data-access

`libs/maintenance/data-access/src/index.ts`

```ts
export { provideWorkOrders } from './lib/work-orders.providers';
export { WorkOrdersFacade } from './lib/work-orders.facade';
```

Duas exportações. Actions, reducer, seletores e o cliente HTTP são privados. Toda feature de maintenance passa pela facade, e a equipe Workshop pode reestruturar o store sem tocar em um único componente.

## 10. A facade, e quando dispensá-la

:::diagram fe-flow

Uma facade é um objeto fino entre as features e o gerenciamento de estado. Ela expõe **estado** (signals no Angular, valores no React, refs no Vue) e **intenções** (métodos). Ela não contém lógica: cada método despacha exatamente um evento, e cada propriedade é exatamente um seletor.

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

A facade é fornecida por `provideWorkOrders()`, e não em `root`, então ela existe exatamente onde existe a sua feature do store.

### 10.1. Por que uma facade

- **Estado substituível.** No dia em que as ordens de serviço passarem do NgRx Store para um Signal Store ou para um cache de servidor, a facade muda e nenhum componente muda. A Fleetline fez exatamente isso em `fleet` (seção 7.1).
- **Uma superfície pequena.** Uma feature vê seis membros em vez de catorze actions e nove seletores.
- **Testes fáceis.** Um teste de feature fornece um objeto falso com o mesmo formato (seção 15).
- **O mesmo formato em todos os frameworks.** A classe aqui, `useWorkOrders()` no React e no Vue: o código da feature fica quase igual nos três (seção 14).

### 10.2. Por que a facade é opcional

A comunidade do NgRx tem um bom argumento contra facades: as actions devem descrever eventos (*"responsável escolhido na página de ordens de serviço"*), e uma facade com um método `assign()` convida a pensar em comandos. Uma facade que despacha três actions seguidas, ou que contém lógica, esconde o log de eventos que torna o NgRx depurável.

Por isso, na nossa variante, a facade é uma regra com condições:

| Use uma facade quando | Dispense-a quando |
|---|---|
| mais de uma feature usa o mesmo estado | uma feature é dona de uma pequena feature do store |
| o estado pode mudar de implementação (Store ↔ Signal Store ↔ cache de servidor) | o estado é local a um componente: use um Signal Store ou signals simples no componente |
| os dados são oferecidos a outro domínio por meio de `api` | a equipe prefere despachar eventos diretamente e o domínio é pequeno |
| a base de código é compartilhada com equipes de React ou Vue | |

Duas regras quando você usa uma:

1. **Os nomes dos métodos preservam o evento.** `assign()` despacha `assigneeChosen` com a origem `Work Orders Page`. Se duas páginas podem atribuir, cada página recebe o seu próprio evento; a facade ganha dois métodos ou um parâmetro `source`, nunca um `update()` genérico.
2. **Sem lógica.** Nada de `if`, nada de laço, nenhuma chamada HTTP. Se é preciso tomar uma decisão, a decisão pertence a um reducer, a um seletor ou a um effect.

Sem facade, o `index.ts` de `data-access` exporta os eventos da página e os seletores, e o próprio componente chama `store.dispatch()` e `store.selectSignal()`. Os dois formatos passam nas regras de fronteira; escolha um por domínio e registre-o no README do domínio.

## 11. Angular de ponta a ponta

Com o `data-access` pronto, as bibliotecas restantes são curtas.

### 11.1. A biblioteca ui

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

O card conhece `WorkOrder` porque `model` é permitido. Ele recebe `vehicleLabel` como string, porque uma biblioteca `ui` de maintenance não pode importar `fleet/api`.

### 11.2. A biblioteca feature

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

`depotId` vem do parâmetro da rota por meio de `withComponentInputBinding()`. `ensureLoaded` é um `rxMethod` e aceita um signal, então, sempre que a lista visível muda, fleet carrega as placas que ainda não tem, em uma única requisição.

### 11.3. O shell

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

O shell importa `identity/api` para o guard de permissão. Guards, assim como as placas de fleet, são uma preocupação entre domínios, então um shell pode usar a API de outro domínio do mesmo jeito que uma feature (seção 6.1). Todo o resto de que o shell precisa vem do seu próprio domínio.

### 11.4. A aplicação

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

Essa é a aplicação inteira: dois arquivos e um `environment`. A `backoffice` monta o mesmo `maintenance/feature-shell` com outro layout. Uma terceira aplicação levaria uma tarde.

## 12. React e Next.js

A arquitetura não depende de Angular. Bibliotecas, tipos, domínios, tags e a regra de lint continuam iguais; o Nx gera projetos React e Next.js com `@nx/react` e `@nx/next`. O que muda é como cada tipo de biblioteca é implementado, e o Next.js acrescenta uma nova dimensão: código que roda apenas no servidor.

### 12.1. O que corresponde a quê

| Angular | React / Next.js |
|---|---|
| Componente `feature` | Um client component exportado de `feature-*`; o `page.tsx` da aplicação só o renderiza |
| Componente `ui` com `input()`/`output()` | Um componente com props e callbacks |
| Rotas do `shell` | As rotas de arquivo ficam em `apps/<app>/app/`; a biblioteca shell exporta o layout e os providers do domínio |
| NgRx Store, `createFeature` | `createSlice` do Redux Toolkit |
| NgRx Entity | `createEntityAdapter` do Redux Toolkit |
| `createSelector` | `createSelector` (Reselect, parte do Redux Toolkit) |
| Effects | Listener middleware, ou thunks nos casos simples |
| `provideState` em uma rota | `slice.injectInto(rootReducer)` (slices carregados sob demanda) |
| Signal Store | Zustand |
| Serviço facade | Um hook: `useWorkOrders()` |
| `HttpClient` | `fetch` em uma função de servidor ou em um módulo de API do cliente |

### 12.2. Tags para servidor e cliente

No App Router, um arquivo é um server component ou um client component. Código que lê segredos, cookies ou o banco de dados nunca pode ir parar no bundle do navegador. A Fleetline acrescenta uma segunda biblioteca de data-access por domínio e mais uma tag:

| Biblioteca | Tags | Contém |
|---|---|---|
| `maintenance/data-access` | `type:data-access`, `platform:client` | Slice do Redux, listeners, API do cliente, hook facade |
| `maintenance/data-access-server` | `type:data-access`, `platform:server` | Funções de fetch `server-only` e server actions |

A regra de lint da seção 8.2 já contém a restrição `platform:client` → não `platform:server`. Além disso, todo arquivo exclusivo do servidor começa com `import 'server-only'`, então um erro quebra o build mesmo onde o lint não roda.

### 12.3. O store

O Redux Toolkit consegue injetar slices sob demanda, o que faz o papel de `provideState` em uma rota. O reducer raiz mora em `shared` e não conhece nenhum domínio.

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

Um store novo por requisição é criado em um provider do cliente, como recomenda o guia do Redux Toolkit para o App Router.

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

### 12.4. O slice

Os mesmos eventos, a mesma atualização otimista, as mesmas funções de `model` da seção 9.

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

Os listeners são adicionados quando o domínio é montado e removidos quando ele é desmontado, o equivalente de `provideEffects` em uma rota. `cancelActiveListeners()` dá a semântica de `switchMap`.

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

### 12.6. O hook facade

O hook tem os mesmos membros que a facade do Angular. Ele também inicia os listeners e relata a abertura da página, então uma feature precisa de uma linha para ser ligada.

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

### 12.7. Feature, ui e rota

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

O arquivo de rota na aplicação continua com poucas linhas. A biblioteca shell exporta o layout do domínio com a verificação de permissão.

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

### 12.8. Estado de servidor: a mesma facade, outro motor

No Next.js, boa parte do que uma SPA Angular guarda no NgRx é **estado de servidor**: dados que pertencem ao servidor e que o cliente guarda em cache. Para listas como as ordens de serviço, muitas equipes preferem server components com um cache de queries em vez de Redux. A facade torna isso uma decisão privada de `data-access`.

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

O valor de retorno tem os mesmos membros. `WorkOrdersPage` não muda, a não ser por passar `initial`, que o `page.tsx` do servidor carregou com `listWorkOrders`. A regra da Fleetline: **estado de servidor em um cache de queries, estado que pertence ao cliente no Redux.** O quadro de planejamento, onde os planejadores arrastam dezenas de ordens entre mecânicos e dias antes de salvar, pertence ao cliente e fica no Redux; a lista de ordens de serviço é estado de servidor.

### 12.9. Armadilhas específicas do Next.js

- **`'use client'` é uma fronteira por si só.** Coloque-o em arquivos de feature e de data-access que usam hooks, nunca em `model` ou `util`.
- **Não importe uma biblioteca de servidor em um arquivo de cliente "só por causa do tipo".** Os tipos moram em `model`.
- **Server actions pertencem a `data-access-server`.** Uma feature só as importa por meio de reexportações de `data-access` se as tags de lint permitirem; caso contrário, a página as passa como props.
- **Os arquivos de rota continuam finos.** Um `page.tsx` que acumula lógica é a versão Next.js de um componente gordo de aplicação Angular.

## 13. Vue e Nuxt

O Vue corresponde de forma ainda mais direta, porque os setup stores do Pinia se parecem muito com um NgRx Signal Store, e os composables são o formato natural de uma facade. O Nx gera projetos Vue e Nuxt com `@nx/vue` e `@nx/nuxt`.

### 13.1. O que corresponde a quê

| Angular | Vue / Nuxt |
|---|---|
| Componente `feature` | Um single-file component em `feature-*`; a página em `apps/<app>/app/pages/` só o renderiza |
| Componente `ui` | Um componente com `defineProps` e `defineEmits` |
| Rotas do `shell` | As rotas de arquivo ficam na aplicação; a biblioteca shell exporta layouts e route middleware |
| NgRx Store / Signal Store | Pinia (setup store) |
| Seletores | `computed` dentro do store |
| Effects | Actions assíncronas no store; `useAsyncData` para carregar durante a renderização no servidor |
| Serviço facade | Um composable: `useWorkOrders()` |
| `HttpClient` | `$fetch` |

O Pinia não tem a divisão entre actions e reducers. Isso elimina o log de eventos e o time-travel debugging do NgRx, e também elimina a maior parte da cerimônia. Para a arquitetura, não muda nada: o store é privado de `data-access`, e o composable é a porta.

### 13.2. Desligue os auto-imports para bibliotecas

O Nuxt importa componentes e composables automaticamente. Isso é conveniente em uma aplicação pequena e fatal para as fronteiras: **um import que nunca é escrito não pode passar pelo lint.** Se uma feature de billing consegue usar `useWorkOrders()` sem uma linha de `import`, a regra de lint nunca vê o cruzamento.

Regras nas aplicações Nuxt da Fleetline:

- as bibliotecas são importadas com instruções `import` explícitas pelos seus aliases de caminho, nunca registradas como diretórios de auto-import;
- os domínios não são layers do Nuxt, porque os layers importam automaticamente seus componentes e composables para dentro da aplicação;
- a aplicação mantém auto-imports para as APIs de Vue e Nuxt apenas nas suas próprias `pages/` e `layouts/`, e o código das bibliotecas importa as funções do Nuxt de `#imports`.

`apps/backoffice/nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
  components: { dirs: [] },
  imports: { scan: false },
  runtimeConfig: { public: { apiUrl: '' } },
});
```

### 13.3. O store

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

`byId`, `filter` e `error` são retornados para que o Pinia os serialize no payload renderizado no servidor e o navegador comece com o mesmo estado.

### 13.4. O composable facade

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

A chave é uma função de `depotId`, então trocar de oficina busca os dados de novo. No servidor, `useAsyncData` espera pelos dados; no navegador, a página hidrata a partir do payload sem uma segunda requisição.

### 13.5. Feature, ui e página

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

### 13.6. Armadilhas específicas do Nuxt

- **O lint de arquivos `.vue`** precisa de `vue-eslint-parser` na configuração do ESLint; caso contrário, a regra de fronteira ignora silenciosamente todos os componentes. O padrão `files` da seção 8.2 inclui `**/*.vue` por esse motivo.
- **Um store por requisição.** O Pinia com `@pinia/nuxt` já cria um por requisição no servidor. Nunca guarde estado em um `ref` no nível do módulo de uma biblioteca: no servidor, ele seria compartilhado entre usuários.
- **`useAsyncData` pertence à facade**, e não ao store. O store continua utilizável em testes e em código que roda só no cliente.

## 14. Lado a lado

:::diagram fe-frameworks

O mesmo caso de uso em três frameworks, arquivo por arquivo:

| Biblioteca | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| `model` | `work-order.ts` | o mesmo arquivo | o mesmo arquivo |
| Estado em `data-access` | `createFeature` + `createEntityAdapter` | `createSlice` + `createEntityAdapter` | Setup store do Pinia |
| Effects em `data-access` | `createEffect` funcional | listener middleware | actions assíncronas do store + `useAsyncData` |
| Facade em `data-access` | `WorkOrdersFacade` (signals) | `useWorkOrders()` (valores) | `useWorkOrders()` (refs) |
| `ui` | `input()` / `output()` | props / callbacks | `defineProps` / `defineEmits` |
| `feature` | componente standalone | client component | single-file component |
| `shell` | `Routes` com `providers` | componente de layout, segmento de rota | layout + route middleware |
| rota da aplicação | `loadChildren` | `page.tsx` | `pages/*.vue` |
| fronteiras | `@nx/enforce-module-boundaries` | a mesma regra | a mesma regra, com `vue-eslint-parser` |

O que fica idêntico nos três: a pasta de cada arquivo, as tags, a regra de lint, a biblioteca `model`, os membros da facade e os testes da biblioteca `model`. Quem alterna entre as aplicações da Fleetline só precisa reaprender o próprio framework.

## 15. Testes por tipo de biblioteca

Cada tipo tem um tipo natural de teste, e as fronteiras tornam cada um deles barato.

| Tipo | Teste | Velocidade | O que é simulado |
|---|---|---|---|
| `model`, `util` | Testes unitários simples, sem framework | milissegundos | nada |
| Reducers e seletores de `data-access` | Testes de funções puras | milissegundos | nada |
| Effects / listeners de `data-access` | Testes com um cliente HTTP falso | rápido | HTTP |
| facade | Integração com o store real | rápido | HTTP |
| `ui` | Testes de componente, stories no Storybook | rápido | nada, ele só tem entradas |
| `feature` | Teste de componente com uma facade falsa | rápido | a facade |
| app | End-to-end com Playwright, alguns fluxos | lento | o back-end, ou nada |

Um teste de reducer não precisa de TestBed:

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

Um teste de feature fornece uma facade falsa, porque o componente não vê mais nada:

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

Builders de dados de teste, como `aWorkOrder`, moram em um entry point secundário de `model` (`@fleetline/maintenance/model/testing`), então os testes de todos os frameworks usam os mesmos.

## 16. Crescer até chegar lá e migrar

Ninguém começa com setenta bibliotecas. A Fleetline começou como uma única aplicação Angular com uma pasta `src/app`; os passos abaixo estão na ordem que funcionou.

### 16.1. Migração em oito passos

1. **Crie o workspace em volta da aplicação.** `nx init` no repositório existente. Nada se move ainda.
2. **Desenhe os domínios no papel.** Use as palavras do negócio: sobre o que falam os planejadores, os clientes e o financeiro? Espere de seis a dez domínios. Escreva-os em um README.
3. **Ligue a regra como aviso.** Adicione a configuração de lint da seção 8.2 com `'warn'`. Conte os avisos; esse é o seu ponto de partida.
4. **Extraia `model` e `util` primeiro.** Eles não têm dependências, então movê-los é seguro, e todos os passos seguintes precisam deles. Use `nx g @nx/workspace:move`.
5. **Extraia `ui` por domínio.** Todo componente que só tem entradas e saídas é movido. Componentes que injetam um store ficam por enquanto.
6. **Recorte o `data-access` por domínio.** Divida o store raiz por domínio; mova cada feature do store, seus effects e o HTTP para o `data-access` do domínio e registre-a na rota do domínio.
7. **Mova as páginas para `feature-*` e as rotas para `feature-shell`.** A aplicação encolhe até ficar só com suas rotas e providers.
8. **Mude a regra para `'error'` e adicione o CODEOWNERS.** A partir daí, um novo cruzamento reprova o CI.

Os passos 4 a 7 são feitos domínio por domínio, e a aplicação continua sendo entregue entre eles. Na Fleetline, a migração inteira levou quatro meses em paralelo ao trabalho de funcionalidades, um domínio de cada vez, começando pelo menor (`notifications`) para aprender os movimentos.

### 16.2. O que costuma dar errado

- **Um domínio chamado `common` ou `core`.** Ele vira o novo `shared/`. Todo conceito tem um dono no negócio; encontre-o.
- **Domínios cortados por página em vez de pela linguagem do negócio.** "Dashboard" não é um domínio; é uma feature que lê de vários domínios pelas APIs deles.
- **Bibliotecas de API que reexportam tudo.** Aí a fronteira é só cosmética. Exporte o que outra equipe realmente usa, e nada mais.
- **Linhas de lint desativadas.** Um `eslint-disable` para a regra de fronteira vira quarenta em um ano. Exceções vão para a configuração, com uma justificativa no pull request.

### 16.3. Quando dividir uma biblioteca

- Um `data-access` com mais de três ou quatro features de store, ou com duas equipes donas: divida por subdomínio.
- Uma biblioteca `ui` importada por uma única feature: incorpore-a de volta nessa feature ou mantenha-a, mas não a mova para `shared`.
- Uma `feature` com várias rotas sem relação entre si: uma biblioteca por caso de uso.
- Um domínio cujas bibliotecas são, em sua maioria, de outra equipe: o domínio está mal cortado, ou então as fronteiras das equipes estão.

### 16.4. Quando isto é demais

Para uma aplicação, uma equipe e um ou dois domínios, a estrutura completa custa mais do que economiza. Comece com pastas dentro de um único projeto (`src/domains/<domain>/feature-…`, `ui-…`, `data-access`, `model`) e garanta as regras com o Sheriff (seção 8.4). Transformar essas pastas em bibliotecas Nx depois é um passo mecânico, porque as regras de dependência já são cumpridas.

## 17. Perguntas

**Precisamos de NgRx para todo o estado?**
Não. Estado compartilhado e de longa duração, lido por várias features, vai para um store. Estado de formulário, painéis abertos ou fechados e outros estados que pertencem a um componente ficam no componente, com signals ou com um Signal Store no nível do componente.

**NgRx Store ou NgRx Signal Store?**
Os dois se encaixam na arquitetura, os dois moram em `data-access`, e a facade esconde a escolha. A Fleetline usa o Store onde um log de eventos e as devtools compensam (manutenção, planejamento) e o Signal Store em domínios mais simples (resumos de frota, notificações).

**Uma facade não é só mais uma camada?**
É, e a seção 10 diz quando ela vale a pena. No React e no Vue, o hook ou o composable já é a forma idiomática de compartilhar o acesso ao estado, então ali a facade quase não custa nada.

**Todo domínio deve ter uma biblioteca `api` desde o primeiro dia?**
Não. Crie-a na primeira vez que outro domínio precisar de algo. Antes disso, o domínio é totalmente privado, e essa é a melhor fronteira que existe.

**Isto é micro front-end?**
Não. Tudo aqui gera uma aplicação por pasta de aplicação. O mesmo corte por domínio é a costura natural para micro front-ends mais tarde, se a organização um dia precisar de implantações independentes.

**React, Vue e Angular podem mesmo compartilhar bibliotecas?**
Eles compartilham as bibliotecas `model` e `util`, com a tag `framework:agnostic`, e os builders de dados de teste. Componentes e stores são por framework. Na Fleetline, cerca de um quinto do código front-end é agnóstico de framework.

**Onde podemos ler mais?**
Os artigos de Manfred Steyer e o e-book gratuito *Enterprise Angular* em [angulararchitects.io](https://www.angulararchitects.io/), a [documentação do Nx](https://nx.dev/) sobre fronteiras de módulos, o [Sheriff](https://github.com/softarc-consulting/sheriff) e a [documentação do NgRx](https://ngrx.io/).
