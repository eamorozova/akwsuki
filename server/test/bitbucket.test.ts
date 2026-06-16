import { describe, it, expect } from 'vitest';
import { BitbucketProvider, type HttpClient } from '../src/provider/BitbucketProvider';

interface Call {
  url: string;
  params: Record<string, unknown>;
}

function fakeHttp(): { calls: Call[]; client: HttpClient } {
  const calls: Call[] = [];
  const client: HttpClient = {
    async get(url, config) {
      const params = (config?.params ?? {}) as Record<string, unknown>;
      calls.push({ url, params });
      if (url === '/branches') {
        return { data: { values: [{ displayId: 'master' }, { displayId: 'release/1.0' }], isLastPage: true } };
      }
      if (url === '/files') {
        return { data: { values: ['DEV/postgres.yaml', 'DEV/custom/x.yaml', 'IFT-DE/p.yaml', 'README.md'], isLastPage: true } };
      }
      if (url === '/files/DEV') {
        return { data: { values: ['postgres.yaml', 'custom/sds-api/postgres.yaml', 'notes.txt'], isLastPage: true } };
      }
      if (url.startsWith('/raw/')) {
        return { data: `from:${url} at:${params.at}` };
      }
      throw new Error('unexpected ' + url);
    },
  };
  return { calls, client };
}

const make = (http: HttpClient) =>
  new BitbucketProvider({ baseUrl: 'x', project: 'P', repo: 'R', token: 'T', http });

describe('BitbucketProvider', () => {
  it('listBranches → displayId', async () => {
    expect(await make(fakeHttp().client).listBranches()).toEqual(['master', 'release/1.0']);
  });

  it('listEnvs → папки верхнего уровня (файлы без папки пропускаются)', async () => {
    expect(await make(fakeHttp().client).listEnvs('master')).toEqual(['DEV', 'IFT-DE']);
  });

  it('readEnvYamlFiles фильтрует yaml, сортирует и тянет raw с веткой', async () => {
    const { calls, client } = fakeHttp();
    const files = await make(client).readEnvYamlFiles('master', 'DEV');
    expect(files.map((f) => f.path)).toEqual(['custom/sds-api/postgres.yaml', 'postgres.yaml']); // notes.txt исключён
    expect(calls.some((c) => c.url === '/raw/DEV/postgres.yaml' && c.params.at === 'master')).toBe(true);
    expect(files.find((f) => f.path === 'postgres.yaml')?.content).toContain('/raw/DEV/postgres.yaml');
  });
});
