export type ReadingToken = { text: string; reading?: string };
export const hasKanji = (text: string) => /[\p{Script=Han}々〆ヶヵ]/u.test(text);

/** 原稿に指定された読みを保ち、未指定の部分だけ辞書で補う。 */
export function explicitReadings(text: string): ReadingToken[] {
  const pattern = /([\p{Script=Han}々〆ヶヵ]+)\[([^\]]+)\]/gu;
  const result: ReadingToken[] = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > start) result.push({ text: text.slice(start, match.index) });
    result.push({ text: match[1], reading: match[2] });
    start = match.index + match[0].length;
  }
  if (start < text.length) result.push({ text: text.slice(start) });
  return result;
}
