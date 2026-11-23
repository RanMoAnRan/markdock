import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dirname, '../public/icons');
mkdirSync(iconsDir, { recursive: true });

// CRC32 table for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function renderIcon(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const r = size * 0.22;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;

      // Rounded rect distance
      const cx = Math.max(r, Math.min(size - r, x + 0.5));
      const cy = Math.max(r, Math.min(size - r, y + 0.5));
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);

      if (dist > r) {
        raw[px] = 0;
        raw[px + 1] = 0;
        raw[px + 2] = 0;
        raw[px + 3] = 0;
        continue;
      }

      // Indigo-to-blue gradient background
      const t = (nx + ny) * 0.5;
      let R = Math.round(37 + (79 - 37) * t);
      let G = Math.round(99 + (70 - 99) * t);
      let B = Math.round(235 + (229 - 235) * t);
      let A = dist > r - 1 ? Math.round(255 * Math.max(0, r - dist)) : 255;

      // White bookmark ribbon silhouette inside
      const inBookmarkX = nx >= 0.3 && nx <= 0.7;
      const inBookmarkTop = ny >= 0.2 && ny <= 0.78;
      const notchY = 0.78 - (0.5 - Math.abs(nx - 0.5)) * 0.6;
      const inBookmark = inBookmarkX && inBookmarkTop && ny <= notchY;

      // Small emerald checkmark/sparkle badge at bottom-right
      const badgeDist = Math.hypot(nx - 0.73, ny - 0.73);
      if (badgeDist <= 0.16) {
        R = 16;
        G = 185;
        B = 129;
      } else if (inBookmark) {
        R = 255;
        G = 255;
        B = 255;
      }

      raw[px] = R;
      raw[px + 1] = G;
      raw[px + 2] = B;
      raw[px + 3] = A;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 48, 128]) {
  const out = resolve(iconsDir, `icon-${size}.png`);
  writeFileSync(out, renderIcon(size));
  console.log(`Generated ${out} (${size}x${size})`);
}

const storeAssetsDir = resolve(__dirname, '../store-assets');
mkdirSync(storeAssetsDir, { recursive: true });
const edgeLogoOut = resolve(storeAssetsDir, 'edge-logo-300x300.png');
writeFileSync(edgeLogoOut, renderIcon(300));
console.log(`Generated ${edgeLogoOut} (300x300)`);
