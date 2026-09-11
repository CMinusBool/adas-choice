// A small PNG reader and writer, in nothing but Node's own zlib.
//
// The repository has no image toolchain — no Pillow, no sharp, no ImageMagick —
// and this project is not going to grow a native dependency to cut four
// rectangles out of four Character Sheets. Everything here is 8-bit RGB or RGBA,
// non-interlaced, which is what the sheets are and what the sprite sheets need.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value;
  }
  return table;
})();

function crc32(bytes) {
  let value = -1;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ -1) >>> 0;
}

/** Undo one scanline's filter, in place, against the line above it. */
function unfilter(type, line, previous, step) {
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let index = 0; index < line.length; index++) {
    const left = index >= step ? line[index - step] : 0;
    const up = previous ? previous[index] : 0;
    const upLeft = previous && index >= step ? previous[index - step] : 0;
    if (type === 1) line[index] = (line[index] + left) & 0xff;
    else if (type === 2) line[index] = (line[index] + up) & 0xff;
    else if (type === 3) line[index] = (line[index] + ((left + up) >> 1)) & 0xff;
    else if (type === 4) line[index] = (line[index] + paeth(left, up, upLeft)) & 0xff;
    else if (type !== 0) throw new Error(`Unknown PNG filter ${type}.`);
  }
}

/** Read a PNG into `{ width, height, data }`, where `data` is RGBA bytes. */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG.');
  let header = null;
  const parts = [];
  for (let offset = 8; offset < buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === 'IDAT') parts.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!header) throw new Error('PNG has no header.');
  if (header.depth !== 8 || header.interlace !== 0 || (header.colorType !== 2 && header.colorType !== 6)) {
    throw new Error(`Unsupported PNG: depth ${header.depth}, colour type ${header.colorType}, interlace ${header.interlace}.`);
  }

  const channels = header.colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(parts));
  const stride = header.width * channels;
  const data = Buffer.alloc(header.width * header.height * 4, 255);
  let previous = null;
  for (let row = 0; row < header.height; row++) {
    const start = row * (stride + 1);
    const line = Buffer.from(raw.subarray(start + 1, start + 1 + stride));
    unfilter(raw[start], line, previous, channels);
    previous = line;
    for (let column = 0; column < header.width; column++) {
      const to = (row * header.width + column) * 4;
      const from = column * channels;
      data[to] = line[from];
      data[to + 1] = line[from + 1];
      data[to + 2] = line[from + 2];
      data[to + 3] = channels === 4 ? line[from + 3] : 255;
    }
  }
  return { width: header.width, height: header.height, data };
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

/** Write an RGBA image back out as a PNG. */
export function encodePng({ width, height, data }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let row = 0; row < height; row++) {
    // Filter 0 throughout: these are small images and deflate does the work.
    data.copy(raw, row * (width * 4 + 1) + 1, row * width * 4, (row + 1) * width * 4);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A blank RGBA image, fully transparent. */
export function blank(width, height) {
  return { width, height, data: Buffer.alloc(width * height * 4, 0) };
}
