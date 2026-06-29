import type { FileProvider, RepoFile } from '../provider/FileProvider';
import { scanFile } from '../scan/scanner';
import { compareValues, detectEol } from '../diff/textDiff';
import { mergeScope } from './merge';
import type {
  CompareResultByFile,
  CompareResultMerged,
  CompareSide,
  CompareStats,
  FileSummary,
  RowByFile,
  RowMerged,
  RowStatus,
  ScannedVariable,
} from '../domain/types';

/** file path -> (variable name -> variable) */
type FileVarMap = Map<string, Map<string, ScannedVariable>>;

function toVarMap(files: RepoFile[]): FileVarMap {
  const map: FileVarMap = new Map();
  for (const f of files) {
    const vars = new Map<string, ScannedVariable>();
    for (const v of scanFile(f.path, f.content).variables) vars.set(v.name, v); // дубль ключа: побеждает последний
    map.set(f.path, vars);
  }
  return map;
}

/**
 * Сравнение двух сторон в режиме «по файлам»: каждая (переменная, файл) — строка.
 * Дополнительно — пофайловая сводка побайтового сравнения.
 */
export async function compareByFile(
  provider: FileProvider,
  fp: string,
  sideA: CompareSide,
  sideB: CompareSide,
): Promise<CompareResultByFile> {
  const filesA = await provider.readEnvYamlFiles(sideA.branch, sideA.env);
  const filesB = await provider.readEnvYamlFiles(sideB.branch, sideB.env);
  const a = toVarMap(filesA);
  const b = toVarMap(filesB);

  const rows: RowByFile[] = [];
  for (const file of unionSorted(a.keys(), b.keys())) {
    const va = a.get(file);
    const vb = b.get(file);
    for (const name of unionSorted(va?.keys() ?? [], vb?.keys() ?? [])) {
      const sa = va?.get(name);
      const sb = vb?.get(name);
      const valueA = sa ? sa.raw : null;
      const valueB = sb ? sb.raw : null;
      const row: RowByFile = { variable: name, file, valueA, valueB, status: compareValues(valueA, valueB) };
      if (sa) {
        row.eolA = sa.eol;
        row.lineA = sa.line;
      }
      if (sb) {
        row.eolB = sb.eol;
        row.lineB = sb.line;
      }
      rows.push(row);
    }
  }
  sortRows(rows);

  return {
    fp,
    sideA,
    sideB,
    mode: 'by_file',
    rows,
    files: fileSummaries(filesA, filesB),
    stats: computeStats(rows),
  };
}

/**
 * Сравнение в режиме «слитый»: для каждой стороны применяется цепочка
 * переопределения выбранной области, затем сравниваются эффективные значения.
 */
export async function compareMerged(
  provider: FileProvider,
  fp: string,
  sideA: CompareSide,
  sideB: CompareSide,
  scope: string,
): Promise<CompareResultMerged> {
  const a = mergeScope(await provider.readEnvYamlFiles(sideA.branch, sideA.env), scope);
  const b = mergeScope(await provider.readEnvYamlFiles(sideB.branch, sideB.env), scope);

  const rows: RowMerged[] = [];
  for (const key of unionSorted(a.keys(), b.keys())) {
    const ma = a.get(key);
    const mb = b.get(key);
    const ref = (ma ?? mb)!;
    const valueA = ma?.value ?? null;
    const valueB = mb?.value ?? null;
    const row: RowMerged = {
      variable: ref.variable,
      file: ref.file,
      valueA,
      valueB,
      sourceA: ma?.source ?? null,
      sourceB: mb?.source ?? null,
      overridesA: ma?.overrides ?? [],
      overridesB: mb?.overrides ?? [],
      status: compareValues(valueA, valueB),
    };
    if (ma) row.eolA = ma.eol;
    if (mb) row.eolB = mb.eol;
    rows.push(row);
  }
  sortRows(rows);

  return { fp, sideA, sideB, mode: 'merged', scope, rows, stats: computeStats(rows) };
}

const unifyEol = (s: string): string => s.replace(/\r\n/g, '\n');
const stripFormatting = (s: string): string =>
  unifyEol(s)
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, '')) // хвостовые пробелы/табы
    .filter((l) => l !== '') // пустые строки
    .join('\n');

/** Классифицирует, чем именно различаются два файла. */
function classifyDiff(ca: string, cb: string): 'eol' | 'whitespace' | 'content' {
  if (unifyEol(ca) === unifyEol(cb)) return 'eol'; // различие только в CRLF/LF
  if (stripFormatting(ca) === stripFormatting(cb)) return 'whitespace'; // хвостовые пробелы/пустые строки/конец файла
  return 'content'; // значения/отступы/порядок — видно в таблице переменных
}

function fileSummaries(filesA: RepoFile[], filesB: RepoFile[]): FileSummary[] {
  const ma = new Map(filesA.map((f) => [f.path, f.content] as const));
  const mb = new Map(filesB.map((f) => [f.path, f.content] as const));
  return unionSorted(ma.keys(), mb.keys()).map((path) => {
    const ca = ma.get(path) ?? null;
    const cb = mb.get(path) ?? null;
    const status = compareValues(ca, cb);
    const summary: FileSummary = {
      path,
      status,
      bytesEqual: ca !== null && cb !== null && ca === cb,
    };
    if (ca !== null) summary.eolA = detectEol(ca);
    if (cb !== null) summary.eolB = detectEol(cb);
    if (status === 'different' && ca !== null && cb !== null) summary.reason = classifyDiff(ca, cb);
    else if (status === 'only_a' || status === 'only_b') summary.reason = 'missing';
    return summary;
  });
}

function unionSorted(...iters: Iterable<string>[]): string[] {
  const set = new Set<string>();
  for (const it of iters) for (const x of it) set.add(x);
  return [...set].sort();
}

function sortRows(rows: { variable: string; file: string }[]): void {
  rows.sort((r1, r2) => r1.variable.localeCompare(r2.variable) || r1.file.localeCompare(r2.file));
}

function computeStats(rows: readonly { status: RowStatus }[]): CompareStats {
  const stats: CompareStats = { total: rows.length, equal: 0, different: 0, onlyA: 0, onlyB: 0 };
  for (const r of rows) {
    if (r.status === 'equal') stats.equal++;
    else if (r.status === 'different') stats.different++;
    else if (r.status === 'only_a') stats.onlyA++;
    else stats.onlyB++;
  }
  return stats;
}
