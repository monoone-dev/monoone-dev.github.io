import MarkdownIt from 'markdown-it'

export interface TocLink {
  id: string
  text: string
  depth: number
  children: TocLink[]
}

export type PostPart =
  | { kind: 'html', html: string }
  | { kind: 'diagram', name: string }

export interface RenderedPost {
  parts: PostPart[]
  toc: TocLink[]
  minutes: number
}

interface RenderEnv {
  section: number
  subsection: number
  toc: TocLink[]
}

const DIAGRAM_LINE = /^:::diagram ([a-z-]+)[ \t]*$/gm
const DIAGRAM_TOKEN = /<p>@@diagram:([a-z-]+)@@<\/p>\n?/

const md = new MarkdownIt({ html: false, linkify: false, typographer: false })

// Anchors follow the section numbers (s9, s9-4), not the heading text, so a link to a section
// is the same in every language — including Chinese and Japanese, where a text slug would be empty.
md.renderer.rules.heading_open = (tokens, idx, options, env: RenderEnv, self) => {
  const token = tokens[idx]!
  const text = (tokens[idx + 1]?.children ?? [])
    .filter(child => child.type === 'text' || child.type === 'code_inline')
    .map(child => child.content)
    .join('')
  if (token.tag === 'h2') {
    env.section += 1
    env.subsection = 0
    const id = `s${env.section}`
    token.attrSet('id', id)
    env.toc.push({ id, text, depth: 2, children: [] })
  } else if (token.tag === 'h3' && env.section > 0) {
    env.subsection += 1
    const id = `s${env.section}-${env.subsection}`
    token.attrSet('id', id)
    env.toc.at(-1)?.children.push({ id, text, depth: 3, children: [] })
  }
  return self.renderToken(tokens, idx, options)
}

// Wide tables and code scroll inside their own box, never the page
md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n'
md.renderer.rules.table_close = () => '</table></div>\n'

const CJK = /[぀-ヿ㐀-鿿豈-﫿]/g

function readingMinutes(source: string): number {
  const prose = source.replace(/```[\s\S]*?```/g, ' ')
  const cjk = prose.match(CJK)?.length ?? 0
  const words = prose.replace(CJK, ' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 220 + cjk / 500))
}

export function renderPost(source: string): RenderedPost {
  const env: RenderEnv = { section: 0, subsection: 0, toc: [] }
  const html = md.render(source.replace(DIAGRAM_LINE, '\n@@diagram:$1@@\n'), env)

  const parts: PostPart[] = []
  let rest = html
  for (let match = DIAGRAM_TOKEN.exec(rest); match; match = DIAGRAM_TOKEN.exec(rest)) {
    if (match.index > 0) parts.push({ kind: 'html', html: rest.slice(0, match.index) })
    parts.push({ kind: 'diagram', name: match[1]! })
    rest = rest.slice(match.index + match[0].length)
  }
  if (rest.trim()) parts.push({ kind: 'html', html: rest })

  return { parts, toc: env.toc, minutes: readingMinutes(source) }
}
