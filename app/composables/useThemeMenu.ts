import type { DropdownMenuItem } from '@nuxt/ui'

const modes = [
  { value: 'light', icon: 'i-lucide-sun' },
  { value: 'dark', icon: 'i-lucide-moon' },
  { value: 'system', icon: 'i-lucide-monitor' }
] as const

export function useThemeMenu() {
  const colorMode = useColorMode()
  const { t } = useI18n()

  const items = computed<DropdownMenuItem[]>(() =>
    modes.map(m => ({
      label: t(`theme.${m.value}`),
      icon: m.icon,
      type: 'checkbox' as const,
      checked: colorMode.preference === m.value,
      onSelect: () => { colorMode.preference = m.value }
    }))
  )

  const icon = computed(() => modes.find(m => m.value === colorMode.preference)?.icon ?? 'i-lucide-monitor')

  return { items, icon }
}
