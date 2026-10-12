import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { findActiveProject } from '@/lib/db/repo/projects'
import { getLatestFactSheet, saveMerchantEdit } from '@/lib/extract'
import { readJsonLimited } from '@/lib/http'

interface Ctx {
  params: Promise<{ id: string }>
}

const MAX_BODY_BYTES = 64 * 1024

async function projectId(params: Ctx['params']): Promise<string> {
  const { id } = await params
  if (!isValidId(id) || !findActiveProject(id)) throw Errors.notFound('项目')
  return id
}

/** Latest revision → `{ factSheet, confirmed }`; `factSheet` is null before any extraction. */
export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const factSheet = getLatestFactSheet(await projectId(params))
    return Response.json({ factSheet, confirmed: factSheet?.confirmedAt != null })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/** Saves the merchant's edits as a new, unconfirmed revision → `{ factSheet }`. */
export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const id = await projectId(params)
    const factSheet = saveMerchantEdit(id, await readJsonLimited(request, MAX_BODY_BYTES))
    return Response.json({ factSheet })
  } catch (err) {
    return toErrorResponse(err)
  }
}
