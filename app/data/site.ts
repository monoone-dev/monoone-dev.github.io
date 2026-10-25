export interface Project {
  key: string
  name: string
  mark: string
  repo: string
  stage?: 'alpha' | 'beta'
  accent?: [string, string]
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
