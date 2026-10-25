<script setup lang="ts">
const { t } = useI18n()
const { items, icon } = useThemeMenu()
</script>

<template>
  <ClientOnly>
    <UDropdownMenu
      :items="items"
      :content="{ align: 'end' }"
      :ui="{ content: 'min-w-40' }"
    >
      <UButton
        :icon="icon"
        color="neutral"
        variant="ghost"
        square
        :aria-label="t('theme.label')"
      />
    </UDropdownMenu>

    <template #fallback>
      <div class="size-8" />
    </template>
  </ClientOnly>
</template>
