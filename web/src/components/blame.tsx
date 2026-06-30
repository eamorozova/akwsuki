import { useState } from 'react';
import { api } from '../api';
import type { BlameRegion, BlameResponse } from '../types';

/** Репозиторий, в котором лежит файл (выбирает провайдера на бэкенде). */
export type BlameRepo = 'config' | 'shared' | 'gitops';

/**
 * Состояние blame для одной строки-значения:
 *  undefined — значения нет (строку не блеймим); 'loading' — грузится;
 *  'unavailable' — источник без blame (local); null — загружено, но региона на строку нет;
 *  BlameRegion — найденный автор/дата/коммит.
 */
export type BlameCell = BlameRegion | 'loading' | 'unavailable' | null | undefined;

const fkey = (repo: BlameRepo, branch: string, path: string): string => `${repo}|||${branch}|||${path}`;

/**
 * Ленивая загрузка blame с кэшем по (repo, branch, path).
 * Таблица вызывает `ensure(...)` при раскрытии строки и `state(...)` при рендере.
 */
export function useBlame(fp: string) {
  const [cache, setCache] = useState<Record<string, BlameResponse>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());

  const ensure = (repo: BlameRepo, branch: string, path: string) => {
    const k = fkey(repo, branch, path);
    if (cache[k] || loading.has(k)) return;
    setLoading((p) => new Set(p).add(k));
    api
      .blame(fp, branch, path, repo)
      .then((res) => setCache((p) => ({ ...p, [k]: res })))
      .catch(() => setCache((p) => ({ ...p, [k]: { available: false, regions: [] } })))
      .finally(() =>
        setLoading((p) => {
          const next = new Set(p);
          next.delete(k);
          return next;
        }),
      );
  };

  const state = (repo: BlameRepo, branch: string, path: string, line?: number): BlameCell => {
    if (line == null) return undefined;
    const res = cache[fkey(repo, branch, path)];
    if (!res) return 'loading';
    if (!res.available) return 'unavailable';
    return res.regions.find((g) => line >= g.startLine && line < g.startLine + g.lineCount) ?? null;
  };

  const reset = () => {
    setCache({});
    setLoading(new Set());
  };

  return { ensure, state, reset };
}

/** Строка blame под значением: автор · дата · ссылка на коммит. */
export function BlameTag({ state }: { state?: BlameCell }) {
  if (state === undefined) return null;
  if (state === 'loading') return <div className="blame muted">blame…</div>;
  if (state === 'unavailable') return <div className="blame muted">blame доступен только в bitbucket-режиме</div>;
  if (state === null) return <div className="blame muted">— нет данных blame</div>;
  return (
    <div className="blame" title={state.authorEmail ?? undefined}>
      <span className="blame-author">{state.author}</span>
      {state.date && <span className="blame-date">{state.date.slice(0, 10)}</span>}
      <a className="blame-commit" href={state.commitUrl} target="_blank" rel="noreferrer">
        {state.commitShort}
      </a>
    </div>
  );
}
