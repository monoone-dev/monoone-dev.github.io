<script setup lang="ts">
import { projects, upcoming } from '~/data/site'

const angles = [-90, -18, 198, 54, 126]

const nodes = [
  ...projects.map(project => ({ name: project.name, mark: project.mark, soon: false })),
  ...upcoming.map(product => ({ name: product.name, mark: product.mark, soon: true }))
].slice(0, angles.length).map((node, i) => {
  const angle = (angles[i]! * Math.PI) / 180
  return {
    ...node,
    left: `${50 + Math.cos(angle) * 40}%`,
    top: `${50 + Math.sin(angle) * 40}%`,
    delay: `${600 + i * 120}ms`
  }
})
</script>

<template>
  <div
    class="hero-orbit"
    role="img"
    :aria-label="`MonoOne: ${nodes.map(node => node.name).join(', ')}`"
  >
    <svg
      viewBox="0 0 100 100"
      class="hero-orbit__rings"
      aria-hidden="true"
    >
      <circle
        cx="50"
        cy="50"
        r="49"
        class="hero-orbit__ring hero-orbit__ring--faint"
      />
      <circle
        cx="50"
        cy="50"
        r="40"
        class="hero-orbit__ring hero-orbit__ring--dashed"
      />
      <circle
        cx="50"
        cy="50"
        r="24"
        class="hero-orbit__ring"
      />
    </svg>

    <div class="hero-orbit__core hero-mark">
      <MonoMark class="size-full" />
    </div>

    <div
      v-for="node in nodes"
      :key="node.name"
      class="hero-orbit__node"
      :class="{ 'hero-orbit__node--soon': node.soon }"
      :style="{ left: node.left, top: node.top, '--enter-delay': node.delay }"
    >
      <div class="hero-orbit__tile enter">
        <ProductMark :mark="node.mark" />
      </div>
    </div>
  </div>
</template>
