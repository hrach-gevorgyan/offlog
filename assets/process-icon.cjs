// Flood-fill BFS from all 4 corners to make connected white pixels transparent
const sharp = require('../offlog-app/node_modules/sharp');
const path = require('path');

const SRC  = path.join(__dirname, 'icon-source.png');
const OUT_FG = path.join(__dirname, 'icon-foreground.png');
const OUT_ONLY = path.join(__dirname, 'icon-only.png');
const OUT_BG = path.join(__dirname, 'icon-background.png');

const THRESHOLD = 235; // pixels brighter than this treated as "white bg"

async function removeWhiteBg(inputPath, outputPath) {
  const img = sharp(inputPath);
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const visited = new Uint8Array(width * height);
  const queue = [];

  function isWhite(idx) {
    return data[idx] >= THRESHOLD && data[idx+1] >= THRESHOLD && data[idx+2] >= THRESHOLD;
  }

  function enqueue(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (visited[i]) return;
    const idx = i * channels;
    if (!isWhite(idx)) return;
    visited[i] = 1;
    queue.push([x, y]);
  }

  // Seed from all 4 corners and edges
  for (let x = 0; x < width; x++) { enqueue(x, 0); enqueue(x, height-1); }
  for (let y = 0; y < height; y++) { enqueue(0, y); enqueue(width-1, y); }

  let qi = 0;
  while (qi < queue.length) {
    const [x, y] = queue[qi++];
    const idx = (y * width + x) * channels;
    data[idx+3] = 0; // make transparent
    enqueue(x-1, y); enqueue(x+1, y); enqueue(x, y-1); enqueue(x, y+1);
  }

  await sharp(Buffer.from(data), { raw: { width, height, channels } })
    .png()
    .toFile(outputPath);

  console.log('Written:', outputPath);
}

async function main() {
  await removeWhiteBg(SRC, OUT_FG);
  await removeWhiteBg(SRC, OUT_ONLY);

  // Solid dark background for icon-background.png
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 28, g: 31, b: 38, alpha: 1 } } })
    .png().toFile(OUT_BG);
  console.log('Written:', OUT_BG);
  console.log('Done!');
}

main().catch(console.error);
