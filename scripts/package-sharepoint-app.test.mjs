import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_STRINGS } from '../src/presentation/theme/strings.ts';

const repository = fileURLToPath(new URL('../', import.meta.url));
/** What the script reads, copied so that it writes and builds in a temporary folder, never in the repository's sharepoint folder. */
const INPUTS = [
  'scripts/package-sharepoint-app.mjs',
  'scripts/packaging.mjs',
  'package.json',
  'sharepoint/config/package-solution.template.json',
  'src/infrastructure/sharepoint/webPartMessages.ts',
  'src/application/settings/chartParts.ts',
];
/** In the SharePoint Framework's place: a build whose package holds the package-solution.json it was given. */
const BUILD = "const fs = require('fs'); fs.mkdirSync('solution'); fs.copyFileSync('config/package-solution.json', 'solution/organization-chart.sppkg');";

let root = '';

/** The copy's sharepoint/package.json, as `npm ci --prefix sharepoint` would have installed it for Node.js `major`. */
function installSharePoint(major = process.versions.node.split('.')[0]) {
  mkdirSync(join(root, 'sharepoint/node_modules'), { recursive: true });
  const manifest = { engines: { node: `>=${major}.0.0 < ${Number(major) + 1}.0.0` }, scripts: { build: `node -e "${BUILD}"` } };
  writeFileSync(join(root, 'sharepoint/package.json'), JSON.stringify(manifest));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orgapp-sharepoint-'));
  for (const path of INPUTS) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(repository, path), join(root, path));
  }
  installSharePoint();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Runs the copy as `npm run package:sharepoint` does, with `config` as config.json. */
function packageApp(args, config = {}) {
  const configPath = join(root, 'config.json');
  writeFileSync(configPath, JSON.stringify(config));
  const script = join(root, 'scripts/package-sharepoint-app.mjs');
  const { status, stderr } = spawnSync(process.execPath, [script, '--config', configPath, ...args], { encoding: 'utf8' });
  const built = (path) => readFileSync(join(root, 'sharepoint', path), 'utf8');
  return { status, stderr, built, packaged: existsSync(join(root, 'sharepoint/solution/organization-chart.sppkg')) };
}

describe('the SharePoint package', () => {
  it("fixes the chart's site and name in the web part, and gives the package the version", () => {
    const { status, built } = packageApp(['--host', 'https://chart.example.org/somewhere', '--version', '1.0.42'], {
      branding: { title: 'Contoso organization' },
    });

    expect(status).toBe(0);
    expect(built('src/generated/chart.ts')).toContain(
      'export const CHART_SITE = "https://chart.example.org/";\nexport const CHART_TITLE = "Contoso organization";\n',
    );
    for (const shared of ['src/infrastructure/sharepoint/webPartMessages.ts', 'src/application/settings/chartParts.ts']) {
      expect(built(`src/generated/${shared.split('/').at(-1)}`)).toBe(readFileSync(join(repository, shared), 'utf8'));
    }
    const { solution } = JSON.parse(built('solution/organization-chart.sppkg'));
    expect(solution.version).toBe('1.0.42.0');
    expect(solution.features.map(({ version }) => version)).toEqual(['1.0.42.0']);
    expect(solution.metadata.longDescription.default).toContain('https://chart.example.org/');
  });

  it("names the frame with the chart's own name where config.json gives no title, and takes package.json's version", () => {
    const { status, built } = packageApp(['--host', 'chart.example.org']);

    expect(status).toBe(0);
    expect(built('src/generated/chart.ts')).toContain(`export const CHART_TITLE = "${THEME_STRINGS.en.defaultTitle}";`);
    const version = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')).version;
    expect(JSON.parse(built('config/package-solution.json')).solution.version).toBe(`${version}.0`);
  });

  it('builds nothing with a version SharePoint cannot take, or on a Node.js the SharePoint Framework does not run on', () => {
    const shortVersion = packageApp(['--host', 'chart.example.org', '--version', '1.0']);
    expect(shortVersion.status).toBe(1);
    expect(shortVersion.stderr).toContain('three numbers');
    expect(shortVersion.packaged).toBe(false);

    installSharePoint('20');
    const otherNode = packageApp(['--host', 'chart.example.org']);
    expect(otherNode.status).toBe(1);
    expect(otherNode.stderr).toContain('needs Node.js 20');
    expect(otherNode.packaged).toBe(false);
  });
});
