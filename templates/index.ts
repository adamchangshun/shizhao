// Template registry. Each plugin lives in templates/<templateId>/ (index.tsx, meta.json, styles.ts).
import type { TemplateId } from '@/lib/core/schemas'
import type { TemplateMeta, TemplatePlugin } from '@/lib/render/types'
import CardStack from './card-stack'
import cardStackMeta from './card-stack/meta.json'
import { styles as cardStackStyles } from './card-stack/styles'
import Poster from './poster'
import posterMeta from './poster/meta.json'
import { styles as posterStyles } from './poster/styles'

export const TEMPLATES: Readonly<Partial<Record<TemplateId, TemplatePlugin>>> = {
  poster: { meta: posterMeta as TemplateMeta, Component: Poster, styles: posterStyles },
  'card-stack': { meta: cardStackMeta as TemplateMeta, Component: CardStack, styles: cardStackStyles },
}

export function getTemplate(id: TemplateId): TemplatePlugin {
  const plugin = TEMPLATES[id]
  if (!plugin) throw new Error(`unknown template: ${id}`)
  return plugin
}
