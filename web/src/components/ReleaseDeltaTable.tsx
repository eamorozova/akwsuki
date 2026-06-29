import { useEffect, useMemo, useState } from 'react';
import type {
  BlameRegion,
  BlameResponse,
  CompareReleaseDeltaResult,
  ReleaseVerdict,
  RowReleaseDelta,
} from '../types';
import { api } from '../api';
import { previewNodes } from './diffView';
import { Combobox } from './Combobox';
import { DiffModal, type DiffModalData } from './DiffModal';
import { BadgeToggle, useToggleSet } from './statusFilter';

const PAGE = 150;

const VERDICT_LABEL: Record<ReleaseVerdict, string> = {
  both_unchanged: 'без изменений',
  same_change: 'одинаково',
  only_env1: 'только Окр.1',
  only_env2: 'только Окр.2',
  divergent: 'по-разному',
};

const isLong = (s: string | null): boolean => !!s && (s.includes('\n') || s.length > 80);
const rowLong = (r: RowReleaseDelta): boolean =>
  isLong(r.env1R1) || isLong(r.env1R2) || isLong(r.env2R1) || isLong(r.env2R2);

/**
 * Состояние blame для одной строки-значения:
 *  undefined — значения нет (строку не блеймим); 'loading' — грузится;
 *  'unavailable' — источник без blame (local); null — загружено, но региона на строку нет;
 *  BlameRegion — найденный автор/дата/коммит.
 */
type BlameCell = BlameRegion | 'loading' | 'unavailable' | null | undefined;

const fileKey = (branch: string, path: string): string => `${branch}|||${path}`;
const cellPath = (env: string, file: string): string => `${env}/${file}`;

