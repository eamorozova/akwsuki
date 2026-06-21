import type {
  CompareMode,
  CompareReleaseDeltaResult,
  CompareResult,
  CompareRssResult,
  CompareSide,
  CompareStandsResult,
  RssSide,
  StandInfo,
} from './types';

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await r.json());
    } catch {
      /* ignore */
    }
    throw new Error(`${r.status} ${r.statusText} ${detail}`.trim());
  }
  return (await r.json()) as T;
}

export const api = {
  fps: () => j<{ name: string }[]>('/api/fp'),
  branches: (fp: string, q?: string, repo?: 'shared' | 'gitops') => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (repo) params.set('repo', repo);
    const qs = params.toString();
    return j<string[]>(`/api/fp/${encodeURIComponent(fp)}/branches${qs ? `?${qs}` : ''}`);
  },
  envs: (fp: string, branch: string) =>
    j<string[]>(`/api/fp/${encodeURIComponent(fp)}/envs?branch=${encodeURIComponent(branch)}`),
  scopes: (fp: string, branch: string, env: string) =>
    j<string[]>(
      `/api/fp/${encodeURIComponent(fp)}/scopes?branch=${encodeURIComponent(branch)}&env=${encodeURIComponent(env)}`,
    ),
  compare: (fp: string, sideA: CompareSide, sideB: CompareSide, mode: CompareMode, scope?: string) =>
    j<CompareResult>('/api/compare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fp, sideA, sideB, mode, scope }),
    }),
  compareReleaseDelta: (fp: string, env1: string, env2: string, branchR1: string, branchR2: string) =>
    j<CompareReleaseDeltaResult>('/api/compare-release-delta', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fp, env1, env2, branchR1, branchR2 }),
    }),
  stands: (fp: string, branch: string) =>
    j<StandInfo[]>(`/api/fp/${encodeURIComponent(fp)}/stands?branch=${encodeURIComponent(branch)}`),
  compareStands: (fp: string, branch1: string, stand1: string, branch2: string, stand2: string) =>
    j<CompareStandsResult>('/api/compare-stands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fp, branch1, stand1, branch2, stand2 }),
    }),
  gitopsFps: () => j<{ name: string }[]>('/api/gitops/fps'),
  gitopsEnvs: (fp: string, branch: string) =>
    j<string[]>(`/api/gitops/${encodeURIComponent(fp)}/envs?branch=${encodeURIComponent(branch)}`),
  gitopsStands: (fp: string, branch: string, env: string) =>
    j<string[]>(
      `/api/gitops/${encodeURIComponent(fp)}/stands?branch=${encodeURIComponent(branch)}&env=${encodeURIComponent(env)}`,
    ),
  compareRss: (fp: string, sideA: RssSide, sideB: RssSide) =>
    j<CompareRssResult>('/api/compare-rss', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fp, sideA, sideB }),
    }),
};
