<script setup lang="ts">
import { projects, upcoming } from '~/data/site'

const { t } = useI18n()
const localePath = useLocalePath()

const items = computed(() => [
  ...projects.map(project => ({
    name: project.name,
    mark: project.mark,
    to: localePath({ path: '/projects', hash: `#${project.key}` }),
    status: project.stage ? t(`stage.${project.stage}`) : t('lineup.available'),
    soon: false
  })),
  ...upcoming.map(product => ({
    name: product.name,
    mark: product.mark,
    to: '#upcoming',
    status: t('lineup.soon'),
    soon: true
  }))
])

const split = (name: string) => (name.endsWith('One') ? [name.slice(0, -3), 'One'] : [name, ''])
</script>

<template>
  <nav
    :aria-label="t('lineup.label')"
    class="grid grid-cols-2 gap-3 sm:grid-cols-5"
  >
    <Reveal
      v-for="(item, i) in items"
      :key="item.name"
      :delay="i * 70"
      :class="['min-w-0', i === items.length - 1 && 'max-sm:col-span-2']"
    >
      <NuxtLink
        :to="item.to"
        class="lineup-item group flex h-full flex-col items-start gap-3 rounded-2xl border border-default bg-default p-4 sm:gap-4"
      >
        <span class="lineup-item__icon size-10 shrink-0 sm:size-12">
          <ProductMark :mark="item.mark" />
        </span>
        <span class="w-full min-w-0">
          <span class="wordmark block truncate text-sm text-highlighted sm:text-base">
            <b>{{ split(item.name)[0] }}</b><span>{{ split(item.name)[1] }}</span>
          </span>
          <span class="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-dimmed">
            <span
              class="lineup-item__dot"
              :class="{ 'lineup-item__dot--soon': item.soon }"
            />
            {{ item.status }}
          </span>
        </span>
      </NuxtLink>
    </Reveal>
  </nav>
</template>