export function ReleaseDeltaTable({ result }: { result: CompareReleaseDeltaResult }) {
  const [verdicts, toggleVerdict] = useToggleSet<ReleaseVerdict>(['only_env1', 'only_env2', 'divergent']);
  const [hideExpected, setHideExpected] = useState(false);
  const [query, setQuery] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [modal, setModal] = useState<DiffModalData | null>(null);
  // blame: какие строки раскрыты + кэш ответов по файлу (branch|||path)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [blame, setBlame] = useState<Record<string, BlameResponse>>({});
  const [blameLoading, setBlameLoading] = useState<Set<string>>(new Set());

  const allFiles = useMemo(() => [...new Set(result.rows.map((r) => r.file))].sort(), [result]);

  const visible = useMemo(
    () =>
      result.rows.filter((r) => {
        if (!verdicts.has(r.verdict)) return false;
        if (hideExpected && r.verdict === 'divergent' && r.expectedEnvDiff) return false;
        if (query && !r.variable.toLowerCase().includes(query.toLowerCase())) return false;
        if (fileFilter && r.file !== fileFilter) return false;
        return true;
      }),
    [result, verdicts, hideExpected, query, fileFilter],
  );

  useEffect(() => setLimit(PAGE), [result, verdicts, hideExpected, query, fileFilter]);
  // новый результат сравнения — сбрасываем раскрытые строки и кэш blame (другой ФП/релизы)
  useEffect(() => {
    setExpanded(new Set());
    setBlame({});
    setBlameLoading(new Set());
  }, [result]);

  /** Лениво тянем blame файла (один раз на branch+path), результат кладём в кэш. */
  const ensureBlame = (branch: string, path: string) => {
    const fk = fileKey(branch, path);
    if (blame[fk] || blameLoading.has(fk)) return;
    setBlameLoading((prev) => new Set(prev).add(fk));
    api
      .blame(result.fp, branch, path)
      .then((res) => setBlame((prev) => ({ ...prev, [fk]: res })))
      .catch(() => setBlame((prev) => ({ ...prev, [fk]: { available: false, regions: [] } })))
      .finally(() =>
        setBlameLoading((prev) => {
          const next = new Set(prev);
          next.delete(fk);
          return next;
        }),
      );
  };

  const toggleRow = (r: RowReleaseDelta) => {
    const key = `${r.variable}|||${r.file}`;
    if (expanded.has(key)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return;
    }
    setExpanded((prev) => new Set(prev).add(key));
    // четыре файла: оба окружения × оба релиза
    ensureBlame(result.branchR1, cellPath(result.env1, r.file));
    ensureBlame(result.branchR2, cellPath(result.env1, r.file));
    ensureBlame(result.branchR1, cellPath(result.env2, r.file));
    ensureBlame(result.branchR2, cellPath(result.env2, r.file));
  };

  /** Blame-аннотация для конкретной (ветка, файл, строка). */
  const blameState = (branch: string, path: string, line?: number): BlameCell => {
    if (line == null) return undefined;
    const res = blame[fileKey(branch, path)];
    if (!res) return 'loading';
    if (!res.available) return 'unavailable';
    return res.regions.find((g) => line >= g.startLine && line < g.startLine + g.lineCount) ?? null;
  };

  const open = (r: RowReleaseDelta) =>
    setModal({
      title: r.variable,
      subtitle: r.file,
      statusLabel: VERDICT_LABEL[r.verdict],
      statusCls: `vd-${r.verdict}`,
      pairs: [
        {
          caption: `Окр.1: ${result.env1}`,
          aLabel: `р1 · ${result.branchR1}`,
          bLabel: `р2 · ${result.branchR2}`,
          valueA: r.env1R1,
          valueB: r.env1R2,
        },
        {
          caption: `Окр.2: ${result.env2}`,
          aLabel: `р1 · ${result.branchR1}`,
          bLabel: `р2 · ${result.branchR2}`,
          valueA: r.env2R1,
          valueB: r.env2R2,
        },
      ],
    });

  const s = result.stats;
  const shown = visible.slice(0, limit);

  return (
    <div className="result">
      <div className="stats">
        <span>всего: {s.total}</span>
        <BadgeToggle cls="vd-only_env1" label="только Окр.1" count={s.onlyEnv1} active={verdicts.has('only_env1')} onToggle={() => toggleVerdict('only_env1')} />
        <BadgeToggle cls="vd-only_env2" label="только Окр.2" count={s.onlyEnv2} active={verdicts.has('only_env2')} onToggle={() => toggleVerdict('only_env2')} />
        <BadgeToggle cls="vd-divergent" label="по-разному" count={s.divergent} active={verdicts.has('divergent')} onToggle={() => toggleVerdict('divergent')} />
        <BadgeToggle cls="vd-same_change" label="одинаково" count={s.sameChange} active={verdicts.has('same_change')} onToggle={() => toggleVerdict('same_change')} />
        <BadgeToggle cls="vd-both_unchanged" label="без изм." count={s.bothUnchanged} active={verdicts.has('both_unchanged')} onToggle={() => toggleVerdict('both_unchanged')} />
      </div>

      <div className="filters">
        <label className="chk">
          <input type="checkbox" checked={hideExpected} onChange={(e) => setHideExpected(e.target.checked)} />
          скрыть ожидаемые из-за окружения
        </label>
        <input className="search" placeholder="поиск по переменной…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="filter-combo">
          <Combobox
            value={fileFilter}
            onChange={setFileFilter}
            placeholder="все файлы"
            labelFor={(v) => (v === '' ? 'все файлы' : v)}
            fetchOptions={(q) => Promise.resolve(['', ...allFiles].filter((f) => !q || f.toLowerCase().includes(q.toLowerCase())))}
          />
        </div>
        <span className="muted">показано: {shown.length} из {visible.length}</span>
      </div>

      <table className="cmp">
        <colgroup>
          <col className="c-var" />
          <col className="c-file" />
          <col className="c-val" />
          <col className="c-val" />
          <col className="c-verdict" />
        </colgroup>
        <thead>
          <tr>
            <th>Переменная</th>
            <th>Файл</th>
            <th>
              Окр.1: {result.env1} · {result.branchR1}→{result.branchR2}
            </th>
            <th>
              Окр.2: {result.env2} · {result.branchR1}→{result.branchR2}
            </th>
            <th>Вердикт</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const key = `${r.variable}|||${r.file}`;
            const exp = expanded.has(key);
            return (
              <tr key={key} className={`vd-row-${r.verdict}`}>
                <td className="var">{r.variable}</td>
                <td className="file">{r.file}</td>
                <td className="cell">
                  <DeltaCell
                    status={r.statusEnv1}
                    r1={r.env1R1}
                    r2={r.env1R2}
                    blameR1={exp ? blameState(result.branchR1, cellPath(result.env1, r.file), r.lineEnv1R1) : undefined}
                    blameR2={exp ? blameState(result.branchR2, cellPath(result.env1, r.file), r.lineEnv1R2) : undefined}
                  />
                  {rowLong(r) && (
                    <button className="more" onClick={() => open(r)}>
                      Развернуть
                    </button>
                  )}
                </td>
                <td className="cell">
                  <DeltaCell
                    status={r.statusEnv2}
                    r1={r.env2R1}
                    r2={r.env2R2}
                    blameR1={exp ? blameState(result.branchR1, cellPath(result.env2, r.file), r.lineEnv2R1) : undefined}
                    blameR2={exp ? blameState(result.branchR2, cellPath(result.env2, r.file), r.lineEnv2R2) : undefined}
                  />
                </td>
                <td className="status">
                  <span className={`badge vd-${r.verdict}`}>{VERDICT_LABEL[r.verdict]}</span>
                  {r.verdict === 'divergent' && r.expectedEnvDiff && (
                    <span className="badge env-expected" title="значения различались между стендами уже на релиз1">
                      ожид. из-за окружения
                    </span>
                  )}
                  <button className="more blame-toggle" onClick={() => toggleRow(r)}>
                    {exp ? 'скрыть blame' : 'кто менял'}
                  </button>
                </td>
              </tr>
            );
          })}

          {visible.length === 0 && (
            <tr>
              <td colSpan={5} className="empty">
                нет строк под текущие фильтры
              </td>
            </tr>
          )}

          {shown.length < visible.length && (
            <tr>
              <td colSpan={5} className="loadmore-cell">
                <button className="loadmore" onClick={() => setLimit((l) => l + PAGE)}>
                  Показать ещё {Math.min(PAGE, visible.length - shown.length)} (осталось {visible.length - shown.length})
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <DiffModal data={modal} onClose={() => setModal(null)} />
    </div>
  );
}

/** Ячейка-дельта одного стенда: р1 (что было) и р2 (что стало) + опц. blame под каждой строкой. */
function DeltaCell({
  status,
  r1,
  r2,
  blameR1,
  blameR2,
}: {
  status: string;
  r1: string | null;
  r2: string | null;
  blameR1?: BlameCell;
  blameR2?: BlameCell;
}) {
  return (
    <div className="delta">
      <div className="dline">
        <span className="rtag">р1</span>
        <span className="val">{previewNodes(status, 'A', r1, r2)}</span>
      </div>
      <BlameTag state={blameR1} />
      <div className="dline">
        <span className="rtag">р2</span>
        <span className="val">{previewNodes(status, 'B', r1, r2)}</span>
      </div>
      <BlameTag state={blameR2} />
    </div>
  );
}

/** Строка blame под значением: автор · дата · ссылка на коммит. */
function BlameTag({ state }: { state?: BlameCell }) {
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
