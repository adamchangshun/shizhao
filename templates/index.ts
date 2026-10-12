// Template registry. Each plugin lives in templates/<templateId>/ (index.tsx, meta.json, styles.ts).
import type { TemplateId } from '@/lib/core/schemas'
import type { TemplateMeta, TemplatePlugin } from '@/lib/render/types'
import Poster from './poster'
import posterMeta from './poster/meta.json'
import { styles as posterStyles } from './poster/styles'

export const TEMPLATES: Readonly<Partial<Record<TemplateId, TemplatePlugin>>> = {
  poster: { meta: posterMeta as TemplateMeta, Component: Poster, styles: posterStyles },
}

export function getTemplate(id: TemplateId): TemplatePlugin {
  const plugin = TEMPLATES[id]
  if (!plugin) throw new Error(`unknown template: ${id}`)
  return plugin
}
