import { diffChars, diffLines } from 'diff';
import type { ReactNode } from 'react';

// Порог, выше которого посимвольный diff слишком дорог (O(n*m)) — переходим на построчный.
const CHAR_DIFF_LIMIT = 4000;

/**
 * Рендерит текст, делая невидимые символы видимыми и сохраняя переносы строк:
 * пробел → ·, таб → →, CR → ␍, LF → ↵ + перенос.
 */
export function visualize(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf) {
      nodes.push(<span key={`${keyPrefix}-t${i}`}>{buf}</span>);
      buf = '';
    }
  };
  for (const ch of text) {
    if (ch === ' ') {
      flush();
      nodes.push(<span key={`${keyPrefix}-sp${i}`} className="ws">·</span>);
    } else if (ch === '\t') {
      flush();
      nodes.push(<span key={`${keyPrefix}-tab${i}`} className="ws">→</span>);
    } else if (ch === '\r') {
      flush();
      nodes.push(<span key={`${keyPrefix}-cr${i}`} className="ws">␍</span>);
    } else if (ch === '\n') {
      flush();
      nodes.push(<span key={`${keyPrefix}-lf${i}`} className="ws">↵</span>);
      nodes.push(<br key={`${keyPrefix}-br${i}`} />);
    } else {
      buf += ch;
    }
    i++;
  }
  flush();
  return nodes;
}

/**
 * Посимвольный diff. Для стороны A показываем общие + удалённые сегменты,
 * для стороны B — общие + добавленные. Различия подсвечиваются.
 */
export function renderDiff(a: string, b: string, side: 'A' | 'B'): ReactNode[] {
  const parts = diffChars(a, b);
  const out: ReactNode[] = [];
  parts.forEach((p, idx) => {
    if (side === 'A' && p.added) return;
    if (side === 'B' && p.removed) return;
    const cls = p.added ? 'add' : p.removed ? 'del' : 'eq';
    out.push(
      <span key={idx} className={`seg ${cls}`}>
        {visualize(p.value, `${side}-${idx}`)}
      </span>,
    );
  });
  return out;
}

/** Построчный diff для больших значений — дёшево по DOM (без span на символ). */
function renderLineDiff(a: string, b: string, side: 'A' | 'B'): ReactNode[] {
  const out: ReactNode[] = [];
  diffLines(a, b).forEach((p, idx) => {
    if (side === 'A' && p.added) return;
    if (side === 'B' && p.removed) return;
    const cls = p.added ? 'add' : p.removed ? 'del' : 'eq';
    out.push(
      <span key={idx} className={`seg ${cls} rawline`}>
        {p.value}
      </span>,
    );
  });
  return out;
}

/** Контент ячейки значения для одной стороны с учётом статуса строки (полный, для раскрытой строки). */
export function cellNodes(
  status: string,
  side: 'A' | 'B',
  valueA: string | null,
  valueB: string | null,
): ReactNode {
  const value = side === 'A' ? valueA : valueB;
  if (value === null) return <span className="none">— (нет)</span>;
  if (status === 'different') {
    const a = valueA ?? '';
    const b = valueB ?? '';
    if (a.length > CHAR_DIFF_LIMIT || b.length > CHAR_DIFF_LIMIT) return renderLineDiff(a, b, side);
    return renderDiff(a, b, side);
  }
  if (value.length > CHAR_DIFF_LIMIT) return <span className="seg eq rawline">{value}</span>;
  return <span className="seg eq">{visualize(value, side)}</span>;
}

const PREVIEW_LIMIT = 200;

/**
 * Дешёвый предпросмотр значения (для свёрнутой строки): ограничен по длине,
 * поэтому рендер списка из сотен строк не блокирует поток. Полный посимвольный
 * diff со всеми пробелами считается только при раскрытии (cellNodes).
 */
export function previewNodes(
  status: string,
  side: 'A' | 'B',
  valueA: string | null,
  valueB: string | null,
): ReactNode {
  const value = side === 'A' ? valueA : valueB;
  if (value === null) return <span className="none">— (нет)</span>;
  const ell = value.length > PREVIEW_LIMIT ? '…' : '';
  if (status === 'different') {
    const a = (valueA ?? '').slice(0, PREVIEW_LIMIT);
    const b = (valueB ?? '').slice(0, PREVIEW_LIMIT);
    return (
      <>
        {renderDiff(a, b, side)}
        {ell}
      </>
    );
  }
  return (
    <span className="seg eq">
      {visualize(value.slice(0, PREVIEW_LIMIT), side)}
      {ell}
    </span>
  );
}
