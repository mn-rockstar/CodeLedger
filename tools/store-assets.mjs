// Generates the Chrome Web Store marketing artwork from the logo.
//
// Run with: npm run store-assets
//
// NOTE ON SCREENSHOTS: this tool deliberately does NOT produce them. Store
// policy requires screenshots show the extension actually running, and a
// synthesized image that merely looks like the popup would misrepresent the
// product. Take those yourself — a full browser window with the popup open,
// sized to 1280×800. The backdrop below is offered only as something to
// composite a real capture onto.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  centredCropForAspect,
  cropAndResample,
  decodePng,
  encodePng,
  sampleRegion,
} from "./png.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = decodePng(readFileSync(path.join(root, "assets", "logo.png")));
const outDir = path.join(root, "store-assets");
mkdirSync(outDir, { recursive: true });

console.log(`source logo: ${source.width}×${source.height}`);

/**
 * Tiles crop to the target aspect rather than letterboxing, so the artwork
 * fills the frame with no dead bars. The marquee's 2.5:1 takes a horizontal
 * band; because the logo stacks mark over wordmark over tagline, the band is
 * nudged to keep all three rather than centring blindly on the mark.
 */
const TILES = [
  { name: "promo-small-440x280.png", w: 440, h: 280 },
  { name: "promo-marquee-1400x560.png", w: 1400, h: 560, bandCentre: 0.5 },
];

for (const tile of TILES) {
  let crop = centredCropForAspect(source, tile.w, tile.h);
  if (tile.bandCentre !== undefined) {
    const y0 = Math.round(source.height * tile.bandCentre - crop.h / 2);
    crop = { ...crop, y0: Math.max(0, Math.min(source.height - crop.h, y0)) };
  }
  const rgba = cropAndResample(source, crop, tile.w, tile.h);
  writeFileSync(path.join(outDir, tile.name), encodePng(tile.w, tile.h, rgba));
  console.log(`wrote store-assets/${tile.name}  (${tile.w}×${tile.h})`);
}

// The 128×128 store icon is the same mark as the packaged icon, so reuse it
// rather than re-deriving it and risking the two drifting apart.
writeFileSync(
  path.join(outDir, "store-icon-128.png"),
  readFileSync(path.join(root, "icons", "icon-128.png"))
);
console.log("wrote store-assets/store-icon-128.png  (128×128)");

// --- Screenshot backdrop --------------------------------------------------
//
// A plain branded gradient at the exact size the store wants, for compositing
// a real popup capture onto. Colours are sampled from the logo itself so it
// sits in the same family as everything else.

const BACKDROP = { w: 1280, h: 800 };
const top = sampleRegion(source, 40, 40, 140, 140);
const bottom = sampleRegion(
  source,
  source.width - 140,
  source.height - 140,
  source.width - 40,
  source.height - 40
);

const backdrop = Buffer.alloc(BACKDROP.w * BACKDROP.h * 4);
for (let y = 0; y < BACKDROP.h; y++) {
  for (let x = 0; x < BACKDROP.w; x++) {
    // Diagonal blend, matching the popup's 160deg gradient direction.
    const t = (x / BACKDROP.w) * 0.35 + (y / BACKDROP.h) * 0.65;
    const i = (y * BACKDROP.w + x) * 4;
    for (let c = 0; c < 3; c++) {
      backdrop[i + c] = Math.round(top[c] * (1 - t) + bottom[c] * t);
    }
    backdrop[i + 3] = 255;
  }
}
writeFileSync(
  path.join(outDir, "screenshot-backdrop-1280x800.png"),
  encodePng(BACKDROP.w, BACKDROP.h, backdrop)
);
console.log(
  `wrote store-assets/screenshot-backdrop-1280x800.png  (${BACKDROP.w}×${BACKDROP.h})`
);
