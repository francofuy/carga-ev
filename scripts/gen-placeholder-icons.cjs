const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c, table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData), 0);
  return Buffer.concat([len, typeData, crc]);
}

// Draws a rounded-square icon: accent bg (#1F8FE0) + simple white bolt glyph, with `pad` px of transparent-ish margin for maskable safe zone (we fill margin with bg color too since iOS ignores maskable but Android wants full bleed bg).
function makeIcon(size, pad) {
  const px = new Uint8Array(size * size * 4);
  const accent = [0x1f, 0x8f, 0xe0, 255];
  const white = [255, 255, 255, 255];

  function setPx(x, y, c) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = c[0]; px[i+1] = c[1]; px[i+2] = c[2]; px[i+3] = c[3];
  }

  const r = Math.round(size * 0.22);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rounded rect mask
      let inside = true;
      const insetX = x < r ? r - x : (x > size - 1 - r ? x - (size - 1 - r) : 0);
      const insetY = y < r ? r - y : (y > size - 1 - r ? y - (size - 1 - r) : 0);
      if (insetX > 0 && insetY > 0 && insetX * insetX + insetY * insetY > r * r) inside = false;
      setPx(x, y, inside ? accent : [0,0,0,0]);
    }
  }

  // simple bolt polygon (zigzag) scaled to icon, in white
  const s = size;
  const bolt = [
    [0.56, 0.16], [0.30, 0.54], [0.46, 0.54],
    [0.40, 0.86], [0.70, 0.44], [0.52, 0.44]
  ].map(([fx, fy]) => [fx * s, fy * s]);

  function pointInPoly(px_, py_, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > py_) !== (yj > py_)) && (px_ < (xj - xi) * (py_ - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (pointInPoly(x + 0.5, y + 0.5, bolt)) setPx(x, y, white);
    }
  }

  const rowBytes = size * 4;
  const raw = Buffer.alloc((rowBytes + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (rowBytes + 1)] = 0;
    Buffer.from(px.buffer, y * rowBytes, rowBytes).copy(raw, y * (rowBytes + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), makeIcon(size));
}
console.log('Placeholder icons generados en public/icons/');
