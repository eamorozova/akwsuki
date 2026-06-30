/** 1-based номер строки для символьного смещения (учитывает CRLF, т.к. считаем \n). */
export function lineAt(src: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, src.length);
  for (let i = 0; i < end; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}
