// Usage: npm run package:teams -- --host <host> [--developer <name>] [--version <x.y.z>] [--config <path>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { crc32, deflateRawSync, deflateSync } from 'node:zlib';
import { fail, fill, hostOf, read, root, titleOf, versionOf } from './packaging.mjs';

const { values: args } = parseArgs({
  options: {
    host: { type: 'string' },
    developer: { type: 'string', default: 'Organization chart' },
    version: { type: 'string' },
    config: { type: 'string', default: 'public/config.json' },
  },
});
const host = hostOf(args.host);

const config = JSON.parse(readFileSync(args.config));
const clientId = config.auth?.clientId;
if (!/^[0-9a-f-]{36}$/i.test(clientId ?? '')) fail('Set auth.clientId in public/config.json first.');

const title = titleOf(config);
// The fallback is the default --accent of global.css.
const accent = toHexColor(config.branding?.colors?.accent) ?? '#0f548c';
const manifest = fill('teams/manifest.template.json', {
  VERSION: versionOf(args.version),
  CLIENT_ID: clientId,
  DEVELOPER: args.developer,
  HOST: host,
  SHORT_NAME: title.slice(0, 30),
  FULL_NAME: title.slice(0, 100),
  ACCENT: accent,
});

const icon = (name, draw) => (existsSync(new URL(`teams/${name}`, root)) ? read(`teams/${name}`) : draw());
const files = [
  { name: 'manifest.json', data: Buffer.from(manifest) },
  { name: 'color.png', data: icon('color.png', () => drawIcon(192, 6, hexToRgba(accent), [255, 255, 255, 255])) },
  { name: 'outline.png', data: icon('outline.png', () => drawIcon(32, 1, [0, 0, 0, 0], [255, 255, 255, 255])) },
];

mkdirSync(new URL('teams/build/', root), { recursive: true });
writeFileSync(new URL('teams/build/manifest.json', root), manifest);
writeFileSync(new URL('teams/build/orgchart-teams.zip', root), zip(files));
console.log(`Created teams/build/orgchart-teams.zip for https://${host}/`);

function toHexColor(value) {
  if (typeof value !== 'string') return null;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function hexToRgba(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255);
}

/** The org-chart glyph from public/branding/logo.svg (32-unit grid), scaled by `scale`. */
function drawIcon(size, scale, background, foreground) {
  const pixels = Buffer.alloc(size * size * 4);
  const fill = (x, y, width, height, color) => {
    for (let row = Math.round(y * scale); row < Math.round((y + height) * scale); row++) {
      for (let col = Math.round(x * scale); col < Math.round((x + width) * scale); col++) {
        pixels.set(color, (row * size + col) * 4);
      }
    }
  };
  fill(0, 0, 32, 32, background);
  for (const [x, y, width, height] of [
    [12, 5, 8, 6],
    [4, 21, 8, 6],
    [20, 21, 8, 6],
    [15, 11, 2, 5],
    [7, 15, 18, 2],
    [7, 15, 2, 6],
    [23, 15, 2, 6],
  ]) {
    fill(x, y, width, height, foreground);
  }
  return png(size, pixels);
}

function png(size, rgba) {
  const scanlines = Buffer.alloc(size * (size * 4 + 1));
  for (let row = 0; row < size; row++) {
    rgba.copy(scanlines, row * (size * 4 + 1) + 1, row * size * 4, (row + 1) * size * 4);
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Minimal ZIP (deflate, no directories), enough for a Teams app package. */
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const fileName = Buffer.from(name);
    const compressed = deflateRawSync(data);
    const common = Buffer.alloc(26);
    common.writeUInt16LE(20, 0); // version needed
    common.writeUInt16LE(0, 2); // flags
    common.writeUInt16LE(8, 4); // deflate
    common.writeUInt16LE(0, 6); // time
    common.writeUInt16LE(0x21, 8); // date: 1980-01-01
    common.writeUInt32LE(crc32(data), 10);
    common.writeUInt32LE(compressed.length, 14);
    common.writeUInt32LE(data.length, 18);
    common.writeUInt16LE(fileName.length, 22);
    common.writeUInt16LE(0, 24); // extra length

    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), common, fileName, compressed]);
    const centralTail = Buffer.alloc(14); // comment length, disk, attributes: zero; then the local header offset
    centralTail.writeUInt32LE(offset, 10);
    centrals.push(
      Buffer.concat([Buffer.from([0x50, 0x4b, 0x01, 0x02, 20, 0]), common, centralTail, fileName]),
    );
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
