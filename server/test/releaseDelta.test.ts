import { describe, it, expect, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { makeRepo } from './helpers/fakeRepo';
import { compareReleaseDelta } from '../src/compare/releaseDelta';

const roots: string[] = [];
afterAll(async () => {
  for (const r of roots) await fs.rm(r, { recursive: true, force: true });
});

describe('compareReleaseDelta — дельта релизов между стендами', () => {
  it('классифицирует вердикты и помечает ожидаемые из-за окружения', async () => {
    const { root, provider } = await makeRepo({
      // branch r1
      'r1/E1/f.yaml': 'keep: 1\nrelOnlyE1: 1\nrelOnlyE2: 1\nsameChange: 1\ndivergent: 10\ndivergentEnv: dev\n',
      'r1/E2/f.yaml': 'keep: 1\nrelOnlyE1: 1\nrelOnlyE2: 1\nsameChange: 1\ndivergent: 10\ndivergentEnv: prom\n',
      // branch r2
      'r2/E1/f.yaml': 'keep: 1\nrelOnlyE1: 2\nrelOnlyE2: 1\nsameChange: 2\ndivergent: 20\ndivergentEnv: dev2\n',
      'r2/E2/f.yaml': 'keep: 1\nrelOnlyE1: 1\nrelOnlyE2: 2\nsameChange: 2\ndivergent: 30\ndivergentEnv: prom2\n',
    });
    roots.push(root);

    const res = await compareReleaseDelta(provider, 'SDS', 'E1', 'E2', 'r1', 'r2');
    const v = (name: string) => res.rows.find((r) => r.variable === name);

    expect(v('keep')?.verdict).toBe('both_unchanged');
    expect(v('relOnlyE1')?.verdict).toBe('only_env1');
    expect(v('relOnlyE2')?.verdict).toBe('only_env2');
    expect(v('sameChange')?.verdict).toBe('same_change');

    // оба изменены, базовые значения совпадали (10=10) → divergent, не «ожид. из-за окружения»
    expect(v('divergent')?.verdict).toBe('divergent');
    expect(v('divergent')?.expectedEnvDiff).toBe(false);

    // оба изменены, но значения различались уже на r1 (dev vs prom) → divergent + expectedEnvDiff
    expect(v('divergentEnv')?.verdict).toBe('divergent');
    expect(v('divergentEnv')?.expectedEnvDiff).toBe(true);

    expect(res.stats).toEqual({
      total: 6,
      bothUnchanged: 1,
      sameChange: 1,
      onlyEnv1: 1,
      onlyEnv2: 1,
      divergent: 2,
    });
  });

  it('переменная, изменённая релизом только на одном стенде, видна как only_env*', async () => {
    const { root, provider } = await makeRepo({
      'r1/DEV/postgres.yaml': 'postgres:\n  pool: 10\n',
      'r2/DEV/postgres.yaml': 'postgres:\n  pool: 20\n', // изменено релизом на DEV
      'r1/PROM/postgres.yaml': 'postgres:\n  pool: 10\n',
      'r2/PROM/postgres.yaml': 'postgres:\n  pool: 10\n', // на PROM не изменилось
    });
    roots.push(root);

    const res = await compareReleaseDelta(provider, 'SDS', 'DEV', 'PROM', 'r1', 'r2');
    expect(res.rows.find((r) => r.variable === 'postgres')?.verdict).toBe('only_env1');
  });
});
