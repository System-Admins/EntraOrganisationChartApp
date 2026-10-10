/** The items of a list as people type it, between commas or semicolons, as in ?top= or a field for several addresses. */
export function splitList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
