import type { BlogPost } from '#shared/blog'
import { locales } from '#shared/locales'
import { site } from '~/data/site'

interface BlogPageSeo {
  post: BlogPost
  title: MaybeRefOrGetter<string>
  description: MaybeRefOrGetter<string>
  path: string
  section?: { number: MaybeRefOrGetter<number>, name: MaybeRefOrGetter<string> }
  parts?: MaybeRefOrGetter<{ name: string, path: string }[]>
}

export function useBlogSeo(page: BlogPageSeo) {
  const { t, locale } = useI18n()
  const localePath = useLocalePath()
  const { app, public: { i18n } } = useRuntimeConfig()

  const origin = (i18n.baseUrl as string).replace(/\/$/, '')
  const absolute = (path: string) => `${origin}${app.baseURL.replace(/\/$/, '')}${localePath(path).replace(/\/?$/, '/')}`

  const postTitle = computed(() => t(`blog.posts.${page.post.key}.title`))
  const fullTitle = computed(() => `${toValue(page.title)} — ${site.name}`)
  const url = absolute(page.path)

  useSeoMeta({
    title: fullTitle,
    description: () => toValue(page.description),
    ogType: 'article',
    ogTitle: fullTitle,
    ogDescription: () => toValue(page.description),
    articlePublishedTime: page.post.date,
    articleModifiedTime: page.post.date,
    articleSection: () => (page.section ? toValue(page.section.name) : undefined),
    twitterTitle: fullTitle,
    twitterDescription: () => toValue(page.description)
  })

  const postUrl = absolute(`/blog/${page.post.slug}`)

  useHead(() => {
    const crumbs = [
      { name: t('blog.title'), item: absolute('/blog') },
      { name: postTitle.value, item: postUrl },
      ...(page.section ? [{ name: toValue(page.section.name), item: url }] : [])
    ]
    const article = {
      '@type': 'TechArticle',
      '@id': `${url}#article`,
      'headline': toValue(page.title),
      'description': toValue(page.description),
      'inLanguage': locales.find(l => l.code === locale.value)?.language ?? locale.value,
      'url': url,
      'datePublished': page.post.date,
      'dateModified': page.post.date,
      'version': page.post.version,
      'proficiencyLevel': 'Expert',
      'author': { '@type': 'Organization', 'name': site.name, 'url': site.url },
      'publisher': { '@type': 'Organization', 'name': site.name, 'url': site.url },
      ...(page.section
        ? {
            position: toValue(page.section.number),
            isPartOf: { '@type': 'TechArticle', '@id': `${postUrl}#article`, 'name': postTitle.value, 'url': postUrl }
          }
        : {
            hasPart: (toValue(page.parts) ?? []).map((part, i) => ({
              '@type': 'TechArticle',
              'position': i + 1,
              'name': part.name,
              'url': absolute(part.path)
            }))
          })
    }
    return {
      script: [{
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            article,
            {
              '@type': 'BreadcrumbList',
              'itemListElement': crumbs.map((crumb, i) => ({ '@type': 'ListItem', 'position': i + 1, ...crumb }))
            }
          ]
        })
      }]
    }
  })
}
