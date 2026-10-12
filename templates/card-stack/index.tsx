// card-stack: compact header, then one card per product stacked down the page.
import type { ReactElement } from 'react'
import type { FactItem } from '@/lib/core/schemas'
import { ExtraClaims, ItemImage, ItemPrice, ItemTags, ItemText, ShopText } from '@/lib/render/shared/facts'
import type { TemplateProps } from '@/lib/render/types'

function Card({ item, index, props, heroId }: { item: FactItem; index: number; props: TemplateProps; heroId: string | undefined }): ReactElement {
  const assetId = item.imageAssetIds[0]
  const blurb = props.copy.blurb(item.id)
  return (
    <li className={`c-card rise${assetId ? '' : ' c-card-plain'}`}>
      {assetId && (
        <ItemImage image={props.image(assetId, 'display', item.id === heroId)} alt={item.name} width={686} height={458} className="c-img" />
      )}
      <div className="c-body">
        <span className="c-index" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="c-head">
          <ItemText item={item} field="name" as="h2" className="fh c-name" />
          <ItemPrice item={item} className="c-price" />
        </div>
        <ItemText item={item} field="spec" as="p" className="c-spec" />
        <ItemText item={item} field="description" as="p" className="c-desc" />
        <ItemTags item={item} />
        {blurb && <p className="c-blurb">{blurb}</p>}
      </div>
    </li>
  )
}

export default function CardStack(props: TemplateProps): ReactElement {
  const { facts, copy } = props
  const heroId = facts.items.find(item => item.imageAssetIds.length > 0)?.id
  return (
    <main className="card-stack">
      <header className="c-header">
        <ShopText shop={facts.shop} field="name" as="p" className="fh c-shop" />
        <h1 className="fh c-headline">{copy.headline}</h1>
        {copy.subhead && <p className="c-subhead">{copy.subhead}</p>}
        {facts.extraClaims.length > 0 && <ExtraClaims facts={facts} />}
      </header>
      <div className="deco-rule" aria-hidden="true" />
      <ol className="c-list" aria-label="商品">
        {facts.items.map((item, i) => (
          <Card key={item.id} item={item} index={i} props={props} heroId={heroId} />
        ))}
      </ol>
      {copy.closing && <p className="closing">{copy.closing}</p>}
    </main>
  )
}
