// Draws the toolbar icons (rounded square with a "rewind" double triangle) as PNGs.
// No image libraries needed: pixels are rasterised directly and PNG-encoded with zlib.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
await fs.mkdir(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4x4 supersampling for smooth edges
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const p = pixel((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
          acc = acc.map((a, i) => a + p[i]);
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 4; i++) raw[o + i] = Math.round(acc[i] / 16);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const inRoundedSquare = (x, y, r = 0.22) => {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
// Left-pointing triangle with tip at (tx, 0.5) and base at x = bx.
const inTri = (x, y, tx, bx, h = 0.24) => x >= tx && x <= bx && Math.abs(y - 0.5) <= ((x - tx) / (bx - tx)) * h;

const BG = [31, 78, 140, 255];
const FG = [255, 255, 255, 255];
const NONE = [0, 0, 0, 0];
const pixel = (x, y) => {
  if (!inRoundedSquare(x, y)) return NONE;
  if (inTri(x, y, 0.2, 0.5) || inTri(x, y, 0.48, 0.78)) return FG;
  return BG;
};

for (const s of [16, 32, 48, 128]) await fs.writeFile(path.join(out, `icon${s}.png`), png(s, pixel));
console.log(`icons written to ${out}`);
