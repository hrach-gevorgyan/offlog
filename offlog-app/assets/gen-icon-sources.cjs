// One-off script: rasterize assets/icon.svg into the source PNGs the
// @capacitor/assets generator (and the PWA/notification/splash steps)
// expect. Not part of the build — run manually when the icon changes.
// sharp isn't a project dependency (kept out of package.json on purpose,
// same as other generation-only tooling) — `npm install --no-save sharp`
// before running this.
const sharp = require('../node_modules/sharp');
const fs = require('fs');

const svgPath = 'assets/icon.svg';
const svgFull = fs.readFileSync(svgPath, 'utf8');
// Foreground-only: same SVG minus the first <g> (the off-white background
// shape) so the adaptive-icon foreground layer renders on transparency.
const svgForeground = svgFull.replace(/<g fill="#f4f3f4">[\s\S]*?<\/g>\s*/, '');

const BG_COLOR = { r: 0xf4, g: 0xf3, b: 0xf4, alpha: 1 };

async function main() {
  // Full icon (background shape + monogram) — used for the PWA icons and
  // splash-screen source composite.
  await sharp(Buffer.from(svgFull), { density: 600 })
    .resize(1024, 1024)
    .png()
    .toFile('assets/icon-only.png');

  // Foreground only (transparent) — adaptive icon foreground layer
  await sharp(Buffer.from(svgForeground), { density: 600 })
    .resize(1024, 1024)
    .png()
    .toFile('assets/icon-foreground.png');

  // Solid background matching the icon's own off-white
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG_COLOR } })
    .png()
    .toFile('assets/icon-background.png');

  console.log('icon sources regenerated');
}

main().catch(e => { console.error(e); process.exit(1); });
