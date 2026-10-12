// Fact-bearing elements. Every merchant fact on a page is printed by one of these, so the
// `data-fact` path and the exact text (including price format) are defined in one place.
// Values come only from FactSheet types; React escapes all text and attributes.
import type { ElementType, ReactElement } from 'react'
import type { FactItem, FactSheet, Shop } from '@/lib/core/schemas'
import { formatPriceAmount } from '../format'
import type { TemplateImage } from '../types'

interface FactTextProps {
  as?: ElementType
  className?: string
}

type ShopTextField = 'name' | 'phone' | 'wechat' | 'address' | 'hours'

export function ShopText({ shop, field, as: Tag = 'span', className }: FactTextProps & { shop: Shop; field: ShopTextField }): ReactElement | null {
  const value = shop[field]
  if (!value) return null
  return (
    <Tag className={className} data-fact={`shop.${field}`}>
      {value}
    </Tag>
  )
}

type ItemTextField = 'name' | 'spec' | 'description'

export function ItemText({ item, field, as: Tag = 'span', className }: FactTextProps & { item: FactItem; field: ItemTextField }): ReactElement | null {
  const value = item[field]
  if (!value) return null
  return (
    <Tag className={className} data-fact={`items.${item.id}.${field}`}>
      {value}
    </Tag>
  )
}

export function ItemPrice({ item, className }: { item: FactItem; className?: string }): ReactElement | null {
  if (!item.price) return null
  return (
    <span className={className ? `price ${className}` : 'price'}>
      <span data-fact={`items.${item.id}.price`}>{formatPriceAmount(item.price)}</span>
      <span className="price-unit" data-fact={`items.${item.id}.price.unit`}>
        {item.price.unit}
      </span>
    </span>
  )
}

export function ItemTags({ item }: { item: FactItem }): ReactElement | null {
  if (item.tags.length === 0) return null
  return (
    <ul className="tags">
      {item.tags.map((tag, i) => (
        <li key={i} className="tag" data-fact={`items.${item.id}.tags.${i}`}>
          {tag}
        </li>
      ))}
    </ul>
  )
}

export function ExtraClaims({ facts }: { facts: FactSheet }): ReactElement | null {
  if (facts.extraClaims.length === 0) return null
  return (
    <ul className="claims">
      {facts.extraClaims.map((claim, i) => (
        <li key={i} className="claim" data-fact={`extraClaims.${i}`}>
          {claim}
        </li>
      ))}
    </ul>
  )
}

interface ItemImageProps {
  image: TemplateImage
  alt: string
  width: number
  height: number
  className?: string
}

/** Width/height give the box its aspect ratio before load; CSS crops with object-fit. */
export function ItemImage({ image, alt, width, height, className }: ItemImageProps): ReactElement {
  return image.hero ? (
    <img src={image.src} alt={alt} width={width} height={height} className={className} fetchPriority="high" decoding="async" />
  ) : (
    <img src={image.src} alt={alt} width={width} height={height} className={className} loading="lazy" decoding="async" />
  )
}
