<script setup lang="ts">
import type { BlogPost } from '#shared/blog'

const props = defineProps<{
  post: BlogPost
  toc: TocLink[]
  current: number
}>()

const { t } = useI18n()
const localePath = useLocalePath()

const page = (number: number) => {
  if (number < 0 || number > props.toc.length) return null
  return {
    to: localePath(number === 0 ? `/blog/${props.post.slug}` : `/blog/${props.post.slug}/${props.post.sections[number - 1]}`),
    label: number === 0 ? t('blog.overview') : props.toc[number - 1]!.text
  }
}

const previous = computed(() => page(props.current - 1))
const next = computed(() => page(props.current + 1))
</script>

<template>
  <nav
    class="blog-pager"
    :aria-label="t('blog.contents')"
  >
    <NuxtLink
      v-if="previous"
      :to="previous.to"
      class="blog-pager-link"
      rel="prev"
    >
      <span class="blog-pager-hint">
        <UIcon name="i-lucide-arrow-left" />
        {{ t('blog.previous') }}
      </span>
      <span class="blog-pager-label">{{ previous.label }}</span>
    </NuxtLink>
    <span v-else />
    <NuxtLink
      v-if="next"
      :to="next.to"
      class="blog-pager-link blog-pager-next"
      rel="next"
    >
      <span class="blog-pager-hint">
        {{ t('blog.next') }}
        <UIcon name="i-lucide-arrow-right" />
      </span>
      <span class="blog-pager-label">{{ next.label }}</span>
    </NuxtLink>
  </nav>
</template>
