import type { FileProvider } from '../provider/FileProvider';
import { parseStandParams } from './parseStandParams';
import { compareValues } from '../diff/textDiff';
import type { CompareStandsResult, CompareStats, StandInfo, StandParamRow } from '../domain/types';

/** Список стендов из файла параметров на ветке. */
export async function listStands(
  provider: FileProvider,
  branch: string,
  filePath: string,
): Promise<StandInfo[]> {
  const content = await provider.readFile(branch, filePath);
  if (!content) return [];
  return parseStandParams(content).map((s) => ({ alias: s.alias, env: s.env }));
}

/** Сравнение параметров двух стендов (на произвольных ветках); параметр — отдельная строка. */
export async function compareStands(
  provider: FileProvider,
  fp: string,
  branch1: string,
  stand1: string,
  branch2: string,
  stand2: string,
  filePath: string,
): Promise<CompareStandsResult> {
  const [c1, c2] = await Promise.all([
    provider.readFile(branch1, filePath),
    provider.readFile(branch2, filePath),
  ]);
  const s1 = c1 ? parseStandParams(c1).find((s) => s.alias === stand1) : undefined;
  const s2 = c2 ? parseStandParams(c2).find((s) => s.alias === stand2) : undefined;
  const p1 = s1?.params ?? {};
  const p2 = s2?.params ?? {};
  const l1 = s1?.paramLines ?? {};
  const l2 = s2?.paramLines ?? {};

  const keys = [...new Set([...Object.keys(p1), ...Object.keys(p2)])].sort();
  const rows: StandParamRow[] = keys.map((param) => {
    const valueA = param in p1 ? p1[param]! : null;
    const valueB = param in p2 ? p2[param]! : null;
    const row: StandParamRow = { param, valueA, valueB, status: compareValues(valueA, valueB) };
    if (param in l1) row.lineA = l1[param];
    if (param in l2) row.lineB = l2[param];
    return row;
  });

  return { fp, branch1, stand1, branch2, stand2, paramsPath: filePath, rows, stats: computeStats(rows) };
}

function computeStats(rows: readonly StandParamRow[]): CompareStats {
  const stats: CompareStats = { total: rows.length, equal: 0, different: 0, onlyA: 0, onlyB: 0 };
  for (const r of rows) {
    if (r.status === 'equal') stats.equal++;
    else if (r.status === 'different') stats.different++;
    else if (r.status === 'only_a') stats.onlyA++;
    else stats.onlyB++;
  }
  return stats;
}
