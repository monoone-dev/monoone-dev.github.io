
export interface BlogPost {
  key: string
  slug: string
  date: string
  version?: string
  icon: string
  sections: string[]
}

export const posts: BlogPost[] = [
  {
    key: 'frontendArchitecture',
    slug: 'frontend-architecture',
    date: '2026-10-25',
    icon: 'i-lucide-blocks',
    sections: [
      'why-architecture',
      'origins',
      'on-one-page',
      'vocabulary',
      'example',
      'library-types',
      'domains',
      'enforcement',
      'ngrx',
      'facade',
      'angular',
      'react-next',
      'vue-nuxt',
      'side-by-side',
      'testing',
      'migration',
      'questions'
    ]
  },
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
export const postPages = (post: BlogPost) => [
  `blog/${post.slug}/`,
  ...post.sections.map(section => `blog/${post.slug}/${section}/`)
]
