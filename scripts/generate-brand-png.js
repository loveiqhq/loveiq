/**
 * Generates apple-touch-icon.png and email-logo PNG from the new dot-cluster mark.
 * Run: node scripts/generate-brand-png.js
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const markSvg = fs.readFileSync(path.join(root, "public", "images", "loveiq-mark.svg"), "utf8");

async function compose(size, background, outputPath) {
  // Inset the mark to ~70% of canvas, center it
  const inset = Math.round(size * 0.15);
  const innerW = size - inset * 2;
  const aspect = 150 / 132.281;
  let drawW = innerW;
  let drawH = Math.round(innerW / aspect);
  if (drawH > innerW) {
    drawH = innerW;
    drawW = Math.round(innerW * aspect);
  }
  const offsetX = Math.round((size - drawW) / 2);
  const offsetY = Math.round((size - drawH) / 2);

  const markPng = await sharp(Buffer.from(markSvg))
    .resize({
      width: drawW,
      height: drawH,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: markPng, top: offsetY, left: offsetX }])
    .png()
    .toFile(outputPath);

  console.log(`Wrote ${outputPath}`);
}

(async () => {
  await compose(
    180,
    { r: 11, g: 6, b: 19, alpha: 1 },
    path.join(root, "public", "apple-touch-icon.png")
  );
  await compose(
    512,
    { r: 11, g: 6, b: 19, alpha: 1 },
    path.join(root, "public", "images", "loveiq-mark-512.png")
  );
})();
