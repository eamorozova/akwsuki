/**
 * Толерантный разбор файла `vars/get_stand_params.groovy`:
 *   def call() { standparams = [ {map}, {map} ]; return standparams }
 * Каждый элемент — map параметров стенда (STAND_ALIAS, ENV_ALIAS и прочее).
 *
 * Поддерживается подмножество Groovy-литералов: списки `[…]`, map `[ 'k': v ]`,
 * строки '…' / "…" / тройные, числа, true/false/null, комментарии // и /* *\/,
 * висячие запятые. Интерполяция ${…} в строках берётся как есть.
 */
export interface Stand {
  alias: string;
  env: string;
  /** Все параметры стенда, значение сериализовано в строку. */
  params: Record<string, string>;
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export function parseStandParams(src: string): Stand[] {
  const m = /standparams\s*=\s*\[/.exec(src);
  if (!m) return [];
  const parser = new Parser(src, m.index + m[0].length - 1); // на открывающей '['
  let value: Json;
  try {
    value = parser.parseValue();
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];

  const stands: Stand[] = [];
  for (const item of value) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const map = item as Record<string, Json>;
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(map)) params[k] = serialize(v);
      stands.push({
        alias: typeof map['STAND_ALIAS'] === 'string' ? (map['STAND_ALIAS'] as string) : '',
        env: typeof map['ENV_ALIAS'] === 'string' ? (map['ENV_ALIAS'] as string) : '',
        params,
      });
    }
  }
  return stands;
}

function serialize(v: Json): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v, null, 2); // списки и вложенные map
}

class Parser {
  constructor(
    private readonly s: string,
    private pos: number,
  ) {}

  parseValue(): Json {
    this.skipWs();
    const c = this.s[this.pos];
    if (c === '[') return this.parseBracket();
    if (c === '"' || c === "'") return this.parseString();
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return this.parseNumber();
    return this.parseWord();
  }

  private parseBracket(): Json {
    this.pos++; // '['
    this.skipWs();
    if (this.s[this.pos] === ']') {
      this.pos++;
      return [];
    }
    if (this.s[this.pos] === ':') {
      // пустой map [:]
      this.pos++;
      this.skipWs();
      if (this.s[this.pos] === ']') this.pos++;
      return {};
    }

    const first = this.parseValue();
    this.skipWs();

    if (this.s[this.pos] === ':') {
      // map
      const map: { [k: string]: Json } = {};
      this.pos++; // ':'
      map[String(first)] = this.parseValue();
      this.skipWs();
      while (this.s[this.pos] === ',') {
        this.pos++;
        this.skipWs();
        if (this.s[this.pos] === ']') break;
        const key = this.parseValue();
        this.skipWs();
        if (this.s[this.pos] === ':') this.pos++;
        map[String(key)] = this.parseValue();
        this.skipWs();
      }
      if (this.s[this.pos] === ']') this.pos++;
      return map;
    }

    // list
    const arr: Json[] = [first];
    while (this.s[this.pos] === ',') {
      this.pos++;
      this.skipWs();
      if (this.s[this.pos] === ']') break;
      arr.push(this.parseValue());
      this.skipWs();
    }
    if (this.s[this.pos] === ']') this.pos++;
    return arr;
  }

  private parseString(): string {
    const q = this.s[this.pos]!;
    // тройная кавычка
    if (this.s[this.pos + 1] === q && this.s[this.pos + 2] === q) {
      this.pos += 3;
      const end = this.s.indexOf(q + q + q, this.pos);
      const stop = end === -1 ? this.s.length : end;
      const out = this.s.slice(this.pos, stop);
      this.pos = end === -1 ? this.s.length : end + 3;
      return out;
    }
    this.pos++; // open quote
    let out = '';
    while (this.pos < this.s.length) {
      const ch = this.s[this.pos]!;
      if (ch === '\\') {
        const n = this.s[this.pos + 1];
        out += n === 'n' ? '\n' : n === 't' ? '\t' : (n ?? '');
        this.pos += 2;
        continue;
      }
      if (ch === q) {
        this.pos++;
        break;
      }
      out += ch;
      this.pos++;
    }
    return out;
  }

  private parseNumber(): Json {
    const start = this.pos;
    if (this.s[this.pos] === '-') this.pos++;
    while (this.pos < this.s.length && /[0-9._]/.test(this.s[this.pos]!)) this.pos++;
    const raw = this.s.slice(start, this.pos).replace(/_/g, '');
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }

  private parseWord(): Json {
    const start = this.pos;
    while (this.pos < this.s.length && /[A-Za-z0-9_.$]/.test(this.s[this.pos]!)) this.pos++;
    const w = this.s.slice(start, this.pos);
    if (w === 'true') return true;
    if (w === 'false') return false;
    if (w === 'null') return null;
    return w; // bareword как строка
  }

  private skipWs(): void {
    for (;;) {
      const c = this.s[this.pos];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        this.pos++;
      } else if (c === '/' && this.s[this.pos + 1] === '/') {
        const nl = this.s.indexOf('\n', this.pos);
        this.pos = nl === -1 ? this.s.length : nl + 1;
      } else if (c === '/' && this.s[this.pos + 1] === '*') {
        const end = this.s.indexOf('*/', this.pos + 2);
        this.pos = end === -1 ? this.s.length : end + 2;
      } else {
        break;
      }
    }
  }
}
