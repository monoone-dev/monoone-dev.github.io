import type { HighlighterCore } from 'shiki/core'

const THEMES = { light: 'github-light', dark: 'github-dark' }

const LANGUAGES: Record<string, string> = {
  bash: 'bash',
  sh: 'bash',
  js: 'javascript',
  javascript: 'javascript',
  json: 'json',
  markdown: 'markdown',
  md: 'markdown',
  rust: 'rust',
  rs: 'rust',
  toml: 'toml',
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'tsx',
  vue: 'vue',
  yaml: 'yaml',
  yml: 'yaml'
}

let highlighter: HighlighterCore | null = null
let loading: Promise<HighlighterCore> | null = null
const cache = new Map<string, string>()

export function loadHighlighter(): Promise<HighlighterCore> {
  if (highlighter) return Promise.resolve(highlighter)
  loading ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript')
    ])
    highlighter = await createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
      langs: [
        import('shiki/langs/bash.mjs'),
        import('shiki/langs/javascript.mjs'),
        import('shiki/langs/json.mjs'),
        import('shiki/langs/markdown.mjs'),
        import('shiki/langs/rust.mjs'),
        import('shiki/langs/toml.mjs'),
        import('shiki/langs/typescript.mjs'),
        import('shiki/langs/tsx.mjs'),
        import('shiki/langs/vue.mjs'),
        import('shiki/langs/yaml.mjs')
      ]
    })
    return highlighter
  })()
  return loading
}

const escapeHtml = (text: string) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const TREE_LINE = /^([\s│├└─┬┼]*)(\S+(?: \S+)*?)(\s{2,}.*)?$/

function treeLine(line: string): string {
  const match = TREE_LINE.exec(line)
  if (!match || !line.trim()) return escapeHtml(line)
  const [, guide = '', name = '', note = ''] = match
  const kind = name.endsWith('/') ? 't-dir' : 't-file'
  return [
    guide && `<span class="t-guide">${escapeHtml(guide)}</span>`,
    `<span class="${kind}">${escapeHtml(name)}</span>`,
    note && `<span class="t-note">${escapeHtml(note)}</span>`
  ].join('')
}

function renderTree(code: string): string {
  const lines = code.replace(/\n$/, '').split('\n').map(treeLine)
  return `<pre class="code-tree"><code>${lines.join('\n')}</code></pre>\n`
}

export function highlightCode(code: string, lang: string): string {
  if (lang === 'tree') return renderTree(code)
  const language = LANGUAGES[lang]
  if (!language || !highlighter) return ''
  const key = `${language}\u0000${code}`
  const cached = cache.get(key)
  if (cached) return cached
  const html = `${highlighter.codeToHtml(code.replace(/\n$/, ''), { lang: language, themes: THEMES, defaultColor: false })}\n`
  cache.set(key, html)
  return html
}
