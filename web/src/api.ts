import type { CompareMode, CompareResult, CompareSide } from './types';

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
  branches: (fp: string, q?: string) =>
    j<string[]>(`/api/fp/${encodeURIComponent(fp)}/branches${q ? `?q=${encodeURIComponent(q)}` : ''}`),
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
};
