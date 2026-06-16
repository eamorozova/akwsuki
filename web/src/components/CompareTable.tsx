import { useMemo, useState } from 'react';
import type {
  CompareResult,
  FileSummary,
  OverrideEntry,
  RowStatus,
} from '../types';
import { cellNodes } from './diffView';

const dirOf = (p: string): string => {
  const i = p.lastIndexOf('/');
  return i === -1 ? '(корень)' : p.slice(0, i);
};

const isLong = (s: string | null): boolean => !!s && (s.includes('\n') || s.length > 80);

const STATUS_LABEL: Record<RowStatus, string> = {
  equal: '=',
  different: '≠',
  only_a: 'только A',
  only_b: 'только B',
};

interface UiRow {
  key: string;
  variable: string;
  file: string;
  valueA: string | null;
  valueB: string | null;
  status: RowStatus;
  sourceA?: string | null;
  sourceB?: string | null;
  overridesA?: OverrideEntry[];
  overridesB?: OverrideEntry[];
}

function toUiRows(result: CompareResult): UiRow[] {
  if (result.mode === 'merged') {
    return result.rows.map((r) => ({
      key: `${r.variable}|||${r.file}`,
      variable: r.variable,
      file: r.file,
      valueA: r.valueA,
      valueB: r.valueB,
      status: r.status,
      sourceA: r.sourceA,
      sourceB: r.sourceB,
      overridesA: r.overridesA,
      overridesB: r.overridesB,
    }));
  }
  return result.rows.map((r) => ({
    key: `${r.variable}|||${r.file}`,
    variable: r.variable,
    file: r.file,
    valueA: r.valueA,
    valueB: r.valueB,
    status: r.status,
  }));
}

export function CompareTable({ result }: { result: CompareResult }) {
  const merged = result.mode === 'merged';
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('');
  const [file, setFile] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const allRows = useMemo(() => toUiRows(result), [result]);
  const folders = useMemo(() => [...new Set(allRows.map((r) => dirOf(r.file)))].sort(), [allRows]);
  const files = useMemo(() => [...new Set(allRows.map((r) => r.file))].sort(), [allRows]);

  const rows = useMemo(
    () =>
      allRows.filter((r) => {
        if (onlyDiff && r.status === 'equal') return false;
        if (!merged && folder && dirOf(r.file) !== folder) return false;
        if (!merged && file && r.file !== file) return false;
        if (query && !r.variable.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [allRows, onlyDiff, folder, file, query, merged],
  );

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const s = result.stats;

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
          <>
            <select value={folder} onChange={(e) => setFolder(e.target.value)}>
              <option value="">все папки</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select value={file} onChange={(e) => setFile(e.target.value)}>
              <option value="">все файлы</option>
              {files.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </>
        )}
        <span className="muted">показано: {rows.length}</span>
        <button
          className="export"
          disabled={rows.length === 0}
          onClick={() => downloadCsv(csvFilename(result), buildCsv(rows, merged))}
        >
          Экспорт CSV
        </button>
      </div>

      <table className="cmp">
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
          {rows.map((r) => {
            const exp = expanded.has(r.key);
            const long = isLong(r.valueA) || isLong(r.valueB);
            const valClass = `val${long && !exp ? ' collapsed' : ''}`;
            return (
              <tr key={r.key} className={`st-${r.status}`}>
                <td className="var">{r.variable}</td>
                <td className="file">{r.file}</td>
                <td className="cell">
                  <div className={valClass}>{cellNodes(r.status, 'A', r.valueA, r.valueB)}</div>
                  {merged && r.sourceA && <div className="src">← {r.sourceA}</div>}
                  {merged && exp && <OverrideTrail entries={r.overridesA} />}
                  {long && (
                    <button className="more" onClick={() => toggle(r.key)}>
                      {exp ? 'Свернуть' : 'Показать ещё'}
                    </button>
                  )}
                </td>
                <td className="cell">
                  <div className={valClass}>{cellNodes(r.status, 'B', r.valueA, r.valueB)}</div>
                  {merged && r.sourceB && <div className="src">← {r.sourceB}</div>}
                  {merged && exp && <OverrideTrail entries={r.overridesB} />}
                  {long && (
                    <button className="more" onClick={() => toggle(r.key)}>
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
          {rows.length === 0 && (
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

const csvField = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;

function buildCsv(rows: UiRow[], merged: boolean): string {
  const header = merged
    ? ['Переменная', 'Файл', 'Значение A', 'Источник A', 'Значение B', 'Источник B', 'Статус']
    : ['Переменная', 'Файл', 'Значение A', 'Значение B', 'Статус'];
  const lines = [header.map(csvField).join(',')];
  for (const r of rows) {
    const cols = merged
      ? [r.variable, r.file, r.valueA, r.sourceA, r.valueB, r.sourceB, STATUS_LABEL[r.status]]
      : [r.variable, r.file, r.valueA, r.valueB, STATUS_LABEL[r.status]];
    lines.push(cols.map(csvField).join(','));
  }
  return lines.join('\r\n');
}

function csvFilename(r: CompareResult): string {
  const side = (x: { branch: string; env: string }) => `${x.branch}-${x.env}`.replace(/[^\w.-]+/g, '_');
  return `sledilo_${r.fp}_${side(r.sideA)}_vs_${side(r.sideB)}.csv`;
}

function downloadCsv(filename: string, csv: string): void {
  // BOM — чтобы Excel корректно показал кириллицу
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

function OverrideTrail({ entries }: { entries?: OverrideEntry[] }) {
  if (!entries || entries.length <= 1) return null;
  return (
    <div className="trail">
      <div className="trail-title">слои:</div>
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
      <summary>
        файлы с отличиями по байтам: {diffs.length} (вкл. пробелы/EOL вне значений)
      </summary>
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
