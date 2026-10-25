import MarkdownIt from 'markdown-it'
import { highlightCode } from './highlight'

export interface TocLink {
  id: string
  text: string
  depth: number
  children: TocLink[]
}

export type PostPart =
  | { kind: 'html', html: string }
  | { kind: 'diagram', name: string }

export interface RenderedSection {
  number: number
  title: string
  summary: string
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
const LEADING_H2 = /^<h2 id="s\d+">[\s\S]*?<\/h2>\n?/
const SECTION_NUMBER = /^\d+\.\s*/

const md = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  highlight: (code, lang) => highlightCode(code, lang.trim().toLowerCase())
})

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

md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n'
md.renderer.rules.table_close = () => '</table></div>\n'

const CJK = /[぀-ヿ㐀-鿿豈-﫿]/g

function readingMinutes(source: string): number {
  const prose = source.replace(/```[\s\S]*?```/g, ' ')
  const cjk = prose.match(CJK)?.length ?? 0
  const words = prose.replace(CJK, ' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 220 + cjk / 500))
}

function splitSections(source: string): string[] {
  const chunks: string[][] = [[]]
  let inCode = false
  for (const line of source.split('\n')) {
    if (line.startsWith('```')) inCode = !inCode
    if (!inCode && line.startsWith('## ')) chunks.push([])
    chunks.at(-1)!.push(line)
  }
  return chunks.map(lines => lines.join('\n'))
}

function render(source: string, env: RenderEnv): string {
  return md.render(source.replace(DIAGRAM_LINE, '\n@@diagram:$1@@\n'), env)
}

function toParts(html: string): PostPart[] {
  const parts: PostPart[] = []
  let rest = html
  for (let match = DIAGRAM_TOKEN.exec(rest); match; match = DIAGRAM_TOKEN.exec(rest)) {
    if (match.index > 0) parts.push({ kind: 'html', html: rest.slice(0, match.index) })
    parts.push({ kind: 'diagram', name: match[1]! })
    rest = rest.slice(match.index + match[0].length)
  }
  if (rest.trim()) parts.push({ kind: 'html', html: rest })
  return parts
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'' }

const plain = (html: string) => html
  .replace(/<[^>]+>/g, '')
  .replace(/&(amp|lt|gt|quot|#39);/g, entity => ENTITIES[entity] ?? entity)
  .replace(/\s+/g, ' ')
  .trim()

function firstParagraph(html: string, limit = 158): string {
  const paragraphs = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(match => plain(match[1]!))
  const text = paragraphs.find(paragraph => paragraph.length >= 60) ?? paragraphs[0] ?? ''
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const space = cut.lastIndexOf(' ')
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, '')}…`
}

export function sectionCount(source: string): number {
  return splitSections(source).length - 1
}

export function renderSection(source: string, number: number): RenderedSection | null {
  const chunks = splitSections(source)
  const chunk = chunks[number]
  if (chunk === undefined) return null

  const all: RenderEnv = { section: 0, subsection: 0, toc: [] }
  render(source, all)

  const env: RenderEnv = { section: Math.max(number - 1, 0), subsection: 0, toc: [] }
  const html = render(chunk, env)
  const body = number > 0 ? html.replace(LEADING_H2, '') : html
  const heading = number > 0 ? all.toc[number - 1]?.text ?? '' : ''

  return {
    number,
    title: heading.replace(SECTION_NUMBER, ''),
    summary: firstParagraph(body),
    parts: toParts(body),
    toc: all.toc,
    minutes: readingMinutes(source)
  }
}
