import { parseAllDocuments, isMap, isScalar } from 'yaml';
import type { ScannedFile, ScannedVariable } from '../domain/types';
import { detectEol } from '../diff/textDiff';

interface RangedNode {
  range?: [number, number, number] | null;
}

/**
 * Извлекает переменные (ключи верхнего уровня) из YAML-файла вместе с их сырыми
 * текстовыми срезами значений. YAML парсится только ради позиций узлов; сами
 * значения берутся как подстроки исходника без нормализации.
 */
export function scanFile(filePath: string, content: string): ScannedFile {
  const variables: ScannedVariable[] = [];
  let error: string | undefined;

  try {
    const docs = parseAllDocuments(content);
    for (const doc of docs) {
      if (doc.errors.length > 0) {
        error = doc.errors.map((e) => e.message).join('; ');
      }
      const root = doc.contents;
      if (isMap(root)) {
        for (const pair of root.items) {
          const name = keyName(pair.key);
          const raw = sliceNode(content, pair.value as RangedNode | null);
          variables.push({ name, raw, eol: detectEol(raw) });
        }
      } else if (root) {
        // Корень не-map (скаляр/последовательность) — одна псевдо-переменная.
        const raw = sliceNode(content, root as RangedNode);
        variables.push({ name: '(root)', raw, eol: detectEol(raw) });
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return error ? { path: filePath, variables, error } : { path: filePath, variables };
}

function keyName(key: unknown): string {
  if (isScalar(key)) return String(key.value);
  return String(key);
}

/** Сырой срез значения по диапазону узла [start, valueEnd). */
function sliceNode(src: string, node: RangedNode | null): string {
  const r = node?.range;
  if (!r) return '';
  return src.slice(r[0], r[1]);
}
