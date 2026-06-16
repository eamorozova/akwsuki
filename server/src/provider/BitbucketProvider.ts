import https from 'node:https';
import axios from 'axios';
import type { FileProvider, RepoFile } from './FileProvider';

/** Минимальный транспорт (совместим с экземпляром axios); подменяется в тестах. */
export interface HttpClient {
  get(url: string, config?: Record<string, unknown>): Promise<{ data: unknown }>;
}

export interface BitbucketOptions {
  baseUrl: string; // https://sbrf-bitbucket.sigma.sbrf.ru
  project: string; // CI02132621
  repo: string; // ci02132621_..._cd_config
  token: string;
  /** По умолчанию false (самоподписанные корп-сертификаты). */
  rejectUnauthorized?: boolean;
  /** Подмена транспорта для тестов. */
  http?: HttpClient;
}

interface BitbucketPage {
  values?: unknown[];
  isLastPage?: boolean;
  nextPageStart?: number;
}

const YAML_RE = /\.ya?ml$/i;
const encodePath = (p: string): string => p.split('/').map(encodeURIComponent).join('/');

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Провайдер файлов поверх Bitbucket Server REST API (`/rest/api/latest`).
 * Реализация повторяет проверенные на этом хосте пути:
 *  - ветки:          GET /branches
 *  - список файлов:  GET /files/<dir>?at=<branch>&limit=...   (рекурсивно, пути относительно <dir>)
 *  - сырой контент:  GET /raw/<path>?at=<branch>              (текст как есть, без нормализации)
 */
export class BitbucketProvider implements FileProvider {
  private readonly http: HttpClient;

  constructor(private readonly opts: BitbucketOptions) {
    this.http =
      opts.http ??
      axios.create({
        baseURL: `${opts.baseUrl}/rest/api/latest/projects/${opts.project}/repos/${opts.repo}`,
        headers: { Authorization: `Bearer ${opts.token}` },
        httpsAgent: new https.Agent({ rejectUnauthorized: opts.rejectUnauthorized ?? false }),
      });
  }

  async listBranches(): Promise<string[]> {
    const out: string[] = [];
    let start = 0;
    for (;;) {
      const page = await this.getPage('/branches', { limit: 100, start });
      for (const b of page.values ?? []) {
        const id = (b as { displayId?: string }).displayId;
        if (id) out.push(id);
      }
      if (page.isLastPage !== false || page.nextPageStart == null) break;
      start = page.nextPageStart;
    }
    return out;
  }

  async listEnvs(branch: string): Promise<string[]> {
    // окружения — папки верхнего уровня ветки; берём из полного списка файлов репозитория
    const all = await this.listFiles('', branch);
    const envs = new Set<string>();
    for (const p of all) {
      const i = p.indexOf('/');
      if (i > 0) envs.add(p.slice(0, i));
    }
    return [...envs].sort();
  }

  async readEnvYamlFiles(branch: string, env: string): Promise<RepoFile[]> {
    const rels = (await this.listFiles(env, branch)).filter((p) => YAML_RE.test(p));
    const files = await mapPool(rels, 6, async (rel) => ({
      path: rel,
      content: await this.raw(`${env}/${rel}`, branch),
    }));
    files.sort((a, b) => a.path.localeCompare(b.path));
    return files;
  }

  /** Список путей файлов под каталогом (рекурсивно), относительно него. */
  private async listFiles(dir: string, branch: string): Promise<string[]> {
    const out: string[] = [];
    const url = dir ? `/files/${encodePath(dir)}` : '/files';
    let start = 0;
    for (;;) {
      const page = await this.getPage(url, { at: branch, limit: 1000, start });
      for (const f of page.values ?? []) if (typeof f === 'string') out.push(f);
      if (page.isLastPage !== false || page.nextPageStart == null) break;
      start = page.nextPageStart;
    }
    return out;
  }

  private async getPage(url: string, params: Record<string, unknown>): Promise<BitbucketPage> {
    const { data } = await this.http.get(url, { params });
    return (data ?? {}) as BitbucketPage;
  }

  /** Сырой текст файла (без парсинга/нормализации — сохраняем пробелы и CRLF). */
  private async raw(path: string, branch: string): Promise<string> {
    const { data } = await this.http.get(`/raw/${encodePath(path)}`, {
      params: { at: branch },
      responseType: 'text',
      transformResponse: (d: unknown) => d,
    });
    return typeof data === 'string' ? data : String(data ?? '');
  }
}
