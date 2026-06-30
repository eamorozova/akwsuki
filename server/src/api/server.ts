import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { ServerDeps } from '../config/appConfig';
import { compareByFile, compareMerged } from '../compare/compare';
import { compareReleaseDelta } from '../compare/releaseDelta';
import { compareStands, listStands } from '../standparams/compareStands';
import { compareRss, listRssEnvs, listRssStands } from '../rss/compareRss';
import type { CompareSide, RssSide } from '../domain/types';

interface CompareBody {
  fp?: string;
  sideA?: Partial<CompareSide>;
  sideB?: Partial<CompareSide>;
  mode?: string;
  scope?: string;
}

interface ReleaseDeltaBody {
  fp?: string;
  env1?: string;
  env2?: string;
  branchR1?: string;
  branchR2?: string;
}

interface CompareStandsBody {
  fp?: string;
  branch1?: string;
  stand1?: string;
  branch2?: string;
  stand2?: string;
}

interface CompareRssBody {
  fp?: string;
  sideA?: Partial<RssSide>;
  sideB?: Partial<RssSide>;
}

const validSide = (s: Partial<RssSide> | undefined): s is RssSide =>
  !!s && typeof s.branch === 'string' && !!s.branch && typeof s.env === 'string' && !!s.env && typeof s.stand === 'string' && !!s.stand;

const dirOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

export interface ServerOptions {
  /** Каталог собранного фронтенда (web/dist) для отдачи статики + SPA-fallback. */
  webDist?: string;
}

