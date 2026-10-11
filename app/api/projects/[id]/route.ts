import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
import { hasActiveJob } from '@/lib/db/repo/jobs'
import { findActiveProject, softDeleteProject } from '@/lib/db/repo/projects'
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
 * Files go first, the soft delete last: if removing files fails the project stays active and
 * the DELETE can simply be retried. Only ids that exist in the database reach the filesystem.
 */
export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    if (!isValidId(id) || !findActiveProject(id)) throw Errors.notFound('项目')
    // A running job would write new files after we clean up.
    if (hasActiveJob(id)) throw Errors.conflict('宣传页正在生成中，请等生成结束后再删除')
    await removeProjectFiles(id)
    if (!softDeleteProject(id)) throw Errors.notFound('项目')
    return new Response(null, { status: 204 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
