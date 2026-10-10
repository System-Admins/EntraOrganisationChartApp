export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** `echo` is false for URL values: a crafted link would otherwise put its own words on the error screen. */
export function parseOneOf<T extends string>(value: string, allowed: readonly T[], label: string, echo = true): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  // Quoted, because some allowed values are punctuation (csvSeparator).
  const got = echo ? ` (got "${value}")` : '';
  throw new ConfigError(`${label} must be one of: ${allowed.map((item) => `"${item}"`).join(', ')}${got}.`);
}

/** `echo` as for parseOneOf; an invalid colour would blank every var() that uses it, and unit tests have no CSS. */
export function parseCssColor(value: string, label: string, echo = true): string {
  if (typeof CSS === 'undefined' || CSS.supports('color', value)) return value;
  throw new ConfigError(`${label} must be a CSS colour such as "#0f548c"${echo ? ` (got "${value}")` : ''}.`);
}

export function parseInteger(value: unknown, min: number, max: number, label: string): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number === 'number' && Number.isInteger(number) && number >= min && number <= max) return number;
  throw new ConfigError(`${label} must be a whole number from ${min} to ${max}.`);
}

/** Typed, path-aware access to one JSON object in config.json. Missing keys yield the fallback. */
export class ConfigSection {
  private constructor(
    private readonly values: Readonly<Record<string, unknown>>,
    private readonly path: string,
  ) {}

  static root(json: unknown): ConfigSection {
    return new ConfigSection(asObject(json, 'config.json'), '');
  }

  section(key: string): ConfigSection {
    const value = this.values[key];
    const path = this.pathOf(key);
    return new ConfigSection(value === undefined ? {} : asObject(value, path), path);
  }

  keys(): string[] {
    return Object.keys(this.values);
  }

  /** A misspelled key would otherwise fall back to its default without a word. Keys starting with _ are notes. */
  assertKnownKeys(allowed: readonly string[]): void {
    const unknown = this.keys().filter((key) => !key.startsWith('_') && !allowed.includes(key));
    if (unknown.length > 0) {
      const names = unknown.map((key) => this.pathOf(key)).join(', ');
      throw new ConfigError(`Unknown ${names} in config.json. Use: ${allowed.join(', ')}.`);
    }
  }

  string(key: string, fallback: string): string {
    return this.optionalString(key) ?? fallback;
  }

  optionalString(key: string): string | null {
    const value = this.values[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new ConfigError(`${this.pathOf(key)} must be a string.`);
    return value.trim() || null;
  }

  boolean(key: string, fallback: boolean): boolean {
    const value = this.values[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') throw new ConfigError(`${this.pathOf(key)} must be true or false.`);
    return value;
  }

  integer(key: string, fallback: number, min: number, max: number): number {
    const value = this.values[key];
    return value === undefined ? fallback : parseInteger(value, min, max, this.pathOf(key));
  }

  oneOf<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    const value = this.optionalString(key);
    return value === null ? fallback : parseOneOf(value, allowed, this.pathOf(key));
  }

  stringArray(key: string): string[] {
    const value = this.values[key];
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      throw new ConfigError(`${this.pathOf(key)} must be a list of strings.`);
    }
    return value.map((item) => item.trim()).filter(Boolean);
  }

  /** A list of JSON objects, each a section named by its place in the list, such as directory.extraFields[0]. */
  sections(key: string): ConfigSection[] {
    const value = this.values[key];
    if (value === undefined) return [];
    const path = this.pathOf(key);
    if (!Array.isArray(value)) throw new ConfigError(`${path} must be a list of JSON objects.`);
    return (value as unknown[]).map((item, index) => {
      const itemPath = `${path}[${String(index)}]`;
      return new ConfigSection(asObject(item, itemPath), itemPath);
    });
  }

  /** The value as config.json has it, for parsers that live elsewhere. */
  raw(key: string): unknown {
    return this.values[key];
  }

  pathOf(key: string): string {
    return this.path ? `${this.path}.${key}` : key;
  }
}

function asObject(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`${path} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}
