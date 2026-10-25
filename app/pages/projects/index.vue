<script setup lang="ts">
import { projects, site } from '~/data/site'

const { t } = useI18n()

const title = computed(() => `${t('projects.page.title')} — ${site.name}`)

useSeoMeta({
  title,
  description: () => t('projects.page.description'),
  ogTitle: title,
  ogDescription: () => t('projects.page.description'),
  twitterTitle: title,
  twitterDescription: () => t('projects.page.description')
})

const split = (name: string) => (name.endsWith('One') ? [name.slice(0, -3), 'One'] : [name, ''])
</script>

<template>
  <div>
    <UContainer class="pt-16 sm:pt-24">
      <div class="max-w-3xl">
        <p class="section-eyebrow enter">
          {{ t('projects.page.eyebrow') }}
        </p>
        <h1
          class="enter mt-3 text-4xl sm:text-6xl font-semibold tracking-tight text-balance text-highlighted"
          style="--enter-delay: 100ms"
        >
          {{ t('projects.page.title') }}
        </h1>
        <p
          class="enter mt-5 text-lg text-muted text-balance"
          style="--enter-delay: 200ms"
        >
          {{ t('projects.page.description') }}
        </p>
      </div>

      <nav
        :aria-label="t('projects.page.title')"
        class="enter mt-10 flex flex-wrap gap-2"
        style="--enter-delay: 300ms"
      >
        <a
          v-for="project in projects"
          :key="project.key"
          :href="`#${project.key}`"
          class="lineup-item flex items-center gap-2.5 rounded-full border border-default bg-default py-1.5 ps-1.5 pe-4"
        >
          <span class="size-7">
            <ProductMark :mark="project.mark" />
          </span>
          <span class="wordmark text-sm text-highlighted">
            <b>{{ split(project.name)[0] }}</b><span>{{ split(project.name)[1] }}</span>
          </span>
        </a>
      </nav>
    </UContainer>

    <UContainer class="py-12 sm:py-16">
      <div class="flex flex-col gap-12">
        <ProjectShowcase
          v-for="(project, i) in projects"
          :key="project.key"
          :project="project"
          :index="i"
          class="scroll-mt-24"
        />
      </div>
    </UContainer>

    <UPageSection
      id="upcoming"
      :headline="t('upcoming.headline')"
      :title="t('upcoming.title')"
      :description="t('upcoming.description')"
      :ui="{ headline: 'section-eyebrow' }"
    >
      <UpcomingProducts />
    </UPageSection>
  </div>
</template>
