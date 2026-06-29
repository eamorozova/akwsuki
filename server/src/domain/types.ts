/** Тип перевода строки внутри значения переменной. */
export type EolKind = 'LF' | 'CRLF' | 'mixed' | 'none';

/** Статус строки сравнения. */
export type RowStatus = 'equal' | 'different' | 'only_a' | 'only_b';

/** Одна переменная (ключ верхнего уровня) с её сырым значением. */
export interface ScannedVariable {
  /** Имя ключа верхнего уровня. */
  name: string;
  /** Сырой текстовый фрагмент значения как есть в файле (без нормализации). */
  raw: string;
  /** Тип перевода строки внутри значения. */
  eol: EolKind;
  /** 1-based номер строки ключа в файле (для привязки blame). */
  line: number;
}

/**
 * Регион blame: непрерывный блок строк файла с одним «последним» коммитом.
 * Соответствует одному элементу ответа Bitbucket `browse?blame`.
 */
export interface BlameRegion {
  /** 1-based номер первой строки региона. */
  startLine: number;
  /** Сколько строк покрывает регион (Bitbucket `spannedLines`). */
  lineCount: number;
  /** Человекочитаемый автор (displayName, иначе логин). */
  author: string;
  /** E-mail автора, если есть. */
  authorEmail: string | null;
  /** Дата авторства в ISO-8601. */
  date: string;
  /** Полный хэш коммита. */
  commitHash: string;
  /** Короткий хэш коммита (для отображения). */
  commitShort: string;
  /** Готовая ссылка на коммит в Bitbucket. */
  commitUrl: string;
}

/** Результат сканирования одного файла. */
export interface ScannedFile {
  /** Относительный путь внутри папки-окружения (POSIX-разделители). */
  path: string;
  variables: ScannedVariable[];
  /** Сообщение об ошибке парсинга, если файл не разобрался. */
  error?: string;
}

/** Сторона сравнения. */
export interface CompareSide {
  branch: string;
  env: string;
}

/** Строка таблицы в режиме «по файлам». */
export interface RowByFile {
  variable: string;
  file: string;
  valueA: string | null;
  valueB: string | null;
  eolA?: EolKind;
  eolB?: EolKind;
  /** Строка ключа в файле стороны A / B (для blame); undefined, если переменной нет. */
  lineA?: number;
  lineB?: number;
  status: RowStatus;
}

export interface CompareStats {
  total: number;
  equal: number;
  different: number;
  onlyA: number;
  onlyB: number;
}

/** Причина побайтового различия файла. */
export type DiffReason = 'eol' | 'whitespace' | 'content' | 'missing';

/** Пофайловая сводка: сравнение сырого содержимого файла целиком (байт-в-байт). */
export interface FileSummary {
  /** Относительный путь внутри окружения. */
  path: string;
  status: RowStatus;
  /** true, если файлы есть с обеих сторон и их содержимое идентично. */
  bytesEqual: boolean;
  /** Чем именно различаются файлы (для понятного пояснения в UI). */
  reason?: DiffReason;
  eolA?: EolKind;
  eolB?: EolKind;
}

/** Результат сравнения в режиме «по файлам». */
export interface CompareResultByFile {
  fp: string;
  sideA: CompareSide;
  sideB: CompareSide;
  mode: 'by_file';
  scope?: string;
  rows: RowByFile[];
  /** Пофайловая сводка (ловит отличия пробелов/EOL вне значений переменных). */
  files: FileSummary[];
  stats: CompareStats;
}

/** Вхождение переменной в одном из слоёв (для трейла переопределений). */
export interface OverrideEntry {
  file: string;
  value: string;
}

/** Строка таблицы в режиме «слитый» (после применения цепочки переопределения). */
export interface RowMerged {
  variable: string;
  /** Базовое имя файла-«юнита» конфига (напр. postgres.yaml). */
  file: string;
  valueA: string | null;
  valueB: string | null;
  /** Файл-победитель цепочки (где взято эффективное значение). */
  sourceA: string | null;
  sourceB: string | null;
  /** Трейл переопределений от базового слоя к глубокому. */
  overridesA: OverrideEntry[];
  overridesB: OverrideEntry[];
  eolA?: EolKind;
  eolB?: EolKind;
  status: RowStatus;
}

/** Результат сравнения в режиме «слитый». */
export interface CompareResultMerged {
  fp: string;
  sideA: CompareSide;
  sideB: CompareSide;
  mode: 'merged';
  scope: string;
  rows: RowMerged[];
  stats: CompareStats;
}

/**
 * Вердикт «дельты релизов»: как соотносятся изменения релиз1→релиз2 на двух стендах.
 */
export type ReleaseVerdict =
  | 'both_unchanged' // релиз не трогал переменную ни на одном стенде
  | 'same_change' // изменена одинаково (совпали и до, и после)
  | 'only_env1' // изменена только на стенде 1
  | 'only_env2' // изменена только на стенде 2
  | 'divergent'; // изменена на обоих, но по-разному

/** Строка сравнения «дельты релизов» (сравнение второго порядка). */
export interface RowReleaseDelta {
  variable: string;
  file: string;
  /** Стенд 1: значение на релиз1 / релиз2 и статус изменения релизом. */
  env1R1: string | null;
  env1R2: string | null;
  statusEnv1: RowStatus;
  /** Стенд 2: значение на релиз1 / релиз2 и статус изменения релизом. */
  env2R1: string | null;
  env2R2: string | null;
  statusEnv2: RowStatus;
  verdict: ReleaseVerdict;
  /** Значения различались между стендами уже на релиз1 (вероятно, специфика окружения). */
  expectedEnvDiff: boolean;
  /** Строки ключа в каждом из четырёх файлов (для blame); undefined, если значения нет. */
  lineEnv1R1?: number;
  lineEnv1R2?: number;
  lineEnv2R1?: number;
  lineEnv2R2?: number;
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

/** Краткое описание стенда из get_stand_params.groovy. */
export interface StandInfo {
  alias: string;
  env: string;
}

/** Строка сравнения параметров стендов (параметр — отдельная строка). */
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

/** RSS (gitops): сторона = ветка(релиз) + окружение + стенд. */
export interface RssSide {
  branch: string;
  env: string;
  stand: string;
}

/** Строка сравнения RSS: лист values.yaml сервиса. */
export interface RssRow {
  param: string; // путь листа без префикса base-service (напр. envData.TARGET_HOST)
  source: string; // сервис (папка), где параметр найден
  valueA: string | null;
  valueB: string | null;
  status: RowStatus;
}

export interface CompareRssResult {
  fp: string;
  sideA: RssSide;
  sideB: RssSide;
  rows: RssRow[];
  stats: CompareStats;
}
