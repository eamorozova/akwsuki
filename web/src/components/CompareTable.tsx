import { useMemo, useState } from 'react';
import type { CompareResult, FileSummary, OverrideEntry, RowStatus } from '../types';
import { cellNodes } from './diffView';
import { Combobox } from './Combobox';

const STATUS_LABEL: Record<RowStatus, string> = {
  equal: '=',
  different: '≠',
  only_a: 'только A',
  only_b: 'только B',
};

const depth = (p: string): number => (p.match(/\//g) ?? []).length;
const isLong = (s: string | null): boolean => !!s && (s.includes('\n') || s.length > 80);
const oneLine = (s: string | null): string => (s === null ? '— (нет)' : s.replace(/\n/g, ' ').slice(0, 90));

interface Occ {
  file: string;
  valueA: string | null;
  valueB: string | null;
  status: RowStatus;
}

interface Group {
  variable: string;
  rep: Occ;
  occ: Occ[];
  diverges: boolean;
  hasDiff: boolean;
}

export function CompareTable({ result }: { result: CompareResult }) {
  const merged = result.mode === 'merged';
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [query, setQuery] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const byFileRows = result.mode === 'by_file' ? result.rows : [];
  const mergedRows = result.mode === 'merged' ? result.rows : [];

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Occ[]>();
    for (const r of byFileRows) {
      const occ: Occ = { file: r.file, valueA: r.valueA, valueB: r.valueB, status: r.status };
      const arr = map.get(r.variable);
      if (arr) arr.push(occ);
      else map.set(r.variable, [occ]);
    }
    const out: Group[] = [];
    for (const [variable, occ] of map) {
      occ.sort((a, b) => depth(a.file) - depth(b.file) || a.file.localeCompare(b.file));
      const rep = occ[0]!;
      const diverges = occ.some((o) => o.valueA !== rep.valueA || o.valueB !== rep.valueB);
      const hasDiff = occ.some((o) => o.status !== 'equal');
      out.push({ variable, rep, occ, diverges, hasDiff });
    }
    out.sort((a, b) => a.variable.localeCompare(b.variable));
    return out;
  }, [byFileRows]);

  const allFiles = useMemo(() => [...new Set(byFileRows.map((r) => r.file))].sort(), [byFileRows]);

  const visibleGroups = useMemo(
    () =>
      groups.filter((g) => {
        if (onlyDiff && !g.hasDiff) return false;
        if (query && !g.variable.toLowerCase().includes(query.toLowerCase())) return false;
        if (fileFilter && !g.occ.some((o) => o.file === fileFilter)) return false;
        return true;
      }),
    [groups, onlyDiff, query, fileFilter],
  );

  const visibleMerged = useMemo(
    () =>
      mergedRows.filter((r) => {
        if (onlyDiff && r.status === 'equal') return false;
        if (query && !r.variable.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [mergedRows, onlyDiff, query],
  );

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const s = result.stats;
  const shown = merged ? visibleMerged.length : visibleGroups.length;

  const exportCsv = () => {
    const rows = merged
      ? visibleMerged.map((r) => [r.variable, r.file, r.valueA, r.sourceA, r.valueB, r.sourceB, STATUS_LABEL[r.status]])
      : visibleGroups.flatMap((g) => g.occ.map((o) => [g.variable, o.file, o.valueA, o.valueB, STATUS_LABEL[o.status]]));
    const header = merged
      ? ['Переменная', 'Файл', 'Значение A', 'Источник A', 'Значение B', 'Источник B', 'Статус']
      : ['Переменная', 'Файл', 'Значение A', 'Значение B', 'Статус'];
    downloadCsv(csvFilename(result), [header, ...rows].map((cols) => cols.map(csvField).join(',')).join('\r\n'));
  };

  return (
    <div className="result">
      <div className="stats">
        <span>всего: {s.total}</span>
        <span className="badge st-equal">равны: {s.equal}</span>
        <span className="badge st-different">отличаются: {s.different}</span>
        <span className="badge st-only_a">только A: {s.onlyA}</span>
        <span className="badge st-only_b">только B: {s.onlyB}</span>
        {merged && <span className="muted">область: {result.scope === '' ? '(корень)' : result.scope}</span>}
      </div>

      {result.mode === 'by_file' && <FileSummaryPanel files={result.files} />}

      <div className="filters">
        <label className="chk">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
          только отличия
        </label>
        <input
          className="search"
          placeholder="поиск по переменной…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!merged && (
          <div className="filter-combo">
            <Combobox
              value={fileFilter}
              onChange={setFileFilter}
              placeholder="все файлы"
              labelFor={(v) => (v === '' ? 'все файлы' : v)}
              fetchOptions={(q) =>
                Promise.resolve(
                  ['', ...allFiles].filter((f) => !q || f.toLowerCase().includes(q.toLowerCase())),
                )
              }
            />
          </div>
        )}
        <span className="muted">показано: {shown}</span>
        <button className="export" disabled={shown === 0} onClick={exportCsv}>
          Экспорт CSV
        </button>
      </div>

      <table className="cmp">
        <colgroup>
          <col className="c-var" />
          <col className="c-file" />
          <col className="c-val" />
          <col className="c-val" />
          <col className="c-status" />
        </colgroup>
        <thead>
          <tr>
            <th>Переменная</th>
            <th>{merged ? 'Файл (юнит)' : 'Файл'}</th>
            <th>
              A · {result.sideA.branch} / {result.sideA.env}
            </th>
            <th>
              B · {result.sideB.branch} / {result.sideB.env}
            </th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {merged &&
            visibleMerged.map((r) => {
              const key = `${r.variable}|||${r.file}`;
              const exp = expanded.has(key);
              const long = isLong(r.valueA) || isLong(r.valueB);
              const valClass = `val${long && !exp ? ' collapsed' : ''}`;
              return (
                <tr key={key} className={`st-${r.status}`}>
                  <td className="var">{r.variable}</td>
                  <td className="file">{r.file}</td>
                  <td className="cell">
                    <div className={valClass}>{cellNodes(r.status, 'A', r.valueA, r.valueB)}</div>
                    {r.sourceA && <div className="src">← {r.sourceA}</div>}
                    {exp && <OverrideTrail entries={r.overridesA} />}
                    {long && (
                      <button className="more" onClick={() => toggle(key)}>
                        {exp ? 'Свернуть' : 'Показать ещё'}
                      </button>
                    )}
                  </td>
                  <td className="cell">
                    <div className={valClass}>{cellNodes(r.status, 'B', r.valueA, r.valueB)}</div>
                    {r.sourceB && <div className="src">← {r.sourceB}</div>}
                    {exp && <OverrideTrail entries={r.overridesB} />}
                    {long && (
                      <button className="more" onClick={() => toggle(key)}>
                        {exp ? 'Свернуть' : 'Показать ещё'}
                      </button>
                    )}
                  </td>
                  <td className="status">
                    <span className={`badge st-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                </tr>
              );
            })}

          {!merged &&
            visibleGroups.map((g) => {
              const key = g.variable;
              const exp = expanded.has(key);
              const rep = g.rep;
              const long = isLong(rep.valueA) || isLong(rep.valueB);
              const multi = g.occ.length > 1;
              const showExpander = long || multi;
              const valClass = `val${long && !exp ? ' collapsed' : ''}`;
              return (
                <tr key={key} className={`st-${rep.status}`}>
                  <td className="var">{g.variable}</td>
                  <td className="file">
                    {rep.file}
                    {multi && <span className="muted"> +{g.occ.length - 1}</span>}
                  </td>
                  <td className="cell">
                    <div className={valClass}>{cellNodes(rep.status, 'A', rep.valueA, rep.valueB)}</div>
                    {exp && multi && <OccList occ={g.occ} side="A" rep={rep} />}
                    {showExpander && (
                      <button className="more" onClick={() => toggle(key)}>
                        {exp ? 'Свернуть' : multi ? `Показать ещё (${g.occ.length} файлов)` : 'Показать ещё'}
                      </button>
                    )}
                  </td>
                  <td className="cell">
                    <div className={valClass}>{cellNodes(rep.status, 'B', rep.valueA, rep.valueB)}</div>
                    {exp && multi && <OccList occ={g.occ} side="B" rep={rep} />}
                    {showExpander && (
                      <button className="more" onClick={() => toggle(key)}>
                        {exp ? 'Свернуть' : 'Показать ещё'}
                      </button>
                    )}
                  </td>
                  <td className="status">
                    <span className={`badge st-${rep.status}`}>{STATUS_LABEL[rep.status]}</span>
                    {g.diverges && (
                      <span className="badge diverge" title="значения отличаются во вложенных слоях (custom/…)">
                        слои ≠
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}

          {shown === 0 && (
            <tr>
              <td colSpan={5} className="empty">
                нет строк под текущие фильтры
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function OccList({ occ, side, rep }: { occ: Occ[]; side: 'A' | 'B'; rep: Occ }) {
  const repVal = side === 'A' ? rep.valueA : rep.valueB;
  return (
    <div className="occ">
      <div className="occ-title">вхождения по файлам:</div>
      {occ.map((o) => {
        const v = side === 'A' ? o.valueA : o.valueB;
        const isRoot = o.file === rep.file;
        const diff = v !== repVal;
        return (
          <div key={o.file} className={`occ-row${diff ? ' diff' : ''}${isRoot ? ' root' : ''}`}>
            <span className="occ-file">
              {isRoot ? '★ ' : ''}
              {o.file}
            </span>
            <span className="occ-val">{oneLine(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

function OverrideTrail({ entries }: { entries?: OverrideEntry[] }) {
  if (!entries || entries.length <= 1) return null;
  return (
    <div className="trail">
      <div className="trail-title">слои (база → глубокий, вклад каждого):</div>
      {entries.map((e, i) => (
        <div key={e.file} className={`trail-row${i === entries.length - 1 ? ' win' : ''}`}>
          <span className="trail-file">{e.file}</span>
          <span className="trail-val">{e.value.replace(/\n/g, ' ').slice(0, 60)}</span>
        </div>
      ))}
    </div>
  );
}

function FileSummaryPanel({ files }: { files: FileSummary[] }) {
  const diffs = files.filter((f) => f.status !== 'equal');
  if (diffs.length === 0) return null;
  return (
    <details className="filepanel">
      <summary>файлы с отличиями по байтам: {diffs.length} (вкл. пробелы/EOL вне значений)</summary>
      <div className="filepanel-body">
        {diffs.map((f) => (
          <div key={f.path} className="filerow">
            <span className={`badge st-${f.status}`}>{STATUS_LABEL[f.status]}</span>
            <span className="file">{f.path}</span>
            {(f.eolA || f.eolB) && (
              <span className="muted">
                EOL: A={f.eolA ?? '—'} · B={f.eolB ?? '—'}
              </span>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

const csvField = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;

function csvFilename(r: CompareResult): string {
  const side = (x: { branch: string; env: string }) => `${x.branch}-${x.env}`.replace(/[^\w.-]+/g, '_');
  return `sledilo_${r.fp}_${side(r.sideA)}_vs_${side(r.sideB)}.csv`;
}

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
