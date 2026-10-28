// The merchant's optional style preferences for one generation job. Kept free of server-only
// imports so the merchant console can validate with the same schema before sending.
import { z } from 'zod'
import { ApiError } from '../core/errors'
import { Hex, TemplateId } from '../core/schemas'

/** 1–6 Han characters: the same rule the model's moodKeywords must follow. */
export const MOOD_KEYWORD = /^[\p{Script=Han}]{1,6}$/u

export const MoodKeywords = z
  .array(z.string().regex(MOOD_KEYWORD, '请提供简体中文风格词'))
  .min(1)
  .max(4)

export const StyleBrief = z
  .object({
    templateId: TemplateId.optional(),
    moodKeywords: MoodKeywords.optional(),
    primary: Hex.optional(),
  })
  .strict()
export type StyleBrief = z.infer<typeof StyleBrief>

const FIELD_MESSAGE: Record<string, string> = {
  templateId: '模板只能选择海报、卡片叠放或菜单板',
  moodKeywords: '风格词需要 1～4 个，每个 1～6 个汉字',
  primary: '主色需要是 #RRGGBB 格式的颜色',
}

/**
 * Validates a styleBrief from a request: undefined or an object with no fields means
 * "no preference" (undefined); anything invalid, null included, is a 400 `invalid_style_brief`
 * with a Chinese message naming the field.
 */
export function parseStyleBrief(input: unknown): StyleBrief | undefined {
  if (input === undefined) return undefined
  const result = StyleBrief.safeParse(input)
  if (!result.success) {
    const field = String(result.error.issues[0]?.path[0] ?? '')
    throw new ApiError(400, 'invalid_style_brief', FIELD_MESSAGE[field] ?? '风格偏好格式不正确')
  }
  const brief = result.data
  return Object.keys(brief).length > 0 ? brief : undefined
}
