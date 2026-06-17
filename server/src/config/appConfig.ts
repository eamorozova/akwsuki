import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FileProvider } from '../provider/FileProvider';
import { LocalFsProvider } from '../provider/LocalFsProvider';
import { BitbucketProvider } from '../provider/BitbucketProvider';

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(here, '../..'); // server/src/config -> server
const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');

/**
 * Зависимости сервера: откуда брать список ФП и провайдера файлов для каждого.
 * API зависит только от этого интерфейса — источник данных (фикстуры/REST)
 * подменяется без изменения роутов.
 */
export interface ServerDeps {
  listFps(): Promise<string[]>;
  getProvider(fp: string): FileProvider;
  /** Провайдер репозитория shared_libs (для параметров стендов). */
  getSharedProvider(fp: string): FileProvider;
  /** Путь к файлу параметров стендов внутри shared_libs репо. */
  standParamsPath: string;
}

const DEFAULT_STAND_PARAMS_PATH = process.env.STAND_PARAMS_PATH ?? 'vars/get_stand_params.groovy';

/** Выбор источника данных по `DATA_MODE` (`local` | `bitbucket`), по умолчанию `local`. */
export function buildDeps(): ServerDeps {
  return (process.env.DATA_MODE ?? 'local') === 'bitbucket' ? buildBitbucketDeps() : buildLocalDeps();
}

/**
 * Локальный режим: каждый ФП — подпапка демо-данных
 * (`<demoDir>/<fp>/<branch>/<env>/...`).
 */
export function buildLocalDeps(): ServerDeps {
  const demoDir = process.env.DEMO_DATA_DIR
    ? path.resolve(process.env.DEMO_DATA_DIR)
    : path.join(SERVER_ROOT, 'demo-data');

  return {
    async listFps() {
      try {
        const entries = await fs.readdir(demoDir, { withFileTypes: true });
        return entries
          .filter((e) => e.isDirectory() && !e.name.endsWith('__shared'))
          .map((e) => e.name)
          .sort();
      } catch {
        return [];
      }
    },
    getProvider(fp: string) {
      return new LocalFsProvider(path.join(demoDir, fp));
    },
    getSharedProvider(fp: string) {
      return new LocalFsProvider(path.join(demoDir, `${fp}__shared`));
    },
    standParamsPath: DEFAULT_STAND_PARAMS_PATH,
  };
}

interface FpConfig {
  bitbucketUrl: string;
  project: string;
  standParamsPath?: string;
  fps: { name: string; repo: string; sharedLibsRepo?: string }[];
}

function loadFpConfig(): FpConfig {
  const p = process.env.FP_CONFIG ? path.resolve(process.env.FP_CONFIG) : path.join(PROJECT_ROOT, 'fp-config.json');
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as FpConfig;
  } catch (e) {
    throw new Error(`не удалось прочитать fp-config (${p}): ${(e as Error).message}. Скопируйте fp-config.example.json в fp-config.json`);
  }
}

/**
 * Боевой режим: Bitbucket Server REST. Слаги репозиториев — из `fp-config.json`,
 * токен — из env `BITBUCKET_TOKEN` (TLS-проверка off по умолчанию, вкл. `BITBUCKET_TLS_REJECT=1`).
 */
export function buildBitbucketDeps(): ServerDeps {
  const cfg = loadFpConfig();
  const token = process.env.BITBUCKET_TOKEN ?? '';
  const rejectUnauthorized = process.env.BITBUCKET_TLS_REJECT === '1';
  const repos = new Map(cfg.fps.map((f) => [f.name, f.repo] as const));
  const sharedRepos = new Map(cfg.fps.map((f) => [f.name, f.sharedLibsRepo] as const));
  const mkProvider = (repo: string) =>
    new BitbucketProvider({ baseUrl: cfg.bitbucketUrl, project: cfg.project, repo, token, rejectUnauthorized });

  return {
    async listFps() {
      return cfg.fps.map((f) => f.name);
    },
    getProvider(fp: string) {
      const repo = repos.get(fp);
      if (!repo) throw new Error(`unknown fp: ${fp}`);
      return mkProvider(repo);
    },
    getSharedProvider(fp: string) {
      const repo = sharedRepos.get(fp);
      if (!repo) throw new Error(`no sharedLibsRepo configured for fp: ${fp}`);
      return mkProvider(repo);
    },
    standParamsPath: cfg.standParamsPath ?? DEFAULT_STAND_PARAMS_PATH,
  };
}
