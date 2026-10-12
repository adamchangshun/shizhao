import fs from 'node:fs'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import type { ReadableStream as NodeWebStream } from 'node:stream/web'
import busboy from 'busboy'
import type { ApiError } from '../core/errors'
import { displayName, UploadErrors } from './errors'
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_PROJECT,
  MAX_REQUEST_BYTES,
  MAX_TEXT_CHARS,
} from './limits'

export interface UploadedFile {
  /** Sanitized client filename, only for messages. */
  name: string
  /** Server-chosen temp path; the client filename never touches the filesystem. */
  tmpPath: string
  bytes: number
}

export interface ParsedUpload {
  files: UploadedFile[]
  text?: string
}

/**
 * Streams a multipart body to `tmpDir` without buffering it in memory. Enforces the 15MB per-file
 * and 100MB per-request caps while reading, and stops reading the request on the first violation.
 * The caller owns `tmpDir` and must remove it afterwards, also when this rejects.
 */
export async function parseUpload(request: Request, tmpDir: string): Promise<ParsedUpload> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!/^multipart\/form-data\b/i.test(contentType) || !request.body) throw UploadErrors.badForm()
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_REQUEST_BYTES) throw UploadErrors.requestTooLarge()

  let parser: busboy.Busboy
  try {
    parser = busboy({
      headers: { 'content-type': contentType },
      limits: {
        // busboy reports 'limit' on reaching fileSize/fieldSize, so +1 keeps the maximum itself legal.
        fileSize: MAX_IMAGE_BYTES + 1,
        files: MAX_IMAGES_PER_PROJECT,
        fields: 4,
        fieldSize: MAX_TEXT_CHARS * 4 + 1, // UTF-8 bytes; the character count is checked below
        fieldNameSize: 64,
        parts: MAX_IMAGES_PER_PROJECT + 4,
      },
    })
  } catch {
    throw UploadErrors.badForm()
  }

  const source = Readable.fromWeb(request.body as unknown as NodeWebStream<Uint8Array>)
  let received = 0
  const counter = new Transform({
    transform(chunk: Buffer, _enc, done) {
      received += chunk.length
      if (received > MAX_REQUEST_BYTES) done(UploadErrors.requestTooLarge())
      else done(null, chunk)
    },
  })

  const files: UploadedFile[] = []
  const writes: Array<Promise<void>> = []
  const writers: fs.WriteStream[] = []
  let text: string | undefined
  let failure: ApiError | Error | undefined

  return new Promise<ParsedUpload>((resolve, reject) => {
    const fail = (err: ApiError | Error) => {
      if (failure) return
      failure = err
      source.unpipe(counter)
      source.destroy()
      counter.unpipe(parser)
      counter.destroy()
      // A file stream cut off from its source never ends; destroying the writer settles its write.
      for (const w of writers) w.destroy()
      // Settle every open temp-file write before reporting, so the caller can remove tmpDir cleanly.
      void Promise.allSettled(writes).then(() => reject(err))
    }

    parser.on('file', (field, stream, info) => {
      if (failure) {
        stream.resume()
        return
      }
      if (field !== 'images') {
        stream.resume()
        fail(UploadErrors.badForm())
        return
      }
      const name = displayName(info.filename)
      const tmpPath = path.join(tmpDir, `${files.length}.upload`)
      const entry: UploadedFile = { name, tmpPath, bytes: 0 }
      files.push(entry)
      const writer = fs.createWriteStream(tmpPath, { flags: 'wx', mode: 0o600 })
      writers.push(writer)
      // 'close' fires after finish, after an error, and after destroy(), so this always settles.
      writes.push(new Promise<void>((done) => writer.once('close', done)))
      writer.on('error', (err) => fail(err))
      stream.on('error', (err) => fail(err))
      stream.on('data', (chunk: Buffer) => {
        entry.bytes += chunk.length
      })
      stream.on('limit', () => fail(UploadErrors.imageTooLarge(name)))
      stream.pipe(writer)
    })

    parser.on('field', (field, value, info) => {
      if (field !== 'text') return
      if (info.valueTruncated || [...value].length > MAX_TEXT_CHARS) {
        fail(UploadErrors.textTooLong())
        return
      }
      text = value
    })

    parser.on('filesLimit', () => fail(UploadErrors.tooManyInRequest()))
    parser.on('fieldsLimit', () => fail(UploadErrors.badForm()))
    parser.on('partsLimit', () => fail(UploadErrors.badForm()))
    parser.on('error', () => fail(UploadErrors.badForm()))
    counter.on('error', (err) => fail(err))
    source.on('error', () => fail(UploadErrors.badForm()))

    parser.on('close', () => {
      void Promise.allSettled(writes).then(() => {
        if (failure) return
        resolve({ files, ...(text !== undefined ? { text } : {}) })
      })
    })

    source.pipe(counter).pipe(parser)
  })
}
