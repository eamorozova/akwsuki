import type { EolKind, RowStatus } from '../domain/types';

/** Определяет тип перевода строки в тексте. */
export function detectEol(s: string): EolKind {
  const hasCRLF = /\r\n/.test(s);
  const bareLF = /(?<!\r)\n/.test(s);
  if (hasCRLF && bareLF) return 'mixed';
  if (hasCRLF) return 'CRLF';
  if (bareLF) return 'LF';
  return 'none';
}

/**
 * Строго текстовое сравнение значений двух сторон.
 *
 * Нормализация НЕ выполняется: любое расхождение (пробелы, табуляции, CRLF/LF,
 * порядок ключей и т.п.) трактуется как `different`.
 */
export function compareValues(a: string | null, b: string | null): RowStatus {
  if (a === null && b === null) return 'equal'; // защитный случай
  if (a === null) return 'only_b';
  if (b === null) return 'only_a';
  return a === b ? 'equal' : 'different';
}
