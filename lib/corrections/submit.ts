// POST /api/corrections: anonymous customer reports. Nothing about the customer is stored; the
// client address is hashed in memory for rate limiting only (see lib/stats/limiter.ts).
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { ApiError, Errors } from '../core/errors'
import { ID_PATTERN, SLUG_PATTERN, newId } from '../core/ids'
import { getDb } from '../db/client'
import { findFactSheet } from '../db/repo/fact-sheets'
import { corrections, projects, versions } from '../db/schema'
import { isJsonRequest, isSameOriginRequest, readJsonLimited } from '../http'
import { FixedWindowLimiter } from '../rate-limit'
import { clientHash } from '../stats/limiter'
import { containsPersonalInfo, looksLikeSpam, sanitizeLines, sanitizeText } from './filter'
import { findOption } from './options'

const MAX_BODY_BYTES = 2048
export const SOURCE_LIMIT = { count: 3, windowMs: 10 * 60_000 }
export const PROJECT_DAILY_LIMIT = 50

const SubmitBody = z
  .object({
    slug: z.string().regex(SLUG_PATTERN),
    versionId: z.string().regex(ID_PATTERN),
    field: z.string().min(1).max(64),
    suggestedValue: z.string().max(400).optional(),
    note: z.string().max(800).optional(),
  })
  .strict()

const perSource = new FixedWindowLimiter(SOURCE_LIMIT.count, SOURCE_LIMIT.windowMs)
const perProject = new FixedWindowLimiter(PROJECT_DAILY_LIMIT, 24 * 3600_000)

const personalInfo = () =>
  new ApiError(
    400,
    'personal_info',
    '请勿填写个人信息：提到 QQ、支付宝或微信时，不要同时写出号码、账号或 5 位以上的数字',
  )

export async function submitCorrection(request: Request, now: number = Date.now()): Promise<void> {
  // Only the published page's own form may post here. Otherwise any site could make its visitors
  // send no-cors text/plain reports and use up a page's daily budget from their addresses.
  if (!isSameOriginRequest(request)) throw Errors.forbidden()
  if (!isJsonRequest(request)) {
    throw new ApiError(415, 'unsupported_media_type', '请求格式不正确')
  }
  const body = SubmitBody.parse(await readJsonLimited(request, MAX_BODY_BYTES))

  const project = getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.slug, body.slug), isNull(projects.deletedAt)))
    .get()
  if (!project || project.publishedVersionId === null) throw Errors.notFound('页面')
  if (project.unpublishedAt !== null) {
    throw new ApiError(410, 'unpublished', '该页面已下线，无法提交')
  }
  // A customer may still have an earlier version of the page open; it must be this project's.
  const version = getDb()
    .select({ id: versions.id, factRevision: versions.factRevision })
    .from(versions)
    .where(and(eq(versions.id, body.versionId), eq(versions.projectId, project.id)))
    .get()
  const sheet = version ? findFactSheet(project.id, version.factRevision)?.json : undefined
  if (!version || !sheet) throw Errors.notFound('页面')

  const option = findOption(sheet, body.field)
  if (!option) throw new ApiError(400, 'invalid_field', '请选择有误的信息')

  const value = sanitizeText(body.suggestedValue ?? '')
  const note = sanitizeText(body.note ?? '')
  if (value.length > 100 || note.length > 200) throw Errors.invalidInput()
  if (option.noValue && value !== '') {
    // Contact details are only reported as "may be wrong"; the merchant checks them.
    throw new ApiError(400, 'value_not_allowed', '电话、微信只需告诉老板有误，不用填写')
  }
  if (!option.noValue && value === '') {
    throw new ApiError(400, 'value_required', '请填写正确的内容')
  }
  // Checked with line breaks kept: they end a sentence for the QQ and Alipay rules.
  if (
    containsPersonalInfo(sanitizeLines(body.suggestedValue ?? '')) ||
    containsPersonalInfo(sanitizeLines(body.note ?? ''))
  ) {
    throw personalInfo()
  }

  // Only valid reports count, keyed by the real project: made-up slugs or rejected requests
  // cannot fill the limiter or use up a page's budget. (Without a trusted proxy every visitor
  // shares one source bucket per page; see docs/PRIVACY.md.)
  if (perSource.take(`${clientHash(request)}:${project.id}`, now) === null) {
    throw new ApiError(429, 'too_many_requests', '提交太频繁了，请稍后再试')
  }
  if (perProject.take(project.id, now) === null) {
    throw new ApiError(429, 'too_many_requests', '今天收到的纠错太多了，请明天再试')
  }
  getDb()
    .insert(corrections)
    .values({
      id: newId(),
      projectId: project.id,
      versionId: version.id,
      field: option.path,
      suggestedValue: value,
      note: note || null,
      status: looksLikeSpam(`${value} ${note}`) ? 'spam' : 'pending',
      resultRevision: null,
      createdAt: new Date(now).toISOString(),
      resolvedAt: null,
      processingAt: null,
    })
    .run()
}
