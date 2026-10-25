import type { GithubStats } from '#shared/types/github'

export function useGithubStats() {
  return useFetch<GithubStats | null>('/api/github', {
    key: 'github-stats',
    default: () => null,
    lazy: true
  })
}
