import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/api/server';
import { LocalFsProvider } from '../src/provider/LocalFsProvider';
import type { ServerDeps } from '../src/config/appConfig';

let root: string;
let app: FastifyInstance;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'sledilo-api-'));
  const write = async (rel: string, content: string) => {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  };
  await write('SDS/master/DEV/postgres.yaml', 'postgres:\n  host: db-dev\n');
  await write('SDS/master/IFT-DE/postgres.yaml', 'postgres:\n  host: db-ift\n');
  await write('SDS/master/DEV/custom/sds-api/postgres.yaml', 'postgres:\n  host: dev-api\n');
  await write('SDS/master/IFT-DE/custom/sds-api/postgres.yaml', 'postgres:\n  host: ift-api\n');

  const deps: ServerDeps = {
    async listFps() {
      return ['SDS'];
    },
    getProvider(fp) {
      return new LocalFsProvider(path.join(root, fp));
    },
  };
  app = await buildServer(deps);
});

afterAll(async () => {
  await app.close();
  await fs.rm(root, { recursive: true, force: true });
});

describe('API', () => {
  it('GET /api/fp', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/fp' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([{ name: 'SDS' }]);
  });

  it('GET branches и envs', async () => {
    const b = await app.inject({ method: 'GET', url: '/api/fp/SDS/branches' });
    expect(b.json()).toContain('master');

    const e = await app.inject({ method: 'GET', url: '/api/fp/SDS/envs?branch=master' });
    expect((e.json() as string[]).sort()).toEqual(['DEV', 'IFT-DE']);
  });

  it('GET /api/fp/:fp/envs без branch → 400', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/fp/SDS/envs' });
    expect(r.statusCode).toBe(400);
  });

  it('POST /api/compare возвращает таблицу со статусами', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/compare',
      payload: { fp: 'SDS', sideA: { branch: 'master', env: 'DEV' }, sideB: { branch: 'master', env: 'IFT-DE' } },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { rows: { variable: string; status: string }[] };
    expect(body.rows.find((x) => x.variable === 'postgres')?.status).toBe('different');
  });

  it('POST /api/compare валидирует тело → 400', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/compare', payload: { fp: 'SDS' } });
    expect(r.statusCode).toBe(400);
  });

  it('GET /api/fp/:fp/scopes', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/fp/SDS/scopes?branch=master&env=DEV' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual(['', 'custom/sds-api']);
  });

  it('POST /api/compare mode=merged применяет цепочку переопределения', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/compare',
      payload: {
        fp: 'SDS',
        mode: 'merged',
        scope: 'custom/sds-api',
        sideA: { branch: 'master', env: 'DEV' },
        sideB: { branch: 'master', env: 'IFT-DE' },
      },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as {
      mode: string;
      rows: { variable: string; status: string; sourceA: string }[];
    };
    expect(body.mode).toBe('merged');
    const row = body.rows.find((x) => x.variable === 'postgres');
    expect(row?.sourceA).toBe('custom/sds-api/postgres.yaml');
    expect(row?.status).toBe('different');
  });
});
