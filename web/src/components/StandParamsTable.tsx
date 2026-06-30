import { useEffect, useMemo, useState } from 'react';
import type { CompareStandsResult, RowStatus, StandParamRow } from '../types';
import { previewNodes } from './diffView';
import { DiffModal, type DiffModalData } from './DiffModal';
import { BadgeToggle, useToggleSet } from './statusFilter';
import { useBlame, BlameTag } from './blame';

const PAGE = 150;
const STATUS_LABEL: Record<RowStatus, string> = {
  equal: '=',
  different: '≠',
  only_a: 'только A',
  only_b: 'только B',
};
const isLong = (s: string | null): boolean => !!s && (s.includes('\n') || s.length > 80);

export function StandParamsTable({ result }: { result: CompareStandsResult }) {
  const [statuses, toggleStatus] = useToggleSet<RowStatus>(['different', 'only_a', 'only_b']);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [modal, setModal] = useState<DiffModalData | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const blame = useBlame(result.fp);

  const visible = useMemo(
    () =>
      result.rows.filter((r) => {
        if (!statuses.has(r.status)) return false;
        if (query && !r.param.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [result, statuses, query],
  );

  useEffect(() => setLimit(PAGE), [result, statuses, query]);
  useEffect(() => {
    setExpanded(new Set());
    blame.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // параметры стендов лежат в одном groovy-файле shared-репозитория
  const toggleRow = (r: StandParamRow) => {
    if (expanded.has(r.param)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(r.param);
        return next;
      });
      return;
    }
    setExpanded((prev) => new Set(prev).add(r.param));
    blame.ensure('shared', result.branch1, result.paramsPath);
    blame.ensure('shared', result.branch2, result.paramsPath);
  };

  const open = (r: StandParamRow) =>
    setModal({
      title: r.param,
      statusLabel: STATUS_LABEL[r.status],
      statusCls: `st-${r.status}`,
      pairs: [
        {
          aLabel: `${result.branch1} / ${result.stand1}`,
          bLabel: `${result.branch2} / ${result.stand2}`,
          valueA: r.valueA,
          valueB: r.valueB,
        },
      ],
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
            const long = isLong(r.valueA) || isLong(r.valueB);
            const exp = expanded.has(r.param);
            return (
              <tr key={r.param} className={`st-${r.status}`}>
                <td className="var">{r.param}</td>
                <td className="cell">
                  <div className="val">{previewNodes(r.status, 'A', r.valueA, r.valueB)}</div>
                  {exp && <BlameTag state={blame.state('shared', result.branch1, result.paramsPath, r.lineA)} />}
                  {long && (
                    <button className="more" onClick={() => open(r)}>
                      Развернуть
                    </button>
                  )}
                </td>
                <td className="cell">
                  <div className="val">{previewNodes(r.status, 'B', r.valueA, r.valueB)}</div>
                  {exp && <BlameTag state={blame.state('shared', result.branch2, result.paramsPath, r.lineB)} />}
                </td>
                <td className="status">
                  <span className={`badge st-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  <button className="more blame-toggle" onClick={() => toggleRow(r)}>
                    {exp ? 'скрыть blame' : 'blame'}
                  </button>
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

      <DiffModal data={modal} onClose={() => setModal(null)} />
    </div>
  );
}
