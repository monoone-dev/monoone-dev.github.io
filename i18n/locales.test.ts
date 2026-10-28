import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { posts } from '../shared/blog.ts'
import { defaultLocale, locales } from '../shared/locales.ts'

const root = new URL('../', import.meta.url)
const localeDir = new URL('i18n/locales/', root)
const pluralFormsByLocale: Record<string, number> = { pl: 4 }

type Messages = Record<string, string>

function flatten(value: unknown, path = ''): Messages {
  if (typeof value === 'string') return { [path]: value }
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${path} is not a message or a group`)
  return Object.assign({}, ...Object.entries(value).map(([key, item]) => flatten(item, path ? `${path}.${key}` : key)))
}

const load = (file: string) => flatten(JSON.parse(readFileSync(new URL(file, localeDir), 'utf8')))
const messages = Object.fromEntries(locales.map(locale => [locale.code, load(locale.file)]))
const source = messages[defaultLocale]!
const placeholders = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort()
const forms = (text: string) => text.split(' | ').length
const singleForm = (code: string) => new Intl.PluralRules(code).resolvedOptions().pluralCategories.length === 1

test('every language in shared/locales.ts has a locale file, and no other', () => {
  assert.ok(locales.some(locale => locale.code === defaultLocale))
  assert.deepEqual(readdirSync(localeDir).filter(name => name.endsWith('.json')).sort(), locales.map(locale => locale.file).sort())
})

for (const { code } of locales.filter(locale => locale.code !== defaultLocale)) {
  test(`${code} has exactly the keys of ${defaultLocale}`, () => {
    const keys = Object.keys(messages[code]!)
    const expected = Object.keys(source)
    assert.deepEqual(
      { missing: expected.filter(key => !keys.includes(key)), extra: keys.filter(key => !expected.includes(key)) },
      { missing: [], extra: [] }
    )
  })
}

for (const { code } of locales) {
  test(`${code} translates every message and keeps placeholders and plural forms`, () => {
    for (const [key, text] of Object.entries(messages[code]!)) {
      const sourceText = source[key]
      if (sourceText === undefined) continue
      if (sourceText.trim()) assert.match(text, /\S/, `${code} ${key} is empty`)
      assert.deepEqual(placeholders(text), placeholders(sourceText), `${code} ${key} placeholders`)
      const sourceForms = forms(sourceText)
      if (sourceForms === 1) {
        assert.equal(forms(text), 1, `${code} ${key} has plural forms that ${defaultLocale} does not`)
        continue
      }
      const expected = pluralFormsByLocale[code] ?? (singleForm(code) ? 1 : sourceForms)
      assert.equal(forms(text), expected, `${code} ${key} plural forms`)
    }
  })
}

test('every blog post has an article in every language', () => {
  for (const post of posts) {
    for (const { code } of locales) {
      const article = new URL(`content/blog/${post.slug}/${code}.md`, root)
      assert.ok(existsSync(article), `content/blog/${post.slug}/${code}.md is missing`)
    }
  }
})
