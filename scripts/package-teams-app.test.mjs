import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_STRINGS } from '../src/presentation/theme/strings.ts';

const repository = fileURLToPath(new URL('../', import.meta.url));
/** What the script reads, copied so that it writes its teams/build into a temporary folder and never the repository's. */
const INPUTS = ['scripts/package-teams-app.mjs', 'scripts/packaging.mjs', 'teams/manifest.template.json', 'package.json'];
const CLIENT_ID = '11111111-2222-3333-4444-555555555555';

let root = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orgapp-teams-'));
  for (const path of INPUTS) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(repository, path), join(root, path));
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Runs the copy as `npm run package:teams` does, with `config` as config.json. */
function packageApp(config) {
  const configPath = join(root, 'config.json');
  writeFileSync(configPath, JSON.stringify(config));
  const script = join(root, 'scripts/package-teams-app.mjs');
  execFileSync(process.execPath, [script, '--host', 'chart.example.org', '--config', configPath], { stdio: 'pipe' });
  const built = (name) => readFileSync(join(root, 'teams/build', name));
  return {
    manifest: JSON.parse(built('manifest.json').toString()),
    zip: built('orgchart-teams.zip'),
    files: readdirSync(join(root, 'teams/build')).sort(),
  };
}

describe('the Teams package', () => {
  it("names the app with the chart's own name where config.json gives no title, in English alone", () => {
    const { manifest, zip, files } = packageApp({ auth: { clientId: CLIENT_ID } });

    expect(manifest.name).toEqual({ short: THEME_STRINGS.en.defaultTitle, full: THEME_STRINGS.en.defaultTitle });
    expect(manifest.staticTabs[0].name).toBe(THEME_STRINGS.en.defaultTitle);
    expect(manifest.localizationInfo).toBeUndefined();
    expect(files).toEqual(['manifest.json', 'orgchart-teams.zip']);
    for (const name of ['manifest.json', 'color.png', 'outline.png']) expect(zip.includes(name)).toBe(true);
  });

  it("gives the app config.json's title", () => {
    const { manifest } = packageApp({ auth: { clientId: CLIENT_ID }, branding: { title: 'Contoso organization' } });

    expect(manifest.name).toEqual({ short: 'Contoso organization', full: 'Contoso organization' });
    expect(manifest.staticTabs[0].name).toBe('Contoso organization');
  });
});
