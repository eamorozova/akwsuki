import { diffChars } from 'diff';
import type { ReactNode } from 'react';

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

/** Контент ячейки значения для одной стороны с учётом статуса строки. */
export function cellNodes(
  status: string,
  side: 'A' | 'B',
  valueA: string | null,
  valueB: string | null,
): ReactNode {
  const value = side === 'A' ? valueA : valueB;
  if (value === null) return <span className="none">— (нет)</span>;
  if (status === 'different') return renderDiff(valueA ?? '', valueB ?? '', side);
  return <span className="seg eq">{visualize(value, side)}</span>;
}
