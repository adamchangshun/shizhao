// Test fixtures are generated in code (solid-colour images with synthetic EXIF/GPS); no real photos.
import sharp from 'sharp'

function solid(width: number, height: number, background: string) {
  return sharp({ create: { width, height, channels: 3, background } })
}

/** 64×48 JPEG carrying camera EXIF and a GPS position (31.2304 N, 121.4737 E). */
export function jpegWithGps(): Promise<Buffer> {
  return solid(64, 48, '#c04030')
    .withExif({
      IFD0: { Make: 'FixtureCam', Model: 'F1', Software: 'fixture' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '31/1 13/1 4944/100',
        GPSLongitudeRef: 'E',
        GPSLongitude: '121/1 28/1 2532/100',
      },
    })
    .jpeg()
    .toBuffer()
}

/** 600×400 stored pixels with EXIF orientation 6 (display needs a 90° clockwise turn). */
export function jpegOrientation6(): Promise<Buffer> {
  return solid(600, 400, '#3060c0').withMetadata({ orientation: 6 }).jpeg().toBuffer()
}

export function png(width: number, height: number, background = '#20a060'): Promise<Buffer> {
  return solid(width, height, background).png({ compressionLevel: 9 }).toBuffer()
}

export function jpeg(width: number, height: number, background: string): Promise<Buffer> {
  return solid(width, height, background).jpeg().toBuffer()
}

export function gif(): Promise<Buffer> {
  return solid(16, 16, '#ffcc00').gif().toBuffer()
}

export const SVG_TEXT = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
)
export const HTML_TEXT = Buffer.from(
  '<!doctype html><html><body><script>alert(1)</script></body></html>',
)
export const PDF_HEAD = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(256, 0x20)])

/** Valid JPEG start-of-image marker followed by garbage: passes the sniff, fails to decode. */
export function corruptJpeg(): Buffer {
  const garbage = Buffer.alloc(4096)
  for (let i = 0; i < garbage.length; i++) garbage[i] = (i * 131 + 7) % 251
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), garbage])
}

/** JPEG magic plus zero padding to exactly `bytes`; only the upload size limit matters here. */
export function oversizeJpeg(bytes: number): Buffer {
  const buf = Buffer.alloc(bytes)
  buf.set([0xff, 0xd8, 0xff, 0xe0])
  return buf
}

/** Writes a 10000×10000 PNG (100M pixels) to `file`; libvips streams it, so this stays small. */
export async function writeHugePng(file: string): Promise<void> {
  await solid(10_000, 10_000, '#ffffff').png({ compressionLevel: 9 }).toFile(file)
}

/**
 * 300×200 solid-colour HEIC (HEVC), no EXIF. No HEVC encoder is available from code on Linux, so
 * this synthetic image was produced once from fx.jpeg(300, 200, '#8040a0') with macOS
 * `sips -s format heic` and embedded here; it contains no photo and no personal data.
 */
const SYNTHETIC_HEIC_BASE64 =
  'AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABhW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAA' +
  'AAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAA' +
  'AQAAABVpbmZlAgAAAAABAABodmMxAAAAAOVpcHJwAAAAxGlwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAA' +
  'FGlzcGUAAAAAAAABLAAAAMgAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAcGh2Y0MBA3AAAACwAAAAAAA88AD8/fj4AAAL' +
  'A6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwA8cCShAAEAIkIBAQNwAAADALAAAAMAAAMAPKAJiA0dy4h7kWVTcCAgYAiiAAEA' +
  'CUQBwGFyyERTZAAAABlpcG1hAAAAAAAAAAEAAQaBAgMFhoQAAAAeaWxvYwAAAABEAAABAAEAAAABAAABuQAAAGkAAAABbWRh' +
  'dAAAAAAAAAB5AAAAZSgBr5y5YpKUQEaBfP/8thev9g77Lvn0+xb9npR7JMa8BqSQPm3F/OOKi/K/NN4pYCKxYiPtYp39qAUU' +
  'Cq9eothFAAAh4ALh8IoAAAMAJWAD0sAAAAMADNgAAAMAAAMAAAMAAGVA'

export function heic(): Buffer {
  return Buffer.from(SYNTHETIC_HEIC_BASE64, 'base64')
}
