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
      if (url.startsWith('/browse/')) {
        // форма ответа Bitbucket browse?blame (как на боевом стенде)
        return {
          data: {
            isLastPage: true,
            values: [
              {
                author: { name: '19880491', emailAddress: 'LYDanilova@sberbank.ru', displayName: 'Данилова Любовь Юрьевна' },
                authorTimestamp: 1645013746000,
                commitHash: '9f96effeef05aff1e616b6e3736e8f7d2441fa21',
                commitId: '9f96effeef05aff1e616b6e3736e8f7d2441fa21',
                displayCommitHash: '9f96effeef0',
                fileName: '.gitignore',
                lineNumber: 1,
                spannedLines: 3,
              },
              {
                author: { name: '20143187', emailAddress: 'EAndreeMorozova@sberbank.ru' },
                authorTimestamp: 1687172612000,
                commitHash: '5fc0b1c1e2c3b528e3315bbaae1af36fdc1dfaf7',
                displayCommitHash: '5fc0b1c1e2c',
                fileName: '.gitignore',
                lineNumber: 4,
                spannedLines: 1,
              },
            ],
          },
        };
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

  it('blameFile: browse?blame с at/blame/noContent и маппинг полей', async () => {
    const { calls, client } = fakeHttp();
    const regions = await make(client).blameFile('dev', 'DEV/postgres.yaml');

    const call = calls.find((c) => c.url === '/browse/DEV/postgres.yaml');
    expect(call?.params).toMatchObject({ at: 'dev', blame: true, noContent: true });

    expect(regions).toEqual([
      {
        startLine: 1,
        lineCount: 3,
        author: 'Данилова Любовь Юрьевна',
        authorEmail: 'LYDanilova@sberbank.ru',
        date: '2022-02-16T12:15:46.000Z',
        commitHash: '9f96effeef05aff1e616b6e3736e8f7d2441fa21',
        commitShort: '9f96effeef0',
        commitUrl: 'x/projects/P/repos/R/commits/9f96effeef05aff1e616b6e3736e8f7d2441fa21',
      },
      {
        startLine: 4,
        lineCount: 1,
        author: '20143187', // нет displayName → логин
        authorEmail: 'EAndreeMorozova@sberbank.ru',
        date: '2023-06-19T11:03:32.000Z',
        commitHash: '5fc0b1c1e2c3b528e3315bbaae1af36fdc1dfaf7',
        commitShort: '5fc0b1c1e2c',
        commitUrl: 'x/projects/P/repos/R/commits/5fc0b1c1e2c3b528e3315bbaae1af36fdc1dfaf7',
      },
    ]);
  });
});
