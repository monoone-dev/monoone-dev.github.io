<script setup lang="ts">
import { posts } from '#shared/blog'
import { locales } from '#shared/locales'
import { site } from '~/data/site'

const { t, locale } = useI18n()
const localePath = useLocalePath()

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(`${iso}T12:00:00Z`))

const title = computed(() => `${t('blog.title')} — ${site.name}`)

useSeoMeta({
  title,
  description: () => t('blog.description'),
  ogTitle: title,
  ogDescription: () => t('blog.description'),
  twitterTitle: title,
  twitterDescription: () => t('blog.description')
})

// schema.org Blog with its posts, in the page's language
const { app, public: { i18n } } = useRuntimeConfig()
const absolute = (path: string) =>
  `${(i18n.baseUrl as string).replace(/\/$/, '')}${app.baseURL.replace(/\/$/, '')}${localePath(path).replace(/\/?$/, '/')}`

useHead(() => ({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Blog',
      'name': `${t('blog.title')} — ${site.name}`,
      'description': t('blog.description'),
      'url': absolute('/blog'),
      'inLanguage': locales.find(l => l.code === locale.value)?.language ?? locale.value,
      'publisher': { '@type': 'Organization', 'name': site.name, 'url': site.url },
      'blogPost': posts.map(post => ({
        '@type': 'TechArticle',
        'headline': t(`blog.posts.${post.key}.title`),
        'description': t(`blog.posts.${post.key}.description`),
        'url': absolute(`/blog/${post.slug}`),
        'datePublished': post.date,
        'dateModified': post.date
      }))
    })
  }]
}))
</script>

<template>
  <UContainer class="py-16 sm:py-24">
    <div class="max-w-3xl">
      <p class="font-mono text-sm text-muted">
        {{ t('blog.eyebrow') }}
      </p>
      <h1 class="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight text-balance">
        {{ t('blog.title') }}
      </h1>
      <p class="mt-4 text-lg text-muted text-balance">
        {{ t('blog.description') }}
      </p>
    </div>

    <div class="mt-12 grid gap-6 lg:grid-cols-2">
      <UPageCard
        v-for="post in posts"
        :key="post.slug"
        :to="localePath(`/blog/${post.slug}`)"
        :icon="post.icon"
        :title="t(`blog.posts.${post.key}.title`)"
        :description="t(`blog.posts.${post.key}.description`)"
        variant="outline"
        spotlight
      >
        <template #footer>
          <div class="flex flex-wrap items-center gap-3 text-sm text-muted">
            <UBadge
              v-if="post.version"
              :label="t('blog.version', { version: post.version })"
              color="neutral"
              variant="outline"
              class="font-mono"
            />
            <time :datetime="post.date">{{ formatDate(post.date) }}</time>
            <span class="inline-flex items-center gap-1 text-highlighted">
              {{ t('blog.read') }}
              <UIcon name="i-lucide-arrow-right" />
            </span>
          </div>
        </template>
      </UPageCard>
    </div>
  </UContainer>
</template>
