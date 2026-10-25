export type ProjectLinkKey = 'download' | 'site' | 'docs' | 'github'

export const linkIcons: Record<ProjectLinkKey, string> = {
  download: 'i-lucide-download',
  site: 'i-lucide-globe',
  docs: 'i-lucide-book-open',
  github: 'i-simple-icons-github'
}

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
  steps: { key: string, icon: string }[]
  links: { key: ProjectLinkKey, to: string }[]
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
    steps: [
      { key: 'record', icon: 'i-lucide-mic' },
      { key: 'transcribe', icon: 'i-lucide-audio-lines' },
      { key: 'keep', icon: 'i-lucide-file-text' }
    ],
    links: [
      { key: 'download', to: 'https://github.com/monoone-dev/index-one-landing-page/releases/latest' },
      { key: 'site', to: 'https://index-one.io' },
      { key: 'github', to: 'https://github.com/monoone-dev/index-one-landing-page' }
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
    steps: [
      { key: 'define', icon: 'i-lucide-user-cog' },
      { key: 'connect', icon: 'i-lucide-workflow' },
      { key: 'run', icon: 'i-lucide-play' }
    ],
    links: [
      { key: 'download', to: 'https://github.com/monoone-dev/rig-one-landing-page/releases/latest' },
      { key: 'site', to: 'https://rig-one.io/' },
      { key: 'github', to: 'https://github.com/monoone-dev/rig-one-landing-page' }
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
    steps: [
      { key: 'install', icon: 'i-lucide-package' },
      { key: 'theme', icon: 'i-lucide-palette' },
      { key: 'build', icon: 'i-lucide-layout-template' }
    ],
    links: [
      { key: 'docs', to: 'https://monoone.dev/surface-one/' },
      { key: 'github', to: 'https://github.com/monoone-dev/surface-one' }
    ]
  }
]

export const upcoming = [
  { name: 'SomaOne', mark: 'SomaOneMark' },
  { name: 'GoOne', mark: 'GoOneMark' }
]
