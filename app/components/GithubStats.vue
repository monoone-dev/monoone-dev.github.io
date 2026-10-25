<script setup lang="ts">
import { site } from '~/data/site'

const { t } = useI18n()
const { data: stats } = useGithubStats()
</script>

<template>
  <Transition name="fade">
    <div
      v-if="stats"
      class="flex flex-wrap items-center gap-2 font-mono text-xs"
    >
      <UButton
        :to="site.github"
        target="_blank"
        icon="i-lucide-star"
        :label="t('stats.stars', stats.stars)"
        color="neutral"
        variant="soft"
        size="xs"
      />
      <UButton
        :to="site.github"
        target="_blank"
        icon="i-lucide-users"
        :label="t('stats.followers', stats.followers)"
        color="neutral"
        variant="soft"
        size="xs"
      />
    </div>
  </Transition>
</template>
