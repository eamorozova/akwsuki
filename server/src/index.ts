import './env';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer } from './api/server';
import { buildDeps } from './config/appConfig';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

// прод: если собран фронт (web/dist) — сервер отдаёт его сам (API + UI на одном порту)
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../web/dist'); // server/src -> repo/web/dist
const webDistOpt = existsSync(path.join(webDist, 'index.html')) ? webDist : undefined;

const app = await buildServer(buildDeps(), { webDist: webDistOpt });

try {
  const addr = await app.listen({ port: PORT, host: HOST });
  console.log(`sledilo server listening on ${addr}${webDistOpt ? ' (отдаёт web/dist)' : ''}`);
} catch (e) {
  console.error(e);
  process.exit(1);
}
