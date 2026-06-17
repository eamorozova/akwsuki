import { describe, it, expect, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { makeRepo } from './helpers/fakeRepo';
import { mergeScope } from '../src/compare/merge';
import { compareMerged, compareByFile } from '../src/compare/compare';

const roots: string[] = [];
afterAll(async () => {
  for (const r of roots) await fs.rm(r, { recursive: true, force: true });
});

describe('mergeScope — каскад переопределения', () => {
  it('глубокий слой перекрывает; соседние сервисы и чужие папки не попадают', async () => {
    const { root, provider } = await makeRepo({
      'main/DEV/postgres.yaml': 'postgres:\n  host: base\n',
      'main/DEV/kafka.yaml': 'kafka:\n  b: 1\n',
      'main/DEV/custom/postgres.yaml': 'postgres:\n  host: custom\n',
      'main/DEV/custom/sds-api/postgres.yaml': 'postgres:\n  host: api\n',
      'main/DEV/custom/sds-auth/postgres.yaml': 'postgres:\n  host: auth\n',
      'main/DEV/hadoop/hdfs.yaml': 'hdfs:\n  nn: x\n',
    });
    roots.push(root);
    const files = await provider.readEnvYamlFiles('main', 'DEV');

    // scope '' — только корень
    const r0 = mergeScope(files, '');
    expect(r0.get('postgres.yaml|||postgres')?.value.trim()).toBe('host: base');
    expect(r0.has('kafka.yaml|||kafka')).toBe(true);
    expect(r0.has('hdfs.yaml|||hdfs')).toBe(false);

    // scope custom/sds-api — корень + custom + custom/sds-api
    const api = mergeScope(files, 'custom/sds-api');
    const pg = api.get('postgres.yaml|||postgres');
    expect(pg?.value.trim()).toBe('host: api'); // победил самый глубокий
    expect(pg?.source).toBe('custom/sds-api/postgres.yaml');
    expect(pg?.overrides.map((o) => o.file)).toEqual([
      'postgres.yaml',
      'custom/postgres.yaml',
      'custom/sds-api/postgres.yaml',
    ]);
    expect(api.get('kafka.yaml|||kafka')?.source).toBe('kafka.yaml'); // база остаётся
    expect([...api.values()].some((v) => v.source.includes('sds-auth'))).toBe(false); // соседний сервис исключён
    expect(api.has('hdfs.yaml|||hdfs')).toBe(false); // hadoop вне области

    // scope hadoop — корень + hadoop (своя переменная + база)
    const hadoop = mergeScope(files, 'hadoop');
    expect(hadoop.get('hdfs.yaml|||hdfs')?.value.trim()).toBe('nn: x');
    expect(hadoop.get('postgres.yaml|||postgres')?.value.trim()).toBe('host: base');
  });

  it('глубокое слияние: вложенные ключи объединяются, конфликтующие — перекрываются', async () => {
    const { root, provider } = await makeRepo({
      'main/DEV/postgres.yaml': 'postgres:\n  host: base\n  port: 5432\n',
      'main/DEV/custom/postgres.yaml': 'postgres:\n  host: custom\n  pool_size: 10\n',
    });
    roots.push(root);
    const files = await provider.readEnvYamlFiles('main', 'DEV');
    const pg = mergeScope(files, 'custom').get('postgres.yaml|||postgres');
    // host перекрыт (custom), port сохранён (base), pool_size добавлен (custom); ключи отсортированы
    expect(pg?.value).toBe('host: custom\npool_size: 10\nport: 5432\n');
    expect(pg?.overrides.map((o) => o.file)).toEqual(['postgres.yaml', 'custom/postgres.yaml']);
  });
});

describe('compareMerged', () => {
  it('сравнивает эффективные значения после слияния', async () => {
    const { root, provider } = await makeRepo({
      'main/DEV/postgres.yaml': 'postgres:\n  host: base\n',
      'main/DEV/custom/sds-api/postgres.yaml': 'postgres:\n  host: dev-api\n',
      'main/IFT/postgres.yaml': 'postgres:\n  host: base\n',
      'main/IFT/custom/sds-api/postgres.yaml': 'postgres:\n  host: ift-api\n',
    });
    roots.push(root);
    const res = await compareMerged(
      provider,
      'SDS',
      { branch: 'main', env: 'DEV' },
      { branch: 'main', env: 'IFT' },
      'custom/sds-api',
    );
    const row = res.rows.find((r) => r.variable === 'postgres');
    expect(row?.status).toBe('different');
    expect(row?.sourceA).toBe('custom/sds-api/postgres.yaml');
    expect(row?.valueA?.trim()).toBe('host: dev-api');
    expect(row?.valueB?.trim()).toBe('host: ift-api');
  });
});

describe('пофайловая сводка — закрывает EOL-нюанс', () => {
  it('ловит CRLF/LF после однострочного скаляра на уровне файла', async () => {
    const { root, provider } = await makeRepo({
      'main/E1/a.yaml': 'port: 5432\n',
      'main/E2/a.yaml': 'port: 5432\r\n', // отличается только перевод строки после скаляра
    });
    roots.push(root);
    const res = await compareByFile(provider, 'SDS', { branch: 'main', env: 'E1' }, { branch: 'main', env: 'E2' });

    // на уровне переменной значение скаляра '5432' одинаково
    expect(res.rows.find((r) => r.variable === 'port')?.status).toBe('equal');
    // на уровне файла — отличие по байтам (LF vs CRLF)
    const fsum = res.files.find((f) => f.path === 'a.yaml');
    expect(fsum?.status).toBe('different');
    expect(fsum?.bytesEqual).toBe(false);
    expect(fsum?.reason).toBe('eol');
    expect(fsum?.eolA).toBe('LF');
    expect(fsum?.eolB).toBe('CRLF');
  });
});
