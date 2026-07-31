// Roadmap "polish visuals" pass (2026-07-31) — generates the Windows NSIS
// installer's welcome/finish sidebar image from the same
// resources/source-logo.svg every other platform icon comes from, instead
// of shipping Tauri/NSIS's generic default installer chrome. Not part of
// the build pipeline; run manually (`node resources/generate-installer-art.cjs`
// from offlog-app/) whenever the logo or brand color changes, same
// convention as generate-icons.cjs/generate-splash.cjs.
//
// No header banner: tried a dark 150x57 MUI_HEADERIMAGE_BITMAP first
// (owner live-tested 2026-07-31), but NSIS renders it at its native size
// in the header control's top-left corner and fills the rest of that
// bar with the page's plain white background — there's no supported
// MUI2 define to recolor that remainder (MUI_BGCOLOR/MUI_TEXTCOLOR are a
// Classic-UI-only leftover, not read by Modern UI 2's Directory/
// Components/Install pages at all), so a dark header image reads as a
// clashing dark square against white rather than a themed banner.
// Dropped rather than half-fixed; the sidebar (Welcome/Finish pages,
// no such split-background problem) carries the brand instead.
//
// NSIS's `Header image`/`Wizard image` slots require classic uncompressed
// 24-bit BMP (no alpha channel) — sharp has no BMP encoder, so this writes
// a minimal BITMAPFILEHEADER/BITMAPINFOHEADER by hand around a flattened
// raw RGB buffer (bottom-up row order, each row padded to a 4-byte
// boundary, BGR channel order — all classic BMP requirements, not
// optional).
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const BG = { r: 0x18, g: 0x1a, b: 0x20, alpha: 1 };      // colorPrimaryDark / tauri.conf.json window backgroundColor
const ACCENT = { r: 0x54, g: 0x57, b: 0xe0, alpha: 1 };  // app.css --accent (light) / BRAND.md's only brand color
const SRC = path.join(__dirname, 'source-logo.svg');
const OUT_DIR = path.join(__dirname, '..', '..', 'offlog-desktop', 'src-tauri');

function toBmp24(rgbBuffer, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4; // rows padded to 4-byte boundary
  const pixelArraySize = rowSize * height;
  const fileSize = 14 + 40 + pixelArraySize;
  const buf = Buffer.alloc(fileSize);

  // BITMAPFILEHEADER
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(14 + 40, 10); // pixel data offset

  // BITMAPINFOHEADER
  buf.writeUInt32LE(40, 14);           // header size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);            // planes
  buf.writeUInt16LE(24, 28);           // bits per pixel
  buf.writeUInt32LE(0, 30);            // no compression
  buf.writeUInt32LE(pixelArraySize, 34);
  buf.writeInt32LE(2835, 38);          // 72 DPI
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  // Pixel data: BMP rows go bottom-up, BGR order, padded per row.
  let offset = 14 + 40;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 3;
      buf[offset++] = rgbBuffer[srcIdx + 2]; // B
      buf[offset++] = rgbBuffer[srcIdx + 1]; // G
      buf[offset++] = rgbBuffer[srcIdx];     // R
    }
    offset += rowSize - width * 3; // row padding
  }

  return buf;
}

async function markOn(bg, color, markSize) {
  const { data, info } = await sharp(SRC).resize(markSize, markSize).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) { data[i] = color.r; data[i + 1] = color.g; data[i + 2] = color.b; }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function canvas(width, height, mark, left, top) {
  const { data, info } = await sharp({ create: { width, height, channels: 4, background: BG } })
    .composite([{ input: mark, left, top }])
    .flatten({ background: BG })
    .raw()
    .toBuffer({ resolveWithObject: true });
  // flatten() drops the alpha channel conceptually but raw() can still
  // emit it as an opaque 255 byte depending on sharp/libvips version —
  // normalize to a tightly-packed 3-channel buffer explicitly rather than
  // assuming info.channels === 3.
  if (info.channels === 3) return toBmp24(data, width, height);
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 3) {
    rgb[j] = data[i]; rgb[j + 1] = data[i + 1]; rgb[j + 2] = data[i + 2];
  }
  return toBmp24(rgb, width, height);
}

async function main() {
  // Welcome/finish sidebar — 164x314, mark centered, sized to leave real
  // breathing room (a full-bleed edge-to-edge mark on a tall narrow strip
  // reads as cramped, same lesson as the splash-icon truncation fix).
  const SIDE_W = 164, SIDE_H = 314;
  const sideMarkSize = 96;
  const sideMark = await markOn(BG, ACCENT, sideMarkSize);
  const sideBmp = await canvas(SIDE_W, SIDE_H, sideMark, Math.round((SIDE_W - sideMarkSize) / 2), Math.round((SIDE_H - sideMarkSize) / 2) - 20);
  fs.writeFileSync(path.join(OUT_DIR, 'installer-sidebar.bmp'), sideBmp);

  console.log('Wrote installer-sidebar.bmp to offlog-desktop/src-tauri/.');
}

main().catch(e => { console.error(e); process.exit(1); });
