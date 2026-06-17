import { useEffect, useMemo, useState } from 'react';
import type { CompareReleaseDeltaResult, ReleaseVerdict, RowReleaseDelta } from '../types';
import { cellNodes, previewNodes } from './diffView';
import { Combobox } from './Combobox';

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

export function ReleaseDeltaTable({ result }: { result: CompareReleaseDeltaResult }) {
  const [showConsistent, setShowConsistent] = useState(false);
  const [hideExpected, setHideExpected] = useState(false);
  const [query, setQuery] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);

  const allFiles = useMemo(() => [...new Set(result.rows.map((r) => r.file))].sort(), [result]);

  const visible = useMemo(
    () =>
      result.rows.filter((r) => {
        if (!showConsistent && (r.verdict === 'both_unchanged' || r.verdict === 'same_change')) return false;
        if (hideExpected && r.verdict === 'divergent' && r.expectedEnvDiff) return false;
        if (query && !r.variable.toLowerCase().includes(query.toLowerCase())) return false;
        if (fileFilter && r.file !== fileFilter) return false;
        return true;
      }),
    [result, showConsistent, hideExpected, query, fileFilter],
  );

  useEffect(() => setLimit(PAGE), [result, showConsistent, hideExpected, query, fileFilter]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const s = result.stats;
  const shown = visible.slice(0, limit);

  const exportCsv = () => {
    const header = ['Переменная', 'Файл', 'Окр1·р1', 'Окр1·р2', 'Окр2·р1', 'Окр2·р2', 'Вердикт', 'Ожид. из-за окружения'];
    const rows = visible.map((r) => [
      r.variable,
      r.file,
      r.env1R1,
      r.env1R2,
      r.env2R1,
      r.env2R2,
      VERDICT_LABEL[r.verdict],
      r.expectedEnvDiff ? 'да' : '',
    ]);
    downloadCsv(
      `sledilo_release-delta_${result.fp}_${result.branchR1}_${result.branchR2}.csv`.replace(/[^\w.-]+/g, '_'),
      [header, ...rows].map((cols) => cols.map(csvField).join(',')).join('\r\n'),
    );
  };

  return (
    <div className="result">
      <div className="stats">
        <span>всего: {s.total}</span>
        <span className="badge vd-only_env1">только Окр.1: {s.onlyEnv1}</span>
        <span className="badge vd-only_env2">только Окр.2: {s.onlyEnv2}</span>
        <span className="badge vd-divergent">по-разному: {s.divergent}</span>
        <span className="badge vd-same_change">одинаково: {s.sameChange}</span>
        <span className="badge vd-both_unchanged">без изм.: {s.bothUnchanged}</span>
      </div>

      <div className="filters">
        <label className="chk">
          <input type="checkbox" checked={showConsistent} onChange={(e) => setShowConsistent(e.target.checked)} />
          показать консистентные
        </label>
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
        <button className="export" disabled={visible.length === 0} onClick={exportCsv}>
          Экспорт CSV
        </button>
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
            const long = rowLong(r);
            return (
              <tr key={key} className={`vd-row-${r.verdict}`}>
                <td className="var">{r.variable}</td>
                <td className="file">{r.file}</td>
                <td className="cell">
                  <DeltaCell status={r.statusEnv1} r1={r.env1R1} r2={r.env1R2} exp={exp} />
                  {long && (
                    <button className="more" onClick={() => toggle(key)}>
                      {exp ? 'Свернуть' : 'Показать ещё'}
                    </button>
                  )}
                </td>
                <td className="cell">
                  <DeltaCell status={r.statusEnv2} r1={r.env2R1} r2={r.env2R2} exp={exp} />
                </td>
                <td className="status">
                  <span className={`badge vd-${r.verdict}`}>{VERDICT_LABEL[r.verdict]}</span>
                  {r.verdict === 'divergent' && r.expectedEnvDiff && (
                    <span className="badge env-expected" title="значения различались между стендами уже на релиз1">
                      ожид. из-за окружения
                    </span>
                  )}
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
    </div>
  );
}

/** Ячейка-дельта одного стенда: р1 (что было) и р2 (что стало) с подсветкой изменения. */
function DeltaCell({ status, r1, r2, exp }: { status: string; r1: string | null; r2: string | null; exp: boolean }) {
  return (
    <div className="delta">
      <div className="dline">
        <span className="rtag">р1</span>
        <span className="val">{exp ? cellNodes(status, 'A', r1, r2) : previewNodes(status, 'A', r1, r2)}</span>
      </div>
      <div className="dline">
        <span className="rtag">р2</span>
        <span className="val">{exp ? cellNodes(status, 'B', r1, r2) : previewNodes(status, 'B', r1, r2)}</span>
      </div>
    </div>
  );
}

const csvField = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
