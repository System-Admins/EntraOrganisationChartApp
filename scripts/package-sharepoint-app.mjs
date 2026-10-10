// Usage: npm run package:sharepoint -- --host <host> [--version <x.y.z>] [--config <path>]
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fail, fill, hostOf, read, root, titleOf, versionOf } from './packaging.mjs';

const { values: args } = parseArgs({
  options: {
    host: { type: 'string' },
    version: { type: 'string' },
    config: { type: 'string', default: 'public/config.json' },
  },
});
const host = hostOf(args.host);
const version = versionOf(args.version);
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`Pass the version as three numbers, e.g. --version 1.0.42 (got "${version}").`);
const config = JSON.parse(readFileSync(args.config));

// The SharePoint Framework pins its Node.js: the major version of sharepoint/package.json's engines.
const node = /\d+/.exec(JSON.parse(read('sharepoint/package.json')).engines.node)[0];
if (process.versions.node.split('.')[0] !== node) fail(`The SharePoint package needs Node.js ${node}; this is ${process.version}.`);
if (!existsSync(new URL('sharepoint/node_modules/', root))) fail('Install its tools first: npm ci --prefix sharepoint');

const generated = new URL('sharepoint/src/generated/', root);
mkdirSync(generated, { recursive: true });
writeFileSync(
  new URL('chart.ts', generated),
  '// Written by scripts/package-sharepoint-app.mjs: the only site the web part shows, and hands tokens to.\n' +
    `export const CHART_SITE = ${JSON.stringify(`https://${host}/`)};\n` +
    `export const CHART_TITLE = ${JSON.stringify(titleOf(config))};\n`,
);
for (const shared of ['src/infrastructure/sharepoint/webPartMessages.ts', 'src/application/settings/chartParts.ts']) {
  copyFileSync(new URL(shared, root), new URL(shared.split('/').at(-1), generated));
}
writeFileSync(
  new URL('sharepoint/config/package-solution.json', root),
  fill('sharepoint/config/package-solution.template.json', { VERSION: version, HOST: host }),
);

try {
  // On Windows npm is npm.cmd, which Node.js starts only through a shell.
  execFileSync('npm', ['run', 'build'], { cwd: new URL('sharepoint/', root), stdio: 'inherit', shell: process.platform === 'win32' });
} catch {
  fail('The SharePoint Framework build failed, as its output above says.');
}
console.log(`Created sharepoint/solution/organization-chart.sppkg for https://${host}/`);
