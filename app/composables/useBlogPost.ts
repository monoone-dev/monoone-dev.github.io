import { defaultLocale } from '#shared/locales'

// Each language is its own chunk, so a reader downloads only the article in their language
const sources = import.meta.glob<string>('../../content/blog/*/*.md', { query: '?raw', import: 'default' })

const sourceKey = (slug: string, code: string) => `../../content/blog/${slug}/${code}.md`

export function useBlogPost(slug: string) {
  const { locale } = useI18n()

  return useAsyncData(
    () => `blog-${slug}-${locale.value}`,
    async () => {
      const load = sources[sourceKey(slug, locale.value)] ?? sources[sourceKey(slug, defaultLocale)]
      if (!load) {
        throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })
      }
      return renderPost(await load())
    },
    { watch: [locale] }
  )
}
