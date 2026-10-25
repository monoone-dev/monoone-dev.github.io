export default defineI18nConfig(() => ({
  fallbackLocale: 'en',
  pluralRules: {
    pl: (n: number) => {
      if (n === 0) return 0
      if (n === 1) return 1
      const ten = n % 10
      const hundred = n % 100
      return ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14) ? 2 : 3
    }
  }
}))
