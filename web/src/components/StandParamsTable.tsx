import { useEffect, useMemo, useState } from 'react';
import type { CompareStandsResult, RowStatus } from '../types';
import { cellNodes, previewNodes } from './diffView';

const PAGE = 150;
const STATUS_LABEL: Record<RowStatus, string> = {
  equal: '=',
  different: '≠',
  only_a: 'только A',
  only_b: 'только B',
};
const isLong = (s: string | null): boolean => !!s && (s.includes('\n') || s.length > 80);

export function StandParamsTable({ result }: { result: CompareStandsResult }) {
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);

  const visible = useMemo(
    () =>
      result.rows.filter((r) => {
        if (onlyDiff && r.status === 'equal') return false;
        if (query && !r.param.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [result, onlyDiff, query],
  );

  useEffect(() => setLimit(PAGE), [result, onlyDiff, query]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const s = result.stats;
  const shown = visible.slice(0, limit);

  return (
    <div className="result">
      <div className="stats">
        <span>всего: {s.total}</span>
        <span className="badge st-equal">равны: {s.equal}</span>
        <span className="badge st-different">отличаются: {s.different}</span>
        <span className="badge st-only_a">только A: {s.onlyA}</span>
        <span className="badge st-only_b">только B: {s.onlyB}</span>
      </div>

      <div className="filters">
        <label className="chk">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
          только отличия
        </label>
        <input className="search" placeholder="поиск по параметру…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="muted">показано: {shown.length} из {visible.length}</span>
      </div>

      <table className="cmp">
        <colgroup>
          <col className="c-var" />
          <col className="c-val" />
          <col className="c-val" />
          <col className="c-status" />
        </colgroup>
        <thead>
          <tr>
            <th>Параметр</th>
            <th>
              A · {result.branch1} / {result.stand1}
            </th>
            <th>
              B · {result.branch2} / {result.stand2}
            </th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const exp = expanded.has(r.param);
            const long = isLong(r.valueA) || isLong(r.valueB);
            return (
              <tr key={r.param} className={`st-${r.status}`}>
                <td className="var">{r.param}</td>
                <td className="cell">
                  <div className="val">
                    {exp ? cellNodes(r.status, 'A', r.valueA, r.valueB) : previewNodes(r.status, 'A', r.valueA, r.valueB)}
                  </div>
                  {long && (
                    <button className="more" onClick={() => toggle(r.param)}>
                      {exp ? 'Свернуть' : 'Показать ещё'}
                    </button>
                  )}
                </td>
                <td className="cell">
                  <div className="val">
                    {exp ? cellNodes(r.status, 'B', r.valueA, r.valueB) : previewNodes(r.status, 'B', r.valueA, r.valueB)}
                  </div>
                </td>
                <td className="status">
                  <span className={`badge st-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                </td>
              </tr>
            );
          })}

          {visible.length === 0 && (
            <tr>
              <td colSpan={4} className="empty">
                нет строк под текущие фильтры
              </td>
            </tr>
          )}

          {shown.length < visible.length && (
            <tr>
              <td colSpan={4} className="loadmore-cell">
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
