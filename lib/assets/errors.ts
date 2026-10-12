import { ApiError } from '../core/errors'
import { MAX_IMAGES_PER_PROJECT, MAX_TEXT_CHARS } from './limits'

/** Strips path parts and control characters so a client filename is safe to echo back. */
export function displayName(filename: string | undefined): string {
  const base = (filename ?? '').split(/[\\/]/).pop() ?? ''
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (clean === '') return '未命名图片'
  return [...clean].length > 80 ? `${[...clean].slice(0, 80).join('')}…` : clean
}

export const UploadErrors = {
  unsupportedFormat: (name: string) =>
    new ApiError(
      400,
      'unsupported_format',
      `图片「${name}」：不支持的图片格式，仅支持 JPEG、PNG、WebP、HEIC`,
    ),
  imageTooLarge: (name: string) =>
    new ApiError(413, 'image_too_large', `图片「${name}」超过 15MB，请压缩后再上传`),
  requestTooLarge: () =>
    new ApiError(413, 'payload_too_large', '本次上传的内容超过 100MB，请分批上传'),
  tooManyPixels: (name: string) =>
    new ApiError(
      400,
      'image_too_many_pixels',
      `图片「${name}」像素过多（超过 4000 万像素），请缩小后再上传`,
    ),
  corrupt: (name: string) => new ApiError(400, 'image_corrupt', `图片「${name}」已损坏或无法读取`),
  timeout: (name: string) =>
    new ApiError(400, 'image_timeout', `图片「${name}」处理超时（超过 20 秒），请换一张图片`),
  tooManyImages: (existing: number) =>
    new ApiError(
      400,
      'too_many_images',
      `每个项目最多 ${MAX_IMAGES_PER_PROJECT} 张图片，当前已有 ${existing} 张，本次上传会超出上限`,
    ),
  tooManyInRequest: () =>
    new ApiError(400, 'too_many_images', `每次最多上传 ${MAX_IMAGES_PER_PROJECT} 张图片`),
  textTooLong: () => new ApiError(400, 'text_too_long', `文字说明最多 ${MAX_TEXT_CHARS} 字`),
  empty: () => new ApiError(400, 'empty_upload', '请至少上传一张图片或填写文字说明'),
  busy: () => new ApiError(503, 'busy', '正在处理其他图片，请稍后再试'),
  badForm: () => new ApiError(400, 'invalid_form', '上传表单格式不正确'),
}
