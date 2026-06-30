import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CompareResult, FileSummary, OverrideEntry, RowStatus } from '../types';
import { previewNodes } from './diffView';
import { Combobox } from './Combobox';
import { DiffModal, type DiffModalData } from './DiffModal';
import { BadgeToggle, useToggleSet } from './statusFilter';
import { useBlame, BlameTag } from './blame';

const STATUS_LABEL: Record<RowStatus, string> = {
  equal: '=',
  different: '≠',
  only_a: 'только A',
  only_b: 'только B',
};

const PAGE = 150; // сколько строк рендерим за раз (защита от фриза на больших стендах)

const depth = (p: string): number => (p.match(/\//g) ?? []).length;
const isLong = (s: string | null): boolean => !!s && (s.includes('\n') || s.length > 80);

interface Occ {
  file: string;
  valueA: string | null;
  valueB: string | null;
  lineA?: number; // строка ключа в файле стороны A / B (для blame)
  lineB?: number;
  status: RowStatus; // сравнение A↔B ДЛЯ ЭТОГО ФАЙЛА (на его уровне вложенности)
}

interface Group {
  variable: string;
  rep: Occ; // корень / самый верхний слой
  occ: Occ[];
  status: RowStatus; // агрегат по всем файлам
  hasDiff: boolean;
  nestedDiff: boolean; // есть отличия A↔B в нестандартных (не корневых) слоях
}

function aggregate(occ: Occ[]): RowStatus {
  const set = new Set(occ.map((o) => o.status));
  if (set.size === 1) return [...set][0]!;
  return 'different';
}

export function CompareTable({ result }: { result: CompareResult }) {
  const merged = result.mode === 'merged';
  const [statuses, toggleStatus] = useToggleSet<RowStatus>(['different', 'only_a', 'only_b']);
  const [query, setQuery] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [blameOpen, setBlameOpen] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [modal, setModal] = useState<DiffModalData | null>(null);
  const blame = useBlame(result.fp);

  const sideA = `${result.sideA.branch} / ${result.sideA.env}`;
  const sideB = `${result.sideB.branch} / ${result.sideB.env}`;
  // полный путь файла в репозитории конфигов = окружение + путь относительно него
  const pathA = (rel: string): string => `${result.sideA.env}/${rel}`;
  const pathB = (rel: string): string => `${result.sideB.env}/${rel}`;

  const byFileRows = result.mode === 'by_file' ? result.rows : [];
  const mergedRows = result.mode === 'merged' ? result.rows : [];

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Occ[]>();
    for (const r of byFileRows) {
      const occ: Occ = { file: r.file, valueA: r.valueA, valueB: r.valueB, lineA: r.lineA, lineB: r.lineB, status: r.status };
      const arr = map.get(r.variable);
      if (arr) arr.push(occ);
      else map.set(r.variable, [occ]);
    }
    const out: Group[] = [];
    for (const [variable, occ] of map) {
      occ.sort((a, b) => depth(a.file) - depth(b.file) || a.file.localeCompare(b.file));
      const rep = occ[0]!;
      const status = aggregate(occ);
      out.push({
        variable,
        rep,
        occ,
        status,
        hasDiff: status !== 'equal',
        nestedDiff: occ.some((o) => o.file !== rep.file && o.status !== 'equal'),
      });
    }
    out.sort((a, b) => a.variable.localeCompare(b.variable));
    return out;
  }, [byFileRows]);

  const allFiles = useMemo(() => [...new Set(byFileRows.map((r) => r.file))].sort(), [byFileRows]);

  const visibleGroups = useMemo(
    () =>
      groups.filter((g) => {
        if (!statuses.has(g.status)) return false;
        if (query && !g.variable.toLowerCase().includes(query.toLowerCase())) return false;
        if (fileFilter && !g.occ.some((o) => o.file === fileFilter)) return false;
        return true;
      }),
    [groups, statuses, query, fileFilter],
  );

  const visibleMerged = useMemo(
    () =>
      mergedRows.filter((r) => {
        if (!statuses.has(r.status)) return false;
        if (query && !r.variable.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [mergedRows, statuses, query],
  );

  useEffect(() => setLimit(PAGE), [result, statuses, query, fileFilter]);
  useEffect(() => {
    setBlameOpen(new Set());
    blame.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** Раскрыть/свернуть blame строки; при раскрытии — лениво подгрузить файлы сторон A/B. */
  const toggleBlame = (key: string, relA: string | null, lineA?: number, relB?: string | null, lineB?: number) => {
    if (blameOpen.has(key)) {
      setBlameOpen((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return;
    }
    setBlameOpen((prev) => new Set(prev).add(key));
    if (relA && lineA != null) blame.ensure('config', result.sideA.branch, pathA(relA));
    if (relB && lineB != null) blame.ensure('config', result.sideB.branch, pathB(relB));
  };

  const openValue = (variable: string, file: string, status: RowStatus, valueA: string | null, valueB: string | null) =>
    setModal({
      title: variable,
      subtitle: file,
      statusLabel: STATUS_LABEL[status],
      statusCls: `st-${status}`,
      pairs: [{ aLabel: sideA, bLabel: sideB, valueA, valueB }],
    });

  const s = result.stats;
  const total = merged ? visibleMerged.length : visibleGroups.length;
  const shownMerged = visibleMerged.slice(0, limit);
  const shownGroups = visibleGroups.slice(0, limit);
  const rendered = merged ? shownMerged.length : shownGroups.length;

  return (
    <div className="result">
      <div className="stats">
        <span>всего: {s.total}</span>
        <BadgeToggle cls="st-equal" label="равны" count={s.equal} active={statuses.has('equal')} onToggle={() => toggleStatus('equal')} />
        <BadgeToggle cls="st-different" label="отличаются" count={s.different} active={statuses.has('different')} onToggle={() => toggleStatus('different')} />
        <BadgeToggle cls="st-only_a" label="только A" count={s.onlyA} active={statuses.has('only_a')} onToggle={() => toggleStatus('only_a')} />
        <BadgeToggle cls="st-only_b" label="только B" count={s.onlyB} active={statuses.has('only_b')} onToggle={() => toggleStatus('only_b')} />
        {merged && <span className="muted">область: {result.scope === '' ? '(корень)' : result.scope}</span>}
      </div>

      {result.mode === 'by_file' && <FileSummaryPanel files={result.files} />}

      <div className="filters">
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
                Promise.resolve(['', ...allFiles].filter((f) => !q || f.toLowerCase().includes(q.toLowerCase())))
              }
            />
          </div>
        )}
        <span className="muted">показано: {rendered} из {total}</span>
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
            <th>A · {sideA}</th>
            <th>B · {sideB}</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {merged &&
            shownMerged.map((r) => {
              const key = `${r.variable}|||${r.file}`;
              const exp = expanded.has(key);
              const bOpen = blameOpen.has(key);
              const long = isLong(r.valueA) || isLong(r.valueB);
              const hasTrail = (r.overridesA?.length ?? 0) > 1 || (r.overridesB?.length ?? 0) > 1;
              return (
                <tr key={key} className={`st-${r.status}`}>
                  <td className="var">{r.variable}</td>
                  <td className="file">{r.file}</td>
                  <td className="cell">
                    <div className="val">{previewNodes(r.status, 'A', r.valueA, r.valueB)}</div>
                    {r.sourceA && <div className="src">← {r.sourceA}</div>}
                    {bOpen && <BlameTag state={blame.state('config', result.sideA.branch, pathA(r.sourceA ?? ''), r.lineA)} />}
                    {exp && <OverrideTrail entries={r.overridesA} />}
                    <div className="cell-actions">
                      {long && (
                        <button className="more" onClick={() => openValue(r.variable, r.file, r.status, r.valueA, r.valueB)}>
                          Развернуть
                        </button>
                      )}
                      {hasTrail && (
                        <button className="more" onClick={() => toggle(key)}>
                          {exp ? 'Скрыть слои' : `слои (${r.overridesA?.length ?? 0})`}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="cell">
                    <div className="val">{previewNodes(r.status, 'B', r.valueA, r.valueB)}</div>
                    {r.sourceB && <div className="src">← {r.sourceB}</div>}
                    {bOpen && <BlameTag state={blame.state('config', result.sideB.branch, pathB(r.sourceB ?? ''), r.lineB)} />}
                    {exp && <OverrideTrail entries={r.overridesB} />}
                  </td>
                  <td className="status">
                    <span className={`badge st-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                    <button className="more blame-toggle" onClick={() => toggleBlame(key, r.sourceA, r.lineA, r.sourceB, r.lineB)}>
                      {bOpen ? 'скрыть blame' : 'blame'}
                    </button>
                  </td>
                </tr>
              );
            })}

          {!merged &&
            shownGroups.map((g) => {
              const key = g.variable;
              const exp = expanded.has(key);
              const bOpen = blameOpen.has(key);
              const rep = g.rep;
              const long = isLong(rep.valueA) || isLong(rep.valueB);
              const multi = g.occ.length > 1;
              return (
                <Fragment key={key}>
                  <tr className={`st-${g.status}`}>
                    <td className="var">{g.variable}</td>
                    <td className="file">
                      {rep.file}
                      {multi && <span className="muted"> +{g.occ.length - 1}</span>}
                    </td>
                    <td className="cell">
                      <div className="val">{previewNodes(rep.status, 'A', rep.valueA, rep.valueB)}</div>
                      {bOpen && <BlameTag state={blame.state('config', result.sideA.branch, pathA(rep.file), rep.lineA)} />}
                      <div className="cell-actions">
                        {long && (
                          <button className="more" onClick={() => openValue(g.variable, rep.file, rep.status, rep.valueA, rep.valueB)}>
                            Развернуть
                          </button>
                        )}
                        {multi && (
                          <button className="more" onClick={() => toggle(key)}>
                            {exp ? 'Скрыть вхождения' : `вхождения (${g.occ.length})`}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="cell">
                      <div className="val">{previewNodes(rep.status, 'B', rep.valueA, rep.valueB)}</div>
                      {bOpen && <BlameTag state={blame.state('config', result.sideB.branch, pathB(rep.file), rep.lineB)} />}
                    </td>
                    <td className="status">
                      <span className={`badge st-${g.status}`}>{STATUS_LABEL[g.status]}</span>
                      {g.nestedDiff && (
                        <span className="badge diverge" title="есть отличия A↔B во вложенных слоях (custom/…)">
                          слои ≠
                        </span>
                      )}
                      <button className="more blame-toggle" onClick={() => toggleBlame(key, rep.file, rep.lineA, rep.file, rep.lineB)}>
                        {bOpen ? 'скрыть blame' : 'blame'}
                      </button>
                    </td>
                  </tr>
                  {exp && multi && (
                    <tr className="detail">
                      <td colSpan={5}>
                        <OccTable variable={g.variable} occ={g.occ} sideA={sideA} sideB={sideB} onOpen={openValue} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

          {total === 0 && (
            <tr>
              <td colSpan={5} className="empty">
                нет строк под текущие фильтры
              </td>
            </tr>
          )}

          {rendered < total && (
            <tr>
              <td colSpan={5} className="loadmore-cell">
                <button className="loadmore" onClick={() => setLimit((l) => l + PAGE)}>
                  Показать ещё {Math.min(PAGE, total - rendered)} (осталось {total - rendered})
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

/** Табличный вид вхождений переменной по файлам: каждый файл сравнивается A↔B на своём уровне. */
function OccTable({
  variable,
  occ,
  sideA,
  sideB,
  onOpen,
}: {
  variable: string;
  occ: Occ[];
  sideA: string;
  sideB: string;
  onOpen: (variable: string, file: string, status: RowStatus, valueA: string | null, valueB: string | null) => void;
}) {
  return (
    <div className="occ-wrap">
      <div className="occ-caption">
        вхождения переменной «<b>{variable}</b>» по файлам:
      </div>
      <table className="occ-table">
        <thead>
          <tr>
            <th>Файл</th>
            <th>A · {sideA}</th>
            <th>B · {sideB}</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {occ.map((o) => {
            const long = isLong(o.valueA) || isLong(o.valueB);
            return (
              <tr key={o.file} className={o.status !== 'equal' ? 'diff' : ''}>
                <td className="occ-file">{o.file}</td>
                <td className="occ-val">
                  <div className="val">{previewNodes(o.status, 'A', o.valueA, o.valueB)}</div>
                  {long && (
                    <button className="more" onClick={() => onOpen(variable, o.file, o.status, o.valueA, o.valueB)}>
                      Развернуть
                    </button>
                  )}
                </td>
                <td className="occ-val">
                  <div className="val">{previewNodes(o.status, 'B', o.valueA, o.valueB)}</div>
                </td>
                <td>
                  <span className={`badge st-${o.status}`}>{STATUS_LABEL[o.status]}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

const REASON_LABEL: Record<string, string> = {
  eol: 'перевод строки (CRLF/LF)',
  whitespace: 'пробелы / пустые строки / конец файла',
  content: 'содержимое (см. таблицу переменных)',
  missing: 'файл есть только с одной стороны',
};

function FileSummaryPanel({ files }: { files: FileSummary[] }) {
  // только «невидимые» различия — то, что НЕ видно в сравнении переменных
  const diffs = files.filter((f) => f.reason === 'eol' || f.reason === 'whitespace');
  if (diffs.length === 0) return null;
  const shown = diffs.slice(0, 200);
  return (
    <details className="filepanel">
      <summary>файлы, различающиеся только форматированием: {diffs.length}</summary>
      <div className="filepanel-body">
        {shown.map((f) => (
          <div key={f.path} className="filerow">
            <span className={`badge st-${f.status}`}>{STATUS_LABEL[f.status]}</span>
            <span className="file">{f.path}</span>
            {f.reason && <span className="reason">{REASON_LABEL[f.reason]}</span>}
            {f.reason === 'eol' && (
              <span className="muted">
                A={f.eolA ?? '—'} · B={f.eolB ?? '—'}
              </span>
            )}
          </div>
        ))}
        {diffs.length > shown.length && <div className="muted">…и ещё {diffs.length - shown.length}</div>}
      </div>
    </details>
  );
}
