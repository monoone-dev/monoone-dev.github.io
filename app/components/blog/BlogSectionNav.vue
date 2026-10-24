<script setup lang="ts">
import type { BlogPost } from '#shared/blog'

const props = defineProps<{
  post: BlogPost
  toc: TocLink[]
  /** 0 is the overview, 1… the sections */
  current: number
}>()

const { t } = useI18n()
const localePath = useLocalePath()

const active = ref<string>()
let observer: IntersectionObserver | undefined

const subsections = computed(() => props.toc[props.current - 1]?.children ?? [])

// On a section page, the subsection whose heading last crossed the top fifth of the screen is the one being read
onMounted(() => {
  const headings = subsections.value
    .map(link => document.getElementById(link.id))
    .filter((heading): heading is HTMLElement => heading !== null)
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter(entry => entry.isIntersecting)
      if (visible.length) active.value = visible[0]!.target.id
    },
    { rootMargin: '0px 0px -80% 0px' }
  )
  headings.forEach(heading => observer?.observe(heading))
})

onBeforeUnmount(() => observer?.disconnect())

const pagePath = (number: number) =>
  localePath(number === 0 ? `/blog/${props.post.slug}` : `/blog/${props.post.slug}/${props.post.sections[number - 1]}`)
</script>

<template>
  <nav
    class="blog-toc"
    :aria-label="t('blog.contents')"
  >
    <p class="blog-toc-title">
      {{ t('blog.contents') }}
    </p>
    <ul>
      <li>
        <NuxtLink
          :to="pagePath(0)"
          :class="{ active: current === 0 }"
          :aria-current="current === 0 ? 'page' : undefined"
        >{{ t('blog.overview') }}</NuxtLink>
      </li>
      <li
        v-for="(link, i) in toc"
        :key="link.id"
      >
        <NuxtLink
          :to="pagePath(i + 1)"
          :class="{ active: current === i + 1 }"
          :aria-current="current === i + 1 ? 'page' : undefined"
        >{{ link.text }}</NuxtLink>
        <ul v-if="current === i + 1 && link.children.length">
          <li
            v-for="child in link.children"
            :key="child.id"
          >
            <a
              :href="`#${child.id}`"
              :class="{ active: active === child.id }"
            >{{ child.text }}</a>
          </li>
        </ul>
      </li>
    </ul>
  </nav>
</template>
