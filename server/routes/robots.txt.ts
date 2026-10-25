export default defineEventHandler((event) => {
  const { app, public: { i18n } } = useRuntimeConfig(event)
  const root = `${String(i18n.baseUrl).replace(/\/$/, '')}${app.baseURL}`

  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return `User-agent: *\nAllow: /\n\nSitemap: ${root}sitemap.xml\n`
})
