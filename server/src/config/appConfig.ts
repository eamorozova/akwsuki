import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FileProvider } from '../provider/FileProvider';
import { LocalFsProvider } from '../provider/LocalFsProvider';

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(here, '../..'); // server/src/config -> server

/**
 * Зависимости сервера: откуда брать список ФП и провайдера файлов для каждого.
 * API зависит только от этого интерфейса — источник данных (фикстуры/git/REST)
 * подменяется без изменения роутов.
 */
export interface ServerDeps {
  listFps(): Promise<string[]>;
  getProvider(fp: string): FileProvider;
}

/**
 * Локальный режим: каждый ФП — подпапка демо-данных
 * (`<demoDir>/<fp>/<branch>/<env>/...`). Используется, пока недоступен боевой git.
 */
export function buildLocalDeps(): ServerDeps {
  const demoDir = process.env.DEMO_DATA_DIR
    ? path.resolve(process.env.DEMO_DATA_DIR)
    : path.join(SERVER_ROOT, 'demo-data');

  return {
    async listFps() {
      try {
        const entries = await fs.readdir(demoDir, { withFileTypes: true });
        return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
      } catch {
        return [];
      }
    },
    getProvider(fp: string) {
      return new LocalFsProvider(path.join(demoDir, fp));
    },
  };
}
