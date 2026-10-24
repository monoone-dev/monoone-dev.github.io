// Blog posts, newest first. Title and description live in i18n/locales/<code>.json under
// `blog.posts.<key>`; the article itself is content/blog/<slug>/<code>.md (English is the fallback).
// Every `##` section of an article is its own page at /blog/<slug>/<section>/; the text before
// the first `##` is the overview at /blog/<slug>/.

export interface BlogPost {
  /** Translation namespace, e.g. `slat` → `blog.posts.slat.title` */
  key: string
  /** URL segment: /blog/<slug>/ */
  slug: string
  /** ISO date of the current version */
  date: string
  /** Version of the documented pattern, shown as a badge */
  version?: string
  icon: string
  /** URL segment of each `##` section, in order; the same in every language */
  sections: string[]
}

export const posts: BlogPost[] = [
  {
    key: 'slat',
    slug: 'slat',
    date: '2026-10-25',
    version: '1.1',
    icon: 'i-lucide-layers',
    sections: [
      'why-slat-exists',
      'slat-on-one-page',
      'vocabulary',
      'where-slat-comes-from',
      'tiers',
      'slices',
      'imports',
      'data-flows',
      'actors',
      'variant-explosion',
      'appstate',
      'platforms',
      'errors',
      'testing',
      'size-limits',
      'enforcement',
      'recipes',
      'coding-agents',
      'migration',
      'case-study',
      'adoption',
      'version-history'
    ]
  }
]

export const findPost = (slug: string) => posts.find(post => post.slug === slug)

/** Every page of a post, relative to the language root: the overview, then each section */
export const postPages = (post: BlogPost) => [
  `blog/${post.slug}/`,
  ...post.sections.map(section => `blog/${post.slug}/${section}/`)
]
