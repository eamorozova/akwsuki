import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { diffLines } from 'diff';
import { visualize } from './diffView';

export interface DiffModalPair {
  caption?: string; // напр. «Окр.1: DEV»
  aLabel: string; // что слева/«было»
  bLabel: string; // что справа/«стало»
  valueA: string | null;
  valueB: string | null;
}

export interface DiffModalData {
  title: string; // переменная / параметр
  subtitle?: string; // файл
  statusLabel?: string;
  statusCls?: string;
  pairs: DiffModalPair[];
}

type Ln = { t: 'eq' | 'del' | 'add'; text: string };
type Item = Ln | { fold: number };

function toLines(a: string | null, b: string | null): Ln[] {
  const out: Ln[] = [];
  for (const p of diffLines(a ?? '', b ?? '')) {
    const t: Ln['t'] = p.added ? 'add' : p.removed ? 'del' : 'eq';
    const parts = p.value.split('\n');
    if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
    for (const text of parts) out.push({ t, text });
  }
  return out;
}

const CONTEXT = 3;
function fold(lines: Ln[]): Item[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.t !== 'eq') {
      for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) keep[j] = true;
    }
  });
  const out: Item[] = [];
  let hidden = 0;
  for (let i = 0; i < lines.length; i++) {
    if (keep[i]) {
      if (hidden) {
        out.push({ fold: hidden });
        hidden = 0;
      }
      out.push(lines[i]!);
    } else {
      hidden++;
    }
  }
  if (hidden) out.push({ fold: hidden });
  return out;
}

function renderItem(item: Item, i: number): ReactNode {
  if ('fold' in item) {
    return (
      <div key={i} className="dl dl-fold">
        ··· {item.fold} неизменных строк ···
      </div>
    );
  }
  const gut = item.t === 'add' ? '+' : item.t === 'del' ? '−' : ' ';
  // на изменённых строках показываем невидимые символы; на контексте — обычный текст
  const content = item.t === 'eq' ? item.text || ' ' : visualize(item.text, `l${i}`);
  return (
    <div key={i} className={`dl dl-${item.t}`}>
      <span className="gut">{gut}</span>
      <span className="txt">{content}</span>
    </div>
  );
}

export function DiffModal({ data, onClose }: { data: DiffModalData | null; onClose: () => void }) {
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [wrap, setWrap] = useState(false);

  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [data, onClose]);

  if (!data) return null;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <b>{data.title}</b>
            {data.subtitle && <span className="modal-sub">{data.subtitle}</span>}
            {data.statusLabel && <span className={`badge ${data.statusCls ?? ''}`}>{data.statusLabel}</span>}
          </div>
          <div className="modal-tools">
            <label className="chk">
              <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />
              только изменения
            </label>
            <label className="chk">
              <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />
              перенос строк
            </label>
            <button className="more" onClick={onClose}>
              Закрыть ✕
            </button>
          </div>
        </div>

        <div className="modal-body">
          {data.pairs.map((pair, pi) => {
            const lines = toLines(pair.valueA, pair.valueB);
            const changed = lines.some((l) => l.t !== 'eq');
            const items = onlyChanges ? fold(lines) : lines;
            return (
              <div key={pi} className="diff-section">
                {pair.caption && <div className="diff-caption">{pair.caption}</div>}
                <div className="diff-legend">
                  <span className="leg del">−&nbsp;{pair.aLabel}</span>
                  <span className="leg add">+&nbsp;{pair.bLabel}</span>
                </div>
                {changed ? (
                  <div className={`diffbox${wrap ? ' wrap' : ''}`}>{items.map(renderItem)}</div>
                ) : (
                  <div className="diff-equal">значения совпадают</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
