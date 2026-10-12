// Template registry. Each plugin lives in templates/<templateId>/ (index.tsx, meta.json, styles.ts).
import type { TemplateId } from '@/lib/core/schemas'
import type { TemplateMeta, TemplatePlugin } from '@/lib/render/types'
import CardStack from './card-stack'
import cardStackMeta from './card-stack/meta.json'
import { styles as cardStackStyles } from './card-stack/styles'
import MenuBoard from './menu-board'
import menuBoardMeta from './menu-board/meta.json'
import { styles as menuBoardStyles } from './menu-board/styles'
import Poster from './poster'
import posterMeta from './poster/meta.json'
import { styles as posterStyles } from './poster/styles'

export const TEMPLATES: Readonly<Record<TemplateId, TemplatePlugin>> = {
  poster: { meta: posterMeta as TemplateMeta, Component: Poster, styles: posterStyles },
  'card-stack': { meta: cardStackMeta as TemplateMeta, Component: CardStack, styles: cardStackStyles },
  'menu-board': { meta: menuBoardMeta as TemplateMeta, Component: MenuBoard, styles: menuBoardStyles },
}

export function getTemplate(id: TemplateId): TemplatePlugin {
  return TEMPLATES[id]
}
