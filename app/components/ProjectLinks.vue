<script setup lang="ts">
import type { Project } from '~/data/site'
import { linkIcons } from '~/data/site'

defineProps<{ links: Project['links'], size?: 'md' | 'lg' }>()

const { t } = useI18n()
</script>

<template>
  <div class="flex items-center gap-2">
    <UTooltip
      v-for="link in links"
      :key="link.key"
      :text="t(`projects.links.${link.key}`)"
    >
      <UButton
        :to="link.to"
        target="_blank"
        :icon="linkIcons[link.key]"
        :aria-label="t(`projects.links.${link.key}`)"
        color="neutral"
        variant="outline"
        :size="size ?? 'md'"
        square
      />
    </UTooltip>
  </div>
</template>
