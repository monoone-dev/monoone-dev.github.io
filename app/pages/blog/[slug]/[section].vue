<script setup lang="ts">
import { findPost } from '#shared/blog'

const route = useRoute()
const { t } = useI18n()

const post = findPost(String(route.params.slug))
const number = post ? post.sections.indexOf(String(route.params.section)) + 1 : 0
if (!post || number === 0) {
  throw createError({ statusCode: 404, statusMessage: 'Section not found', fatal: true })
}

const { data: section } = await useBlogSection(post, number)

const name = computed(() => section.value?.title ?? '')

useBlogSeo({
  post,
  title: () => `${name.value} · ${t(`blog.posts.${post.key}.short`)}`,
  description: () => section.value?.summary || t(`blog.posts.${post.key}.description`),
  path: `/blog/${post.slug}/${post.sections[number - 1]}`,
  section: { number, name }
})
</script>

<template>
  <BlogLayout
    v-if="section"
    :post="post"
    :toc="section.toc"
    :current="number"
  >
    <template #header>
      <p class="font-mono text-sm text-muted">
        {{ t('blog.sectionOf', { n: number, total: post.sections.length }) }}
      </p>
      <h1 class="mt-3 text-3xl sm:text-5xl font-semibold tracking-tight text-balance wrap-break-word">
        {{ name }}
      </h1>
    </template>

    <BlogProse :parts="section.parts" />
  </BlogLayout>
</template>
