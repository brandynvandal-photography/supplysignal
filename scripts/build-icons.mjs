/* Home-screen icons, drawn from the same geometry as the header mark.
 *
 * Written as a pixel renderer with a hand-rolled PNG encoder rather than an
 * image library, for the same reason the app has no font CDN: this project
 * ships one dependency, and an icon is not worth a second one. Node's zlib is
 * the only thing needed - a PNG is a header, a deflated block of scanlines,
 * and three CRCs.
 *
 * Run: node scripts/build-icons.mjs
 *
 * The mark is the nightlight: a warm core inside a halo, inside two rings of
 * light. Deliberately NOT the old teal radial blur, which read as a lens flare
 * and shared no vocabulary with the header.
 *
 * Two things here are iOS-specific and easy to get wrong:
 *   - FULL-BLEED SQUARE, no baked rounded corners. iOS applies its own mask;
 *     an icon that rounds itself gets rounded twice and shows dark slivers in
 *     the corners. The previous icon had them baked in.
 *   - The mark sits at 72% of the canvas. Apple's grid expects margin, and a
 *     mark that runs to the edge looks larger and cruder than its neighbours
 *     on a home screen.
 */

import zlib from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "site", "img");

/* Palette. The background is --d-bg and the light is --d-glow: the icon is
   always the dark theme, because a home screen is not our canvas and the dark
   mark reads on both light and dark wallpapers. */
const BG = [0x17, 0x15, 0x0f];
const GLOW = [0xff, 0xc9, 0x78];

const SS = 4;   // supersampling factor; 4x is enough to kill ring stair-stepping

/* ------------------------------------------------------------------ paint */

/** Smooth 0..1 ramp, used so the bloom has no visible banding edge. */
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * Alpha of the mark at a point, in SVG units (32x32, centre 16,16) so the
 * numbers match site/index.html exactly and the two cannot drift.
 */
function markAlpha(x, y) {
  const d = Math.hypot(x - 16, y - 16);

  /* Ambient bloom: the light spilling into the dark around the lamp.
     Kept low deliberately. At 0.5 it filled the gaps between the rings and the
     icon read as a dartboard - concentric bands of equal weight, with no
     visible source. The dark has to stay dark between the rings for the core
     to be the thing the eye lands on. */
  let a = 0.2 * smooth(1 - d / 13);

  const ring = (r, w, op) => {
    // Distance from the stroke centreline, feathered by half a unit.
    const e = Math.abs(d - r);
    a = Math.max(a, op * smooth(1 - (e - w / 2) / 0.5));
  };

  ring(13, 1.6, 0.3);     // outer ring   - .brand__ring--outer
  ring(8.5, 1.8, 0.55);   // inner ring   - .brand__ring--inner

  const disc = (r, op) => {
    a = Math.max(a, op * smooth(1 - (d - r) / 0.6));
  };

  /* The halo is feathered much wider than the CSS one: at icon scale a hard
     r=7 disc merged into the r=8.5 ring and the middle became a single blob. */
  a = Math.max(a, 0.3 * smooth(1 - (d - 4.2) / 2.6));   // halo - .brand__halo
  disc(4.2, 1);                                          // core - .brand__core

  return Math.min(1, a);
}

/** RGBA buffer for one square icon. */
function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = 32 / (size * 0.72);          // px -> svg units, mark at 72%
  const off = (size * (1 - 0.72)) / 2;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let acc = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) - off) * scale;
          const y = ((py + (sy + 0.5) / SS) - off) * scale;
          acc += markAlpha(x, y);
        }
      }
      const a = acc / (SS * SS);
      const i = (py * size + px) * 4;
      // Composite the light over the background; the icon is fully opaque.
      buf[i] = Math.round(BG[0] + (GLOW[0] - BG[0]) * a);
      buf[i + 1] = Math.round(BG[1] + (GLOW[1] - BG[1]) * a);
      buf[i + 2] = Math.round(BG[2] + (GLOW[2] - BG[2]) * a);
      buf[i + 3] = 255;
    }
  }
  return buf;
}

/* ------------------------------------------------------------------- PNG */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: RGBA
  // 10,11,12 = compression, filter, interlace - all 0

  // Filter byte 0 (None) per scanline. The image is smooth gradients, so
  // Paeth would compress better; None keeps this encoder honest and small.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ main */

mkdirSync(OUT, { recursive: true });
for (const size of [180, 192, 512]) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, png(size, render(size)));
  console.log(`wrote ${file}`);
}
