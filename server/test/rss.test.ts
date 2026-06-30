import { describe, it, expect, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { makeRepo } from './helpers/fakeRepo';
import { compareRss, flattenServiceValues, listRssEnvs, listRssStands } from '../src/rss/compareRss';

const roots: string[] = [];
afterAll(async () => {
  for (const r of roots) await fs.rm(r, { recursive: true, force: true });
});

describe('flattenServiceValues', () => {
  it('разворачивает листья и срезает префикс base-service', () => {
    const yaml = `base-service:
  registryRepo: docker-dev
  envData:
    TARGET_HOST: host-a
    TARGET_PORT: 5433
    SOURCES:
      SDSDE:
        HOST: 10.141.127.141
        SSL_ON: true
  resources:
    limits:
      cpu: 500m
`;
    const leaves = flattenServiceValues(yaml);
    const m = new Map(leaves.map((l) => [l.param, l.value]));
    expect(m.get('registryRepo')).toBe('docker-dev');
    expect(m.get('envData.TARGET_HOST')).toBe('host-a');
    expect(m.get('envData.SOURCES.SDSDE.HOST')).toBe('10.141.127.141');
    expect(m.get('envData.SOURCES.SDSDE.SSL_ON')).toBe('true');
    expect(m.get('resources.limits.cpu')).toBe('500m');

    // строки листьев в values.yaml (для blame): base-service=стр.1, registryRepo=стр.2, …
    const byParam = new Map(leaves.map((l) => [l.param, l.line]));
    expect(byParam.get('registryRepo')).toBe(2);
    expect(byParam.get('envData.TARGET_HOST')).toBe(4);
    expect(byParam.get('envData.SOURCES.SDSDE.HOST')).toBe(8);
  });
});

describe('compareRss', () => {
  it('сравнивает листья сервисных values.yaml; helmfile и stand-values игнорируются', async () => {
    const svc = (host: string) =>
      `base-service:\n  envData:\n    TARGET_HOST: ${host}\n    TARGET_PORT: 5433\n  resources:\n    limits:\n      cpu: 500m\n`;
    const { root, provider } = await makeRepo({
      'master/stands/dev/dev-14/sdsrs-analytics-etl-service/values.yaml': svc('host-a'),
      'master/stands/dev/dev-14/sdsrs-frontend-service/values.yaml': 'base-service:\n  envData:\n    LOG_LEVEL: info\n',
      'master/stands/dev/dev-14/helmfile.yaml': 'should: be-ignored\n',
      'master/stands/dev/dev-14/values.yaml': 'standLevel: ignored\n',
      'rel/stands/dev/dev-14/sdsrs-analytics-etl-service/values.yaml': svc('host-b'),
      'rel/stands/dev/dev-14/sdsrs-frontend-service/values.yaml': 'base-service:\n  envData:\n    LOG_LEVEL: info\n',
    });
    roots.push(root);

    const res = await compareRss(
      provider,
      'RSS',
      { branch: 'master', env: 'dev', stand: 'dev-14' },
      { branch: 'rel', env: 'dev', stand: 'dev-14' },
    );

    const th = res.rows.find((r) => r.param === 'envData.TARGET_HOST');
    expect(th?.source).toBe('sdsrs-analytics-etl-service');
    expect(th?.valueA).toBe('host-a');
    expect(th?.valueB).toBe('host-b');
    expect(th?.status).toBe('different');

    expect(res.rows.find((r) => r.param === 'envData.TARGET_PORT')?.status).toBe('equal');
    expect(res.rows.find((r) => r.param === 'envData.LOG_LEVEL')?.status).toBe('equal');
    // helmfile / stand-level values не попадают
    expect(res.rows.some((r) => r.param === 'should' || r.param === 'standLevel')).toBe(false);
  });

  it('листинг окружений и стендов', async () => {
    const { root, provider } = await makeRepo({
      'master/stands/dev/dev-14/svc/values.yaml': 'base-service:\n  envData:\n    A: 1\n',
      'master/stands/ift/ift-2/svc/values.yaml': 'base-service:\n  envData:\n    A: 1\n',
    });
    roots.push(root);
    expect(await listRssEnvs(provider, 'master')).toEqual(['dev', 'ift']);
    expect(await listRssStands(provider, 'master', 'dev')).toEqual(['dev-14']);
  });
});
