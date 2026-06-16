import { buildServer } from './api/server';
import { buildDeps } from './config/appConfig';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = await buildServer(buildDeps());

try {
  const addr = await app.listen({ port: PORT, host: HOST });
  console.log(`sledilo server listening on ${addr}`);
} catch (e) {
  console.error(e);
  process.exit(1);
}
