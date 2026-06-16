import { useEffect, useRef, useState } from 'react';

interface ComboboxProps {
  value: string;
  onChange: (v: string) => void;
  /** Возвращает список опций по строке поиска (сервер или клиентская фильтрация). */
  fetchOptions: (query: string) => Promise<string[]>;
  placeholder?: string;
  disabled?: boolean;
  /** Подпись для пустого значения (например «(корень)»). */
  labelFor?: (v: string) => string;
  emptyText?: string;
}

export function Combobox({
  value,
  onChange,
  fetchOptions,
  placeholder,
  disabled,
  labelFor,
  emptyText = 'ничего не найдено',
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fetchRef = useRef(fetchOptions);
  fetchRef.current = fetchOptions;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const opts = await fetchRef.current(query);
        if (alive) setOptions(opts);
      } catch {
        if (alive) setOptions([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, query ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const choose = (o: string) => {
    onChange(o);
    setOpen(false);
    setQuery('');
  };

  const display = value ? (labelFor ? labelFor(value) : value) : placeholder || '—';

  return (
    <div className={`combo${disabled ? ' disabled' : ''}`} ref={ref}>
      <button
        type="button"
        className="combo-value"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={value}
      >
        <span className={value ? 'combo-text' : 'combo-text ph'}>{display}</span>
        <span className="combo-caret">▾</span>
      </button>
      {open && (
        <div className="combo-pop">
          <input
            className="combo-input"
            autoFocus
            placeholder="поиск…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
          />
          <div className="combo-list">
            {loading && <div className="combo-empty">загрузка…</div>}
            {!loading && options.length === 0 && <div className="combo-empty">{emptyText}</div>}
            {!loading &&
              options.map((o) => (
                <div
                  key={o}
                  className={`combo-opt${o === value ? ' sel' : ''}`}
                  onClick={() => choose(o)}
                >
                  {labelFor ? labelFor(o) : o}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
