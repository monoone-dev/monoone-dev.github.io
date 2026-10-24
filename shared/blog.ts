// Blog posts, newest first. Title and description live in i18n/locales/<code>.json under
// `blog.posts.<key>`; the article itself is content/blog/<slug>/<code>.md (English is the fallback).

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
}

export const posts: BlogPost[] = [
  {
    key: 'slat',
    slug: 'slat',
    date: '2026-10-25',
    version: '1.1',
    icon: 'i-lucide-layers'
  }
]

export const findPost = (slug: string) => posts.find(post => post.slug === slug)
