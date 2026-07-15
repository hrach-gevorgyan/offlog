// C8 — regenerates every app icon asset from resources/source-logo.svg.
// Not part of the build pipeline; run manually (`node
// resources/generate-icons.cjs` from offlog-app/) whenever the logo or
// brand color changes, then commit the resulting PNGs. Uses `sharp`,
// already present as a transitive dependency of @capacitor/assets.
//
// @capacitor/assets' own `generate` CLI was tried first and rejected: on
// this Windows setup it silently fell back to re-rasterizing the Android
// project's old, unrelated leftover vector-drawable icon
// (drawable/ic_launcher_background.xml, drawable-v24/ic_launcher_
// foreground.xml — now deleted, they were unreferenced by any manifest
// resource lookup) instead of reading resources/icon-foreground.png,
// despite matching its documented default filenames exactly. Writing the
// PNGs directly is simpler and fully under our control.
const sharp = require('sharp');
const path = require('path');

const BRAND = { r: 0x54, g: 0x57, b: 0xe0, alpha: 1 }; // app.css --accent (light) / capacitor.config.ts iconColor / colors.xml colorPrimary
const SRC = path.join(__dirname, 'source-logo.svg');
const ANDROID_RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const WEB_PUBLIC = path.join(__dirname, '..', 'public');

// Recolors the source mark to solid white, preserving its own alpha shape.
// Done via raw pixel manipulation rather than a compositing blend mode:
// extractChannel('alpha') produces a plain *opaque* grayscale image (its
// pixel values carry the old alpha, but the image itself has no alpha
// channel), which silently breaks a 'dest-in'/'in' blend approach.
async function whiteSilhouette(size) {
  const { data, info } = await sharp(SRC).resize(size, size).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function flattenedSquare(canvas, markSize) {
  const mark = await whiteSilhouette(markSize);
  const offset = Math.round((canvas - markSize) / 2);
  return sharp({ create: { width: canvas, height: canvas, channels: 4, background: BRAND } })
    .composite([{ input: mark, left: offset, top: offset }])
    .png().toBuffer();
}

// Adaptive icon canvas sizes (108dp) per density.
const ADAPTIVE = { 'mipmap-ldpi': 81, 'mipmap-mdpi': 108, 'mipmap-hdpi': 162, 'mipmap-xhdpi': 216, 'mipmap-xxhdpi': 324, 'mipmap-xxxhdpi': 432 };
// Legacy square launcher icon canvas sizes (48dp) per density.
const LEGACY = { 'mipmap-ldpi': 36, 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192 };
// Notification/status-bar icon sizes — MUST be a white silhouette with
// transparency (CLAUDE.md's documented gotcha: a full-color icon gets
// silently substituted with a generic triangle by the OS).
const NOTIFICATION = { 'drawable': 24, 'drawable-mdpi': 24, 'drawable-hdpi': 36, 'drawable-xhdpi': 48, 'drawable-xxhdpi': 72, 'drawable-xxxhdpi': 96 };

async function main() {
  // Android adaptive icon layers — mark at 66% of canvas (the mask-safe
  // zone), centered, transparent foreground + solid brand background.
  for (const [dir, canvas] of Object.entries(ADAPTIVE)) {
    const markSize = Math.round(canvas * 0.66);
    const mark = await whiteSilhouette(markSize);
    const offset = Math.round((canvas - markSize) / 2);
    await sharp({ create: { width: canvas, height: canvas, channels: 4, background: BRAND } })
      .png().toFile(path.join(ANDROID_RES, dir, 'ic_launcher_background.png'));
    await sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: mark, left: offset, top: offset }])
      .png().toFile(path.join(ANDROID_RES, dir, 'ic_launcher_foreground.png'));
  }

  // Android legacy square + round launcher icons — mark at 78% of canvas.
  // Round uses the same flattened square artwork; the launcher applies
  // its own circular mask on top (same convention this project's
  // mipmap-anydpi-v26/ic_launcher_round.xml already relies on).
  for (const [dir, canvas] of Object.entries(LEGACY)) {
    const flattened = await flattenedSquare(canvas, Math.round(canvas * 0.78));
    await sharp(flattened).toFile(path.join(ANDROID_RES, dir, 'ic_launcher.png'));
    await sharp(flattened).toFile(path.join(ANDROID_RES, dir, 'ic_launcher_round.png'));
  }

  // Android notification icon.
  for (const [dir, size] of Object.entries(NOTIFICATION)) {
    const buf = await whiteSilhouette(size);
    await sharp(buf).toFile(path.join(ANDROID_RES, dir, 'ic_stat_notify.png'));
  }

  // Web favicons (index.html references icon-512.png for both
  // rel="icon" and apple-touch-icon).
  const webFlattened = await flattenedSquare(1024, Math.round(1024 * 0.78));
  await sharp(webFlattened).resize(512, 512).png().toFile(path.join(WEB_PUBLIC, 'icon-512.png'));
  await sharp(webFlattened).resize(192, 192).png().toFile(path.join(WEB_PUBLIC, 'icon-192.png'));

  // resources/ reference copies — not read by any build step, just handy
  // to have alongside source-logo.svg for anyone touching this later.
  await sharp(await whiteSilhouette(1024)).toFile(path.join(__dirname, 'icon-foreground.png'));
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BRAND } }).png().toFile(path.join(__dirname, 'icon-background.png'));
  await sharp(webFlattened).toFile(path.join(__dirname, 'icon.png'));

  // Desktop (offlog-desktop/Tauri) icon source — Windows has no adaptive-
  // icon masking like Android's, so a hard-square source renders with
  // sharp corners in the taskbar/Start menu (owner-reported, first real-
  // install dogfooding session, 2026-07-15). Baking a ~22%-radius rounded
  // rect directly into the source (Fluent/Windows-11-style squircle,
  // roughly matching the corner ratio Windows' own built-in app icons
  // use) is the only reliable fix since there's no OS-level mask to rely
  // on the way Android's adaptive icon system provides one. Regenerate
  // offlog-desktop's actual .ico/.icns/PNG set afterwards with:
  //   cd offlog-desktop/src-tauri && cargo tauri icon
  //     ../../offlog-app/resources/icon-512-rounded.png
  const desktopSize = 512;
  const desktopRadius = Math.round(desktopSize * 0.22);
  const roundedRectMask = Buffer.from(
    `<svg width="${desktopSize}" height="${desktopSize}"><rect width="${desktopSize}" height="${desktopSize}" rx="${desktopRadius}" ry="${desktopRadius}"/></svg>`
  );
  await sharp(webFlattened)
    .resize(desktopSize, desktopSize)
    .composite([{ input: roundedRectMask, blend: 'dest-in' }])
    .png()
    .toFile(path.join(__dirname, 'icon-512-rounded.png'));

  console.log('Icons generated: Android adaptive + legacy launcher icons, Android notification icon, web favicons, desktop rounded-corner source, resources/ reference copies.');
}

main().catch(e => { console.error(e); process.exit(1); });
