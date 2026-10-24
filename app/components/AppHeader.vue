<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'
import { site } from '~/data/site'

const { t } = useI18n()
const localePath = useLocalePath()
const language = useLanguageMenu()
const theme = useThemeMenu()

const section = (id: string): NavigationMenuItem => ({
  label: t(`nav.${id}`),
  to: { path: localePath('/'), hash: `#${id}` }
})

const links = computed<NavigationMenuItem[]>(() => [
  section('principles'),
  section('projects'),
  { label: t('nav.blog'), to: localePath('/blog') },
  section('contact')
])

const github = computed<DropdownMenuItem>(() => ({
  label: 'GitHub',
  icon: 'i-simple-icons-github',
  to: site.github,
  target: '_blank'
}))

// Tablets: the links move into a menu, language/theme/GitHub stay in the bar
const linksMenu = computed<DropdownMenuItem[][]>(() => [links.value as DropdownMenuItem[]])

// Phones: one menu holds everything — links, language, theme and GitHub
const mobileMenu = computed<DropdownMenuItem[][]>(() => [
  links.value as DropdownMenuItem[],
  [
    { label: t('nav.language'), icon: language.icon.value, children: language.items.value },
    { label: t('theme.label'), icon: theme.icon.value, children: theme.items.value }
  ],
  [github.value]
])
</script>

<template>
  <UHeader
    :title="site.name"
    :to="localePath('/')"
    :toggle="false"
    class="backdrop-blur"
  >
    <template #title>
      <AppLogo />
    </template>

    <UNavigationMenu
      :items="links"
      variant="link"
    />

    <template #right>
      <div class="flex items-center gap-1 max-sm:hidden">
        <LanguageSwitcher />
        <ThemeMenu />
        <UButton
          :to="site.github"
          target="_blank"
          icon="i-simple-icons-github"
          color="neutral"
          variant="ghost"
          :aria-label="t('nav.github')"
        />
      </div>

      <UDropdownMenu
        :items="linksMenu"
        :content="{ align: 'end' }"
        :ui="{ content: 'min-w-44' }"
        class="max-sm:hidden lg:hidden"
      >
        <UButton
          icon="i-lucide-menu"
          color="neutral"
          variant="ghost"
          square
          :aria-label="t('nav.menu')"
          class="max-sm:hidden lg:hidden"
        />
      </UDropdownMenu>

      <UDropdownMenu
        :items="mobileMenu"
        :content="{ align: 'end' }"
        :ui="{ content: 'min-w-56' }"
      >
        <UButton
          icon="i-lucide-menu"
          color="neutral"
          variant="ghost"
          square
          :aria-label="t('nav.menu')"
          class="sm:hidden"
        />
      </UDropdownMenu>
    </template>
  </UHeader>
</template>
