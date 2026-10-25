<script setup lang="ts">
import type { Project } from '~/data/site'

import { projects, site } from '~/data/site'

const props = withDefaults(defineProps<{ project: Project, index?: number }>(), { index: 0 })

const { t } = useI18n()
const k = (path: string) => t(`${props.project.key}.${path}`)

const word = computed(() => {
  const name = props.project.name
  return name.endsWith('One') ? { head: name.slice(0, -3), tail: 'One' } : { head: name, tail: '' }
})

const pad = (n: number) => String(n).padStart(2, '0')
const counter = computed(() => pad(props.index + 1))
const total = pad(projects.length)

const { data: stats } = useGithubStats()
const stars = computed(() => stats.value?.repos[props.project.repo])
</script>

<template>
  <article
    :id="project.key"
    class="showcase relative rounded-3xl border border-default bg-default overflow-hidden"
    :style="project.accent && { '--accent-from': project.accent[0], '--accent-to': project.accent[1] }"
  >
    <span class="mono-index absolute end-6 top-6 text-sm sm:end-10 sm:top-10 lg:end-14 lg:top-14">{{ counter }} / {{ total }}</span>

    <div class="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12 lg:p-14">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :label="k('status')"
            color="neutral"
            variant="solid"
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

        <h3 class="wordmark mt-5 text-4xl sm:text-5xl text-highlighted">
          <b>{{ word.head }}</b><span>{{ word.tail }}</span>
        </h3>
        <p class="mt-3 text-xl font-medium text-toned text-balance">
          {{ k('tagline') }}
        </p>
        <p class="mt-3 max-w-3xl text-muted leading-relaxed">
          {{ k('description') }}
        </p>
        <div class="mt-6 flex max-w-3xl gap-3 rounded-2xl border border-default bg-elevated/50 p-4">
          <UIcon
            name="i-lucide-user-round-check"
            class="mt-0.5 size-5 shrink-0 text-highlighted"
          />
          <p class="text-sm leading-relaxed">
            <span class="font-medium text-highlighted">{{ t('projects.audience') }}</span>{{ ' ' }}<span class="text-muted">{{ k('audience') }}</span>
          </p>
        </div>

        <div class="mt-7 flex flex-wrap items-center gap-3">
          <ProjectLinks
            :links="project.links"
            size="lg"
          />
          <UButton
            v-if="stars !== undefined"
            :to="`${site.github}/${project.repo}`"
            target="_blank"
            icon="i-lucide-star"
            :label="t('projects.star', { n: stars })"
            color="neutral"
            variant="ghost"
            size="lg"
          />
        </div>

        <ul class="mt-6 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-dimmed">
          <li
            v-for="item in project.meta"
            :key="item"
          >
            {{ k(`meta.${item}`) }}
          </li>
        </ul>
      </div>

      <div class="showcase__stage order-first lg:order-none">
        <div class="showcase__icon mx-auto w-32 sm:w-40 lg:w-44">
          <ProductMark :mark="project.mark" />
        </div>
      </div>
    </div>

    <div class="border-t border-default bg-elevated/40 p-6 sm:p-10">
      <p class="section-eyebrow">
        {{ t('projects.howItWorks') }}
      </p>
      <ol class="mt-6 grid gap-6 md:grid-cols-3 md:gap-10">
        <Reveal
          v-for="(step, i) in project.steps"
          :key="step.key"
          as="li"
          :delay="i * 90"
          class="step relative flex gap-4"
        >
          <span class="step__marker flex size-10 shrink-0 items-center justify-center rounded-full border border-default bg-default">
            <UIcon
              :name="step.icon"
              class="size-5 text-highlighted"
            />
          </span>
          <div>
            <p class="font-mono text-xs text-dimmed">
              {{ pad(i + 1) }}
            </p>
            <p class="mt-1 font-medium text-highlighted">
              {{ k(`steps.${step.key}.title`) }}
            </p>
            <p class="mt-1 text-sm text-muted leading-relaxed">
              {{ k(`steps.${step.key}.description`) }}
            </p>
          </div>
        </Reveal>
      </ol>
    </div>

    <ul class="grid gap-px border-t border-default bg-(--ui-border) sm:grid-cols-2 lg:grid-cols-3">
      <Reveal
        v-for="(feature, i) in project.features"
        :key="feature.key"
        as="li"
        :delay="(i % 3) * 80"
        class="feature flex gap-3 bg-default p-6 sm:p-8"
      >
        <UIcon
          :name="feature.icon"
          class="mt-0.5 size-5 shrink-0 text-highlighted"
        />
        <div>
          <p class="font-medium text-highlighted">
            {{ k(`features.${feature.key}.title`) }}
          </p>
          <p class="mt-1 text-sm text-muted leading-relaxed">
            {{ k(`features.${feature.key}.description`) }}
          </p>
        </div>
      </Reveal>
    </ul>
  </article>
</template>
