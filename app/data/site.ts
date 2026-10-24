// Structure of the page: links, icons and which translation keys to use.
// All visible text lives in i18n/locales/<code>.json.

export interface Project {
  /** Translation namespace, e.g. `indexOne` → `indexOne.tagline` */
  key: string
  name: string
  /** Component that draws the symbol, e.g. `IndexOneMark` */
  mark: string
  /** Public repo whose stars are shown on the card */
  repo: string
  /** Release stage shown next to the status badge, e.g. `alpha` → `stage.alpha` */
  stage?: 'alpha' | 'beta'
  /** Two colors from the app's logo, used for the stage badge */
  accent?: [string, string]
  /** schema.org `applicationCategory` for search engines (structured data in the page head) */
  category: 'BusinessApplication' | 'DeveloperApplication'
  meta: string[]
  features: { key: string, icon: string }[]
  links: { key: string, to: string, icon: string }[]
}

export const site = {
  name: 'MonoOne',
  url: 'https://monoone.dev',
  github: 'https://github.com/monoone-dev',
  issues: 'https://github.com/monoone-dev/index-one-landing-page/issues',
  discussions: 'https://github.com/monoone-dev/index-one-landing-page/discussions'
}

// Flag shown in the language picker (circle-flags icons: SVG, so they look the same on every OS)
export const flags: Record<string, string> = {
  en: 'i-circle-flags-gb',
  pl: 'i-circle-flags-pl',
  es: 'i-circle-flags-es',
  it: 'i-circle-flags-it',
  fr: 'i-circle-flags-fr',
  pt: 'i-circle-flags-br',
  de: 'i-circle-flags-de',
  zh: 'i-circle-flags-cn',
  ja: 'i-circle-flags-jp'
}

export const principles = [
  { key: 'localFirst', icon: 'i-lucide-hard-drive' },
  { key: 'ownFiles', icon: 'i-lucide-file-text' },
  { key: 'private', icon: 'i-lucide-lock' },
  { key: 'mac', icon: 'i-lucide-laptop' }
]

export const projects: Project[] = [
  {
    key: 'indexOne',
    name: 'IndexOne',
    mark: 'IndexOneMark',
    repo: 'index-one-landing-page',
    category: 'BusinessApplication',
    meta: ['macos', 'arch', 'noAccount'],
    features: [
      { key: 'bothSides', icon: 'i-lucide-audio-lines' },
      { key: 'whisper', icon: 'i-lucide-cpu' },
      { key: 'notes', icon: 'i-lucide-file-text' },
      { key: 'answers', icon: 'i-lucide-message-circle-question' },
      { key: 'encrypted', icon: 'i-lucide-lock' },
      { key: 'ai', icon: 'i-lucide-sparkles' }
    ],
    links: [
      {
        key: 'download',
        to: 'https://github.com/monoone-dev/index-one-landing-page/releases/latest',
        icon: 'i-lucide-download'
      },
      { key: 'site', to: 'https://index-one.io', icon: 'i-lucide-arrow-up-right' }
    ]
  },
  {
    key: 'rigOne',
    name: 'RigOne',
    mark: 'RigOneMark',
    stage: 'alpha',
    accent: ['#5826ff', '#9d48fb'],
    // The application repository is private, so the public numbers and the build both live
    // on the landing repository — the same arrangement IndexOne uses.
    repo: 'rig-one-landing-page',
    category: 'DeveloperApplication',
    meta: ['macos', 'silicon', 'ownCli'],
    features: [
      { key: 'canvas', icon: 'i-lucide-workflow' },
      { key: 'parallel', icon: 'i-lucide-split' },
      { key: 'watch', icon: 'i-lucide-radio' },
      { key: 'agents', icon: 'i-lucide-users' },
      { key: 'context', icon: 'i-lucide-book-open' },
      { key: 'evidence', icon: 'i-lucide-receipt' }
    ],
    links: [
      {
        key: 'download',
        to: 'https://github.com/monoone-dev/rig-one-landing-page/releases/latest',
        icon: 'i-lucide-download'
      },
      {
        key: 'site',
        to: 'https://rig-one.io/',
        icon: 'i-lucide-arrow-up-right'
      }
    ]
  },
  {
    key: 'surfaceOne',
    name: 'SurfaceOne',
    mark: 'SurfaceOneMark',
    stage: 'beta',
    accent: ['#f43fb4', '#1d2df5'],
    repo: 'surface-one',
    category: 'DeveloperApplication',
    meta: ['frameworks', 'themes', 'languages'],
    features: [
      { key: 'tokens', icon: 'i-lucide-palette' },
      { key: 'skins', icon: 'i-lucide-swatch-book' },
      { key: 'components', icon: 'i-lucide-component' },
      { key: 'docs', icon: 'i-lucide-book-open' },
      { key: 'mcp', icon: 'i-lucide-plug' },
      { key: 'skills', icon: 'i-lucide-sparkles' }
    ],
    links: [
      { key: 'docs', to: 'https://monoone.dev/surface-one/', icon: 'i-lucide-book-open' },
      { key: 'github', to: 'https://github.com/monoone-dev/surface-one', icon: 'i-lucide-arrow-up-right' }
    ]
  }
]
