import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BranchQuery, FileProvider, RepoFile } from './FileProvider';
import type { BlameRegion } from '../domain/types';

const YAML_RE = /\.ya?ml$/i;

/**
 * Реализация FileProvider поверх локальной ФС.
 *
 * Раскладка: `<root>/<branch>/<env>/...`. Используется для офлайн-разработки и
 * тестов (фикстуры), пока недоступен реальный git-слой.
 */
export class LocalFsProvider implements FileProvider {
  constructor(private readonly root: string) {}

  async listBranches(query?: BranchQuery): Promise<string[]> {
    let dirs = await this.listDirs(this.root);
    if (query?.filterText) {
      const q = query.filterText.toLowerCase();
      dirs = dirs.filter((d) => d.toLowerCase().includes(q));
    }
    return query?.limit ? dirs.slice(0, query.limit) : dirs;
  }

  async listEnvs(branch: string): Promise<string[]> {
    return this.listDirs(path.join(this.root, branch));
  }

  async readFile(branch: string, filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(path.join(this.root, branch, ...filePath.split('/')), 'utf8');
    } catch {
      return null;
    }
  }

  async listSubdirs(branch: string, dirPath: string): Promise<string[]> {
    return this.listDirs(path.join(this.root, branch, ...dirPath.split('/')));
  }

  /** Локальные фикстуры — не git-репозиторий, blame недоступен. */
  async blameFile(): Promise<BlameRegion[] | null> {
    return null;
  }

  async readEnvYamlFiles(branch: string, env: string): Promise<RepoFile[]> {
    const base = path.join(this.root, branch, env);
    const out: RepoFile[] = [];
    await this.walk(base, base, out);
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }

  private async listDirs(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    } catch {
      return [];
    }
  }

  private async walk(base: string, dir: string, out: RepoFile[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await this.walk(base, full, out);
      } else if (e.isFile() && YAML_RE.test(e.name)) {
        const content = await fs.readFile(full, 'utf8'); // сохраняет CRLF как есть
        const rel = path.relative(base, full).split(path.sep).join('/');
        out.push({ path: rel, content });
      }
    }
  }
}
