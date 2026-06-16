// Проверка BitbucketProvider на ЖИВОМ хосте (запускать там, где есть доступ к Bitbucket).
//
//   BITBUCKET_TOKEN=xxx npm run bb:smoke --workspace server [-- <FP> [<branch> [<env>]]]
//
// Печатает ветки, окружения и список yaml выбранного стенда + начало первого файла.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { BitbucketProvider } from '../src/provider/BitbucketProvider';

const here = path.dirname(fileURLToPath(import.meta.url));
const cfgPath = process.env.FP_CONFIG
  ? path.resolve(process.env.FP_CONFIG)
  : path.resolve(here, '../../fp-config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
  bitbucketUrl: string;
  project: string;
  fps: { name: string; repo: string }[];
};

const token = process.env.BITBUCKET_TOKEN;
if (!token) {
  console.error('Установите BITBUCKET_TOKEN');
  process.exit(1);
}

const fpName = process.argv[2] ?? cfg.fps[0]?.name;
const fp = cfg.fps.find((f) => f.name === fpName);
if (!fp) {
  console.error(`Неизвестный ФП: ${fpName}. Доступны: ${cfg.fps.map((f) => f.name).join(', ')}`);
  process.exit(1);
}

const provider = new BitbucketProvider({
  baseUrl: cfg.bitbucketUrl,
  project: cfg.project,
  repo: fp.repo,
  token,
  rejectUnauthorized: process.env.BITBUCKET_TLS_REJECT === '1',
});

console.log(`ФП ${fp.name} → ${cfg.project}/${fp.repo}`);

const branches = await provider.listBranches();
console.log(`\nВетки (${branches.length}):`, branches.slice(0, 30));

const branch = process.argv[3] ?? branches[0];
if (!branch) process.exit(0);

const envs = await provider.listEnvs(branch);
console.log(`\nОкружения @ ${branch} (${envs.length}):`, envs);

const env = process.argv[4] ?? envs[0];
if (!env) process.exit(0);

const files = await provider.readEnvYamlFiles(branch, env);
console.log(`\nYAML-файлы @ ${branch}/${env}: ${files.length}`);
console.log('Примеры путей:', files.slice(0, 15).map((f) => f.path));
if (files[0]) {
  console.log(`\nНачало ${files[0].path}:`);
  console.log(files[0].content.split('\n').slice(0, 6).join('\n'));
}
