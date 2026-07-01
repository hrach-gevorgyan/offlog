const sharp = require('../node_modules/sharp');

async function removeWhiteBgFloodFill(src, dest) {
  const { data, info } = await sharp(src)
    .resize(1024, 1024)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const visited = new Uint8Array(width * height);

  function idx(x, y) { return (y * width + x) * 4; }
  function isWhitish(x, y) {
    const i = idx(x, y);
    return data[i] > 200 && data[i+1] > 200 && data[i+2] > 200;
  }

  // BFS flood fill from all 4 corners
  const queue = [[0,0],[width-1,0],[0,height-1],[width-1,height-1]];
  while (queue.length) {
    const [x, y] = queue.pop();
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const vi = y * width + x;
    if (visited[vi]) continue;
    if (!isWhitish(x, y)) continue;
    visited[vi] = 1;
    data[idx(x,y) + 3] = 0; // transparent
    queue.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }

  await sharp(Buffer.from(data), {
    raw: { width, height, channels: 4 }
  }).png().toFile(dest);
  console.log('wrote', dest);
}

async function main() {
  const src = 'assets/icon-source.png.png';
  await removeWhiteBgFloodFill(src, 'assets/icon-foreground.png');
  await removeWhiteBgFloodFill(src, 'assets/icon-only.png');
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  }).png().toFile('assets/icon-background.png');
  console.log('all done');
}

main().catch(console.error);
