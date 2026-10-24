// One <url> per page and language, each listing every other language as an hreflang alternate,
// the same set the page head declares. Prerendered by `pnpm generate`, so it is a static file on Pages.
import { defaultLocale, locales } from '#shared/locales'
import { postPages, posts } from '#shared/blog'

export default defineEventHandler((event) => {
  const { app, public: { i18n } } = useRuntimeConfig(event)
  const root = `${String(i18n.baseUrl).replace(/\/$/, '')}${app.baseURL}`
  const href = (code: string, page: string) =>
    `${code === defaultLocale ? root : `${root}${code}/`}${page}`

  const pages = ['', 'blog/', ...posts.flatMap(postPages)]

  const urls = pages.flatMap((page) => {
    const alternates = [
      ...locales.map(l => `    <xhtml:link rel="alternate" hreflang="${l.language}" href="${href(l.code, page)}"/>`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${href(defaultLocale, page)}"/>`
    ].join('\n')
    return locales.map(l => `  <url>\n    <loc>${href(l.code, page)}</loc>\n${alternates}\n  </url>`)
  })

  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    ''
  ].join('\n')
})
