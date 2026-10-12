// menu-board: a framed board; each product is a row with name and price joined by a dotted leader.
import type { ReactElement } from 'react'
import type { FactItem } from '@/lib/core/schemas'
import { ExtraClaims, ItemImage, ItemPrice, ItemTags, ItemText, ShopText } from '@/lib/render/shared/facts'
import type { TemplateProps } from '@/lib/render/types'

function Row({ item, blurb }: { item: FactItem; blurb: string | undefined }): ReactElement {
  const hasDetail = item.spec || item.description || item.tags.length > 0 || blurb
  return (
    <li className="m-row">
      <div className="m-line">
        <ItemText item={item} field="name" as="h3" className="fh m-name" />
        <span className="m-leader" aria-hidden="true" />
        <ItemPrice item={item} className="m-price" />
      </div>
      {hasDetail && (
        <div className="m-detail">
          <ItemText item={item} field="spec" as="p" className="m-spec" />
          <ItemText item={item} field="description" as="p" />
          <ItemTags item={item} />
          {blurb && <p className="m-blurb">{blurb}</p>}
        </div>
      )}
    </li>
  )
}

export default function MenuBoard(props: TemplateProps): ReactElement {
  const { facts, copy } = props
  const withImages = facts.items.filter(item => item.imageAssetIds.length > 0)
  const [heroItem, ...others] = withImages
  const heroAsset = heroItem?.imageAssetIds[0]
  return (
    <main className="menu-board">
      {heroItem && heroAsset && (
        <figure className="m-hero">
          <ItemImage image={props.image(heroAsset, 'display', true)} alt={heroItem.name} width={750} height={500} className="m-hero-img" />
        </figure>
      )}
      <section className="m-board" aria-label="菜单">
        <header className="m-header">
          <ShopText shop={facts.shop} field="name" as="h1" className="fh m-shop" />
          <p className="fh m-headline">{copy.headline}</p>
          {copy.subhead && <p className="m-subhead">{copy.subhead}</p>}
        </header>
        <div className="deco-rule" aria-hidden="true" />
        <ul className="m-list">
          {facts.items.map(item => (
            <Row key={item.id} item={item} blurb={copy.blurb(item.id)} />
          ))}
        </ul>
        {facts.extraClaims.length > 0 && (
          <div className="m-claims">
            <ExtraClaims facts={facts} />
          </div>
        )}
      </section>
      {others.length > 0 && (
        <ul className="m-strip" aria-label="商品照片">
          {others.slice(0, 6).map(item => (
            <li key={item.id}>
              <ItemImage image={props.image(item.imageAssetIds[0] as string, 'thumb')} alt={item.name} width={240} height={240} className="m-thumb" />
            </li>
          ))}
        </ul>
      )}
      {copy.closing && <p className="closing">{copy.closing}</p>}
    </main>
  )
}
