import { requireAdmin } from '@/lib/auth'
import { Errors, toErrorResponse } from '@/lib/core/errors'
import { isValidId } from '@/lib/core/ids'
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

export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  try {
    requireAdmin(request)
    const { id } = await params
    // Only ids that exist in the database reach the filesystem.
    if (!isValidId(id) || !softDeleteProject(id)) throw Errors.notFound('项目')
    await removeProjectFiles(id)
    return new Response(null, { status: 204 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
