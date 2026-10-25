<script setup lang="ts">
import GoOneMark from './GoOneMark.vue'
import IndexOneMark from './IndexOneMark.vue'
import RigOneMark from './RigOneMark.vue'
import SomaOneMark from './SomaOneMark.vue'
import SurfaceOneMark from './SurfaceOneMark.vue'

const marks: Record<string, Component> = { IndexOneMark, RigOneMark, SurfaceOneMark, SomaOneMark, GoOneMark }

defineProps<{ mark: string }>()
</script>

<template>
  <component :is="marks[mark]" />
</template>
