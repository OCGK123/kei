/* Extract Kei's halo out of char.png as a standalone transparent PNG.
   The halo is the only strongly-saturated magenta object in the upper third of
   the art; the hair beside it is near-neutral and the ribbon behind it is dark,
   so a saturation + luminance gate separates them cleanly. */
const fs = require('fs');
const zlib = require('zlib');

function decodePng(buf) {
  let p = 8;
  const idat = [];
  let w = 0, h = 0, ct = 0;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'IHDR') { w = buf.readUInt32BE(p + 8); h = buf.readUInt32BE(p + 12); ct = buf[p + 17]; }
    if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    if (type === 'IEND') break;
    p += 12 + len;
  }
  if (ct !== 6) throw new Error('expected RGBA png, got colortype ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[o++];
    const line = raw.subarray(o, o + stride); o += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v = (v + a) & 255;
      else if (ft === 2) v = (v + b) & 255;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (ft === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[x] = v;
    }
  }
  return { w, h, data: out };
}

function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const SRC = process.argv[2];
const DST = process.argv[3];
const src = decodePng(fs.readFileSync(SRC));
const { w, h, data } = src;

// Search window: upper third, avoiding the far left/right margins.
const X0 = 380, X1 = 860, Y0 = 0, Y1 = 280;

const px = (x, y) => {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};

/**
 * How magenta is this pixel, 0..1.
 *
 * Absolute saturation does not separate the neon from the hair, because the
 * hair is a pale warm white that still carries a red bias. Saturation relative
 * to the red channel does: the hair sits at 0.08-0.11, the halo's neon and its
 * glow at 0.34-0.54, and the darkest hair shadow only reaches 0.28.
 */
function pinkness(r, g, b) {
  if (r < 24) return 0;
  const rel = (r - Math.min(g, b)) / r;
  if (rel < 0.3) return 0;
  return Math.min(1, (rel - 0.3) / 0.12);
}

/** Grow a mask by `r` pixels (chebyshev), used to recover the halo's own
    dark inner shading around its bright neon edges. */
function dilate(mask, w, h, r) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          out[ny * w + nx] = 1;
        }
      }
    }
  }
  return out;
}

/** Drop islands smaller than `min` px so stray speckle does not survive. */
function largestComponents(mask, w, h, min) {
  const seen = new Uint8Array(w * h);
  const keep = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    let top = 0, count = 0;
    stack[top++] = i; seen[i] = 1;
    const members = [];
    while (top > 0) {
      const p = stack[--top];
      members.push(p); count++;
      const x = p % w, y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (mask[np] && !seen[np]) { seen[np] = 1; stack[top++] = np; }
        }
      }
    }
    if (count >= min) for (const p of members) keep[p] = 1;
  }
  return keep;
}

// Pass 1 — two masks.
//
// `full` is every drawn magenta pixel, which includes the halo's dark interior
// faces but also bridges into the dark hair ribbon sitting right beneath the
// halo's lower-left corner. `bright` is only the neon itself, which the ribbon
// never reaches. Growing the bright core by a few pixels and intersecting with
// `full` recovers the halo's own shading without dragging the ribbon along.
const mw = X1 - X0, mh = Y1 - Y0;
const full = new Uint8Array(mw * mh);
const bright = new Uint8Array(mw * mh);
const soft = new Float32Array(mw * mh);
for (let y = 0; y < mh; y++) {
  for (let x = 0; x < mw; x++) {
    const [r, g, b, a] = px(X0 + x, Y0 + y);
    if (a < 10) continue;             // not actually drawn in the source art
    const k = pinkness(r, g, b);
    if (k <= 0) continue;
    const i = y * mw + x;
    full[i] = 1;
    soft[i] = k;
    if (Math.max(r, g, b) >= 110) bright[i] = 1;
  }
}

const core = largestComponents(bright, mw, mh, 200);
const grown = dilate(core, mw, mh, 5);
const keep = new Uint8Array(mw * mh);
for (let i = 0; i < keep.length; i++) keep[i] = grown[i] && full[i] ? 1 : 0;

let minx = X1, maxx = X0, miny = Y1, maxy = Y0, hits = 0;
for (let y = 0; y < mh; y++) {
  for (let x = 0; x < mw; x++) {
    if (!keep[y * mw + x]) continue;
    hits++;
    const gx = X0 + x, gy = Y0 + y;
    if (gx < minx) minx = gx; if (gx > maxx) maxx = gx;
    if (gy < miny) miny = gy; if (gy > maxy) maxy = gy;
  }
}
if (!hits) throw new Error('no halo pixels found');

const pad = 8;
minx = Math.max(0, minx - pad); miny = Math.max(0, miny - pad);
maxx = Math.min(w - 1, maxx + pad); maxy = Math.min(h - 1, maxy + pad);
const ow = maxx - minx + 1, oh = maxy - miny + 1;

// Pass 2 — copy the kept pixels, alpha keyed off both the source alpha and
// how magenta the pixel is, so the neon glow fades out naturally.
const out = Buffer.alloc(ow * oh * 4);
for (let y = 0; y < oh; y++) {
  for (let x = 0; x < ow; x++) {
    const gx = minx + x, gy = miny + y;
    const o = (y * ow + x) * 4;
    const inWindow = gx >= X0 && gx < X1 && gy >= Y0 && gy < Y1;
    if (!inWindow) continue;
    const mi = (gy - Y0) * mw + (gx - X0);
    if (!keep[mi]) continue;
    const [r, g, b, a] = px(gx, gy);
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
    out[o + 3] = Math.round(Math.min(255, soft[mi] * 255) * (a / 255));
  }
}

fs.writeFileSync(DST, encodePng(ow, oh, out));
console.log(JSON.stringify({ srcSize: [w, h], bbox: [minx, miny, maxx, maxy], out: [ow, oh], hits }));
