<script setup lang="ts">
import type { Project } from '~/data/site'

const props = defineProps<{ project: Project }>()

const { t } = useI18n()
const localePath = useLocalePath()
const k = (path: string) => t(`${props.project.key}.${path}`)

const word = computed(() => {
  const name = props.project.name
  return name.endsWith('One') ? { head: name.slice(0, -3), tail: 'One' } : { head: name, tail: '' }
})

const highlights = computed(() => props.project.features.slice(0, 3))
</script>

<template>
  <article
    class="project-card group relative flex h-full flex-col rounded-3xl border border-default bg-default p-6 sm:p-8"
    :style="project.accent && { '--accent-from': project.accent[0], '--accent-to': project.accent[1] }"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="project-card__icon size-16 shrink-0">
        <ProductMark :mark="project.mark" />
      </div>
      <div class="flex flex-wrap justify-end gap-1.5">
        <UBadge
          :label="k('status')"
          color="neutral"
          variant="outline"
          class="rounded-full"
        />
        <UBadge
          v-if="project.stage"
          :label="t(`stage.${project.stage}`)"
          color="neutral"
          variant="solid"
          :class="['rounded-full', project.accent && 'stage-badge']"
        />
      </div>
    </div>

    <h3 class="wordmark mt-6 text-3xl text-highlighted">
      <b>{{ word.head }}</b><span>{{ word.tail }}</span>
    </h3>
    <p class="mt-2 font-medium text-toned text-pretty">
      {{ k('tagline') }}
    </p>

    <ul class="mt-6 flex flex-col gap-3 border-t border-default pt-6">
      <li
        v-for="feature in highlights"
        :key="feature.key"
        class="flex items-center gap-3 text-sm"
      >
        <UIcon
          :name="feature.icon"
          class="size-4 shrink-0 text-highlighted"
        />
        <span class="text-muted">{{ k(`features.${feature.key}.title`) }}</span>
      </li>
    </ul>

    <p class="mt-6 font-mono text-xs text-dimmed">
      {{ project.meta.map(item => k(`meta.${item}`)).join(' · ') }}
    </p>

    <div class="mt-auto flex flex-wrap items-center gap-2 pt-6">
      <UButton
        :label="t('projects.more')"
        :to="localePath({ path: '/projects', hash: `#${project.key}` })"
        trailing-icon="i-lucide-arrow-right"
        class="nudge-x"
      />
      <ProjectLinks
        :links="project.links"
        class="ms-auto"
      />
    </div>
  </article>
</template>
