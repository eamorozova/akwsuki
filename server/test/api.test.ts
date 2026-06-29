import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/api/server';
import { LocalFsProvider } from '../src/provider/LocalFsProvider';
import type { ServerDeps } from '../src/config/appConfig';
import type { FileProvider } from '../src/provider/FileProvider';
import type { BlameRegion } from '../src/domain/types';

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
  // ветка release для проверки «дельты релизов»
  await write('SDS/release/DEV/postgres.yaml', 'postgres:\n  host: db-dev2\n'); // изменено релизом на DEV
  await write('SDS/release/IFT-DE/postgres.yaml', 'postgres:\n  host: db-ift\n'); // на IFT-DE не изменилось

  // shared_libs: параметры стендов
  const standsFile = (vault: string) =>
    `def call() {\nstandparams = [\n  [ 'STAND_ALIAS': "DEVOPS (DEV)", 'ENV_ALIAS': "DEV", 'VAULT_STORE': "${vault}" ],\n  [ 'STAND_ALIAS': "PSI", 'ENV_ALIAS': "PSI-DE", 'VAULT_STORE': "CI111" ],\n]\nreturn standparams\n}`;
  await write('SDS__shared/master/vars/get_stand_params.groovy', standsFile('Cqwe'));
  await write('SDS__shared/release/vars/get_stand_params.groovy', standsFile('Cqwe2'));

  // RSS gitops: stands/<env>/<stand>/<service>/values.yaml
  const svcValues = (host: string) => `base-service:\n  envData:\n    TARGET_HOST: ${host}\n    TARGET_PORT: 5433\n`;
  await write('RSS__gitops/master/stands/dev/dev-14/sdsrs-analytics-etl-service/values.yaml', svcValues('host-a'));
  await write('RSS__gitops/release/stands/dev/dev-14/sdsrs-analytics-etl-service/values.yaml', svcValues('host-b'));

  const deps: ServerDeps = {
    async listFps() {
      return ['SDS'];
    },
    getProvider(fp) {
      return new LocalFsProvider(path.join(root, fp));
    },
    getSharedProvider(fp) {
      return new LocalFsProvider(path.join(root, `${fp}__shared`));
    },
    standParamsPath: 'vars/get_stand_params.groovy',
    async listGitopsFps() {
      return ['RSS'];
    },
    getGitopsProvider(fp) {
      return new LocalFsProvider(path.join(root, `${fp}__gitops`));
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

  it('POST /api/compare-release-delta — изменение релиза только на одном стенде', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/compare-release-delta',
      payload: { fp: 'SDS', env1: 'DEV', env2: 'IFT-DE', branchR1: 'master', branchR2: 'release' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { rows: { variable: string; file: string; verdict: string }[] };
    const row = body.rows.find((x) => x.variable === 'postgres' && x.file === 'postgres.yaml');
    expect(row?.verdict).toBe('only_env1');
  });

  it('POST /api/compare-release-delta валидирует тело → 400', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/compare-release-delta', payload: { fp: 'SDS' } });
    expect(r.statusCode).toBe(400);
  });

  it('GET /api/blame в local-режиме → available:false', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/blame?fp=SDS&branch=master&path=DEV/postgres.yaml' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ available: false, regions: [] });
  });

  it('GET /api/blame без обязательных параметров → 400', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/blame?fp=SDS&branch=master' });
    expect(r.statusCode).toBe(400);
  });

  it('GET /api/blame отдаёт регионы провайдера (available:true)', async () => {
    const region: BlameRegion = {
      startLine: 1,
      lineCount: 2,
      author: 'Данилова Любовь Юрьевна',
      authorEmail: 'LYDanilova@sberbank.ru',
      date: '2022-02-16T12:15:46.000Z',
      commitHash: '9f96effeef05aff1e616b6e3736e8f7d2441fa21',
      commitShort: '9f96effeef0',
      commitUrl: 'https://stash/projects/P/repos/R/commits/9f96effeef05aff1e616b6e3736e8f7d2441fa21',
    };
    const stub = async () => {
      throw new Error('not used by blame route');
    };
    const fakeProvider: FileProvider = {
      listBranches: stub,
      listEnvs: stub,
      readEnvYamlFiles: stub,
      readFile: stub,
      listSubdirs: stub,
      blameFile: async (_branch, p) => (p === 'DEV/postgres.yaml' ? [region] : null),
    };
    const deps: ServerDeps = {
      async listFps() {
        return ['SDS'];
      },
      getProvider: () => fakeProvider,
      getSharedProvider: () => fakeProvider,
      standParamsPath: 'vars/get_stand_params.groovy',
      async listGitopsFps() {
        return [];
      },
      getGitopsProvider: () => fakeProvider,
    };
    const app2 = await buildServer(deps);
    const r = await app2.inject({ method: 'GET', url: '/api/blame?fp=SDS&branch=master&path=DEV/postgres.yaml' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ available: true, regions: [region] });
    await app2.close();
  });

  it('GET /api/fp/:fp/stands возвращает стенды из groovy-файла', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/fp/SDS/stands?branch=master' });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { alias: string; env: string }[];
    expect(body.map((s) => s.alias)).toEqual(['DEVOPS (DEV)', 'PSI']);
  });

  it('POST /api/compare-stands сравнивает параметры стендов', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/compare-stands',
      payload: { fp: 'SDS', branch1: 'master', stand1: 'DEVOPS (DEV)', branch2: 'release', stand2: 'DEVOPS (DEV)' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { rows: { param: string; valueA: string; valueB: string; status: string }[] };
    const vault = body.rows.find((x) => x.param === 'VAULT_STORE');
    expect(vault?.valueA).toBe('Cqwe');
    expect(vault?.valueB).toBe('Cqwe2');
    expect(vault?.status).toBe('different');
    expect(body.rows.find((x) => x.param === 'ENV_ALIAS')?.status).toBe('equal');
  });

  it('POST /api/compare-stands валидирует тело → 400', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/compare-stands', payload: { fp: 'SDS' } });
    expect(r.statusCode).toBe(400);
  });

  it('GET /api/gitops/fps и листинг окружений/стендов', async () => {
    const fps = await app.inject({ method: 'GET', url: '/api/gitops/fps' });
    expect(fps.json()).toEqual([{ name: 'RSS' }]);
    const envs = await app.inject({ method: 'GET', url: '/api/gitops/RSS/envs?branch=master' });
    expect(envs.json()).toEqual(['dev']);
    const stands = await app.inject({ method: 'GET', url: '/api/gitops/RSS/stands?branch=master&env=dev' });
    expect(stands.json()).toEqual(['dev-14']);
  });

  it('POST /api/compare-rss сравнивает листья сервисных values.yaml', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/compare-rss',
      payload: {
        fp: 'RSS',
        sideA: { branch: 'master', env: 'dev', stand: 'dev-14' },
        sideB: { branch: 'release', env: 'dev', stand: 'dev-14' },
      },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { rows: { param: string; source: string; status: string }[] };
    const th = body.rows.find((x) => x.param === 'envData.TARGET_HOST');
    expect(th?.source).toBe('sdsrs-analytics-etl-service');
    expect(th?.status).toBe('different');
    expect(body.rows.find((x) => x.param === 'envData.TARGET_PORT')?.status).toBe('equal');
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
