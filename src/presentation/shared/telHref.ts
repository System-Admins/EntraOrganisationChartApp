const EXTENSION = /^(.*?)(?:\s*(?:ext\.?|x|#)\s*(\d+))?\s*$/i;

/** A national "(0)" is not dialled, and an extension becomes ;ext= (RFC 3966). */
export function telHref(phone: string): string {
  const [, number = phone, extension] = EXTENSION.exec(phone) ?? [];
  const digits = number.replace(/^(\+\d+)\s*\(0\)/, '$1').replace(/[^\d+]/g, '');
  return `tel:${digits}${extension ? `;ext=${extension}` : ''}`;
}
