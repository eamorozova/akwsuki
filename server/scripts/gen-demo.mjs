// Генератор демо-данных, имитирующих структуру репозиториев ФП.
// Раскладка: demo-data/<FP>/<branch>/<env>/...  (как ожидает LocalFsProvider)
// Намеренно содержит разные виды отличий: значения, хвостовые пробелы, CRLF,
// переменные/файлы только с одной стороны.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '..', 'demo-data');

const ENVS = ['DEV', 'IFT-DE', 'PROM-DE'];
const HOST = { DEV: 'dev', 'IFT-DE': 'ift', 'PROM-DE': 'prom' };

function envFiles(fp, env) {
  const h = HOST[env];
  const f = fp.toLowerCase();
  const files = {
    'postgres.yaml': `postgres:\n  host: ${f}-${h}-pg.sigma.sbrf.ru\n  port: 5432\n  database: ${f}_${h}\n`,
    'kafka.yaml': `kafka:\n  bootstrap: ${f}-${h}-kafka:9092\n  topics:\n    - events\n    - audit\n`,
    'entry_point.yaml': `entry_point:\n  url: https://${f}-${h}.sigma.sbrf.ru\n  timeout: ${env === 'PROM-DE' ? 60 : 30}\n`,
    'service_rest_ports.yaml': `service_rest_ports:\n  gateway: 8080\n  auth: 8081\n`,
    'custom/postgres.yaml': `postgres:\n  pool_size: ${env === 'PROM-DE' ? 50 : 10}\n`,
    'custom/sds-api/service_rest_ports.yaml': `service_rest_ports:\n  api: 9090\n`,
    'custom/sds-auth-server/postgres.yaml': `postgres:\n  host: ${f}-${h}-auth-pg.sigma.sbrf.ru\n  schema: auth\n`,
    'hadoop/hdfs.yaml': `hdfs:\n  namenode: ${f}-${h}-nn:8020\n  replication: ${env === 'PROM-DE' ? 3 : 1}\n`,
    'secman/secrets.yaml': `secrets:\n  vault: https://vault-${h}.sigma.sbrf.ru\n`,
  };

  // намеренные «артефакты» для демонстрации детекции
  if (env === 'IFT-DE') {
    // хвостовой пробел внутри значения
    files['kafka.yaml'] = files['kafka.yaml'].replace(':9092\n', ':9092 \n');
  }
  if (env === 'PROM-DE') {
    // CRLF во всём файле
    files['service_rest_ports.yaml'] = files['service_rest_ports.yaml'].replace(/\n/g, '\r\n');
    // переменная только в PROM
    files['custom/sds-api/service_rest_ports.yaml'] += '  metrics: 9091\n';
  }
  return files;
}

const SPEC = { SDS: ['master', 'release'], MMS: ['master'], KSS: ['master'] };

await fs.rm(OUT, { recursive: true, force: true });
for (const [fp, branches] of Object.entries(SPEC)) {
  for (const branch of branches) {
    for (const env of ENVS) {
      const files = envFiles(fp, env);
      if (branch === 'release') {
        // отличие на уровне ветки
        files['service_rest_ports.yaml'] = files['service_rest_ports.yaml'].replace('gateway: 8080', 'gateway: 18080');
      }
      for (const [rel, content] of Object.entries(files)) {
        const full = path.join(OUT, fp, branch, env, rel);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, content);
      }
    }
  }
}
console.log('demo-data generated at', OUT);
