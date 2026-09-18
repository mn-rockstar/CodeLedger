// Builds the extension's square PNG icons out of the CodeLedger logo artwork.
//
// Run with: node tools/logo-icons.mjs
//
// The source art is a wide lockup (terminal mark + wordmark + tagline).
// Squashing all of that into a 16px square would turn the wordmark into a
// grey smear, so this crops the square terminal mark out of the middle and
// scales only that. Decoding, cropping and resampling are all done by hand
// here — there's no image library in the project, and adding one for four
// icons isn't worth the dependency.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { decodePng, encodePng, sampleRegion } from "./png.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = path.join(root, "assets", "logo.png");
const outDir = path.join(root, "icons");
const SIZES = [16, 32, 48, 128];

// Bounding box of the terminal mark alone, as fractions of the source image
// so the numbers survive the artwork being re-exported at another
// resolution. The mark is about 1.39:1, so a square crop wide enough to hold
// it would reach down into the wordmark — instead it's letterboxed onto a
// square tile below.
const MARK = { left: 0.3496, top: 0.2207, right: 0.651, bottom: 0.5469 };

// At 16px the window frame and traffic lights collapse into an unreadable
// blob, so the smallest icon crops to the `>_` prompt alone — the one part
// of the mark that still carries meaning at that size.
const GLYPH = { left: 0.3906, top: 0.3564, right: 0.4948, bottom: 0.4785 };
const GLYPH_MAX_SIZE = 16;

/** Share of the tile left as breathing room on the mark's longest axis. */
const PADDING = 0.09;
/** Corner rounding, as a share of the tile's side. */
const CORNER_RADIUS = 0.2;
/** Where to sample the artwork's background colour (fractions of the source). */
const BACKGROUND_SAMPLE = { x: 0.5, y: 0.12 };

/** Signed distance to a rounded square filling the whole tile. */
function roundedSquareDistance(x, y, radius) {
  const half = 0.5 - radius;
  const qx = Math.abs(x - 0.5) - half;
  const qy = Math.abs(y - 0.5) - half;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return Math.min(Math.max(qx, qy), 0) + outside - radius;
}

function renderIcon(source, size) {
  const region = size <= GLYPH_MAX_SIZE ? GLYPH : MARK;
  const markX0 = Math.round(region.left * source.width);
  const markY0 = Math.round(region.top * source.height);
  const markX1 = Math.round(region.right * source.width);
  const markY1 = Math.round(region.bottom * source.height);
  const markW = markX1 - markX0;
  const markH = markY1 - markY0;

  // Fit the mark inside the padded tile, preserving its aspect ratio.
  const box = size * (1 - 2 * PADDING);
  const scale = Math.min(box / markW, box / markH);
  const drawW = markW * scale;
  const drawH = markH * scale;
  const originX = (size - drawW) / 2;
  const originY = (size - drawH) / 2;

  const bg = sampleRegion(
    source,
    Math.round(BACKGROUND_SAMPLE.x * source.width),
    Math.round(BACKGROUND_SAMPLE.y * source.height),
    Math.round(BACKGROUND_SAMPLE.x * source.width) + 8,
    Math.round(BACKGROUND_SAMPLE.y * source.height) + 8
  );

  const out = Buffer.alloc(size * size * 4);
  const SS = 4; // supersampling for the rounded corner mask

  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      let colour = bg;

      // Inside the mark's placement rect, sample the artwork instead.
      if (
        dx + 1 > originX &&
        dx < originX + drawW &&
        dy + 1 > originY &&
        dy < originY + drawH
      ) {
        const sx0 = markX0 + Math.floor(((dx - originX) / drawW) * markW);
        const sy0 = markY0 + Math.floor(((dy - originY) / drawH) * markH);
        const sx1 = Math.min(
          markX1,
          Math.max(sx0 + 1, markX0 + Math.ceil(((dx + 1 - originX) / drawW) * markW))
        );
        const sy1 = Math.min(
          markY1,
          Math.max(sy0 + 1, markY0 + Math.ceil(((dy + 1 - originY) / drawH) * markH))
        );
        if (sx0 >= markX0 && sy0 >= markY0 && sx1 > sx0 && sy1 > sy0) {
          colour = sampleRegion(source, sx0, sy0, sx1, sy1);
        }
      }

      // Rounded-corner alpha, supersampled so the curve isn't stair-stepped.
      let covered = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (dx + (sx + 0.5) / SS) / size;
          const y = (dy + (sy + 0.5) / SS) / size;
          if (roundedSquareDistance(x, y, CORNER_RADIUS) < 0) covered++;
        }
      }

      const dst = (dy * size + dx) * 4;
      out[dst] = Math.round(colour[0]);
      out[dst + 1] = Math.round(colour[1]);
      out[dst + 2] = Math.round(colour[2]);
      out[dst + 3] = Math.round((covered / (SS * SS)) * 255);
    }
  }

  return out;
}

const source = decodePng(readFileSync(SOURCE));
mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  writeFileSync(
    path.join(outDir, `icon-${size}.png`),
    encodePng(size, size, renderIcon(source, size))
  );
  console.log(`wrote icons/icon-${size}.png`);
}
