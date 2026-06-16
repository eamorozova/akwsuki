import { describe, it, expect, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { makeRepo } from './helpers/fakeRepo';
import { compareByFile } from '../src/compare/compare';
import type { RowByFile } from '../src/domain/types';

const roots: string[] = [];
afterAll(async () => {
  for (const r of roots) await fs.rm(r, { recursive: true, force: true });
});

describe('compareByFile', () => {
  it('сводит переменные по файлам со статусами (diff / equal / only_a / only_b)', async () => {
    const { root, provider } = await makeRepo({
      'main/DEV/postgres.yaml': 'postgres:\n  host: db-dev\n  port: 5432\n',
      'main/DEV/kafka.yaml': 'kafka:\n  topic: t\n',
      'main/DEV/custom/postgres.yaml': 'postgres:\n  host: c-shared\n',
      'main/DEV/onlyA.yaml': 'flagA: true\n',

      'main/IFT-DE/postgres.yaml': 'postgres:\n  host: db-ift\n  port: 5432\n',
      'main/IFT-DE/kafka.yaml': 'kafka:\n  topic: t\n',
      'main/IFT-DE/custom/postgres.yaml': 'postgres:\n  host: c-shared\n',
      'main/IFT-DE/onlyB.yaml': 'flagB: false\n',
    });
    roots.push(root);

    const res = await compareByFile(
      provider,
      'SDS',
      { branch: 'main', env: 'DEV' },
      { branch: 'main', env: 'IFT-DE' },
    );

    const find = (variable: string, file: string): RowByFile | undefined =>
      res.rows.find((r) => r.variable === variable && r.file === file);

    expect(find('postgres', 'postgres.yaml')?.status).toBe('different'); // host отличается
    expect(find('kafka', 'kafka.yaml')?.status).toBe('equal');
    expect(find('postgres', 'custom/postgres.yaml')?.status).toBe('equal'); // одинаково с обеих сторон
    expect(find('flagA', 'onlyA.yaml')?.status).toBe('only_a');
    expect(find('flagB', 'onlyB.yaml')?.status).toBe('only_b');

    expect(res.stats.total).toBe(res.rows.length);
    expect(res.stats.different).toBeGreaterThanOrEqual(1);
    expect(res.stats.onlyA).toBe(1);
    expect(res.stats.onlyB).toBe(1);
  });

  it('ловит расхождения только в пробелах и в CRLF/LF внутри значения', async () => {
    const { root, provider } = await makeRepo({
      // хвостовой пробел внутри значения (между строками вложенной структуры)
      'b/E1/ws.yaml': 'k:\n  a: 1\n  b: 2\n',
      'b/E2/ws.yaml': 'k:\n  a: 1 \n  b: 2\n',
      // CRLF vs LF — весь файл переведён в CRLF
      'b/E1/eol.yaml': 'm:\n  a: 1\n  b: 2\n',
      'b/E2/eol.yaml': 'm:\r\n  a: 1\r\n  b: 2\r\n',
    });
    roots.push(root);

    const res = await compareByFile(
      provider,
      'SDS',
      { branch: 'b', env: 'E1' },
      { branch: 'b', env: 'E2' },
    );

    expect(res.rows.find((r) => r.file === 'ws.yaml')?.status).toBe('different');
    const eolRow = res.rows.find((r) => r.file === 'eol.yaml');
    expect(eolRow?.status).toBe('different');
    expect(eolRow?.eolA).toBe('LF');
    expect(eolRow?.eolB).toBe('CRLF');
  });
});