export async function buildServer(deps: ServerDeps, opts: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true }); // dev: разрешаем фронт с Vite-порта

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/fp', async () => {
    const fps = await deps.listFps();
    return fps.map((name) => ({ name }));
  });

  app.get<{ Params: { fp: string }; Querystring: { q?: string; limit?: string; repo?: string } }>(
    '/api/fp/:fp/branches',
    async (req) => {
      const { q, limit, repo } = req.query;
      const provider =
        repo === 'shared'
          ? deps.getSharedProvider(req.params.fp)
          : repo === 'gitops'
            ? deps.getGitopsProvider(req.params.fp)
            : deps.getProvider(req.params.fp);
      return provider.listBranches({ filterText: q || undefined, limit: limit ? Number(limit) : undefined });
    },
  );

  // ветка передаётся query-параметром: имена веток в Bitbucket могут содержать «/»
  app.get<{ Params: { fp: string }; Querystring: { branch?: string } }>(
    '/api/fp/:fp/envs',
    async (req, reply) => {
      const branch = req.query.branch;
      if (!branch) {
        reply.code(400);
        return { error: 'query param "branch" is required' };
      }
      return deps.getProvider(req.params.fp).listEnvs(branch);
    },
  );

  // области (папки) окружения для режима «слитый»: '' (корень) + все вложенные папки
  app.get<{ Params: { fp: string }; Querystring: { branch?: string; env?: string } }>(
    '/api/fp/:fp/scopes',
    async (req, reply) => {
      const { branch, env } = req.query;
      if (!branch || !env) {
        reply.code(400);
        return { error: 'query params "branch" and "env" are required' };
      }
      const files = await deps.getProvider(req.params.fp).readEnvYamlFiles(branch, env);
      const dirs = new Set<string>(['']);
      for (const f of files) dirs.add(dirOf(f.path));
      return [...dirs].sort();
    },
  );

  app.post<{ Body: CompareBody }>('/api/compare', async (req, reply) => {
    const err = validateCompare(req.body);
    if (err) {
      reply.code(400);
      return { error: err };
    }
    const { fp, sideA, sideB, mode, scope } = req.body;
    const provider = deps.getProvider(fp!);
    const a = sideA as CompareSide;
    const b = sideB as CompareSide;
    const t0 = Date.now();
    const label = `[compare] ${fp} ${a.branch}/${a.env} vs ${b.branch}/${b.env} mode=${mode ?? 'by_file'}`;
    console.log(`${label} — старт`);
    try {
      const res =
        mode === 'merged'
          ? await compareMerged(provider, fp!, a, b, scope ?? '')
          : await compareByFile(provider, fp!, a, b);
      console.log(`${label} — готово: строк=${res.rows.length} за ${Date.now() - t0}ms`);
      return res;
    } catch (e) {
      console.error(`${label} — ошибка за ${Date.now() - t0}ms: ${(e as Error).message}`);
      reply.code(502);
      return { error: (e as Error).message };
    }
  });

  app.post<{ Body: ReleaseDeltaBody }>('/api/compare-release-delta', async (req, reply) => {
    const { fp, env1, env2, branchR1, branchR2 } = req.body ?? {};
    if (![fp, env1, env2, branchR1, branchR2].every((v) => typeof v === 'string' && v)) {
      reply.code(400);
      return { error: 'fp, env1, env2, branchR1, branchR2 are required' };
    }
    const t0 = Date.now();
    const label = `[release-delta] ${fp} ${env1}/${env2} ${branchR1}→${branchR2}`;
    console.log(`${label} — старт`);
    try {
      const res = await compareReleaseDelta(deps.getProvider(fp!), fp!, env1!, env2!, branchR1!, branchR2!);
      console.log(`${label} — готово: строк=${res.rows.length} за ${Date.now() - t0}ms`);
      return res;
    } catch (e) {
      console.error(`${label} — ошибка за ${Date.now() - t0}ms: ${(e as Error).message}`);
      reply.code(502);
      return { error: (e as Error).message };
    }
  });

  // blame файла на ветке (ленивая загрузка: фронт запрашивает по раскрытию строки)
  app.get<{ Querystring: { fp?: string; branch?: string; path?: string; repo?: string } }>('/api/blame', async (req, reply) => {
    const { fp, branch, path, repo } = req.query;
    if (![fp, branch, path].every((v) => typeof v === 'string' && v)) {
      reply.code(400);
      return { error: 'query params fp, branch, path are required' };
    }
    // repo выбирает репозиторий: config (конфиги ФП) | shared (shared_libs) | gitops (RSS)
    const pick = () =>
      repo === 'shared'
        ? deps.getSharedProvider(fp!)
        : repo === 'gitops'
          ? deps.getGitopsProvider(fp!)
          : deps.getProvider(fp!);
    try {
      const regions = await pick().blameFile(branch!, path!);
      // null → источник не поддерживает blame (локальные фикстуры)
      return { available: regions !== null, regions: regions ?? [] };
    } catch (e) {
      reply.code(502);
      return { error: (e as Error).message };
    }
  });

  // стенды из get_stand_params.groovy на ветке (для выпадающих списков)
  app.get<{ Params: { fp: string }; Querystring: { branch?: string } }>(
    '/api/fp/:fp/stands',
    async (req, reply) => {
      const branch = req.query.branch;
      if (!branch) {
        reply.code(400);
        return { error: 'query param "branch" is required' };
      }
      return listStands(deps.getSharedProvider(req.params.fp), branch, deps.standParamsPath);
    },
  );

  app.post<{ Body: CompareStandsBody }>('/api/compare-stands', async (req, reply) => {
    const { fp, branch1, stand1, branch2, stand2 } = req.body ?? {};
    if (![fp, branch1, stand1, branch2, stand2].every((v) => typeof v === 'string' && v)) {
      reply.code(400);
      return { error: 'fp, branch1, stand1, branch2, stand2 are required' };
    }
    const t0 = Date.now();
    const label = `[stands] ${fp} ${branch1}:${stand1} vs ${branch2}:${stand2}`;
    console.log(`${label} — старт`);
    try {
      const res = await compareStands(
        deps.getSharedProvider(fp!),
        fp!,
        branch1!,
        stand1!,
        branch2!,
        stand2!,
        deps.standParamsPath,
      );
      console.log(`${label} — готово: строк=${res.rows.length} за ${Date.now() - t0}ms`);
      return res;
    } catch (e) {
      console.error(`${label} — ошибка за ${Date.now() - t0}ms: ${(e as Error).message}`);
      reply.code(502);
      return { error: (e as Error).message };
    }
  });

  // прод: отдаём собранный фронт (web/dist) + SPA-fallback на index.html
  if (opts.webDist) {
    await app.register(fastifyStatic, { root: opts.webDist, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not found' });
    });
  }

  // ---- RSS: stands/<env>/<stand>/<service>/values.yaml ----
  app.get('/api/gitops/fps', async () => {
    const fps = await deps.listGitopsFps();
    return fps.map((name) => ({ name }));
  });

  app.get<{ Params: { fp: string }; Querystring: { branch?: string } }>(
    '/api/gitops/:fp/envs',
    async (req, reply) => {
      const branch = req.query.branch;
      if (!branch) {
        reply.code(400);
        return { error: 'query param "branch" is required' };
      }
      return listRssEnvs(deps.getGitopsProvider(req.params.fp), branch);
    },
  );

  app.get<{ Params: { fp: string }; Querystring: { branch?: string; env?: string } }>(
    '/api/gitops/:fp/stands',
    async (req, reply) => {
      const { branch, env } = req.query;
      if (!branch || !env) {
        reply.code(400);
        return { error: 'query params "branch" and "env" are required' };
      }
      return listRssStands(deps.getGitopsProvider(req.params.fp), branch, env);
    },
  );

  app.post<{ Body: CompareRssBody }>('/api/compare-rss', async (req, reply) => {
    const { fp, sideA, sideB } = req.body ?? {};
    if (typeof fp !== 'string' || !fp || !validSide(sideA) || !validSide(sideB)) {
      reply.code(400);
      return { error: 'fp, sideA{branch,env,stand}, sideB{branch,env,stand} are required' };
    }
    const t0 = Date.now();
    const label = `[rss] ${fp} ${sideA.branch}:${sideA.env}/${sideA.stand} vs ${sideB.branch}:${sideB.env}/${sideB.stand}`;
    console.log(`${label} — старт`);
    try {
      const res = await compareRss(deps.getGitopsProvider(fp), fp, sideA, sideB);
      console.log(`${label} — готово: строк=${res.rows.length} за ${Date.now() - t0}ms`);
      return res;
    } catch (e) {
      console.error(`${label} — ошибка за ${Date.now() - t0}ms: ${(e as Error).message}`);
      reply.code(502);
      return { error: (e as Error).message };
    }
  });

  return app;
}

function validateCompare(b: CompareBody | undefined): string | null {
  if (!b || typeof b.fp !== 'string') return 'fp is required';
  for (const key of ['sideA', 'sideB'] as const) {
    const s = b[key];
    if (!s || typeof s.branch !== 'string' || typeof s.env !== 'string') {
      return `${key} must have { branch, env }`;
    }
  }
  return null;
}
