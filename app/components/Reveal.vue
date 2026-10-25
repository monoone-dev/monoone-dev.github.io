<script setup lang="ts">
const props = withDefaults(defineProps<{ as?: string, delay?: number }>(), { as: 'div', delay: 0 })

const el = useTemplateRef<HTMLElement>('el')
const visible = ref(false)
let observer: IntersectionObserver | undefined

onMounted(() => {
  if (!el.value) return
  observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return
    visible.value = true
    observer?.disconnect()
  }, { rootMargin: '0px 0px -10% 0px' })
  observer.observe(el.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <component
    :is="props.as"
    ref="el"
    class="reveal"
    :class="{ 'is-visible': visible }"
    :style="delay ? { '--reveal-delay': `${delay}ms` } : undefined"
  >
    <slot />
  </component>
</template>
