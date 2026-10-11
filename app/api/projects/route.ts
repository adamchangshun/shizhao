import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { toErrorResponse } from '@/lib/core/errors'
import { insertProject, listActiveProjects } from '@/lib/db/repo/projects'
import { toListItem } from '@/lib/project-view'

const CreateProjectBody = z.object({
  type: z.enum(['single', 'menu']),
  title: z.string().trim().min(1).max(30),
})

export async function GET(request: Request): Promise<Response> {
  try {
    requireAdmin(request)
    return Response.json(listActiveProjects().map(toListItem))
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireAdmin(request)
    const body = CreateProjectBody.parse(await request.json())
    const project = insertProject(body)
    return Response.json({ id: project.id, slug: project.slug }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
