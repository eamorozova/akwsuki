import { describe, it, expect } from 'vitest';
import { parseStandParams } from '../src/standparams/parseStandParams';

const SAMPLE = `def call() {
standparams = [
        [
                'STAND_ALIAS': "DEVOPS (DEV)",
                'ENV_ALIAS': "DEV",
                'ALLOWEDUSERS': [
                        '2adso', '1947daskin', '173dsakin', '207dasv', '2172daav', '1ad'
                ],
                'VAULT_STORE': "Cqwe",
                'VAULT_TOKEN': '123',
        ],
        [
                'STAND_ALIAS': "PSI (PSI-DE)",
                'ENV_ALIAS': "PSI-DE",
                'VAULT_STORE': "CI111",
                'ISTIO_CONTROL_PLANE': "ci0el",
        ]
]

return standparams
}`;

describe('parseStandParams', () => {
  it('разбирает список стендов и их параметры', () => {
    const stands = parseStandParams(SAMPLE);
    expect(stands.length).toBe(2);

    const dev = stands[0]!;
    expect(dev.alias).toBe('DEVOPS (DEV)');
    expect(dev.env).toBe('DEV');
    expect(dev.params['VAULT_STORE']).toBe('Cqwe');
    expect(dev.params['VAULT_TOKEN']).toBe('123');
    expect(dev.params['ALLOWEDUSERS']).toContain('2adso');
    expect(dev.params['ALLOWEDUSERS']).toContain('1ad');

    const psi = stands[1]!;
    expect(psi.alias).toBe('PSI (PSI-DE)');
    expect(psi.env).toBe('PSI-DE');
    expect(psi.params['ISTIO_CONTROL_PLANE']).toBe('ci0el');
    expect(psi.params['ALLOWEDUSERS']).toBeUndefined();
  });

  it('терпит комментарии, висячие запятые и пустой ввод', () => {
    expect(parseStandParams('garbage без standparams')).toEqual([]);
    const withComments = `standparams = [
      // комментарий
      [ 'STAND_ALIAS': "X", 'ENV_ALIAS': "x", /* inline */ 'A': "1", ],
    ]`;
    const r = parseStandParams(withComments);
    expect(r.length).toBe(1);
    expect(r[0]!.alias).toBe('X');
    expect(r[0]!.params['A']).toBe('1');
  });
});
