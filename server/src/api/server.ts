import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { ServerDeps } from '../config/appConfig';
import { compareByFile, compareMerged } from '../compare/compare';
import { compareReleaseDelta } from '../compare/releaseDelta';
import { compareStands, listStands } from '../standparams/compareStands';
import type { CompareSide } from '../domain/types';

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
      const provider = repo === 'shared' ? deps.getSharedProvider(req.params.fp) : deps.getProvider(req.params.fp);
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
