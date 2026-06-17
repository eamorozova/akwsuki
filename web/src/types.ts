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

export type DiffReason = 'eol' | 'whitespace' | 'content' | 'missing';

export interface FileSummary {
  path: string;
  status: RowStatus;
  bytesEqual: boolean;
  reason?: DiffReason;
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

export type ReleaseVerdict = 'both_unchanged' | 'same_change' | 'only_env1' | 'only_env2' | 'divergent';

export interface RowReleaseDelta {
  variable: string;
  file: string;
  env1R1: string | null;
  env1R2: string | null;
  statusEnv1: RowStatus;
  env2R1: string | null;
  env2R2: string | null;
  statusEnv2: RowStatus;
  verdict: ReleaseVerdict;
  expectedEnvDiff: boolean;
}

export interface ReleaseDeltaStats {
  total: number;
  bothUnchanged: number;
  sameChange: number;
  onlyEnv1: number;
  onlyEnv2: number;
  divergent: number;
}

export interface CompareReleaseDeltaResult {
  fp: string;
  env1: string;
  env2: string;
  branchR1: string;
  branchR2: string;
  rows: RowReleaseDelta[];
  stats: ReleaseDeltaStats;
}

export interface StandInfo {
  alias: string;
  env: string;
}

export interface StandParamRow {
  param: string;
  valueA: string | null;
  valueB: string | null;
  status: RowStatus;
}

export interface CompareStandsResult {
  fp: string;
  branch1: string;
  stand1: string;
  branch2: string;
  stand2: string;
  rows: StandParamRow[];
  stats: CompareStats;
}
