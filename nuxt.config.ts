import { locales } from './shared/locales'
import { postPages, posts } from './shared/blog'

const blogRoutes = locales.flatMap((l) => {
  const prefix = l.code === 'en' ? '' : `/${l.code}`
  return ['blog/', ...posts.flatMap(postPages)].map(page => `${prefix}/${page.replace(/\/$/, '')}`)
})

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

  i18n: {
    baseUrl: 'https://monoone.dev',
    defaultLocale: 'en',
    strategy: 'prefix_except_default',
    trailingSlash: true,
    locales,
    vueI18n: './i18n.config.ts',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      redirectOn: 'root',
      fallbackLocale: 'en'
    }
  },

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
