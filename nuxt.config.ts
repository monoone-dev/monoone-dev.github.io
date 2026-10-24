import { locales } from './shared/locales'
import { postPages, posts } from './shared/blog'

// Every language gets the blog index and every page of every post (overview and sections),
// prerendered like the home page
const blogRoutes = locales.flatMap((l) => {
  const prefix = l.code === 'en' ? '' : `/${l.code}`
  return ['blog/', ...posts.flatMap(postPages)].map(page => `${prefix}/${page.replace(/\/$/, '')}`)
})

// The static build serves English HTML at /. If i18n switched that page to the visitor's language
// after it loaded, hydration would keep English attributes (the flag in the header stayed British
// on a Polish page). So load the prerendered /pl, /de, ... page instead, before Nuxt starts.
// Same rules as detectBrowserLanguage below: a saved choice first, then the browser languages.
// GitHub Pages builds set NUXT_APP_BASE_URL (e.g. /monoone-landing-page/), so the root is that path.
const base = (process.env.NUXT_APP_BASE_URL || '/').replace(/\/*$/, '/')
const languageRedirect = `(function(){try{
var base=${JSON.stringify(base)},path=location.pathname;
if(path!==base&&path+'/'!==base)return;
var codes=${JSON.stringify(locales.map(l => l.code))};
var saved=document.cookie.match(/(?:^|; )i18n_locale=([^;]*)/);
var code=saved?saved[1]:null;
if(!code){var langs=navigator.languages||[navigator.language];
for(var i=0;i<langs.length&&!code;i++){var c=String(langs[i]).toLowerCase().split('-')[0];if(codes.indexOf(c)>-1)code=c}}
if(code&&code!=='en'&&codes.indexOf(code)>-1)location.replace(base+code+'/'+location.search+location.hash);
}catch(e){}})()`

export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtjs/i18n'],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css', '~/assets/scss/main.scss', '~/assets/scss/blog.scss'],

  runtimeConfig: {
    githubOrg: 'monoone-dev',
    githubToken: ''
  },

  app: {
    head: {
      script: [{ innerHTML: languageRedirect, tagPosition: 'head' }]
    }
  },

  colorMode: {
    preference: 'system',
    fallback: 'light'
  },

  // English is the default (no prefix); other languages live under /pl, /es, ...
  // First visit to / follows the browser language, then the choice is kept in a cookie.
  i18n: {
    // Origin only (no path); the deploy sets NUXT_PUBLIC_I18N_BASE_URL to the Pages origin
    baseUrl: 'https://monoone.dev',
    defaultLocale: 'en',
    strategy: 'prefix_except_default',
    // GitHub Pages answers /pl with a 301 to /pl/, so canonical and hreflang links use the slash
    trailingSlash: true,
    locales,
    vueI18n: './i18n.config.ts',
    // Any browser language we don't support (and any missing key) falls back to English
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      redirectOn: 'root',
      fallbackLocale: 'en'
    }
  },

  // `pnpm generate` (GitHub Pages) prerenders every language and bakes the GitHub
  // numbers into the pages; the deploy workflow reruns daily to refresh them.
  nitro: {
    prerender: {
      routes: ['/', '/pl', '/es', '/it', '/fr', '/pt', '/de', '/zh', '/ja', ...blogRoutes, '/api/github', '/sitemap.xml', '/robots.txt']
    }
  },

  compatibilityDate: '2026-10-01',

  typescript: {
    strict: true
  }
})
