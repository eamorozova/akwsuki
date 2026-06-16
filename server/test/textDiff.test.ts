import { describe, it, expect } from 'vitest';
import { detectEol, compareValues } from '../src/diff/textDiff';

describe('detectEol', () => {
  it('распознаёт LF / CRLF / mixed / none', () => {
    expect(detectEol('a\nb')).toBe('LF');
    expect(detectEol('a\r\nb')).toBe('CRLF');
    expect(detectEol('a\r\nb\nc')).toBe('mixed');
    expect(detectEol('abc')).toBe('none');
  });
});

describe('compareValues', () => {
  it('ловит любое текстовое расхождение', () => {
    expect(compareValues('x', 'x')).toBe('equal');
    expect(compareValues('x', 'x ')).toBe('different'); // хвостовой пробел
    expect(compareValues('a\nb', 'a\r\nb')).toBe('different'); // EOL
    expect(compareValues('a: 1', 'a:  1')).toBe('different'); // двойной пробел
    expect(compareValues(null, 'x')).toBe('only_b');
    expect(compareValues('x', null)).toBe('only_a');
  });
});
