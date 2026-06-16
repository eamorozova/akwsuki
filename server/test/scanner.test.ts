import { describe, it, expect } from 'vitest';
import { scanFile } from '../src/scan/scanner';

describe('scanFile', () => {
  it('извлекает ключи верхнего уровня с сырым вложенным значением', () => {
    const src = 'postgres:\n  host: db\n  port: 5432\nkafka:\n  topic: t\n';
    const f = scanFile('postgres.yaml', src);
    expect(f.variables.map((v) => v.name).sort()).toEqual(['kafka', 'postgres']);

    // У значения-блока срез включает завершающий перевод строки (важно: так
    // ловятся отличия в финальном переносе). У скаляра — нет (см. тест ниже).
    const pg = f.variables.find((v) => v.name === 'postgres');
    expect(pg?.raw).toBe('host: db\n  port: 5432\n');
    expect(pg?.eol).toBe('LF');
  });

  it('сохраняет кавычки и формат скаляров', () => {
    const src = 'name: "x"\nport: 5432\n';
    const f = scanFile('a.yaml', src);
    expect(f.variables.find((v) => v.name === 'name')?.raw).toBe('"x"');
    expect(f.variables.find((v) => v.name === 'port')?.raw).toBe('5432');
  });

  it('не падает на пустом файле', () => {
    expect(scanFile('empty.yaml', '').variables).toEqual([]);
  });
});
