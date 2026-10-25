<script setup lang="ts">
import { principles, projects, site } from '~/data/site'

const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <div>
    <UPageHero
      class="hero"
      orientation="horizontal"
      :ui="{
        container: 'lg:gap-12 py-16 sm:py-24 lg:py-32',
        title: 'text-4xl sm:text-6xl xl:text-7xl text-balance wrap-break-word',
        description: 'text-balance text-lg',
        links: 'justify-start'
      }"
    >
      <template #top>
        <HeroBackdrop />
      </template>

      <template #headline>
        <UBadge
          :label="t('hero.badge')"
          color="neutral"
          variant="outline"
          class="enter rounded-full font-mono px-3"
          style="--enter-delay: 120ms"
        />
      </template>

      <template #title>
        <span
          class="enter block"
          style="--enter-delay: 200ms"
        >{{ t('hero.title1') }}</span>
        <span
          class="enter block text-muted font-light"
          style="--enter-delay: 300ms"
        >{{ t('hero.title2') }}</span>
      </template>

      <template #description>
        <span
          class="enter block"
          style="--enter-delay: 420ms"
        >{{ t('hero.description') }}</span>
      </template>

      <template #links>
        <div class="flex w-full flex-col items-start gap-6">
          <div
            class="enter flex flex-wrap gap-3"
            style="--enter-delay: 540ms"
          >
            <UButton
              :label="t('hero.cta')"
              to="#projects"
              trailing-icon="i-lucide-arrow-down"
              size="xl"
              class="nudge"
            />
            <UButton
              label="GitHub"
              :to="site.github"
              target="_blank"
              icon="i-simple-icons-github"
              size="xl"
              color="neutral"
              variant="outline"
            />
          </div>
          <GithubStats />
        </div>
      </template>

      <HeroOrbit class="enter" />
    </UPageHero>

    <UContainer class="relative pb-8">
      <ProductLineup />
    </UContainer>

    <UPageSection
      id="principles"
      :headline="t('nav.principles')"
      :title="t('principles.title')"
      :description="t('principles.description')"
      :ui="{ headline: 'section-eyebrow' }"
    >
      <ul class="grid gap-px overflow-hidden rounded-3xl border border-default bg-(--ui-border) sm:grid-cols-2 lg:grid-cols-4">
        <Reveal
          v-for="(principle, i) in principles"
          :key="principle.key"
          as="li"
          :delay="i * 90"
          class="principle flex flex-col bg-default p-6 sm:p-8"
        >
          <div class="flex items-center justify-between">
            <span class="principle__icon flex size-10 items-center justify-center rounded-xl border border-default bg-elevated">
              <UIcon
                :name="principle.icon"
                class="size-5 text-highlighted"
              />
            </span>
            <span class="mono-index text-xs">{{ String(i + 1).padStart(2, '0') }}</span>
          </div>
          <p class="mt-8 font-semibold text-highlighted">
            {{ t(`principles.items.${principle.key}.title`) }}
          </p>
          <p class="mt-2 text-sm text-muted leading-relaxed">
            {{ t(`principles.items.${principle.key}.description`) }}
          </p>
        </Reveal>
      </ul>
    </UPageSection>

    <UPageSection
      id="projects"
      :headline="t('nav.projects')"
      :title="t('projects.title')"
      :description="t('projects.description')"
      :ui="{ headline: 'section-eyebrow' }"
    >
      <div class="grid gap-6 lg:grid-cols-3">
        <Reveal
          v-for="(project, i) in projects"
          :key="project.name"
          :delay="i * 100"
        >
          <ProjectCard :project="project" />
        </Reveal>
      </div>
      <div class="mt-10 flex justify-center">
        <UButton
          :label="t('projects.all')"
          :to="localePath('/projects')"
          trailing-icon="i-lucide-arrow-right"
          color="neutral"
          variant="outline"
          size="lg"
          class="nudge-x"
        />
      </div>
    </UPageSection>

    <UPageSection
      id="upcoming"
      :headline="t('upcoming.headline')"
      :title="t('upcoming.title')"
      :description="t('upcoming.description')"
      :ui="{ headline: 'section-eyebrow' }"
    >
      <UpcomingProducts />
    </UPageSection>

    <UPageSection id="contact">
      <Reveal>
        <div class="contact-panel relative overflow-hidden rounded-3xl px-6 py-14 text-center sm:px-16 sm:py-20">
          <div
            class="contact-panel__dots"
            aria-hidden="true"
          />
          <div class="relative mx-auto max-w-2xl">
            <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {{ t('contact.title') }}
            </h2>
            <p class="contact-panel__muted mt-4 text-lg text-balance">
              {{ t('contact.description') }}
            </p>
            <div class="mt-8 flex flex-wrap justify-center gap-3">
              <UButton
                :label="t('contact.issue')"
                :to="site.issues"
                target="_blank"
                icon="i-lucide-circle-dot"
                size="xl"
                class="contact-panel__primary"
              />
              <UButton
                :label="t('contact.discussions')"
                :to="site.discussions"
                target="_blank"
                icon="i-lucide-messages-square"
                size="xl"
                class="contact-panel__secondary"
              />
            </div>
          </div>
        </div>
      </Reveal>
    </UPageSection>
  </div>
</template>
