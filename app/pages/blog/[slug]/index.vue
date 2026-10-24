<script setup lang="ts">
import { findPost } from '#shared/blog'

const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()

const post = findPost(String(route.params.slug))
if (!post) {
  throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })
}

const { data: overview } = await useBlogSection(post, 0)

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(`${iso}T12:00:00Z`))

const sectionPath = (i: number) => `/blog/${post.slug}/${post.sections[i]}`
const sections = computed(() =>
  (overview.value?.toc ?? []).map((link, i) => ({
    number: i + 1,
    name: link.text.replace(/^\d+\.\s*/, ''),
    path: sectionPath(i),
    children: link.children.length
  }))
)

useBlogSeo({
  post,
  title: () => t(`blog.posts.${post.key}.title`),
  description: () => t(`blog.posts.${post.key}.description`),
  path: `/blog/${post.slug}`,
  parts: () => sections.value.map(section => ({ name: section.name, path: section.path }))
})
</script>

<template>
  <BlogLayout
    v-if="overview"
    :post="post"
    :toc="overview.toc"
    :current="0"
  >
    <template #header>
      <div class="flex flex-wrap items-center gap-3 text-sm text-muted">
        <UBadge
          v-if="post.version"
          :label="t('blog.version', { version: post.version })"
          color="neutral"
          variant="solid"
          class="font-mono"
        />
        <time :datetime="post.date">{{ formatDate(post.date) }}</time>
        <span>· {{ t('blog.sections', { n: sections.length }, sections.length) }}</span>
        <span>· {{ t('blog.minutes', { n: overview.minutes }, overview.minutes) }}</span>
      </div>
      <h1 class="mt-4 text-3xl sm:text-5xl font-semibold tracking-tight text-balance wrap-break-word">
        {{ t(`blog.posts.${post.key}.title`) }}
      </h1>
      <p class="mt-4 text-lg text-muted text-balance">
        {{ t(`blog.posts.${post.key}.description`) }}
      </p>
    </template>

    <BlogProse :parts="overview.parts" />

    <section
      class="mt-12"
      aria-labelledby="blog-contents"
    >
      <h2
        id="blog-contents"
        class="text-2xl font-semibold tracking-tight text-highlighted"
      >
        {{ t('blog.contents') }}
      </h2>
      <ol class="blog-contents">
        <li
          v-for="section in sections"
          :key="section.number"
        >
          <NuxtLink :to="localePath(section.path)">
            <span class="blog-contents-number">{{ section.number }}</span>
            <span class="blog-contents-name">{{ section.name }}</span>
            <UIcon
              name="i-lucide-arrow-right"
              class="blog-contents-arrow"
            />
          </NuxtLink>
        </li>
      </ol>
      <UButton
        :to="localePath(sectionPath(0))"
        :label="t('blog.start')"
        trailing-icon="i-lucide-arrow-right"
        size="lg"
        class="mt-8"
      />
    </section>
  </BlogLayout>
</template>
