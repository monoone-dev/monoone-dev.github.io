import type { BlogPost } from '#shared/blog'
import { defaultLocale } from '#shared/locales'

const sources = import.meta.glob<string>('../../content/blog/*/*.md', { query: '?raw', import: 'default' })

const sourceKey = (slug: string, code: string) => `../../content/blog/${slug}/${code}.md`

export function useBlogSection(post: BlogPost, number: number) {
  const { locale } = useI18n()

  return useAsyncData(
    () => `blog-${post.slug}-${number}-${locale.value}`,
    async () => {
      const load = sources[sourceKey(post.slug, locale.value)] ?? sources[sourceKey(post.slug, defaultLocale)]
      if (!load) {
        throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })
      }
      const source = await load()
      if (sectionCount(source) !== post.sections.length) {
        throw createError({
          statusCode: 500,
          statusMessage: `${post.slug} (${locale.value}) has ${sectionCount(source)} sections, shared/blog.ts lists ${post.sections.length}`,
          fatal: true
        })
      }
      const section = renderSection(source, number)
      if (!section) {
        throw createError({ statusCode: 404, statusMessage: 'Section not found', fatal: true })
      }
      return section
    },
    { watch: [locale] }
  )
}
