/** Файл конфига, прочитанный из репозитория. */
export interface RepoFile {
  /** Относительный путь внутри папки-окружения (POSIX-разделители). */
  path: string;
  /** Содержимое как есть (utf-8), переводы строк НЕ нормализуются. */
  content: string;
}

/** Параметры выборки веток (для поиска по большому списку). */
export interface BranchQuery {
  /** Подстрока для серверного поиска по имени ветки. */
  filterText?: string;
  /** Ограничение количества (новейшие первыми). */
  limit?: number;
}

/**
 * Абстракция доступа к файлам репозитория ФП.
 *
 * Ядро (scan/diff/compare) зависит только от этого интерфейса, поэтому способ
 * доставки файлов (git-зеркало, API хостинга, локальная ФС) подменяется без
 * изменения логики сравнения.
 */
export interface FileProvider {
  /** Список веток репозитория (новейшие первыми; с опциональным поиском). */
  listBranches(query?: BranchQuery): Promise<string[]>;
  /** Список окружений (папок верхнего уровня) в данной ветке. */
  listEnvs(branch: string): Promise<string[]>;
  /** Все *.yaml/*.yml внутри папки-окружения, рекурсивно. */
  readEnvYamlFiles(branch: string, env: string): Promise<RepoFile[]>;
  /** Содержимое одного файла по пути на ветке; null, если файла нет. */
  readFile(branch: string, filePath: string): Promise<string | null>;
}
