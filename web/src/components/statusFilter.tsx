import { useState } from 'react';

/**
 * Множество активных значений фильтра по статусу/вердикту.
 * Бейджи в шапке таблицы работают как переключатели: строка показывается,
 * если её статус входит в набор. Изначально включены «интересные» статусы
 * (отличия), консистентные — выключены.
 */
export function useToggleSet<T>(initial: T[]): [Set<T>, (v: T) => void] {
  const [set, setSet] = useState<Set<T>>(() => new Set(initial));
  const toggle = (v: T) =>
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  return [set, toggle];
}

/** Бейдж-переключатель в шапке: клик включает/выключает показ строк этого статуса. */
export function BadgeToggle({
  cls,
  label,
  count,
  active,
  onToggle,
}: {
  cls: string;
  label: string;
  count: number;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`badge ${cls} toggle${active ? '' : ' off'}`}
      aria-pressed={active}
      title={active ? 'скрыть эти строки' : 'показать эти строки'}
      onClick={onToggle}
    >
      {label}: {count}
    </button>
  );
}
