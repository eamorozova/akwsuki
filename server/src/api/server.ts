import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { ServerDeps } from '../config/appConfig';
import { compareByFile, compareMerged } from '../compare/compare';
import type { CompareSide } from '../domain/types';

interface CompareBody {
  fp?: string;
  sideA?: Partial<CompareSide>;
  sideB?: Partial<CompareSide>;
  mode?: string;
  scope?: string;
}

const dirOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true }); // dev: разрешаем фронт с Vite-порта

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/fp', async () => {
    const fps = await deps.listFps();
    return fps.map((name) => ({ name }));
  });

  app.get<{ Params: { fp: string } }>('/api/fp/:fp/branches', async (req) => {
    return deps.getProvider(req.params.fp).listBranches();
  });

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
    if (mode === 'merged') {
      return compareMerged(provider, fp!, sideA as CompareSide, sideB as CompareSide, scope ?? '');
    }
    return compareByFile(provider, fp!, sideA as CompareSide, sideB as CompareSide);
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
