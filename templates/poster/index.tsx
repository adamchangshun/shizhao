// poster: one big first-screen image with a large headline; built for a single product.
import type { ReactElement } from 'react'
import type { FactItem } from '@/lib/core/schemas'
import { ExtraClaims, ItemImage, ItemPrice, ItemTags, ItemText, ShopText } from '@/lib/render/shared/facts'
import type { TemplateProps } from '@/lib/render/types'

function Blurb({ text }: { text: string | undefined }): ReactElement | null {
  return text ? <p className="p-blurb">{text}</p> : null
}

function MoreItem({ item, props }: { item: FactItem; props: TemplateProps }): ReactElement {
  const assetId = item.imageAssetIds[0]
  return (
    <li className="p-more-item">
      {assetId && <ItemImage image={props.image(assetId, 'thumb')} alt={item.name} width={240} height={240} className="p-more-img" />}
      <div className="p-more-body">
        <div className="p-more-head">
          <ItemText item={item} field="name" as="h3" className="fh p-more-name" />
          <ItemPrice item={item} className="p-more-price" />
        </div>
        <ItemText item={item} field="spec" as="p" className="p-spec" />
        <ItemText item={item} field="description" as="p" className="p-desc" />
        <ItemTags item={item} />
        <Blurb text={props.copy.blurb(item.id)} />
      </div>
    </li>
  )
}

export default function Poster(props: TemplateProps): ReactElement {
  const { facts, copy, design } = props
  const [feature, ...rest] = facts.items as [FactItem, ...FactItem[]]
  const heroAsset = feature.imageAssetIds[0]
  const hero = heroAsset ? props.image(heroAsset, 'display', true) : null
  return (
    <main className={`poster hero-${design.heroLayout}${hero ? '' : ' no-img'}`}>
      <header className="p-hero">
        {hero && <ItemImage image={hero} alt={feature.name} width={750} height={938} className="p-hero-img" />}
        <div className="p-hero-text">
          <ShopText shop={facts.shop} field="name" as="p" className="p-shop" />
          <h1 className="fh p-headline rise">{copy.headline}</h1>
          {copy.subhead && <p className="p-subhead rise">{copy.subhead}</p>}
        </div>
      </header>
      <div className="deco-rule" aria-hidden="true" />
      <section className="p-feature rise" aria-label="主推商品">
        <ItemText item={feature} field="name" as="h2" className="fh p-feature-name" />
        <ItemPrice item={feature} className="p-feature-price" />
        <ItemText item={feature} field="spec" as="p" className="p-spec" />
        <ItemText item={feature} field="description" as="p" className="p-desc" />
        <ItemTags item={feature} />
        <Blurb text={copy.blurb(feature.id)} />
      </section>
      {facts.extraClaims.length > 0 && (
        <section className="p-claims" aria-label="店家承诺">
          <ExtraClaims facts={facts} />
        </section>
      )}
      {rest.length > 0 && (
        <section className="p-more" aria-label="更多商品">
          <h2 className="fh p-more-title">店里还有</h2>
          <ul className="p-more-list">
            {rest.map(item => (
              <MoreItem key={item.id} item={item} props={props} />
            ))}
          </ul>
        </section>
      )}
      {copy.closing && <p className="closing">{copy.closing}</p>}
    </main>
  )
}
