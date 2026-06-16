import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalFsProvider } from '../../src/provider/LocalFsProvider';

/**
 * Создаёт во временной папке дерево файлов из карты {относительный путь: содержимое}
 * и возвращает LocalFsProvider поверх него. Содержимое пишется как есть — это
 * позволяет задавать точные пробелы и CRLF/LF в тестах.
 */
export async function makeRepo(
  tree: Record<string, string>,
): Promise<{ root: string; provider: LocalFsProvider }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sledilo-fix-'));
  for (const [rel, content] of Object.entries(tree)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  return { root, provider: new LocalFsProvider(root) };
}
