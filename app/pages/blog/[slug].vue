<script setup lang="ts">
import { findPost } from '#shared/blog'
import { site } from '~/data/site'

const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { app, public: { i18n } } = useRuntimeConfig()

const post = findPost(String(route.params.slug))
if (!post) {
  throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })
}

const { data: rendered } = await useBlogPost(post.slug)

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(`${iso}T12:00:00Z`))

const postTitle = computed(() => t(`blog.posts.${post.key}.title`))
const postDescription = computed(() => t(`blog.posts.${post.key}.description`))
const title = computed(() => `${postTitle.value} — ${site.name}`)

useSeoMeta({
  title,
  description: postDescription,
  ogType: 'article',
  ogTitle: title,
  ogDescription: postDescription,
  articlePublishedTime: post.date,
  articleModifiedTime: post.date
})

// TechArticle structured data, in the page's language
const url = `${(i18n.baseUrl as string).replace(/\/$/, '')}${app.baseURL}`
useHead(() => ({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      'headline': postTitle.value,
      'description': postDescription.value,
      'inLanguage': locale.value,
      'datePublished': post.date,
      'dateModified': post.date,
      'version': post.version,
      'url': `${url}${localePath(`/blog/${post.slug}`).replace(/^\//, '')}`,
      'publisher': { '@type': 'Organization', 'name': site.name, 'url': url }
    })
  }]
}))
</script>

<template>
  <UContainer class="py-12 sm:py-16">
    <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-12 xl:gap-16">
      <article class="min-w-0">
        <UButton
          :to="localePath('/blog')"
          icon="i-lucide-arrow-left"
          :label="t('blog.back')"
          color="neutral"
          variant="link"
          class="px-0"
        />

        <header class="mt-6 border-b border-default pb-8">
          <div class="flex flex-wrap items-center gap-3 text-sm text-muted">
            <UBadge
              v-if="post.version"
              :label="t('blog.version', { version: post.version })"
              color="neutral"
              variant="solid"
              class="font-mono"
            />
            <time :datetime="post.date">{{ formatDate(post.date) }}</time>
            <span v-if="rendered">· {{ t('blog.minutes', { n: rendered.minutes }, rendered.minutes) }}</span>
          </div>
          <h1 class="mt-4 text-3xl sm:text-5xl font-semibold tracking-tight text-balance wrap-break-word">
            {{ postTitle }}
          </h1>
          <p class="mt-4 text-lg text-muted text-balance">
            {{ postDescription }}
          </p>
        </header>

        <details
          v-if="rendered?.toc.length"
          class="blog-toc-mobile lg:hidden"
        >
          <summary>{{ t('blog.onThisPage') }}</summary>
          <BlogToc
            :links="rendered.toc"
            :title="t('blog.onThisPage')"
          />
        </details>

        <BlogProse
          v-if="rendered"
          :parts="rendered.parts"
        />
      </article>

      <aside
        v-if="rendered?.toc.length"
        class="max-lg:hidden"
      >
        <div class="sticky top-[calc(var(--ui-header-height)+2rem)] max-h-[calc(100vh-var(--ui-header-height)-4rem)] overflow-y-auto">
          <BlogToc
            :links="rendered.toc"
            :title="t('blog.onThisPage')"
          />
        </div>
      </aside>
    </div>
  </UContainer>
</template>
