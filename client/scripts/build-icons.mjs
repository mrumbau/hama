/**
 * One-shot PNG rasteriser for the Project Chaw brand mark.
 *
 * Why pure Node:
 *   The mark is three solid rectangles on a flat background — no
 *   anti-aliasing, no gradients, no curves. Pulling in playwright /
 *   sharp / canvas for that is overkill. Hand-encoded PNG (signature +
 *   IHDR + deflate-compressed IDAT + IEND) keeps the script free of
 *   external deps and runnable on a bare Node install.
 *
 * Source of truth: public/icon.svg's path
 *   M 8 8 H 56 V 22 H 22 V 42 H 56 V 56 H 8 Z
 * which decomposes into three rectangles in a 64×64 viewBox:
 *   top bar  : (8, 8)..(56, 22)   width 48, height 14
 *   left bar : (8, 22)..(22, 42)  width 14, height 20
 *   bottom   : (8, 42)..(56, 56)  width 48, height 14
 *
 * Usage:  node client/scripts/build-icons.mjs
 *
 * Outputs (overwrites):
 *   client/public/apple-touch-icon.png  (180 × 180)  — iOS home screen
 *   client/public/icon-192.png          (192 × 192)  — Android PWA
 *   client/public/icon-512.png          (512 × 512)  — Android PWA splash
 */
import { writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

// Colours pulled straight from tokens.css:
//   --surface-100  = #0a0a0a (charcoal background)
//   --signal-red-500 = #e61919 (canonical hazard red)
const BG = [0x0a, 0x0a, 0x0a];
const FG = [0xe6, 0x19, 0x19];

// CRC32 table (RFC 1952), used for PNG chunk integrity.
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size) {
  // Map the SVG viewBox (64×64) to the output canvas via integer rounding.
  const s = size / 64;
  const x0 = Math.round(8 * s);
  const x1 = Math.round(56 * s);
  const y0 = Math.round(8 * s);
  const y1 = Math.round(56 * s);
  const innerTop = Math.round(22 * s);
  const innerBottom = Math.round(42 * s);
  const innerLeft = Math.round(22 * s);

  // RGB scanlines, each prefixed with a filter byte (0 = no filter).
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);

  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const inTopBar = x >= x0 && x < x1 && y >= y0 && y < innerTop;
      const inLeftBar = x >= x0 && x < innerLeft && y >= innerTop && y < innerBottom;
      const inBottomBar = x >= x0 && x < x1 && y >= innerBottom && y < y1;
      const c = inTopBar || inLeftBar || inBottomBar ? FG : BG;
      const idx = y * stride + 1 + x * 3;
      raw[idx] = c[0];
      raw[idx + 1] = c[1];
      raw[idx + 2] = c[2];
    }
  }

  // IHDR: width(4), height(4), bit_depth(1)=8, colour_type(1)=2 (RGB),
  //       compression(1)=0, filter(1)=0, interlace(1)=0
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const SIZES = [
  { file: "apple-touch-icon.png", px: 180 },
  { file: "icon-192.png", px: 192 },
  { file: "icon-512.png", px: 512 },
];

for (const { file, px } of SIZES) {
  const png = makePng(px);
  await writeFile(join(PUBLIC_DIR, file), png);
  console.log(`  wrote ${file} (${px}×${px}, ${png.length} bytes)`);
}
