<script setup lang="ts">
const props = defineProps<{ links: TocLink[], title: string }>()

const active = ref<string>()
let observer: IntersectionObserver | undefined

// The section whose heading last crossed the top fifth of the screen is the one being read
onMounted(() => {
  const ids = props.links.flatMap(link => [link.id, ...link.children.map(child => child.id)])
  const headings = ids
    .map(id => document.getElementById(id))
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

const isOpen = (link: TocLink) =>
  active.value === link.id || link.children.some(child => child.id === active.value)
</script>

<template>
  <nav
    class="blog-toc"
    :aria-label="title"
  >
    <p class="blog-toc-title">
      {{ title }}
    </p>
    <ul>
      <li
        v-for="link in links"
        :key="link.id"
      >
        <a
          :href="`#${link.id}`"
          :class="{ active: active === link.id }"
        >{{ link.text }}</a>
        <ul v-if="link.children.length && isOpen(link)">
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
