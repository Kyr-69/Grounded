/**
 * Generates assets/app-icon.png (1024x1024) without any dependencies:
 * dark background, emerald progress ring, cyan check mark.
 * Run: node scripts/gen-icon.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 1024;
const buf = Buffer.alloc(SIZE * SIZE * 4);

const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUT = 360;
const R_IN = 300;

// near-black indigo background
const bg = [12, 13, 20, 255];
const ring = [52, 211, 153, 255]; // emerald 400
const check = [103, 232, 249, 255]; // cyan 300

function put(x, y, rgba) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  buf[i] = rgba[0];
  buf[i + 1] = rgba[1];
  buf[i + 2] = rgba[2];
  buf[i + 3] = rgba[3];
}

// background + ring
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    put(x, y, bg);
    const dx = x - CX;
    const dy = y - CY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= R_OUT && d >= R_IN) put(x, y, ring);
  }
}

// check mark: thick polyline from (330, 540) -> (470, 680) -> (720, 400)
function line(x1, y1, x2, y2, thickness) {
  const steps = Math.hypot(x2 - x1, y2 - y1) * 2;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    for (let oy = -thickness; oy <= thickness; oy++) {
      for (let ox = -thickness; ox <= thickness; ox++) {
        if (ox * ox + oy * oy <= thickness * thickness) {
          put(Math.round(px + ox), Math.round(py + oy), check);
        }
      }
    }
  }
}
line(330, 540, 470, 680, 34);
line(470, 680, 720, 400, 34);

// PNG encode (no deps)
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter none
  buf.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type, "ascii");
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of Buffer.concat([typeB, data])) {
    crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc);
  return Buffer.concat([len, typeB, data, crcB]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/app-icon.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log("Wrote", out);
