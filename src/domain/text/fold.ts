/** Letters Unicode doesn't decompose into a base letter plus an accent, spelled the way people type them. */
const EXTRA_FOLDS: Readonly<Record<string, string>> = { ø: 'o', æ: 'ae', œ: 'oe', ł: 'l', ß: 'ss', đ: 'd', ð: 'd', þ: 'th', ı: 'i' };

/** Plain ASCII, which is most of a directory, needs none of the accent work. */
const PLAIN = /^[ -~]*$/;

/** Text as people type it to find it: lower case and without accents, so that "Øverland" is "overland". */
export function fold(value: string): string {
  if (PLAIN.test(value)) return value.toLowerCase();
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[øæœłßđðþı]/g, (letter) => EXTRA_FOLDS[letter] ?? letter);
}
