import { useEffect, useMemo, useState } from 'react';
import type { CompareRssResult, RowStatus, RssRow } from '../types';
import { previewNodes } from './diffView';
import { Combobox } from './Combobox';
import { DiffModal, type DiffModalData } from './DiffModal';
import { BadgeToggle, useToggleSet } from './statusFilter';

const PAGE = 150;
const STATUS_LABEL: Record<RowStatus, string> = {
  equal: '=',
  different: '≠',
  only_a: 'только A',
  only_b: 'только B',
};
const isLong = (s: string | null): boolean => !!s && (s.includes('\n') || s.length > 80);

export function RssTable({ result }: { result: CompareRssResult }) {
  const [statuses, toggleStatus] = useToggleSet<RowStatus>(['different', 'only_a', 'only_b']);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [modal, setModal] = useState<DiffModalData | null>(null);

  const sideA = `${result.sideA.branch} · ${result.sideA.env}/${result.sideA.stand}`;
  const sideB = `${result.sideB.branch} · ${result.sideB.env}/${result.sideB.stand}`;

  const allSources = useMemo(() => [...new Set(result.rows.map((r) => r.source))].sort(), [result]);

  const visible = useMemo(
    () =>
      result.rows.filter((r) => {
        if (!statuses.has(r.status)) return false;
        if (sourceFilter && r.source !== sourceFilter) return false;
        if (query && !r.param.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [result, statuses, query, sourceFilter],
  );

  useEffect(() => setLimit(PAGE), [result, statuses, query, sourceFilter]);

  const open = (r: RssRow) =>
    setModal({
      title: r.param,
      subtitle: r.source,
      statusLabel: STATUS_LABEL[r.status],
      statusCls: `st-${r.status}`,
      pairs: [{ aLabel: sideA, bLabel: sideB, valueA: r.valueA, valueB: r.valueB }],
    });

  const s = result.stats;
  const shown = visible.slice(0, limit);

  return (
    <div className="result">
      <div className="stats">
        <span>всего: {s.total}</span>
        <BadgeToggle cls="st-equal" label="равны" count={s.equal} active={statuses.has('equal')} onToggle={() => toggleStatus('equal')} />
        <BadgeToggle cls="st-different" label="отличаются" count={s.different} active={statuses.has('different')} onToggle={() => toggleStatus('different')} />
        <BadgeToggle cls="st-only_a" label="только A" count={s.onlyA} active={statuses.has('only_a')} onToggle={() => toggleStatus('only_a')} />
        <BadgeToggle cls="st-only_b" label="только B" count={s.onlyB} active={statuses.has('only_b')} onToggle={() => toggleStatus('only_b')} />
      </div>

      <div className="filters">
        <input className="search" placeholder="поиск по параметру…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="filter-combo">
          <Combobox
            value={sourceFilter}
            onChange={setSourceFilter}
            placeholder="все сервисы"
            labelFor={(v) => (v === '' ? 'все сервисы' : v)}
            fetchOptions={(q) => Promise.resolve(['', ...allSources].filter((f) => !q || f.toLowerCase().includes(q.toLowerCase())))}
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
          <col className="c-status" />
        </colgroup>
        <thead>
          <tr>
            <th>Параметр</th>
            <th>Сервис</th>
            <th>A · {sideA}</th>
            <th>B · {sideB}</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const long = isLong(r.valueA) || isLong(r.valueB);
            return (
              <tr key={`${r.source}|||${r.param}`} className={`st-${r.status}`}>
                <td className="var">{r.param}</td>
                <td className="file">{r.source}</td>
                <td className="cell">
                  <div className="val">{previewNodes(r.status, 'A', r.valueA, r.valueB)}</div>
                  {long && (
                    <button className="more" onClick={() => open(r)}>
                      Развернуть
                    </button>
                  )}
                </td>
                <td className="cell">
                  <div className="val">{previewNodes(r.status, 'B', r.valueA, r.valueB)}</div>
                </td>
                <td className="status">
                  <span className={`badge st-${r.status}`}>{STATUS_LABEL[r.status]}</span>
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
