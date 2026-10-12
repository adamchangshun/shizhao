// Contract between the renderer and template plugins.
import type { ComponentType } from 'react'
import type { CopyDraft, DesignSpec, FactSheet, TemplateId } from '@/lib/core/schemas'

export type ImageSize = 'display' | 'thumb'

/**
 * Model-written copy a template may show. It carries mood text only; product names,
 * prices, specs and contact details reach templates exclusively through `facts`.
 */
export interface TemplateCopy {
  readonly headline: CopyDraft['headline']
  readonly subhead: CopyDraft['subhead']
  readonly closing: CopyDraft['closing']
  /** Blurb for an item id; own keys only, so ids like `constructor` cannot hit prototype members. */
  readonly blurb: (itemId: string) => string | undefined
}

export interface TemplateImage {
  readonly src: string
  /** First-screen image: fetched eagerly with high priority. Every other image is lazy. */
  readonly hero: boolean
}

export interface TemplateProps {
  readonly facts: FactSheet
  readonly copy: TemplateCopy
  readonly design: DesignSpec
  /** Resolves an asset to an image source and records it for copying into the version. */
  readonly image: (assetId: string, size: ImageSize, hero?: boolean) => TemplateImage
}

export interface TemplateMeta {
  id: TemplateId
  nameZh: string
  descriptionZh: string
  supports: Array<'single' | 'menu'>
}

export interface TemplatePlugin {
  meta: TemplateMeta
  Component: ComponentType<TemplateProps>
  styles: string
}
