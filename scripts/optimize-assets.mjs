import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

// Only generated deployment copies are modified; source artwork stays untouched.
const targets = [
  "logo.jpeg",
  "favicon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable.png",
  "icons/apple-touch-icon.png",
  "crying_teddy.gif",
  "happy_teddy.gif",
  "crying_teddy-still.png",
  "happy_teddy-still.png",
];
let before = 0;
let after = 0;
for (const file of targets) {
  const path = ".output/public/" + file;
  const input = await readFile(path);
  const animated = file.endsWith(".gif");
  const image = sharp(input, { animated });
  const metadata = await image.metadata();
  let optimized;
  if (file === "logo.jpeg")
    optimized = await image
      .rotate()
      .resize({ width: 384, withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
  else if (animated)
    optimized = await image
      .resize({ width: 320, withoutEnlargement: true })
      .gif({ effort: 7, colours: 128, dither: 0.5, delay: metadata.delay, loop: metadata.loop })
      .toBuffer();
  else if (file === "icons/icon-maskable.png") {
    // Insets keep the essential logo/text inside Android's central safe circle.
    const background = await sharp(input)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer();
    optimized = await image
      .resize(448, 448)
      .extend({
        top: 32,
        bottom: 32,
        left: 32,
        right: 32,
        background: { r: background[0], g: background[1], b: background[2], alpha: 1 },
      })
      .png({ compressionLevel: 9, palette: true, quality: 95, effort: 8 })
      .toBuffer();
  } else
    optimized = await image
      .resize(
        file === "favicon.png"
          ? { width: 64, height: 64 }
          : file.includes("teddy")
            ? { width: 320, withoutEnlargement: true }
            : undefined,
      )
      .png({ compressionLevel: 9, palette: true, quality: 95, effort: 8 })
      .toBuffer();
  if (optimized.length < input.length) await writeFile(path, optimized);
  before += input.length;
  after += Math.min(input.length, optimized.length);
  console.log(`${file}: ${input.length} → ${Math.min(input.length, optimized.length)} bytes`);
}
// Enforce declared icon dimensions, including Apple's separate launch icon.
for (const [file, size] of [
  ["favicon.png", 64],
  ["icons/icon-192.png", 192],
  ["icons/icon-512.png", 512],
  ["icons/icon-maskable.png", 512],
  ["icons/apple-touch-icon.png", 180],
]) {
  const metadata = await sharp(".output/public/" + file).metadata();
  if (metadata.width !== size || metadata.height !== size)
    throw new Error(`Invalid PWA icon dimensions: ${file}`);
}
console.log(`Gameplay artwork: ${(before / 1024).toFixed(1)} → ${(after / 1024).toFixed(1)} KiB`);
