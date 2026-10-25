import type { GithubStats } from '#shared/types/github'

interface GithubOrg { followers: number }
interface GithubRepo { name: string, stargazers_count: number, fork: boolean }

export default defineCachedEventHandler(async (): Promise<GithubStats> => {
  const { githubOrg, githubToken } = useRuntimeConfig()
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'monoone-landing-page'
  }
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`

  const [org, repos] = await Promise.all([
    $fetch<GithubOrg>(`https://api.github.com/orgs/${githubOrg}`, { headers }),
    $fetch<GithubRepo[]>(`https://api.github.com/orgs/${githubOrg}/repos`, {
      headers,
      query: { type: 'public', per_page: 100 }
    })
  ])

  const own = repos.filter(repo => !repo.fork)
  return {
    followers: org.followers,
    stars: own.reduce((sum, repo) => sum + repo.stargazers_count, 0),
    repos: Object.fromEntries(own.map(repo => [repo.name, repo.stargazers_count]))
  }
}, { maxAge: 60 * 60, swr: true, name: 'github-stats', getKey: () => 'org' })
