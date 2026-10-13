import QRCode from 'qrcode'
import { z } from 'zod'
import { Errors } from '../core/errors'
import { findActiveProject } from '../db/repo/projects'
import { publicationLinks } from './index'

const QrQuery = z.object({
  format: z.enum(['png', 'svg']).default('png'),
  size: z
    .string()
    .regex(/^\d{3,4}$/)
    .default('512')
    .transform(Number)
    .pipe(z.number().int().min(256).max(2048)),
})

/** Codes identify a project, not a version; they can also be printed before the first publish. */
export async function generateProjectQr(
  projectId: string,
  query: URLSearchParams,
): Promise<{ body: Uint8Array<ArrayBuffer> | string; contentType: string }> {
  const project = findActiveProject(projectId)
  if (!project) throw Errors.notFound('项目')
  if (query.getAll('format').length > 1 || query.getAll('size').length > 1)
    throw Errors.invalidInput()
  const { format, size } = QrQuery.parse({
    format: query.get('format') ?? undefined,
    size: query.get('size') ?? undefined,
  })
  const payload = `${publicationLinks(project).url}?src=qr`
  const options = { errorCorrectionLevel: 'M' as const, width: size, margin: 4 }
  if (format === 'svg') {
    return {
      body: await QRCode.toString(payload, { ...options, type: 'svg' }),
      contentType: 'image/svg+xml',
    }
  }
  const png = await QRCode.toBuffer(payload, { ...options, type: 'png' })
  return { body: new Uint8Array(png), contentType: 'image/png' }
}
