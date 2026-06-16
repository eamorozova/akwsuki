export type RowStatus = 'equal' | 'different' | 'only_a' | 'only_b';
export type EolKind = 'LF' | 'CRLF' | 'mixed' | 'none';
export type CompareMode = 'by_file' | 'merged';

export interface RowByFile {
  variable: string;
  file: string;
  valueA: string | null;
  valueB: string | null;
  eolA?: EolKind;
  eolB?: EolKind;
  status: RowStatus;
}

export interface OverrideEntry {
  file: string;
  value: string;
}

export interface RowMerged {
  variable: string;
  file: string;
  valueA: string | null;
  valueB: string | null;
  sourceA: string | null;
  sourceB: string | null;
  overridesA: OverrideEntry[];
  overridesB: OverrideEntry[];
  eolA?: EolKind;
  eolB?: EolKind;
  status: RowStatus;
}

export interface FileSummary {
  path: string;
  status: RowStatus;
  bytesEqual: boolean;
  eolA?: EolKind;
  eolB?: EolKind;
}

export interface CompareStats {
  total: number;
  equal: number;
  different: number;
  onlyA: number;
  onlyB: number;
}

export interface CompareSide {
  branch: string;
  env: string;
}

export interface CompareResultByFile {
  fp: string;
  sideA: CompareSide;
  sideB: CompareSide;
  mode: 'by_file';
  rows: RowByFile[];
  files: FileSummary[];
  stats: CompareStats;
}

export interface CompareResultMerged {
  fp: string;
  sideA: CompareSide;
  sideB: CompareSide;
  mode: 'merged';
  scope: string;
  rows: RowMerged[];
  stats: CompareStats;
}

export type CompareResult = CompareResultByFile | CompareResultMerged;
