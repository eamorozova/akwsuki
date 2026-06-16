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
  status: RowStatus;
}

export interface CompareStats {
  total: number;
  equal: number;
  different: number;
  onlyA: number;
  onlyB: number;
}

/** Пофайловая сводка: сравнение сырого содержимого файла целиком (байт-в-байт). */
export interface FileSummary {
  /** Относительный путь внутри окружения. */
  path: string;
  status: RowStatus;
  /** true, если файлы есть с обеих сторон и их содержимое идентично. */
  bytesEqual: boolean;
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
