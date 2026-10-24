<script setup lang="ts">
import type { BlogPost } from '#shared/blog'

defineProps<{
  post: BlogPost
  toc: TocLink[]
  current: number
}>()

const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <UContainer class="py-12 sm:py-16">
    <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-12 xl:gap-16">
      <article class="min-w-0">
        <nav
          class="blog-breadcrumb"
          :aria-label="t('blog.title')"
        >
          <NuxtLink :to="localePath('/blog')">
            {{ t('blog.title') }}
          </NuxtLink>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5 text-dimmed"
          />
          <NuxtLink
            v-if="current > 0"
            :to="localePath(`/blog/${post.slug}`)"
          >
            {{ t(`blog.posts.${post.key}.short`) }}
          </NuxtLink>
          <span
            v-else
            aria-current="page"
          >{{ t(`blog.posts.${post.key}.short`) }}</span>
        </nav>

        <header class="mt-6 border-b border-default pb-8">
          <slot name="header" />
        </header>

        <details
          v-if="toc.length"
          class="blog-toc-mobile lg:hidden"
        >
          <summary>{{ t('blog.contents') }}</summary>
          <BlogSectionNav
            :post="post"
            :toc="toc"
            :current="current"
          />
        </details>

        <slot />

        <BlogPager
          :post="post"
          :toc="toc"
          :current="current"
        />
      </article>

      <aside
        v-if="toc.length"
        class="max-lg:hidden"
      >
        <div class="sticky top-[calc(var(--ui-header-height)+2rem)] max-h-[calc(100vh-var(--ui-header-height)-4rem)] overflow-y-auto pb-8">
          <BlogSectionNav
            :post="post"
            :toc="toc"
            :current="current"
          />
        </div>
      </aside>
    </div>
  </UContainer>
</template>
