import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { claimProjectDeletion, findActiveProject } from '@/lib/db/repo/projects'
import { removeProjectFiles } from '@/lib/files'
import { toDetail } from '@/lib/project-view'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    const project = isValidId(id) ? findActiveProject(id) : undefined
    if (!project) throw Errors.notFound('项目')
    return Response.json(toDetail(project))
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * The deletion is claimed atomically first (refused while a job runs; no job can start after),
 * then files are removed. If cleanup fails, repeating the DELETE retries it.
 * Only ids that exist in the database reach the filesystem.
 */
export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    if (!isValidId(id)) throw Errors.notFound('项目')
    const claim = claimProjectDeletion(id)
    if (claim === 'missing') throw Errors.notFound('项目')
    if (claim === 'busy') throw Errors.conflict('宣传页正在生成中，请等生成结束后再删除')
    await removeProjectFiles(id)
    return new Response(null, { status: 204 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
