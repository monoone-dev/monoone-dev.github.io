<script setup lang="ts">
import type { Component } from 'vue'
import DiagramActor from './diagrams/DiagramActor.vue'
import DiagramChaos from './diagrams/DiagramChaos.vue'
import DiagramFeFlow from './diagrams/DiagramFeFlow.vue'
import DiagramFeFrameworks from './diagrams/DiagramFeFrameworks.vue'
import DiagramFeGrid from './diagrams/DiagramFeGrid.vue'
import DiagramFlows from './diagrams/DiagramFlows.vue'
import DiagramMigration from './diagrams/DiagramMigration.vue'
import DiagramPlatform from './diagrams/DiagramPlatform.vue'
import DiagramSlice from './diagrams/DiagramSlice.vue'
import DiagramTiers from './diagrams/DiagramTiers.vue'

defineProps<{ parts: PostPart[] }>()

const diagrams: Record<string, Component> = {
  'actor': DiagramActor,
  'chaos': DiagramChaos,
  'fe-flow': DiagramFeFlow,
  'fe-frameworks': DiagramFeFrameworks,
  'fe-grid': DiagramFeGrid,
  'flows': DiagramFlows,
  'migration': DiagramMigration,
  'platform': DiagramPlatform,
  'slice': DiagramSlice,
  'tiers': DiagramTiers
}
</script>

<template>
  <div class="prose-doc">
    <template
      v-for="(part, i) in parts"
      :key="i"
    >
      <div
        v-if="part.kind === 'html'"
        v-html="part.html"
      />
      <figure
        v-else-if="diagrams[part.name]"
        class="slat-diagram"
      >
        <component :is="diagrams[part.name]" />
      </figure>
    </template>
  </div>
</template>
