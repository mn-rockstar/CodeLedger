// Minimal PNG decode/encode plus a box resampler.
//
// The project has no image library and doesn't warrant a dependency for the
// handful of assets it generates, so this does the job by hand. Shared by
// tools/logo-icons.mjs and tools/store-assets.mjs.
//
// Supports 8-bit non-interlaced PNGs in colour types 0, 2, 4 and 6 — which
// covers anything a standard image editor or export pipeline will hand you.
// Anything else throws rather than producing quiet garbage.

import { deflateSync, inflateSync } from "node:zlib";

// --- Decoding -------------------------------------------------------------

function readChunks(buffer) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) throw new Error("Not a PNG file");
  }
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    chunks.push({
      type: buffer.toString("ascii", offset + 4, offset + 8),
      data: buffer.subarray(offset + 8, offset + 8 + length),
    });
    offset += 12 + length; // length + type + data + crc
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Returns { width, height, rgba } with rgba as 4 bytes per pixel. */
export function decodePng(buffer) {
  const chunks = readChunks(buffer);
  const ihdr = chunks.find((c) => c.type === "IHDR");
  if (!ihdr) throw new Error("PNG has no IHDR chunk");

  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];

  if (bitDepth !== 8) {
    throw new Error(`Unsupported bit depth ${bitDepth} (this tool handles 8)`);
  }
  if (interlace !== 0) throw new Error("Interlaced PNGs are not supported");
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Unsupported colour type ${colorType}`);

  const raw = inflateSync(
    Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data))
  );

  // Undo per-scanline filtering: each row is prefixed with a filter byte and
  // predicts from the pixel left (a), above (b) and above-left (c).
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const prev = dst - stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[src + x];
      const a = x >= channels ? pixels[dst + x - channels] : 0;
      const b = y > 0 ? pixels[prev + x] : 0;
      const c = y > 0 && x >= channels ? pixels[prev + x - channels] : 0;
      let recon;
      if (filter === 0) recon = value;
      else if (filter === 1) recon = value + a;
      else if (filter === 2) recon = value + b;
      else if (filter === 3) recon = value + ((a + b) >> 1);
      else if (filter === 4) recon = value + paeth(a, b, c);
      else throw new Error(`Unknown PNG filter ${filter} on row ${y}`);
      pixels[dst + x] = recon & 0xff;
    }
  }

  // Normalise every colour type to RGBA so callers stay uniform.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const src = i * channels;
    const dst = i * 4;
    if (channels === 1) {
      rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = pixels[src];
      rgba[dst + 3] = 255;
    } else if (channels === 2) {
      rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = pixels[src];
      rgba[dst + 3] = pixels[src + 1];
    } else if (channels === 3) {
      rgba[dst] = pixels[src];
      rgba[dst + 1] = pixels[src + 1];
      rgba[dst + 2] = pixels[src + 2];
      rgba[dst + 3] = 255;
    } else {
      pixels.copy(rgba, dst, src, src + 4);
    }
  }

  return { width, height, rgba };
}

// --- Encoding -------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Sampling -------------------------------------------------------------

/** Average colour of a source rectangle. Returns [r, g, b]. */
export function sampleRegion(source, sx0, sy0, sx1, sy1) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let sy = sy0; sy < sy1; sy++) {
    for (let sx = sx0; sx < sx1; sx++) {
      const i = (sy * source.width + sx) * 4;
      r += source.rgba[i];
      g += source.rgba[i + 1];
      b += source.rgba[i + 2];
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

/**
 * Box filter: every destination pixel averages all source pixels it covers.
 * Point sampling at these reduction ratios would alias thin strokes into
 * noise, which is exactly what a logo is made of.
 */
export function cropAndResample(source, crop, outW, outH) {
  const out = Buffer.alloc(outW * outH * 4);
  const { x0, y0, w, h } = crop;

  for (let dy = 0; dy < outH; dy++) {
    const sy0 = y0 + Math.floor((dy * h) / outH);
    const sy1 = Math.max(sy0 + 1, y0 + Math.floor(((dy + 1) * h) / outH));
    for (let dx = 0; dx < outW; dx++) {
      const sx0 = x0 + Math.floor((dx * w) / outW);
      const sx1 = Math.max(sx0 + 1, x0 + Math.floor(((dx + 1) * w) / outW));
      const [r, g, b] = sampleRegion(source, sx0, sy0, sx1, sy1);
      const dst = (dy * outW + dx) * 4;
      out[dst] = Math.round(r);
      out[dst + 1] = Math.round(g);
      out[dst + 2] = Math.round(b);
      out[dst + 3] = 255;
    }
  }
  return out;
}

/** Largest centred crop of `source` matching the target aspect ratio. */
export function centredCropForAspect(source, outW, outH) {
  const target = outW / outH;
  const sourceAspect = source.width / source.height;
  if (target > sourceAspect) {
    const h = Math.round(source.width / target);
    return { x0: 0, y0: Math.round((source.height - h) / 2), w: source.width, h };
  }
  const w = Math.round(source.height * target);
  return { x0: Math.round((source.width - w) / 2), y0: 0, w, h: source.height };
}
