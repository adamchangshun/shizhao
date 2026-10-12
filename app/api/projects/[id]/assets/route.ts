import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { listProjectAssets, toUploadedAsset, uploadAssets } from '@/lib/assets'
import { findActiveProject } from '@/lib/db/repo/projects'

interface Ctx {
  params: Promise<{ id: string }>
}

async function activeProjectId(params: Ctx['params']): Promise<string> {
  const { id } = await params
  if (!isValidId(id) || !findActiveProject(id)) throw Errors.notFound('项目')
  return id
}

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const projectId = await activeProjectId(params)
    const assets = listProjectAssets(projectId).map((row) => ({
      ...toUploadedAsset(row),
      ...(row.kind === 'text' ? { text: row.text } : {}),
      createdAt: row.createdAt,
    }))
    return Response.json({ assets })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/** multipart/form-data: `images` (repeatable file field) and optional `text`. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const projectId = await activeProjectId(params)
    const assets = await uploadAssets(projectId, request)
    return Response.json({ assets }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
