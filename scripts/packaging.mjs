// What the Teams and SharePoint packaging scripts share.
import { readFileSync } from 'node:fs';

export const root = new URL('../', import.meta.url);
export const read = (path) => readFileSync(new URL(path, root));

export function fail(message) {
  console.error(message);
  process.exit(1);
}

/** The host name alone, as --host may come as an address. */
export function hostOf(value) {
  const host = value?.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!host) fail('Pass the site host name, e.g. --host orgchart.contoso.com');
  return host;
}

/** The chart's own name where config.json gives no title, as src/presentation/theme/strings.ts has it. */
export function titleOf(config) {
  return config.branding?.title || 'Organization chart';
}

export function versionOf(value) {
  return value ?? JSON.parse(read('package.json')).version;
}

/** The JSON template at `path` with each {{KEY}} replaced by its value. */
export function fill(path, values) {
  return read(path)
    .toString()
    .replace(/{{(\w+)}}/g, (_, key) => {
      if (!(key in values)) fail(`Unknown placeholder {{${key}}} in ${path}.`);
      return JSON.stringify(String(values[key])).slice(1, -1);
    });
}
