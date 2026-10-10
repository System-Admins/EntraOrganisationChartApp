/** The same number for the same text on every load, which keeps what the demo shows of a person the same from visit to visit. */
export function stableHash(value: string): number {
  let result = 17;
  for (let index = 0; index < value.length; index++) result = (result * 31 + value.charCodeAt(index)) >>> 0;
  return result;
}
