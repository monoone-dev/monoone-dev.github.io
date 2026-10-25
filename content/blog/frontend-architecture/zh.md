本指南介绍我们如何组织大型前端：一个工作区、多个应用、多个团队，每个文件都有一条规则。我们用 **Nx** 和 **Angular** 来构建它，把共享状态放在 **NgRx** 中，并在 store 前面放一个**可选的 facade**。随后，我们逐条规则地展示同一套架构在 **React 搭配 Next.js** 和 **Vue 搭配 Nuxt** 中的样子。

这套架构不是我们的发明。它的核心由 **Manfred Steyer** 提出并发表。他是 Angular 培训师和顾问，Angular 方向的 Google Developer Expert，也是 [ANGULARarchitects](https://www.angulararchitects.io/) 的创办者。他的思路是：按**领域纵向**切分前端，按**库类型横向**切分前端；领域之间只能通过显式的 API 交流；这些界线由工具来执行，而不是靠 wiki。第 2 节会准确列出哪些来自他，哪些来自 Nx，哪些是我们补充的。

小例子无法说明这一切为什么重要。一个领域加一个 store，谁都能记在脑子里。所以本页的每个例子都来自同一个贴近真实的工作区：**Fleetline**，一个车队维修平台，有三个应用、九个领域、约七十个库和五个团队。它在第 5 节中介绍，并贯穿之后的每一节。

> 本文写给已经拥有或即将拥有多个前端应用、多个团队，或超过约 50,000 行前端代码的团队。如果规模比这小，请先阅读第 16.4 节。

## 1. 前端为什么需要架构

前端每次都以同样的方式增长。第一年只有一个应用，以及一个包含 `components`、`services` 和 `store` 的 `src/app` 文件夹。到了第三年，同一个项目通常会变成这样：

- `shared/` 里有三百个文件，其中一半只被一个功能使用；
- billing 中的一个组件从 maintenance 导入了一个 selector，只因为它刚好在那里；
- 根 store 有四十个 feature key，没人知道某个页面需要哪些；
- 第二个应用是复制第一个应用创建的，因为抽取代码太难了；
- 改动一个日期辅助函数，就要重新构建并重新测试整个仓库；
- 新开发者或编码智能体需要好几天才能弄清某个功能在哪里、可以使用什么。

这些问题都不是因为工程师不好。原因在于两个问题没有共同的答案：**这个文件该放在哪里**，以及**谁可以导入谁**。没有答案时，离得最近的文件夹就会胜出，而最近的文件夹总是 `shared/`。

本指南中的架构为每一类前端代码一次性回答这两个问题，并让答案变得**机械化**：一条 lint 规则会拒绝越界的导入，在编辑器里如此，在 CI 中也如此。

### 1.1. 目标

1. **可查找性。** 知道功能的名称，就知道它在每个应用中位于哪个文件夹。
2. **局部化的修改。** 一个领域内部的修改不会破坏另一个领域，因为另一个领域看不到它的内部。
3. **规模化下的快速反馈。** CI 只构建和测试受修改影响的库。
4. **并行的团队。** 团队拥有的是领域，而不是散落在 `shared/` 中的文件。
5. **可替换的状态。** 功能不知道它的数据来自 NgRx、Signal Store、缓存还是服务器。
6. **三个框架，一本规则手册。** 同一家公司的 Angular、React 和 Vue 应用遵循相同的结构，与框架无关的代码在它们之间共享。

### 1.2. 非目标

- 它不替你选择后端、设计系统或 CSS。
- 它不要求微前端。这里的一切都可以在一个可部署的应用中运行；微前端是之后另行做出的决定。
- 它不取代你的产品规则。它说明代码放在哪里、可以使用什么；你的项目说明代码必须做什么。

## 2. 思路的来源

这套架构结合了三个来源。我们点出它们的名字，因为每一个都值得去读原文。

| 来源 | 贡献了什么 |
|---|---|
| **Nx**（Nrwl 团队，*Enterprise Angular Monorepo Patterns*） | monorepo 本身、带有公开 `index.ts` 的库，以及经典的库类型：`feature`、`ui`、`data-access`、`util`。项目上的标签和 `@nx/enforce-module-boundaries` lint 规则。 |
| **Manfred Steyer**（ANGULARarchitects、电子书 *Enterprise Angular*、他关于用 Nx 做战略设计的文章） | 把领域驱动设计应用到前端：**领域作为纵向切片**，**库类型作为横向分层**，由 linter 检查的两个标签维度（`domain:*` 和 `type:*`），作为领域之间唯一入口的 **API 库**，以及位于 UI 和状态管理之间的 **facade**。后来还有 **Sheriff**，一个用于不使用 Nx 的项目的边界检查工具。 |
| **NgRx**（以及更早的 Redux） | 用一个 store 保存共享状态，通过 action 和纯 reducer 修改状态，副作用放在 effect 中，通过带记忆化的 selector 读取。 |

我们在此基础上于本指南中做出的决定：

- 单独的 `model` 类型，用于与框架无关的类型和纯领域函数，使 `ui` 库永远不依赖状态管理；
- 独立的 `shell` 类型（即 Nx 的 `feature-shell`），负责一个领域的路由和 provider；
- 第三个标签维度 `framework:*`，让 Angular、React 和 Vue 应用可以放在同一个工作区中，并共享 `model` 和 `util` 代码；
- 面向 Next.js 的第四个维度：`platform:server` 和 `platform:client`；
- 第 10 节中关于 facade 何时值得、何时可以省略的规则；
- 第 12 节和第 13 节中对 React/Next 和 Vue/Nuxt 的转换。

当本页内容与原始文章不一致时，思路以原文为准；如何应用则以本页为准。

## 3. 一页看懂这套架构

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

需要记住的六句话：

1. **每个库只有一个领域和一个类型**，以标签的形式写下，标签决定它可以导入什么。
2. **导入沿着类型阶梯向下指**：feature → ui、data-access → model → util。从不向上，功能之间也从不横向导入。
3. **一个领域只能通过另一个领域的 `api` 库看到它。** 领域中的其余一切都是私有的。
4. **`shared` 不知道任何领域。** 如果一个“共享”文件提到了工单，它就属于 maintenance。
5. **组件从不直接与 HTTP 打交道。** 数据经由 `data-access` 流动；功能看到的是 facade 或 selector，而不是 URL。
6. **应用是薄的。** 应用负责连接路由和 provider；功能位于库中，所以第二个应用几乎没有成本。

## 4. 术语

| 术语 | 含义 |
|---|---|
| **工作区** | 一个包含所有应用和库的 Nx 仓库。 |
| **应用** | `apps/` 中一个可部署的前端。几乎不包含代码。 |
| **库** | `libs/` 中的一个文件夹，拥有自己的 `project.json`、标签和公开的 `index.ts`。只能通过它的路径别名导入，例如 `@fleetline/maintenance/data-access`。 |
| **领域** | 业务中拥有自己语言和数据的一部分：维修、车队、计费。也称为限界上下文。对应 `libs/` 中的一个文件夹。 |
| **类型** | 库的技术角色：`feature`、`ui`、`data-access`、`model`、`util`、`api`、`shell`。 |
| **公开 API** | 库的 `index.ts`。它没有导出的东西，对其他库来说就不存在。 |
| **Facade** | 一个小的类、hook 或 composable，功能用它来代替 store：状态以 signal 或 ref 的形式提供，意图以方法的形式提供。 |
| **边界规则** | 一条 lint 规则，读取两个库的标签，并让标签不允许的导入失败。 |

## 5. 示例：Fleetline

Fleetline 为运营卡车、厢式货车和公交车的公司提供维修服务。技师在车场工作；调度员分派工作；客户预约服务并支付发票；财务和客服负责后台运营。

### 5.1. 应用

| 应用 | 用户 | 本指南中使用的框架 |
|---|---|---|
| `ops-portal` | 车场中的调度员和技师 | Angular |
| `customer` | 车队客户：预约、车辆、发票 | Angular（第 12 节中为 Next.js） |
| `backoffice` | 财务、客服、管理员 | Angular（第 13 节中为 Nuxt） |

### 5.2. 领域和团队

| 领域 | 负责 | 团队 | 使用它的应用 |
|---|---|---|---|
| `maintenance` | 工单、检查清单、调度看板、SLA | Workshop | ops-portal、backoffice |
| `fleet` | 车辆、里程表、维修历史 | Workshop | 全部三个 |
| `inventory` | 零件、各车场库存、预留 | Supply | ops-portal、backoffice |
| `booking` | 服务时段、预约流程、改期 | Customer | customer、ops-portal |
| `billing` | 报价、发票、付款 | Finance | customer、backoffice |
| `customers` | 账户、合同、联系人 | Customer | customer、backoffice |
| `identity` | 登录、角色、权限 | Platform | 全部三个 |
| `notifications` | 应用内收件箱、邮件偏好 | Platform | 全部三个 |
| `shared` | 设计系统、布局、HTTP 配置、日期、金额、测试 | Platform | 全部三个 |

五个团队，约三十五名前端工程师，约 280,000 行 TypeScript。`CODEOWNERS` 把每个 `libs/<domain>/` 文件夹映射到对应的团队，因此提交到 maintenance 的 pull request 只会请求 Workshop 团队评审，不会打扰其他人。

### 5.3. 工作区

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

仅 maintenance 就有十二个库。这很正常：每个用例一个 `feature-*`，每组内聚的组件一个 `ui-*`，每个领域一个 `data-access` 和一个 `model`，直到它们变得太大（第 16.3 节）。

### 5.4. 一个用例贯穿各层

本指南其余部分都围绕同一个用例：**调度员打开一个车场的工单，进行筛选，并指派一名技师**。它涉及 maintenance 的四个库和 fleet 的一个库：

| 库 | 贡献了什么 |
|---|---|
| `maintenance/feature-work-orders` | 页面：读取 facade，渲染卡片，转发点击 |
| `maintenance/ui-work-order-card` | 卡片和状态筛选器，没有状态，没有 HTTP |
| `maintenance/data-access` | NgRx feature、effect、HTTP 客户端、facade |
| `maintenance/model` | `WorkOrder`、`WorkOrderFilter`、`matchesFilter`、`isOverdue` |
| `fleet/api` | `VehicleSummaryStore`：根据车辆 id 提供车牌和车型 |

## 6. 库类型

每种类型回答一个问题。如果一个文件回答了两个问题，它就应该是两个文件。

| 类型 | 它回答的问题 | 包含 | 不得包含 |
|---|---|---|---|
| `feature` | 这个用例做什么？ | 路由页面、智能组件、把 facade 连接到 ui 的代码 | HTTP 调用、可复用的视觉组件 |
| `ui` | 它看起来是什么样子？ | 展示型组件、pipe、指令 | 注入的 store、有状态的服务、HTTP |
| `data-access` | 数据从哪里来，如何变化？ | store、effect、API 客户端、facade、provider | 组件 |
| `model` | 领域的术语和规则是什么？ | 类型、枚举、纯函数，例如 `isOverdue` | 任何形式的框架导入 |
| `util` | 它需要哪些技术辅助工具？ | 格式化、解析、小算法 | 领域术语、框架状态 |
| `api` | 其他领域可以使用什么？ | 对领域中选定子集的重新导出 | 自己的逻辑 |
| `shell` | 这个领域如何挂载？ | 路由、路由级 provider、守卫 | 业务逻辑 |

### 6.1. 谁可以导入谁

| 从 ↓ 可以导入 → | shell | feature | ui | data-access | model | util | 其他领域的 api |
|---|---|---|---|---|---|---|---|
| **app** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **shell** | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **feature** | – | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| **api** | – | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| **ui** | – | – | ✓ | – | ✓ | ✓ | – |
| **data-access** | – | – | – | ✓ | ✓ | ✓ | – |
| **model** | – | – | – | – | ✓ | ✓ | – |
| **util** | – | – | – | – | – | ✓ | – |

这张表中有三行承载了大部分价值：

- **禁止 feature → feature。** 两个页面需要同一样东西时，通过 `ui` 或 `data-access` 共享。页面由 shell 或路由器组合，而不是互相导入。
- **禁止 ui → data-access。** 注入 store 的组件就不再是展示型组件。正因为这条规则，`WorkOrder` 类型位于 `model`，而不是 `data-access`。
- **model 不导入任何框架。** `model` 和 `util` 在 Angular、React、Vue 和 Node 中都能编译。在混合工作区中，它们就是共享的代码（第 8.3 节）。

### 6.2. 一个库应该多大

- **feature：** 一个用例，通常是一条路由及其子路由。是 `feature-work-orders`，而不是 `feature-maintenance`。
- **ui：** 一组会一起变化的内聚组件。`ui-work-order-card` 包含卡片、状态标签和状态筛选器。
- **data-access：** 起初每个领域一个。当它包含三四个以上的 store feature，或团队拆分时，按子领域拆分（`data-access-planning`、`data-access-work-orders`）。
- **model：** 每个领域一个。它天生就小。
- 如果一个库只有一个文件，它可能太小了；如果它的 `index.ts` 导出了大约三十个以上的符号，它可能太大了。

## 7. 领域和边界

领域是一个带有显式入口的文件夹。在文件夹内部，适用第 6 节的类型规则。跨文件夹时，只适用一条规则：**你可以导入另一个领域的 `api` 库，除此之外什么都不行。**

### 7.1. API 库

`fleet/api` 决定 fleet 向公司其他部分提供什么。没有列出的一切都是 Workshop 团队私有的，可以随时修改，无需征求任何人的意见。

`libs/fleet/api/src/index.ts`

```ts
export type { VehicleSummary, VehicleId } from '@fleetline/fleet/model';
export { VehicleSummaryStore } from '@fleetline/fleet/data-access';
export { VehicleBadgeComponent } from '@fleetline/fleet/ui-vehicle-badge';
```

它导出的 store 是 NgRx Signal Store，而 maintenance 使用的是经典的 NgRx Store。maintenance 不需要知道这一点；它只看到 `VehicleSummaryStore`。

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

### 7.2. shared 也是一个领域

`shared` 带有 `domain:shared` 标签，并且只能导入 `domain:shared`。它不知道任何业务术语。评审时的经验法则：如果 `shared` 中的某个文件包含某个领域的词汇（工单、发票、车辆），就把它移到那个领域中。

### 7.3. 当两个领域需要同一样东西时

| 情况 | 答案 |
|---|---|
| billing 要显示车辆的车牌 | billing 导入 `fleet/api`。 |
| maintenance 和 inventory 都需要车场列表 | 车场是一个独立的概念：建一个小的 `depots` 领域，或者由 `fleet` 在它的 API 中导出。不是 `shared`。 |
| booking 在预约后需要创建工单 | booking 调用后端；由后端创建工单。前端领域之间不编排彼此的写操作。 |
| 两个领域需要同一个日期选择器 | 它是技术性的，而不是业务性的：`shared/ui-design-system`。 |
| 两个 API 库想要互相导入 | 领域切分错了。把它们合并，或者把共享的概念移到第三个领域中。 |

## 8. 执行规则

没有被检查的规则只是建议。Nx 用标签和一条 lint 规则来检查它。

### 8.1. 标签

每个 `project.json` 都有一个 `domain:*` 标签和一个 `type:*` 标签；在混合工作区中，还有一个 `framework:*` 标签。

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

生成器在创建库时设置标签：

```bash
nx g @nx/angular:library --directory=libs/maintenance/feature-planning-board \
  --tags=domain:maintenance,type:feature,framework:angular
nx g @nx/js:library --directory=libs/maintenance/model \
  --tags=domain:maintenance,type:model,framework:agnostic --bundler=none
```

### 8.2. lint 规则

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

各维度如何组合：一次导入必须满足导入方库每个标签的**每一条**约束。maintenance 的 feature 可以导入 `fleet/api`，因为它的类型规则允许 `type:api`，它的领域规则也允许 `type:api`。它不能导入 `fleet/data-access`：类型规则允许 `data-access`，但领域规则不允许 `domain:fleet`。maintenance 的 `ui` 库也不能导入 `fleet/api`：领域规则允许，但类型规则不允许。

同一条规则还会拒绝指向另一个库的相对导入、绕过 `index.ts` 对库内部的导入，以及库之间的循环依赖。

### 8.3. 框架维度

Fleetline 的 `customer` 应用可以迁移到 Next.js，`backoffice` 可以迁移到 Nuxt，而无需移动任何一个 `model` 或 `util` 库。这些库带有 `framework:agnostic` 标签，只能导入其他与框架无关的代码，因此 `matchesFilter` 和 `isOverdue` 在三个应用中是同一个函数。试图导入 Angular `ui` 库的 React 库会在 lint 时失败。

### 8.4. 不用 Nx：Sheriff

并不是每个团队都使用 Nx。**Sheriff** 出自同一个 ANGULARarchitects 团队，它在单个 TypeScript 项目内执行相同的标签规则，以文件夹而不是库为单位。它适合那些想先有边界、再考虑 monorepo 的 Next.js 或 Nuxt 应用。

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

### 8.5. 在 CI 中

```bash
nx affected -t lint typecheck test build --base=origin/main
nx graph --affected
```

因为依赖图是显式的，修改 `maintenance/ui-checklist` 时，只会对依赖它的库和应用执行 lint、测试和构建，不涉及其他任何东西。在 Fleetline 中，一个典型的 pull request 只涉及一个领域，运行工作区的五分之一。有了远程缓存，未改动的库在任何机器上都不会被重新构建。

## 9. 用 NgRx 管理状态

`maintenance/data-access` 包含工单从哪里来、如何变化的全部内容。本节完整地展示它。每个文件只有一项职责。

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

### 9.1. 模型

模型与框架无关，位于自己的库中，因此 `ui` 库、测试以及 React 和 Vue 版本都可以使用它。

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

### 9.2. 事件

action 以**发生了什么**来命名，按**在哪里发生**来分组。页面报告事件；它不发出像 `loadWorkOrders` 这样的命令。

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

### 9.3. feature：状态、reducer、selector

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

指派是**乐观更新**的：reducer 立即应用 `assigneeChosen`，而 `assignFailed` 会把之前的技师恢复回来。之前的值随事件一起传递，因为等到 effect 运行时，状态中已经是新值了。

### 9.4. HTTP 和 effect

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

加载使用 `switchMap`（新的车场会取消旧的请求），指派使用 `mergeMap`（两张卡片上的两次指派都必须完成）。

### 9.5. Provider

store feature 注册在领域的路由上，而不是应用的根上。在调度员打开 maintenance 之前，根 store 一直是空的，相关代码随路由一起懒加载。

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

### 9.6. data-access 的公开 API

`libs/maintenance/data-access/src/index.ts`

```ts
export { provideWorkOrders } from './lib/work-orders.providers';
export { WorkOrdersFacade } from './lib/work-orders.facade';
```

两个导出。action、reducer、selector 和 HTTP 客户端都是私有的。maintenance 中的每个功能都经过 facade，Workshop 团队可以重构 store 而不必修改任何一个组件。

## 10. Facade，以及何时省略它

:::diagram fe-flow

facade 是位于功能和状态管理之间的一个薄对象。它暴露**状态**（Angular 中是 signal，React 中是值，Vue 中是 ref）和**意图**（方法）。它不包含任何逻辑：每个方法恰好派发一个事件，每个属性恰好对应一个 selector。

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

facade 由 `provideWorkOrders()` 提供，而不是在 `root` 中提供，因此它恰好存在于它的 store feature 存在的地方。

### 10.1. 为什么需要 facade

- **可替换的状态。** 等到工单从 NgRx Store 迁移到 Signal Store 或服务器缓存的那一天，只有 facade 需要修改，组件一个都不用改。Fleetline 对 `fleet` 正是这样做的（第 7.1 节）。
- **较小的接口面。** 功能看到的是六个成员，而不是十四个 action 和九个 selector。
- **易于测试。** 功能测试提供一个形状相同的假对象（第 15 节）。
- **在每个框架中形状相同。** 这里是一个类，在 React 和 Vue 中是 `useWorkOrders()`：功能代码在三者中读起来几乎一样（第 14 节）。

### 10.2. 为什么 facade 是可选的

NgRx 社区有一个反对 facade 的好论点：action 应该描述事件（*“在工单页面上选择了指派人”*），而带有 `assign()` 方法的 facade 会诱使人以命令的方式思考。一个连续派发三个 action 或包含逻辑的 facade，会隐藏让 NgRx 便于调试的事件日志。

所以在我们的变体中，facade 是一条带条件的规则：

| 在以下情况使用 facade | 在以下情况省略它 |
|---|---|
| 多个功能使用同一份状态 | 一个功能拥有一个小的 store feature |
| 状态的实现可能改变（Store ↔ Signal Store ↔ 服务器缓存） | 状态是组件局部的：在组件中使用 Signal Store 或普通 signal |
| 数据通过 `api` 提供给另一个领域 | 团队更喜欢直接派发事件，且领域很小 |
| 代码库与 React 或 Vue 团队共享 | |

使用 facade 时的两条规则：

1. **方法名保留事件。** `assign()` 派发来自 `Work Orders Page` 来源的 `assigneeChosen`。如果有两个页面都可以指派，每个页面都有自己的事件；facade 有两个方法或一个 `source` 参数，绝不是一个通用的 `update()`。
2. **没有逻辑。** 没有 `if`，没有循环，没有 HTTP 调用。如果需要做决定，这个决定应该放在 reducer、selector 或 effect 中。

不使用 facade 时，`data-access` 的 `index.ts` 改为导出页面事件和 selector，由组件自己调用 `store.dispatch()` 和 `store.selectSignal()`。两种形式都能通过边界规则；每个领域选择一种，并写在该领域的 README 中。

## 11. 端到端的 Angular

有了 `data-access`，其余的库都很短。

包含此用例全部文件的 Angular 工作区。每个库还有自己的 `project.json` 和 `tsconfig.json`，树中只为应用和 `data-access` 列出它们。

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

### 11.1. ui 库

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

卡片知道 `WorkOrder`，因为允许导入 `model`。它以字符串形式接收 `vehicleLabel`，因为 maintenance 的 `ui` 库不能导入 `fleet/api`。

### 11.2. feature 库

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

`depotId` 通过 `withComponentInputBinding()` 来自路由参数。`ensureLoaded` 是一个 `rxMethod`，可以接收 signal，所以每当可见列表变化时，fleet 都会在一次请求中加载它还没有的车牌。

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

shell 为了权限守卫导入了 `identity/api`。守卫和来自 fleet 的车牌一样，是跨领域的关注点，因此 shell 可以像 feature 一样使用另一个领域的 API（第 6.1 节）。shell 需要的其他一切都来自它自己的领域。

### 11.4. 应用

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

这就是整个应用：两个文件加一个 `environment`。`backoffice` 用不同的布局挂载同一个 `maintenance/feature-shell`。第三个应用只需要一个下午。

## 12. React 和 Next.js

这套架构不依赖 Angular。库、类型、领域、标签和 lint 规则都保持不变；Nx 用 `@nx/react` 和 `@nx/next` 生成 React 和 Next.js 项目。变化的是每种库类型的实现方式，而 Next.js 增加了一个新的维度：只在服务器上运行的代码。

同一个工作区换成 Next.js 应用，并列出此用例的全部文件：

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

### 12.1. 对应关系

| Angular | React / Next.js |
|---|---|
| `feature` 组件 | 从 `feature-*` 导出的客户端组件；应用中的 `page.tsx` 只负责渲染它 |
| 带有 `input()`/`output()` 的 `ui` 组件 | 带有 props 和回调的组件 |
| `shell` 路由 | 文件路由保留在 `apps/<app>/app/` 中；shell 库导出领域的布局和 provider |
| NgRx Store、`createFeature` | Redux Toolkit `createSlice` |
| NgRx Entity | Redux Toolkit 的 `createEntityAdapter` |
| `createSelector` | `createSelector`（Reselect，属于 Redux Toolkit） |
| Effect | listener 中间件，简单情况下用 thunk |
| 路由上的 `provideState` | `slice.injectInto(rootReducer)`（懒加载 slice） |
| Signal Store | Zustand |
| Facade 服务 | 一个 hook：`useWorkOrders()` |
| `HttpClient` | 服务端函数中的 `fetch` 或客户端 API 模块 |

### 12.2. 服务端和客户端的标签

在 App Router 中，一个文件要么是服务端组件，要么是客户端组件。读取密钥、cookie 或数据库的代码绝不能进入浏览器包。Fleetline 为每个领域增加第二个 data-access 库，并再加一个标签：

| 库 | 标签 | 包含 |
|---|---|---|
| `maintenance/data-access` | `type:data-access`、`platform:client` | Redux slice、listener、客户端 API、facade hook |
| `maintenance/data-access-server` | `type:data-access`、`platform:server` | `server-only` 的 fetch 函数和 server action |

第 8.2 节的 lint 规则已经包含了约束：`platform:client` → 不得依赖 `platform:server`。每个仅限服务端的文件还以 `import 'server-only'` 开头，因此即使在不运行 lint 的地方，错误也会让构建失败。

### 12.3. Store

Redux Toolkit 可以懒注入 slice，这起到了路由上 `provideState` 的作用。根 reducer 位于 `shared` 中，不知道任何领域。

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

按照 Redux Toolkit 针对 App Router 的指南建议，在客户端 provider 中为每个请求创建一个新的 store。

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

与第 9 节相同的事件、相同的乐观更新、相同的 `model` 函数。

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

### 12.5. 用 listener 实现 effect

listener 在领域挂载时添加，在卸载时移除，对应于路由上的 `provideEffects`。`cancelActiveListeners()` 提供了 `switchMap` 的语义。

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

### 12.6. Facade hook

这个 hook 拥有与 Angular facade 相同的成员。它还会启动 listener 并报告页面打开，所以一个功能只需要一行代码就能接好。

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

### 12.7. feature、ui 和路由

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

应用中的路由文件只有几行。shell 库导出带有权限检查的领域布局。

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

### 12.8. 服务端状态：同一个 facade，另一个引擎

在 Next.js 中，Angular SPA 放在 NgRx 里的很多东西都属于**服务端状态**：由服务器拥有、由客户端缓存的数据。对于工单这样的列表，许多团队更倾向于使用服务端组件加查询缓存，而不是 Redux。facade 让这成为 `data-access` 内部的私有决定。

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

返回值拥有相同的成员。`WorkOrdersPage` 不需要修改，只是多传一个 `initial`，即服务端 `page.tsx` 用 `listWorkOrders` 加载的数据。Fleetline 的规则是：**服务端状态放在查询缓存中，客户端拥有的状态放在 Redux 中。** 调度看板上，调度员在保存之前要在技师和日期之间拖动几十个工单，这属于客户端拥有的状态，留在 Redux 中；工单列表则是服务端状态。

### 12.9. Next.js 特有的陷阱

- **`'use client'` 本身就是一道边界。** 把它放在使用 hook 的 feature 和 data-access 文件中，绝不放在 `model` 或 `util` 中。
- **不要“只为了类型”而在客户端文件中导入服务端库。** 类型位于 `model`。
- **server action 属于 `data-access-server`。** 只有在 lint 标签允许时，feature 才通过 `data-access` 的重新导出来导入它们；否则由页面把它们作为 props 传入。
- **路由文件保持精简。** 一个不断增加逻辑的 `page.tsx`，就是 Next.js 版本的臃肿 Angular app 组件。

## 13. Vue 和 Nuxt

Vue 的对应关系更加直接，因为 Pinia 的 setup store 和 NgRx Signal Store 很像，而 composable 天然就是 facade 的形状。Nx 用 `@nx/vue` 和 `@nx/nuxt` 构建 Vue 和 Nuxt 项目。

同一个工作区换成 Nuxt 应用，并列出此用例的全部文件：

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

### 13.1. 对应关系

| Angular | Vue / Nuxt |
|---|---|
| `feature` 组件 | `feature-*` 中的单文件组件；`apps/<app>/app/pages/` 中的页面只负责渲染它 |
| `ui` 组件 | 使用 `defineProps` 和 `defineEmits` 的组件 |
| `shell` 路由 | 文件路由保留在应用中；shell 库导出布局和路由中间件 |
| NgRx Store / Signal Store | Pinia（setup store） |
| Selector | store 内部的 `computed` |
| Effect | store 中的异步 action；服务端渲染期间用 `useAsyncData` 加载 |
| Facade 服务 | 一个 composable：`useWorkOrders()` |
| `HttpClient` | `$fetch` |

Pinia 没有 action 和 reducer 的划分。这去掉了 NgRx 的事件日志和时间旅行调试，同时也去掉了大部分繁琐的样板。对架构来说，这没有任何改变：store 是 `data-access` 私有的，composable 是入口。

### 13.2. 为库关闭自动导入

Nuxt 会自动导入组件和 composable。这在小应用中很方便，对边界来说却是致命的：**从未写出的导入无法被 lint 检查。** 如果 billing 中的功能可以在没有 `import` 语句的情况下使用 `useWorkOrders()`，lint 规则就永远看不到这次越界。

Fleetline 的 Nuxt 应用中的规则：

- 库通过路径别名以显式的 `import` 语句导入，绝不注册为自动导入目录；
- 领域不是 Nuxt layer，因为 layer 会把它们的组件和 composable 自动导入到应用中；
- 应用只在自己的 `pages/` 和 `layouts/` 中保留对 Vue 和 Nuxt API 的自动导入，库代码从 `#imports` 导入 Nuxt 函数。

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

返回 `byId`、`filter` 和 `error`，是为了让 Pinia 把它们序列化到服务端渲染的 payload 中，使浏览器以相同的状态启动。

### 13.4. Facade composable

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

key 是 `depotId` 的函数，所以切换车场时会重新获取数据。在服务器上，`useAsyncData` 会等待数据；在浏览器中，页面从 payload 进行水合，不会发出第二次请求。

### 13.5. feature、ui 和页面

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

### 13.6. Nuxt 特有的陷阱

- **对 `.vue` 文件执行 lint** 需要在 ESLint 配置中使用 `vue-eslint-parser`，否则边界规则会悄无声息地跳过所有组件。第 8.2 节中的 `files` 模式正是因此包含了 `**/*.vue`。
- **每个请求一个 store。** 使用 `@pinia/nuxt` 的 Pinia 已经在服务器上为每个请求创建一个 store。绝不要在库中用模块级的 `ref` 保存状态：在服务器上，它会在用户之间共享。
- **`useAsyncData` 属于 facade**，而不是 store。这样 store 仍然可以在测试和仅客户端的代码中使用。

## 14. 并排对照

:::diagram fe-frameworks

同一个用例在三个框架中的实现，逐个文件对照：

| 库 | Angular | React / Next.js | Vue / Nuxt |
|---|---|---|---|
| `model` | `work-order.ts` | 同一个文件 | 同一个文件 |
| `data-access` 状态 | `createFeature` + `createEntityAdapter` | `createSlice` + `createEntityAdapter` | Pinia setup store |
| `data-access` effect | 函数式 `createEffect` | listener 中间件 | 异步 store action + `useAsyncData` |
| `data-access` facade | `WorkOrdersFacade`（signal） | `useWorkOrders()`（值） | `useWorkOrders()`（ref） |
| `ui` | `input()` / `output()` | props / 回调 | `defineProps` / `defineEmits` |
| `feature` | 独立组件 | 客户端组件 | 单文件组件 |
| `shell` | 带有 `providers` 的 `Routes` | 布局组件、路由段 | 布局 + 路由中间件 |
| 应用路由 | `loadChildren` | `page.tsx` | `pages/*.vue` |
| 边界 | `@nx/enforce-module-boundaries` | 同一条规则 | 同一条规则，配合 `vue-eslint-parser` |

在三者中保持完全一致的有：每个文件所在的文件夹、标签、lint 规则、`model` 库、facade 的成员，以及 `model` 库的测试。在 Fleetline 各个应用之间切换的开发者，需要重新学习的只有框架本身。

## 15. 按库类型测试

每种类型都有一种自然的测试方式，而边界让每一种测试都很廉价。

| 类型 | 测试 | 速度 | 模拟什么 |
|---|---|---|---|
| `model`、`util` | 普通单元测试，不需要框架 | 毫秒级 | 什么都不模拟 |
| `data-access` 的 reducer、selector | 纯函数测试 | 毫秒级 | 什么都不模拟 |
| `data-access` 的 effect / listener | 使用假 HTTP 客户端的测试 | 快 | HTTP |
| facade | 与真实 store 的集成测试 | 快 | HTTP |
| `ui` | 组件测试，Storybook 中的 story | 快 | 什么都不模拟，它只有输入 |
| `feature` | 使用假 facade 的组件测试 | 快 | facade |
| 应用 | 用 Playwright 做端到端测试，覆盖少数流程 | 慢 | 后端，或什么都不模拟 |

reducer 测试不需要 TestBed：

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

feature 测试提供一个假 facade，因为组件看不到其他任何东西：

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

像 `aWorkOrder` 这样的测试数据构建器位于 `model` 的二级入口（`@fleetline/maintenance/model/testing`）中，因此每个框架的测试都使用同一套构建器。

## 16. 逐步成长与迁移

没有人一开始就有七十个库。Fleetline 起初是一个带有 `src/app` 文件夹的 Angular 应用；下面的步骤是实践中行之有效的顺序。

### 16.1. 八步迁移

1. **围绕应用创建工作区。** 在现有仓库中运行 `nx init`。此时什么都不移动。
2. **在纸上画出领域。** 使用业务语言：调度员、客户和财务在谈论什么？预计会有六到十个领域。把它们写进 README。
3. **以警告的形式启用规则。** 用 `'warn'` 添加第 8.2 节的 lint 配置。数一数警告数量；这就是你的基线。
4. **先抽取 `model` 和 `util`。** 它们没有依赖，移动它们是安全的，而之后的每一步都需要它们。使用 `nx g @nx/workspace:move`。
5. **按领域抽取 `ui`。** 每个只有输入和输出的组件都移过去。注入 store 的组件暂时留在原处。
6. **按领域切出 `data-access`。** 按领域拆分根 store；把每个 store feature 及其 effect 和 HTTP 移到领域的 `data-access` 中，并在领域的路由上注册。
7. **把页面移到 `feature-*`，把路由移到 `feature-shell`。** 应用缩减为只剩路由和 provider。
8. **把规则切换为 `'error'`，并添加 CODEOWNERS。** 从此以后，新的越界会让 CI 失败。

第 4 到第 7 步逐个领域进行，应用在各步之间照常发布。在 Fleetline，整个迁移与功能开发并行，用了四个月，一次一个领域，从最小的领域（`notifications`）开始，以便熟悉这些操作。

### 16.2. 常见的错误

- **名为 `common` 或 `core` 的领域。** 它会变成新的 `shared/`。每个概念都有业务上的所有者；把它找出来。
- **按页面而不是按业务语言切分领域。** “仪表盘”不是领域；它是一个通过各领域的 API 从多个领域读取数据的功能。
- **重新导出一切的 API 库。** 这样边界就只是装饰。只导出其他团队真正使用的东西，其余一概不导出。
- **禁用 lint 的注释行。** 针对边界规则的一个 `eslint-disable`，一年之内就会变成四十个。例外写进配置，并在 pull request 中说明原因。

### 16.3. 何时拆分一个库

- 一个 `data-access` 包含三四个以上的 store feature，或由两个团队拥有：按子领域拆分。
- 一个 `ui` 库只被一个功能导入：把它合并回那个功能或者保留它，但不要把它移到 `shared`。
- 一个 `feature` 包含多个互不相关的路由：每个用例一个库。
- 一个领域的库大多由另一个团队拥有：要么领域切分错了，要么团队边界划错了。

### 16.4. 何时这套架构过重

对于一个应用、一个团队、一两个领域的情况，完整的结构成本高于收益。可以先在一个项目内部使用文件夹（`src/domains/<domain>/feature-…`、`ui-…`、`data-access`、`model`），并用 Sheriff 来执行规则（第 8.4 节）。之后把这些文件夹迁移为 Nx 库只是一个机械的步骤，因为依赖规则已经成立。

## 17. 常见问题

**所有状态都需要 NgRx 吗？**
不需要。多个功能读取的、共享且长期存在的状态放进 store。表单状态、面板的展开/收起，以及其他由单个组件拥有的状态留在组件中，使用 signal 或组件级的 Signal Store。

**NgRx Store 还是 NgRx Signal Store？**
两者都适合这套架构，都位于 `data-access` 中，facade 隐藏了这个选择。Fleetline 在事件日志和 devtools 能带来回报的地方（maintenance、调度）使用 Store，在较简单的领域（fleet 摘要、通知）使用 Signal Store。

**facade 不就是多了一层吗？**
是的，第 10 节说明了它何时值得。在 React 和 Vue 中，hook 或 composable 本来就是共享状态访问的惯用方式，所以在那里 facade 几乎没有成本。

**每个领域从第一天起就应该有 `api` 库吗？**
不需要。在另一个领域第一次需要某样东西时再创建它。在那之前，领域完全是私有的，这是最好的边界。

**这是微前端吗？**
不是。这里的一切都为每个应用文件夹构建出一个应用。如果组织将来需要独立部署，同样的领域切分就是拆分微前端的天然接缝。

**React、Vue 和 Angular 真的能共享库吗？**
它们共享带有 `framework:agnostic` 标签的 `model` 和 `util` 库，以及测试数据构建器。组件和 store 按框架各自实现。在 Fleetline 中，大约五分之一的前端代码与框架无关。

**哪里可以进一步阅读？**
Manfred Steyer 的文章和 [angulararchitects.io](https://www.angulararchitects.io/) 上的免费电子书 *Enterprise Angular*、关于模块边界的 [Nx 文档](https://nx.dev/)、[Sheriff](https://github.com/softarc-consulting/sheriff)，以及 [NgRx 文档](https://ngrx.io/)。
