// Regenerates every legacy Android splash.png (drawable*/splash.png) from
// resources/source-logo.svg. Not part of the build pipeline; run manually
// (`node resources/generate-splash.cjs` from offlog-app/) whenever the
// logo or brand color changes, same convention as generate-icons.cjs.
//
// Run this whenever the mark changes: generate-icons.cjs regenerates the
// launcher/notification icons but never touches these, so they go stale
// silently. On API 31+ (targetSdk 36, nearly every real device)
// styles.xml's windowSplashScreenBackground/windowSplashScreenAnimatedIcon
// take over, but these remain the pre-API-31 fallback
// (android:background). Matches
// colorPrimaryDark (#181a20, styles.xml's windowSplashScreenBackground)
// so the legacy fallback looks identical to the modern splash instead of
// just less-wrong.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const BRAND_BG = { r: 0x18, g: 0x1a, b: 0x20, alpha: 1 }; // colorPrimaryDark
const SRC = path.join(__dirname, 'source-logo.svg');
const ANDROID_RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

async function whiteSilhouette(size) {
  const { data, info } = await sharp(SRC).resize(size, size).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function splashAt(width, height) {
  const markSize = Math.round(Math.min(width, height) * 0.32);
  const mark = await whiteSilhouette(markSize);
  const left = Math.round((width - markSize) / 2);
  const top = Math.round((height - markSize) / 2);
  return sharp({ create: { width, height, channels: 4, background: BRAND_BG } })
    .composite([{ input: mark, left, top }])
    .png().toBuffer();
}

// The splash icon is a dedicated asset, not the launcher foreground. API
// 31+ (targetSdk 36, nearly every real device) ignores
// drawable*/splash.png and uses styles.xml's
// windowSplashScreenAnimatedIcon. Pointing that at @mipmap/ic_launcher_
// foreground renders the logo shrunk: that asset is sized FOR THE
// LAUNCHER (mark at 66% of canvas, generate-icons.cjs — the safe-zone
// convention adaptive icons need so the OS mask never clips the mark),
// and AndroidX's SplashScreen API applies its own additional inset on
// top of whatever icon it's given, assuming the same
// safe-zone convention — stacking two rounds of padding shrinks an
// already-padded foreground-only image well below where it reads as a
// normal logo. Fix: a dedicated splash-only icon, transparent background
// (the system composites it over windowSplashScreenBackground itself).
// 78% is bounded on both sides: 66% (the launcher ratio) renders too
// small here, and 92% is truncated by the API's circular mask. Re-verify
// on a real device before changing it.
async function splashIcon(size) {
  const markSize = Math.round(size * 0.78);
  const mark = await whiteSilhouette(markSize);
  const offset = Math.round((size - markSize) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, left: offset, top: offset }])
    .png().toBuffer();
}

async function main() {
  const dirs = fs.readdirSync(ANDROID_RES).filter(d => fs.existsSync(path.join(ANDROID_RES, d, 'splash.png')));
  for (const dir of dirs) {
    const file = path.join(ANDROID_RES, dir, 'splash.png');
    const { width, height } = await sharp(file).metadata();
    const buf = await splashAt(width, height);
    await sharp(buf).toFile(file);
  }

  const iconBuf = await splashIcon(480);
  await sharp(iconBuf).toFile(path.join(ANDROID_RES, 'drawable', 'splash_icon.png'));

  console.log(`Regenerated ${dirs.length} legacy splash.png variants and drawable/splash_icon.png from source-logo.svg.`);
}

main().catch(e => { console.error(e); process.exit(1); });
