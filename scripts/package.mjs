// Zips dist/ into release/rewind-v<version>.zip for a GitHub release (no external zip tool needed).
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const outDir = path.join(root, 'release');
const out = path.join(outDir, `rewind-v${version}.zip`);
const folder = `rewind-v${version}/`; // unzips into one folder: select it in "Load unpacked"

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

async function walk(dir, base = '') {
  const files = [];
  for (const e of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = base + e.name;
    if (e.isDirectory()) files.push(...(await walk(path.join(dir, e.name), rel + '/')));
    else files.push(rel);
  }
  return files;
}

const parts = [];
const central = [];
let offset = 0;
for (const rel of await walk(dist)) {
  const data = await fs.readFile(path.join(dist, rel));
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const name = Buffer.from(folder + rel, 'utf8');
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  parts.push(local, name, deflated);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(deflated.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(name.length, 28);
  cd.writeUInt32LE(offset, 42);
  central.push(cd, name);
  offset += local.length + name.length + deflated.length;
}
const cdBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(central.length / 2, 8);
end.writeUInt16LE(central.length / 2, 10);
end.writeUInt32LE(cdBuf.length, 12);
end.writeUInt32LE(offset, 16);
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(out, Buffer.concat([...parts, cdBuf, end]));
console.log(`Wrote ${path.relative(root, out)} (${((await fs.stat(out)).size / 2 ** 20).toFixed(1)} MB)`);
