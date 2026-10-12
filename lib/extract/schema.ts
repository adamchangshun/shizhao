import { z } from 'zod'

// What the vision model is asked to return. Deliberately lenient: every field is optional and
// re-validated field by field afterwards, so one bad value drops that value, not the whole draft.
// Unknown keys (ids, sources, revision a model might add) are stripped and never trusted.
const optionalText = z.string().nullish()

const ModelPrice = z.union([
  z.string(),
  z.number(),
  z.object({ amount: z.number(), unit: z.string().nullish() }),
])

export const ModelItem = z.object({
  name: z.string(),
  price: ModelPrice.nullish(),
  spec: optionalText,
  description: optionalText,
  imageAssetIds: z.array(z.string()).nullish(),
})

export const ModelDraft = z.object({
  shop: z
    .object({
      name: optionalText,
      phone: optionalText,
      wechat: optionalText,
      address: optionalText,
      hours: optionalText,
      mapUrl: optionalText,
    })
    .nullish(),
  items: z.array(ModelItem).max(100),
  extraClaims: z.array(z.string()).nullish(),
})

export type ModelItem = z.infer<typeof ModelItem>
export type ModelDraft = z.infer<typeof ModelDraft>
export type ModelPrice = z.infer<typeof ModelPrice>
