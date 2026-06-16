import { parseAllDocuments, isMap, isScalar, stringify } from 'yaml';
import type { RepoFile } from '../provider/FileProvider';
import type { EolKind, OverrideEntry } from '../domain/types';
import { detectEol } from '../diff/textDiff';

/** Эффективная переменная после применения цепочки переопределения (глубокое слияние). */
export interface MergedVar {
  variable: string;
  /** Базовое имя файла-«юнита» (postgres.yaml и т.п.) — ключ переопределения. */
  file: string;
  /** Эффективное значение: канонический YAML результата слияния (ключи отсортированы). */
  value: string;
  eol: EolKind;
  /** Наиболее специфичный (глубокий) слой, участвовавший в значении. */
  source: string;
  /** Трейл вкладов слоёв от базового к глубокому (сырой текст значения каждого слоя). */
  overrides: OverrideEntry[];
}

const dirOf = (p: string): string => {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
};
const baseOf = (p: string): string => {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
};

/**
 * Папки-слои для выбранной области (scope). Каждый предок пути добавляет слой;
 * глубже — выше приоритет. Пример: 'custom/sds-api' → ['', 'custom', 'custom/sds-api'].
 */
export function layerDirs(scope: string): string[] {
  const dirs = [''];
  if (!scope) return dirs;
  let acc = '';
  for (const seg of scope.split('/')) {
    acc = acc ? `${acc}/${seg}` : seg;
    dirs.push(acc);
  }
  return dirs;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Глубокое слияние: объекты сливаются рекурсивно, конфликтующие листья/массивы — глубокий слой побеждает. */
export function deepMerge(base: unknown, override: unknown): unknown {
  if (isPlainObject(base) && isPlainObject(override)) {
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(override)) {
      out[k] = k in out ? deepMerge(out[k], v) : v;
    }
    return out;
  }
  return override; // скаляр / массив / несовпадение типов — побеждает глубокий слой
}

interface ParsedVar {
  name: string;
  js: unknown;
  raw: string;
}

/** Парсит файл в значения ключей верхнего уровня: js-структуру (для слияния) и сырой текст (для трейла). */
function parseForMerge(content: string): ParsedVar[] {
  const out: ParsedVar[] = [];
  try {
    for (const doc of parseAllDocuments(content)) {
      const root = doc.contents;
      if (!isMap(root)) continue;
      for (const pair of root.items) {
        const name = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
        const valueNode = pair.value as { toJSON?: () => unknown; range?: [number, number, number] } | null;
        const js = valueNode && typeof valueNode.toJSON === 'function' ? valueNode.toJSON() : null;
        const raw = valueNode?.range ? content.slice(valueNode.range[0], valueNode.range[1]) : '';
        out.push({ name, js, raw });
      }
    }
  } catch {
    /* битый YAML — пропускаем файл */
  }
  return out;
}

/** Канонический YAML значения (отсортированные ключи) для стабильного сравнения. */
function serializeValue(js: unknown): string {
  if (js === null || js === undefined) return '';
  if (typeof js !== 'object') return String(js);
  return stringify(js, { sortMapEntries: true });
}

/**
 * Сливает переменные по цепочке слоёв выбранной области с глубоким слиянием.
 * Ключ переопределения — (базовое имя файла + имя переменной верхнего уровня).
 * Берутся только файлы, лежащие НЕПОСРЕДСТВЕННО в папках-слоях.
 */
export function mergeScope(files: RepoFile[], scope: string): Map<string, MergedVar> {
  const dirs = layerDirs(scope);
  const depth = new Map(dirs.map((d, i) => [d, i] as const));

  const inScope = files
    .filter((f) => depth.has(dirOf(f.path)))
    .sort((a, b) => depth.get(dirOf(a.path))! - depth.get(dirOf(b.path))!);

  interface Acc {
    variable: string;
    file: string;
    js: unknown;
    source: string;
    overrides: OverrideEntry[];
  }
  const acc = new Map<string, Acc>();

  for (const f of inScope) {
    const base = baseOf(f.path);
    for (const v of parseForMerge(f.content)) {
      const key = `${base}|||${v.name}`;
      const cur = acc.get(key);
      if (!cur) {
        acc.set(key, { variable: v.name, file: base, js: v.js, source: f.path, overrides: [{ file: f.path, value: v.raw }] });
      } else {
        cur.js = deepMerge(cur.js, v.js);
        cur.source = f.path;
        cur.overrides.push({ file: f.path, value: v.raw });
      }
    }
  }

  const out = new Map<string, MergedVar>();
  for (const [key, c] of acc) {
    const value = serializeValue(c.js);
    out.set(key, { variable: c.variable, file: c.file, value, eol: detectEol(value), source: c.source, overrides: c.overrides });
  }
  return out;
}
