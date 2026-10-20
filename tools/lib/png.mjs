// A dependency-free PNG encoder (node:zlib only) for tools/viz-preview.mjs.
// 8-bit RGB, no interlace, filter 0 on every row: small enough to read in one
// sitting, and the preview's images are flat phosphor on black, which deflate
// handles fine without per-row filter selection.
import { deflateSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** Encode `rgb` (width*height*3 bytes, row-major) as a PNG Buffer. */
export function encodePNG(width, height, rgb) {
  if (rgb.length !== width * height * 3) throw new Error(`encodePNG: ${rgb.length} bytes for ${width}x${height} RGB`)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0 // 8-bit, truecolour
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A simple RGB canvas for compositing tiles: { w, h, px, blit(src, x, y) }. */
export function canvas(w, h, fill = [0, 0, 0]) {
  const px = new Uint8Array(w * h * 3)
  if (fill.some(Boolean)) for (let i = 0; i < w * h; i++) px.set(fill, i * 3)
  return {
    w, h, px,
    blit(src, x0, y0) {
      for (let y = 0; y < src.h; y++) {
        const dy = y0 + y
        if (dy < 0 || dy >= h) continue
        const n = Math.min(src.w, w - x0) * 3
        if (n > 0) px.set(src.px.subarray(y * src.w * 3, y * src.w * 3 + n), (dy * w + x0) * 3)
      }
    },
  }
}
