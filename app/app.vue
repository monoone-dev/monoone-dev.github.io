<script setup lang="ts">
import * as uiLocales from '@nuxt/ui/locale'
import { projects, site } from '~/data/site'

const { t, locale } = useI18n()
const { app, public: { i18n } } = useRuntimeConfig()

const asset = (file: string) => `${app.baseURL}${file}`
const absolute = (file: string) => `${(i18n.baseUrl as string).replace(/\/$/, '')}${asset(file)}`

const i18nHead = useLocaleHead()

useHead(() => ({
  htmlAttrs: { lang: i18nHead.value.htmlAttrs.lang },
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: asset('favicon.svg') },
    ...(i18nHead.value.link ?? [])
  ],
  meta: [
    ...(i18nHead.value.meta ?? []),
    { name: 'theme-color', content: '#fafafa', media: '(prefers-color-scheme: light)' },
    { name: 'theme-color', content: '#0a0a0a', media: '(prefers-color-scheme: dark)' }
  ]
}))

const title = computed(() => `${site.name} — ${t('meta.title')}`)

useSeoMeta({
  title,
  description: () => t('meta.description'),
  ogType: 'website',
  ogSiteName: site.name,
  ogTitle: title,
  ogDescription: () => t('meta.description'),
  ogImage: absolute('og-image.png'),
  ogImageWidth: 1024,
  ogImageHeight: 1024,
  ogImageAlt: site.name,
  twitterCard: 'summary_large_image'
})

const home = absolute('')
const structuredData = computed(() => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${home}#organization`,
      'name': site.name,
      'url': home,
      'logo': absolute('og-image.png'),
      'sameAs': [site.github]
    },
    {
      '@type': 'WebSite',
      '@id': `${home}#website`,
      'name': site.name,
      'url': home,
      'description': t('meta.description'),
      'inLanguage': i18nHead.value.htmlAttrs.lang,
      'publisher': { '@id': `${home}#organization` }
    },
    ...projects.map(project => ({
      '@type': 'SoftwareApplication',
      'name': project.name,
      'description': t(`${project.key}.tagline`),
      'applicationCategory': project.category,
      ...(project.meta.includes('macos') && { operatingSystem: t(`${project.key}.meta.macos`) }),
      'url': project.links.find(link => link.key === 'site' || link.key === 'docs')?.to,
      ...(project.links.some(link => link.key === 'download') && {
        downloadUrl: project.links.find(link => link.key === 'download')?.to
      }),
      ...(project.links.some(link => link.key === 'github') && {
        sameAs: [project.links.find(link => link.key === 'github')?.to]
      }),
      'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
      'publisher': { '@id': `${home}#organization` }
    }))
  ]
}))

useHead(() => ({
  script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(structuredData.value) }]
}))

const uiLocale = computed(() => {
  const code = (locale.value === 'zh' ? 'zh_cn' : locale.value) as keyof typeof uiLocales
  return uiLocales[code] ?? uiLocales.en
})
</script>

<template>
  <UApp :locale="uiLocale">
    <AppHeader />
    <UMain>
      <NuxtPage />
    </UMain>
    <AppFooter />
  </UApp>
</template>
